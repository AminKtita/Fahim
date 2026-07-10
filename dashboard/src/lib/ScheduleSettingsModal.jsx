/**
 * ScheduleSettingsModal — edit the rotating shift pattern, workout timing
 * buffers, and per-shift meal times that drive the Day Plan auto-suggestions
 * and the calendar shift badges. Backed by /api/day-plan/settings and
 * /api/day-plan/meal-rules.
 */

import { useState } from 'react'
import { getWorkScheduleSettings, updateWorkScheduleSettings, getMealRules, updateMealRule } from './api'
import styles from './ScheduleSettingsModal.module.css'

const SHIFT_TABS = [
  { key: 'morning', label: 'Morning' },
  { key: 'evening', label: 'Evening' },
  { key: 'night',   label: 'Night' },
  { key: 'rest',    label: 'Rest' },
]

export function useScheduleSettingsModals({ onSaved } = {}) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [settings, setSettings] = useState(null)
  const [mealRules, setMealRules] = useState(null)
  const [activeShift, setActiveShift] = useState('morning')

  const open = async () => {
    setIsOpen(true)
    setError(null)
    setLoading(true)
    try {
      const [s, m] = await Promise.all([getWorkScheduleSettings(), getMealRules()])
      setSettings(s)
      setMealRules(m)
    } catch (e) {
      setError('Could not load settings.')
    } finally {
      setLoading(false)
    }
  }

  const close = () => setIsOpen(false)

  const setField = (key, value) => setSettings(s => ({ ...s, [key]: value }))
  const setMealField = (shiftType, key, value) =>
    setMealRules(m => ({ ...m, [shiftType]: { ...m[shiftType], [key]: value } }))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateWorkScheduleSettings({
        regime_anchor_date: settings.regime_anchor_date,
        regime_length_days: Number(settings.regime_length_days),
        morning_start: settings.morning_start,
        morning_end: settings.morning_end,
        evening_start: settings.evening_start,
        evening_end: settings.evening_end,
        night_start: settings.night_start,
        night_end: settings.night_end,
        default_workout_duration_min: Number(settings.default_workout_duration_min),
        workout_buffer_after_work_min: Number(settings.workout_buffer_after_work_min),
        workout_buffer_before_work_min: Number(settings.workout_buffer_before_work_min),
        rest_day_workout_time: settings.rest_day_workout_time,
      })
      for (const key of ['morning', 'evening', 'night', 'rest']) {
        const r = mealRules[key]
        await updateMealRule(key, {
          meal1_label: r.meal1_label, meal1_time: r.meal1_time,
          meal2_label: r.meal2_label, meal2_time: r.meal2_time,
          meal3_label: r.meal3_label, meal3_time: r.meal3_time,
        })
      }
      setIsOpen(false)
      onSaved?.()
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  function Modals() {
    if (!isOpen) return null
    return (
      <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) close() }}>
        <div className={styles.modal}>
          <div className={styles.mHead}>
            <div className={styles.mTitle}>
              <span className={styles.mLabel}>Shift settings</span>
              <span className={styles.mSub}>Rotation, workout buffers &amp; meal times</span>
            </div>
            <button className={styles.mClose} onClick={close}>✕</button>
          </div>

          <div className={styles.mBody}>
            {loading && <div className={styles.statusMsg}>Loading…</div>}

            {!loading && settings && mealRules && (
              <>
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Rotation</div>
                  <div className={styles.grid2}>
                    <div className={styles.field}>
                      <span className={styles.label}>Day-month regime started on</span>
                      <input type="date" value={settings.regime_anchor_date}
                        onChange={e => setField('regime_anchor_date', e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <span className={styles.label}>Regime length (days)</span>
                      <input type="number" min="1" value={settings.regime_length_days}
                        onChange={e => setField('regime_length_days', e.target.value)} />
                    </div>
                  </div>
                  <div className={styles.hint}>
                    Cycle is fixed at 2 primary shift days, 2 evening days, 2 rest days.
                    Regimes alternate morning↔night every regime-length days, starting from the anchor date above.
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Shift times</div>
                  <div className={styles.grid3}>
                    <div className={styles.field}>
                      <span className={styles.label}>Morning start</span>
                      <input type="time" value={settings.morning_start}
                        onChange={e => setField('morning_start', e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <span className={styles.label}>Morning end</span>
                      <input type="time" value={settings.morning_end}
                        onChange={e => setField('morning_end', e.target.value)} />
                    </div>
                    <div />
                    <div className={styles.field}>
                      <span className={styles.label}>Evening start</span>
                      <input type="time" value={settings.evening_start}
                        onChange={e => setField('evening_start', e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <span className={styles.label}>Evening end</span>
                      <input type="time" value={settings.evening_end}
                        onChange={e => setField('evening_end', e.target.value)} />
                    </div>
                    <div />
                    <div className={styles.field}>
                      <span className={styles.label}>Night start</span>
                      <input type="time" value={settings.night_start}
                        onChange={e => setField('night_start', e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <span className={styles.label}>Night end</span>
                      <input type="time" value={settings.night_end}
                        onChange={e => setField('night_end', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Workout timing</div>
                  <div className={styles.grid2}>
                    <div className={styles.field}>
                      <span className={styles.label}>Default duration (min)</span>
                      <input type="number" min="1" value={settings.default_workout_duration_min}
                        onChange={e => setField('default_workout_duration_min', e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <span className={styles.label}>Rest-day workout time</span>
                      <input type="time" value={settings.rest_day_workout_time}
                        onChange={e => setField('rest_day_workout_time', e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <span className={styles.label}>Buffer after work (min)</span>
                      <input type="number" min="0" value={settings.workout_buffer_after_work_min}
                        onChange={e => setField('workout_buffer_after_work_min', e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <span className={styles.label}>Buffer before work (min)</span>
                      <input type="number" min="0" value={settings.workout_buffer_before_work_min}
                        onChange={e => setField('workout_buffer_before_work_min', e.target.value)} />
                    </div>
                  </div>
                  <div className={styles.hint}>
                    Morning-shift days suggest a workout after work; evening and night-shift days suggest one
                    before work, so the suggestion always lands on the same day.
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Meal times</div>
                  <div className={styles.tabs}>
                    {SHIFT_TABS.map(t => (
                      <button key={t.key}
                        className={`${styles.tab} ${activeShift === t.key ? styles.tabActive : ''}`}
                        onClick={() => setActiveShift(t.key)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.mealGrid}>
                    {[1, 2, 3].map(n => (
                      <div key={n} className={styles.mealRow}>
                        <input className={styles.mealLabelInput}
                          value={mealRules[activeShift][`meal${n}_label`]}
                          onChange={e => setMealField(activeShift, `meal${n}_label`, e.target.value)}
                          placeholder={`Meal ${n} label`} />
                        <input type="time"
                          value={mealRules[activeShift][`meal${n}_time`]}
                          onChange={e => setMealField(activeShift, `meal${n}_time`, e.target.value)} />
                      </div>
                    ))}
                  </div>
                </div>

                {error && <div className={styles.errorMsg}>{error}</div>}

                <div className={styles.actions}>
                  <button className="btn-ghost" onClick={close}>Cancel</button>
                  <button className="btn-primary" onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save all'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return { open, close, Modals }
}