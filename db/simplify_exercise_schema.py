"""
simplify_exercise_schema.py
----------------------------
Run this ONCE, after you've already run apply_exercise_migration.py.

What it does:
  1. Backs up db/fitness.db before touching anything.
  2. WIPES all rows from workout_sets and plan_exercises (you confirmed
     this — fresh start, old history is not preserved).
  3. Rebuilds workout_sets and plan_exercises with a LEAN schema:
       - keeps: exercise (free-text fallback), exercise_id (FK to the
         exercises library, nullable)
       - drops: exercise_name, rest_sec, tempo, target_body_part,
         movement_pattern, primary_muscles, secondary_muscles,
         equipment, image_url, video_url, and (plan_exercises only)
         body_part
     All of that metadata now lives in exactly one place: the
     `exercises` table. Anything that needs it does a JOIN on
     exercise_id at read time instead of storing a stale copy.
  4. `workouts`, `training_plan`, `plan_days`, `exercises` are
     untouched — only workout_sets and plan_exercises are rebuilt.

SQLite can't reliably DROP COLUMN across all versions, so this uses the
standard safe pattern: create a new lean table, drop the old one,
rename the new one into place.

Usage:
    python scripts\\simplify_exercise_schema.py
    python scripts\\simplify_exercise_schema.py --db path\\to\\fitness.db
"""

import sqlite3
import shutil
import sys
import argparse
from pathlib import Path
from datetime import datetime


def find_db_path(explicit_path):
    if explicit_path:
        p = Path(explicit_path)
        if not p.exists():
            sys.exit(f"ERROR: no file found at {p}")
        return p
    candidate = Path(__file__).resolve().parent.parent / "db" / "fitness.db"
    if candidate.exists():
        return candidate
    candidate2 = Path.cwd() / "db" / "fitness.db"
    if candidate2.exists():
        return candidate2
    sys.exit(
        "ERROR: could not find db/fitness.db.\n"
        "Run this from your Fahim project root, or pass --db explicitly."
    )


def backup_db(db_path):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = db_path.with_name(f"{db_path.stem}.backup_{timestamp}{db_path.suffix}")
    shutil.copy2(db_path, backup_path)
    return backup_path


def table_exists(conn, name):
    return conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def get_columns(conn, table_name):
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table_name})")}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=None)
    parser.add_argument("--no-backup", action="store_true")
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
        for required in ("workout_sets", "plan_exercises", "exercises"):
            if not table_exists(conn, required):
                sys.exit(f"ERROR: '{required}' table not found — is this the right database? No changes made.")

        pe_cols = get_columns(conn, "plan_exercises")
        already_lean = "exercise_id" in pe_cols and "image_url" not in pe_cols

        if already_lean and "rest_sec" in pe_cols and "tempo" in pe_cols:
            actions.append("plan_exercises: already lean with rest_sec/tempo — nothing to do")
            conn.commit()
            print("\n--- Migration summary ---")
            for a in actions:
                print(f"  - {a}")
            print("\nDatabase is already up to date.")
            return

        if already_lean:
            # Already simplified by a previous run of this script, just missing
            # rest_sec/tempo — add them additively instead of wiping again.
            if "rest_sec" not in pe_cols:
                conn.execute("ALTER TABLE plan_exercises ADD COLUMN rest_sec INTEGER")
                actions.append("plan_exercises.rest_sec: ADDED (additive, no data wiped)")
            if "tempo" not in pe_cols:
                conn.execute("ALTER TABLE plan_exercises ADD COLUMN tempo TEXT")
                actions.append("plan_exercises.tempo: ADDED (additive, no data wiped)")
            conn.commit()
            print("\n--- Migration summary ---")
            for a in actions:
                print(f"  - {a}")
            print("\nDone.")
            return

        before_ws = conn.execute("SELECT COUNT(*) FROM workout_sets").fetchone()[0]
        before_pe = conn.execute("SELECT COUNT(*) FROM plan_exercises").fetchone()[0]

        conn.execute("PRAGMA foreign_keys=OFF")

        # ── workout_sets: rebuild lean ──────────────────────────────
        conn.execute("""
            CREATE TABLE workout_sets_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id INTEGER REFERENCES workouts(id),
                exercise TEXT NOT NULL,
                exercise_id TEXT REFERENCES exercises(exercise_id),
                set_number INTEGER,
                reps INTEGER,
                weight_kg REAL,
                rpe INTEGER,
                is_warmup BOOLEAN DEFAULT 0,
                notes TEXT
            )
        """)
        conn.execute("DROP TABLE workout_sets")
        conn.execute("ALTER TABLE workout_sets_new RENAME TO workout_sets")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_id ON workout_sets(exercise_id)")
        actions.append(f"workout_sets: rebuilt with lean schema, {before_ws} old row(s) wiped")

        # ── plan_exercises: rebuild lean (keeps rest_sec/tempo — these are
        # per-prescription, not per-exercise: the same library exercise can
        # have different rest/tempo across different plans/mesocycles) ──
        conn.execute("""
            CREATE TABLE plan_exercises_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_day_id INTEGER REFERENCES plan_days(id),
                exercise TEXT,
                exercise_id TEXT REFERENCES exercises(exercise_id),
                sets INTEGER,
                reps TEXT,
                rir INTEGER,
                rest_sec INTEGER,
                tempo TEXT,
                progression_rule TEXT,
                notes TEXT,
                order_index INTEGER
            )
        """)
        conn.execute("DROP TABLE plan_exercises")
        conn.execute("ALTER TABLE plan_exercises_new RENAME TO plan_exercises")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_plan_exercises_exercise_id ON plan_exercises(exercise_id)")
        actions.append(f"plan_exercises: rebuilt with lean schema (+ rest_sec, tempo), {before_pe} old row(s) wiped")

        conn.execute("PRAGMA foreign_keys=ON")
        conn.commit()

    except Exception:
        conn.rollback()
        conn.close()
        print("\nSomething went wrong — changes rolled back.")
        print(f"Your original database is safe in the backup at: {db_path}")
        raise
    finally:
        conn.close()

    print("\n--- Migration summary ---")
    for a in actions:
        print(f"  - {a}")
    print("\nDone. workout_sets and plan_exercises now only store exercise_id")
    print("(+ free-text exercise as fallback) — all other exercise metadata")
    print("comes from a JOIN against the exercises table at read time.")


if __name__ == "__main__":
    main()
