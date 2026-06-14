import { useState } from 'react'
import { logWorkout } from '../../lib/api'
import dayjs from 'dayjs'
import styles from './Form.module.css'

const SESSION_TYPES = ['push', 'pull', 'legs', 'upper', 'lower', 'full_body', 'cardio', 'general']
const BLANK_SET = { exercise: '', set_number: 1, reps: '', weight_kg: '', rpe: '', is_warmup: false }

export default function WorkoutForm({ onSaved }) {
  const [form, setForm] = useState({
    date: dayjs().format('YYYY-MM-DD'),
    session_type: 'push',
    duration_min: '',
    perceived_effort: '',
    notes: '',
  })
  const [sets, setSets] = useState([{ ...BLANK_SET }])
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState(null)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setS = (i, k, v) => setSets(prev => prev.map((s, idx) => idx === i ? { ...s, [k]: v } : s))
  const addSet = () => setSets(prev => [...prev, { ...BLANK_SET, set_number: prev.length + 1 }])
  const removeSet = (i) => setSets(prev => prev.filter((_, idx) => idx !== i))

  const handleSubmit = async () => {
    setSaving(true); setError(null)
    try {
      const payload = {
        ...form,
        duration_min:     form.duration_min     ? Number(form.duration_min)     : null,
        perceived_effort: form.perceived_effort ? Number(form.perceived_effort) : null,
        sets: sets.filter(s => s.exercise).map((s, i) => ({
          ...s,
          set_number: i + 1,
          reps:      s.reps      ? Number(s.reps)      : null,
          weight_kg: s.weight_kg ? Number(s.weight_kg) : null,
          rpe:       s.rpe       ? Number(s.rpe)       : null,
        })),
      }
      await logWorkout(payload)
      setSaved(true)
      setSets([{ ...BLANK_SET }])
      setTimeout(() => setSaved(false), 2500)
      onSaved?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Date</label>
          <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Session type</label>
          <select value={form.session_type} onChange={e => setF('session_type', e.target.value)}>
            {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Duration (min)</label>
          <input type="number" placeholder="e.g. 70" value={form.duration_min} onChange={e => setF('duration_min', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Perceived effort (1–10)</label>
          <input type="number" min="1" max="10" placeholder="e.g. 8" value={form.perceived_effort} onChange={e => setF('perceived_effort', e.target.value)} />
        </div>
      </div>

      <div className={styles.setsHeader}>
        <span className={styles.setsLabel}>SETS.log</span>
        <button className="btn-ghost" style={{ padding: '4px 12px', fontSize: 10 }} onClick={addSet}>+ ADD SET</button>
      </div>

      <div className={styles.setsTable}>
        <div className={styles.setsRow} style={{ borderBottom: '1px solid var(--border)' }}>
          <span className={styles.colHead}>#</span>
          <span className={styles.colHead} style={{ flex: 3 }}>Exercise</span>
          <span className={styles.colHead}>Reps</span>
          <span className={styles.colHead}>kg</span>
          <span className={styles.colHead}>RPE</span>
          <span className={styles.colHead}>Warm</span>
          <span className={styles.colHead}></span>
        </div>
        {sets.map((s, i) => (
          <div key={i} className={styles.setsRow}>
            <span className={styles.setNum}>{i + 1}</span>
            <input style={{ flex: 3 }} placeholder="exercise name" value={s.exercise} onChange={e => setS(i, 'exercise', e.target.value)} />
            <input type="number" placeholder="—" value={s.reps} onChange={e => setS(i, 'reps', e.target.value)} />
            <input type="number" placeholder="—" value={s.weight_kg} onChange={e => setS(i, 'weight_kg', e.target.value)} />
            <input type="number" min="1" max="10" placeholder="—" value={s.rpe} onChange={e => setS(i, 'rpe', e.target.value)} />
            <input type="checkbox" checked={s.is_warmup} onChange={e => setS(i, 'is_warmup', e.target.checked)} style={{ width: 'auto' }} />
            <button className="btn-ghost" style={{ padding: '2px 8px', fontSize: 10, borderColor: 'transparent' }} onClick={() => removeSet(i)}>✕</button>
          </div>
        ))}
      </div>

      <div className={styles.field} style={{ marginTop: 12 }}>
        <label className={styles.label}>Notes</label>
        <input type="text" placeholder="optional" value={form.notes} onChange={e => setF('notes', e.target.value)} />
      </div>

      <div className={styles.actions}>
        {error && <span className={styles.error}>{error}</span>}
        {saved && <span className={styles.success}>SAVED ✓</span>}
        <button onClick={handleSubmit} disabled={saving}>
          {saving ? 'SAVING…' : 'SAVE_WORKOUT →'}
        </button>
      </div>
    </div>
  )
}