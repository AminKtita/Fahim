"""
add_exercise_images.py
------------------------
Adds support for multiple images per exercise (for the "flicker" cycling
animation), stored either as locally uploaded files or external URLs.

What it does:
  1. Backs up db/fitness.db first.
  2. Creates the exercise_images table:
       id, exercise_id (FK), source ('upload' | 'url'), path_or_url,
       order_index, created_at
     - source='upload': path_or_url is a relative path under
       db/exercise_images/ (served by the API as a static file)
     - source='url': path_or_url is an external URL, used as-is
  3. Migrates any existing exercises.image_url value into this table as
     frame 1 (source='url') for every exercise that has one — so nothing
     you've already set is lost. exercises.image_url itself is left in
     place afterward (untouched, just no longer the primary source) in
     case anything still reads it directly.
  4. Creates db/exercise_images/ on disk for future uploads.
  5. Safe to run more than once — checks before creating/migrating.

Usage:
    python scripts\\add_exercise_images.py
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
    sys.exit("ERROR: could not find db/fitness.db. Run from the Fahim project root, or pass --db explicitly.")


def backup_db(db_path):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = db_path.with_name(f"{db_path.stem}.backup_{timestamp}{db_path.suffix}")
    shutil.copy2(db_path, backup_path)
    return backup_path


def table_exists(conn, name):
    return conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


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

    conn = sqlite3.connect(str(db_path))
    actions = []

    try:
        if not table_exists(conn, "exercises"):
            sys.exit("ERROR: 'exercises' table not found — run the earlier migration scripts first.")

        if table_exists(conn, "exercise_images"):
            actions.append("exercise_images table: already exists, left as-is")
        else:
            conn.execute("""
                CREATE TABLE exercise_images (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    exercise_id TEXT NOT NULL REFERENCES exercises(exercise_id),
                    source TEXT NOT NULL CHECK(source IN ('upload', 'url')),
                    path_or_url TEXT NOT NULL,
                    order_index INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX idx_exercise_images_exercise_id ON exercise_images(exercise_id)")
            actions.append("exercise_images table: CREATED")

        # Migrate existing single image_url values in as frame 1, only for
        # exercises that don't already have rows in exercise_images (so this
        # stays safe to re-run).
        already_has_images = {
            r[0] for r in conn.execute("SELECT DISTINCT exercise_id FROM exercise_images")
        }
        candidates = conn.execute(
            "SELECT exercise_id, image_url FROM exercises WHERE image_url IS NOT NULL AND image_url != ''"
        ).fetchall()
        migrated = 0
        for exercise_id, image_url in candidates:
            if exercise_id in already_has_images:
                continue
            conn.execute("""
                INSERT INTO exercise_images (exercise_id, source, path_or_url, order_index)
                VALUES (?, 'url', ?, 0)
            """, (exercise_id, image_url))
            migrated += 1
        actions.append(f"existing image_url values migrated as frame 1: {migrated}")

        conn.commit()
    except Exception:
        conn.rollback()
        conn.close()
        print("\nSomething went wrong — changes rolled back.")
        raise
    finally:
        conn.close()

    # Local upload storage directory
    upload_dir = db_path.parent / "exercise_images"
    upload_dir.mkdir(exist_ok=True)
    actions.append(f"upload directory ready at: {upload_dir}")

    print("\n--- Migration summary ---")
    for a in actions:
        print(f"  - {a}")
    print("\nDone.")


if __name__ == "__main__":
    main()