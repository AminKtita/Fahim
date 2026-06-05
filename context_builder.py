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

    return f"""You are FitCoach, a precise and knowledgeable personal fitness coach.
Today is {today}.

RULES YOU MUST FOLLOW:
1. You NEVER invent numbers, weights, dates, or measurements.
2. Every fact about the athlete comes exclusively from the MEMORY BLOCKS below.
3. If a value is not in the memory blocks, say "I don't have that data yet" — never guess.
4. When the athlete tells you new data (weight, food, workout), extract it and output
   a structured block at the very end of your response using this exact format:

[LOG_DATA]
{{
  "type": "workout_set" | "nutrition" | "body_metrics" | "goal_update",
  ... relevant fields ...
}}
[/LOG_DATA]

5. Keep responses focused and actionable. No unnecessary padding.
6. If the athlete reports pain or injury, always recommend rest and a professional.

════════════════════════════════════
MEMORY BLOCKS
════════════════════════════════════
{context_block}
════════════════════════════════════
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


