import os
import memory_manager as mm
from datetime import date, timedelta

MEMORY_DIR = os.path.join(os.path.dirname(__file__), "memory")

# Session types that represent "no real training happened" — these are
# logged via the dashboard's day-status feature and must never be treated
# as real exercise sessions in any snapshot.
NON_TRAINING_SESSION_TYPES = {"missed", "rest"}

# Sentinel stored in nutrition_log.notes when the day was logged via the
# dashboard's "off-plan / cheat day" status — i.e. the athlete ate, but
# didn't follow the diet and nothing was tracked.
NUTRITION_OFF_PLAN_SENTINEL = "__MISSED__"


def ensure_memory_dir():
    os.makedirs(MEMORY_DIR, exist_ok=True)


def write(filename, content):
    path = os.path.join(MEMORY_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")


# ─────────────────────────────────────────
#  PROFILE.md  (~200 tokens, always injected)
# ─────────────────────────────────────────

def write_profile():
    p = mm.get_profile()
    if not p:
        write("PROFILE.md", "# Athlete Profile\nNo profile set yet.")
        return

    metrics = mm.get_latest_metrics()
    current_weight = metrics["weight_kg"] if metrics else p["weight_start_kg"]
    injuries = ", ".join(p["injuries"]) if p["injuries"] else "None"

    # Body measurements block — only shown if data exists
    measurements_lines = []
    if metrics:
        fields = [
            ("Body fat",  metrics.get("body_fat_pct"), "%"),
            ("Waist",     metrics.get("waist_cm"),     "cm"),
            ("Chest",     metrics.get("chest_cm"),     "cm"),
            ("Hips",      metrics.get("hips_cm"),      "cm"),
            ("Arm",       metrics.get("arm_cm"),       "cm"),
            ("Thigh",     metrics.get("thigh_cm"),     "cm"),
        ]
        for label, value, unit in fields:
            if value is not None:
                measurements_lines.append(f"  {label}: {value} {unit}")

    measurements_block = ""
    if measurements_lines:
        measurements_block = (
            f"\n## Latest Measurements (as of {metrics['date']})\n"
            + "\n".join(measurements_lines)
        )

    # Weight trend summary
    trend = mm.get_weight_trend(days=30)
    if len(trend) >= 2:
        delta = round(trend[-1]["weight_kg"] - trend[0]["weight_kg"], 2)
        direction = "+" if delta > 0 else ""
        trend_str = f"{direction}{delta} kg over last 30 days"
    else:
        trend_str = "Not enough data"

    content = f"""# Athlete Profile
## Identity
- Name: {p['name']} | Age: {p['age']} | Sex: {p['sex']}
- Height: {p['height_cm']} cm
- Start weight: {p['weight_start_kg']} kg | Current weight: {current_weight} kg
- Weight trend: {trend_str}

## Training
- Goal: {p['goal_type']}
- Activity level: {p['activity_level']}
- Injuries / limitations: {injuries}
{measurements_block}
- Last updated: {date.today().isoformat()}
"""
    write("PROFILE.md", content)

# ─────────────────────────────────────────
#  GOALS.md  (~150 tokens, always injected)
# ─────────────────────────────────────────

def write_goals():
    goals = mm.get_goals(status="active")
    if not goals:
        write("GOALS.md", "# Active Goals\nNo goals set yet.")
        return

    lines = ["# Active Goals"]
    for g in goals:
        current = g["current_value"] if g["current_value"] is not None else "?"
        target  = g["target_value"]
        deadline = g["deadline"] or "no deadline"

        # progress percentage
        if g["current_value"] and g["target_value"]:
            pct = round((g["current_value"] / g["target_value"]) * 100)
            progress = f"{pct}%"
        else:
            progress = "not started"

        lines.append(
            f"- [{g['id']}] {g['title']} | "
            f"current: {current} → target: {target} ({g['metric']}) | "
            f"progress: {progress} | deadline: {deadline}"
        )

    write("GOALS.md", "\n".join(lines))


# ─────────────────────────────────────────
#  TODAY.md  (~300 tokens, injected every session)
# ─────────────────────────────────────────

def _format_yesterday_workout(yesterday_workout):
    """
    Renders the "Yesterday workout: ..." line.

    Handles three cases:
    - Real session with logged sets      -> "Push day ✓ | bench_press: ..."
    - Logged as 'missed' (plan existed,
      athlete skipped the session)       -> "Missed planned session ✗"
    - Logged as 'rest' (deliberate
      rest day, no session planned)      -> "Rest day (planned) ○"
    - No row at all for that date        -> "Rest day / not logged"
    """
    if not yesterday_workout:
        return "Rest day / not logged"

    session_type = (yesterday_workout["session_type"] or "").lower()

    if session_type == "missed":
        return "Missed planned session ✗ — no training done"

    if session_type == "rest":
        return "Rest day (planned) ○"

    sets = mm.get_sets_for_workout(yesterday_workout["id"])
    exercise_summary = {}
    for s in sets:
        if s["is_warmup"]:
            continue
        ex = s["exercise"]
        if ex not in exercise_summary:
            exercise_summary[ex] = s
        else:
            if (s["weight_kg"] or 0) > (exercise_summary[ex]["weight_kg"] or 0):
                exercise_summary[ex] = s

    if not exercise_summary:
        # Session row exists but has no working sets logged — don't claim "✓"
        return f"{yesterday_workout['session_type'].title()} day (no sets logged)"

    set_lines = [f"{ex}: {s['weight_kg']}kg × {s['reps']} reps" for ex, s in exercise_summary.items()]
    return f"{yesterday_workout['session_type'].title()} day ✓ | " + " | ".join(set_lines)


def _format_yesterday_nutrition(yesterday_nutrition):
    """
    Renders the "Yesterday nutrition: ..." line.

    Handles three cases:
    - Real macros logged                 -> "2400 kcal | 150g protein | ..."
    - Logged as off-plan / cheat day
      (notes == '__MISSED__', all
      macro fields NULL)                 -> "Off-plan day (not tracked — cheat day, no diet followed)"
    - No row at all for that date        -> "Not logged"
    """
    if not yesterday_nutrition:
        return "Not logged"

    if (yesterday_nutrition.get("notes") == NUTRITION_OFF_PLAN_SENTINEL
            and yesterday_nutrition.get("calories") is None):
        return "Off-plan day (not tracked — cheat day, no diet followed)"

    if yesterday_nutrition.get("calories") is None:
        # Row exists but has no macro data and isn't the off-plan sentinel —
        # treat the same as "not logged" rather than printing "None kcal".
        return "Not logged"

    return (
        f"{yesterday_nutrition['calories']} kcal | "
        f"{yesterday_nutrition['protein_g']}g protein | "
        f"{yesterday_nutrition['carbs_g']}g carbs | "
        f"{yesterday_nutrition['fat_g']}g fat"
    )


def write_today():
    today     = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    # Yesterday's workout
    recent = mm.get_workouts(days=2)
    yesterday_workout = next((w for w in recent if w["date"] == yesterday), None)
    yesterday_str = _format_yesterday_workout(yesterday_workout)

    # Yesterday's nutrition
    nutrition_recent = mm.get_nutrition(days=2)
    yesterday_nutrition = next((n for n in nutrition_recent if n["date"] == yesterday), None)
    nutrition_str = _format_yesterday_nutrition(yesterday_nutrition)

    # Current weight
    metrics = mm.get_latest_metrics()
    weight_str = f"{metrics['weight_kg']} kg" if metrics else "Not logged"

    # Weight trend (last 14 days)
    trend_data = mm.get_weight_trend(days=14)
    if len(trend_data) >= 2:
        delta = round(trend_data[-1]["weight_kg"] - trend_data[0]["weight_kg"], 2)
        direction = "+" if delta > 0 else ""
        trend_str = f"{direction}{delta} kg over last {len(trend_data)} entries"
    else:
        trend_str = "Not enough data"

    # Streak
    streak = mm.compute_streak()

    content = f"""# Today — {date.today().strftime('%A %d %B %Y')}
- Yesterday workout: {yesterday_str}
- Yesterday nutrition: {nutrition_str}
- Current weight: {weight_str}
- Weight trend: {trend_str}
- Streak: {streak} days on plan
"""
    write("TODAY.md", content)


# ─────────────────────────────────────────
#  CURRENT_WEEK.md  (~500 tokens, workout queries)
# ─────────────────────────────────────────

def write_current_week():
    workouts = mm.get_workouts(days=7)
    lines = [f"# Current Week — last 7 days (as of {date.today().isoformat()})"]

    if not workouts:
        lines.append("No workouts logged this week.")
        write("CURRENT_WEEK.md", "\n".join(lines))
        return

    for w in workouts:
        session_type = (w["session_type"] or "").lower()

        # Render missed/rest days as short status lines, not training sessions
        if session_type == "missed":
            lines.append(f"\n## {w['date']} — Missed planned session ✗")
            if w["notes"]:
                lines.append(f"  Notes: {w['notes']}")
            continue

        if session_type == "rest":
            lines.append(f"\n## {w['date']} — Rest day (planned) ○")
            if w["notes"]:
                lines.append(f"  Notes: {w['notes']}")
            continue

        lines.append(f"\n## {w['date']} — {w['session_type'].title()}")
        if w["duration_min"]:
            lines.append(f"Duration: {w['duration_min']} min | RPE: {w['perceived_effort']}/10")

        sets = mm.get_sets_for_workout(w["id"])
        if sets:
            # Group by exercise
            by_exercise = {}
            for s in sets:
                ex = s["exercise"]
                by_exercise.setdefault(ex, []).append(s)

            for ex, ex_sets in by_exercise.items():
                working = [s for s in ex_sets if not s["is_warmup"]]
                warmups = [s for s in ex_sets if s["is_warmup"]]
                set_str = " | ".join(
                    f"{s['weight_kg']}kg×{s['reps']}"
                    + (f"@{s['rpe']}RPE" if s["rpe"] else "")
                    for s in working
                )
                warmup_str = f" (+ {len(warmups)} warmup sets)" if warmups else ""
                lines.append(f"  {ex}: {set_str}{warmup_str}")

        if w["notes"]:
            lines.append(f"  Notes: {w['notes']}")

    write("CURRENT_WEEK.md", "\n".join(lines))

def write_plan():
    plan = mm.get_active_plan()
    if not plan:
        write("PLAN.md", "# Training Plan\nNo active plan set yet.")
        return

    days = mm.get_plan_days(plan["id"])
    targets = mm.get_active_nutrition_targets()

    from datetime import date as dt
    today = dt.today().isoformat()

    # Weeks into mesocycle
    start = plan["start_date"]
    try:
        from datetime import date as d
        delta = (d.fromisoformat(today) - d.fromisoformat(start)).days
        week_number = max(1, (delta // 7) + 1)
    except Exception:
        week_number = "?"

    lines = [
        f"# Training Plan — {plan['name']}",
        f"- Split: {plan['split_type']} | {plan['days_per_week']} days/week",
        f"- Mesocycle: {plan['mesocycle_number']} | Week {week_number} of 6",
        f"- Started: {plan['start_date']} | Ends: {plan['end_date']}",
        f"- Deload every: {plan['deload_week']} weeks",
    ]

    if targets:
        lines.append(f"\n## Nutrition Targets")
        lines.append(f"- Calories: {targets['calories']} kcal")
        lines.append(f"- Protein: {targets['protein_g']}g | "
                     f"Carbs: {targets['carbs_g']}g | "
                     f"Fat: {targets['fat_g']}g")

    for day in days:
        lines.append(f"\n## {day['day_name'].title()} — {day['session_type'].title()}")
        exercises = mm.get_plan_exercises(day["id"])
        for ex in exercises:
            line = f"  {ex['exercise']}: {ex['sets']}×{ex['reps']}"
            if ex["rir"] is not None:
                line += f" RIR {ex['rir']}"
            if ex["progression_rule"]:
                line += f" | {ex['progression_rule']}"
            lines.append(line)

    if plan["notes"]:
        lines.append(f"\n## Notes\n{plan['notes']}")

    write("PLAN.md", "\n".join(lines))

    
# ─────────────────────────────────────────
#  RECENT_PROGRESS.md  (~400 tokens, progress queries)
# ─────────────────────────────────────────

def write_recent_progress():
    lines = [f"# Progress Report — last 30 days (as of {date.today().isoformat()})"]

    # Weight trend
    trend = mm.get_weight_trend(days=30)
    if trend:
        start_w = trend[0]["weight_kg"]
        end_w   = trend[-1]["weight_kg"]
        delta   = round(end_w - start_w, 2)
        direction = "gained" if delta > 0 else "lost"
        lines.append(f"\n## Weight")
        lines.append(f"- Start of period: {start_w} kg")
        lines.append(f"- Latest: {end_w} kg")
        lines.append(f"- Change: {direction} {abs(delta)} kg over {len(trend)} weigh-ins")

    # Workout frequency — split real training sessions from missed/rest days
    all_workouts = mm.get_workouts(days=30)
    real_workouts = [w for w in all_workouts if (w["session_type"] or "").lower() not in NON_TRAINING_SESSION_TYPES]
    missed_count  = sum(1 for w in all_workouts if (w["session_type"] or "").lower() == "missed")
    rest_count    = sum(1 for w in all_workouts if (w["session_type"] or "").lower() == "rest")

    lines.append(f"\n## Training Volume")
    lines.append(f"- Sessions in last 30 days: {len(real_workouts)}")
    if real_workouts:
        types = {}
        for w in real_workouts:
            t = w["session_type"]
            types[t] = types.get(t, 0) + 1
        breakdown = " | ".join(f"{k}: {v}x" for k, v in types.items())
        lines.append(f"- Breakdown: {breakdown}")
    if missed_count:
        lines.append(f"- Missed planned sessions: {missed_count}")
    if rest_count:
        lines.append(f"- Planned rest days: {rest_count}")

    # Nutrition averages — off-plan/cheat days are excluded from the average
    # but reported separately so the model knows they happened.
    nutrition = mm.get_nutrition(days=30)
    lines.append(f"\n## Nutrition (last 30 days)")
    if nutrition:
        logged_days = [n for n in nutrition if n["calories"] is not None]
        off_plan_days = [
            n for n in nutrition
            if n["calories"] is None and n.get("notes") == NUTRITION_OFF_PLAN_SENTINEL
        ]
        if logged_days:
            avg_cal  = round(sum(n["calories"] for n in logged_days) / len(logged_days))
            avg_prot = round(sum(n["protein_g"] for n in logged_days if n["protein_g"]) / len(logged_days), 1)
            lines.append(f"- Days logged: {len(logged_days)}")
            lines.append(f"- Avg calories: {avg_cal} kcal/day")
            lines.append(f"- Avg protein: {avg_prot} g/day")
        if off_plan_days:
            lines.append(f"- Off-plan / cheat days (not tracked): {len(off_plan_days)}")
        if not logged_days and not off_plan_days:
            lines.append("- No nutrition data logged")
    else:
        lines.append("- No nutrition data logged")

    # Goals progress
    goals = mm.get_goals(status="active")
    if goals:
        lines.append(f"\n## Goal Progress")
        for g in goals:
            current = g["current_value"] if g["current_value"] is not None else "?"
            lines.append(
                f"- {g['title']}: {current} / {g['target_value']} {g['metric']}"
            )

    write("RECENT_PROGRESS.md", "\n".join(lines))


# ─────────────────────────────────────────
#  HISTORY_INDEX.md  (~100 tokens, reference)
# ─────────────────────────────────────────

def write_history_index():
    workouts = mm.get_workouts(days=90)
    real_workouts = [w for w in workouts if (w["session_type"] or "").lower() not in NON_TRAINING_SESSION_TYPES]
    skipped = [w for w in workouts if (w["session_type"] or "").lower() in NON_TRAINING_SESSION_TYPES]

    lines = [f"# Workout History Index — last 90 days"]
    lines.append(f"Total sessions: {len(real_workouts)}")
    if skipped:
        missed_count = sum(1 for w in skipped if (w["session_type"] or "").lower() == "missed")
        rest_count   = sum(1 for w in skipped if (w["session_type"] or "").lower() == "rest")
        extra = []
        if missed_count:
            extra.append(f"{missed_count} missed")
        if rest_count:
            extra.append(f"{rest_count} planned rest")
        if extra:
            lines.append(f"({' | '.join(extra)} — not counted as sessions)")
    lines.append("")

    for w in real_workouts:
        lines.append(f"- {w['date']}: {w['session_type']} (id:{w['id']})")

    write("HISTORY_INDEX.md", "\n".join(lines))


# ─────────────────────────────────────────
#  MASTER UPDATE — call this to refresh all files
# ─────────────────────────────────────────

def update_all():
    ensure_memory_dir()
    write_profile()
    write_goals()
    write_today()
    write_current_week()
    write_recent_progress()
    write_history_index()
    write_plan()
    print(f"[+] Memory snapshots updated — {date.today().isoformat()}")


if __name__ == "__main__":
    update_all()