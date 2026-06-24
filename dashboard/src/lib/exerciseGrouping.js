/**
 * exerciseGrouping — shared helpers for matching/grouping workout sets by
 * exercise across the dashboard (Workouts, Schedule, Progress).
 *
 * Sets logged through the new ExerciseInput picker carry exercise_id, which
 * is the reliable, canonical key. Sets logged as free text (old data, or an
 * exercise not in the library) only have the `exercise` string. Grouping by
 * exercise_id first and falling back to a normalized lowercase string keeps
 * both kinds of data merging correctly — "Bench Press" and "bench press"
 * still group together even without exercise_id.
 */

/** The key to group/match a set by: exercise_id if present, else normalized text. */
export function exerciseKey(set) {
  if (set?.exercise_id) return `id:${set.exercise_id}`
  return `name:${(set?.exercise ?? '').trim().toLowerCase()}`
}

/** Best display name for a set/group: prefer the library exercise_name. */
export function exerciseDisplayName(set) {
  return set?.exercise_name ?? set?.exercise ?? ''
}

/**
 * Converts a JSON-array-string field (how primary_muscles, secondary_muscles,
 * technique_cues, and common_mistakes are stored in the exercises table,
 * e.g. '["pectoralis major","triceps brachii"]') into a friendly
 * comma-separated display string. Falls back to the raw value if it isn't
 * valid JSON, and returns '' for null/empty.
 */
export function jsonArrayToText(value) {
  if (!value) return ''
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.join(', ') : value
  } catch {
    return value
  }
}

/** Same as jsonArrayToText but returns an array of trimmed items, for rendering as a <ul>. */
export function jsonArrayToList(value) {
  const text = jsonArrayToText(value)
  return text ? text.split(',').map(s => s.trim()).filter(Boolean) : []
}
/**
 * Groups an array of sets by exerciseKey.
 * Returns an array of { key, name, sets } preserving first-seen order.
 */
export function groupSetsByExercise(sets) {
  const order = []
  const byKey = {}
  for (const s of sets ?? []) {
    const key = exerciseKey(s)
    if (!byKey[key]) {
      byKey[key] = { key, name: exerciseDisplayName(s), sets: [] }
      order.push(key)
    }
    byKey[key].sets.push(s)
  }
  return order.map(k => byKey[k])
}
