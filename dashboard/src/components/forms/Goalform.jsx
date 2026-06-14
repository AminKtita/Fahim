import { useState } from 'react'
import { createGoal } from '../../lib/api'
import styles from './Form.module.css'
import dayjs from 'dayjs'

const METRIC_OPTIONS = [
  { label: 'kg (weight / lift)', value: 'kg' },
  { label: 'g/day (protein)',    value: 'g/day' },
  { label: 'lbs',                value: 'lbs' },
  { label: '% (body fat)',       value: '%' },
  { label: 'cm (measurement)',   value: 'cm' },
  { label: 'sessions/week',      value: 'sessions/week' },
  { label: 'sessions/month',     value: 'sessions/month' },
  { label: 'reps',               value: 'reps' },
  { label: 'km/run',             value: 'km' },
  { label: 'min (time)',         value: 'min' },
  { label: 'kcal/day',           value: 'kcal/day' },
  { label: 'days (streak)',      value: 'days' },
  { label: 'custom…',            value: '__custom__' },
]

export default function GoalForm({ onSaved }) {
  const [form, setForm] = useState({
    title: '', metric: 'kg', metricCustom: '', target_value: '', current_value: '',
    deadline_d: '', deadline_m: '', deadline_y: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const resolvedMetric = form.metric === '__custom__' ? form.metricCustom : form.metric

  const resolvedDeadline = () => {
    const { deadline_d, deadline_m, deadline_y } = form
    if (!deadline_d || !deadline_m || !deadline_y) return null
    const d = dayjs(`${deadline_y}-${String(deadline_m).padStart(2,'0')}-${String(deadline_d).padStart(2,'0')}`)
    return d.isValid() ? d.format('YYYY-MM-DD') : null
  }

  const handleSubmit = async () => {
    if (!form.title)         { setError('Title is required'); return }
    if (!form.target_value)  { setError('Target value is required'); return }
    setSaving(true); setError(null)
    try {
      await createGoal({
        title:         form.title,
        metric:        resolvedMetric,
        target_value:  Number(form.target_value),
        current_value: form.current_value ? Number(form.current_value) : null,
        deadline:      resolvedDeadline(),
      })
      setSaved(true)
      setForm({ title:'', metric:'kg', metricCustom:'', target_value:'', current_value:'', deadline_d:'', deadline_m:'', deadline_y:'' })
      setTimeout(() => setSaved(false), 2500)
      onSaved?.()
    } catch(e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className={styles.field} style={{ marginBottom: 10 }}>
        <label className={styles.label}>Goal title</label>
        <input type="text" placeholder="e.g. Bench press 110kg"
          value={form.title} onChange={e => set('title', e.target.value)} />
      </div>

      <div className={styles.grid2}>
        {/* METRIC DROPDOWN */}
        <div className={styles.field}>
          <label className={styles.label}>Metric / unit</label>
          <select value={form.metric} onChange={e => set('metric', e.target.value)}>
            {METRIC_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {form.metric === '__custom__' && (
            <input
              type="text"
              placeholder="e.g. pull-ups, L-sit seconds…"
              value={form.metricCustom}
              onChange={e => set('metricCustom', e.target.value)}
              style={{ marginTop: 6 }}
            />
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Target value</label>
          <input type="number" placeholder="e.g. 110"
            value={form.target_value} onChange={e => set('target_value', e.target.value)} />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Current value</label>
          <input type="number" placeholder="e.g. 100"
            value={form.current_value} onChange={e => set('current_value', e.target.value)} />
        </div>

        {/* DEADLINE dd / mm / yyyy */}
        <div className={styles.field}>
          <label className={styles.label}>Deadline (dd / mm / yyyy)</label>
          <div style={{ display:'flex', gap:6 }}>
            <input type="number" placeholder="DD"  min="1"  max="31"   value={form.deadline_d}
              onChange={e => set('deadline_d', e.target.value)} style={{ width:52 }} />
            <input type="number" placeholder="MM"  min="1"  max="12"   value={form.deadline_m}
              onChange={e => set('deadline_m', e.target.value)} style={{ width:52 }} />
            <input type="number" placeholder="YYYY" min="2024" max="2040" value={form.deadline_y}
              onChange={e => set('deadline_y', e.target.value)} />
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        {error && <span className={styles.error}>{error}</span>}
        {saved  && <span className={styles.success}>GOAL CREATED ✓</span>}
        <button onClick={handleSubmit} disabled={saving}>
          {saving ? 'SAVING…' : 'CREATE_GOAL →'}
        </button>
      </div>
    </div>
  )
}