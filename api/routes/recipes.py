"""
/api/recipes — full CRUD for the recipe library.
Each GET response includes computed macros per ingredient and totals.

Recipe category is restricted to a fixed set (Breakfast, Lunch/Dinner,
Snack/Base) — enforced here via Pydantic Literal (clean 422 on bad input)
and again at the DB layer via a CHECK constraint (belt and suspenders).
"""

import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import logging
import traceback
import sqlite3
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Literal
import memory_manager_meals as mm

router = APIRouter()
logger = logging.getLogger("fahim.recipes")

RecipeCategory = Literal["Breakfast", "Lunch/Dinner", "Snack/Base"]


class RecipeIngredientIn(BaseModel):
    ingredient_id: int
    quantity_g: float


class RecipeIn(BaseModel):
    name: str
    category: RecipeCategory
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    notes: Optional[str] = None
    ingredients: List[RecipeIngredientIn] = []


class RecipePatch(BaseModel):
    name: Optional[str] = None
    category: Optional[RecipeCategory] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    notes: Optional[str] = None
    ingredients: Optional[List[RecipeIngredientIn]] = None


@router.get("")
def list_recipes(category: Optional[str] = None):
    try:
        return mm.get_all_recipes(category=category)
    except Exception as e:
        logger.error("GET /api/recipes failed:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@router.get("/categories")
def list_recipe_categories():
    return mm.get_recipe_categories()


@router.get("/{recipe_id}")
def get_recipe(recipe_id: int):
    recipe = mm.get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.post("", status_code=201)
def create_recipe(data: RecipeIn):
    try:
        new_id = mm.create_recipe(
            name=data.name,
            category=data.category,
            image_url=data.image_url,
            video_url=data.video_url,
            notes=data.notes,
            ingredients=[i.model_dump() for i in data.ingredients],
        )
        return {"status": "created", "id": new_id}
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=409, detail=f"Recipe name already exists: {e}")


@router.patch("/{recipe_id}")
def update_recipe(recipe_id: int, data: RecipePatch):
    recipe = mm.get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    fields = data.model_dump(exclude_none=True, exclude={"ingredients"})
    ingredients = None
    if data.ingredients is not None:
        ingredients = [i.model_dump() for i in data.ingredients]

    try:
        mm.update_recipe(recipe_id, fields, ingredients=ingredients)
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=409, detail=f"Update failed: {e}")
    return {"status": "updated"}


@router.delete("/{recipe_id}")
def delete_recipe(recipe_id: int):
    recipe = mm.get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    mm.delete_recipe(recipe_id)
    return {"status": "deleted"}