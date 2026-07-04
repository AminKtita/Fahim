"""
db/init_db.py — Bootstrap or migrate the Fahim SQLite database.

Fresh install (creates db/fitness.db from schema.sql):
    python db/init_db.py

Run migration on an existing database:
    python db/init_db.py --migrate

The database file lives at db/fitness.db (gitignored).
"""

import os
import sys
import sqlite3
import argparse
import shutil
from datetime import datetime

DB_PATH     = os.path.join(os.path.dirname(__file__), "fitness.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")
MIGRATE_PATH = os.path.join(os.path.dirname(__file__), "migrate.sql")


def _backup(db_path: str) -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = f"{db_path}.bak_{ts}"
    shutil.copy2(db_path, backup)
    print(f"[backup] {backup}")
    return backup


def init_fresh():
    if os.path.exists(DB_PATH):
        print(f"[skip] {DB_PATH} already exists. Use --migrate to update an existing database.")
        sys.exit(0)

    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(schema_sql)
    conn.close()
    print(f"[ok] Created fresh database: {DB_PATH}")


def run_migration():
    if not os.path.exists(DB_PATH):
        print(f"[error] No database found at {DB_PATH}. Run without --migrate for a fresh install.")
        sys.exit(1)

    _backup(DB_PATH)

    with open(MIGRATE_PATH, "r", encoding="utf-8") as f:
        migration_sql = f.read()

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(migration_sql)
        print(f"[ok] Migration applied to {DB_PATH}")
    except Exception as e:
        conn.close()
        print(f"[error] Migration failed: {e}")
        print("Your original database is unchanged. The backup was saved before any changes.")
        sys.exit(1)
    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fahim DB bootstrap / migration tool")
    parser.add_argument("--migrate", action="store_true",
                        help="Run migrate.sql on an existing database (backs up first)")
    args = parser.parse_args()

    if args.migrate:
        run_migration()
    else:
        init_fresh()