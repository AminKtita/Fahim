import sqlite3
import os
import json
from datetime import datetime, date, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "db", "fitness.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


# ─────────────────────────────────────────
#  USER PROFILE
# ─────────────────────────────────────────

def save_profile(name, age, sex, height_cm, weight_start_kg,
                 activity_level, goal_type, injuries=None):
    """Insert or replace the single user profile row."""
    conn = get_conn()
    conn.execute("""
        INSERT INTO user_profile
            (id, name, age, sex, height_cm, weight_start_kg,
             activity_level, goal_type, injuries)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            age=excluded.age,
            sex=excluded.sex,
            height_cm=excluded.height_cm,
            weight_start_kg=excluded.weight_start_kg,
            activity_level=excluded.activity_level,
            goal_type=excluded.goal_type,
            injuries=excluded.injuries
    """, (name, age, sex, height_cm, weight_start_kg,
          activity_level, goal_type,
          json.dumps(injuries or [])))
    conn.commit()
    conn.close()


def get_profile():
    """Returns the user profile as a dict, or None if not set."""
    conn = get_conn()
    row = conn.execute("SELECT * FROM user_profile WHERE id=1").fetchone()
    conn.close()
    if row:
        d = dict(row)
        d["injuries"] = json.loads(d["injuries"] or "[]")
        return d
    return None


# ─────────────────────────────────────────
#  WORKOUTS
# ─────────────────────────────────────────

def log_workout(session_date, session_type, duration_min=None,
                perceived_effort=None, notes=None):
    """
    Creates a workout session record. Returns the new workout_id.
    session_type: push / pull / legs / upper / lower / cardio / full_body
    """
    conn = get_conn()
    cursor = conn.execute("""
        INSERT INTO workouts (date, session_type, duration_min, perceived_effort, notes)
        VALUES (?, ?, ?, ?, ?)
    """, (session_date, session_type, duration_min, perceived_effort, notes))
    workout_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return workout_id


def log_set(workout_id, exercise, set_number, reps,
            weight_kg, rpe=None, is_warmup=False, notes=None):
    """Logs one set inside a workout session."""
    conn = get_conn()
    conn.execute("""
        INSERT INTO workout_sets
            (workout_id, exercise, set_number, reps, weight_kg, rpe, is_warmup, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (workout_id, exercise, set_number, reps,
          weight_kg, rpe, int(is_warmup), notes))
    conn.commit()
    conn.close()


def get_workouts(days=7):
    """Returns all workout sessions from the last N days."""
    since = (date.today() - timedelta(days=days)).isoformat()
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM workouts
        WHERE date >= ?
        ORDER BY date DESC
    """, (since,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_sets_for_workout(workout_id):
    """Returns all sets for a given workout_id."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM workout_sets
        WHERE workout_id = ?
        ORDER BY exercise, set_number
    """, (workout_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_exercise_history(exercise, limit=10):
    """
    Returns the last N logged sessions for a specific exercise.
    Useful for tracking PRs and progression.
    """
    conn = get_conn()
    rows = conn.execute("""
        SELECT ws.*, w.date, w.session_type
        FROM workout_sets ws
        JOIN workouts w ON ws.workout_id = w.id
        WHERE LOWER(ws.exercise) = LOWER(?)
          AND ws.is_warmup = 0
        ORDER BY w.date DESC, ws.set_number ASC
        LIMIT ?
    """, (exercise, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────
#  NUTRITION
# ─────────────────────────────────────────

def log_nutrition(log_date, calories=None, protein_g=None,
                  carbs_g=None, fat_g=None, water_ml=None, notes=None):
    """Insert or update nutrition for a given day."""
    conn = get_conn()
    conn.execute("""
        INSERT INTO nutrition_log
            (date, calories, protein_g, carbs_g, fat_g, water_ml, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            calories=excluded.calories,
            protein_g=excluded.protein_g,
            carbs_g=excluded.carbs_g,
            fat_g=excluded.fat_g,
            water_ml=excluded.water_ml,
            notes=excluded.notes
    """, (log_date, calories, protein_g, carbs_g, fat_g, water_ml, notes))
    conn.commit()
    conn.close()


def get_nutrition(days=7):
    """Returns nutrition logs for the last N days."""
    since = (date.today() - timedelta(days=days)).isoformat()
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM nutrition_log
        WHERE date >= ?
        ORDER BY date DESC
    """, (since,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────
#  BODY METRICS
# ─────────────────────────────────────────

def log_body_metrics(log_date, weight_kg=None, body_fat_pct=None,
                     waist_cm=None, chest_cm=None, hips_cm=None,
                     arm_cm=None, thigh_cm=None, notes=None):
    """Log a body measurement snapshot."""
    conn = get_conn()
    conn.execute("""
        INSERT INTO body_metrics
            (date, weight_kg, body_fat_pct, waist_cm, chest_cm,
             hips_cm, arm_cm, thigh_cm, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (log_date, weight_kg, body_fat_pct, waist_cm, chest_cm,
          hips_cm, arm_cm, thigh_cm, notes))
    conn.commit()
    conn.close()


def get_latest_metrics():
    """Returns the most recent body metrics row."""
    conn = get_conn()
    row = conn.execute("""
        SELECT * FROM body_metrics ORDER BY date DESC LIMIT 1
    """).fetchone()
    conn.close()
    return dict(row) if row else None


def get_weight_trend(days=30):
    """Returns weight entries for the last N days for trend calculation."""
    since = (date.today() - timedelta(days=days)).isoformat()
    conn = get_conn()
    rows = conn.execute("""
        SELECT date, weight_kg FROM body_metrics
        WHERE date >= ? AND weight_kg IS NOT NULL
        ORDER BY date ASC
    """, (since,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────
#  GOALS
# ─────────────────────────────────────────

def save_goal(title, metric, target_value, deadline=None, current_value=None):
    """Create a new goal."""
    conn = get_conn()
    conn.execute("""
        INSERT INTO goals (title, metric, target_value, current_value, deadline, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (title, metric, target_value, current_value,
          deadline, date.today().isoformat()))
    conn.commit()
    conn.close()


def update_goal_progress(goal_id, current_value, status=None):
    """Update the current value of a goal, and optionally its status."""
    conn = get_conn()
    if status:
        conn.execute("""
            UPDATE goals SET current_value=?, status=? WHERE id=?
        """, (current_value, status, goal_id))
    else:
        conn.execute("""
            UPDATE goals SET current_value=? WHERE id=?
        """, (current_value, goal_id))
    conn.commit()
    conn.close()


def get_goals(status="active"):
    """Returns all goals with the given status."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM goals WHERE status=? ORDER BY deadline ASC
    """, (status,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────────────────────────
#  STREAK COMPUTATION
#
#  Python port of the dashboard's StatusContext / Schedule streak logic.
#  Mirrors deriveNutStatus() in NutritionModals.jsx exactly so the
#  backend snapshot (TODAY.md), the frontend navbar, and the AI's
#  understanding of "current streak" all agree.
#
#  Rule:
#  - A "streak day" requires:
#      * workout done that day (session_type not 'missed'/'rest'), AND
#      * nutrition status == 'hit' (within thresholds of plan targets)
#  - On a planned REST day (no plan session for that weekday):
#      * counts as a streak day ONLY if nutrition status == 'hit'
#  - Today is allowed to be incomplete: if today doesn't qualify,
#    skip it once and start counting from yesterday.
#  - The first non-qualifying PAST day breaks the streak.
#
#  NOTE: the old daily_summary-based compute_streak() has been removed.
#  upsert_daily_summary() and get_daily_summaries() are no longer called
#  anywhere and can be removed too — they were part of an abandoned
#  daily_summary mechanism that nothing ever populated correctly.
# ─────────────────────────────────────────────────────────────────

# Day-name → Python weekday() mapping (Monday=0 ... Sunday=6, matches date.weekday())
_DAY_NAME_TO_WEEKDAY = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
    "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6,
}

# Sentinel stored in nutrition_log.notes for off-plan / cheat days
# (must match NUTRITION_OFF_PLAN_SENTINEL in snapshot_writer.py)
_NUTRITION_OFF_PLAN_SENTINEL = "__MISSED__"

# session_types that mean "no real training happened"
_NON_TRAINING_SESSION_TYPES = {"missed", "rest"}


def _is_planned_rest_day(iso_date, plan_days_by_weekday):
    """
    Returns True if no plan session exists for this date's weekday.
    plan_days_by_weekday: dict mapping weekday int (0=Mon..6=Sun) -> plan_day row
    If there's no active plan at all, every day is treated as "not a rest day"
    (i.e. requires a workout to count) — matches the JS:
    `isPlannedRestDay` returns False when `!plan?.days?.length`.
    """
    if not plan_days_by_weekday:
        return False
    wd = date.fromisoformat(iso_date).weekday()
    return wd not in plan_days_by_weekday


def _nutrition_status(n, targets):
    """
    Python port of deriveNutStatus() in NutritionModals.jsx.
    n: dict row from nutrition_log, or None
    targets: dict from nutrition_targets (calories, protein_g, carbs_g, fat_g), or None

    Returns one of: None, 'hit', 'partial', 'off', 'missed'
    """
    if not n:
        return None

    if n.get("notes") == _NUTRITION_OFF_PLAN_SENTINEL:
        return "missed"

    cal  = n.get("calories")
    prot = n.get("protein_g")
    carb = n.get("carbs_g")
    fat  = n.get("fat_g")

    has_any = any(v is not None and v > 0 for v in (cal, prot, carb, fat))
    if not has_any:
        return None

    if not targets or not targets.get("calories"):
        filled = sum(1 for v in (cal, prot, carb, fat) if v is not None and v > 0)
        if filled == 4:
            return "hit"
        if filled > 0:
            return "partial"
        return "off"

    cal  = cal or 0
    prot = prot or 0
    t_cal  = targets.get("calories") or 0
    t_prot = targets.get("protein_g") or 0
    t_carb = targets.get("carbs_g") or 0
    t_fat  = targets.get("fat_g") or 0

    if t_cal > 0 and cal < t_cal * 0.40:
        return "missed"

    cal_ok  = (cal  >= t_cal  * 0.95) if t_cal  > 0 else True
    prot_ok = (prot >= t_prot * 0.95) if t_prot > 0 else True
    carb_ok = ((carb or 0) >= t_carb * 0.90) if t_carb > 0 else True
    fat_ok  = ((fat  or 0) >= t_fat  * 0.85) if t_fat  > 0 else True

    filled = sum(1 for v in (cal, prot, carb, fat) if v is not None and v > 0)

    if cal_ok and prot_ok and carb_ok and fat_ok and filled == 4:
        return "hit"
    if t_cal > 0 and cal < t_cal * 0.70:
        return "off"
    return "partial"


def compute_streak():
    """
    Returns the current streak length (int), using the same definition
    as the dashboard:

      streak day = workout done (non-missed/rest) AND nutrition status == 'hit'
      planned rest day = counts only if nutrition status == 'hit'

    Walks backward from today. Today is allowed to be incomplete and is
    skipped once if it doesn't qualify. The first non-qualifying PAST day
    ends the streak.
    """
    plan = get_active_plan()
    targets = get_active_nutrition_targets()

    plan_days_by_weekday = {}
    if plan:
        for pd in get_plan_days(plan["id"]):
            wd = _DAY_NAME_TO_WEEKDAY.get((pd.get("day_name") or "").lower())
            if wd is not None:
                plan_days_by_weekday[wd] = pd

    workouts = get_workouts(days=120)
    nutrition = get_nutrition(days=120)

    w_map = {w["date"]: w for w in workouts}
    n_map = {n["date"]: n for n in nutrition}

    streak = 0
    d = date.today()

    for i in range(120):
        iso = d.isoformat()
        is_rest = _is_planned_rest_day(iso, plan_days_by_weekday)
        nut_status = _nutrition_status(n_map.get(iso), targets)
        nut_hit = nut_status == "hit"
        w = w_map.get(iso)
        w_session = (w.get("session_type") or "").lower() if w else None

        # i==0 (today) gets a pass ONLY if NOTHING has been logged yet for
        # today (no nutrition status at all, and no workout row). If the
        # athlete explicitly logged a 'missed' nutrition day or a 'missed'
        # workout for today, that's a completed, deliberate failure and
        # must break the streak immediately — it is NOT "day not over yet".
        today_untouched = (i == 0 and nut_status is None and w_session is None)

        if is_rest:
            if nut_hit:
                streak += 1
                d = d - timedelta(days=1)
                continue
            if today_untouched:
                d = d - timedelta(days=1)
                continue  # today not started yet — skip
            break  # rest day without nutrition hit ends the streak

        workout_done = bool(w_session and w_session not in _NON_TRAINING_SESSION_TYPES)

        if workout_done and nut_hit:
            streak += 1
            d = d - timedelta(days=1)
        elif today_untouched:
            d = d - timedelta(days=1)
            continue  # today not started yet — skip
        else:
            break  # day failed (or explicit 'missed' logged today) — streak ends

    return streak


def get_exercise_history_aliases(
    aliases,
    limit=30
):
    conn = get_conn()

    conditions = []
    params = []

    for alias in aliases:
        conditions.append(
            "LOWER(ws.exercise) LIKE ?"
        )
        params.append(
            f"%{alias.lower()}%"
        )

    where_clause = " OR ".join(conditions)

    query = f"""
        SELECT ws.*, w.date, w.session_type
        FROM workout_sets ws
        JOIN workouts w
            ON ws.workout_id = w.id
        WHERE ({where_clause})
          AND ws.is_warmup = 0
        ORDER BY w.date DESC
        LIMIT ?
    """

    params.append(limit)

    rows = conn.execute(
        query,
        params
    ).fetchall()

    conn.close()

    return [dict(r) for r in rows]


# ─────────────────────────────────────────
#  TRAINING PLAN
# ─────────────────────────────────────────

def save_plan(name, split_type, days_per_week, start_date,
              deload_week=6, mesocycle_number=1, notes=None):
    conn = get_conn()
    conn.execute("UPDATE training_plan SET is_active=0")
    cursor = conn.execute("""
        INSERT INTO training_plan
            (name, split_type, days_per_week, mesocycle_number,
             start_date, end_date, deload_week, notes, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, date(?, '+42 days'), ?, ?, 1, ?)
    """, (name, split_type, days_per_week, mesocycle_number,
          start_date, start_date, deload_week, notes, start_date))
    plan_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return plan_id


def save_plan_day(plan_id, day_name, session_type, order_index):
    conn = get_conn()
    cursor = conn.execute("""
        INSERT INTO plan_days (plan_id, day_name, session_type, order_index)
        VALUES (?, ?, ?, ?)
    """, (plan_id, day_name, session_type, order_index))
    day_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return day_id


def save_plan_exercise(plan_day_id, exercise, sets, reps,
                       rir=None, progression_rule=None,
                       notes=None, order_index=0):
    conn = get_conn()
    conn.execute("""
        INSERT INTO plan_exercises
            (plan_day_id, exercise, sets, reps, rir,
             progression_rule, notes, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (plan_day_id, exercise, sets, reps, rir,
          progression_rule, notes, order_index))
    conn.commit()
    conn.close()


def save_nutrition_targets(plan_id, calories, protein_g, carbs_g, fat_g):
    conn = get_conn()
    conn.execute("UPDATE nutrition_targets SET is_active=0")
    conn.execute("""
        INSERT INTO nutrition_targets
            (plan_id, calories, protein_g, carbs_g, fat_g, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
    """, (plan_id, calories, protein_g, carbs_g, fat_g))
    conn.commit()
    conn.close()


def get_active_plan():
    conn = get_conn()
    row = conn.execute("""
        SELECT * FROM training_plan WHERE is_active=1 LIMIT 1
    """).fetchone()
    conn.close()
    return dict(row) if row else None


def get_plan_days(plan_id):
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM plan_days WHERE plan_id=?
        ORDER BY order_index
    """, (plan_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_plan_exercises(plan_day_id):
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM plan_exercises WHERE plan_day_id=?
        ORDER BY order_index
    """, (plan_day_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_active_nutrition_targets():
    conn = get_conn()
    row = conn.execute("""
        SELECT * FROM nutrition_targets WHERE is_active=1 LIMIT 1
    """).fetchone()
    conn.close()
    return dict(row) if row else None