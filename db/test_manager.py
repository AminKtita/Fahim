import sys
sys.path.insert(0, ".")  # so it finds memory_manager from fitcoach/ root

import memory_manager as mm
from datetime import date

# 1. Save a profile
mm.save_profile(
    name="Karim",
    age=28,
    sex="male",
    height_cm=178,
    weight_start_kg=92,
    activity_level="moderate",
    goal_type="recomp",
    injuries=["mild left shoulder impingement"]
)

# 2. Read it back
profile = mm.get_profile()
print("Profile:", profile)

# 3. Log a workout
wid = mm.log_workout(date.today().isoformat(), "push", duration_min=55, perceived_effort=7)
print("Workout ID:", wid)

# 4. Log a set
mm.log_set(wid, "bench_press", 1, reps=5, weight_kg=80, rpe=7)
mm.log_set(wid, "bench_press", 2, reps=5, weight_kg=80, rpe=8)
mm.log_set(wid, "overhead_press", 1, reps=8, weight_kg=52.5)

# 5. Log nutrition
mm.log_nutrition(date.today().isoformat(), calories=2600, protein_g=188, carbs_g=280, fat_g=70)

# 6. Log body weight
mm.log_body_metrics(date.today().isoformat(), weight_kg=89.4)

# 7. Read back workouts
workouts = mm.get_workouts(days=7)
print("Recent workouts:", workouts)

# 8. Read sets
sets = mm.get_sets_for_workout(wid)
print("Sets logged:", sets)

print("\n[+] All checks passed.")