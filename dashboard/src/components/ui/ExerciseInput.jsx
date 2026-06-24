/**
 * ExerciseInput — free-text input with autocomplete suggestions drawn from
 * the canonical exercise library (GET /api/exercises).
 *
 * Behaves like a plain text input (so existing free-text exercise names
 * keep working untouched), but shows a matching dropdown of library
 * exercises as the athlete types.
 *
 * onChange(text, libraryExercise|null) fires on every keystroke and on
 * suggestion pick — libraryExercise is the full library row when the text
 * exactly matches one, otherwise null, so the caller always has both the
 * current text and exercise_id/metadata link in one place (no stale state).
 */
import { useState, useRef, useEffect } from 'react'
import styles from './ExerciseInput.module.css'

export default function ExerciseInput({
  value,
  onChange,             // (text: string, libraryExercise: object|null) => void
  library = [],          // array of exercise rows: {exercise_id, exercise_name, body_part, equipment, ...}
  placeholder = 'exercise name',
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)

  const query = (value ?? '').trim().toLowerCase()
  const matches = query.length === 0
    ? library.slice(0, 8)
    : library
        .filter(e =>
          e.exercise_name.toLowerCase().includes(query) ||
          e.exercise_id.toLowerCase().includes(query)
        )
        .slice(0, 8)

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const pick = (ex) => {
    onChange(ex.exercise_name, ex)
    setOpen(false)
  }

  const handleChange = (e) => {
    const text = e.target.value
    const exact = library.find(ex => ex.exercise_name.toLowerCase() === text.trim().toLowerCase())
    onChange(text, exact ?? null)
    setHighlight(0)
    setOpen(true)
  }

  const handleKeyDown = (e) => {
    if (!open || matches.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(matches[highlight]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        className={styles.input}
      />
      {open && matches.length > 0 && (
        <div className={styles.menu}>
          {matches.map((ex, i) => (
            <div
              key={ex.exercise_id}
              className={`${styles.item} ${i === highlight ? styles.itemActive : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(ex) }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className={styles.itemName}>{ex.exercise_name}</span>
              <span className={styles.itemMeta}>{ex.body_part}{ex.equipment ? ` · ${ex.equipment}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
