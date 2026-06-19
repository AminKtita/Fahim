import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getGoals, updateGoal, deleteGoal, abandonGoal } from '../lib/api'
import Panel from '../components/ui/Panel'
import SectionDivider from '../components/ui/SectionDivider'
import GoalForm from '../components/forms/Goalform'
import dayjs from 'dayjs'
import styles from './Goals.module.css'

const METRIC_OPTIONS = [
  { label: 'kg',            value: 'kg'            },
  { label: 'g/day',         value: 'g/day'         },
  { label: 'lbs',           value: 'lbs'           },
  { label: '%',             value: '%'             },
  { label: 'cm',            value: 'cm'            },
  { label: 'sessions/week', value: 'sessions/week' },
  { label: 'sessions/month',value: 'sessions/month'},
  { label: 'reps',          value: 'reps'          },
  { label: 'km',            value: 'km'            },
  { label: 'min',           value: 'min'           },
  { label: 'kcal/day',      value: 'kcal/day'      },
  { label: 'days',          value: 'days'          },
  { label: 'custom…',       value: '__custom__'    },
]

function parseDeadline(iso) {
  if (!iso) return { d: '', m: '', y: '' }
  const parts = iso.split('-')
  return { y: parts[0] ?? '', m: parts[1] ? String(Number(parts[1])) : '', d: parts[2] ? String(Number(parts[2])) : '' }
}

function buildDeadline(d, m, y) {
  if (!d || !m || !y) return null
  const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  return dayjs(iso).isValid() ? iso : null
}

export default function Goals() {
  const { data: activeGoals,    refetch: refetchActive }    = useApi(() => getGoals('active'))
  const { data: completedGoals, refetch: refetchCompleted } = useApi(() => getGoals('completed'))
  const { data: abandonedGoals, refetch: refetchAbandoned } = useApi(() => getGoals('abandoned'))

  const [showForm,      setShowForm]      = useState(false)
  const [editingId,     setEditingId]     = useState(null)
  const [editForm,      setEditForm]      = useState({})
  const [progressId,    setProgressId]    = useState(null)
  const [progressVal,   setProgressVal]   = useState('')
  const [saving,        setSaving]        = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [overflow,      setOverflow]      = useState(null) // id with open overflow menu

  const refetchAll = () => { refetchActive(); refetchCompleted(); refetchAbandoned() }

  const handleUpdateProgress = async (id) => {
    if (!progressVal) return
    setSaving(true)
    try { await updateGoal(id, { current_value: Number(progressVal) }) }
    finally { setSaving(false); setProgressId(null); setProgressVal(''); refetchAll() }
  }

  const handleComplete  = async (id) => { setSaving(true); try { await updateGoal(id, { status: 'completed' }) } finally { setSaving(false); refetchAll() } }
  const handleReactivate= async (id) => { setSaving(true); try { await updateGoal(id, { status: 'active' }) } finally { setSaving(false); refetchAll() } }
  const handleAbandon   = async (id) => { setSaving(true); try { await abandonGoal(id) } finally { setSaving(false); refetchAll(); setOverflow(null) } }
  const handleDelete    = async (id) => { setSaving(true); try { await deleteGoal(id) } finally { setSaving(false); setConfirmDelete(null); refetchAll() } }

  const startEdit = (g) => {
    const dl = parseDeadline(g.deadline)
    const isCustom = !METRIC_OPTIONS.find(o => o.value === g.metric && o.value !== '__custom__')
    setEditingId(g.id)
    setOverflow(null)
    setEditForm({
      title:         g.title,
      metric:        isCustom ? '__custom__' : g.metric,
      metricCustom:  isCustom ? g.metric : '',
      target_value:  g.target_value,
      current_value: g.current_value ?? '',
      deadline_d:    dl.d,
      deadline_m:    dl.m,
      deadline_y:    dl.y,
    })
  }

  const handleSaveEdit = async (id) => {
    setSaving(true)
    const metric = editForm.metric === '__custom__' ? editForm.metricCustom : editForm.metric
    try {
      await updateGoal(id, {
        title:         editForm.title,
        metric,
        target_value:  Number(editForm.target_value),
        current_value: editForm.current_value !== '' ? Number(editForm.current_value) : null,
        deadline:      buildDeadline(editForm.deadline_d, editForm.deadline_m, editForm.deadline_y),
      })
    } finally { setSaving(false); setEditingId(null); refetchAll() }
  }

  const setEF = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  const pct      = (g) => (g.target_value && g.current_value != null)
    ? Math.min(Math.round((g.current_value / g.target_value) * 100), 100) : 0
  const barColor = (p) => p >= 80 ? styles.barAccent : p >= 50 ? styles.barBlue : styles.barWarn
  const pctColor = (p) => p >= 80 ? styles.pctAccent : p >= 50 ? styles.pctBlue  : styles.pctWarn
  const daysLeft = (dl) => dl ? dayjs(dl).diff(dayjs(), 'day') : null

  const GoalCard = ({ g, isCompleted = false }) => {
    const p   = pct(g)
    const dl  = daysLeft(g.deadline)
    const remaining = g.target_value != null && g.current_value != null ? (g.target_value - g.current_value) : null
    const isEditing          = editingId === g.id
    const isProgress         = progressId === g.id
    const isConfirmingDelete = confirmDelete === g.id
    const isOverflowOpen     = overflow === g.id

    return (
      <div className={`${styles.goalCard} ${isCompleted ? styles.goalCardCompleted : ''}`}>

        {isEditing ? (
          /* ── EDIT FORM ── */
          <div className={styles.editForm}>
            <div className={styles.editRow}>
              <label className={styles.editLabel}>Title</label>
              <input value={editForm.title} onChange={e => setEF('title', e.target.value)} />
            </div>
            <div className={styles.editGrid}>
              <div className={styles.editRow}>
                <label className={styles.editLabel}>Metric / unit</label>
                <select value={editForm.metric} onChange={e => setEF('metric', e.target.value)}>
                  {METRIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {editForm.metric === '__custom__' && (
                  <input style={{ marginTop:5 }} placeholder="custom unit"
                    value={editForm.metricCustom} onChange={e => setEF('metricCustom', e.target.value)} />
                )}
              </div>
              <div className={styles.editRow}>
                <label className={styles.editLabel}>Target</label>
                <input type="number" value={editForm.target_value} onChange={e => setEF('target_value', e.target.value)} />
              </div>
              <div className={styles.editRow}>
                <label className={styles.editLabel}>Current</label>
                <input type="number" value={editForm.current_value} onChange={e => setEF('current_value', e.target.value)} />
              </div>
              <div className={styles.editRow}>
                <label className={styles.editLabel}>Deadline (dd / mm / yyyy)</label>
                <div style={{ display:'flex', gap:5 }}>
                  <input type="number" placeholder="DD"   min="1"    max="31"   value={editForm.deadline_d} onChange={e => setEF('deadline_d', e.target.value)} style={{ width:46 }} />
                  <input type="number" placeholder="MM"   min="1"    max="12"   value={editForm.deadline_m} onChange={e => setEF('deadline_m', e.target.value)} style={{ width:46 }} />
                  <input type="number" placeholder="YYYY" min="2024" max="2040" value={editForm.deadline_y} onChange={e => setEF('deadline_y', e.target.value)} />
                </div>
              </div>
            </div>
            <div className={styles.cardActions}>
              <button className="btn-accent" onClick={() => handleSaveEdit(g.id)} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button className="btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          </div>

        ) : (
          <>
            {/* ── CARD HEADER ── */}
            <div className={styles.cardHeader}>
              <span className={styles.goalTitle}>{g.title}</span>
              <div className={styles.cardHeaderRight}>
                {isCompleted && <span className={styles.completedBadge}>✓ Completed</span>}
                {!isCompleted && !isEditing && (
                  <div className={styles.overflowWrap}>
                    <button
                      className={styles.overflowBtn}
                      onClick={() => setOverflow(isOverflowOpen ? null : g.id)}
                      title="More options"
                    >···</button>
                    {isOverflowOpen && (
                      <div className={styles.overflowMenu}>
                        <button className={styles.overflowItem} onClick={() => startEdit(g)}>Edit</button>
                        <button className={styles.overflowItem} onClick={() => { handleComplete(g.id); setOverflow(null) }}>Mark complete ✓</button>
                        <button className={styles.overflowItem} onClick={() => { handleAbandon(g.id) }}>Abandon</button>
                        <div className={styles.overflowDivider} />
                        <button className={`${styles.overflowItem} ${styles.overflowDanger}`}
                          onClick={() => { setConfirmDelete(g.id); setOverflow(null) }}>Delete</button>
                      </div>
                    )}
                  </div>
                )}
                {isCompleted && (
                  <div className={styles.overflowWrap}>
                    <button className={styles.overflowBtn} onClick={() => setOverflow(isOverflowOpen ? null : g.id)}>···</button>
                    {isOverflowOpen && (
                      <div className={styles.overflowMenu}>
                        <button className={styles.overflowItem} onClick={() => { handleReactivate(g.id); setOverflow(null) }}>Reactivate</button>
                        <div className={styles.overflowDivider} />
                        <button className={`${styles.overflowItem} ${styles.overflowDanger}`}
                          onClick={() => { setConfirmDelete(g.id); setOverflow(null) }}>Delete</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── HERO METRIC ── */}
            <div className={styles.heroMetric}>
              <span className={styles.heroCurrentVal}>{g.current_value ?? '—'}</span>
              <span className={styles.heroSep}> → </span>
              <span className={styles.heroTargetVal}>{g.target_value}</span>
              <span className={styles.heroUnit}>{g.metric}</span>
            </div>

            {/* ── PROGRESS BAR ── */}
            <div className={styles.barWrap}>
              <div className={styles.barTrack}>
                <div className={`${styles.barFill} ${barColor(p)}`} style={{ width:`${p}%` }} />
              </div>
              <span className={`${styles.barPct} ${pctColor(p)}`}>{p}%</span>
            </div>

            {/* ── META ROW ── */}
            <div className={styles.metaRow}>
              {remaining != null && remaining > 0 && !isCompleted && (
                <span className={styles.metaRemaining}>{remaining} {g.metric} to go</span>
              )}
              {g.deadline && (
                <span className={`${styles.metaDeadline} ${dl != null && dl < 14 && !isCompleted ? styles.deadlineWarn : ''}`}>
                  {dl == null ? g.deadline
                    : dl < 0   ? '⚠ Overdue'
                    : dl === 0 ? 'Due today'
                    : `${dl} days left`}
                </span>
              )}
            </div>

            {/* ── UPDATE PROGRESS INLINE ── */}
            {isProgress ? (
              <div className={styles.progressRow}>
                <input type="number" placeholder={`Current ${g.metric}`} value={progressVal}
                  onChange={e => setProgressVal(e.target.value)} autoFocus style={{ maxWidth:160 }} />
                <button className="btn-accent" style={{padding:'6px 14px', fontSize:11}} onClick={() => handleUpdateProgress(g.id)} disabled={saving}>
                  {saving ? '…' : 'Update'}
                </button>
                <button className="btn-ghost" style={{padding:'6px 10px', fontSize:11}} onClick={() => { setProgressId(null); setProgressVal('') }}>✕</button>
              </div>
            ) : !isConfirmingDelete && !isCompleted && (
              <button
                className={`btn-primary ${styles.updateBtn}`}
                onClick={() => { setProgressId(g.id); setProgressVal(g.current_value ?? '') }}
              >
                Update progress
              </button>
            )}

            {/* ── DELETE CONFIRMATION ── */}
            {isConfirmingDelete && (
              <div className={styles.confirmRow}>
                <span className={styles.confirmText}>Delete permanently? This cannot be undone.</span>
                <div className={styles.confirmBtns}>
                  <button className="btn-danger" style={{padding:'5px 12px', fontSize:11}} onClick={() => handleDelete(g.id)} disabled={saving}>
                    {saving ? '…' : 'Delete'}
                  </button>
                  <button className="btn-ghost" style={{padding:'5px 12px', fontSize:11}} onClick={() => setConfirmDelete(null)}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* PAGE HEADER */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Goals</div>
          <div className={styles.pageSub}>Track targets set by you or suggested by Fahim during chat.</div>
        </div>
        <button className={showForm ? 'btn-ghost' : 'btn-primary'} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ New goal'}
        </button>
      </div>

      {/* NEW GOAL FORM */}
      {showForm && (
        <>
          <SectionDivider label="Create a goal" />
          <div className={styles.formWrap}>
            <Panel label="New goal">
              <GoalForm onSaved={() => { refetchAll(); setShowForm(false) }} />
            </Panel>
          </div>
        </>
      )}

      {/* ACTIVE GOALS */}
      <SectionDivider label="Active goals" />
      <div className={styles.goalsGrid}>
        {!activeGoals?.length ? (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon}>🎯</div>
            <div className={styles.emptyTitle}>No active goals yet</div>
            <div className={styles.emptySub}>Add a goal above, or ask Fahim in chat to set one based on your training.</div>
          </div>
        ) : activeGoals.map(g => <GoalCard key={g.id} g={g} />)}
      </div>

      {/* COMPLETED GOALS */}
      {completedGoals?.length > 0 && (
        <>
          <SectionDivider label="Completed goals" />
          <div className={styles.goalsGrid}>
            {completedGoals.map(g => <GoalCard key={g.id} g={g} isCompleted />)}
          </div>
        </>
      )}

      {/* ABANDONED GOALS */}
      {abandonedGoals?.length > 0 && (
        <>
          <SectionDivider label="Abandoned goals" />
          <Panel label="Abandoned goals">
            <div>
              {abandonedGoals.map(g => (
                <div key={g.id} className={styles.archiveRow}>
                  <div className={styles.archiveLeft}>
                    <span className={styles.archiveTitle}>{g.title}</span>
                    <span className={styles.archiveMeta}>{g.current_value ?? '—'} / {g.target_value} {g.metric}</span>
                  </div>
                  <div className={styles.archiveRight}>
                    {g.deadline && <span className={styles.archiveDate}>{dayjs(g.deadline).format('MMM D, YYYY')}</span>}
                    {confirmDelete === g.id ? (
                      <>
                        <button className="btn-danger" style={{ padding:'3px 10px', fontSize:10 }}
                          onClick={() => handleDelete(g.id)} disabled={saving}>Delete</button>
                        <button className="btn-ghost" style={{ padding:'3px 10px', fontSize:10 }}
                          onClick={() => setConfirmDelete(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn-ghost" style={{ padding:'3px 10px', fontSize:10, color:'var(--danger)' }}
                        onClick={() => setConfirmDelete(g.id)}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
