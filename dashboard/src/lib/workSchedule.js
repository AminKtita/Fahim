/**
 * workSchedule.js — JS mirror of the shift rotation math in work_schedule.py.
 * Kept in sync with the backend's get_shift_for_date(). Used by the
 * Schedule calendar to show a shift badge on every day cell from a single
 * settings fetch, instead of one API call per cell. See work_schedule.py
 * for the full explanation of the rotation.
 */

// dateStr: 'YYYY-MM-DD'. Returns a UTC-safe day count difference.
function daysBetween(fromStr, toStr) {
  const from = new Date(fromStr + 'T00:00:00Z')
  const to = new Date(toStr + 'T00:00:00Z')
  return Math.round((to - from) / 86400000)
}

// JS-safe positive modulo (JS `%` can return negative results)
function mod(n, m) {
  return ((n % m) + m) % m
}

/**
 * @param {string} iso - 'YYYY-MM-DD'
 * @param {object} settings - result of getWorkScheduleSettings()
 * @returns {{ type: 'morning'|'evening'|'night'|'rest', start: string|null, end: string|null }}
 */
export function getShiftForDate(iso, settings) {
  if (!settings) return { type: 'rest', start: null, end: null }

  const regimeLen = settings.regime_length_days
  const cycleLen = settings.cycle_length_days
  const superCycle = regimeLen * 2

  const daysSinceAnchor = daysBetween(settings.regime_anchor_date, iso)
  const regimeOffset = mod(daysSinceAnchor, superCycle)
  const isDayMonth = regimeOffset < regimeLen
  const cyclePos = mod(daysSinceAnchor, cycleLen)

  let shiftType
  if (cyclePos === 0 || cyclePos === 1) {
    shiftType = isDayMonth ? 'morning' : 'night'
  } else if (cyclePos === 2 || cyclePos === 3) {
    shiftType = 'evening'
  } else {
    shiftType = 'rest'
  }

  if (shiftType === 'rest') return { type: 'rest', start: null, end: null }

  return {
    type: shiftType,
    start: settings[`${shiftType}_start`],
    end: settings[`${shiftType}_end`],
  }
}