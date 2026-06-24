import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getWorkouts, getPlan } from '../lib/api'
import { useStatus } from '../lib/StatusContext'
import { useWorkoutModals, getPlanDayForDate } from '../lib/WorkoutModals'
import { exerciseKey, groupSetsByExercise } from '../lib/exerciseGrouping'
import ExerciseLibraryTab from '../lib/ExerciseLibraryTab'
import Panel from '../components/ui/Panel'
import SectionDivider from '../components/ui/SectionDivider'
import Badge from '../components/ui/Badge'
import VolumeChart from '../components/charts/VolumeChart'
import dayjs from 'dayjs'
import styles from './Workouts.module.css'

export default function Workouts() {
  const { refresh: refreshStatus } = useStatus()
  const { data: workouts, refetch } = useApi(() => getWorkouts(60))
  const { data: plan }              = useApi(getPlan)
  const [selWorkout, setSelWorkout] = useState(null)
  const [selDate,    setSelDate]    = useState(null)
  const [selectedExercise, setSelectedExercise] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTab,  setActiveTab]  = useState('log') // 'log' | 'library'

  const today = dayjs().format('YYYY-MM-DD')
  const todayWorkout = workouts?.find(w => w.date === today)
  const todayPlan    = getPlanDayForDate(plan, today)

  const onSaved = () => { refetch(); refreshStatus() }

  const historyModals = useWorkoutModals({ plan, selDate, selWorkout, onSaved })
  const todayModals   = useWorkoutModals({ plan, selDate: today, selWorkout: todayWorkout, onSaved })

  const allSets = workouts?.flatMap(w => w.sets ?? []) ?? []
  const exerciseGroups = groupSetsByExercise(allSets)
  const exercises = exerciseGroups.map(g => ({ key: g.key, name: g.name })).sort((a,b)=>a.name.localeCompare(b.name))

  const effortColor = e => !e ? 'neutral' : e >= 8 ? 'warning' : e >= 6 ? 'info' : 'positive'
  const isRestOrMissed = w => w?.session_type === 'rest' || w?.session_type === 'missed'

  const openExercise = (key) => {
    setSelectedExercise(key)
    setDrawerOpen(true)
  }

  const sessionList = workouts?.filter(w => !isRestOrMissed(w)) ?? []

  return (
    <div className={styles.root}>

      {/* ── EXERCISE HISTORY DRAWER ── */}
      {drawerOpen && (
        <div className={styles.drawerOverlay} onClick={() => setDrawerOpen(false)}>
          <div className={styles.drawer} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <span className={styles.drawerTitle}>
                {selectedExercise
                  ? (exercises.find(e => e.key === selectedExercise)?.name ?? '')
                  : 'Exercise history'}
              </span>
              <button className={styles.drawerClose} onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            {/* Exercise picker */}
            <div className={styles.drawerPicker}>
              {exercises.map(ex => (
                <button
                  key={ex.key}
                  className={`${styles.exChip} ${selectedExercise === ex.key ? styles.exChipActive : ''}`}
                  onClick={() => setSelectedExercise(ex.key)}
                >
                  {ex.name}
                </button>
              ))}
            </div>

            {/* History entries */}
            {selectedExercise && (
              <div className={styles.drawerHistory}>
                {workouts
                  ?.filter(w => w.sets?.some(s => exerciseKey(s) === selectedExercise))
                  .map(w => {
                    const sets = w.sets.filter(s => exerciseKey(s) === selectedExercise && !s.is_warmup)
                    if (!sets.length) return null
                    const top = sets.reduce((b, s) => (s.weight_kg ?? 0) > (b.weight_kg ?? 0) ? s : b, sets[0])
                    return (
                      <div key={w.id} className={styles.histRow}>
                        <span className={styles.histDate}>{dayjs(w.date).format('MMM D')}</span>
                        <div className={styles.histSets}>
                          {sets.map((s, i) => (
                            <span key={i} className={styles.histSet}>
                              {s.reps ?? '?'} × {s.weight_kg ? `${s.weight_kg}kg` : 'BW'}
                              {s.rpe ? ` @${s.rpe}` : ''}
                            </span>
                          ))}
                        </div>
                        <span className={styles.histTop}>
                          Best: {sets.length}×{top.reps ?? '?'}{top.weight_kg ? ` @ ${top.weight_kg}kg` : ' BW'}
                        </span>
                      </div>
                    )
                  })
                  .filter(Boolean)
                }
              </div>
            )}
          </div>
        </div>
      )}

      {/* PAGE HEADER */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Workouts</div>
          <div className={styles.pageSub}>
            {activeTab === 'log' ? 'Session log and exercise history.' : 'Your exercise library — view, add, edit, or remove exercises.'}
          </div>
        </div>
        {activeTab === 'log' && exercises.length > 0 && (
          <button className="btn-ghost" onClick={() => { setSelectedExercise(exercises[0].key); setDrawerOpen(true) }}>
            Exercise history →
          </button>
        )}
      </div>

      {/* TAB SWITCHER */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'log' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('log')}
        >
          Session log
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'library' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('library')}
        >
          Exercise library
        </button>
      </div>

      {activeTab === 'library' && <ExerciseLibraryTab />}

      {activeTab === 'log' && (
      <>
      {/* TODAY PANEL */}
      <SectionDivider label="Today's session" />
      <div className={styles.todayWrap}>
        <Panel label={`Today · ${dayjs().format('dddd, MMMM D')}`}>
          {todayWorkout ? (
            isRestOrMissed(todayWorkout) ? (
              <div className={styles.todayLogged}>
                <div className={styles.todayStatus} style={{ color: todayWorkout.session_type === 'missed' ? 'var(--danger)' : 'var(--muted)' }}>
                  {todayWorkout.session_type === 'missed' ? '✗ Session missed' : '— Rest day'}
                </div>
                <button className="btn-ghost" style={{ padding:'5px 14px', fontSize:11, marginTop:8 }}
                  onClick={() => { setSelDate(today); setSelWorkout(todayWorkout); setTimeout(todayModals.openEdit, 0) }}>
                  Edit
                </button>
              </div>
            ) : (
              <div className={styles.todayLogged}>
                <div className={styles.todayMeta}>
                  <Badge type="positive">{(todayWorkout.session_type ?? 'Session').toUpperCase()}</Badge>
                  {todayWorkout.duration_min && <span className={styles.todayMetaItem}>{todayWorkout.duration_min} min</span>}
                  {todayWorkout.perceived_effort && <Badge type={effortColor(todayWorkout.perceived_effort)}>RPE {todayWorkout.perceived_effort}</Badge>}
                </div>
                {todayWorkout.sets?.filter(s => !s.is_warmup).length > 0 && (
                  <div className={styles.todaySets}>
                    {groupSetsByExercise(todayWorkout.sets.filter(s => !s.is_warmup)).map(({ key, name, sets }) => {
                      const top = sets.reduce((b, s) => (s.weight_kg ?? 0) > (b.weight_kg ?? 0) ? s : b, sets[0])
                      return (
                        <div key={key} className={styles.todaySetRow}>
                          <span
                            className={styles.todaySetEx}
                            onClick={() => openExercise(key)}
                            title="View exercise history"
                          >{name}</span>
                          <span className={styles.todaySetVal}>
                            {sets.length} × {top.reps ?? '?'}{top.weight_kg ? ` @ ${top.weight_kg}kg` : ' BW'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className={styles.todayBtns}>
                  <button className="btn-ghost" style={{ padding:'5px 14px', fontSize:11 }}
                    onClick={() => { setSelDate(today); setSelWorkout(todayWorkout); setTimeout(todayModals.openEdit, 0) }}>
                    Edit
                  </button>
                  <button className="btn-ghost" style={{ padding:'5px 14px', fontSize:11 }}
                    onClick={() => { setSelDate(today); setSelWorkout(todayWorkout); setTimeout(todayModals.openDetail, 0) }}>
                    Full details →
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className={styles.todayEmpty}>
              <div className={styles.todayEmptyLeft}>
                {todayPlan ? (
                  <>
                    <span className={styles.planBadge}>{(todayPlan.session_type ?? 'Training').toUpperCase()} DAY</span>
                    {todayPlan.exercises?.length > 0 && (
                      <span className={styles.planExercises}>
                        {todayPlan.exercises.slice(0, 3).map(e => e.exercise_name ?? e.exercise).join(' · ')}
                        {todayPlan.exercises.length > 3 ? ` +${todayPlan.exercises.length - 3} more` : ''}
                      </span>
                    )}
                  </>
                ) : (
                  <span className={styles.todayEmptyHint}>No session logged yet today</span>
                )}
              </div>
              <button className="btn-primary" onClick={() => { setSelDate(today); todayModals.openLog() }}>
                Log today's session
              </button>
            </div>
          )}
        </Panel>
      </div>

      {/* VOLUME CHART */}
      <SectionDivider label="Training volume" />
      <div className={styles.chartWrap}>
        <Panel label="Sets per day · 60 days" noPad>
          <div style={{padding:'12px 16px 8px'}}>
            <VolumeChart workouts={workouts ?? []} />
          </div>
        </Panel>
      </div>

      {/* SESSION LIST */}
      <SectionDivider label="Session history" />
      <div className={styles.sessionListWrap}>
        <Panel label={`${sessionList.length} session${sessionList.length !== 1 ? 's' : ''} · last 60 days`}>
          {!workouts?.length
            ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>🏋</span>
                <span className={styles.emptyText}>No sessions logged yet</span>
                <span className={styles.emptySub}>Log your first workout above to start tracking progress.</span>
              </div>
            )
            : workouts.map(w => (
              <div key={w.id} className={styles.sessionRow}>
                <div className={styles.sessionTop}>
                  <div className={styles.sessionLeft}>
                    <span className={styles.sessionDate}>{dayjs(w.date).format('MMM D')}</span>
                    {isRestOrMissed(w)
                      ? <span className={styles.sessionTypeText} style={{ color: w.session_type === 'missed' ? 'var(--danger)' : 'var(--faint)' }}>
                          {w.session_type === 'missed' ? 'Missed' : 'Rest'}
                        </span>
                      : <Badge type="positive">{(w.session_type ?? 'session').charAt(0).toUpperCase() + (w.session_type ?? 'session').slice(1)}</Badge>
                    }
                    {w.duration_min && <span className={styles.sessionMeta}>{w.duration_min} min</span>}
                    {w.perceived_effort && <Badge type={effortColor(w.perceived_effort)}>RPE {w.perceived_effort}</Badge>}
                  </div>
                  <div className={styles.sessionRight}>
                    <button className={styles.rowBtn}
                      onClick={() => { setSelDate(w.date); setSelWorkout(w); setTimeout(historyModals.openEdit, 0) }}>
                      Edit
                    </button>
                    {!isRestOrMissed(w) && (
                      <button className={styles.rowBtn}
                        onClick={() => { setSelDate(w.date); setSelWorkout(w); setTimeout(historyModals.openDetail, 0) }}>
                        Details →
                      </button>
                    )}
                  </div>
                </div>
                {!isRestOrMissed(w) && w.sets?.filter(s => !s.is_warmup).length > 0 && (
                  <div className={styles.setsList}>
                    {groupSetsByExercise(w.sets.filter(s => !s.is_warmup)).map(({ key, name, sets }) => {
                      const top = sets.reduce((b, s) => (s.weight_kg ?? 0) > (b.weight_kg ?? 0) ? s : b, sets[0])
                      return (
                        <div key={key} className={styles.exRow}>
                          <span
                            className={styles.exName}
                            onClick={() => openExercise(key)}
                            title="View exercise history"
                          >{name}</span>
                          <span className={styles.exDetail}>
                            {sets.length} × {top.reps ?? '?'}{top.weight_kg ? ` @ ${top.weight_kg}kg` : ' BW'}{top.rpe ? ` · RPE ${top.rpe}` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
                {w.notes && <div className={styles.sessionNote}>{w.notes}</div>}
              </div>
            ))
          }
        </Panel>
      </div>
      </>
      )}

      {historyModals.Modals()}
      {todayModals.Modals()}
    </div>
  )
}
