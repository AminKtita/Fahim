"""
memory_manager_meals.py — DB access layer for the Meal Composer feature.

Kept separate from memory_manager.py to avoid merge conflicts with the existing
file. api/routes/ imports from here directly.

All writes call snapshot_writer.update_all() only when nutrition_log is affected
(i.e. when meal_logs change). Ingredient/recipe CRUD does NOT refresh snapshots.
"""

import sqlite3
import os
from datetime import date

DB_PATH = os.path.join(os.path.dirname(__file__), "db", "fitness.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ─────────────────────────────────────────
#  INGREDIENTS
# ─────────────────────────────────────────

def get_all_ingredients(category: str = None) -> list[dict]:
    conn = get_conn()
    if category:
        rows = conn.execute(
            "SELECT * FROM ingredients WHERE category = ? ORDER BY name ASC",
            (category,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM ingredients ORDER BY category ASC, name ASC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_ingredient(ingredient_id: int) -> dict | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM ingredients WHERE id = ?", (ingredient_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def create_ingredient(
    name: str,
    category: str,
    calories_per_100g: float,
    protein_per_100g: float,
    carbs_per_100g: float,
    fat_per_100g: float,
    price_per_unit: float,
    unit_label: str,
    grams_per_unit: float,
    notes: str = None,
) -> int:
    conn = get_conn()
    cursor = conn.execute("""
        INSERT INTO ingredients
            (name, category, calories_per_100g, protein_per_100g, carbs_per_100g,
             fat_per_100g, price_per_unit, unit_label, grams_per_unit, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (name, category, calories_per_100g, protein_per_100g, carbs_per_100g,
          fat_per_100g, price_per_unit, unit_label, grams_per_unit, notes))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def update_ingredient(ingredient_id: int, fields: dict) -> None:
    """
    fields: any subset of ingredient columns.
    """
    allowed = {
        "name", "category", "calories_per_100g", "protein_per_100g",
        "carbs_per_100g", "fat_per_100g", "price_per_unit",
        "unit_label", "grams_per_unit", "notes",
    }
    clean = {k: v for k, v in fields.items() if k in allowed}
    if not clean:
        return
    cols = ", ".join(f"{k} = ?" for k in clean)
    values = list(clean.values()) + [ingredient_id]
    conn = get_conn()
    conn.execute(f"UPDATE ingredients SET {cols} WHERE id = ?", values)
    conn.commit()
    conn.close()


def delete_ingredient(ingredient_id: int) -> None:
    """
    Fails (SQLITE constraint) if the ingredient is used in any recipe.
    Caller must handle the IntegrityError and return a 409 to the frontend.
    """
    conn = get_conn()
    conn.execute("DELETE FROM ingredients WHERE id = ?", (ingredient_id,))
    conn.commit()
    conn.close()


def get_ingredient_categories() -> list[str]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT DISTINCT category FROM ingredients ORDER BY category ASC"
    ).fetchall()
    conn.close()
    return [r["category"] for r in rows]


# ─────────────────────────────────────────
#  RECIPES
# ─────────────────────────────────────────

# Fixed set of recipe categories — matches the CHECK constraint on recipes.category.
RECIPE_CATEGORIES = ["Breakfast", "Lunch/Dinner", "Snack/Base"]

def _attach_ingredients(conn, recipe: dict) -> dict:
    """
    Adds an 'ingredients' list to a recipe dict.
    Each item: { recipe_ingredient fields + ingredient fields + computed macros }
    """
    rows = conn.execute("""
        SELECT
            ri.id           AS ri_id,
            ri.quantity_g,
            ri.order_index,
            i.id            AS ingredient_id,
            i.name,
            i.category,
            i.unit_label,
            i.grams_per_unit,
            i.calories_per_100g,
            i.protein_per_100g,
            i.carbs_per_100g,
            i.fat_per_100g,
            i.price_per_unit
        FROM recipe_ingredients ri
        JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE ri.recipe_id = ?
        ORDER BY ri.order_index ASC
    """, (recipe["id"],)).fetchall()

    ingredients = []
    total_cal = total_prot = total_carbs = total_fat = 0.0

    for r in rows:
        qty_g = r["quantity_g"]
        factor = qty_g / 100.0
        cal   = round(r["calories_per_100g"] * factor, 1)
        prot  = round(r["protein_per_100g"]  * factor, 1)
        carbs = round(r["carbs_per_100g"]    * factor, 1)
        fat   = round(r["fat_per_100g"]      * factor, 1)

        # Display quantity in natural units
        grams_per_unit = r["grams_per_unit"] or 100
        quantity_units = round(qty_g / grams_per_unit, 2)

        ingredients.append({
            "ri_id":           r["ri_id"],
            "ingredient_id":   r["ingredient_id"],
            "name":            r["name"],
            "category":        r["category"],
            "unit_label":      r["unit_label"],
            "grams_per_unit":  grams_per_unit,
            "quantity_g":      qty_g,
            "quantity_units":  quantity_units,   # e.g. 3 (eggs), 0.5 (tuna can)
            "calories":        cal,
            "protein_g":       prot,
            "carbs_g":         carbs,
            "fat_g":           fat,
            "calories_per_100g": r["calories_per_100g"],
            "protein_per_100g":  r["protein_per_100g"],
            "carbs_per_100g":    r["carbs_per_100g"],
            "fat_per_100g":      r["fat_per_100g"],
        })
        total_cal   += cal
        total_prot  += prot
        total_carbs += carbs
        total_fat   += fat

    recipe["ingredients"]  = ingredients
    recipe["total_calories"] = round(total_cal, 1)
    recipe["total_protein"]  = round(total_prot, 1)
    recipe["total_carbs"]    = round(total_carbs, 1)
    recipe["total_fat"]      = round(total_fat, 1)
    return recipe


def get_all_recipes(category: str = None) -> list[dict]:
    conn = get_conn()
    if category:
        rows = conn.execute(
            "SELECT * FROM recipes WHERE category = ? ORDER BY name ASC",
            (category,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM recipes ORDER BY category ASC, name ASC"
        ).fetchall()
    recipes = [_attach_ingredients(conn, dict(r)) for r in rows]
    conn.close()
    return recipes


def get_recipe(recipe_id: int) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if not row:
        conn.close()
        return None
    recipe = _attach_ingredients(conn, dict(row))
    conn.close()
    return recipe


def create_recipe(
    name: str,
    category: str,
    image_url: str = None,
    video_url: str = None,
    notes: str = None,
    ingredients: list[dict] = None,
) -> int:
    """
    ingredients: list of { ingredient_id, quantity_g }
    category must be one of RECIPE_CATEGORIES (also enforced by a DB CHECK constraint).
    """
    conn = get_conn()
    cursor = conn.execute("""
        INSERT INTO recipes (name, category, image_url, video_url, notes)
        VALUES (?, ?, ?, ?, ?)
    """, (name, category, image_url, video_url, notes))
    recipe_id = cursor.lastrowid

    for idx, ing in enumerate(ingredients or []):
        conn.execute("""
            INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity_g, order_index)
            VALUES (?, ?, ?, ?)
        """, (recipe_id, ing["ingredient_id"], ing["quantity_g"], idx))

    conn.commit()
    conn.close()
    return recipe_id


def update_recipe(recipe_id: int, fields: dict, ingredients: list[dict] = None) -> None:
    """
    fields: any subset of recipe columns (name, category, image_url, video_url, notes).
    ingredients: if provided, replaces all recipe_ingredients for this recipe.
    """
    allowed = {"name", "category", "image_url", "video_url", "notes"}
    clean = {k: v for k, v in fields.items() if k in allowed}

    conn = get_conn()
    if clean:
        cols = ", ".join(f"{k} = ?" for k in clean)
        values = list(clean.values()) + [recipe_id]
        conn.execute(f"UPDATE recipes SET {cols} WHERE id = ?", values)

    if ingredients is not None:
        conn.execute("DELETE FROM recipe_ingredients WHERE recipe_id = ?", (recipe_id,))
        for idx, ing in enumerate(ingredients):
            conn.execute("""
                INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity_g, order_index)
                VALUES (?, ?, ?, ?)
            """, (recipe_id, ing["ingredient_id"], ing["quantity_g"], idx))

    conn.commit()
    conn.close()


def delete_recipe(recipe_id: int) -> None:
    conn = get_conn()
    conn.execute("DELETE FROM recipe_ingredients WHERE recipe_id = ?", (recipe_id,))
    conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    conn.commit()
    conn.close()


def get_recipe_categories() -> list[str]:
    """Returns the fixed set of valid recipe categories, for populating a dropdown."""
    return list(RECIPE_CATEGORIES)


# ─────────────────────────────────────────
#  MEAL LOGS
# ─────────────────────────────────────────

def log_meal(
    log_date: str,
    calories: float,
    protein_g: float,
    carbs_g: float,
    fat_g: float,
    recipe_id: int = None,
    recipe_name_snapshot: str = None,
    notes: str = None,
) -> int:
    conn = get_conn()
    cursor = conn.execute("""
        INSERT INTO meal_logs
            (log_date, recipe_id, recipe_name_snapshot,
             calories, protein_g, carbs_g, fat_g, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    """, (log_date, recipe_id, recipe_name_snapshot, calories, protein_g, carbs_g, fat_g, notes))
    meal_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return meal_id


def get_meals_for_date(log_date: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM meal_logs WHERE log_date = ? ORDER BY created_at ASC
    """, (log_date,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_meal(meal_id: int) -> None:
    conn = get_conn()
    conn.execute("DELETE FROM meal_logs WHERE id = ?", (meal_id,))
    conn.commit()
    conn.close()


def get_daily_meal_totals(log_date: str) -> dict:
    """
    Sums all meal_logs for a date → returns macro totals.
    Used to auto-update nutrition_log after meal changes.
    """
    conn = get_conn()
    row = conn.execute("""
        SELECT
            COALESCE(SUM(calories),  0) AS calories,
            COALESCE(SUM(protein_g), 0) AS protein_g,
            COALESCE(SUM(carbs_g),   0) AS carbs_g,
            COALESCE(SUM(fat_g),     0) AS fat_g
        FROM meal_logs
        WHERE log_date = ?
    """, (log_date,)).fetchone()
    conn.close()
    return {
        "calories":  round(dict(row)["calories"],  1),
        "protein_g": round(dict(row)["protein_g"], 1),
        "carbs_g":   round(dict(row)["carbs_g"],   1),
        "fat_g":     round(dict(row)["fat_g"],     1),
    }