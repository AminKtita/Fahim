import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { getWorkouts, getNutrition, getPlan } from './api'
import dayjs from 'dayjs'

// ── streak logic ──────────────────────────────────────────────────────────────
// Rules:
//  • Planned REST days: always count as a "pass" — dot shows, streak continues
//  • Non-rest day: needs workout (non-missed/rest) AND nutrition (calories > 0, not __MISSED__)
//  • Missed workout OR missed/no nutrition on a non-rest day → streak resets
//  • Today is allowed to be incomplete (day not over) — skip it once, count from yesterday

const DAY_NAME_MAP = {
  sunday:0, monday:1, tuesday:2, wednesday:3,
  thursday:4, friday:5, saturday:6,
  sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6,
}

function isPlannedRestDay(date, plan) {
  if (!plan?.days?.length) return false
  const dow = dayjs(date).day()
  return !plan.days.find(d => DAY_NAME_MAP[d.day_name?.toLowerCase()] === dow)
}

export function computeStreak(workouts, nutrition, plan) {
  if (!workouts || !nutrition) return 0

  const wMap = {}; workouts.forEach(w => { wMap[w.date] = w })
  const nMap = {}; nutrition.forEach(n => { nMap[n.date] = n })

  let streak = 0
  let d = dayjs()

  for (let i = 0; i < 120; i++) {
    const iso   = d.format('YYYY-MM-DD')
    const isRest = isPlannedRestDay(iso, plan)

    if (isRest) {
      // Rest day: counts only if nutrition is hit (or today hasn't passed yet)
      const nutHit = !!(nMap[iso] && nMap[iso].notes !== '__MISSED__' && nMap[iso].calories > 0)
      if (nutHit) {
        streak++
        d = d.subtract(1, 'day')
        continue
      }
      if (i === 0) { d = d.subtract(1, 'day'); continue } // today: skip, not over yet
      break // past rest day with no nutrition → streak ends
    }

    const w = wMap[iso]
    const n = nMap[iso]
    const workoutDone = !!(w && w.session_type !== 'missed' && w.session_type !== 'rest')
    const nutHit      = !!(n && n.notes !== '__MISSED__' && n.calories > 0)

    if (workoutDone && nutHit) {
      streak++
      d = d.subtract(1, 'day')
    } else if (i === 0) {
      // Today incomplete — allowed, skip and look at yesterday
      d = d.subtract(1, 'day')
      continue
    } else {
      break // past non-rest day failed — streak ends
    }
  }

  return streak
}

// ── context ───────────────────────────────────────────────────────────────────
const StatusContext = createContext(null)

export function StatusProvider({ children }) {
  const [status, setStatus]   = useState(null)
  const pendingRef            = useRef(false)
  const timerRef              = useRef(null)

  const load = useCallback(async () => {
    if (pendingRef.current) return   // already in-flight
    pendingRef.current = true
    try {
      const today = dayjs().format('YYYY-MM-DD')
      const [workouts, nutrition, plan] = await Promise.all([
        getWorkouts(120),
        getNutrition(120),
        getPlan().catch(() => null),
      ])

      const todayW = workouts?.find(w => w.date === today)
      const todayN = nutrition?.find(n => n.date === today)

      setStatus({
        ollamaOk:             true,
        streak:               computeStreak(workouts, nutrition, plan),
        workoutToday:         !!(todayW && todayW.session_type !== 'missed' && todayW.session_type !== 'rest'),
        nutritionLoggedToday: !!(todayN?.calories),
        // expose raw data so Schedule can use it without re-fetching
        _workouts:  workouts,
        _nutrition: nutrition,
        _plan:      plan,
      })
    } catch {
      setStatus({ ollamaOk: false, streak: 0, workoutToday: false, nutritionLoggedToday: false })
    } finally {
      pendingRef.current = false
    }
  }, [])

  // Debounced refresh — pages call this after any save
  // Multiple saves in quick succession coalesce into one request after 600 ms
  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { load() }, 600)
  }, [load])

  useEffect(() => {
    load()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [load])

  return (
    <StatusContext.Provider value={{ status, refresh }}>
      {children}
    </StatusContext.Provider>
  )
}

export function useStatus() {
  return useContext(StatusContext)
}