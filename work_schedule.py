"""
work_schedule.py — rotating work-shift calculation + full-day plan builder.

Shift rotation
--------------
The user works a repeating 6-day cycle: 2 "primary" shift days, 2 evening
shift days, 2 rest days — in that order. The 6-day cycle sits inside a
30-day "regime" (5 cycles). Regimes alternate:

    day-month   regime: primary shift = morning (07:00-14:00)
    night-month regime: primary shift = night   (22:00-07:00)

Evening (14:00-22:00) and rest days are identical in both regimes — only
the "primary" slot changes. Regimes alternate every regime_length_days,
forming a (2 * regime_length_days)-day super-cycle, anchored on
regime_anchor_date (the first day of a known day-month regime).

Workout suggestion
-------------------
To keep suggested times on the same calendar date (and avoid ever landing
a suggestion after midnight), the "side" of the shift used depends on the
shift type:
    morning shift -> suggest AFTER work   (plenty of daylight left)
    evening shift -> suggest BEFORE work  (avoids an 11pm+ suggestion)
    night shift   -> suggest BEFORE work  (avoids crossing midnight)
    rest day      -> fixed default time (rest_day_workout_time)

Meal suggestion
---------------
Three main meals only, timed purely off the work shift (not the workout),
per meal_time_rules for that shift type.
"""

import sqlite3
import os
from datetime import date, datetime, timedelta
import memory_manager as mm

DB_PATH = os.path.join(os.path.dirname(__file__), "db", "fitness.db")

# Default theming category per block_type (used for auto-computed blocks;
# custom blocks carry whatever category the user picked when creating them).
DEFAULT_CATEGORY = {
    "work": "work",
    "workout": "workout",
    "meal1": "meal",
    "meal2": "meal",
    "meal3": "meal",
}


def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


# ── small time helpers (all times are 'HH:MM' 24h strings) ──────────────

def _to_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _to_hhmm(total_min: int) -> str:
    total_min %= 24 * 60
    return f"{total_min // 60:02d}:{total_min % 60:02d}"


def _add_min(hhmm: str, minutes: int) -> str:
    return _to_hhmm(_to_minutes(hhmm) + minutes)


def _sub_min(hhmm: str, minutes: int) -> str:
    return _to_hhmm(_to_minutes(hhmm) - minutes)


# ── settings / meal rules ────────────────────────────────────────────────

def get_settings(conn=None):
    own = conn is None
    conn = conn or get_conn()
    try:
        row = conn.execute("SELECT * FROM work_schedule_settings WHERE id = 1").fetchone()
        return dict(row) if row else None
    finally:
        if own:
            conn.close()


def update_settings(fields: dict):
    if not fields:
        return
    conn = get_conn()
    try:
        cols, vals = [], []
        for k, v in fields.items():
            cols.append(f"{k} = ?")
            vals.append(v)
        conn.execute(f"UPDATE work_schedule_settings SET {', '.join(cols)} WHERE id = 1", vals)
        conn.commit()
    finally:
        conn.close()


def get_meal_rules(conn=None):
    own = conn is None
    conn = conn or get_conn()
    try:
        rows = conn.execute("SELECT * FROM meal_time_rules").fetchall()
        return {r["shift_type"]: dict(r) for r in rows}
    finally:
        if own:
            conn.close()


def update_meal_rule(shift_type: str, fields: dict):
    if not fields:
        return
    conn = get_conn()
    try:
        cols, vals = [], []
        for k, v in fields.items():
            cols.append(f"{k} = ?")
            vals.append(v)
        vals.append(shift_type)
        conn.execute(f"UPDATE meal_time_rules SET {', '.join(cols)} WHERE shift_type = ?", vals)
        conn.commit()
    finally:
        conn.close()


# ── shift calculation ────────────────────────────────────────────────────

def get_shift_for_date(iso_date: str, settings: dict) -> dict:
    """
    Returns {'type': 'morning'|'evening'|'night'|'rest', 'start': 'HH:MM'|None, 'end': 'HH:MM'|None}
    """
    d = datetime.strptime(iso_date, "%Y-%m-%d").date()
    anchor = datetime.strptime(settings["regime_anchor_date"], "%Y-%m-%d").date()
    regime_len = settings["regime_length_days"]
    cycle_len = settings["cycle_length_days"]
    super_cycle = regime_len * 2

    days_since_anchor = (d - anchor).days
    # Python's % on ints always returns a non-negative result when the
    # divisor is positive, so this is safe for dates before the anchor too.
    regime_offset = days_since_anchor % super_cycle
    is_day_month = regime_offset < regime_len

    cycle_pos = days_since_anchor % cycle_len  # 0..5

    if cycle_pos in (0, 1):
        shift_type = "morning" if is_day_month else "night"
    elif cycle_pos in (2, 3):
        shift_type = "evening"
    else:
        shift_type = "rest"

    if shift_type == "rest":
        return {"type": "rest", "start": None, "end": None}

    start = settings[f"{shift_type}_start"]
    end = settings[f"{shift_type}_end"]
    return {"type": shift_type, "start": start, "end": end}


def compute_workout_suggestion(shift: dict, settings: dict) -> dict:
    """
    Returns {'start': 'HH:MM', 'end': 'HH:MM', 'label': str} — always
    same-day, never crosses midnight (see module docstring for the rule).
    """
    duration = settings["default_workout_duration_min"]

    if shift["type"] == "rest":
        start = settings["rest_day_workout_time"]
        return {"start": start, "end": _add_min(start, duration), "label": "Workout (rest day)"}

    if shift["type"] == "morning":
        start = _add_min(shift["end"], settings["workout_buffer_after_work_min"])
        return {"start": start, "end": _add_min(start, duration), "label": "Workout (after work)"}

    # evening and night shifts: suggest before work, to stay same-day
    end = _sub_min(shift["start"], settings["workout_buffer_before_work_min"])
    start = _sub_min(end, duration)
    return {"start": start, "end": end, "label": "Workout (before work)"}


def compute_auto_blocks(iso_date: str, settings: dict, meal_rules: dict) -> list:
    """Returns the list of auto-computed blocks for a date (work, workout, 3 meals)."""
    shift = get_shift_for_date(iso_date, settings)
    blocks = []

    if shift["type"] != "rest":
        blocks.append({
            "block_type": "work",
            "category": "work",
            "title": f"{shift['type'].capitalize()} shift",
            "start_time": shift["start"],
            "end_time": shift["end"],
            "source": "auto",
        })

    workout = compute_workout_suggestion(shift, settings)
    if _is_workout_day(iso_date):
        blocks.append({
            "block_type": "workout",
            "category": "workout",
            "title": workout["label"],
            "start_time": workout["start"],
            "end_time": workout["end"],
            "source": "auto",
        })

    rules = meal_rules.get(shift["type"])
    if rules:
        suggestions = _get_meal_suggestions(iso_date, rules) if _is_today_or_future(iso_date) else None
        for i in (1, 2, 3):
            label = rules[f"meal{i}_label"]
            time = rules[f"meal{i}_time"]
            title = label
            notes = None

            slot = suggestions[i - 1] if suggestions else None
            if slot and slot.get("recipe"):
                title = f"{slot['recipe']['name']} (×{slot['scale']})"
                m = slot["macros"]
                notes = f"{m['calories']} kcal · {m['protein_g']}g P · {m['carbs_g']}g C · {m['fat_g']}g F"

            blocks.append({
                "block_type": f"meal{i}",
                "category": "meal",
                "title": title,
                "start_time": time,
                "end_time": None,
                "source": "auto",
                "notes": notes,
            })

    return blocks


def _is_today_or_future(iso_date: str) -> bool:
    return iso_date >= date.today().isoformat()


def _get_meal_suggestions(iso_date: str, rules: dict):
    """
    Returns the 3 meal_recommender slots (recipe + portion scale fit to
    the remaining macro budget) for this date's real shift-based meal
    labels, or None if there's no active nutrition target / recipe
    library / anything goes wrong. Display-only — never logs anything.

    Imported lazily (not at module top-level) because meal_recommender.py
    imports this module too (for recommend_for_day_plan); deferring the
    import until call time avoids a circular-import failure at load time.
    """
    try:
        import meal_recommender as mr
        slot_labels = [rules["meal1_label"], rules["meal2_label"], rules["meal3_label"]]
        result = mr.recommend_day_plan(iso_date, num_meals=3, slot_labels=slot_labels)
        if result.get("error"):
            return None
        return result["slots"]
    except Exception:
        return None


# ── training-plan lookup (is this date actually a workout day?) ──────────
# The workout auto-suggestion should only appear on days the active split
# actually schedules a session — not on every day regardless of the plan.

_WEEKDAY_MAP = {
    "sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3,
    "thursday": 4, "friday": 5, "saturday": 6,
}


def _get_plan_day_for_date(iso_date: str):
    """
    Mirrors the frontend's getPlanDayForDate(): returns the plan_days row
    (or None) whose day_name matches this date's weekday, for the active
    training plan. Returns None if there's no active plan, or no plan_days
    row for this weekday (implicit rest).
    """
    try:
        plan = mm.get_active_plan()
        if not plan:
            return None
        days = mm.get_plan_days(plan["id"])
    except Exception:
        return None

    weekday = datetime.strptime(iso_date, "%Y-%m-%d").weekday()  # Mon=0..Sun=6
    sunday0 = (weekday + 1) % 7  # convert to Sun=0..Sat=6, matching the frontend

    for d in days:
        name = (d.get("day_name") or "").strip().lower()
        if _WEEKDAY_MAP.get(name) == sunday0:
            return d
    return None


def _is_workout_day(iso_date: str) -> bool:
    """
    True if the active training plan schedules a real session on this date.
    If there's no active plan at all, defaults to True — with no plan to
    consult, we can't tell it's a rest day, so keep suggesting a slot
    rather than silently hiding it.
    """
    try:
        plan = mm.get_active_plan()
    except Exception:
        plan = None
    if not plan:
        return True

    day = _get_plan_day_for_date(iso_date)
    if day is None:
        return False  # weekday isn't in the split at all -> rest
    return (day.get("session_type") or "").strip().lower() != "rest"


def get_day_plan(iso_date: str) -> dict:
    """
    Merges auto-computed blocks for iso_date with any manual overrides /
    hidden flags / custom blocks stored in day_blocks for that date.
    Returns {'date': iso_date, 'shift_type': ..., 'blocks': [...]}
    """
    conn = get_conn()
    try:
        settings = get_settings(conn)
        meal_rules = get_meal_rules(conn)
        shift = get_shift_for_date(iso_date, settings)
        auto_blocks = compute_auto_blocks(iso_date, settings, meal_rules)

        overrides = conn.execute(
            "SELECT * FROM day_blocks WHERE date = ?", (iso_date,)
        ).fetchall()
        overrides_by_type = {}
        custom_blocks = []
        for row in overrides:
            r = dict(row)
            if r["block_type"] == "custom":
                custom_blocks.append(r)
            else:
                overrides_by_type[r["block_type"]] = r

        merged = []
        for b in auto_blocks:
            override = overrides_by_type.get(b["block_type"])
            if override is None:
                merged.append({**b, "id": None})
            elif override["status"] == "hidden":
                continue  # user deleted this auto suggestion
            else:
                merged.append({
                    "id": override["id"],
                    "block_type": override["block_type"],
                    "category": override["category"] or DEFAULT_CATEGORY.get(b["block_type"], "other"),
                    "title": override["title"],
                    "start_time": override["start_time"],
                    "end_time": override["end_time"],
                    "notes": override["notes"],
                    "source": "manual",
                })

        for r in custom_blocks:
            merged.append({
                "id": r["id"],
                "block_type": "custom",
                "category": r["category"] or "other",
                "title": r["title"],
                "start_time": r["start_time"],
                "end_time": r["end_time"],
                "notes": r["notes"],
                "source": "manual",
            })

        merged.sort(key=lambda b: b["start_time"] or "99:99")

        return {"date": iso_date, "shift_type": shift["type"], "blocks": merged}
    finally:
        conn.close()