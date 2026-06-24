"""
/api/meals — log individual meals per day, linked to recipes or free-text.

After any meal write, this route automatically syncs the nutrition_log table
for that day (summing all meal_logs → upserts nutrition_log row).
"""

import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import logging
import traceback
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import memory_manager_meals as mm
import memory_manager as nutrition_mm
import snapshot_writer

router = APIRouter()
logger = logging.getLogger("fahim.meals")


class MealIn(BaseModel):
    log_date: str
    recipe_id: Optional[int] = None
    recipe_name_snapshot: Optional[str] = None
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    notes: Optional[str] = None


def _sync_nutrition_log(log_date: str):
    """
    Recalculates totals from all meal_logs for the date and upserts
    into nutrition_log so the rest of the app (coach, snapshots, streak)
    sees accurate daily totals.
    """
    totals = mm.get_daily_meal_totals(log_date)
    nutrition_mm.log_nutrition(
        log_date=log_date,
        calories=round(totals["calories"]),
        protein_g=totals["protein_g"],
        carbs_g=totals["carbs_g"],
        fat_g=totals["fat_g"],
    )


@router.get("")
def get_meals(date: str):
    """GET /api/meals?date=YYYY-MM-DD"""
    return mm.get_meals_for_date(date)


@router.get("/totals")
def get_meal_totals(date: str):
    """GET /api/meals/totals?date=YYYY-MM-DD — macro sum for the day"""
    return mm.get_daily_meal_totals(date)


@router.post("", status_code=201)
def log_meal(data: MealIn):
    try:
        meal_id = mm.log_meal(
            log_date=data.log_date,
            calories=data.calories,
            protein_g=data.protein_g,
            carbs_g=data.carbs_g,
            fat_g=data.fat_g,
            recipe_id=data.recipe_id,
            recipe_name_snapshot=data.recipe_name_snapshot,
            notes=data.notes,
        )
        _sync_nutrition_log(data.log_date)
        snapshot_writer.update_all()
        return {"status": "saved", "meal_id": meal_id}
    except Exception as e:
        # Log the FULL traceback to the uvicorn terminal so the real cause
        # is visible there, and return it in the response detail too (this
        # is a local single-user dev app, not a public API, so it's safe to
        # surface internal error detail to the caller).
        logger.error("POST /api/meals failed:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@router.delete("/{meal_id}")
def delete_meal(meal_id: int, date: str):
    """DELETE /api/meals/{meal_id}?date=YYYY-MM-DD"""
    try:
        mm.delete_meal(meal_id)
        _sync_nutrition_log(date)
        snapshot_writer.update_all()
        return {"status": "deleted"}
    except Exception as e:
        logger.error("DELETE /api/meals/%s failed:\n%s", meal_id, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")