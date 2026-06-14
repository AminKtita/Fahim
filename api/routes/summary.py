from fastapi import APIRouter
import memory_manager as mm

router = APIRouter()


@router.get("")
def get_summaries(days: int = 14):
    """
    NOTE: the old daily_summary table/mechanism was removed (it was never
    populated correctly — see memory_manager.compute_streak() rewrite).
    This endpoint now returns an empty list to preserve the API contract
    (frontend expects an array) without crashing. The frontend pages that
    consumed this (Overview, Progress, Schedule) are using it for
    coach_note / weight_kg / workout_done — all of which were always
    empty/zero from the dead table anyway, so this is a no-op change
    in practice. See follow-up notes for replacing these call sites
    with the correct data sources (getLatestMetrics, getWeightTrend,
    getWorkouts).
    """
    return []


@router.get("/streak")
def get_streak():
    return {"streak": mm.compute_streak()}