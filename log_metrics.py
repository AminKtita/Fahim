import memory_manager as mm
import snapshot_writer
from datetime import date


def log_metrics_interactive():
    print("\n=== Log Body Measurements ===")
    print("Press Enter to skip any field you haven't measured.\n")

    today = date.today().isoformat()
    date_input = input(f"Date [{today}]: ").strip()
    log_date = date_input if date_input else today

    def ask(label, unit):
        val = input(f"{label} ({unit}): ").strip()
        return float(val) if val else None

    weight  = ask("Weight",       "kg")
    bodyfat = ask("Body fat",     "%")
    waist   = ask("Waist",        "cm")
    chest   = ask("Chest",        "cm")
    hips    = ask("Hips",         "cm")
    arm     = ask("Arm (flexed)", "cm")
    thigh   = ask("Thigh",        "cm")
    notes   = input("Notes (or Enter to skip): ").strip() or None

    print("\n── Summary ──────────────────────")
    entries = [
        ("Date",     log_date),
        ("Weight",   f"{weight} kg"   if weight  else "—"),
        ("Body fat", f"{bodyfat}%"    if bodyfat else "—"),
        ("Waist",    f"{waist} cm"    if waist   else "—"),
        ("Chest",    f"{chest} cm"    if chest   else "—"),
        ("Hips",     f"{hips} cm"     if hips    else "—"),
        ("Arm",      f"{arm} cm"      if arm     else "—"),
        ("Thigh",    f"{thigh} cm"    if thigh   else "—"),
    ]
    for label, val in entries:
        print(f"  {label:<12} {val}")
    print("─────────────────────────────────")

    confirm = input("\nSave? (y/n): ").strip().lower()
    if confirm != "y":
        print("Cancelled — nothing saved.")
        return

    mm.log_body_metrics(
        log_date     = log_date,
        weight_kg    = weight,
        body_fat_pct = bodyfat,
        waist_cm     = waist,
        chest_cm     = chest,
        hips_cm      = hips,
        arm_cm       = arm,
        thigh_cm     = thigh,
        notes        = notes
    )

    snapshot_writer.update_all()
    print("\n[+] Measurements saved and memory updated.")


if __name__ == "__main__":
    log_metrics_interactive()