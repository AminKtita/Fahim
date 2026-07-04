"""
/api/recipes — full CRUD for the recipe library.
Each GET response includes computed macros per ingredient and totals.

Recipe category is restricted to a fixed set (Breakfast, Lunch/Dinner,
Snack/Base) — enforced here via Pydantic Literal (clean 422 on bad input)
and again at the DB layer via a CHECK constraint (belt and suspenders).
"""

import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import logging
import traceback
import sqlite3
import uuid
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List, Literal
import memory_manager_meals as mm

router = APIRouter()
logger = logging.getLogger("fahim.recipes")

RecipeCategory = Literal["Breakfast", "Lunch/Dinner", "Snack/Base"]

# ── Recipe photo upload (single image, upload OR external URL) ─────
RECIPE_IMAGES_DIR = os.path.join(ROOT, "db", "recipe_images")
RECIPE_IMAGE_URL_PREFIX = "/media/recipe_images/"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB is plenty for a recipe photo


def _is_local_upload(image_url: Optional[str]) -> bool:
    return bool(image_url) and image_url.startswith(RECIPE_IMAGE_URL_PREFIX)


def _delete_upload_file(image_url: str):
    """Best-effort delete of a previously uploaded recipe photo from disk.
    Never raises — a missing file shouldn't block updating/deleting the
    recipe row that referenced it."""
    try:
        filename = image_url[len(RECIPE_IMAGE_URL_PREFIX):]
        full_path = os.path.join(RECIPE_IMAGES_DIR, filename)
        if os.path.isfile(full_path):
            os.remove(full_path)
    except OSError:
        pass


class RecipeIngredientIn(BaseModel):
    ingredient_id: int
    quantity_g: float


class RecipeIn(BaseModel):
    name: str
    category: RecipeCategory
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    notes: Optional[str] = None
    ingredients: List[RecipeIngredientIn] = []


class RecipePatch(BaseModel):
    name: Optional[str] = None
    category: Optional[RecipeCategory] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    notes: Optional[str] = None
    ingredients: Optional[List[RecipeIngredientIn]] = None


@router.get("")
def list_recipes(category: Optional[str] = None):
    try:
        return mm.get_all_recipes(category=category)
    except Exception as e:
        logger.error("GET /api/recipes failed:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@router.get("/categories")
def list_recipe_categories():
    return mm.get_recipe_categories()


@router.get("/{recipe_id}")
def get_recipe(recipe_id: int):
    recipe = mm.get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.post("", status_code=201)
def create_recipe(data: RecipeIn):
    try:
        new_id = mm.create_recipe(
            name=data.name,
            category=data.category,
            image_url=data.image_url,
            video_url=data.video_url,
            notes=data.notes,
            ingredients=[i.model_dump() for i in data.ingredients],
        )
        return {"status": "created", "id": new_id}
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=409, detail=f"Recipe name already exists: {e}")


@router.patch("/{recipe_id}")
def update_recipe(recipe_id: int, data: RecipePatch):
    recipe = mm.get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    fields = data.model_dump(exclude_none=True, exclude={"ingredients"})
    ingredients = None
    if data.ingredients is not None:
        ingredients = [i.model_dump() for i in data.ingredients]

    # If image_url is being replaced (e.g. the user pastes a new external
    # URL over a previously uploaded photo), delete the old uploaded file
    # so it doesn't become an orphaned file on disk.
    if "image_url" in fields and fields["image_url"] != recipe.get("image_url"):
        if _is_local_upload(recipe.get("image_url")):
            _delete_upload_file(recipe["image_url"])

    try:
        mm.update_recipe(recipe_id, fields, ingredients=ingredients)
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=409, detail=f"Update failed: {e}")
    return {"status": "updated"}


@router.delete("/{recipe_id}")
def delete_recipe(recipe_id: int):
    recipe = mm.get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    # Clean up an uploaded photo from disk before deleting the DB row —
    # delete_recipe() only removes DB rows and doesn't know the upload path.
    if _is_local_upload(recipe.get("image_url")):
        _delete_upload_file(recipe["image_url"])
    mm.delete_recipe(recipe_id)
    return {"status": "deleted"}


# ── Recipe photo (single image: upload OR external URL) ────────────

@router.post("/{recipe_id}/image/upload")
async def upload_recipe_image(recipe_id: int, file: UploadFile = File(...)):
    """Uploads a local photo for a recipe. Replaces any existing image_url
    (whether it was a previous upload or an external URL) and deletes the
    old uploaded file from disk if there was one."""
    recipe = mm.get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}",
        )

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 8MB)")
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    if _is_local_upload(recipe.get("image_url")):
        _delete_upload_file(recipe["image_url"])

    # Never trust the client's filename — generate our own to avoid path
    # traversal, collisions, and weird characters.
    safe_filename = f"recipe_{recipe_id}_{uuid.uuid4().hex[:12]}{ext}"
    os.makedirs(RECIPE_IMAGES_DIR, exist_ok=True)
    full_path = os.path.join(RECIPE_IMAGES_DIR, safe_filename)
    with open(full_path, "wb") as f:
        f.write(contents)

    relative_url = f"{RECIPE_IMAGE_URL_PREFIX}{safe_filename}"
    mm.update_recipe(recipe_id, {"image_url": relative_url})
    return {"status": "uploaded", "image_url": relative_url}


@router.delete("/{recipe_id}/image")
def delete_recipe_image(recipe_id: int):
    """Clears a recipe's photo (upload or URL) and removes the uploaded
    file from disk if it was a local upload."""
    recipe = mm.get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if _is_local_upload(recipe.get("image_url")):
        _delete_upload_file(recipe["image_url"])
    mm.update_recipe(recipe_id, {"image_url": None})
    return {"status": "deleted"}