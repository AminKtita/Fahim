"""
Migration: Add `category` column to day_blocks (emoji/color theming).

Run once from the Fahim root, AFTER db/migrate_dayplan.py has already
been run at least once:
    python db/migrate_dayplan_v2.py

Safe to re-run — checks for the column's existence before altering, and
only backfills rows that don't already have a category set.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "fitness.db")

# Default category per block_type, used to backfill existing rows.
DEFAULT_CATEGORY = {
    "work": "work",
    "workout": "workout",
    "meal1": "meal",
    "meal2": "meal",
    "meal3": "meal",
    "custom": "other",
}


def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


def column_exists(conn, table, column):
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r["name"] == column for r in rows)


def run():
    conn = get_conn()
    try:
        if not column_exists(conn, "day_blocks", "category"):
            conn.execute(
                "ALTER TABLE day_blocks ADD COLUMN category TEXT NOT NULL DEFAULT 'other'"
            )
            conn.commit()
            print("[ok] added category column to day_blocks")
        else:
            print("[skip] category column already exists")

        rows = conn.execute("SELECT id, block_type FROM day_blocks").fetchall()
        updated = 0
        for r in rows:
            cat = DEFAULT_CATEGORY.get(r["block_type"], "other")
            cur = conn.execute(
                "UPDATE day_blocks SET category = ? WHERE id = ? AND category = 'other' AND block_type != 'custom'",
                (cat, r["id"]),
            )
            updated += cur.rowcount
        conn.commit()
        print(f"[ok] backfilled category on {updated} existing row(s)")
    finally:
        conn.close()
    print("[done] category column migration complete.")


if __name__ == "__main__":
    run()