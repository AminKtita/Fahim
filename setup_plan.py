import memory_manager as mm
import snapshot_writer
from datetime import date

PLAN_NAME      = "PPL Recomp — Mesocycle 1"
SPLIT_TYPE     = "PPL"
DAYS_PER_WEEK  = 3
START_DATE     = date.today().isoformat()
DELOAD_WEEK    = 4

CALORIES       = 2100
PROTEIN_G      = 150
CARBS_G        = 230
FAT_G          = 65

SCHEDULE = [
    ("monday",    "push",  1),
    ("tuesday",   "rest",  2),
    ("wednesday", "pull",  3),
    ("thursday",  "rest",  4),
    ("friday",    "legs",  5),
    ("saturday",  "rest",  6),
    ("sunday",    "rest",  7),
]

EXERCISES = {
    "push": [
        ("bench_press",            3, "8-10",  3, "add 2.5kg when all reps clean"),
        ("dumbbell_shoulder_press", 3, "10-12", 3, "add 1kg when all reps clean"),
        ("tricep_pushdown",        3, "12-15", 2, "add 1kg when all reps clean"),
        ("lateral_raise",          3, "15",    2, "focus on form"),
    ],
    "pull": [
        ("lat_pulldown",           3, "8-10",  3, "add 2.5kg when all reps clean"),
        ("seated_cable_row",       3, "10-12", 3, "add 2.5kg when all reps clean"),
        ("face_pull",              3, "15",    2, "focus on rear delt contraction"),
        ("dumbbell_bicep_curl",    3, "12",    2, "add 1kg when all reps clean"),
    ],
    "legs": [
        ("goblet_squat",           3, "10-12", 3, "add 2kg when all reps clean"),
        ("leg_press",              3, "10-12", 3, "add 5kg when all reps clean"),
        ("leg_curl",               3, "12-15", 2, "add 1kg when all reps clean"),
        ("calf_raise",             3, "15",    2, "focus on full stretch"),
    ],
    "rest": [],
}

print("Setting up training plan ...")

plan_id = mm.save_plan(
    name             = PLAN_NAME,
    split_type       = SPLIT_TYPE,
    days_per_week    = DAYS_PER_WEEK,
    start_date       = START_DATE,
    deload_week      = DELOAD_WEEK,
    mesocycle_number = 1
)

for day_name, session_type, order in SCHEDULE:
    day_id = mm.save_plan_day(plan_id, day_name, session_type, order)
    exercises = EXERCISES.get(session_type, [])
    for i, (exercise, sets, reps, rir, prog) in enumerate(exercises, 1):
        mm.save_plan_exercise(
            plan_day_id      = day_id,
            exercise         = exercise,
            sets             = sets,
            reps             = reps,
            rir              = rir,
            progression_rule = prog,
            order_index      = i
        )

mm.save_nutrition_targets(plan_id, CALORIES, PROTEIN_G, CARBS_G, FAT_G)
snapshot_writer.update_all()

print(f"[+] Plan saved: {PLAN_NAME}")
print(f"[+] PLAN.md generated")