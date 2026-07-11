from fastapi import APIRouter, Query
import meal_recommender as mr

router = APIRouter()


@router.get("")
def get_meal_plan(date: str, num_meals: int = Query(3, ge=2, le=5)):
    """
    GET /api/meal-recommend?date=YYYY-MM-DD&num_meals=3

    Returns a full-day meal recommendation: for each slot, the best-fit
    recipe (with a portion scale) given what's left of today's macro
    budget after already-logged meals. See meal_recommender.py for the
    algorithm.
    """
    return mr.recommend_day_plan(date, num_meals=num_meals)


@router.get("/day-plan")
def get_meal_plan_for_day_plan(date: str):
    """
    GET /api/meal-recommend/day-plan?date=YYYY-MM-DD

    Same engine as the main endpoint, but slot labels and times come from
    the Day Plan's shift-based meal rules for this date — matches exactly
    what's shown in the Day Plan popup's 24-hour timeline, so suggestions
    can be applied directly to those meal1/meal2/meal3 blocks.
    """
    return mr.recommend_for_day_plan(date)