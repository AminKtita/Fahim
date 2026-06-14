from fastapi import APIRouter, HTTPException
import memory_manager as mm

router = APIRouter()


@router.get("")
def get_active_plan():
    """Returns the active training plan with its days and exercises."""
    try:
        plan = mm.get_active_plan()
        if not plan:
            return {}
        days = mm.get_plan_days(plan["id"])
        for day in days:
            day["exercises"] = mm.get_plan_exercises(day["id"])
        plan["days"] = days
        targets = mm.get_active_nutrition_targets()
        plan["nutrition_targets"] = targets or {}
        return plan
    except AttributeError:
        # get_active_plan / get_plan_days not yet in memory_manager
        raise HTTPException(
            status_code=501,
            detail="Plan functions not implemented in memory_manager.py yet"
        )