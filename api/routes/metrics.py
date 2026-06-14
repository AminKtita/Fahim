from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import memory_manager as mm
import snapshot_writer

router = APIRouter()


class MetricsIn(BaseModel):
    date: str
    weight_kg: Optional[float] = None
    body_fat_pct: Optional[float] = None
    waist_cm: Optional[float] = None
    chest_cm: Optional[float] = None
    hips_cm: Optional[float] = None
    arm_cm: Optional[float] = None
    thigh_cm: Optional[float] = None
    notes: Optional[str] = None


@router.get("")
def get_latest_metrics():
    return mm.get_latest_metrics() or {}


@router.get("/trend")
def get_weight_trend(days: int = 90):
    return mm.get_weight_trend(days=days)


@router.post("")
def log_metrics(data: MetricsIn):
    mm.log_body_metrics(
        log_date=data.date,
        weight_kg=data.weight_kg,
        body_fat_pct=data.body_fat_pct,
        waist_cm=data.waist_cm,
        chest_cm=data.chest_cm,
        hips_cm=data.hips_cm,
        arm_cm=data.arm_cm,
        thigh_cm=data.thigh_cm,
        notes=data.notes,
    )
    snapshot_writer.update_all()
    return {"status": "saved"}