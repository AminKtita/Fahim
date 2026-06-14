import memory_manager as mm

print("=== FitCoach — Profile Setup ===\n")

name           = input("Name: ").strip()
age            = int(input("Age: "))
sex            = input("Sex (male/female): ").strip().lower()
height_cm      = float(input("Height (cm): "))
weight_kg      = float(input("Current weight (kg): "))
activity       = input("Activity level (sedentary/light/moderate/very_active): ").strip()
goal           = input("Goal (cut/bulk/recomp/endurance/strength): ").strip()
injuries_input = input("Injuries (comma separated, or Enter for none): ").strip()
injuries       = [i.strip() for i in injuries_input.split(",")] if injuries_input else []

mm.save_profile(
    name            = name,
    age             = age,
    sex             = sex,
    height_cm       = height_cm,
    weight_start_kg = weight_kg,
    activity_level  = activity,
    goal_type       = goal,
    injuries        = injuries
)

print("\n[+] Profile saved.")