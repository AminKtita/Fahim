"""FitCoach — main chat loop.

Run with:
    python main.py

Controls:
    'quit' or 'exit'  → end session
    'refresh'         → force reload all memory snapshots
    'debug'           → toggle intent + token debug info
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date
from typing import List, Dict

import memory_manager as mm
import ollama_client as ollama
import snapshot_writer
from context_builder import build_context, build_system_prompt, detect_intent
from log_workout import log_workout_interactive
from log_nutrition import log_nutrition_interactive
from log_metrics import log_metrics_interactive


# ─────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────

MAX_HISTORY   = 10     # max messages kept in conversation history
DEBUG_DEFAULT = False  # set True to always show intent + token info


# ─────────────────────────────────────────
#  LOG DATA HANDLER
#  Intercepts [LOG_DATA] blocks the model outputs
#  and writes them to the database automatically.
# ─────────────────────────────────────────

def handle_log_data(log_data: dict) -> str | None:
    """
    Routes a parsed [LOG_DATA] block to the correct memory_manager function.
    Returns a confirmation string or None if type is unknown.
    """
    log_type = log_data.get("type")
    today    = date.today().isoformat()

    try:
        if log_type == "workout_set":
            workout_date  = log_data.get("date", today)
            session_type  = log_data.get("session_type", "general")
            duration      = log_data.get("duration_min")
            effort        = log_data.get("perceived_effort")
            notes         = log_data.get("notes")

            workout_id = mm.log_workout(
                workout_date, session_type,
                duration_min=duration,
                perceived_effort=effort,
                notes=notes
            )

            sets = log_data.get("sets", [])
            for i, s in enumerate(sets, 1):
                mm.log_set(
                    workout_id,
                    exercise    = s.get("exercise", "unknown"),
                    set_number  = s.get("set_number", i),
                    reps        = s.get("reps"),
                    weight_kg   = s.get("weight_kg"),
                    rpe         = s.get("rpe"),
                    is_warmup   = s.get("is_warmup", False),
                    notes       = s.get("notes")
                )
            return f"[saved] workout + {len(sets)} set(s) logged"

        elif log_type == "nutrition":
            mm.log_nutrition(
                log_date   = log_data.get("date", today),
                calories   = log_data.get("calories"),
                protein_g  = log_data.get("protein_g"),
                carbs_g    = log_data.get("carbs_g"),
                fat_g      = log_data.get("fat_g"),
                water_ml   = log_data.get("water_ml"),
                notes      = log_data.get("notes")
            )
            return "[saved] nutrition logged"

        elif log_type == "body_metrics":
            mm.log_body_metrics(
                log_date     = log_data.get("date", today),
                weight_kg    = log_data.get("weight_kg"),
                body_fat_pct = log_data.get("body_fat_pct"),
                waist_cm     = log_data.get("waist_cm"),
                chest_cm     = log_data.get("chest_cm"),
                hips_cm      = log_data.get("hips_cm"),
                arm_cm       = log_data.get("arm_cm"),
                thigh_cm     = log_data.get("thigh_cm"),
                notes        = log_data.get("notes")
            )
            return "[saved] body metrics logged"

        elif log_type == "goal_update":
            mm.update_goal_progress(
                goal_id       = log_data.get("goal_id"),
                current_value = log_data.get("current_value"),
                status        = log_data.get("status")
            )
            return "[saved] goal updated"
        elif log_type == "plan":
            plan_id = mm.save_plan(
                name             = log_data.get("name", "AI Generated Plan"),
                split_type       = log_data.get("split_type", "PPL"),
                days_per_week    = log_data.get("days_per_week", 4),
                start_date       = log_data.get("start_date", today),
                deload_week      = log_data.get("deload_week", 6),
                mesocycle_number = log_data.get("mesocycle_number", 1),
                notes            = log_data.get("notes")
            )

            for day in log_data.get("days", []):
                day_id = mm.save_plan_day(
                    plan_id      = plan_id,
                    day_name     = day["day_name"],
                    session_type = day["session_type"],
                    order_index  = day["order_index"]
                )
                for i, ex in enumerate(day.get("exercises", []), 1):
                    mm.save_plan_exercise(
                        plan_day_id      = day_id,
                        exercise         = ex["exercise"],
                        sets             = ex["sets"],
                        reps             = ex["reps"],
                        rir              = ex.get("rir"),
                        progression_rule = ex.get("progression_rule"),
                        order_index      = i
                    )

            targets = log_data.get("nutrition_targets")
            if targets:
                mm.save_nutrition_targets(
                    plan_id   = plan_id,
                    calories  = targets["calories"],
                    protein_g = targets["protein_g"],
                    carbs_g   = targets["carbs_g"],
                    fat_g     = targets["fat_g"]
                )

            return f"[saved] training plan logged — {log_data.get('name')}"

        else:
            return f"[!] Unknown log type: '{log_type}' — not saved"

    except Exception as e:
        return f"[!] Log error: {e}"


# ─────────────────────────────────────────
#  DISPLAY
# ─────────────────────────────────────────

def print_banner():
    print("\n" + "═" * 52)
    print("  Fahim — Local AI Fitness Coach")
    print(f"  {date.today().strftime('%A, %d %B %Y')}")
    print("═" * 52)
    print("  Commands: 'quit'  'refresh'  'debug'")
    print("            'workout'  'nutrition'  'metrics'")
    print("═" * 52 + "\n")


def print_coach(text: str):
    print(f"\n\033[96mCoach:\033[0m {text}\n")


def print_user_prompt():
    return input("\033[93mYou:\033[0m ").strip()


def print_debug(intent: str, context: str):
    token_estimate = len(context) // 4
    print(f"\033[90m[debug] intent={intent} | context≈{token_estimate} tokens\033[0m")


def print_saved(msg: str):
    print(f"\033[92m{msg}\033[0m")


def print_error(msg: str):
    print(f"\033[91m{msg}\033[0m")

def print_thinking(thinking: str):
    print("\n\033[90m━━━ thinking ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    for line in thinking.split('\n'):
        if line.strip():
            print(f"\033[90m  {line.strip()}")
    print("\033[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m\n")

# ─────────────────────────────────────────
#  CONVERSATION HISTORY MANAGER
#  Keeps last MAX_HISTORY messages so the
#  model has short-term conversational memory.
# ─────────────────────────────────────────

def trim_history(history: List[Dict], max_turns: int = MAX_HISTORY) -> List[Dict]:
    """Keep only the last max_turns messages."""
    return history[-max_turns:] if len(history) > max_turns else history


# ─────────────────────────────────────────
#  MAIN LOOP
# ─────────────────────────────────────────

def main():
    import scheduler
    scheduler.run_daily_job()
    # 1. Check Ollama is running
    if not ollama.healthcheck():
        print_error(
            "Ollama is not running.\n"
            "Start it first in a separate terminal with: ollama serve"
        )
        sys.exit(1)

    # 2. Check profile exists
    profile = mm.get_profile()
    if not profile:
        print_error(
            "No athlete profile found.\n"
            "Run this first: python setup_profile.py"
        )
        sys.exit(1)

    # 3. Refresh all memory snapshots at session start
    snapshot_writer.update_all()

    # 4. Print banner
    print_banner()
    print_coach(
        f"Hey {profile['name']}! Ready to work. "
        "Tell me about your session, ask about your plan, "
        "or just ask anything."
    )

    history: List[Dict] = []
    debug   = DEBUG_DEFAULT

    # ── CHAT LOOP ──
    while True:
        try:
            user_input = print_user_prompt()
        except (KeyboardInterrupt, EOFError):
            print("\nSession ended.")
            break

        if not user_input:
            continue

        # ── COMMANDS ──
        if user_input.lower() in ("quit", "exit"):
            print_coach("Good work today. Rest up.")
            break

        if user_input.lower() == "refresh":
            snapshot_writer.update_all()
            print_saved("[+] Memory snapshots refreshed.")
            continue

        if user_input.lower() == "debug":
            debug = not debug
            print_saved(f"[debug mode {'ON' if debug else 'OFF'}]")
            continue

        if user_input.lower() == "workout":
            log_workout_interactive()
            snapshot_writer.update_all()
            print_saved("[+] Workout saved and memory refreshed.")
            continue

        if user_input.lower() == "nutrition":
            log_nutrition_interactive()
            snapshot_writer.update_all()
            print_saved("[+] Nutrition saved and memory refreshed.")
            continue
        
        if user_input.lower() == "metrics":
            log_metrics_interactive()
            snapshot_writer.update_all()
            print_saved("[+] Measurements saved and memory refreshed.")
            continue


        # ── BUILD CONTEXT ──
        context, intent = build_context(user_input)
        system_prompt   = build_system_prompt(context)

        if debug:
            print_debug(intent, context)

        # ── CALL MODEL ──
        try:
            result = ollama.chat_with_context(
                user_message  = user_input,
                system_prompt = system_prompt,
                history       = history,
                stream        = True,
            )
        except ollama.OllamaError as e:
            print_error(f"Model error: {e}")
            continue


        # ── HANDLE LOG DATA ──
        if result.log_data:
            confirmation = handle_log_data(result.log_data)
            if confirmation:
                print_saved(confirmation)
            # Refresh memory files so next query has fresh data
            snapshot_writer.update_all()

        # ── UPDATE HISTORY ──
        history.append({"role": "user",      "content": user_input})
        history.append({"role": "assistant", "content": result.text})
        history = trim_history(history)


if __name__ == "__main__":
    main()