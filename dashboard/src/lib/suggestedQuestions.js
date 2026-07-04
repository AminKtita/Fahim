import dayjs from 'dayjs'
import { deriveNutStatus } from './NutritionModals'

/**
 * getSuggestedQuestions(status) — generates 3-5 contextual chat prompts
 * based on live dashboard state: today's workout/nutrition status,
 * streak, active plan, and active goals.
 *
 * Returns an array of { id, label, text } — `label` is the short chip
 * text, `text` is the full message that gets placed in the chat input
 * when clicked.
 *
 * Pure function — no side effects, safe to call on every render.
 */

const DAY_NAME_MAP = {
  sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6,
  sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6,
}

function getPlanDayForDate(plan, date) {
  if (!plan?.days?.length) return null
  const dow = dayjs(date).day()
  return plan.days.find(d => DAY_NAME_MAP[d.day_name?.toLowerCase()] === dow) ?? null
}

export function getSuggestedQuestions(status) {
  if (!status) return []

  const { _workouts: workouts, _nutrition: nutrition, _plan: plan, _goals: goals, streak } = status
  const today = dayjs().format('YYYY-MM-DD')
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD')

  const todayWorkout   = workouts?.find(w => w.date === today)
  const todayNutrition = nutrition?.find(n => n.date === today)
  const yesterdayNutrition = nutrition?.find(n => n.date === yesterday)
  const yesterdayWorkout   = workouts?.find(w => w.date === yesterday)

  const planDayToday = getPlanDayForDate(plan, today)
  const targets = plan?.nutrition_targets

  const todayWorkoutDone = !!(todayWorkout && todayWorkout.session_type !== 'missed' && todayWorkout.session_type !== 'rest')
  const todayNutStatus   = deriveNutStatus(todayNutrition, targets)
  const yesterdayNutStatus = deriveNutStatus(yesterdayNutrition, targets)

  const candidates = []

  // ── Workout-related ──────────────────────────────────────────
  if (todayWorkout?.session_type === 'missed') {
    candidates.push({
      id: 'missed-today',
      priority: 100,
      label: "I missed today's session",
      text: "I missed today's planned session. Should I adjust the rest of this week, or just pick the plan back up tomorrow?",
    })
  } else if (!todayWorkout && planDayToday) {
    candidates.push({
      id: 'todays-plan',
      priority: 90,
      label: "What's on the program today?",
      text: "What's on the program for today? Walk me through the planned exercises, sets, and reps.",
    })
  } else if (!todayWorkout && !planDayToday && plan) {
    candidates.push({
      id: 'rest-day-today',
      priority: 40,
      label: "It's a rest day — anything to do?",
      text: "Today's a rest day on my plan. Anything I should focus on — mobility, recovery, nutrition?",
    })
  } else if (todayWorkoutDone) {
    candidates.push({
      id: 'how-was-today',
      priority: 70,
      label: "How did today's session look?",
      text: "How did today's session compare to my last few sessions for the same lifts? Any signs I should adjust weight or volume next time?",
    })
  }

  if (yesterdayWorkout?.session_type === 'missed') {
    candidates.push({
      id: 'missed-yesterday',
      priority: 85,
      label: "I missed yesterday — what now?",
      text: "I missed yesterday's planned session. How should I handle today and the rest of the week?",
    })
  }

  // ── Nutrition-related ────────────────────────────────────────
  if (!todayNutrition?.calories && todayNutrition?.notes !== '__MISSED__') {
    candidates.push({
      id: 'what-to-eat',
      priority: 80,
      label: "What should I eat today?",
      text: "I haven't logged nutrition yet today. Based on my targets, what should my meals look like to hit my macros?",
    })
  }

  if (todayNutrition?.notes === '__MISSED__') {
    candidates.push({
      id: 'off-plan-today',
      priority: 75,
      label: "Today was off-plan — how do I recover?",
      text: "Today was an off-plan eating day. How should I adjust tomorrow to get back on track without overcorrecting?",
    })
  }

  if (yesterdayNutStatus === 'off' || yesterdayNutStatus === 'partial' || yesterdayNutStatus === 'missed' || yesterdayNutStatus === 'exceeded') {
    candidates.push({
      id: 'yesterday-nutrition',
      priority: 65,
      label: "How was yesterday's nutrition?",
      text: "How did yesterday's nutrition compare to my targets? What should I focus on today to make up for it?",
    })
  }

  if (todayNutStatus === 'exceeded') {
    candidates.push({
      id: 'today-exceeded',
      priority: 60,
      label: "I went over my targets today — now what?",
      text: "I exceeded my nutrition targets today. Is this something to worry about, and how should I approach the rest of the week?",
    })
  }

  if (todayNutStatus === 'hit') {
    candidates.push({
      id: 'nutrition-on-track',
      priority: 30,
      label: "Am I on track this week?",
      text: "How's my nutrition consistency looking this week compared to my targets?",
    })
  }

  // ── Streak ────────────────────────────────────────────────────
  if (streak >= 3) {
    candidates.push({
      id: 'streak-status',
      priority: 50,
      label: `How's my ${streak}-day streak?`,
      text: `I'm on a ${streak}-day streak right now. What's been working, and what would break it if I'm not careful?`,
    })
  } else if (streak === 0) {
    candidates.push({
      id: 'rebuild-streak',
      priority: 35,
      label: "Help me rebuild momentum",
      text: "My streak reset. What's the highest-priority thing to fix this week to get back on track?",
    })
  }

  // ── Goals ─────────────────────────────────────────────────────
  if (!goals || goals.length === 0) {
    candidates.push({
      id: 'set-a-goal',
      priority: 60,
      label: "Set me a challenge goal",
      text: "I don't have any active goals right now. Based on my recent training and nutrition data, set me a challenging but realistic goal.",
    })
  } else {
    // Find a goal that hasn't been updated recently (heuristic: lowest progress %)
    const sorted = [...goals].sort((a, b) => {
      const pa = a.target_value ? (a.current_value ?? 0) / a.target_value : 0
      const pb = b.target_value ? (b.current_value ?? 0) / b.target_value : 0
      return pa - pb
    })
    const goal = sorted[0]
    if (goal) {
      candidates.push({
        id: 'goal-progress',
        priority: 45,
        label: `Update progress on "${goal.title}"`,
        text: `I want to update my progress on the goal "${goal.title}". Here's my latest number: `,
      })
    }
  }

  // ── Planning ──────────────────────────────────────────────────
  if (!plan) {
    candidates.push({
      id: 'build-a-plan',
      priority: 95,
      label: "Build me a training plan",
      text: "I don't have a training plan set up yet. Based on my profile and goals, can you build me one?",
    })
  } else if (dayjs().day() === 0) { // Sunday — week wrap-up
    candidates.push({
      id: 'week-review',
      priority: 55,
      label: "How did this week go?",
      text: "It's the end of the week — how did my training and nutrition go overall compared to the plan?",
    })
  }

  // ── Fallback general questions (always available, low priority) ──
  candidates.push({
    id: 'general-checkin',
    priority: 10,
    label: "Quick check-in",
    text: "Quick check-in — based on everything you know, what's the one thing I should focus on right now?",
  })

  // Sort by priority desc, dedupe by id, take top 5
  const seen = new Set()
  const ranked = candidates
    .sort((a, b) => b.priority - a.priority)
    .filter(c => {
      if (seen.has(c.id)) return false
      seen.add(c.id)
      return true
    })
    .slice(0, 5)

  return ranked
}