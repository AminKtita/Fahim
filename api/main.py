"""Fahim Dashboard API — FastAPI entry point.

Run from the Fahim root folder with:
    api\.venv\Scripts\Activate.ps1
    uvicorn api.main:app --reload --port 8000
"""

import sqlite3
import sys
import os

# ── Make the Fahim root importable so we can use memory_manager.py ──
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


from api.routes import (
    profile,
    workouts,
    nutrition,
    metrics,
    goals,
    summary,
    plan,
    chat,
    exercises,
    ingredients,
    recipes,
    meals,
)

app = FastAPI(
    title="Fahim API",
    description="Dashboard API for the Fahim local AI fitness coach",
    version="1.0.0",
)

# ── CORS — allow the Vite dev server (port 5173) to call the API ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ── Static files — locally uploaded exercise images, served as-is.
# db/exercise_images/<file> is reachable at /media/exercise_images/<file> ──
EXERCISE_IMAGES_DIR = os.path.join(ROOT, "db", "exercise_images")
os.makedirs(EXERCISE_IMAGES_DIR, exist_ok=True)
app.mount("/media/exercise_images", StaticFiles(directory=EXERCISE_IMAGES_DIR), name="exercise_images")

# ── Static files — locally uploaded recipe photos, served as-is.
# db/recipe_images/<file> is reachable at /media/recipe_images/<file> ──
RECIPE_IMAGES_DIR = os.path.join(ROOT, "db", "recipe_images")
os.makedirs(RECIPE_IMAGES_DIR, exist_ok=True)
app.mount("/media/recipe_images", StaticFiles(directory=RECIPE_IMAGES_DIR), name="recipe_images")

# ── Routers ──
app.include_router(profile.router,     prefix="/api/profile",      tags=["profile"])
app.include_router(workouts.router,    prefix="/api/workouts",     tags=["workouts"])
app.include_router(nutrition.router,   prefix="/api/nutrition",    tags=["nutrition"])
app.include_router(metrics.router,     prefix="/api/metrics",      tags=["metrics"])
app.include_router(goals.router,       prefix="/api/goals",        tags=["goals"])
app.include_router(summary.router,     prefix="/api/summary",      tags=["summary"])
app.include_router(plan.router,        prefix="/api/plan",         tags=["plan"])
app.include_router(chat.router,        prefix="/api/chat",         tags=["chat"])

# Training
app.include_router(exercises.router,   prefix="/api/exercises",    tags=["exercises"])

# Nutrition / Recipes
app.include_router(ingredients.router, prefix="/api/ingredients",  tags=["ingredients"])
app.include_router(recipes.router,     prefix="/api/recipes",      tags=["recipes"])
app.include_router(meals.router,       prefix="/api/meals",        tags=["meals"])


@app.get("/api/health")
def health():
    return {"status": "ok"}