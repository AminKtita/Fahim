import { useState } from 'react'
import { logMetrics } from '../../lib/api'
import dayjs from 'dayjs'
import styles from './Form.module.css'

export default function MetricsForm({ onSaved }) {
  const [form, setForm] = useState({
    date: dayjs().format('YYYY-MM-DD'),
    weight_kg: '', body_fat_pct: '',
    waist_cm: '', chest_cm: '', hips_cm: '', arm_cm: '', thigh_cm: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const num = v => v !== '' ? Number(v) : null

  const handleSubmit = async () => {
    setSaving(true); setError(null)
    try {
      await logMetrics({
        date: form.date,
        weight_kg:    num(form.weight_kg),
        body_fat_pct: num(form.body_fat_pct),
        waist_cm:     num(form.waist_cm),
        chest_cm:     num(form.chest_cm),
        hips_cm:      num(form.hips_cm),
        arm_cm:       num(form.arm_cm),
        thigh_cm:     num(form.thigh_cm),
        notes:        form.notes || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onSaved?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const F = ({ label, k, placeholder }) => (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input type="number" step="0.1" placeholder={placeholder}
        value={form[k]} onChange={e => set(k, e.target.value)} />
    </div>
  )

  return (
    <div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Date</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <F label="Weight (kg)"     k="weight_kg"    placeholder="e.g. 82.5" />
        <F label="Body fat (%)"    k="body_fat_pct" placeholder="e.g. 18.0" />
        <F label="Waist (cm)"      k="waist_cm"     placeholder="e.g. 84"   />
        <F label="Chest (cm)"      k="chest_cm"     placeholder="e.g. 102"  />
        <F label="Hips (cm)"       k="hips_cm"      placeholder="e.g. 96"   />
        <F label="Arm (cm)"        k="arm_cm"       placeholder="e.g. 37"   />
        <F label="Thigh (cm)"      k="thigh_cm"     placeholder="e.g. 58"   />
      </div>
      <div className={styles.field} style={{ marginTop: 10 }}>
        <label className={styles.label}>Notes</label>
        <input type="text" placeholder="optional" value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <div className={styles.actions}>
        {error && <span className={styles.error}>{error}</span>}
        {saved  && <span className={styles.success}>✓ Saved</span>}
        <button className="btn-accent" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : 'Save metrics'}
        </button>
      </div>
    </div>
  )
}