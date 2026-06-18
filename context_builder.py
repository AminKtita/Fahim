import os
from datetime import date

from retrieval import (
    get_exercise_context,
    get_weight_context,
    get_goal_context
)

MEMORY_DIR = os.path.join(os.path.dirname(__file__), "memory")

# ─────────────────────────────────────────
#  INTENT → FILES mapping
#  Each intent loads only what it needs.
#  PROFILE.md and GOALS.md are always included.
# ─────────────────────────────────────────

ALWAYS_LOAD = [
    "PROFILE.md",
    "GOALS.md",
    "PLAN.md",

]

INTENT_FILES = {
    "workout":   ["TODAY.md", "CURRENT_WEEK.md"],
    "nutrition": ["TODAY.md"],
    "progress":  ["TODAY.md", "RECENT_PROGRESS.md"],
    "planning":  ["TODAY.md", "CURRENT_WEEK.md", "RECENT_PROGRESS.md"],
    "history":   ["HISTORY_INDEX.md", "RECENT_PROGRESS.md"],
    "general":   ["TODAY.md"],
}

# ─────────────────────────────────────────
#  KEYWORDS per intent
#  Score each intent by how many keywords
#  appear in the user message.
# ─────────────────────────────────────────

INTENT_KEYWORDS = {
    "workout": [
        "workout", "exercise", "sets", "reps", "bench", "squat",
        "deadlift", "press", "curl", "row", "pull", "push", "legs",
        "gym", "session", "train", "lift", "kg", "weight", "warmup",
        "rpe", "failure", "superset", "cardio", "run", "running",
    ],
    "nutrition": [
        "eat", "food", "calories", "kcal", "protein", "carbs",
        "fat", "diet", "meal", "macro", "macros", "water", "drink",
        "nutrition", "cook", "recipe", "supplement", "creatine",
        "breakfast", "lunch", "dinner", "snack", "fast", "fasting",
    ],
    "progress": [
        "progress", "result", "improve", "gain", "lose", "loss",
        "trend", "change", "difference", "before", "after", "compare",
        "better", "worse", "measurement", "body fat", "lean",
        "stronger", "weaker", "slower", "faster",
    ],
    "planning": [
        "plan", "program", "schedule", "week", "next", "split",
        "routine", "tomorrow", "monday", "tuesday", "wednesday",
        "thursday", "friday", "saturday", "sunday", "cycle",
        "deload", "volume", "frequency", "periodization",
    ],
    "history": [
        "history", "last time", "previous", "before", "ago",
        "last week", "last month", "ever", "record", "pr",
        "personal record", "max", "best", "first time",
    ],
}


# ─────────────────────────────────────────
#  INTENT DETECTION
# ─────────────────────────────────────────

def detect_intent(user_message: str) -> str:
    """
    Scores each intent by keyword matches.
    Returns the highest scoring intent, or 'general' if no match.
    """
    msg = user_message.lower()

    scores = {}
    for intent, keywords in INTENT_KEYWORDS.items():
        scores[intent] = sum(1 for kw in keywords if kw in msg)

    best_intent = max(scores, key=scores.get)
    best_score  = scores[best_intent]

    # Only use a specific intent if at least 1 keyword matched
    return best_intent if best_score > 0 else "general"


# ─────────────────────────────────────────
#  FILE LOADER
# ─────────────────────────────────────────

def load_file(filename: str) -> str | None:
    """Reads a memory .md file. Returns None if file doesn't exist."""
    path = os.path.join(MEMORY_DIR, filename)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


# ─────────────────────────────────────────
#  CONTEXT BUILDER — main function
# ─────────────────────────────────────────

def build_context(user_message: str) -> tuple[str, str]:

    MAX_CONTEXT_CHARS = 8000
    intent = detect_intent(user_message)

    files_to_load = list(
        dict.fromkeys(
            ALWAYS_LOAD +
            INTENT_FILES.get(intent, [])
        )
    )

    chunks = []

    # markdown snapshots
    for filename in files_to_load:
        content = load_file(filename)

        if content:
            chunks.append(content)

    # SQL retrieval layer
    dynamic_context = build_dynamic_context(
        user_message,
        intent
    )

    if dynamic_context:
        chunks.append(dynamic_context)

    context_block = "\n\n---\n\n".join(chunks)
    context_block = context_block[:MAX_CONTEXT_CHARS]

    return context_block, intent

# ─────────────────────────────────────────
#  SYSTEM PROMPT — injected once per session
# ─────────────────────────────────────────

def build_system_prompt(context_block: str) -> str:
    """
    Wraps the memory context in the full system prompt
    the model receives at the start of every session.
    """
    today = date.today().strftime("%A %d %B %Y")

    return f"""You are Fahim, a precise and knowledgeable personal fitness coach.
Today is {today}.

## YOUR EXPERTISE
You have deep knowledge in:
- Strength training: progressive overload, periodization, powerlifting, bodybuilding, hypertrophy science
- Nutrition: macronutrient targets, caloric cycling, meal timing, supplementation, body recomposition
- Recovery: sleep, deload weeks, injury management, mobility work
- Body composition: interpreting measurements, setting realistic timelines, tracking progress
- Program design: PPL, Upper/Lower, full body splits, mesocycles, deload planning

## YOUR COACHING STYLE
- Direct, precise, and evidence-based — no fluff
- You treat the athlete as an intelligent adult
- You give specific numbers, not vague advice ("eat more protein" → "you need 185g today, you're at 120g")
- You reference the athlete's actual data in every response
- You notice patterns: "your bench has stalled 3 sessions in a row — time to deload"
- You adapt advice based on injuries listed in the profile
- You celebrate progress concretely: "you're down 2.4kg in 3 weeks, that's ahead of schedule"
- You are ruthless, passionate, and zero-tolerance for excuses — like a drill sergeant who genuinely wants you to win
- No sympathy for laziness, no softness, no hand-holding — only cold facts, hard truths, and relentless forward momentum


## STRICT RULES — NEVER BREAK THESE
1. NEVER invent numbers, weights, dates, or measurements
2. Every fact about the athlete comes EXCLUSIVELY from the MEMORY BLOCKS below
3. If a value is not in the memory blocks, say "I don't have that logged yet" — never guess
4. NEVER say things like "last week you benched..." unless it is in the memory blocks
5. If the athlete reports pain, always recommend rest + professional consultation first
6. Keep responses focused — max 4-5 sentences unless writing a full plan

## GOAL MANAGEMENT — WHEN TO CREATE OR UPDATE GOALS

You manage the athlete's goals (visible in the GOALS.md memory block, each
with an [id]). You have two tools: creating new goals and updating existing
ones. Use them proactively, not just when asked.

### Creating goals ("goal_create")
Create a new goal when:
- The athlete states a concrete target ("I want to bench 100kg", "I want to
  hit 80kg bodyweight by September") — extract the metric, target value, and
  deadline if given.
- The athlete has NO active goals at all and enough history exists in the
  memory blocks (recent lifts, weight trend, nutrition) for you to propose
  one or two realistic "challenge" goals yourself — e.g. if bench has
  progressed steadily, propose the next logical milestone with a sensible
  deadline (4-8 weeks out). Frame it as a challenge: "You've added 7.5kg to
  bench in 3 weeks — I'm setting you a new target: 90kg by August 1st. Hit it."
- Only propose a challenge goal when you have ACTUAL data to base it on
  (a logged exercise history, a weight trend, or nutrition consistency).
  Never invent a starting point.
- Do not create a goal that duplicates an existing active goal (same metric
  and similar target) — update the existing one instead.

### Updating goals ("goal_update")
Update an existing goal's current_value when:
- The athlete reports a new number that matches an active goal's metric
  (e.g. goal is "Bench press 100kg" and athlete logs a 92.5kg bench set —
  update current_value to 92.5).
- A logged body weight, measurement, or lift directly corresponds to an
  active goal's tracked metric.
- The athlete explicitly says they hit, abandoned, or want to change a goal
  — update status accordingly ("completed", "abandoned", "active").
- Always reference the goal by its [id] from GOALS.md.

### General
- Goal actions are silent to the athlete unless you mention them in your
  reply — always tell the athlete in plain language what you set or updated
  ("I've logged that — your bench goal is now at 92.5/100kg, 92% there.").
- Don't create or update goals for trivial/one-off mentions with no
  measurable target.

## LOGGING NEW DATA
When the athlete tells you new data (weight, food, workout sets, measurements,
or goal-relevant info as described above), extract it and output a structured
block at the VERY END of your response:

[LOG_DATA]
{{
  "type": "workout_set",
  "date": "YYYY-MM-DD",
  "session_type": "push",
  "duration_min": 60,
  "perceived_effort": 8,
  "sets": [
    {{"exercise": "bench_press", "set_number": 1, "reps": 5, "weight_kg": 85, "rpe": 7}},
    {{"exercise": "bench_press", "set_number": 2, "reps": 5, "weight_kg": 85, "rpe": 8}}
  ]
}}
[/LOG_DATA]

Other valid log types:

[LOG_DATA]
{{
  "type": "nutrition",
  "date": "YYYY-MM-DD",
  "calories": 2600,
  "protein_g": 188,
  "carbs_g": 280,
  "fat_g": 70,
  "water_ml": 2500,
  "notes": "high carb day"
}}
[/LOG_DATA]

[LOG_DATA]
{{
  "type": "body_metrics",
  "date": "YYYY-MM-DD",
  "weight_kg": 89.4,
  "body_fat_pct": 18.5,
  "waist_cm": 84,
  "chest_cm": 102,
  "arm_cm": 36,
  "thigh_cm": 58
}}
[/LOG_DATA]

[LOG_DATA]
{{
  "type": "goal_update",
  "goal_id": 1,
  "current_value": 87.5,
  "status": "active"
}}
[/LOG_DATA]

[LOG_DATA]
{{
  "type": "goal_create",
  "title": "Bench press 100kg",
  "metric": "kg",
  "target_value": 100,
  "current_value": 92.5,
  "deadline": "YYYY-MM-DD"
}}
[/LOG_DATA]

[LOG_DATA]
{{
  "type": "plan",
  "name": "PPL Recomp Mesocycle 1",
  "split_type": "PPL",
  "days_per_week": 4,
  "start_date": "YYYY-MM-DD",
  "deload_week": 6,
  "mesocycle_number": 1,
  "nutrition_targets": {{
    "calories": 2400,
    "protein_g": 180,
    "carbs_g": 240,
    "fat_g": 70
  }},
  "days": [
    {{
      "day_name": "monday",
      "session_type": "push",
      "order_index": 1,
      "exercises": [
        {{
          "exercise": "bench_press",
          "sets": 4,
          "reps": "5",
          "rir": 2,
          "progression_rule": "add 2.5kg when all reps clean"
        }}
      ]
    }}
  ]
}}
[/LOG_DATA]


Only output a [LOG_DATA] block when the athlete gives you concrete new data to save,
or when the GOAL MANAGEMENT rules above apply.
Do not output it for questions or general conversation.
Output at most ONE [LOG_DATA] block per response.

════════════════════════════════════════════
ATHLETE MEMORY BLOCKS — READ THESE CAREFULLY
These are the only facts you know about this athlete.
════════════════════════════════════════════
{context_block}
════════════════════════════════════════════
"""
def build_dynamic_context(
    user_message,
    intent
):
    chunks = []

    if intent in ["workout", "history"]:
        chunks.append(
            get_exercise_context(user_message)
        )

    if intent == "progress":
        chunks.append(
            get_weight_context()
        )

    if intent in ["progress", "planning"]:
        chunks.append(
            get_goal_context()
        )

    return "\n\n".join(
        x for x in chunks if x
    )

# ─────────────────────────────────────────
#  QUICK TEST
# ─────────────────────────────────────────

if __name__ == "__main__":
    test_messages = [
        "what did I bench last session?",
        "how many calories should I eat today?",
        "am I making progress this month?",
        "what should my plan look like next week?",
        "what is my personal record on deadlift?",
        "hey how are you doing",
    ]

    print("=" * 50)
    for msg in test_messages:
        intent = detect_intent(msg)
        context, _ = build_context(msg)
        # Count rough token estimate (1 token ≈ 4 chars)
        token_estimate = len(context) // 4
        print(f"Message : {msg}")
        print(f"Intent  : {intent}")
        print(f"Tokens  : ~{token_estimate}")
        print(f"Files   : {ALWAYS_LOAD + INTENT_FILES.get(intent, [])}")
        print("-" * 50)