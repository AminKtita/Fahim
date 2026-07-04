"""
restore_from_old_backup.py
----------------------------
Restores workout_sets and plan_exercises history from an OLD backup
database (pre-exercise-library schema: just exercise/set_number/reps/
weight_kg/rpe/is_warmup/notes, exercise/sets/reps/rir/progression_rule
columns, no exercise_id anywhere) into your CURRENT live database,
which has the lean post-migration schema (exercise + exercise_id, with
metadata fetched via JOIN against the exercises library).

IMPORTANT — why this doesn't just copy rows verbatim:
The backup's workout_id / plan_day_id foreign keys point at the
BACKUP's own workouts/plan_days rows. Your live workouts/plan_days
table may have different IDs for the same real session (e.g. id 27
in the backup vs id 28 live, even though it's the same date/session) —
both workouts and plan_days tables were NOT wiped by the
schema-simplification script, so they may have drifted independently
since the backup was taken. Copying raw IDs across would silently
attach sets to the wrong workout, or to nothing at all.

So this script matches:
  - workouts:   by (date, session_type)   — backup row -> live row
  - plan_days:  by (plan_id, day_name)    — uses the CURRENTLY ACTIVE
                live training_plan's id, since plan_id in the old
                backup refers to the backup's own (possibly different)
                training_plan rows
and only then copies the corresponding workout_sets / plan_exercises
rows in, translating the old free-text `exercise` value into
`exercise_id` whenever it exactly matches a row in your current
exercises library (case-insensitive) — otherwise it's kept as
free text with exercise_id left NULL, same as the dashboard's
autocomplete-with-freetext behavior.

Anything in the backup that can't be matched (no corresponding live
workout/plan_day) is REPORTED, not silently dropped or guessed.

Usage:
    python scripts\\restore_from_old_backup.py --backup path\\to\\old_backup.db --dry-run
    python scripts\\restore_from_old_backup.py --backup path\\to\\old_backup.db
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
    sys.exit("ERROR: could not find your live db/fitness.db. Run from the Fahim project root, or pass --db explicitly.")


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
    parser.add_argument("--backup", required=True, help="Path to the OLD backup .db file")
    parser.add_argument("--db", default=None, help="Path to your live fitness.db (optional, auto-detected)")
    parser.add_argument("--dry-run", action="store_true", help="Report what would happen without writing anything")
    parser.add_argument("--no-backup", action="store_true", help="Skip backing up the live db first (not recommended)")
    args = parser.parse_args()

    backup_path = Path(args.backup)
    if not backup_path.exists():
        sys.exit(f"ERROR: backup file not found at {backup_path}")

    live_path = find_db_path(args.db)
    print(f"Live database:   {live_path}")
    print(f"Old backup:      {backup_path}")
    print(f"Mode:            {'DRY RUN (no changes will be written)' if args.dry_run else 'LIVE — will write changes'}")

    if not args.dry_run and not args.no_backup:
        safety_backup = backup_db(live_path)
        print(f"Safety backup of live db created: {safety_backup}")

    old_conn = sqlite3.connect(str(backup_path))
    old_conn.row_factory = sqlite3.Row
    live_conn = sqlite3.connect(str(live_path))
    live_conn.row_factory = sqlite3.Row

    # ── sanity checks ──────────────────────────────────────────
    for required in ("workout_sets", "workouts"):
        if not table_exists(old_conn, required):
            sys.exit(f"ERROR: backup file is missing '{required}' table — is this really a Fahim database?")
    for required in ("workout_sets", "workouts", "exercises", "plan_exercises", "plan_days", "training_plan"):
        if not table_exists(live_conn, required):
            sys.exit(f"ERROR: live database is missing '{required}' table — run the earlier migration scripts first.")

    old_ws_cols = get_columns(old_conn, "workout_sets")
    has_exercise_id_in_backup = "exercise_id" in old_ws_cols
    print(f"Backup workout_sets has exercise_id column: {has_exercise_id_in_backup}")

    # exercise library, for matching free-text exercise -> exercise_id
    library = {row["exercise_id"].lower(): row["exercise_id"] for row in live_conn.execute("SELECT exercise_id FROM exercises")}
    library_by_name = {row["exercise_name"].lower(): row["exercise_id"] for row in live_conn.execute("SELECT exercise_id, exercise_name FROM exercises")}

    def resolve_exercise_id(raw_exercise, backup_exercise_id=None):
        """Best-effort match of an old free-text exercise value to a live exercise_id."""
        if backup_exercise_id and backup_exercise_id.lower() in library:
            return library[backup_exercise_id.lower()]
        if not raw_exercise:
            return None
        key = raw_exercise.strip().lower()
        if key in library:
            return library[key]
        if key in library_by_name:
            return library_by_name[key]
        return None

    # ── match workouts: backup (date, session_type) -> live workout id ──
    live_workouts = {
        (r["date"], r["session_type"]): r["id"]
        for r in live_conn.execute("SELECT id, date, session_type FROM workouts")
    }
    old_workouts = {
        r["id"]: (r["date"], r["session_type"])
        for r in old_conn.execute("SELECT id, date, session_type FROM workouts")
    }

    workout_id_map = {}     # old workout_id -> live workout_id
    unmatched_workouts = []
    for old_id, key in old_workouts.items():
        if key in live_workouts:
            workout_id_map[old_id] = live_workouts[key]
        else:
            unmatched_workouts.append((old_id, key))

    print(f"\nWorkouts: {len(old_workouts)} in backup, {len(workout_id_map)} matched to live workouts by (date, session_type)")
    if unmatched_workouts:
        print("  Unmatched (no corresponding live workout — their sets will be SKIPPED):")
        for old_id, key in unmatched_workouts:
            print(f"    backup workout_id={old_id}  date={key[0]}  session_type={key[1]}")

    # ── match plan_days: backup (day_name) -> live plan_day id, scoped to
    #    the CURRENTLY ACTIVE live plan (plan_id in the backup refers to
    #    the backup's own training_plan rows, not necessarily the same
    #    plan_id live) ──
    live_active_plan = live_conn.execute("SELECT id FROM training_plan WHERE is_active=1 LIMIT 1").fetchone()
    plan_day_id_map = {}
    unmatched_plan_days = []
    if live_active_plan:
        live_plan_days = {
            r["day_name"]: r["id"]
            for r in live_conn.execute("SELECT id, day_name FROM plan_days WHERE plan_id=?", (live_active_plan["id"],))
        }
        old_plan_days = {
            r["id"]: r["day_name"]
            for r in old_conn.execute("SELECT id, day_name FROM plan_days")
        }
        for old_id, day_name in old_plan_days.items():
            if day_name in live_plan_days:
                plan_day_id_map[old_id] = live_plan_days[day_name]
            else:
                unmatched_plan_days.append((old_id, day_name))
    else:
        print("\nNo active training_plan in the live database — plan_exercises restore will be SKIPPED entirely.")

    if live_active_plan:
        print(f"Plan days: {len(plan_day_id_map)} matched to the live active plan's days by day_name")
        if unmatched_plan_days:
            print("  Unmatched (no corresponding live plan_day — skipped):")
            for old_id, day_name in unmatched_plan_days:
                print(f"    backup plan_day_id={old_id}  day_name={day_name}")

    # ── build the rows to insert ────────────────────────────────
    sets_to_insert = []
    sets_skipped = 0
    unresolved_exercise_names = set()
    for r in old_conn.execute("SELECT * FROM workout_sets ORDER BY id"):
        old_workout_id = r["workout_id"]
        if old_workout_id not in workout_id_map:
            sets_skipped += 1
            continue
        backup_ex_id = r["exercise_id"] if has_exercise_id_in_backup else None
        resolved_id = resolve_exercise_id(r["exercise"], backup_ex_id)
        if r["exercise"] and not resolved_id:
            unresolved_exercise_names.add(r["exercise"])
        sets_to_insert.append((
            workout_id_map[old_workout_id], r["exercise"], resolved_id,
            r["set_number"], r["reps"], r["weight_kg"], r["rpe"], r["is_warmup"], r["notes"],
        ))

    plan_ex_to_insert = []
    plan_ex_skipped = 0
    if table_exists(old_conn, "plan_exercises"):
        old_pe_cols = get_columns(old_conn, "plan_exercises")
        has_exercise_id_in_backup_pe = "exercise_id" in old_pe_cols
        for r in old_conn.execute("SELECT * FROM plan_exercises ORDER BY id"):
            old_day_id = r["plan_day_id"]
            if old_day_id not in plan_day_id_map:
                plan_ex_skipped += 1
                continue
            backup_ex_id = r["exercise_id"] if has_exercise_id_in_backup_pe else None
            resolved_id = resolve_exercise_id(r["exercise"], backup_ex_id)
            if r["exercise"] and not resolved_id:
                unresolved_exercise_names.add(r["exercise"])
            rest_sec = r["rest_sec"] if "rest_sec" in old_pe_cols else None
            tempo = r["tempo"] if "tempo" in old_pe_cols else None
            plan_ex_to_insert.append((
                plan_day_id_map[old_day_id], r["exercise"], resolved_id,
                r["sets"], r["reps"], r["rir"], rest_sec, tempo,
                r["progression_rule"], r["notes"], r["order_index"],
            ))

    print(f"\nworkout_sets:    {len(sets_to_insert)} row(s) ready to restore, {sets_skipped} skipped (unmatched workout)")
    print(f"plan_exercises:  {len(plan_ex_to_insert)} row(s) ready to restore, {plan_ex_skipped} skipped (unmatched plan_day)")
    if unresolved_exercise_names:
        print(f"\nExercise names that don't match your current library (kept as free text, exercise_id=NULL):")
        for name in sorted(unresolved_exercise_names):
            print(f"    {name!r}")

    # Guard against accidentally running this twice, which would duplicate
    # every restored row.
    if not args.dry_run:
        existing_ws = live_conn.execute("SELECT COUNT(*) FROM workout_sets").fetchone()[0]
        existing_pe = live_conn.execute("SELECT COUNT(*) FROM plan_exercises").fetchone()[0]
        if existing_ws > 0 or existing_pe > 0:
            print(f"\nWARNING: your live database already has {existing_ws} workout_sets and "
                  f"{existing_pe} plan_exercises row(s). Running this restore will ADD to them, "
                  "not replace — if you've already restored once, this will create duplicates.")
            confirm = input("Type 'yes' to continue anyway, anything else to abort: ").strip().lower()
            if confirm != "yes":
                print("Aborted — no changes written.")
                old_conn.close()
                live_conn.close()
                return

    if args.dry_run:
        print("\nDry run — no changes written. Re-run without --dry-run to apply.")
        return

    # ── write ────────────────────────────────────────────────────
    try:
        live_conn.executemany("""
            INSERT INTO workout_sets
                (workout_id, exercise, exercise_id, set_number, reps, weight_kg, rpe, is_warmup, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, sets_to_insert)

        if plan_ex_to_insert:
            live_conn.executemany("""
                INSERT INTO plan_exercises
                    (plan_day_id, exercise, exercise_id, sets, reps, rir, rest_sec, tempo, progression_rule, notes, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, plan_ex_to_insert)

        live_conn.commit()
    except Exception:
        live_conn.rollback()
        raise
    finally:
        old_conn.close()
        live_conn.close()

    print(f"\nDone. Restored {len(sets_to_insert)} workout_sets row(s) and {len(plan_ex_to_insert)} plan_exercises row(s).")


if __name__ == "__main__":
    main()