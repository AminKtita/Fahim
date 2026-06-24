from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
import sqlite3
import os
import uuid
import memory_manager as mm

router = APIRouter()

EXERCISE_IMAGES_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "db", "exercise_images"
)
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB per frame is plenty for exercise photos


class ExerciseIn(BaseModel):
    exercise_name: str
    body_part: Optional[str] = None
    movement_pattern: Optional[str] = None
    primary_muscles: Optional[str] = None
    secondary_muscles: Optional[str] = None
    equipment: Optional[str] = None
    difficulty: Optional[str] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    instructions: Optional[str] = None
    technique_cues: Optional[str] = None
    common_mistakes: Optional[str] = None


class ExercisePatch(BaseModel):
    exercise_name: Optional[str] = None
    body_part: Optional[str] = None
    movement_pattern: Optional[str] = None
    primary_muscles: Optional[str] = None
    secondary_muscles: Optional[str] = None
    equipment: Optional[str] = None
    difficulty: Optional[str] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    instructions: Optional[str] = None
    technique_cues: Optional[str] = None
    common_mistakes: Optional[str] = None


@router.get("")
def list_exercises(q: Optional[str] = None, limit: int = 50):
    """
    Returns the canonical exercise library.
    Pass ?q=bench to search by name/id (used by the frontend autocomplete
    and the library page's search box).
    """
    if q:
        return mm.search_exercise_library(q, limit=limit)
    return mm.get_exercise_library()


@router.get("/{exercise_id}")
def get_exercise(exercise_id: str):
    ex = mm.get_exercise_by_id(exercise_id)
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return ex


@router.post("")
def add_exercise(data: ExerciseIn):
    try:
        exercise_id = mm.create_exercise(**data.model_dump())
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="An exercise with this name already exists in the library",
        )
    return {"status": "created", "exercise_id": exercise_id}


@router.patch("/{exercise_id}")
def edit_exercise(exercise_id: str, data: ExercisePatch):
    if not mm.get_exercise_by_id(exercise_id):
        raise HTTPException(status_code=404, detail="Exercise not found")
    fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    mm.update_exercise(exercise_id, **fields)
    return {"status": "updated"}


@router.delete("/{exercise_id}")
def remove_exercise(exercise_id: str):
    if not mm.get_exercise_by_id(exercise_id):
        raise HTTPException(status_code=404, detail="Exercise not found")
    # Clean up any uploaded image files from disk before deleting the DB
    # rows (delete_exercise() removes the exercise_images rows, but it
    # doesn't know the upload directory path, so the file cleanup happens
    # here at the API layer).
    images = mm.get_exercise_images(exercise_id)
    for img in images:
        if img["source"] == "upload":
            _delete_upload_file(img["path_or_url"])
    mm.delete_exercise(exercise_id)
    return {"status": "deleted"}


# ── Exercise images (multi-frame "flicker" animation) ──────────────

class ImageUrlIn(BaseModel):
    url: str


class ImageOrderIn(BaseModel):
    image_ids: List[int]


def _delete_upload_file(relative_path: str):
    """Best-effort delete of an uploaded file from disk. Never raises —
    a missing file shouldn't block deleting the DB row that referenced it."""
    try:
        full_path = os.path.join(EXERCISE_IMAGES_DIR, relative_path)
        if os.path.isfile(full_path):
            os.remove(full_path)
    except OSError:
        pass


@router.get("/{exercise_id}/images")
def list_exercise_images(exercise_id: str):
    if not mm.get_exercise_by_id(exercise_id):
        raise HTTPException(status_code=404, detail="Exercise not found")
    return mm.get_exercise_images(exercise_id)


@router.post("/{exercise_id}/images/upload")
async def upload_exercise_image(exercise_id: str, file: UploadFile = File(...)):
    if not mm.get_exercise_by_id(exercise_id):
        raise HTTPException(status_code=404, detail="Exercise not found")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}",
        )

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 8MB per frame)")
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Never trust the client's filename — generate our own to avoid path
    # traversal, collisions, and weird characters.
    safe_filename = f"{exercise_id}_{uuid.uuid4().hex[:12]}{ext}"
    os.makedirs(EXERCISE_IMAGES_DIR, exist_ok=True)
    full_path = os.path.join(EXERCISE_IMAGES_DIR, safe_filename)
    with open(full_path, "wb") as f:
        f.write(contents)

    image_id = mm.add_exercise_image(exercise_id, source="upload", path_or_url=safe_filename)
    return {
        "status": "uploaded",
        "image_id": image_id,
        "url": f"/media/exercise_images/{safe_filename}",
    }


@router.post("/{exercise_id}/images/url")
def add_exercise_image_url(exercise_id: str, data: ImageUrlIn):
    if not mm.get_exercise_by_id(exercise_id):
        raise HTTPException(status_code=404, detail="Exercise not found")
    if not data.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    image_id = mm.add_exercise_image(exercise_id, source="url", path_or_url=data.url.strip())
    return {"status": "added", "image_id": image_id}


@router.put("/{exercise_id}/images/order")
def reorder_exercise_images(exercise_id: str, data: ImageOrderIn):
    if not mm.get_exercise_by_id(exercise_id):
        raise HTTPException(status_code=404, detail="Exercise not found")
    mm.reorder_exercise_images(exercise_id, data.image_ids)
    return {"status": "reordered"}


@router.delete("/{exercise_id}/images/{image_id}")
def delete_exercise_image(exercise_id: str, image_id: int):
    deleted = mm.delete_exercise_image(image_id)
    if not deleted or deleted["exercise_id"] != exercise_id:
        raise HTTPException(status_code=404, detail="Image not found")
    if deleted["source"] == "upload":
        _delete_upload_file(deleted["path_or_url"])
    return {"status": "deleted"}