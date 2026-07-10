from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import sqlite3
import os
import work_schedule as ws

router = APIRouter()

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "db", "fitness.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


VALID_BLOCK_TYPES = {"work", "workout", "meal1", "meal2", "meal3", "custom"}
VALID_CATEGORIES = {"work", "workout", "meal", "entertainment", "other"}


class BlockIn(BaseModel):
    date: str
    block_type: str
    category: Optional[str] = None
    title: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    notes: Optional[str] = None


class BlockPatch(BaseModel):
    category: Optional[str] = None
    title: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    notes: Optional[str] = None


class SettingsPatch(BaseModel):
    regime_anchor_date: Optional[str] = None
    regime_length_days: Optional[int] = None
    cycle_length_days: Optional[int] = None
    morning_start: Optional[str] = None
    morning_end: Optional[str] = None
    evening_start: Optional[str] = None
    evening_end: Optional[str] = None
    night_start: Optional[str] = None
    night_end: Optional[str] = None
    default_workout_duration_min: Optional[int] = None
    workout_buffer_after_work_min: Optional[int] = None
    workout_buffer_before_work_min: Optional[int] = None
    rest_day_workout_time: Optional[str] = None


class MealRulePatch(BaseModel):
    meal1_label: Optional[str] = None
    meal1_time: Optional[str] = None
    meal2_label: Optional[str] = None
    meal2_time: Optional[str] = None
    meal3_label: Optional[str] = None
    meal3_time: Optional[str] = None


def _default_category(block_type: str) -> str:
    return {"work": "work", "workout": "workout", "meal1": "meal", "meal2": "meal", "meal3": "meal"}.get(block_type, "other")


# ── Day plan (merged auto + manual timeline for one date) ──────────────

@router.get("")
def get_day_plan(date: str):
    try:
        return ws.get_day_plan(date)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not compute day plan: {e}")


@router.post("")
def create_block(data: BlockIn):
    """Add a manual/custom block, or materialize an override of an auto slot."""
    if data.block_type not in VALID_BLOCK_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid block_type. Must be one of {sorted(VALID_BLOCK_TYPES)}")
    category = data.category if data.category in VALID_CATEGORIES else _default_category(data.block_type)
    conn = get_conn()
    try:
        # Singleton block types (work/workout/meal1/meal2/meal3) can only have
        # one active override row per date — replace any existing one.
        if data.block_type != "custom":
            conn.execute(
                "DELETE FROM day_blocks WHERE date = ? AND block_type = ?",
                (data.date, data.block_type),
            )
        cur = conn.execute(
            """INSERT INTO day_blocks (date, block_type, category, title, start_time, end_time, status, source, notes)
               VALUES (?, ?, ?, ?, ?, ?, 'active', 'manual', ?)""",
            (data.date, data.block_type, category, data.title, data.start_time, data.end_time, data.notes),
        )
        conn.commit()
        return {"status": "saved", "id": cur.lastrowid}
    finally:
        conn.close()


@router.post("/hide-auto")
def hide_auto_block(date: str, block_type: str):
    """Suppresses an auto-suggested slot (work/workout/mealN) for a date, without deleting settings."""
    if block_type not in VALID_BLOCK_TYPES or block_type == "custom":
        raise HTTPException(status_code=400, detail="block_type must be work, workout, meal1, meal2, or meal3")
    conn = get_conn()
    try:
        conn.execute("DELETE FROM day_blocks WHERE date = ? AND block_type = ?", (date, block_type))
        conn.execute(
            """INSERT INTO day_blocks (date, block_type, status, source)
               VALUES (?, ?, 'hidden', 'manual')""",
            (date, block_type),
        )
        conn.commit()
        return {"status": "hidden"}
    finally:
        conn.close()


# ── Settings (the rotating shift pattern) ───────────────────────────────
# NOTE: these fixed-path routes (/settings, /meal-rules/...) must be
# registered BEFORE the /{block_id} routes below — otherwise Starlette
# matches "/settings" against the /{block_id} pattern first and FastAPI
# fails validation (422, "not a valid integer") before ever trying the
# correct route.

@router.get("/settings")
def get_settings():
    settings = ws.get_settings()
    if not settings:
        raise HTTPException(status_code=404, detail="No work schedule settings found — run db/migrate_dayplan.py")
    return settings


@router.patch("/settings")
def patch_settings(data: SettingsPatch):
    fields = {k: v for k, v in data.dict().items() if v is not None}
    ws.update_settings(fields)
    return {"status": "updated"}


# ── Meal time rules ──────────────────────────────────────────────────────

@router.get("/meal-rules")
def get_meal_rules():
    return ws.get_meal_rules()


@router.patch("/meal-rules/{shift_type}")
def patch_meal_rule(shift_type: str, data: MealRulePatch):
    if shift_type not in {"morning", "evening", "night", "rest"}:
        raise HTTPException(status_code=400, detail="Invalid shift_type")
    fields = {k: v for k, v in data.dict().items() if v is not None}
    ws.update_meal_rule(shift_type, fields)
    return {"status": "updated"}


# ── Day plan block CRUD by id (must come after /settings, /meal-rules) ──

@router.patch("/{block_id}")
def update_block(block_id: int, data: BlockPatch):
    conn = get_conn()
    try:
        fields, values = [], []
        if data.category   is not None and data.category in VALID_CATEGORIES:
            fields.append("category = ?");   values.append(data.category)
        if data.title      is not None: fields.append("title = ?");      values.append(data.title)
        if data.start_time is not None: fields.append("start_time = ?"); values.append(data.start_time)
        if data.end_time   is not None: fields.append("end_time = ?");   values.append(data.end_time)
        if data.notes      is not None: fields.append("notes = ?");      values.append(data.notes)
        if not fields:
            return {"status": "noop"}
        values.append(block_id)
        cur = conn.execute(f"UPDATE day_blocks SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Block not found")
        return {"status": "updated"}
    finally:
        conn.close()


@router.delete("/{block_id}")
def delete_block(block_id: int):
    """Deletes a manual/custom block outright. Use /hide-auto to suppress an auto slot."""
    conn = get_conn()
    try:
        cur = conn.execute("DELETE FROM day_blocks WHERE id = ?", (block_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Block not found")
        return {"status": "deleted"}
    finally:
        conn.close()