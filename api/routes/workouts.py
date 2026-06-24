from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
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


class SetIn(BaseModel):
    exercise: str
    set_number: int
    reps: Optional[int] = None
    weight_kg: Optional[float] = None
    rpe: Optional[int] = None
    is_warmup: bool = False
    notes: Optional[str] = None
    # Optional link to the canonical exercises library row. Metadata
    # (equipment, body part, cues, media) is not duplicated here — it's
    # fetched via JOIN against the exercises table when reading sets back.
    exercise_id: Optional[str] = None


class WorkoutIn(BaseModel):
    date: str
    session_type: str
    duration_min: Optional[int] = None
    perceived_effort: Optional[int] = None
    notes: Optional[str] = None
    sets: List[SetIn] = []


class WorkoutPatch(BaseModel):
    session_type: Optional[str] = None
    duration_min: Optional[int] = None
    perceived_effort: Optional[int] = None
    notes: Optional[str] = None
    sets: Optional[List[SetIn]] = None


@router.get("")
def get_workouts(days: int = 7):
    workouts = mm.get_workouts(days=days)
    for w in workouts:
        w["sets"] = mm.get_sets_for_workout(w["id"])
    return workouts


@router.get("/exercise/{exercise}")
def get_exercise_history(exercise: str, limit: int = 10):
    return mm.get_exercise_history(exercise, limit=limit)


@router.get("/{workout_id}/sets")
def get_sets(workout_id: int):
    return mm.get_sets_for_workout(workout_id)


@router.post("")
def log_workout(data: WorkoutIn):
    workout_id = mm.log_workout(
        session_date=data.date,
        session_type=data.session_type,
        duration_min=data.duration_min,
        perceived_effort=data.perceived_effort,
        notes=data.notes,
    )
    for i, s in enumerate(data.sets, 1):
        mm.log_set(
            workout_id=workout_id,
            exercise=s.exercise,
            set_number=s.set_number or i,
            reps=s.reps,
            weight_kg=s.weight_kg,
            rpe=s.rpe,
            is_warmup=s.is_warmup,
            notes=s.notes,
            exercise_id=s.exercise_id,
        )
    snapshot_writer.update_all()
    return {"status": "saved", "workout_id": workout_id}


@router.patch("/{workout_id}")
def update_workout(workout_id: int, data: WorkoutPatch):
    conn = get_conn()
    try:
        fields, values = [], []
        if data.session_type   is not None: fields.append("session_type = ?");   values.append(data.session_type)
        if data.duration_min   is not None: fields.append("duration_min = ?");   values.append(data.duration_min)
        if data.perceived_effort is not None: fields.append("perceived_effort = ?"); values.append(data.perceived_effort)
        if data.notes          is not None: fields.append("notes = ?");          values.append(data.notes)
        if fields:
            values.append(workout_id)
            conn.execute(f"UPDATE workouts SET {', '.join(fields)} WHERE id = ?", values)
        # replace sets if provided
        if data.sets is not None:
            conn.execute("DELETE FROM workout_sets WHERE workout_id = ?", (workout_id,))
            for i, s in enumerate(data.sets, 1):
                conn.execute(
                    """INSERT INTO workout_sets
                        (workout_id, exercise, exercise_id, set_number, reps, weight_kg, rpe, is_warmup, notes)
                       VALUES (?,?,?,?,?,?,?,?,?)""",
                    (workout_id, s.exercise, s.exercise_id, s.set_number or i, s.reps, s.weight_kg, s.rpe, s.is_warmup, s.notes)
                )
        conn.commit()
    finally:
        conn.close()
    snapshot_writer.update_all()
    return {"status": "updated"}


@router.delete("/{workout_id}")
def delete_workout(workout_id: int):
    conn = get_conn()
    try:
        conn.execute("DELETE FROM workout_sets WHERE workout_id = ?", (workout_id,))
        conn.execute("DELETE FROM workouts WHERE id = ?", (workout_id,))
        conn.commit()
    finally:
        conn.close()
    snapshot_writer.update_all()
    return {"status": "deleted"}