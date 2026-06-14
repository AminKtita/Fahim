import memory_manager as mm

EXERCISE_ALIASES = {
    "bench press": [
        "bench",
        "bench press",
        "barbell bench",
        "flat bench"
    ],

    "squat": [
        "squat",
        "back squat",
        "barbell squat"
    ],

    "deadlift": [
        "deadlift",
        "conventional deadlift",
        "sumo deadlift",
        "rack pull"
    ],

    "overhead press": [
        "ohp",
        "overhead press",
        "military press"
    ],

    "pull up":       ["pull up", "pullup", "chin up", "chinup"],
    "row":           ["barbell row", "bent over row", "cable row", "db row"],
    "dip":           ["dip", "chest dip", "tricep dip"],
    "curl":          ["curl", "bicep curl", "barbell curl", "dumbbell curl"],
    "leg press":     ["leg press"],
    "lunge":         ["lunge", "walking lunge"],
    "hip thrust":    ["hip thrust", "glute bridge"],
}

def extract_exercise(text):
    msg = text.lower()

    for canonical, aliases in EXERCISE_ALIASES.items():
        for alias in aliases:
            if alias in msg:
                return canonical

    return None

def get_exercise_context(user_message):
    exercise = extract_exercise(user_message)
    if not exercise:
        return ""

    rows = mm.get_exercise_history_aliases(
        EXERCISE_ALIASES[exercise], limit=30
    )
    if not rows:
        return ""

    # Group by date — show last 6 sessions cleanly
    sessions = {}
    for row in rows:
        d = row["date"]
        sessions.setdefault(d, []).append(row)

    lines = [f"# Exercise History: {exercise}"]
    for session_date in list(sessions.keys())[:6]:
        sets = sessions[session_date]
        set_str = " | ".join(
            f"{s['weight_kg']}kg×{s['reps']}"
            + (f"@{s['rpe']}RPE" if s["rpe"] else "")
            for s in sets
        )
        lines.append(f"{session_date}: {set_str}")

    return "\n".join(lines)

def get_weight_context():

    rows = mm.get_weight_trend(60)

    if not rows:
        return ""

    lines = ["# Weight Trend"]

    for row in rows:
        lines.append(
            f"{row['date']} : "
            f"{row['weight_kg']} kg"
        )

    return "\n".join(lines)

def get_goal_context():

    goals = mm.get_goals()

    if not goals:
        return ""

    lines = ["# Goals"]

    for g in goals:

        lines.append(
            f"{g['title']} | "
            f"{g['current_value']} -> "
            f"{g['target_value']}"
        )

    return "\n".join(lines)