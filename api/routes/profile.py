from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import memory_manager as mm

router = APIRouter()


class ProfileIn(BaseModel):
    name: str
    age: int
    sex: str
    height_cm: float
    weight_start_kg: float
    activity_level: str
    goal_type: str
    injuries: Optional[List[str]] = []


@router.get("")
def get_profile():
    profile = mm.get_profile()
    if not profile:
        raise HTTPException(status_code=404, detail="No profile found")
    return profile


@router.post("")
def save_profile(data: ProfileIn):
    mm.save_profile(
        name=data.name,
        age=data.age,
        sex=data.sex,
        height_cm=data.height_cm,
        weight_start_kg=data.weight_start_kg,
        activity_level=data.activity_level,
        goal_type=data.goal_type,
        injuries=data.injuries,
    )
    return {"status": "saved"}