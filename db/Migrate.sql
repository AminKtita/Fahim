-- Fahim DB migration — run once on an existing fitness.db
-- Safe to run multiple times (uses IF NOT EXISTS / ignore-on-conflict patterns).
-- Back up your db/fitness.db before running this.
--
-- Usage:
--   sqlite3 db/fitness.db < db/migrate.sql
-- Or via Python:
--   python db/init_db.py --migrate

PRAGMA foreign_keys = OFF;
BEGIN;

-- ─── 1. goals.status: enforce valid values ───────────────────────────────────
-- SQLite cannot add CHECK constraints to existing tables via ALTER TABLE.
-- We rename → recreate → copy → drop instead.
-- Any rows with status='achieved' are remapped to 'completed'.
-- Any rows with status='paused'   are remapped to 'active'.

CREATE TABLE IF NOT EXISTS goals_new (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    metric        TEXT,
    target_value  REAL,
    current_value REAL,
    deadline      DATE,
    status        TEXT DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'abandoned')),
    created_at    DATE
);

INSERT OR IGNORE INTO goals_new
    (id, title, metric, target_value, current_value, deadline, status, created_at)
SELECT
    id, title, metric, target_value, current_value, deadline,
    CASE status
        WHEN 'achieved' THEN 'completed'
        WHEN 'paused'   THEN 'active'
        ELSE status
    END,
    created_at
FROM goals;

DROP TABLE goals;
ALTER TABLE goals_new RENAME TO goals;


-- ─── 2. body_metrics: add UNIQUE(date) ───────────────────────────────────────
-- Deduplicate first: keep only the most recently inserted row per date.
DELETE FROM body_metrics
WHERE id NOT IN (
    SELECT MAX(id) FROM body_metrics GROUP BY date
);

CREATE TABLE IF NOT EXISTS body_metrics_new (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         DATE NOT NULL UNIQUE,
    weight_kg    REAL,
    body_fat_pct REAL,
    waist_cm     REAL,
    chest_cm     REAL,
    hips_cm      REAL,
    arm_cm       REAL,
    thigh_cm     REAL,
    notes        TEXT
);

INSERT OR IGNORE INTO body_metrics_new
    SELECT * FROM body_metrics;

DROP TABLE body_metrics;
ALTER TABLE body_metrics_new RENAME TO body_metrics;


-- ─── 3. meal_logs.created_at: add DEFAULT (datetime('now')) ──────────────────
-- SQLite does not support ALTER COLUMN DEFAULT. Rename → recreate → copy.
-- Existing NULL rows get the migration timestamp as a fallback.

CREATE TABLE IF NOT EXISTS meal_logs_new (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date             TEXT NOT NULL,
    recipe_id            INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    recipe_name_snapshot TEXT,
    calories             REAL NOT NULL DEFAULT 0,
    protein_g            REAL NOT NULL DEFAULT 0,
    carbs_g              REAL NOT NULL DEFAULT 0,
    fat_g                REAL NOT NULL DEFAULT 0,
    notes                TEXT,
    created_at           TEXT DEFAULT (datetime('now'))
);

INSERT INTO meal_logs_new
    (id, log_date, recipe_id, recipe_name_snapshot,
     calories, protein_g, carbs_g, fat_g, notes, created_at)
SELECT
    id, log_date, recipe_id, recipe_name_snapshot,
    calories, protein_g, carbs_g, fat_g, notes,
    COALESCE(created_at, datetime('now'))
FROM meal_logs;

DROP TABLE meal_logs;
ALTER TABLE meal_logs_new RENAME TO meal_logs;

CREATE INDEX IF NOT EXISTS idx_meal_logs_date ON meal_logs(log_date);


-- ─── Re-create all indexes that may have been dropped above ──────────────────
CREATE INDEX IF NOT EXISTS idx_exercises_exercise_id    ON exercises(exercise_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_id ON workout_sets(exercise_id);
CREATE INDEX IF NOT EXISTS idx_plan_exercises_exercise_id ON plan_exercises(exercise_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe  ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_exercise_images_exercise_id ON exercise_images(exercise_id);

COMMIT;
PRAGMA foreign_keys = ON;