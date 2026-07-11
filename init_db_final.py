"""
🗄️ FAHIM - Database Initialization Script (Final Version)
Function: Initializes the SQLite database and applies schema.
Author: Senior Engineer Review

NOTE: All emojis removed for Windows compatibility.
"""

import sqlite3
import os
import datetime

# 📍 Path to the database file
DB_PATH = "fahim.db"

def get_connection():
    """
    Establishes a connection to the SQLite database.
    Returns a connection object with foreign_keys enabled.
    Creates the file if it doesn't exist.
    """
    # Create the file if it doesn't exist (SQLite does this automatically)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")  # Enable Foreign Keys
    return conn

def initialize_database():
    """
    Main function to initialize the database and schema.
    """
    print(" Initializing FAHIM Database: " + DB_PATH)
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Read and execute the schema SQL
        with open("fahim/schema.sql", "r") as schema_file:
            schema_sql = schema_file.read()
        
        cursor.executescript(schema_sql)
        
        # Insert Default User Profile (Seed Data - Optional for Testing)
        # We will insert a "Sample User" so you can see the structure.
        print(" Inserting Seed Data (Sample User)...")
        insert_sample_user(conn)
        
        conn.commit()
        print("Database initialized successfully: " + DB_PATH)
        print("Tables created: body_metrics, nutrition_logs, diet_plans, training_logs")
        print("\nSeed Data Inserted:")
        print("  User: Sample_User")
        print("  Weight: 80.0 kg")
        print("  Age: 25")
        print("  Height: 175 cm")
        print("  Target Weight: 82.5 kg")
        print("  Diet Plan: 2200cals:160p:70f:250c")
        print("\n Ready. Run 'python cli.py' to start.\n")
        
    except Exception as e:
        print(f"Error initializing database: {e}")
        raise
    finally:
        if 'conn' in locals():
            conn.close()

def insert_sample_user(conn):
    """
    Inserts a sample user profile for testing.
    This allows you to see the schema in action without manual entry.
    """
    cursor = conn.cursor()
    
    # Insert Sample Body Metrics
    cursor.execute("""
        INSERT OR REPLACE INTO body_metrics (user_id, weight_kg, height_cm, age, target_weight_kg)
        VALUES (?, ?, ?, ?, ?)
    """, (1, 80.0, 175, 25, 82.5))
    
    # Insert Sample Nutrition
    cursor.execute("""
        INSERT OR REPLACE INTO nutrition_logs (user_id, calories, protein, fat, carbs, meal_time)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (1, 2200, 160, 70, 250, "Breakfast"))
    
    # Insert Sample Diet Plan (2200cal target)
    cursor.execute("""
        INSERT OR REPLACE INTO diet_plans (user_id, target_calories, protein, fat, carbs, protein_g, fat_g, carbs_g)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (1, 2200, 160, 70, 250, 160, 70, 250))
    
    # Insert Sample Training
    cursor.execute("""
        INSERT OR REPLACE INTO training_logs (exercise_name, weight_kg, reps, rpe, session_date, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    """, ("Bench_Press", 70.0, 10, 6, "2025-09-01", "Good pump"))
    
    print("  Sample User Metrics: Weight=80.0kg, Height=175cm")
    print("  Sample Nutrition: 2200cals")
    print("  Sample Diet Plan: 2200cals target")
    print("  Sample Training: Bench_Press 70kg x 10")

if __name__ == "__main__":
    initialize_database()