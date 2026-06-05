import memory_manager as mm
from datetime import date


def log_nutrition_interactive():
    print("\n=== Log Nutrition ===")
    today    = date.today().isoformat()
    calories = input("Calories (or Enter to skip): ").strip()
    protein  = input("Protein g (or Enter to skip): ").strip()
    carbs    = input("Carbs g (or Enter to skip): ").strip()
    fat      = input("Fat g (or Enter to skip): ").strip()
    water    = input("Water ml (or Enter to skip): ").strip()
    notes    = input("Notes e.g. meals, supplements (or Enter to skip): ").strip()

    mm.log_nutrition(
        log_date  = today,
        calories  = int(calories) if calories else None,
        protein_g = float(protein) if protein else None,
        carbs_g   = float(carbs) if carbs else None,
        fat_g     = float(fat) if fat else None,
        water_ml  = int(water) if water else None,
        notes     = notes or None
    )

    print("[+] Nutrition logged.")


if __name__ == "__main__":
    log_nutrition_interactive()