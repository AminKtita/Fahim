"""
meal_recommender.py — pure-Python (no LLM) full-day meal recommendation.

Given today's remaining macros (nutrition target minus what's already logged
via meal_logs), this picks a recipe for each of N meal slots and scales its
portion to best fit that slot's share of the remaining budget.

Algorithm
---------
1. remaining = active nutrition_targets - sum(meal_logs for today)
2. For each meal slot (processed in order):
     a. target_for_slot = remaining / slots_left   (re-balances every slot,
        so an imperfect earlier pick doesn't compound across the day)
     b. every candidate recipe gets a portion SCALE solved in closed form
        (weighted least squares — see _best_scale) that best matches
        target_for_slot, clamped to a sane portion range
     c. recipes are scored by weighted % deviation from target_for_slot at
        that scale; lower is better. A small bonus is applied if the
        recipe's category matches the slot's preferred category
     d. the best-scoring recipe (excluding ones already used today, unless
        none remain) is chosen; its *actual* scaled macros are subtracted
        from `remaining` before moving to the next slot
3. Returns the full slot-by-slot plan plus what's left over (or exceeded)
   after all slots are filled.

This is a greedy heuristic, not a global optimum solver (an exact solution
would be a small mixed-integer program) — but it's deterministic, fast,
and self-corrects each slot against the real running remainder, which is
good enough for "what should I eat today" and easy to reason about.
"""

import os
import sqlite3
from datetime import date as date_cls

import memory_manager as mm
import memory_manager_meals as meals_mm
import work_schedule as ws

# Macro deviation weights for scoring fit — mirrors the priority already
# used by _nutrition_status() in memory_manager.py (protein/calories are
# the tightest-tracked macros, carbs/fat are more flexible).
MACRO_WEIGHTS = {
    "calories": 0.30,
    "protein_g": 0.35,
    "carbs_g": 0.175,
    "fat_g": 0.175,
}

MACRO_KEYS = ("calories", "protein_g", "carbs_g", "fat_g")

# Portion scaling is clamped to this range so suggestions stay realistic
# (never "eat 4x this recipe" or "eat a sliver of it").
MIN_SCALE = 0.5
MAX_SCALE = 2.0

# Slot label -> preferred recipe category (soft bonus, not a hard filter).
# Falls back to 'Lunch/Dinner' preference for anything not explicitly
# breakfast-flavored, since that's the largest, most flexible category.
DEFAULT_SLOT_LABELS = ["Breakfast", "Lunch", "Dinner"]


def _category_preference(slot_label: str) -> str:
    label = (slot_label or "").lower()
    if "breakfast" in label:
        return "Breakfast"
    return "Lunch/Dinner"


def get_remaining_macros(iso_date: str) -> dict | None:
    """
    Returns {'calories':..,'protein_g':..,'carbs_g':..,'fat_g':..} = the
    active nutrition target minus everything already logged (via
    meal_logs) for that date. Returns None if there's no active target.
    """
    targets = mm.get_active_nutrition_targets()
    if not targets:
        return None

    logged = meals_mm.get_daily_meal_totals(iso_date)

    return {
        "calories": (targets.get("calories") or 0) - logged["calories"],
        "protein_g": (targets.get("protein_g") or 0) - logged["protein_g"],
        "carbs_g": (targets.get("carbs_g") or 0) - logged["carbs_g"],
        "fat_g": (targets.get("fat_g") or 0) - logged["fat_g"],
    }


def _recipe_macros(recipe: dict) -> dict:
    return {
        "calories": recipe.get("total_calories") or 0,
        "protein_g": recipe.get("total_protein") or 0,
        "carbs_g": recipe.get("total_carbs") or 0,
        "fat_g": recipe.get("total_fat") or 0,
    }


def _best_scale(recipe_macros: dict, target: dict) -> float:
    """
    Closed-form weighted least squares: choose scale s minimizing
        sum_k weight_k * (s * recipe_k / target_k - 1)^2
    over macros where target_k > 0. Skips macros with a non-positive
    target (can't compute a meaningful ratio against zero/negative).
    Falls back to 1.0 (no scaling) if no macro has a usable target.
    """
    num = 0.0
    den = 0.0
    for k in MACRO_KEYS:
        t = target.get(k, 0)
        r = recipe_macros.get(k, 0)
        if t is None or t <= 0 or r <= 0:
            continue
        w = MACRO_WEIGHTS[k]
        a = r / t
        num += w * a
        den += w * a * a

    if den <= 0:
        return 1.0

    scale = num / den
    return max(MIN_SCALE, min(MAX_SCALE, scale))


def _score(scaled_macros: dict, target: dict) -> float:
    """
    Weighted percentage-deviation score at a given scale — lower is
    better. Macros with a non-positive target are skipped (can't express
    a meaningful % deviation against zero).
    """
    total = 0.0
    total_weight = 0.0
    for k in MACRO_KEYS:
        t = target.get(k, 0)
        if t is None or t <= 0:
            continue
        w = MACRO_WEIGHTS[k]
        dev = abs(scaled_macros.get(k, 0) - t) / t
        total += w * dev
        total_weight += w
    if total_weight == 0:
        return 0.0
    return total / total_weight


def _rank_candidates(recipes: list, target: dict, category_pref: str, exclude_ids: set) -> list:
    """
    Returns candidates sorted best-fit-first, each as:
      {recipe, scale, macros, score}

    Candidate pool falls through three tiers, using the first non-empty one:
      1. unused recipes matching category_pref
      2. any unused recipe (category mismatch allowed)
      3. any recipe at all (repeats allowed, only once nothing is unused)
    This keeps meal-type labels meaningful (a "Breakfast" slot won't get a
    dinner-style recipe just because its macros fit fractionally better)
    while still always returning a usable suggestion.
    """
    unused = [r for r in recipes if r["id"] not in exclude_ids]
    category_matched = [r for r in unused if r.get("category") == category_pref]

    pool = category_matched or unused or recipes
    if not pool:
        return []

    ranked = []
    for r in pool:
        base_macros = _recipe_macros(r)
        if sum(base_macros.values()) <= 0:
            continue  # recipe with no ingredients/macros yet — not suggestible
        scale = _best_scale(base_macros, target)
        scaled = {k: round(v * scale, 1) for k, v in base_macros.items()}
        score = _score(scaled, target)
        ranked.append({"recipe": r, "scale": round(scale, 2), "macros": scaled, "score": round(score, 4)})

    ranked.sort(key=lambda x: x["score"])
    return ranked


def recommend_day_plan(iso_date: str, num_meals: int = 3, slot_labels: list | None = None) -> dict:
    """
    Returns:
    {
      'date': iso_date,
      'targets': {...} | None,
      'already_logged': {...},
      'remaining_before': {...} | None,
      'slots': [
        {
          'label': str,
          'category_preference': str,
          'target_macros': {...},
          'recipe': {id, name, category, image_url} | None,
          'scale': float,
          'macros': {...},
          'score': float,
        }, ...
      ],
      'remaining_after': {...} | None,   # leftover budget (negative = overshoot) after all slots
      'error': str | None,               # set if there's no active target or no recipes at all
    }
    """
    targets = mm.get_active_nutrition_targets()
    logged = meals_mm.get_daily_meal_totals(iso_date)

    result = {
        "date": iso_date,
        "targets": targets,
        "already_logged": logged,
        "remaining_before": None,
        "slots": [],
        "remaining_after": None,
        "error": None,
    }

    if not targets:
        result["error"] = "No active nutrition target — set one before requesting meal suggestions."
        return result

    remaining = get_remaining_macros(iso_date)
    result["remaining_before"] = dict(remaining)

    recipes = meals_mm.get_all_recipes()
    if not recipes:
        result["error"] = "No recipes in the library yet — add some in Nutrition → Recipes & Ingredients."
        return result

    labels = slot_labels or DEFAULT_SLOT_LABELS[:num_meals] or [f"Meal {i+1}" for i in range(num_meals)]
    while len(labels) < num_meals:
        labels.append(f"Meal {len(labels) + 1}")

    used_ids = set()
    working_remaining = dict(remaining)

    for i in range(num_meals):
        slots_left = num_meals - i
        target_for_slot = {k: working_remaining[k] / slots_left for k in MACRO_KEYS}
        category_pref = _category_preference(labels[i])

        ranked = _rank_candidates(recipes, target_for_slot, category_pref, used_ids)
        if not ranked:
            result["slots"].append({
                "label": labels[i], "category_preference": category_pref,
                "target_macros": {k: round(v, 1) for k, v in target_for_slot.items()},
                "recipe": None, "scale": None, "macros": None, "score": None,
            })
            continue

        best = ranked[0]
        r = best["recipe"]
        used_ids.add(r["id"])

        for k in MACRO_KEYS:
            working_remaining[k] -= best["macros"][k]

        result["slots"].append({
            "label": labels[i],
            "category_preference": category_pref,
            "target_macros": {k: round(v, 1) for k, v in target_for_slot.items()},
            "recipe": {
                "id": r["id"], "name": r["name"],
                "category": r.get("category"), "image_url": r.get("image_url"),
            },
            "scale": best["scale"],
            "macros": best["macros"],
            "score": best["score"],
        })

    result["remaining_after"] = {k: round(v, 1) for k, v in working_remaining.items()}
    return result


def recommend_for_day_plan(iso_date: str) -> dict:
    """
    Same engine as recommend_day_plan(), but pulls the actual meal slot
    labels (and scheduled times) from the Day Plan's shift-based
    meal_time_rules for this date, instead of generic Breakfast/Lunch/
    Dinner labels. This is what powers "Suggest meals" inside the Day
    Plan popup, so suggestions match the real 24-hour timeline — e.g. a
    night-shift day gets "Dinner (pre-shift)" / "Night meal" /
    "Breakfast (post-shift)" instead of generic labels.

    Each returned slot additionally carries:
      'block_type' — which day_blocks slot it corresponds to (meal1/2/3),
                     for the frontend to apply the suggestion to that block
      'time'       — the slot's scheduled HH:MM from meal_time_rules
    """
    settings = ws.get_settings()
    meal_rules = ws.get_meal_rules()
    shift = ws.get_shift_for_date(iso_date, settings)
    rules = meal_rules.get(shift["type"])

    if not rules:
        # No meal rules configured for this shift type (shouldn't normally
        # happen — all 4 shift types are seeded) — fall back to generic labels.
        plan = recommend_day_plan(iso_date, num_meals=3)
        for i, slot in enumerate(plan["slots"]):
            slot["block_type"] = f"meal{i+1}"
            slot["time"] = None
        return plan

    slot_labels = [rules["meal1_label"], rules["meal2_label"], rules["meal3_label"]]
    slot_times = [rules["meal1_time"], rules["meal2_time"], rules["meal3_time"]]

    plan = recommend_day_plan(iso_date, num_meals=3, slot_labels=slot_labels)
    plan["shift_type"] = shift["type"]

    for i, slot in enumerate(plan["slots"]):
        slot["block_type"] = f"meal{i + 1}"
        slot["time"] = slot_times[i] if i < len(slot_times) else None

    return plan