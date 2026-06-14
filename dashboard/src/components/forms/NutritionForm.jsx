import { useState } from 'react'
import { logNutrition } from '../../lib/api'
import dayjs from 'dayjs'
import styles from './Form.module.css'

export default function NutritionForm({ onSaved }) {
  const today = dayjs().format('YYYY-MM-DD')
  const [form, setForm] = useState({ date: today, calories: '', protein_g: '', carbs_g: '', fat_g: '', water_ml: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    setSaving(true); setError(null)
    try {
      await logNutrition({
        ...form,
        calories:   form.calories   ? Number(form.calories)   : null,
        protein_g:  form.protein_g  ? Number(form.protein_g)  : null,
        carbs_g:    form.carbs_g    ? Number(form.carbs_g)    : null,
        fat_g:      form.fat_g      ? Number(form.fat_g)      : null,
        water_ml:   form.water_ml   ? Number(form.water_ml)   : null,
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

  return (
    <div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label}>Date</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Calories (kcal)</label>
          <input type="number" placeholder="e.g. 2400" value={form.calories} onChange={e => set('calories', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Protein (g)</label>
          <input type="number" placeholder="e.g. 185" value={form.protein_g} onChange={e => set('protein_g', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Carbs (g)</label>
          <input type="number" placeholder="e.g. 300" value={form.carbs_g} onChange={e => set('carbs_g', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Fat (g)</label>
          <input type="number" placeholder="e.g. 80" value={form.fat_g} onChange={e => set('fat_g', e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Water (ml)</label>
          <input type="number" placeholder="e.g. 2500" value={form.water_ml} onChange={e => set('water_ml', e.target.value)} />
        </div>
      </div>
      <div className={styles.field} style={{ marginTop: 10 }}>
        <label className={styles.label}>Notes</label>
        <input type="text" placeholder="optional" value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <div className={styles.actions}>
        {error && <span className={styles.error}>{error}</span>}
        {saved && <span className={styles.success}>SAVED ✓</span>}
        <button onClick={handleSubmit} disabled={saving}>
          {saving ? 'SAVING…' : 'SAVE_LOG →'}
        </button>
      </div>
    </div>
  )
}