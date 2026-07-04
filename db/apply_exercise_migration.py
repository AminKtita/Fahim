"""
apply_exercise_migration.py
----------------------------
Run this ONCE from inside your Fahim project root (same folder that
contains db/fitness.db) to apply the exercise-library migration to your
real database.

What it does, in order:
  1. Finds db/fitness.db relative to this script (or wherever you point it).
  2. Makes a timestamped backup copy before touching anything.
  3. Checks what's already there — tables/columns that already exist are
     skipped, so this is safe to run more than once.
  4. Adds the `exercises` table, the new columns on workout_sets and
     plan_exercises, backfills exercise_id/exercise_name from the old
     `exercise` text column, adds indexes.
  5. Seeds the 12 starter exercises (also safe to re-run — uses
     INSERT OR IGNORE, so it won't duplicate or overwrite rows you've
     since edited).
  6. Prints a clear summary of what it did.

Usage:
    python apply_exercise_migration.py
    python apply_exercise_migration.py --db path\to\fitness.db   (optional override)
"""

import sqlite3
import shutil
import sys
import argparse
from pathlib import Path
from datetime import datetime


def find_db_path(explicit_path: str | None) -> Path:
    if explicit_path:
        p = Path(explicit_path)
        if not p.exists():
            sys.exit(f"ERROR: no file found at {p}")
        return p

    # default: db/fitness.db relative to this script's location
    candidate = Path(__file__).resolve().parent / "db" / "fitness.db"
    if candidate.exists():
        return candidate

    # fallback: db/fitness.db relative to current working directory
    candidate2 = Path.cwd() / "db" / "fitness.db"
    if candidate2.exists():
        return candidate2

    sys.exit(
        "ERROR: could not find db/fitness.db.\n"
        "Run this script from your Fahim project root, or pass the path explicitly:\n"
        "    python apply_exercise_migration.py --db \"C:\\Users\\AMIN\\Desktop\\Fahim\\db\\fitness.db\""
    )


def backup_db(db_path: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = db_path.with_name(f"{db_path.stem}.backup_{timestamp}{db_path.suffix}")
    shutil.copy2(db_path, backup_path)
    return backup_path


def table_exists(conn, table_name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
    ).fetchone()
    return row is not None


def get_columns(conn, table_name: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table_name})")}


def index_exists(conn, index_name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name=?", (index_name,)
    ).fetchone()
    return row is not None


WORKOUT_SETS_NEW_COLUMNS = [
    ("exercise_id", "TEXT"),
    ("exercise_name", "TEXT"),
    ("rest_sec", "INTEGER"),
    ("tempo", "TEXT"),
    ("target_body_part", "TEXT"),
    ("movement_pattern", "TEXT"),
    ("primary_muscles", "TEXT"),
    ("secondary_muscles", "TEXT"),
    ("equipment", "TEXT"),
    ("image_url", "TEXT"),
    ("video_url", "TEXT"),
]

PLAN_EXERCISES_NEW_COLUMNS = [
    ("exercise_id", "TEXT"),
    ("exercise_name", "TEXT"),
    ("rest_sec", "INTEGER"),
    ("tempo", "TEXT"),
    ("target_body_part", "TEXT"),
    ("movement_pattern", "TEXT"),
    ("body_part", "TEXT"),
    ("primary_muscles", "TEXT"),
    ("secondary_muscles", "TEXT"),
    ("equipment", "TEXT"),
    ("image_url", "TEXT"),
    ("video_url", "TEXT"),
]

EXERCISES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id TEXT UNIQUE NOT NULL,
    exercise_name TEXT NOT NULL,
    body_part TEXT,
    movement_pattern TEXT,
    primary_muscles TEXT,
    secondary_muscles TEXT,
    equipment TEXT,
    difficulty TEXT,
    image_url TEXT,
    video_url TEXT,
    instructions TEXT,
    technique_cues TEXT,
    common_mistakes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""

SEED_EXERCISES_SQL = """
INSERT OR IGNORE INTO exercises (
    exercise_id, exercise_name, body_part, movement_pattern,
    primary_muscles, secondary_muscles, equipment, difficulty,
    image_url, video_url, instructions, technique_cues, common_mistakes
) VALUES
('bench_press','bench press','chest','horizontal push',
 '["pectoralis major","triceps brachii"]','["anterior deltoid","serratus anterior"]',
 'barbell','intermediate',NULL,NULL,
 'Lie on bench, set shoulders, lower bar to lower chest, press to lockout.',
 '["shoulder blades retracted","feet planted","bar path controlled"]',
 '["bouncing bar","elbows too flared","losing upper-back tension"]'),

('dumbbell_shoulder_press','dumbbell shoulder press','shoulders','vertical push',
 '["deltoids"]','["triceps brachii","upper chest"]',
 'dumbbell','beginner',NULL,NULL,
 'Press dumbbells overhead with controlled range and stable torso.',
 '["ribs down","wrists stacked","press in a smooth line"]',
 '["overarching lower back","half reps","letting elbows drift"]'),

('tricep_pushdown','tricep pushdown','triceps','elbow extension',
 '["triceps brachii"]','[]',
 'cable','beginner',NULL,NULL,
 'Keep elbows pinned and extend fully without swinging.',
 '["elbows fixed","full lockout","control the return"]',
 '["using bodyweight","moving elbows forward","cutting ROM short"]'),

('lateral_raise','lateral raise','shoulders','shoulder abduction',
 '["middle deltoid"]','["upper trapezius","supraspinatus"]',
 'dumbbell','beginner',NULL,NULL,
 'Raise arms out to the side with slight elbow bend and strict control.',
 '["lead with elbows","neutral torso","small pause at top"]',
 '["swinging","shrugging","turning it into a front raise"]'),

('lat_pulldown','lat pulldown','back','vertical pull',
 '["latissimus dorsi"]','["biceps","rear delts","lower traps"]',
 'machine','beginner',NULL,NULL,
 'Pull bar to upper chest while keeping torso stable.',
 '["chest tall","pull elbows down","control the eccentric"]',
 '["leaning too far back","pulling behind neck","jerking the stack"]'),

('seated_cable_row','seated cable row','back','horizontal pull',
 '["latissimus dorsi","rhomboids"]','["biceps","rear delts","mid traps"]',
 'cable','beginner',NULL,NULL,
 'Row handle to torso with neutral spine and squeeze between shoulder blades.',
 '["neutral spine","elbows drive back","pause in contraction"]',
 '["leaning back hard","hunching shoulders","short range"]'),

('face_pull','face pull','rear delts','horizontal pull',
 '["rear deltoids","mid traps","lower traps"]','["rotator cuff"]',
 'cable','beginner',NULL,NULL,
 'Pull rope toward face with elbows high and external rotation.',
 '["rope to eye level","separate hands at end","control the return"]',
 '["using lower back","turning it into a row","dropping elbows"]'),

('dumbbell_bicep_curl','dumbbell bicep curl','biceps','elbow flexion',
 '["biceps brachii"]','["brachialis","brachioradialis"]',
 'dumbbell','beginner',NULL,NULL,
 'Curl without swinging and lower under control.',
 '["elbows close to sides","full supination","slow eccentric"]',
 '["swinging torso","half reps","elbows drifting forward"]'),

('goblet_squat','goblet squat','legs','squat',
 '["quadriceps","glutes"]','["adductors","core","hamstrings"]',
 'dumbbell','beginner',NULL,NULL,
 'Hold weight at chest, sit between hips, keep torso upright.',
 '["knees track over toes","brace core","full depth you can control"]',
 '["heels lifting","knees collapsing","rounding lower back"]'),

('leg_press','leg press','legs','squat',
 '["quadriceps","glutes"]','["hamstrings","adductors"]',
 'machine','beginner',NULL,NULL,
 'Lower platform with control and press through full foot.',
 '["lower with control","no knee lockout slam","keep hips down"]',
 '["too much depth causing pelvis tuck","locking knees hard","short ROM"]'),

('leg_curl','leg curl','hamstrings','knee flexion',
 '["hamstrings"]','["gastrocnemius"]',
 'machine','beginner',NULL,NULL,
 'Curl smoothly, squeeze hamstrings, and resist the return.',
 '["full squeeze","slow eccentric","hips stay planted"]',
 '["using momentum","partial range","lifting hips"]'),

('calf_raise','calf raise','calves','ankle plantarflexion',
 '["gastrocnemius","soleus"]','[]',
 'machine','beginner',NULL,NULL,
 'Use full stretch and full peak contraction.',
 '["pause at bottom","pause at top","full ROM"]',
 '["bouncing","short reps","not reaching stretch"]');
"""


def main():
    parser = argparse.ArgumentParser(description="Apply exercise-library migration to db/fitness.db")
    parser.add_argument("--db", default=None, help="Explicit path to fitness.db (optional)")
    parser.add_argument("--no-backup", action="store_true", help="Skip the backup copy (not recommended)")
    args = parser.parse_args()

    db_path = find_db_path(args.db)
    print(f"Target database: {db_path}")

    if not args.no_backup:
        backup_path = backup_db(db_path)
        print(f"Backup created:  {backup_path}")
    else:
        print("Skipping backup (--no-backup passed).")

    conn = sqlite3.connect(str(db_path))
    actions = []

    try:
        # Validate this looks like a real Fahim database BEFORE changing anything.
        for required_table in ("workout_sets", "plan_exercises"):
            if not table_exists(conn, required_table):
                sys.exit(
                    f"ERROR: '{required_table}' table not found in {db_path}.\n"
                    "This doesn't look like a Fahim database — no changes were made."
                )

        # 1) exercises table
        if table_exists(conn, "exercises"):
            actions.append("exercises table: already exists, left as-is")
        else:
            conn.execute(EXERCISES_TABLE_SQL)
            actions.append("exercises table: CREATED")

        # 2) workout_sets new columns
        existing_cols = get_columns(conn, "workout_sets")
        for col_name, col_type in WORKOUT_SETS_NEW_COLUMNS:
            if col_name in existing_cols:
                actions.append(f"workout_sets.{col_name}: already exists, skipped")
            else:
                conn.execute(f"ALTER TABLE workout_sets ADD COLUMN {col_name} {col_type}")
                actions.append(f"workout_sets.{col_name}: ADDED")

        # 3) plan_exercises new columns
        existing_cols = get_columns(conn, "plan_exercises")
        for col_name, col_type in PLAN_EXERCISES_NEW_COLUMNS:
            if col_name in existing_cols:
                actions.append(f"plan_exercises.{col_name}: already exists, skipped")
            else:
                conn.execute(f"ALTER TABLE plan_exercises ADD COLUMN {col_name} {col_type}")
                actions.append(f"plan_exercises.{col_name}: ADDED")

        conn.commit()  # commit schema changes before backfill so PRAGMA-visible columns are usable

        # 4) backfill exercise_id / exercise_name from the old `exercise` text column
        before = conn.execute(
            "SELECT COUNT(*) FROM workout_sets WHERE exercise_id IS NULL"
        ).fetchone()[0]
        conn.execute("""
            UPDATE workout_sets
            SET exercise_id = COALESCE(exercise_id, exercise),
                exercise_name = COALESCE(exercise_name, replace(exercise, '_', ' '))
        """)
        after = conn.execute(
            "SELECT COUNT(*) FROM workout_sets WHERE exercise_id IS NULL"
        ).fetchone()[0]
        actions.append(f"workout_sets backfilled: {before - after} row(s) given exercise_id/exercise_name")

        before = conn.execute(
            "SELECT COUNT(*) FROM plan_exercises WHERE exercise_id IS NULL"
        ).fetchone()[0]
        conn.execute("""
            UPDATE plan_exercises
            SET exercise_id = COALESCE(exercise_id, exercise),
                exercise_name = COALESCE(exercise_name, replace(exercise, '_', ' '))
        """)
        after = conn.execute(
            "SELECT COUNT(*) FROM plan_exercises WHERE exercise_id IS NULL"
        ).fetchone()[0]
        actions.append(f"plan_exercises backfilled: {before - after} row(s) given exercise_id/exercise_name")

        # 5) indexes
        for idx_name, idx_sql in [
            ("idx_exercises_exercise_id", "CREATE INDEX IF NOT EXISTS idx_exercises_exercise_id ON exercises(exercise_id)"),
            ("idx_workout_sets_exercise_id", "CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_id ON workout_sets(exercise_id)"),
            ("idx_plan_exercises_exercise_id", "CREATE INDEX IF NOT EXISTS idx_plan_exercises_exercise_id ON plan_exercises(exercise_id)"),
        ]:
            already = index_exists(conn, idx_name)
            conn.execute(idx_sql)
            actions.append(f"index {idx_name}: {'already existed' if already else 'CREATED'}")

        # 6) seed the 12 starter exercises (INSERT OR IGNORE — safe to re-run)
        before_count = conn.execute("SELECT COUNT(*) FROM exercises").fetchone()[0]
        conn.executescript(SEED_EXERCISES_SQL)
        after_count = conn.execute("SELECT COUNT(*) FROM exercises").fetchone()[0]
        actions.append(f"exercise library seed: {after_count - before_count} new row(s) inserted "
                        f"({after_count} total in exercises table)")

        conn.commit()

    except Exception:
        conn.rollback()
        conn.close()
        print("\nSomething went wrong — no changes were committed beyond what's listed above.")
        print(f"Your original database is safe in the backup at: {db_path}")
        raise
    finally:
        conn.close()

    print("\n--- Migration summary ---")
    for a in actions:
        print(f"  - {a}")
    print("\nDone. You can now start the API normally.")


if __name__ == "__main__":
    main()
