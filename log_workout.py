import memory_manager as mm
from datetime import date


def log_workout_interactive():
    print("\n=== Log Workout ===")
    today        = date.today().isoformat()
    session_type = input("Session type (push/pull/legs/upper/lower/cardio/full_body): ").strip()
    duration     = input("Duration in minutes (or Enter to skip): ").strip()
    effort       = input("Overall effort RPE 1-10 (or Enter to skip): ").strip()
    notes        = input("Notes (or Enter to skip): ").strip()

    workout_id = mm.log_workout(
        session_date     = today,
        session_type     = session_type,
        duration_min     = int(duration) if duration else None,
        perceived_effort = int(effort) if effort else None,
        notes            = notes or None
    )

    print(f"\nLogging sets for workout #{workout_id}. Type 'done' as exercise to finish.\n")

    set_number = 1
    while True:
        exercise = input("  Exercise name (or 'done'): ").strip()
        if exercise.lower() == "done":
            break

        reps      = input("  Reps: ").strip()
        weight    = input("  Weight (kg): ").strip()
        rpe       = input("  RPE 1-10 (or Enter to skip): ").strip()
        warmup    = input("  Warmup set? (y/n): ").strip().lower()

        mm.log_set(
            workout_id = workout_id,
            exercise   = exercise,
            set_number = set_number,
            reps       = int(reps) if reps else None,
            weight_kg  = float(weight) if weight else None,
            rpe        = int(rpe) if rpe else None,
            is_warmup  = warmup == "y"
        )
        set_number += 1
        print(f"  [saved set {set_number - 1}]\n")

    print(f"[+] Workout logged with {set_number - 1} set(s).")


if __name__ == "__main__":
    log_workout_interactive()