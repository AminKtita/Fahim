from fastapi import APIRouter, HTTPException
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


class GoalIn(BaseModel):
    title: str
    metric: str
    target_value: float
    current_value: Optional[float] = None
    deadline: Optional[str] = None


class GoalUpdateIn(BaseModel):
    current_value: Optional[float] = None
    status: Optional[str] = None
    title: Optional[str] = None
    metric: Optional[str] = None
    target_value: Optional[float] = None
    deadline: Optional[str] = None


@router.get("")
def get_goals(status: str = "active"):
    return mm.get_goals(status=status)


@router.post("")
def create_goal(data: GoalIn):
    mm.save_goal(
        title=data.title,
        metric=data.metric,
        target_value=data.target_value,
        current_value=data.current_value,
        deadline=data.deadline,
    )
    snapshot_writer.update_all()
    return {"status": "saved"}


@router.patch("/{goal_id}")
def update_goal(goal_id: int, data: GoalUpdateIn):
    with get_conn() as conn:
        # build dynamic update from only provided fields
        fields, values = [], []
        if data.current_value is not None:
            fields.append("current_value = ?"); values.append(data.current_value)
        if data.status is not None:
            fields.append("status = ?"); values.append(data.status)
        if data.title is not None:
            fields.append("title = ?"); values.append(data.title)
        if data.metric is not None:
            fields.append("metric = ?"); values.append(data.metric)
        if data.target_value is not None:
            fields.append("target_value = ?"); values.append(data.target_value)
        if data.deadline is not None:
            fields.append("deadline = ?"); values.append(data.deadline)
        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        values.append(goal_id)
        conn.execute(f"UPDATE goals SET {', '.join(fields)} WHERE id = ?", values)
    snapshot_writer.update_all()
    return {"status": "updated"}


@router.delete("/{goal_id}")
def delete_goal(goal_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
    snapshot_writer.update_all()
    return {"status": "deleted"}