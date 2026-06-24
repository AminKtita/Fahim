"""
/api/ingredients — full CRUD for the ingredient library.
"""

import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import sqlite3
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import memory_manager_meals as mm

router = APIRouter()


class IngredientIn(BaseModel):
    name: str
    category: str
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    price_per_unit: float
    unit_label: str = "g"
    grams_per_unit: float = 100.0
    notes: Optional[str] = None


class IngredientPatch(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    calories_per_100g: Optional[float] = None
    protein_per_100g: Optional[float] = None
    carbs_per_100g: Optional[float] = None
    fat_per_100g: Optional[float] = None
    price_per_unit: Optional[float] = None
    unit_label: Optional[str] = None
    grams_per_unit: Optional[float] = None
    notes: Optional[str] = None


@router.get("")
def list_ingredients(category: Optional[str] = None):
    return mm.get_all_ingredients(category=category)


@router.get("/categories")
def list_ingredient_categories():
    return mm.get_ingredient_categories()


@router.get("/{ingredient_id}")
def get_ingredient(ingredient_id: int):
    ing = mm.get_ingredient(ingredient_id)
    if not ing:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    return ing


@router.post("", status_code=201)
def create_ingredient(data: IngredientIn):
    try:
        new_id = mm.create_ingredient(
            name=data.name,
            category=data.category,
            calories_per_100g=data.calories_per_100g,
            protein_per_100g=data.protein_per_100g,
            carbs_per_100g=data.carbs_per_100g,
            fat_per_100g=data.fat_per_100g,
            price_per_unit=data.price_per_unit,
            unit_label=data.unit_label,
            grams_per_unit=data.grams_per_unit,
            notes=data.notes,
        )
        return {"status": "created", "id": new_id}
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=409, detail=f"Ingredient name already exists: {e}")


@router.patch("/{ingredient_id}")
def update_ingredient(ingredient_id: int, data: IngredientPatch):
    ing = mm.get_ingredient(ingredient_id)
    if not ing:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    mm.update_ingredient(ingredient_id, data.model_dump(exclude_none=True))
    return {"status": "updated"}


@router.delete("/{ingredient_id}")
def delete_ingredient(ingredient_id: int):
    ing = mm.get_ingredient(ingredient_id)
    if not ing:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    try:
        mm.delete_ingredient(ingredient_id)
        return {"status": "deleted"}
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: ingredient is used in one or more recipes. Remove it from all recipes first."
        )
