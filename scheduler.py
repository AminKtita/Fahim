"""FitCoach — Daily Scheduler

Runs automatically to keep all memory snapshots and daily summaries up to date.

Two ways to use it:
    1. Run once manually:      python scheduler.py
    2. Run as a background loop: python scheduler.py --loop
       (stays alive, fires every day at the configured RUN_AT_HOUR)

On Windows Task Scheduler, use option 1 with a daily trigger instead of --loop.
"""

from __future__ import annotations

import argparse
import sys
import time
import traceback
from datetime import date, datetime, timedelta

import memory_manager as mm
import snapshot_writer

# ─────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────

RUN_AT_HOUR = 6       # 6 AM daily auto-run (loop mode only)
LOG_FILE    = "scheduler.log"


# ─────────────────────────────────────────
#  LOGGING
# ─────────────────────────────────────────

def log(msg: str):
    """Print to console and append to scheduler.log."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


# ─────────────────────────────────────────
#  STEP 1 — COMPUTE & SAVE DAILY SUMMARY
#  Reads yesterday's data from DB and writes
#  a summary row so TODAY.md has fresh stats.
# ─────────────────────────────────────────

def compute_daily_summary(target_date: str):
    """
    Builds and saves the daily_summary row for target_date.
    target_date: ISO string 'YYYY-MM-DD'
    """
    log(f"Computing daily summary for {target_date} ...")

    profile = mm.get_profile()
    if not profile:
        log("  [!] No profile found — skipping summary computation.")
        return

    # Did they work out?
    workouts = mm.get_workouts(days=2)
    workout_done = any(w["date"] == target_date for w in workouts)

    # Did they hit nutrition targets?
    nutrition = mm.get_nutrition(days=2)
    day_nutrition = next((n for n in nutrition if n["date"] == target_date), None)

    calories_hit = False
    protein_hit  = False

    if day_nutrition:
        # Get targets from profile goal type
        # Simple heuristics — these get refined over time
        cal_target  = _estimate_calorie_target(profile)
        prot_target = _estimate_protein_target(profile)

        if day_nutrition["calories"] and cal_target:
            # Within 10% of target counts as hit
            calories_hit = day_nutrition["calories"] >= (cal_target * 0.9)

        if day_nutrition["protein_g"] and prot_target:
            protein_hit = day_nutrition["protein_g"] >= (prot_target * 0.9)

    # Current weight (most recent entry on or before target_date)
    metrics = mm.get_latest_metrics()
    weight_kg = metrics["weight_kg"] if metrics else None

    # Streak
    streak = mm.compute_streak()

    # Save to DB
    mm.upsert_daily_summary(
        summary_date = target_date,
        workout_done = int(workout_done),
        calories_hit = int(calories_hit),
        protein_hit  = int(protein_hit),
        weight_kg    = weight_kg,
        streak_days  = streak
    )

    log(f"  workout_done={workout_done} | "
        f"calories_hit={calories_hit} | "
        f"protein_hit={protein_hit} | "
        f"streak={streak}")


def _estimate_calorie_target(profile: dict) -> int | None:
    """
    Very rough TDEE estimate based on goal type.
    Replace with real values once the user sets them via goals.
    """
    goal = profile.get("goal_type", "").lower()
    weight = profile.get("weight_start_kg", 80)

    base = weight * 30  # rough maintenance

    if goal == "bulk":
        return int(base * 1.10)
    elif goal == "cut":
        return int(base * 0.85)
    else:
        return int(base)  # recomp / maintain


def _estimate_protein_target(profile: dict) -> int | None:
    """2g per kg bodyweight as a safe default."""
    weight = profile.get("weight_start_kg", 80)
    return int(weight * 2)


# ─────────────────────────────────────────
#  STEP 2 — FLAG MISSING DAYS
#  If a day has no workout and no nutrition,
#  log it as a rest day so streaks stay honest.
# ─────────────────────────────────────────

def flag_missing_days(lookback_days: int = 7):
    """
    Checks the last N days. Any day with no summary row
    gets inserted as a rest day (workout_done=0).
    Prevents gaps from breaking the streak counter.
    """
    log(f"Checking last {lookback_days} days for missing entries ...")

    summaries = mm.get_daily_summaries(days=lookback_days)
    logged_dates = {s["date"] for s in summaries}

    today = date.today()
    filled = 0

    for i in range(1, lookback_days + 1):
        check_date = (today - timedelta(days=i)).isoformat()
        if check_date not in logged_dates:
            mm.upsert_daily_summary(
                summary_date = check_date,
                workout_done = 0,
                calories_hit = 0,
                protein_hit  = 0
            )
            log(f"  Filled missing day: {check_date} → rest day")
            filled += 1

    if filled == 0:
        log("  No missing days found.")


# ─────────────────────────────────────────
#  STEP 3 — UPDATE GOAL PROGRESS
#  Auto-syncs goal current_value for
#  weight-based goals from body_metrics.
# ─────────────────────────────────────────

def sync_goal_progress():
    """
    For any goal with metric='weight_kg', automatically
    update current_value from the latest body_metrics entry.
    Extend this for other auto-trackable metrics over time.
    """
    log("Syncing goal progress ...")

    goals = mm.get_goals(status="active")
    metrics = mm.get_latest_metrics()

    if not metrics:
        log("  No body metrics found — skipping goal sync.")
        return

    for goal in goals:
        metric = goal.get("metric", "")

        if metric == "weight_kg" and metrics.get("weight_kg"):
            mm.update_goal_progress(
                goal_id       = goal["id"],
                current_value = metrics["weight_kg"]
            )
            log(f"  Goal [{goal['id']}] '{goal['title']}' → "
                f"current_value updated to {metrics['weight_kg']} kg")


# ─────────────────────────────────────────
#  STEP 4 — REFRESH ALL MEMORY SNAPSHOTS
# ─────────────────────────────────────────

def refresh_snapshots():
    log("Refreshing memory snapshots ...")
    snapshot_writer.update_all()
    log("  All .md files updated.")


# ─────────────────────────────────────────
#  FULL DAILY JOB — runs all steps in order
# ─────────────────────────────────────────

def run_daily_job():
    log("=" * 48)
    log("Daily job starting ...")
    log("=" * 48)

    yesterday = (date.today() - timedelta(days=1)).isoformat()

    try:
        compute_daily_summary(yesterday)
    except Exception:
        log(f"[ERROR] compute_daily_summary failed:\n{traceback.format_exc()}")

    try:
        flag_missing_days(lookback_days=7)
    except Exception:
        log(f"[ERROR] flag_missing_days failed:\n{traceback.format_exc()}")

    try:
        sync_goal_progress()
    except Exception:
        log(f"[ERROR] sync_goal_progress failed:\n{traceback.format_exc()}")

    try:
        refresh_snapshots()
    except Exception:
        log(f"[ERROR] refresh_snapshots failed:\n{traceback.format_exc()}")

    log("Daily job complete.")
    log("=" * 48)


# ─────────────────────────────────────────
#  LOOP MODE — stays alive, fires at RUN_AT_HOUR
#  Use this if you want it always running in
#  the background (e.g. inside a terminal session).
# ─────────────────────────────────────────

def run_loop():
    log(f"Scheduler loop started. Will run daily at {RUN_AT_HOUR:02d}:00.")
    log("Press Ctrl+C to stop.")

    last_run_date: str | None = None

    while True:
        now = datetime.now()
        today_str = date.today().isoformat()

        # Fire once per day at RUN_AT_HOUR
        if now.hour >= RUN_AT_HOUR and last_run_date != today_str:
            run_daily_job()
            last_run_date = today_str

        # Sleep 5 minutes between checks
        time.sleep(300)


# ─────────────────────────────────────────
#  ENTRY POINT
# ─────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="FitCoach daily scheduler"
    )
    parser.add_argument(
        "--loop",
        action  = "store_true",
        help    = "Stay alive and run daily at the configured hour (default: run once and exit)"
    )
    parser.add_argument(
        "--date",
        type    = str,
        default = None,
        help    = "Run summary for a specific date YYYY-MM-DD (default: yesterday)"
    )
    args = parser.parse_args()

    if args.loop:
        run_loop()
    else:
        # Run once — useful for manual runs and Windows Task Scheduler
        if args.date:
            # Allow targeting a specific past date
            log(f"Manual run for date: {args.date}")
            compute_daily_summary(args.date)
            refresh_snapshots()
        else:
            run_daily_job()


if __name__ == "__main__":
    main()