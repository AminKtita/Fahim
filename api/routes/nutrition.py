from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import memory_manager as mm
import snapshot_writer
import sqlite3, os

router = APIRouter()

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "db", "fitness.db")

def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


class NutritionIn(BaseModel):
    date: str
    calories: Optional[int] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    water_ml: Optional[int] = None
    notes: Optional[str] = None


@router.get("")
def get_nutrition(days: int = 30):
    return mm.get_nutrition(days=days)


@router.post("")
def log_nutrition(data: NutritionIn):
    mm.log_nutrition(
        log_date=data.date,
        calories=data.calories,
        protein_g=data.protein_g,
        carbs_g=data.carbs_g,
        fat_g=data.fat_g,
        water_ml=data.water_ml,
        notes=data.notes,
    )
    snapshot_writer.update_all()
    return {"status": "saved"}


@router.patch("/{log_date}")
def update_nutrition(log_date: str, data: NutritionIn):
    conn = get_conn()
    try:
        fields, values = [], []
        if data.calories  is not None: fields.append("calories = ?");  values.append(data.calories)
        if data.protein_g is not None: fields.append("protein_g = ?"); values.append(data.protein_g)
        if data.carbs_g   is not None: fields.append("carbs_g = ?");   values.append(data.carbs_g)
        if data.fat_g     is not None: fields.append("fat_g = ?");     values.append(data.fat_g)
        if data.water_ml  is not None: fields.append("water_ml = ?");  values.append(data.water_ml)
        if data.notes     is not None: fields.append("notes = ?");     values.append(data.notes)
        if fields:
            values.append(log_date)
            conn.execute(f"UPDATE nutrition_log SET {', '.join(fields)} WHERE date = ?", values)
        conn.commit()
    finally:
        conn.close()
    snapshot_writer.update_all()
    return {"status": "updated"}


@router.delete("/{log_date}")
def delete_nutrition(log_date: str):
    conn = get_conn()
    try:
        conn.execute("DELETE FROM nutrition_log WHERE date = ?", (log_date,))
        conn.commit()
    finally:
        conn.close()
    snapshot_writer.update_all()
    return {"status": "deleted"}