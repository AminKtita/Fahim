import os
import memory_manager as mm
from datetime import date, timedelta

MEMORY_DIR = os.path.join(os.path.dirname(__file__), "memory")


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

    content = f"""# Athlete Profile
- Name: {p['name']} | Age: {p['age']} | Sex: {p['sex']}
- Height: {p['height_cm']} cm
- Start weight: {p['weight_start_kg']} kg | Current weight: {current_weight} kg
- Goal: {p['goal_type']}
- Activity level: {p['activity_level']}
- Injuries / limitations: {injuries}
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

def write_today():
    today     = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    # Yesterday's workout
    recent = mm.get_workouts(days=2)
    yesterday_workout = next((w for w in recent if w["date"] == yesterday), None)

    if yesterday_workout:
        sets = mm.get_sets_for_workout(yesterday_workout["id"])
        # summarize: group by exercise, show top set
        exercise_summary = {}
        for s in sets:
            if s["is_warmup"]:
                continue
            ex = s["exercise"]
            if ex not in exercise_summary:
                exercise_summary[ex] = s
            else:
                # keep heaviest set
                if (s["weight_kg"] or 0) > (exercise_summary[ex]["weight_kg"] or 0):
                    exercise_summary[ex] = s

        set_lines = []
        for ex, s in exercise_summary.items():
            set_lines.append(f"{ex}: {s['weight_kg']}kg × {s['reps']} reps")
        yesterday_str = (
            f"{yesterday_workout['session_type'].title()} day ✓ | "
            + " | ".join(set_lines)
        )
    else:
        yesterday_str = "Rest day / not logged"

    # Yesterday's nutrition
    nutrition_recent = mm.get_nutrition(days=2)
    yesterday_nutrition = next((n for n in nutrition_recent if n["date"] == yesterday), None)
    if yesterday_nutrition:
        nutrition_str = (
            f"{yesterday_nutrition['calories']} kcal | "
            f"{yesterday_nutrition['protein_g']}g protein | "
            f"{yesterday_nutrition['carbs_g']}g carbs | "
            f"{yesterday_nutrition['fat_g']}g fat"
        )
    else:
        nutrition_str = "Not logged"

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

    # Today's summary row if exists
    summaries = mm.get_daily_summaries(days=1)
    today_summary = summaries[0] if summaries else None
    coach_note = today_summary["coach_note"] if today_summary and today_summary["coach_note"] else "None"

    content = f"""# Today — {date.today().strftime('%A %d %B %Y')}
- Yesterday workout: {yesterday_str}
- Yesterday nutrition: {nutrition_str}
- Current weight: {weight_str}
- Weight trend: {trend_str}
- Streak: {streak} days on plan
- Coach note: {coach_note}
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

    # Workout frequency
    workouts = mm.get_workouts(days=30)
    lines.append(f"\n## Training Volume")
    lines.append(f"- Sessions in last 30 days: {len(workouts)}")
    if workouts:
        types = {}
        for w in workouts:
            t = w["session_type"]
            types[t] = types.get(t, 0) + 1
        breakdown = " | ".join(f"{k}: {v}x" for k, v in types.items())
        lines.append(f"- Breakdown: {breakdown}")

    # Nutrition averages
    nutrition = mm.get_nutrition(days=30)
    lines.append(f"\n## Nutrition (last 30 days)")
    if nutrition:
        logged_days = [n for n in nutrition if n["calories"]]
        if logged_days:
            avg_cal  = round(sum(n["calories"] for n in logged_days) / len(logged_days))
            avg_prot = round(sum(n["protein_g"] for n in logged_days if n["protein_g"]) / len(logged_days), 1)
            lines.append(f"- Days logged: {len(logged_days)}")
            lines.append(f"- Avg calories: {avg_cal} kcal/day")
            lines.append(f"- Avg protein: {avg_prot} g/day")
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
    lines = [f"# Workout History Index — last 90 days"]
    lines.append(f"Total sessions: {len(workouts)}\n")
    for w in workouts:
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
    print(f"[+] Memory snapshots updated — {date.today().isoformat()}")


if __name__ == "__main__":
    update_all()