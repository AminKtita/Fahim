from fastapi import APIRouter
import memory_manager as mm

router = APIRouter()


@router.get("")
def get_summaries(days: int = 14):
    return mm.get_daily_summaries(days=days)


@router.get("/streak")
def get_streak():
    return {"streak": mm.compute_streak()}