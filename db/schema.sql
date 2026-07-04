-- Fahim fitness DB schema
-- Apply corrections via db/migrate.sql on an existing database.
-- For a fresh database run: python db/init_db.py

CREATE TABLE IF NOT EXISTS user_profile (
    id              INTEGER PRIMARY KEY,
    name            TEXT,
    age             INTEGER,
    sex             TEXT,
    height_cm       REAL,
    weight_start_kg REAL,
    activity_level  TEXT,  -- sedentary / light / moderate / very_active
    goal_type       TEXT,  -- cut / bulk / recomp / endurance / strength
    injuries        TEXT,  -- JSON array of injury notes
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workouts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    date             DATE NOT NULL,
    session_type     TEXT,    -- push / pull / legs / upper / cardio / full_body
    duration_min     INTEGER,
    perceived_effort INTEGER, -- 1–10 RPE
    notes            TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- UNIQUE(date) enforced: ON CONFLICT DO UPDATE preserves water_ml and notes
-- when synced from meal_logs, and overwrites when the user edits directly.
CREATE TABLE IF NOT EXISTS nutrition_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       DATE UNIQUE NOT NULL,
    calories   INTEGER,
    protein_g  REAL,
    carbs_g    REAL,
    fat_g      REAL,
    water_ml   INTEGER,
    notes      TEXT  -- meal names, supplements, fasting window, etc.
);

-- UNIQUE(date): a second entry for the same day overwrites the first silently.
CREATE TABLE IF NOT EXISTS body_metrics (
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

-- Valid status values: active / completed / abandoned
CREATE TABLE IF NOT EXISTS goals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    metric        TEXT,         -- e.g. "bench_press_1rm_kg", "weight_kg"
    target_value  REAL,
    current_value REAL,
    deadline      DATE,
    status        TEXT DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'abandoned')),
    created_at    DATE
);

-- daily_summary: currently written by scheduler (not active in dashboard mode).
-- Kept for future use; coach_note and streak_days are never auto-populated yet.
CREATE TABLE IF NOT EXISTS daily_summary (
    date          DATE PRIMARY KEY,
    workout_done  BOOLEAN,
    calories_hit  BOOLEAN,
    protein_hit   BOOLEAN,
    weight_kg     REAL,
    coach_note    TEXT,
    streak_days   INTEGER
);

CREATE TABLE IF NOT EXISTS training_plan (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT,
    split_type       TEXT,        -- ppl / upper_lower / full_body
    days_per_week    INTEGER,
    mesocycle_number INTEGER DEFAULT 1,
    start_date       DATE,
    end_date         DATE,        -- calculated from deload_week * 7 days
    deload_week      INTEGER,     -- plan length in weeks
    notes            TEXT,
    is_active        INTEGER DEFAULT 1,
    created_at       DATE
);

CREATE TABLE IF NOT EXISTS plan_days (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id      INTEGER REFERENCES training_plan(id),
    day_name     TEXT,   -- monday / tuesday etc.
    session_type TEXT,   -- push / pull / legs / rest
    order_index  INTEGER -- 1,2,3... for ordering
);

CREATE TABLE IF NOT EXISTS nutrition_targets (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id   INTEGER REFERENCES training_plan(id),
    calories  INTEGER,
    protein_g INTEGER,
    carbs_g   INTEGER,
    fat_g     INTEGER,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS exercises (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id      TEXT UNIQUE NOT NULL,
    exercise_name    TEXT NOT NULL,
    body_part        TEXT,
    movement_pattern TEXT,
    primary_muscles  TEXT,
    secondary_muscles TEXT,
    equipment        TEXT,
    difficulty       TEXT,
    image_url        TEXT,
    video_url        TEXT,
    instructions     TEXT,
    technique_cues   TEXT,
    common_mistakes  TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exercises_exercise_id ON exercises(exercise_id);

CREATE TABLE IF NOT EXISTS ingredients (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL UNIQUE,
    category          TEXT NOT NULL DEFAULT 'Other',
    calories_per_100g REAL NOT NULL DEFAULT 0,
    protein_per_100g  REAL NOT NULL DEFAULT 0,
    carbs_per_100g    REAL NOT NULL DEFAULT 0,
    fat_per_100g      REAL NOT NULL DEFAULT 0,
    price_per_unit    REAL NOT NULL DEFAULT 0,
    unit_label        TEXT NOT NULL DEFAULT 'g',
    grams_per_unit    REAL NOT NULL DEFAULT 100,
    notes             TEXT,
    created_at        TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS recipes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL UNIQUE,
    category  TEXT NOT NULL DEFAULT 'Lunch/Dinner'
              CHECK (category IN ('Breakfast', 'Lunch/Dinner', 'Snack/Base')),
    image_url TEXT,
    video_url TEXT,
    notes     TEXT,
    created_at TEXT DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS workout_sets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id  INTEGER REFERENCES workouts(id),
    exercise    TEXT NOT NULL,
    exercise_id TEXT REFERENCES exercises(exercise_id),
    set_number  INTEGER,
    reps        INTEGER,
    weight_kg   REAL,
    rpe         INTEGER,
    is_warmup   BOOLEAN DEFAULT 0,
    notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_id ON workout_sets(exercise_id);

CREATE TABLE IF NOT EXISTS plan_exercises (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_day_id      INTEGER REFERENCES plan_days(id),
    exercise         TEXT,
    exercise_id      TEXT REFERENCES exercises(exercise_id),
    sets             INTEGER,
    reps             TEXT,   -- stored as text to support ranges like "8-10"
    rir              INTEGER,
    rest_sec         INTEGER,
    tempo            TEXT,
    progression_rule TEXT,
    notes            TEXT,
    order_index      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_plan_exercises_exercise_id ON plan_exercises(exercise_id);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id     INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity_g    REAL NOT NULL DEFAULT 0,
    order_index   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

-- created_at has a DEFAULT so ordering by insertion time works correctly.
CREATE TABLE IF NOT EXISTS meal_logs (
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

CREATE INDEX IF NOT EXISTS idx_meal_logs_date ON meal_logs(log_date);

CREATE TABLE IF NOT EXISTS exercise_images (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id TEXT NOT NULL REFERENCES exercises(exercise_id),
    source      TEXT NOT NULL CHECK(source IN ('upload', 'url')),
    path_or_url TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exercise_images_exercise_id ON exercise_images(exercise_id);