"""
Migration: Add Meal Composer tables

Run once from the Fahim root:
    python db/migrate_meals.py

Creates:
    - ingredients
    - recipes
    - recipe_ingredients
    - meal_logs

Then seeds the database with all data from the Excel file.
Safe to re-run: all CREATE TABLE statements use IF NOT EXISTS.
"""

import sqlite3
import os
import json
from datetime import date

DB_PATH = os.path.join(os.path.dirname(__file__), "fitness.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def ensure_base_schema(conn):
    """
    NOTE: The original Fahim repo has no schema.sql or migration system —
    the base tables (user_profile, workouts, etc.) are assumed to already
    exist from prior manual setup. This function creates them IF MISSING
    so this script also works on a fresh checkout. It is a no-op on a
    database that already has these tables.
    """
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS user_profile (
            id              INTEGER PRIMARY KEY,
            name            TEXT,
            age             INTEGER,
            sex             TEXT,
            height_cm       REAL,
            weight_start_kg REAL,
            activity_level  TEXT,
            goal_type       TEXT,
            injuries        TEXT
        );

        CREATE TABLE IF NOT EXISTS workouts (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            date              TEXT NOT NULL,
            session_type      TEXT NOT NULL,
            duration_min      INTEGER,
            perceived_effort  INTEGER,
            notes             TEXT
        );

        CREATE TABLE IF NOT EXISTS workout_sets (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            workout_id   INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
            exercise     TEXT NOT NULL,
            set_number   INTEGER NOT NULL,
            reps         INTEGER,
            weight_kg    REAL,
            rpe          INTEGER,
            is_warmup    INTEGER NOT NULL DEFAULT 0,
            notes        TEXT
        );

        CREATE TABLE IF NOT EXISTS nutrition_log (
            date       TEXT PRIMARY KEY,
            calories   INTEGER,
            protein_g  REAL,
            carbs_g    REAL,
            fat_g      REAL,
            water_ml   INTEGER,
            notes      TEXT
        );

        CREATE TABLE IF NOT EXISTS body_metrics (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            date          TEXT NOT NULL,
            weight_kg     REAL,
            body_fat_pct  REAL,
            waist_cm      REAL,
            chest_cm      REAL,
            hips_cm       REAL,
            arm_cm        REAL,
            thigh_cm      REAL,
            notes         TEXT
        );

        CREATE TABLE IF NOT EXISTS goals (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            title          TEXT NOT NULL,
            metric         TEXT,
            target_value   REAL,
            current_value  REAL,
            deadline       TEXT,
            status         TEXT NOT NULL DEFAULT 'active',
            created_at     TEXT
        );

        CREATE TABLE IF NOT EXISTS training_plan (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            name               TEXT,
            split_type         TEXT,
            days_per_week      INTEGER,
            mesocycle_number   INTEGER,
            start_date         TEXT,
            end_date           TEXT,
            deload_week        INTEGER,
            notes              TEXT,
            is_active          INTEGER NOT NULL DEFAULT 0,
            created_at         TEXT
        );

        CREATE TABLE IF NOT EXISTS plan_days (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id       INTEGER NOT NULL REFERENCES training_plan(id) ON DELETE CASCADE,
            day_name      TEXT NOT NULL,
            session_type  TEXT,
            order_index   INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS plan_exercises (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_day_id        INTEGER NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
            exercise           TEXT NOT NULL,
            sets               INTEGER,
            reps               TEXT,
            rir                INTEGER,
            progression_rule   TEXT,
            notes              TEXT,
            order_index        INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS nutrition_targets (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id     INTEGER REFERENCES training_plan(id) ON DELETE SET NULL,
            calories    INTEGER,
            protein_g   REAL,
            carbs_g     REAL,
            fat_g       REAL,
            is_active   INTEGER NOT NULL DEFAULT 0
        );
    """)
    conn.commit()


def migrate(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS ingredients (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL UNIQUE,
            category        TEXT NOT NULL DEFAULT 'Other',
            calories_per_100g  REAL NOT NULL DEFAULT 0,
            protein_per_100g   REAL NOT NULL DEFAULT 0,
            carbs_per_100g     REAL NOT NULL DEFAULT 0,
            fat_per_100g       REAL NOT NULL DEFAULT 0,
            price_per_unit  REAL NOT NULL DEFAULT 0,
            unit_label      TEXT NOT NULL DEFAULT 'g',
            grams_per_unit  REAL NOT NULL DEFAULT 100,
            notes           TEXT,
            created_at      TEXT DEFAULT (date('now'))
        );

        CREATE TABLE IF NOT EXISTS recipes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            category    TEXT NOT NULL DEFAULT 'Lunch/Dinner'
                        CHECK (category IN ('Breakfast', 'Lunch/Dinner', 'Snack/Base')),
            image_url   TEXT,
            video_url   TEXT,
            notes       TEXT,
            created_at  TEXT DEFAULT (date('now'))
        );

        CREATE TABLE IF NOT EXISTS recipe_ingredients (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id     INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
            ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
            quantity_g    REAL NOT NULL DEFAULT 0,
            order_index   INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS meal_logs (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            log_date              TEXT NOT NULL,
            recipe_id             INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
            recipe_name_snapshot  TEXT,
            calories              REAL NOT NULL DEFAULT 0,
            protein_g             REAL NOT NULL DEFAULT 0,
            carbs_g               REAL NOT NULL DEFAULT 0,
            fat_g                 REAL NOT NULL DEFAULT 0,
            notes                 TEXT,
            created_at            TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_meal_logs_date ON meal_logs(log_date);
        CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
    """)
    conn.commit()
    print("[+] Tables created (or already exist).")


# Old free-text categories -> the new fixed 3-value set.
CATEGORY_REMAP = {
    "General":          "Lunch/Dinner",
    "Breakfast":        "Breakfast",
    "Breakfast/Lunch":  "Breakfast",
    "Breakfast/Snack":  "Snack/Base",
    "Lunch/Dinner":     "Lunch/Dinner",
    "Snack":            "Snack/Base",
    "Snack/Base":       "Snack/Base",
    "Test":             "Snack/Base",   # anything stray from manual testing
}
VALID_CATEGORIES = {"Breakfast", "Lunch/Dinner", "Snack/Base"}


def upgrade_existing_recipes_table(conn):
    """
    Handles databases that already ran an earlier version of this script
    (recipes table exists but predates: image_url column, fixed category set).
    Safe / idempotent — every step checks before acting.
    """
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(recipes)").fetchall()}

    if "image_url" not in cols:
        conn.execute("ALTER TABLE recipes ADD COLUMN image_url TEXT")
        conn.commit()
        print("[+] Added image_url column to recipes.")

    # Normalize any free-text categories left over from before the CHECK constraint.
    existing_cats = {row["category"] for row in conn.execute("SELECT DISTINCT category FROM recipes").fetchall()}
    stray = existing_cats - VALID_CATEGORIES
    if stray:
        for old_cat in stray:
            new_cat = CATEGORY_REMAP.get(old_cat, "Lunch/Dinner")
            conn.execute("UPDATE recipes SET category = ? WHERE category = ?", (new_cat, old_cat))
            print(f"[+] Remapped recipe category '{old_cat}' -> '{new_cat}'")
        conn.commit()

    # SQLite can't add a CHECK constraint to an existing table without a rebuild.
    # If the table predates the constraint, rebuild it now that data is clean.
    #
    # IMPORTANT: SQLite's ALTER TABLE ... RENAME automatically rewrites the
    # REFERENCES clause of every OTHER table that points at the renamed
    # table to keep pointing at the new name — e.g. a table with
    # `recipe_id INTEGER REFERENCES recipes(id)` ends up with
    # `REFERENCES "recipes_old"(id)` once we rename recipes -> recipes_old.
    # That rewritten reference is never fixed back, even after recipes_old
    # is dropped and a fresh "recipes" table takes its place. The result:
    # every future write to that table fails with "no such table:
    # main.recipes_old", because SQLite is still trying to validate against
    # a table that no longer exists. (Confirmed via direct reproduction —
    # this isn't theoretical, and it bit recipe_ingredients AND meal_logs in
    # production.) The fix: never rename the live "recipes" table in place.
    # Build the replacement under a temporary name, swap it in, then ALSO
    # rebuild every table that references recipes(id) — recipe_ingredients
    # AND meal_logs — fresh, so their REFERENCES clauses are written against
    # the table as it exists *after* the swap, never touched by this rename.
    table_sql = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='recipes'"
    ).fetchone()["sql"]
    if "CHECK" not in table_sql:
        meal_logs_exists = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='meal_logs'"
        ).fetchone() is not None

        conn.execute("PRAGMA foreign_keys=OFF")
        conn.executescript("""
            CREATE TABLE recipes_new (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL UNIQUE,
                category    TEXT NOT NULL DEFAULT 'Lunch/Dinner'
                            CHECK (category IN ('Breakfast', 'Lunch/Dinner', 'Snack/Base')),
                image_url   TEXT,
                video_url   TEXT,
                notes       TEXT,
                created_at  TEXT DEFAULT (date('now'))
            );

            INSERT INTO recipes_new (id, name, category, image_url, video_url, notes, created_at)
                SELECT id, name, category, image_url, video_url, notes, created_at FROM recipes;

            DROP TABLE recipes;
            ALTER TABLE recipes_new RENAME TO recipes;

            CREATE TABLE recipe_ingredients_new (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                recipe_id     INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
                ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
                quantity_g    REAL NOT NULL DEFAULT 0,
                order_index   INTEGER NOT NULL DEFAULT 0
            );

            INSERT INTO recipe_ingredients_new (id, recipe_id, ingredient_id, quantity_g, order_index)
                SELECT id, recipe_id, ingredient_id, quantity_g, order_index FROM recipe_ingredients;

            DROP TABLE recipe_ingredients;
            ALTER TABLE recipe_ingredients_new RENAME TO recipe_ingredients;

            CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
        """)
        if meal_logs_exists:
            conn.executescript("""
                CREATE TABLE meal_logs_new (
                    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                    log_date              TEXT NOT NULL,
                    recipe_id             INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
                    recipe_name_snapshot  TEXT,
                    calories              REAL NOT NULL DEFAULT 0,
                    protein_g             REAL NOT NULL DEFAULT 0,
                    carbs_g               REAL NOT NULL DEFAULT 0,
                    fat_g                 REAL NOT NULL DEFAULT 0,
                    notes                 TEXT,
                    created_at            TEXT
                );

                INSERT INTO meal_logs_new (id, log_date, recipe_id, recipe_name_snapshot,
                                            calories, protein_g, carbs_g, fat_g, notes, created_at)
                    SELECT id, log_date, recipe_id, recipe_name_snapshot,
                           COALESCE(calories, 0), COALESCE(protein_g, 0),
                           COALESCE(carbs_g, 0), COALESCE(fat_g, 0),
                           notes, created_at FROM meal_logs;

                DROP TABLE meal_logs;
                ALTER TABLE meal_logs_new RENAME TO meal_logs;

                CREATE INDEX IF NOT EXISTS idx_meal_logs_date ON meal_logs(log_date);
            """)
        conn.commit()
        conn.execute("PRAGMA foreign_keys=ON")
        print("[+] Rebuilt recipes table with category CHECK constraint.")
        print("[+] Rebuilt recipe_ingredients table to fix a stale foreign-key reference.")
        if meal_logs_exists:
            print("[+] Rebuilt meal_logs table to fix a stale foreign-key reference.")


def fix_stale_recipe_ingredients_fk(conn):
    """
    Standalone, UNCONDITIONAL check — runs every time, regardless of whether
    upgrade_existing_recipes_table() decided to rebuild anything this run.

    Why this needs to be separate: a prior run of this script (or any earlier
    version of it) may have already rebuilt the `recipes` table once, which
    leaves EVERY table that references recipes(id) with a schema like
        recipe_id INTEGER REFERENCES "recipes_old"(id)
    — a leftover from SQLite's automatic REFERENCES-rewrite on table rename
    (see the long comment in upgrade_existing_recipes_table for the full
    explanation). Once that happens, `recipes` itself looks completely fine
    (it already has the CHECK constraint, so upgrade_existing_recipes_table's
    `if "CHECK" not in table_sql` guard skips doing anything else) — but the
    referencing tables are still broken and every INSERT/UPDATE/DELETE
    against them keeps failing with "no such table: main.recipes_old"
    forever, on every future run, until something specifically checks their
    schema text. That's what this function does.

    Two tables reference recipes(id): recipe_ingredients and meal_logs.
    Both are checked and fixed here — fixing only one (as an earlier version
    of this script did) leaves the other silently broken.
    """
    # (table_name, rebuild_sql_with_{name}_fixed_placeholder, post_rebuild_index_sql_or_None)
    tables_referencing_recipes = [
        (
            "recipe_ingredients",
            """
                CREATE TABLE recipe_ingredients_fixed (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    recipe_id     INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
                    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
                    quantity_g    REAL NOT NULL DEFAULT 0,
                    order_index   INTEGER NOT NULL DEFAULT 0
                );

                INSERT INTO recipe_ingredients_fixed (id, recipe_id, ingredient_id, quantity_g, order_index)
                    SELECT id, recipe_id, ingredient_id, quantity_g, order_index FROM recipe_ingredients;

                DROP TABLE recipe_ingredients;
                ALTER TABLE recipe_ingredients_fixed RENAME TO recipe_ingredients;

                CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
            """,
        ),
        (
            "meal_logs",
            """
                CREATE TABLE meal_logs_fixed (
                    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                    log_date              TEXT NOT NULL,
                    recipe_id             INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
                    recipe_name_snapshot  TEXT,
                    calories              REAL NOT NULL DEFAULT 0,
                    protein_g             REAL NOT NULL DEFAULT 0,
                    carbs_g               REAL NOT NULL DEFAULT 0,
                    fat_g                 REAL NOT NULL DEFAULT 0,
                    notes                 TEXT,
                    created_at            TEXT
                );

                INSERT INTO meal_logs_fixed (id, log_date, recipe_id, recipe_name_snapshot,
                                              calories, protein_g, carbs_g, fat_g, notes, created_at)
                    SELECT id, log_date, recipe_id, recipe_name_snapshot,
                           COALESCE(calories, 0), COALESCE(protein_g, 0),
                           COALESCE(carbs_g, 0), COALESCE(fat_g, 0),
                           notes, created_at FROM meal_logs;

                DROP TABLE meal_logs;
                ALTER TABLE meal_logs_fixed RENAME TO meal_logs;

                CREATE INDEX IF NOT EXISTS idx_meal_logs_date ON meal_logs(log_date);
            """,
        ),
    ]

    conn.execute("PRAGMA foreign_keys=OFF")
    for table_name, rebuild_sql in tables_referencing_recipes:
        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
        ).fetchone()
        if not row:
            continue  # table doesn't exist yet — migrate() will create it correctly
        if "recipes_old" not in row["sql"]:
            continue  # schema is clean, nothing to do for this table

        print(f"[!] {table_name} has a stale 'recipes_old' foreign-key reference")
        print("    left over from a previous run — rebuilding it now.")
        conn.executescript(rebuild_sql)
        conn.commit()
        n = conn.execute(f"SELECT COUNT(*) AS n FROM {table_name}").fetchone()["n"]
        print(f"[+] Fixed. {table_name} schema is now clean ({n} rows preserved).")

    conn.execute("PRAGMA foreign_keys=ON")


# ─────────────────────────────────────────
#  SEED DATA from Excel
# ─────────────────────────────────────────

INGREDIENTS_DATA = [
    # (name, category, cal, prot, carbs, fat, price, unit_label, grams_per_unit)
    ("Oats",                    "Carbohydrate",       389, 16.9, 66.3, 6.9,   3.5,  "g",      100),
    ("Banana",                  "Fruit",               89,  1.1, 23.0, 0.3,   5.0,  "piece",  120),
    ("Eggs",                    "Protein",            155, 13.0,  1.1, 11.0,  0.34, "piece",   55),
    ("Peanuts",                 "Fats/Protein",       567, 25.8, 16.1, 49.2,  9.0,  "g",      100),
    ("Plain Yogurt",            "Protein/Dairy",       59, 10.0,  3.6,  0.4,  0.55, "pot",    125),
    ("Mozzarella Cheese",       "Dairy/Fats",         280, 28.0,  2.2, 17.0, 24.0,  "g",      100),
    ("Tuna (Canned)",           "Protein",            132, 28.0,  0.0,  1.0,  3.2,  "can",    140),
    ("Onion",                   "Vegetable",           40,  1.1,  9.3,  0.1,  1.2,  "g",      100),
    ("Tomatoes",                "Vegetable",           18,  0.9,  3.9,  0.2,  1.5,  "g",      100),
    ("Spinach",                 "Vegetable",           23,  2.9,  3.6,  0.4,  1.0,  "bunch",  200),
    ("Tortilla / Flatbread",    "Carbohydrate",       297,  8.0, 56.0,  4.5,  3.5,  "piece",   45),
    ("Chicken/Turkey Escalope", "Protein",            165, 31.0,  0.0,  3.6, 17.5,  "g",      100),
    ("Pizza Sauce",             "Sauce",               50,  1.5, 10.0,  0.2,  2.5,  "g",      100),
    ("Mayonnaise",              "Sauce",              680,  1.0,  1.0, 75.0,  4.5,  "g",      100),
    ("Ketchup",                 "Sauce",              112,  1.2, 26.0,  0.1,  3.8,  "g",      100),
    ("Green Pepper",            "Vegetable",           20,  0.9,  4.6,  0.2,  2.0,  "g",      100),
    ("Gruyere Cheese",          "Dairy/Fats",         413, 30.0,  0.4, 32.0, 45.0,  "g",      100),
    ("Baking Powder / Yeast",   "Baking",               0,  0.0,  0.0,  0.0,  0.25, "sachet",   5),
    ("Honey",                   "Sweetener",          304,  0.3, 82.4,  0.0, 25.0,  "g",      100),
    ("Apples",                  "Fruit",               52,  0.3, 14.0,  0.2,  4.5,  "g",      100),
    ("Skim Milk (0%)",          "Dairy",               35,  3.4,  5.0,  0.1,  1.45, "ml",     100),
    ("Peanut Butter",           "Fats/Protein",       588, 25.0, 20.0, 50.0, 12.0,  "g",      100),
    ("Potatoes",                "Carbohydrate",        77,  2.0, 17.0,  0.1,  1.4,  "g",      100),
    ("Whole Wheat Spaghetti",   "Carbohydrate",       348, 15.0, 75.0,  1.5,  2.0,  "g",      100),
    ("Olive Oil",               "Fats",               884,  0.0,  0.0,100.0, 25.0,  "ml",     100),
    ("Carrot",                  "Vegetable",           41,  0.9, 10.0,  0.2,  1.2,  "g",      100),
    ("White Rice",              "Carbohydrate",       130,  2.7, 28.0,  0.3,  2.5,  "g",      100),
    ("Light Cream",             "Dairy",              135,  3.0,  4.0, 12.0,  2.8,  "ml",     100),
    ("Strawberry",              "Fruit",               32,  0.7,  7.7,  0.3,  6.0,  "g",      100),
    ("Cacao Powder",            "Baking",             228, 20.0, 58.0, 14.0,  3.0,  "g",      100),
    ("Lemon",                   "Fruit",               29,  1.1,  9.3,  0.3,  3.0,  "piece",   80),
    ("Lentils",                 "Carbohydrate/Protein",116, 9.0, 20.0,  0.4,  4.0,  "g",      100),
    ("Lettuce",                 "Vegetable",           15,  1.4,  2.9,  0.2,  1.0,  "piece",  300),
    ("Sardines (Canned)",       "Protein/Fats",       208, 25.0,  0.0, 12.0,  1.1,  "can",    125),
    ("Cornstarch",              "Baking",             381,  0.3, 91.0,  0.1,  1.5,  "g",      100),
    ("Vegetable Oil",           "Fats",               884,  0.0,  0.0,100.0,  4.5,  "ml",     100),
    ("Butter",                  "Fats",               717,  0.9,  0.1, 81.0,  4.0,  "g",      100),
    ("Cream Cheese",            "Dairy",              242,  6.0,  4.0, 23.0,  1.8,  "g",      100),
    ("Basil",                   "Herb",                23,  3.2,  2.7,  0.6,  0.5,  "bunch",   30),
    ("Turkey Ham (Jambon)",     "Protein",            115, 18.0,  1.0,  4.0, 18.0,  "g",      100),
    ("Egg Whites",              "Protein",             52, 10.9,  0.7,  0.2,  0.0,  "piece",   30),
    ("Whole Wheat Pasta",       "Carbohydrate",       348, 15.0, 70.0,  3.0,  2.0,  "g",      100),
    ("Tomato Sauce",            "Sauce",               35,  1.5,  7.0,  0.2,  2.0,  "g",      100),
    ("Shredded Cheese",         "Dairy/Fats",         380, 23.0,  1.5, 31.0, 20.0,  "g",      100),
]

# Recipes: (name, category, image_url, video_url, [(ingredient_name, quantity_g)])
# category must be one of: "Breakfast", "Lunch/Dinner", "Snack/Base"
RECIPES_DATA = [
    ("Peanut Butter Pancakes", "Breakfast", None, None, [
        ("Oats", 60), ("Banana", 200), ("Eggs", 165), ("Peanuts", 50),
    ]),
    ("Cheese Pancakes", "Breakfast", None, None, [
        ("Eggs", 165), ("Plain Yogurt", 125), ("Oats", 60), ("Mozzarella Cheese", 50),
    ]),
    ("Oat Crust Pizza", "Lunch/Dinner", None, None, [
        ("Oats", 60), ("Eggs", 160), ("Mozzarella Cheese", 40),
    ]),
    ("Biscuits", "Snack/Base", None, None, [
        ("Peanuts", 110), ("Banana", 120),
    ]),
    ("Tortilla Wrap", "Lunch/Dinner", None, None, [
        ("Eggs", 110), ("Plain Yogurt", 125), ("Tuna (Canned)", 140),
        ("Onion", 30), ("Tomatoes", 50), ("Spinach", 50), ("Tortilla / Flatbread", 45),
    ]),
    ("Escalope Pizza", "Lunch/Dinner", None, None, [
        ("Eggs", 110), ("Oats", 50), ("Pizza Sauce", 50),
        ("Chicken/Turkey Escalope", 100), ("Mozzarella Cheese", 50),
    ]),
    ("Escalope Sandwich", "Lunch/Dinner", None, None, [
        ("Tortilla / Flatbread", 45), ("Mayonnaise", 15), ("Ketchup", 15),
        ("Chicken/Turkey Escalope", 100), ("Mozzarella Cheese", 20),
        ("Tomatoes", 50), ("Lettuce", 50),
    ]),
    ("Lebanese Escalope Sandwich", "Lunch/Dinner", None, None, [
        ("Onion", 50), ("Tomatoes", 100), ("Green Pepper", 100),
        ("Chicken/Turkey Escalope", 150), ("Tortilla / Flatbread", 45),
        ("Mayonnaise", 15), ("Mozzarella Cheese", 20),
    ]),
    ("Cake", "Snack/Base", None, None, [
        ("Banana", 120), ("Eggs", 165), ("Plain Yogurt", 125),
        ("Baking Powder / Yeast", 2), ("Oats", 60), ("Honey", 20),
    ]),
    ("Waffles", "Breakfast", None, None, [
        ("Oats", 120), ("Apples", 150), ("Eggs", 110),
        ("Skim Milk (0%)", 100), ("Baking Powder / Yeast", 2), ("Peanut Butter", 50),
    ]),
    ("Tacos", "Lunch/Dinner", None, None, [
        ("Potatoes", 300), ("Tortilla / Flatbread", 45), ("Mayonnaise", 20),
        ("Onion", 30), ("Tomatoes", 50), ("Lettuce", 50),
        ("Chicken/Turkey Escalope", 120), ("Mozzarella Cheese", 15),
    ]),
    ("Spaghetti Complet", "Lunch/Dinner", None, None, [
        ("Green Pepper", 200), ("Tomatoes", 150), ("Onion", 100),
        ("Chicken/Turkey Escalope", 400), ("Olive Oil", 20),
        ("Carrot", 100), ("Whole Wheat Spaghetti", 150),
    ]),
    ("Peanut Butter", "Snack/Base", None, None, [
        ("Peanuts", 100),
    ]),
    ("Eggs and Potatoes", "Lunch/Dinner", None, None, [
        ("Potatoes", 300), ("Egg Whites", 120), ("Eggs", 110),
    ]),
    ("Potatoes and Escalope", "Lunch/Dinner", None, None, [
        ("Potatoes", 200), ("Chicken/Turkey Escalope", 200),
        ("Tomatoes", 50), ("Green Pepper", 50), ("Mozzarella Cheese", 10),
    ]),
    ("Pasta with Cream", "Lunch/Dinner", None, None, [
        ("Whole Wheat Pasta", 60), ("Chicken/Turkey Escalope", 150),
        ("Onion", 50), ("Green Pepper", 100), ("Tomatoes", 100),
        ("Light Cream", 60), ("Mozzarella Cheese", 20),
    ]),
    ("Tuna Pizza", "Lunch/Dinner", None, None, [
        ("Egg Whites", 120), ("Eggs", 55), ("Tortilla / Flatbread", 45),
        ("Tomato Sauce", 40), ("Mozzarella Cheese", 40), ("Tuna (Canned)", 100),
    ]),
    ("Strawberry Oats", "Breakfast", None, None, [
        ("Oats", 70), ("Plain Yogurt", 100), ("Skim Milk (0%)", 40),
        ("Honey", 10), ("Strawberry", 50),
    ]),
    ("Oats Breakfast Bowl", "Breakfast", None, None, [
        ("Oats", 100), ("Plain Yogurt", 250), ("Peanut Butter", 50), ("Honey", 30),
    ]),
    ("Omelette", "Breakfast", None, None, [
        ("Onion", 50), ("Tomatoes", 50), ("Spinach", 100),
        ("Egg Whites", 150), ("Eggs", 55),
    ]),
    ("Chicken and Rice", "Lunch/Dinner", None, None, [
        ("Chicken/Turkey Escalope", 400), ("Onion", 50),
        ("Green Pepper", 200), ("White Rice", 100),
    ]),
    ("Chocolate Cake", "Snack/Base", None, None, [
        ("Peanuts", 100), ("Eggs", 165), ("Plain Yogurt", 125),
        ("Honey", 10), ("Cacao Powder", 10),
    ]),
    ("Cheesecake", "Snack/Base", None, None, [
        ("Eggs", 165), ("Plain Yogurt", 250), ("Lemon", 80), ("Honey", 20),
    ]),
    ("Protein Salad", "Lunch/Dinner", None, None, [
        ("Potatoes", 200), ("Lentils", 30), ("Tomatoes", 200),
        ("Onion", 80), ("Lettuce", 100), ("Green Pepper", 80),
        ("Plain Yogurt", 125), ("Tuna (Canned)", 140), ("Eggs", 110),
    ]),
    ("Tuna Bread", "Lunch/Dinner", None, None, [
        ("Tuna (Canned)", 140), ("Eggs", 110), ("Baking Powder / Yeast", 2),
    ]),
    ("Light Mayonnaise", "Snack/Base", None, None, [
        ("Cornstarch", 30), ("Skim Milk (0%)", 200), ("Lemon", 40),
        ("Eggs", 36), ("Vegetable Oil", 35),
    ]),
    ("Ojja Escalope", "Lunch/Dinner", None, None, [
        ("Green Pepper", 400), ("Onion", 300), ("Eggs", 330),
        ("Tomatoes", 400), ("Chicken/Turkey Escalope", 400),
    ]),
    ("Scrambled Eggs", "Breakfast", None, None, [
        ("Eggs", 165), ("Butter", 5), ("Skim Milk (0%)", 75),
        ("Cream Cheese", 30), ("Onion", 30),
    ]),
    ("Potatoes with Sardines", "Lunch/Dinner", None, None, [
        ("Potatoes", 200), ("Eggs", 165), ("Sardines (Canned)", 125),
    ]),
    ("Lentils with Onion", "Lunch/Dinner", None, None, [
        ("Onion", 80), ("Lentils", 100), ("Basil", 5),
    ]),
    ("Ham Salad / Omelette", "Lunch/Dinner", None, None, [
        ("Butter", 5), ("Eggs", 220), ("Shredded Cheese", 20),
        ("Onion", 30), ("Turkey Ham (Jambon)", 100),
    ]),
]


def seed_ingredients(conn):
    inserted = 0
    skipped = 0
    for row in INGREDIENTS_DATA:
        name, cat, cal, prot, carbs, fat, price, unit_label, grams_per_unit = row
        existing = conn.execute(
            "SELECT id FROM ingredients WHERE name = ?", (name,)
        ).fetchone()
        if existing:
            skipped += 1
            continue
        conn.execute("""
            INSERT INTO ingredients
                (name, category, calories_per_100g, protein_per_100g, carbs_per_100g,
                 fat_per_100g, price_per_unit, unit_label, grams_per_unit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (name, cat, cal, prot, carbs, fat, price, unit_label, grams_per_unit))
        inserted += 1
    conn.commit()
    print(f"[+] Ingredients: {inserted} inserted, {skipped} already existed.")


def seed_recipes(conn):
    inserted = 0
    skipped = 0
    for recipe_name, category, image_url, video_url, ingredients in RECIPES_DATA:
        existing = conn.execute(
            "SELECT id FROM recipes WHERE name = ?", (recipe_name,)
        ).fetchone()
        if existing:
            skipped += 1
            continue

        cursor = conn.execute("""
            INSERT INTO recipes (name, category, image_url, video_url)
            VALUES (?, ?, ?, ?)
        """, (recipe_name, category, image_url, video_url))
        recipe_id = cursor.lastrowid

        for order_idx, (ing_name, qty_g) in enumerate(ingredients):
            ing_row = conn.execute(
                "SELECT id FROM ingredients WHERE name = ?", (ing_name,)
            ).fetchone()
            if not ing_row:
                print(f"  [!] Ingredient not found: '{ing_name}' in recipe '{recipe_name}' — skipping")
                continue
            conn.execute("""
                INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity_g, order_index)
                VALUES (?, ?, ?, ?)
            """, (recipe_id, ing_row["id"], qty_g, order_idx))

        # Commit per-recipe (not once at the very end). If the process gets
        # interrupted or hits "database is locked" partway through, recipes
        # already committed keep their ingredients — nothing is left as a
        # bare recipe row with zero recipe_ingredients rows.
        conn.commit()
        inserted += 1

    print(f"[+] Recipes: {inserted} inserted, {skipped} already existed.")


def verify_recipe_ingredients(conn):
    """
    Sanity check after seeding: every recipe in RECIPES_DATA that has
    ingredients listed should have matching rows in recipe_ingredients.
    If not, something interrupted the seed (commonly: 'database is locked'
    because another process — e.g. a running `uvicorn --reload` — was
    writing to the same fitness.db file at the same time).

    This does not silently continue — it reports exactly which recipes
    are missing ingredients and re-attempts them once.
    """
    broken = []
    for recipe_name, category, image_url, video_url, ingredients in RECIPES_DATA:
        if not ingredients:
            continue
        row = conn.execute("SELECT id FROM recipes WHERE name = ?", (recipe_name,)).fetchone()
        if not row:
            continue  # recipe itself missing — seed_recipes already reported this case differently
        count = conn.execute(
            "SELECT COUNT(*) AS n FROM recipe_ingredients WHERE recipe_id = ?", (row["id"],)
        ).fetchone()["n"]
        if count == 0:
            broken.append((recipe_name, row["id"], ingredients))

    if not broken:
        total = conn.execute("SELECT COUNT(*) AS n FROM recipe_ingredients").fetchone()["n"]
        print(f"[✓] Verified: recipe_ingredients has {total} rows, no recipes missing their ingredients.")
        return

    print(f"[!] {len(broken)} recipe(s) have ZERO ingredient rows — repairing now:")
    for recipe_name, recipe_id, ingredients in broken:
        print(f"    - {recipe_name}")
        for order_idx, (ing_name, qty_g) in enumerate(ingredients):
            ing_row = conn.execute("SELECT id FROM ingredients WHERE name = ?", (ing_name,)).fetchone()
            if not ing_row:
                print(f"      [!] Ingredient not found: '{ing_name}' — skipping")
                continue
            conn.execute("""
                INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity_g, order_index)
                VALUES (?, ?, ?, ?)
            """, (recipe_id, ing_row["id"], qty_g, order_idx))
        conn.commit()

    total = conn.execute("SELECT COUNT(*) AS n FROM recipe_ingredients").fetchone()["n"]
    print(f"[✓] Repair complete. recipe_ingredients now has {total} rows.")


def main():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    is_new_db = not os.path.exists(DB_PATH)

    conn = get_conn()
    ensure_base_schema(conn)
    if is_new_db:
        print(f"[+] Created new database at {DB_PATH} (no prior fitness.db found).")
        print("    Run setup_profile.py afterwards to set your athlete profile.")
    else:
        print(f"[i] Using existing database at {DB_PATH}.")
        print("    NOTE: if your API server (uvicorn) is currently running, stop it")
        print("    first — running this migration while the API is live can cause")
        print("    'database is locked' errors and partial writes.")

    migrate(conn)
    upgrade_existing_recipes_table(conn)
    fix_stale_recipe_ingredients_fk(conn)
    seed_ingredients(conn)
    seed_recipes(conn)
    verify_recipe_ingredients(conn)
    conn.close()
    print("[✓] Migration complete.")


if __name__ == "__main__":
    main()