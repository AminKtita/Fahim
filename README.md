# Fahim
AI Fitness Coach Assistant
# Fahim — Local AI Fitness Coach

A fully local, privacy-first AI fitness coaching system powered by Ollama. 
Fahim tracks your workouts, nutrition, body composition, and progress 
through a structured SQLite database and generates intelligent, 
context-aware coaching responses — with zero data leaving your machine.

---

## What it does

Fahim acts as a personal fitness coach that remembers everything. 
Every workout set, nutrition day, body measurement, and training 
session is stored in a local database. Before each conversation, 
the system reads that data and injects only the relevant facts 
into the model's context window — so the AI never guesses, 
never hallucinates numbers, and always coaches based on 
your actual history.

---

## Core Features

### Physical Memory System
- SQLite database stores all athlete data permanently
- Auto-generated markdown memory files fed to the model per query
- Intent detection selects only relevant files per message
- Context window stays lean — never bloated

### Smart Context Injection
- 6 memory files: PROFILE, GOALS, TODAY, CURRENT_WEEK, 
  RECENT_PROGRESS, HISTORY_INDEX, PLAN
- Intent-aware loading: workout questions load workout files,
  nutrition questions load nutrition files
- Live DB retrieval layer for exercise history and trends
- Hard context cap prevents slowdowns

### Auto-Logging
- Model outputs structured [LOG_DATA] blocks when new data is mentioned
- Python intercepts and writes directly to DB automatically
- Memory files refresh immediately after every log
- Supports: workouts, sets, nutrition, body metrics, goals, plans

### Training Plan Management
- Full mesocycle planning stored in DB
- AI can design and save complete programs from scratch
- Auto-generates PLAN.md from DB — always current
- Progression rules, RIR targets, deload scheduling

### Daily Scheduler
- Computes daily summaries automatically
- Fills missing days, syncs goal progress
- Refreshes all memory files
- Runs on launch or via Windows Task Scheduler

### Live Thinking Stream
- Model's reasoning streams live in terminal before reply
- Separate thinking and response display
- Toggle debug mode for intent and token inspection

---

## Tech Stack

- Model: Agen/gemma-4-26B-A4B-it-uncensored-heretic via Ollama
- Database: SQLite (local, no server)
- Language: Python 3.11+
- Dependencies: requests, schedule

---

## Project Structure

\`\`\`
fitcoach/
├── main.py               # Chat loop, command handler, log interceptor
├── ollama_client.py      # Ollama API wrapper, streaming, thinking
├── context_builder.py    # Intent detection, context selection, system prompt
├── memory_manager.py     # All DB reads and writes
├── snapshot_writer.py    # DB → .md memory file generation
├── scheduler.py          # Daily auto-update, streak computation
├── retrieval.py          # Live DB queries for exercise history
├── log_workout.py        # CLI workout logger
├── log_nutrition.py      # CLI nutrition logger
├── log_metrics.py        # CLI body measurements logger
├── setup_profile.py      # One-time profile setup
├── setup_plan.py         # Manual plan loader (optional)
├── db/
│   ├── schema.sql        # Full database schema
│   └── fitness.db        # Local database (gitignored)
└── memory/               # Auto-generated .md files (gitignored)
    ├── PROFILE.md
    ├── GOALS.md
    ├── TODAY.md
    ├── CURRENT_WEEK.md
    ├── RECENT_PROGRESS.md
    ├── HISTORY_INDEX.md
    └── PLAN.md
\`\`\`

---

## How the Memory System Works

\`\`\`
You type a message
       │
       ▼
Intent detected (workout / nutrition / progress / planning / history)
       │
       ▼
Relevant .md files selected and loaded
       │
       ▼
Live DB queries added if exercise-specific
       │
       ▼
System prompt built: identity + rules + memory blocks
       │
       ▼
Sent to local Ollama model
       │
       ▼
Model streams thinking live, then streams reply
       │
       ▼
[LOG_DATA] block intercepted if present → saved to DB
       │
       ▼
Memory files refreshed for next message
\`\`\`

---

## Getting Started

### 1. Install Ollama and pull the model
\`\`\`
ollama pull Agen/gemma-4-26B-A4B-it-uncensored-heretic
\`\`\`

### 2. Install dependencies
\`\`\`
pip install requests schedule
\`\`\`

### 3. Initialize the database
\`\`\`
python db/init_db.py
\`\`\`

### 4. Set up your profile
\`\`\`
python setup_profile.py
\`\`\`

### 5. Log your body measurements
\`\`\`
python log_metrics.py
\`\`\`

### 6. Start Ollama in a separate terminal
\`\`\`
ollama serve
\`\`\`

### 7. Launch Fahim
\`\`\`
python main.py
\`\`\`

---

## Daily Workflow

\`\`\`
Before gym    → ask coach for today's session
After gym     → tell coach what you lifted → auto-logged
Daily         → type 'nutrition' → log macros
Weekly        → type 'metrics' → log weight
Every 6 weeks → ask coach to design next mesocycle
\`\`\`

---

## Commands

| Command | Action |
|---|---|
| `workout` | Log a full workout session |
| `nutrition` | Log daily calories and macros |
| `metrics` | Log body measurements |
| `refresh` | Force reload all memory files |
| `debug` | Toggle intent and token info |
| `quit` | End session |

---

## Privacy

Everything runs locally. No API keys. No cloud. 
Your weight, measurements, and training data 
never leave your machine.