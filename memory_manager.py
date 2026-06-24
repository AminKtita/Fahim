import sqlite3
import os
import json
from datetime import datetime, date, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "db", "fitness.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


# ─────────────────────────────────────────
#  USER PROFILE
# ─────────────────────────────────────────

def save_profile(name, age, sex, height_cm, weight_start_kg,
                 activity_level, goal_type, injuries=None):
    conn = get_conn()
    conn.execute("""
        INSERT INTO user_profile
            (id, name, age, sex, height_cm, weight_start_kg,
             activity_level, goal_type, injuries)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, age=excluded.age, sex=excluded.sex,
            height_cm=excluded.height_cm, weight_start_kg=excluded.weight_start_kg,
            activity_level=excluded.activity_level, goal_type=excluded.goal_type,
            injuries=excluded.injuries
    """, (name, age, sex, height_cm, weight_start_kg,
          activity_level, goal_type, json.dumps(injuries or [])))
    conn.commit()
    conn.close()


def get_profile():
    conn = get_conn()
    row = conn.execute("SELECT * FROM user_profile WHERE id=1").fetchone()
    conn.close()
    if row:
        d = dict(row)
        d["injuries"] = json.loads(d["injuries"] or "[]")
        return d
    return None


# ─────────────────────────────────────────
#  EXERCISE LIBRARY
# ─────────────────────────────────────────

def get_exercise_library():
    """
    Returns every row in the canonical exercises table, name-sorted, each
    with an `images` field — the full ordered list of {id, source,
    path_or_url, order_index} rows for that exercise (for the flicker
    animation on the card grid). Empty list when no images are set.
    Using the full list here (not just a thumbnail) lets ExerciseFlicker
    animate the card directly without extra per-exercise queries.
    """
    conn = get_conn()
    rows = conn.execute("SELECT * FROM exercises ORDER BY exercise_name ASC").fetchall()
    try:
        image_rows = conn.execute("""
            SELECT exercise_id, id, source, path_or_url, order_index
            FROM exercise_images
            ORDER BY exercise_id, order_index ASC, id ASC
        """).fetchall()
        images_by_exercise = {}
        for r in image_rows:
            eid = r[0]
            if eid not in images_by_exercise:
                images_by_exercise[eid] = []
            images_by_exercise[eid].append({
                "id": r[1], "source": r[2],
                "path_or_url": r[3], "order_index": r[4]
            })
    except Exception:
        images_by_exercise = {}
    conn.close()
    result = [dict(r) for r in rows]
    for r in result:
        r["images"] = images_by_exercise.get(r["exercise_id"], [])
        # keep thumbnail as a convenience alias (first frame) so any
        # code still reading .thumbnail doesn't break
        r["thumbnail"] = r["images"][0] if r["images"] else None
    return result

def get_exercise_by_id(exercise_id):
    """
    Returns one exercises row by exercise_id, enriched with its full
    ordered `images` list (for the detail view / flicker animation), or
    None if not found.
    """
    if not exercise_id:
        return None
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM exercises WHERE exercise_id = ?", (exercise_id,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    result = dict(row)
    result["images"] = get_exercise_images(exercise_id)
    return result


def search_exercise_library(query, limit=10):
    """Simple substring search over exercise_name / exercise_id, for autocomplete."""
    conn = get_conn()
    like = f"%{query.lower()}%"
    rows = conn.execute("""
        SELECT * FROM exercises
        WHERE LOWER(exercise_name) LIKE ? OR LOWER(exercise_id) LIKE ?
        ORDER BY exercise_name ASC LIMIT ?
    """, (like, like, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _slugify_exercise_id(exercise_name: str) -> str:
    """e.g. 'Incline Dumbbell Press' -> 'incline_dumbbell_press'"""
    return "_".join(exercise_name.strip().lower().split())


def create_exercise(exercise_name, body_part=None, movement_pattern=None,
                    primary_muscles=None, secondary_muscles=None, equipment=None,
                    difficulty=None, image_url=None, video_url=None,
                    instructions=None, technique_cues=None, common_mistakes=None,
                    exercise_id=None):
    """
    Adds a new exercise to the library. exercise_id is auto-derived from
    the name if not given. Returns the exercise_id string.
    Raises sqlite3.IntegrityError if the resulting exercise_id already exists.
    """
    exercise_id = exercise_id or _slugify_exercise_id(exercise_name)
    conn = get_conn()
    try:
        conn.execute("""
            INSERT INTO exercises
                (exercise_id, exercise_name, body_part, movement_pattern,
                 primary_muscles, secondary_muscles, equipment, difficulty,
                 image_url, video_url, instructions, technique_cues, common_mistakes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (exercise_id, exercise_name, body_part, movement_pattern,
              primary_muscles, secondary_muscles, equipment, difficulty,
              image_url, video_url, instructions, technique_cues, common_mistakes))
        conn.commit()
    finally:
        conn.close()
    return exercise_id


def update_exercise(exercise_id, **fields):
    """
    Updates one or more fields on an existing exercise. Pass only the
    fields you want to change.
    """
    allowed = {
        "exercise_name", "body_part", "movement_pattern", "primary_muscles",
        "secondary_muscles", "equipment", "difficulty", "image_url",
        "video_url", "instructions", "technique_cues", "common_mistakes",
    }
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not updates:
        return
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [exercise_id]
    conn = get_conn()
    conn.execute(f"UPDATE exercises SET {set_clause} WHERE exercise_id = ?", values)
    conn.commit()
    conn.close()


def delete_exercise(exercise_id):
    """
    Deletes an exercise from the library. Any workout_sets/plan_exercises
    rows that referenced it have exercise_id cleared to NULL. Any
    associated exercise_images rows are also deleted (uploaded files on
    disk are removed by the API route, not here).
    """
    conn = get_conn()
    conn.execute("UPDATE workout_sets SET exercise_id = NULL WHERE exercise_id = ?", (exercise_id,))
    conn.execute("UPDATE plan_exercises SET exercise_id = NULL WHERE exercise_id = ?", (exercise_id,))
    conn.execute("DELETE FROM exercise_images WHERE exercise_id = ?", (exercise_id,))
    conn.execute("DELETE FROM exercises WHERE exercise_id = ?", (exercise_id,))
    conn.commit()
    conn.close()


# ─────────────────────────────────────────
#  EXERCISE IMAGES (multi-frame "flicker" animation)
# ─────────────────────────────────────────

def get_exercise_images(exercise_id):
    """Returns all images for an exercise, in display order."""
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT * FROM exercise_images
            WHERE exercise_id = ?
            ORDER BY order_index ASC, id ASC
        """, (exercise_id,)).fetchall()
    except Exception:
        rows = []
    conn.close()
    return [dict(r) for r in rows]


def add_exercise_image(exercise_id, source, path_or_url, order_index=None):
    """
    Adds one image frame to an exercise.
    source: 'upload' (relative path under db/exercise_images/) or 'url'.
    Returns the new image row id.
    """
    conn = get_conn()
    if order_index is None:
        row = conn.execute(
            "SELECT COALESCE(MAX(order_index), -1) + 1 FROM exercise_images WHERE exercise_id = ?",
            (exercise_id,)
        ).fetchone()
        order_index = row[0]
    cur = conn.execute("""
        INSERT INTO exercise_images (exercise_id, source, path_or_url, order_index)
        VALUES (?, ?, ?, ?)
    """, (exercise_id, source, path_or_url, order_index))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id


def delete_exercise_image(image_id):
    """
    Deletes one image row by id. Returns the deleted row dict (so the
    caller can remove the file from disk if source='upload'), or None.
    """
    conn = get_conn()
    row = conn.execute("SELECT * FROM exercise_images WHERE id = ?", (image_id,)).fetchone()
    if row:
        conn.execute("DELETE FROM exercise_images WHERE id = ?", (image_id,))
        conn.commit()
    conn.close()
    return dict(row) if row else None


def reorder_exercise_images(exercise_id, ordered_image_ids):
    """Sets order_index for each image id in the given order (0-based)."""
    conn = get_conn()
    for i, image_id in enumerate(ordered_image_ids):
        conn.execute(
            "UPDATE exercise_images SET order_index = ? WHERE id = ? AND exercise_id = ?",
            (i, image_id, exercise_id)
        )
    conn.commit()
    conn.close()


# ─────────────────────────────────────────
#  WORKOUTS
# ─────────────────────────────────────────

def log_workout(session_date, session_type, duration_min=None,
                perceived_effort=None, notes=None):
    """Creates a workout session record. Returns the new workout_id."""
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
            weight_kg, rpe=None, is_warmup=False, notes=None,
            exercise_id=None):
    """
    Logs one set inside a workout session.
    exercise: free-text display name (always stored).
    exercise_id: optional link to the canonical exercises library row.
    """
    conn = get_conn()
    conn.execute("""
        INSERT INTO workout_sets
            (workout_id, exercise, exercise_id, set_number, reps,
             weight_kg, rpe, is_warmup, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (workout_id, exercise, exercise_id, set_number, reps,
          weight_kg, rpe, int(is_warmup), notes))
    conn.commit()
    conn.close()


def get_workouts(days=7):
    """Returns all workout sessions from the last N days."""
    since = (date.today() - timedelta(days=days)).isoformat()
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM workouts WHERE date >= ? ORDER BY date DESC
    """, (since,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_sets_for_workout(workout_id):
    """
    Returns all sets for a given workout_id, enriched with exercise
    library metadata via JOIN when the set is linked to the library.
    """
    conn = get_conn()
    rows = conn.execute("""
        SELECT ws.*,
               ex.exercise_name, ex.body_part, ex.movement_pattern,
               ex.primary_muscles, ex.secondary_muscles, ex.equipment,
               ex.difficulty, ex.image_url, ex.video_url,
               ex.instructions, ex.technique_cues, ex.common_mistakes
        FROM workout_sets ws
        LEFT JOIN exercises ex ON ws.exercise_id = ex.exercise_id
        WHERE ws.workout_id = ?
        ORDER BY ws.exercise, ws.set_number
    """, (workout_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_exercise_history(exercise, limit=10):
    """
    Returns the last N logged sessions for a specific exercise.
    Matches on exercise_id (exact) or free-text exercise name (case-insensitive).
    """
    conn = get_conn()
    rows = conn.execute("""
        SELECT ws.*, w.date, w.session_type,
               ex.exercise_name, ex.body_part, ex.equipment, ex.image_url
        FROM workout_sets ws
        JOIN workouts w ON ws.workout_id = w.id
        LEFT JOIN exercises ex ON ws.exercise_id = ex.exercise_id
        WHERE (ws.exercise_id = ? OR LOWER(ws.exercise) = LOWER(?))
          AND ws.is_warmup = 0
        ORDER BY w.date DESC, ws.set_number ASC
        LIMIT ?
    """, (exercise, exercise, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_exercise_history_aliases(aliases, limit=30):
    conn = get_conn()
    conditions = ["LOWER(ws.exercise) LIKE ?" for _ in aliases]
    params = [f"%{a.lower()}%" for a in aliases]
    where_clause = " OR ".join(conditions)
    query = f"""
        SELECT ws.*, w.date, w.session_type
        FROM workout_sets ws
        JOIN workouts w ON ws.workout_id = w.id
        WHERE ({where_clause}) AND ws.is_warmup = 0
        ORDER BY w.date DESC LIMIT ?
    """
    params.append(limit)
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────
#  NUTRITION
# ─────────────────────────────────────────

def log_nutrition(log_date, calories=None, protein_g=None,
                  carbs_g=None, fat_g=None, water_ml=None, notes=None):
    conn = get_conn()
    conn.execute("""
        INSERT INTO nutrition_log
            (date, calories, protein_g, carbs_g, fat_g, water_ml, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            calories=excluded.calories, protein_g=excluded.protein_g,
            carbs_g=excluded.carbs_g, fat_g=excluded.fat_g,
            water_ml=excluded.water_ml, notes=excluded.notes
    """, (log_date, calories, protein_g, carbs_g, fat_g, water_ml, notes))
    conn.commit()
    conn.close()


def get_nutrition(days=7):
    since = (date.today() - timedelta(days=days)).isoformat()
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM nutrition_log WHERE date >= ? ORDER BY date DESC
    """, (since,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────
#  BODY METRICS
# ─────────────────────────────────────────

def log_body_metrics(log_date, weight_kg=None, body_fat_pct=None,
                     waist_cm=None, chest_cm=None, hips_cm=None,
                     arm_cm=None, thigh_cm=None, notes=None):
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
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM body_metrics ORDER BY date DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_weight_trend(days=30):
    since = (date.today() - timedelta(days=days)).isoformat()
    conn = get_conn()
    rows = conn.execute("""
        SELECT date, weight_kg FROM body_metrics
        WHERE date >= ? AND weight_kg IS NOT NULL ORDER BY date ASC
    """, (since,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────
#  GOALS
# ─────────────────────────────────────────

def save_goal(title, metric, target_value, deadline=None, current_value=None):
    conn = get_conn()
    conn.execute("""
        INSERT INTO goals (title, metric, target_value, current_value, deadline, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (title, metric, target_value, current_value,
          deadline, date.today().isoformat()))
    conn.commit()
    conn.close()


def update_goal_progress(goal_id, current_value, status=None):
    conn = get_conn()
    if status:
        conn.execute(
            "UPDATE goals SET current_value=?, status=? WHERE id=?",
            (current_value, status, goal_id)
        )
    else:
        conn.execute(
            "UPDATE goals SET current_value=? WHERE id=?",
            (current_value, goal_id)
        )
    conn.commit()
    conn.close()


def get_goals(status="active"):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM goals WHERE status=? ORDER BY deadline ASC", (status,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────
#  STREAK COMPUTATION
# ─────────────────────────────────────────

_DAY_NAME_TO_WEEKDAY = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
    "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6,
}

_NUTRITION_OFF_PLAN_SENTINEL = "__MISSED__"
_NON_TRAINING_SESSION_TYPES = {"missed", "rest"}


def _is_planned_rest_day(iso_date, plan_days_by_weekday):
    if not plan_days_by_weekday:
        return False
    wd = date.fromisoformat(iso_date).weekday()
    return wd not in plan_days_by_weekday


def _nutrition_status(n, targets):
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
        if filled == 4: return "hit"
        if filled > 0:  return "partial"
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
    filled  = sum(1 for v in (cal, prot, carb, fat) if v is not None and v > 0)
    if cal_ok and prot_ok and carb_ok and fat_ok and filled == 4:
        return "hit"
    if t_cal > 0 and cal < t_cal * 0.70:
        return "off"
    return "partial"


def compute_streak():
    plan    = get_active_plan()
    targets = get_active_nutrition_targets()
    plan_days_by_weekday = {}
    if plan:
        for pd in get_plan_days(plan["id"]):
            wd = _DAY_NAME_TO_WEEKDAY.get((pd.get("day_name") or "").lower())
            if wd is not None:
                plan_days_by_weekday[wd] = pd
    workouts  = get_workouts(days=120)
    nutrition = get_nutrition(days=120)
    w_map = {w["date"]: w for w in workouts}
    n_map = {n["date"]: n for n in nutrition}
    streak = 0
    d = date.today()
    for i in range(120):
        iso      = d.isoformat()
        is_rest  = _is_planned_rest_day(iso, plan_days_by_weekday)
        nut_status = _nutrition_status(n_map.get(iso), targets)
        nut_hit  = nut_status == "hit"
        w        = w_map.get(iso)
        w_session = (w.get("session_type") or "").lower() if w else None
        today_untouched = (i == 0 and nut_status is None and w_session is None)
        if is_rest:
            if nut_hit:
                streak += 1; d = d - timedelta(days=1); continue
            if today_untouched:
                d = d - timedelta(days=1); continue
            break
        workout_done = bool(w_session and w_session not in _NON_TRAINING_SESSION_TYPES)
        if workout_done and nut_hit:
            streak += 1; d = d - timedelta(days=1)
        elif today_untouched:
            d = d - timedelta(days=1); continue
        else:
            break
    return streak


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
                       notes=None, order_index=0, exercise_id=None,
                       rest_sec=None, tempo=None):
    """
    Adds one exercise prescription to a plan day.
    exercise: free-text display name (always stored).
    exercise_id: optional link to the canonical exercises library row.
    rest_sec/tempo: program-specific, stored per-row.
    """
    conn = get_conn()
    conn.execute("""
        INSERT INTO plan_exercises
            (plan_day_id, exercise, exercise_id, sets, reps, rir,
             rest_sec, tempo, progression_rule, notes, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (plan_day_id, exercise, exercise_id, sets, reps, rir,
          rest_sec, tempo, progression_rule, notes, order_index))
    conn.commit()
    conn.close()


def save_full_plan(plan_json: dict) -> int:
    """
    Saves a complete plan from a single [LOG_DATA] {"type": "plan", ...}
    block. Returns the new plan_id.
    """
    plan_id = save_plan(
        name=plan_json.get("name", "Untitled plan"),
        split_type=plan_json.get("split_type"),
        days_per_week=plan_json.get("days_per_week"),
        start_date=plan_json["start_date"],
        deload_week=plan_json.get("deload_week", 6),
        mesocycle_number=plan_json.get("mesocycle_number", 1),
        notes=plan_json.get("notes"),
    )
    for day in plan_json.get("days", []):
        day_id = save_plan_day(
            plan_id=plan_id,
            day_name=day.get("day_name"),
            session_type=day.get("session_type"),
            order_index=day.get("order_index", 0),
        )
        for i, ex in enumerate(day.get("exercises", []), 1):
            candidate_id = ex.get("exercise_id")
            linked_id = candidate_id if (candidate_id and get_exercise_by_id(candidate_id)) else None
            save_plan_exercise(
                plan_day_id=day_id,
                exercise=ex.get("exercise_name") or ex.get("exercise_id") or "exercise",
                exercise_id=linked_id,
                sets=ex.get("sets"),
                reps=str(ex.get("reps")) if ex.get("reps") is not None else None,
                rir=ex.get("rir"),
                rest_sec=ex.get("rest_sec"),
                tempo=ex.get("tempo"),
                progression_rule=ex.get("progression_rule"),
                notes=None,
                order_index=ex.get("order_index", i),
            )
    targets = plan_json.get("nutrition_targets")
    if targets:
        save_nutrition_targets(
            plan_id=plan_id,
            calories=targets.get("calories"),
            protein_g=targets.get("protein_g"),
            carbs_g=targets.get("carbs_g"),
            fat_g=targets.get("fat_g"),
        )
    return plan_id


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
    row = conn.execute(
        "SELECT * FROM training_plan WHERE is_active=1 LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_plan_days(plan_id):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM plan_days WHERE plan_id=? ORDER BY order_index", (plan_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_plan_exercises(plan_day_id):
    """
    Returns all exercise prescriptions for a plan day, enriched with
    exercise library metadata via JOIN, plus a `thumbnail` field (first
    image) for list display.
    """
    conn = get_conn()
    rows = conn.execute("""
        SELECT pe.*,
               ex.exercise_name, ex.body_part, ex.movement_pattern,
               ex.primary_muscles, ex.secondary_muscles, ex.equipment,
               ex.difficulty, ex.image_url, ex.video_url,
               ex.instructions, ex.technique_cues, ex.common_mistakes
        FROM plan_exercises pe
        LEFT JOIN exercises ex ON pe.exercise_id = ex.exercise_id
        WHERE pe.plan_day_id=?
        ORDER BY pe.order_index
    """, (plan_day_id,)).fetchall()

    try:
        image_rows = conn.execute("""
            SELECT exercise_id, id, source, path_or_url, order_index
            FROM exercise_images
            ORDER BY exercise_id, order_index ASC, id ASC
        """).fetchall()
        images_by_exercise = {}
        for r in image_rows:
            eid = r[0]
            if eid not in images_by_exercise:
                images_by_exercise[eid] = []
            images_by_exercise[eid].append({
                "id": r[1], "source": r[2],
                "path_or_url": r[3], "order_index": r[4]
            })
    except Exception:
        images_by_exercise = {}
    conn.close()
    result = [dict(r) for r in rows]
    for r in result:
        r["images"] = images_by_exercise.get(r["exercise_id"], [])
        r["thumbnail"] = r["images"][0] if r["images"] else None
    return result


def get_active_nutrition_targets():
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM nutrition_targets WHERE is_active=1 LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None