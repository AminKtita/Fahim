/**
 * DayPlanModal — full-day timeline popup (training plan + work shift +
 * workout + meals + custom blocks). Opens directly from a calendar cell.
 * Auto-computed blocks come from the backend (work_schedule.py); editing
 * or deleting an auto block materializes an override for that date without
 * touching the underlying shift settings. Blocks are themed by category
 * (work / workout / meal / entertainment / other) with an emoji + color.
 */

import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getDayPlan, saveDayBlock, updateDayBlock, deleteDayBlock, hideAutoBlock } from './api'
import { getPlanDayForDate } from './WorkoutModals'
import styles from './DayPlanModal.module.css'
import dayjs from 'dayjs'

export const CATEGORIES = [
  { key: 'work',          label: 'Work',          icon: '💼', color: '#5b9dff' },
  { key: 'workout',       label: 'Workout',       icon: '🏋', color: '#e3a617' },
  { key: 'meal',          label: 'Meal',          icon: '🍽', color: '#4ae068' },
  { key: 'entertainment', label: 'Entertainment', icon: '🎮', color: '#a878ff' },
  { key: 'other',         label: 'Other',         icon: '📌', color: '#8a93a6' },
]
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]))

const SHIFT_LABEL = {
  morning: 'Morning shift',
  evening: 'Evening shift',
  night: 'Night shift',
  rest: 'Rest day',
}

function blankForm(block_type = 'custom', category = 'other') {
  return { block_type, category, title: '', start_time: '', end_time: '', notes: '' }
}

export function useDayPlanModals({ plan, onSaved } = {}) {
  const [date, setDate] = useState(null)
  const [editing, setEditing] = useState(null) // block object being edited, or null
  const [form, setForm] = useState(blankForm())
  const [error, setError] = useState(null)

  const { data: dayPlan, refetch, loading } = useApi(
    () => (date ? getDayPlan(date) : Promise.resolve(null)),
    [date]
  )

  const open = (iso) => { setDate(iso); setEditing(null); setError(null) }
  const close = () => { setDate(null); setEditing(null); setError(null) }

  const goPrevDay = () => open(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))
  const goNextDay = () => open(dayjs(date).add(1, 'day').format('YYYY-MM-DD'))
  const jumpToDate = (iso) => open(iso)

  const startEdit = (block) => {
    setEditing(block)
    setForm({
      block_type: block.block_type,
      category: block.category ?? 'other',
      title: block.title ?? '',
      start_time: block.start_time ?? '',
      end_time: block.end_time ?? '',
      notes: block.notes ?? '',
    })
    setError(null)
  }

  const startAdd = () => {
    setEditing({ block_type: 'custom', isNew: true })
    setForm(blankForm())
    setError(null)
  }

  const cancelEdit = () => { setEditing(null); setError(null) }

  const saveEdit = async () => {
    if (!form.title?.trim()) { setError('Title is required.'); return }
    if (!form.start_time)    { setError('Start time is required.'); return }
    try {
      const payload = {
        title: form.title, category: form.category,
        start_time: form.start_time,
        end_time: form.end_time || null, notes: form.notes || null,
      }
      if (editing.id) {
        await updateDayBlock(editing.id, payload)
      } else {
        // materializing an override of an auto slot, or adding a new custom block
        await saveDayBlock({ date, block_type: editing.block_type, ...payload })
      }
      setEditing(null)
      await refetch()
      onSaved?.()
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not save block.')
    }
  }

  const removeBlock = async (block) => {
    try {
      if (block.id) {
        await deleteDayBlock(block.id)
      } else {
        // suppress an auto-suggested slot for this date
        await hideAutoBlock(date, block.block_type)
      }
      await refetch()
      onSaved?.()
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not delete block.')
    }
  }

  function Modals() {
    if (!date) return null
    const planDay = getPlanDayForDate(plan, date)

    return (
      <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) close() }}>
        <div className={styles.modal}>
          <div className={styles.mHead}>
            <button className={styles.navBtn} onClick={goPrevDay} title="Previous day">←</button>
            <div className={styles.mTitle}>
              <span className={styles.mLabel}>Day plan</span>
              <div className={styles.dateRow}>
                <span className={styles.mDate}>{dayjs(date).format('dddd, MMMM D YYYY')}</span>
                <input type="date" className={styles.dateJump} value={date}
                  onChange={e => jumpToDate(e.target.value)} />
              </div>
            </div>
            <button className={styles.navBtn} onClick={goNextDay} title="Next day">→</button>
            <button className={styles.mClose} onClick={close}>✕</button>
          </div>

          <div className={styles.mBody}>
            {loading && <div className={styles.statusMsg}>Loading…</div>}

            {dayPlan && (
              <>
                <div className={styles.shiftTag}>{SHIFT_LABEL[dayPlan.shift_type] ?? dayPlan.shift_type}</div>

                {/* Training plan section — what the split says for this day */}
                <div className={styles.planSection}>
                  <div className={styles.planSectionLabel}>Training plan</div>
                  {planDay ? (
                    <div className={styles.planCard}>
                      <div className={styles.planCardType}>
                        {planDay.session_type ?? planDay.day_name ?? 'Training'}
                      </div>
                      {planDay.exercises?.length > 0 && (
                        <div className={styles.planExList}>
                          {planDay.exercises
                            .slice()
                            .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                            .map((ex, i) => (
                              <div key={i} className={styles.planExRow}>
                                <span>{ex.exercise}</span>
                                <span className={styles.planExDetail}>
                                  {ex.sets ?? '?'} × {ex.reps ?? '?'}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={styles.planEmptyCard}>
                      {plan ? 'Rest day — no session planned' : 'No active plan'}
                    </div>
                  )}
                </div>

                {!editing && (
                  <div className={styles.timeline}>
                    <div className={styles.planSectionLabel}>24-hour plan</div>
                    {dayPlan.blocks.map((b, i) => {
                      const cat = CATEGORY_BY_KEY[b.category] ?? CATEGORY_BY_KEY.other
                      return (
                        <div key={`${b.block_type}-${i}`} className={styles.blockRow}
                          style={{ borderLeftColor: cat.color }}>
                          <span className={styles.blockIcon} style={{ background: `${cat.color}26` }}>
                            {cat.icon}
                          </span>
                          <div className={styles.blockInfo}>
                            <span className={styles.blockTitle}>{b.title}</span>
                            <span className={styles.blockTime}>
                              {b.start_time}
                              {b.end_time ? ` – ${b.end_time}` : ''}
                              {b.end_time && b.end_time < b.start_time ? ' (+1 day)' : ''}
                            </span>
                            {b.notes && <span className={styles.blockNotes}>{b.notes}</span>}
                          </div>
                          <div className={styles.blockActions}>
                            <button className={styles.blockBtn} onClick={() => startEdit(b)}>Edit</button>
                            <button className={styles.blockBtn} onClick={() => removeBlock(b)}>Remove</button>
                          </div>
                        </div>
                      )
                    })}

                    <button className={styles.addBtn} onClick={startAdd}>+ Add block</button>
                  </div>
                )}

                {editing && (
                  <div className={styles.editForm}>
                    <div className={styles.field}>
                      <span className={styles.label}>Category</span>
                      <div className={styles.categoryPills}>
                        {CATEGORIES.map(c => (
                          <button key={c.key} type="button"
                            className={`${styles.categoryPill} ${form.category === c.key ? styles.categoryPillActive : ''}`}
                            style={form.category === c.key ? { borderColor: c.color, color: c.color, background: `${c.color}1a` } : {}}
                            onClick={() => setForm(f => ({ ...f, category: c.key }))}>
                            {c.icon} {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.field}>
                      <span className={styles.label}>Title</span>
                      <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        placeholder="e.g. Gym session" />
                    </div>
                    <div className={styles.grid2}>
                      <div className={styles.field}>
                        <span className={styles.label}>Start time</span>
                        <input type="time" value={form.start_time}
                          onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                      </div>
                      <div className={styles.field}>
                        <span className={styles.label}>End time (optional)</span>
                        <input type="time" value={form.end_time}
                          onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                      </div>
                    </div>
                    <div className={styles.field}>
                      <span className={styles.label}>Notes (optional)</span>
                      <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>

                    {error && <div className={styles.errorMsg}>{error}</div>}

                    <div className={styles.actions}>
                      <button className="btn-ghost" onClick={cancelEdit}>Cancel</button>
                      <button className="btn-primary" onClick={saveEdit}>Save</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return { open, close, Modals }
}