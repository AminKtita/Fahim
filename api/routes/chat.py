"""
Chat route — wraps the existing CLI chat pipeline (context_builder + ollama_client)
for the dashboard. Streams thinking + reply tokens via Server-Sent Events (SSE),
and routes any [LOG_DATA] block to memory_manager exactly like main.py's
handle_log_data(), then triggers a snapshot refresh.

Frontend usage:
  POST /api/chat  { "message": "...", "history": [{role, content}, ...] }
  → text/event-stream of {"type":"thinking"|"reply"|"log"|"done"|"error","data":...}
"""

import json
import sys
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List

import context_builder
import ollama_client
import memory_manager as mm
import snapshot_writer

router = APIRouter()


class ChatMessage(BaseModel):
    role: str       # 'user' | 'assistant'
    content: str


class ChatIn(BaseModel):
    message: str
    history: List[ChatMessage] = []


def sse(event_type: str, data) -> str:
    """Format a single SSE message."""
    payload = json.dumps({"type": event_type, "data": data})
    return f"data: {payload}\n\n"


def handle_log_data(log_json: dict) -> dict:
    """
    Routes a parsed [LOG_DATA] block to the correct memory_manager writer,
    mirroring main.py's handle_log_data(). Returns a short summary dict
    for the frontend to display and react to.
    """
    log_type = log_json.get("type")

    try:
        if log_type == "workout_set":
            workout_id = mm.log_workout(
                session_date=log_json["date"],
                session_type=log_json.get("session_type", "general"),
                duration_min=log_json.get("duration_min"),
                perceived_effort=log_json.get("perceived_effort"),
                notes=log_json.get("notes"),
            )
            for i, s in enumerate(log_json.get("sets", []), 1):
                mm.log_set(
                    workout_id=workout_id,
                    exercise=s["exercise"],
                    set_number=s.get("set_number", i),
                    reps=s.get("reps"),
                    weight_kg=s.get("weight_kg"),
                    rpe=s.get("rpe"),
                    is_warmup=s.get("is_warmup", False),
                    notes=s.get("notes"),
                )
            return {"category": "workout", "date": log_json["date"]}

        elif log_type == "nutrition":
            mm.log_nutrition(
                log_date=log_json["date"],
                calories=log_json.get("calories"),
                protein_g=log_json.get("protein_g"),
                carbs_g=log_json.get("carbs_g"),
                fat_g=log_json.get("fat_g"),
                water_ml=log_json.get("water_ml"),
                notes=log_json.get("notes"),
            )
            return {"category": "nutrition", "date": log_json["date"]}

        elif log_type == "body_metrics":
            mm.log_body_metrics(
                log_date=log_json["date"],
                weight_kg=log_json.get("weight_kg"),
                body_fat_pct=log_json.get("body_fat_pct"),
                waist_cm=log_json.get("waist_cm"),
                chest_cm=log_json.get("chest_cm"),
                hips_cm=log_json.get("hips_cm"),
                arm_cm=log_json.get("arm_cm"),
                thigh_cm=log_json.get("thigh_cm"),
                notes=log_json.get("notes"),
            )
            return {"category": "metrics", "date": log_json["date"]}

        elif log_type == "goal_update":
            mm.update_goal_progress(
                goal_id=log_json["goal_id"],
                current_value=log_json.get("current_value"),
                status=log_json.get("status"),
            )
            return {"category": "goal", "action": "updated"}

        elif log_type == "goal_create":
            mm.save_goal(
                title=log_json["title"],
                metric=log_json.get("metric"),
                target_value=log_json.get("target_value"),
                current_value=log_json.get("current_value"),
                deadline=log_json.get("deadline"),
            )
            return {"category": "goal", "action": "created", "title": log_json.get("title")}

        elif log_type == "plan":
            # Plan creation isn't part of memory_manager's current surface;
            # acknowledge but don't fail the whole chat turn.
            return {"category": "plan", "note": "plan logging not yet wired to DB"}

        else:
            return {"category": "unknown", "raw_type": log_type}

    except Exception as e:
        return {"category": "error", "error": str(e), "raw": log_json}


@router.post("")
async def chat(data: ChatIn):
    """
    Streams the model's thinking + reply tokens live via SSE, then (once the
    full reply is collected) extracts any [LOG_DATA] block, writes it to the
    DB, refreshes memory snapshots, and signals the frontend which data
    categories changed.
    """

    def event_stream():
        try:
            # build_context returns (context_block, intent)
            context_block, _intent = context_builder.build_context(data.message)
            system_prompt = context_builder.build_system_prompt(context_block)
        except Exception as e:
            yield sse("error", f"Failed to build context: {e}")
            return

        messages = [{"role": "system", "content": system_prompt}]
        for m in data.history[-10:]:
            messages.append({"role": m.role, "content": m.content})
        messages.append({"role": "user", "content": data.message})

        payload = {
            "model": ollama_client.DEFAULT_MODEL,
            "messages": messages,
            "options": ollama_client._merge_options(),
            "stream": True,
            "think": True,
        }

        full_reply_parts = []
        try:
            for event in ollama_client._post_stream("/api/chat", payload):
                msg = event.get("message", {})
                think_chunk = msg.get("thinking", "")
                reply_chunk = msg.get("content", "")

                if think_chunk:
                    yield sse("thinking", think_chunk)

                if reply_chunk:
                    full_reply_parts.append(reply_chunk)
                    yield sse("reply", reply_chunk)
        except Exception as e:
            yield sse("error", f"Model request failed: {e}")
            return

        full_reply = "".join(full_reply_parts).strip()

        # Extract a single [LOG_DATA] block, if present
        changed_categories = set()
        try:
            _clean_text, log_block = ollama_client.extract_log_data(full_reply)
            if log_block:
                result = handle_log_data(log_block)
                yield sse("log", result)
                if result.get("category") and result["category"] not in ("unknown", "error"):
                    changed_categories.add(result["category"])
        except Exception as e:
            yield sse("log", {"category": "error", "error": str(e)})

        if changed_categories:
            try:
                snapshot_writer.update_all()
            except Exception:
                pass  # snapshot refresh failure shouldn't break the chat turn

        yield sse("done", {"changed": list(changed_categories)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")