import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getGoals, updateGoal, deleteGoal, abandonGoal } from '../lib/api'
import Panel from '../components/ui/Panel'
import SectionDivider from '../components/ui/SectionDivider'
import GoalForm from '../components/forms/GoalForm'
import dayjs from 'dayjs'
import styles from './Goals.module.css'

const METRIC_OPTIONS = [
  { label: 'kg',           value: 'kg'           },
  { label: 'g/day',        value: 'g/day'        },
  { label: 'lbs',          value: 'lbs'          },
  { label: '%',            value: '%'            },
  { label: 'cm',           value: 'cm'           },
  { label: 'sessions/week',value: 'sessions/week'},
  { label: 'sessions/month',value:'sessions/month'},
  { label: 'reps',         value: 'reps'         },
  { label: 'km',           value: 'km'           },
  { label: 'min',          value: 'min'          },
  { label: 'kcal/day',     value: 'kcal/day'     },
  { label: 'days',         value: 'days'         },
  { label: 'custom…',      value: '__custom__'   },
]

// Parse YYYY-MM-DD → { d, m, y }
function parseDeadline(iso) {
  if (!iso) return { d: '', m: '', y: '' }
  const parts = iso.split('-')
  return { y: parts[0] ?? '', m: parts[1] ? String(Number(parts[1])) : '', d: parts[2] ? String(Number(parts[2])) : '' }
}

// Build YYYY-MM-DD from { d, m, y }
function buildDeadline(d, m, y) {
  if (!d || !m || !y) return null
  const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  return dayjs(iso).isValid() ? iso : null
}

export default function Goals() {
  const { data: activeGoals,    refetch: refetchActive }    = useApi(() => getGoals('active'))
  const { data: completedGoals, refetch: refetchCompleted } = useApi(() => getGoals('completed'))
  const { data: abandonedGoals, refetch: refetchAbandoned } = useApi(() => getGoals('abandoned'))

  const [showForm,    setShowForm]    = useState(false)
  const [editingId,   setEditingId]   = useState(null)
  const [editForm,    setEditForm]    = useState({})
  const [progressId,  setProgressId]  = useState(null)
  const [progressVal, setProgressVal] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const refetchAll = () => { refetchActive(); refetchCompleted(); refetchAbandoned() }

  // ── actions ──────────────────────────────────────────────
  const handleUpdateProgress = async (id) => {
    if (!progressVal) return
    setSaving(true)
    try { await updateGoal(id, { current_value: Number(progressVal) }) }
    finally { setSaving(false); setProgressId(null); setProgressVal(''); refetchAll() }
  }

  const handleComplete = async (id) => {
    setSaving(true)
    try { await updateGoal(id, { status: 'completed' }) }
    finally { setSaving(false); refetchAll() }
  }

  const handleReactivate = async (id) => {
    setSaving(true)
    try { await updateGoal(id, { status: 'active' }) }
    finally { setSaving(false); refetchAll() }
  }

  const handleAbandon = async (id) => {
    setSaving(true)
    try { await abandonGoal(id) }
    finally { setSaving(false); refetchAll() }
  }

  const handleDelete = async (id) => {
    setSaving(true)
    try { await deleteGoal(id) }
    finally { setSaving(false); setConfirmDelete(null); refetchAll() }
  }

  const startEdit = (g) => {
    const dl = parseDeadline(g.deadline)
    const isCustom = !METRIC_OPTIONS.find(o => o.value === g.metric && o.value !== '__custom__')
    setEditingId(g.id)
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

  // ── helpers ──────────────────────────────────────────────
  const pct = (g) => (g.target_value && g.current_value != null)
    ? Math.min(Math.round((g.current_value / g.target_value) * 100), 100) : 0
  const barColor = (p) => p >= 80 ? styles.barAccent : p >= 50 ? styles.barBlue : styles.barWarn
  const pctColor = (p) => p >= 80 ? styles.pctAccent : p >= 50 ? styles.pctBlue  : styles.pctWarn
  const daysLeft = (dl) => dl ? dayjs(dl).diff(dayjs(), 'day') : null

  const GoalCard = ({ g, isCompleted = false }) => {
    const p   = pct(g)
    const dl  = daysLeft(g.deadline)
    const isEditing          = editingId === g.id
    const isProgress         = progressId === g.id
    const isConfirmingDelete = confirmDelete === g.id

    return (
      <div className={`${styles.goalCard} ${isCompleted ? styles.goalCardCompleted : ''}`}>

        {isEditing ? (
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
              <button onClick={() => handleSaveEdit(g.id)} disabled={saving}>
                {saving ? 'SAVING…' : 'SAVE_CHANGES →'}
              </button>
              <button className="btn-ghost" onClick={() => setEditingId(null)}>CANCEL</button>
            </div>
          </div>

        ) : (
          <>
            <div className={styles.cardTop}>
              <span className={styles.goalTitle}>{g.title}</span>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {isCompleted && <span className={styles.completedBadge}>COMPLETED</span>}
                <span className={`${styles.goalPct} ${pctColor(p)}`}>{p}%</span>
              </div>
            </div>

            <div className={styles.barTrack}>
              <div className={`${styles.barFill} ${barColor(p)}`} style={{ width:`${p}%` }} />
            </div>

            <div className={styles.cardDetail}>
              <span className={styles.detailVal}>{g.current_value ?? '—'} / {g.target_value} {g.metric}</span>
              {g.deadline && (
                <span className={`${styles.deadline} ${dl != null && dl < 14 && !isCompleted ? styles.deadlineWarn : ''}`}>
                  {dl == null ? g.deadline : dl < 0 ? 'overdue' : dl === 0 ? 'due today' : `${dl}d left`}
                </span>
              )}
            </div>

            {isProgress && (
              <div className={styles.progressRow}>
                <input type="number" placeholder={`current ${g.metric}`} value={progressVal}
                  onChange={e => setProgressVal(e.target.value)} autoFocus style={{ maxWidth:140 }} />
                <button onClick={() => handleUpdateProgress(g.id)} disabled={saving}>{saving ? '…' : 'SET →'}</button>
                <button className="btn-ghost" onClick={() => { setProgressId(null); setProgressVal('') }}>✕</button>
              </div>
            )}

            {isConfirmingDelete && (
              <div className={styles.confirmRow}>
                <span className={styles.confirmText}>Delete permanently?</span>
                <button className="btn-danger" onClick={() => handleDelete(g.id)} disabled={saving}>{saving ? '…' : 'DELETE'}</button>
                <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>CANCEL</button>
              </div>
            )}

            {!isProgress && !isConfirmingDelete && (
              <div className={styles.cardActions}>
                <button className="btn-ghost"
                  onClick={() => { setProgressId(g.id); setProgressVal(g.current_value ?? '') }}>
                  UPDATE
                </button>
                <button className="btn-ghost" onClick={() => startEdit(g)}>EDIT</button>
                {!isCompleted && (
                  <>
                    <button className="btn-ghost" onClick={() => handleComplete(g.id)} disabled={saving}>COMPLETE ✓</button>
                    <button className="btn-ghost" onClick={() => handleAbandon(g.id)} disabled={saving}>ABANDON</button>
                  </>
                )}
                {isCompleted && (
                  <button className="btn-ghost" onClick={() => handleReactivate(g.id)} disabled={saving}>REACTIVATE</button>
                )}
                <button className="btn-ghost" style={{ color:'var(--danger)', borderColor:'transparent' }}
                  onClick={() => setConfirmDelete(g.id)}>DELETE</button>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>GOALS.db</div>
          <div className={styles.pageTitle}>Goals tracker</div>
          <div className={styles.pageSub}>Goals can be created by you here or automatically by Fahim during chat.</div>
        </div>
        <button onClick={() => setShowForm(v => !v)}>
          {showForm ? 'CANCEL ✕' : '+ NEW_GOAL'}
        </button>
      </div>

      {showForm && (
        <>
          <SectionDivider label="CREATE_GOAL.input" />
          <div className={styles.formWrap}>
            <Panel label="GOAL_CREATOR">
              <GoalForm onSaved={() => { refetchAll(); setShowForm(false) }} />
            </Panel>
          </div>
        </>
      )}

      <SectionDivider label="GOALS.active" />
      <div className={styles.goalsGrid}>
        {!activeGoals?.length ? (
          <div className={styles.emptyCard}>
            <span className={styles.emptyMono}>NO_ACTIVE_GOALS</span>
            <span className={styles.emptySub}>add one above, or ask Fahim in chat</span>
          </div>
        ) : activeGoals.map(g => <GoalCard key={g.id} g={g} />)}
      </div>

      {completedGoals?.length > 0 && (
        <>
          <SectionDivider label="GOALS.completed" />
          <div className={styles.goalsGrid}>
            {completedGoals.map(g => <GoalCard key={g.id} g={g} isCompleted />)}
          </div>
        </>
      )}

      {abandonedGoals?.length > 0 && (
        <>
          <SectionDivider label="GOALS.abandoned" />
          <Panel label="ABANDONED_GOALS.archive">
            <div>
              {abandonedGoals.map(g => (
                <div key={g.id} className={styles.archiveRow}>
                  <div className={styles.archiveLeft}>
                    <span className={`${styles.archiveBadge} ${styles.badgeWarn}`}>✗</span>
                    <span className={styles.archiveTitle}>{g.title}</span>
                    <span className={styles.archiveMeta}>{g.target_value} {g.metric}</span>
                  </div>
                  <div className={styles.archiveRight}>
                    {g.deadline && <span className={styles.archiveDate}>{g.deadline}</span>}
                    {confirmDelete === g.id ? (
                      <>
                        <button className="btn-danger" style={{ padding:'3px 10px', fontSize:10 }}
                          onClick={() => handleDelete(g.id)} disabled={saving}>DELETE</button>
                        <button className="btn-ghost" style={{ padding:'3px 10px', fontSize:10 }}
                          onClick={() => setConfirmDelete(null)}>CANCEL</button>
                      </>
                    ) : (
                      <button className="btn-ghost" style={{ padding:'3px 10px', fontSize:10, color:'var(--danger)', borderColor:'transparent' }}
                        onClick={() => setConfirmDelete(g.id)}>DELETE</button>
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