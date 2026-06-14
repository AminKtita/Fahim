import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getWorkouts, getPlan } from '../lib/api'
import { useStatus } from '../lib/StatusContext'
import { useWorkoutModals, getPlanDayForDate } from '../lib/WorkoutModals'
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

  const today = dayjs().format('YYYY-MM-DD')
  const todayWorkout = workouts?.find(w => w.date === today)
  const canLogToday  = !todayWorkout

  const onSaved = () => { refetch(); refreshStatus() }

  // modals wired to selected workout (for history) or today for logging
  const historyModals = useWorkoutModals({
    plan, selDate, selWorkout,
    onSaved,
  })
  const todayModals = useWorkoutModals({
    plan, selDate: today, selWorkout: todayWorkout,
    onSaved,
  })

  const [selectedExercise, setSelectedExercise] = useState(null)
  const exercises = [...new Set(
    workouts?.flatMap(w => w.sets?.map(s => s.exercise) ?? []).filter(Boolean) ?? []
  )].sort()

  const effortColor = e => !e ? 'neutral' : e >= 8 ? 'warning' : e >= 6 ? 'info' : 'positive'
  const isRestOrMissed = w => w?.session_type === 'rest' || w?.session_type === 'missed'

  return (
    <div>
      {/* PAGE HEADER */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>WORKOUTS.db</div>
          <div className={styles.pageTitle}>Session log</div>
        </div>
      </div>

      {/* TODAY PANEL */}
      <SectionDivider label="TODAY.session" />
      <div className={styles.todayWrap}>
        <Panel label="TODAY.workout">
          {todayWorkout ? (
            isRestOrMissed(todayWorkout) ? (
              <div className={styles.todayLogged}>
                <span className={styles.todayStatus} style={{ color: todayWorkout.session_type === 'missed' ? 'var(--danger)' : 'var(--muted)' }}>
                  {todayWorkout.session_type === 'missed' ? 'MISSED' : 'REST DAY'}
                </span>
                <div className={styles.todayBtns}>
                  <button className="btn-ghost" style={{ padding: '4px 12px', fontSize: 10 }}
                    onClick={() => { setSelDate(today); setSelWorkout(todayWorkout); setTimeout(todayModals.openEdit, 0) }}>edit</button>
                </div>
              </div>
            ) : (
              <div className={styles.todayLogged}>
                <div className={styles.todayMeta}>
                  <Badge type="positive">{(todayWorkout.session_type ?? 'session').toUpperCase()}</Badge>
                  {todayWorkout.duration_min && <span className={styles.todayMetaItem}>{todayWorkout.duration_min} min</span>}
                  {todayWorkout.perceived_effort && <Badge type={effortColor(todayWorkout.perceived_effort)}>RPE {todayWorkout.perceived_effort}</Badge>}
                </div>
                {todayWorkout.sets?.filter(s => !s.is_warmup).length > 0 && (
                  <div className={styles.todaySets}>
                    {Object.entries(
                      todayWorkout.sets.filter(s => !s.is_warmup).reduce((acc, s) => {
                        if (!acc[s.exercise]) acc[s.exercise] = []
                        acc[s.exercise].push(s)
                        return acc
                      }, {})
                    ).map(([ex, sets]) => {
                      const top = sets.reduce((b, s) => (s.weight_kg ?? 0) > (b.weight_kg ?? 0) ? s : b, sets[0])
                      return (
                        <div key={ex} className={styles.todaySetRow}>
                          <span className={styles.todaySetEx}>{ex}</span>
                          <span className={styles.todaySetVal}>{sets.length}×{top.reps ?? '?'}{top.weight_kg ? ` @ ${top.weight_kg}kg` : ' BW'}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className={styles.todayBtns}>
                  <button className="btn-ghost" style={{ padding: '4px 12px', fontSize: 10 }}
                    onClick={() => { setSelDate(today); setSelWorkout(todayWorkout); setTimeout(todayModals.openEdit, 0) }}>edit</button>
                  <button className="btn-ghost" style={{ padding: '4px 12px', fontSize: 10 }}
                    onClick={() => { setSelDate(today); setSelWorkout(todayWorkout); setTimeout(todayModals.openDetail, 0) }}>details →</button>
                </div>
              </div>
            )
          ) : (
            <div className={styles.todayEmpty}>
              <span className={styles.todayEmptyMono}>NOT_LOGGED · no session today yet</span>
              <button style={{ padding: '7px 18px' }} onClick={() => { setSelDate(today); todayModals.openLog() }}>
                + LOG_TODAY
              </button>
            </div>
          )}
        </Panel>
      </div>

      {/* VOLUME CHART */}
      <SectionDivider label="WORKOUT_VOLUME.60d" />
      <div className={styles.chartWrap}>
        <Panel label="SETS_PER_DAY.bar_chart">
          <VolumeChart workouts={workouts ?? []} />
        </Panel>
      </div>

      {/* SESSION LIST */}
      <SectionDivider label="SESSION_HISTORY.log" />
      <div className={styles.grid}>
        <Panel label="SESSIONS.recent" action="60 days" className={styles.sessionPanel}>
          {!workouts?.length
            ? <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)' }}>NO_SESSIONS · log your first workout</span>
            : workouts.map(w => (
              <div key={w.id} className={styles.sessionRow}>
                <div className={styles.sessionTop}>
                  <div className={styles.sessionLeft}>
                    <span className={styles.sessionDate}>{dayjs(w.date).format('MMM D')}</span>
                    {isRestOrMissed(w)
                      ? <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: w.session_type === 'missed' ? 'var(--danger)' : 'var(--faint)' }}>
                          {w.session_type.toUpperCase()}
                        </span>
                      : <Badge type="positive">{(w.session_type ?? 'session').toUpperCase()}</Badge>
                    }
                  </div>
                  <div className={styles.sessionRight}>
                    {w.duration_min && <span className={styles.sessionMeta}>{w.duration_min}min</span>}
                    {w.perceived_effort && <Badge type={effortColor(w.perceived_effort)}>RPE {w.perceived_effort}</Badge>}
                    <button className={styles.iconBtn}
                      onClick={() => { setSelDate(w.date); setSelWorkout(w); setTimeout(historyModals.openEdit, 0) }}>edit</button>
                    {!isRestOrMissed(w) && (
                      <button className={styles.iconBtn}
                        onClick={() => { setSelDate(w.date); setSelWorkout(w); setTimeout(historyModals.openDetail, 0) }}>details →</button>
                    )}
                  </div>
                </div>
                {!isRestOrMissed(w) && w.sets?.filter(s => !s.is_warmup).length > 0 && (
                  <div className={styles.setsList}>
                    {Object.entries(
                      w.sets.filter(s => !s.is_warmup).reduce((acc, s) => {
                        if (!acc[s.exercise]) acc[s.exercise] = []
                        acc[s.exercise].push(s)
                        return acc
                      }, {})
                    ).map(([ex, sets]) => {
                      const top = sets.reduce((b, s) => (s.weight_kg ?? 0) > (b.weight_kg ?? 0) ? s : b, sets[0])
                      return (
                        <div key={ex} className={styles.exRow}>
                          <span className={styles.exName}
                            onClick={() => setSelectedExercise(ex === selectedExercise ? null : ex)}>{ex}</span>
                          <span className={styles.exDetail}>{sets.length}×{top.reps ?? '?'}{top.weight_kg ? ` @ ${top.weight_kg}kg` : ' BW'}{top.rpe ? ` RPE${top.rpe}` : ''}</span>
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

        {/* EXERCISE HISTORY */}
        <div className={styles.rightCol}>
          <Panel label={selectedExercise ? `EXERCISE.${selectedExercise.toUpperCase().replace(/ /g,'_')}` : 'EXERCISE_HISTORY.select'}>
            {!selectedExercise ? (
              <div>
                <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 14 }}>tap an exercise name to see its history</div>
                <div className={styles.exerciseList}>
                  {exercises.map(ex => (
                    <div key={ex} className={styles.exChip} onClick={() => setSelectedExercise(ex)}>{ex}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className={styles.exHistoryHeader}>
                  <span className={styles.exHistoryName}>{selectedExercise}</span>
                  <button className="btn-ghost" style={{ padding: '3px 10px', fontSize: 10 }}
                    onClick={() => setSelectedExercise(null)}>clear ✕</button>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)' }}>
                  {workouts?.filter(w => w.sets?.some(s => s.exercise === selectedExercise))
                    .map(w => {
                      const sets = w.sets.filter(s => s.exercise === selectedExercise && !s.is_warmup)
                      if (!sets.length) return null
                      const top = sets.reduce((b, s) => (s.weight_kg ?? 0) > (b.weight_kg ?? 0) ? s : b, sets[0])
                      return (
                        <div key={w.id} className={styles.exHistRow}>
                          <span style={{ color: 'var(--muted)' }}>{dayjs(w.date).format('MMM D')}</span>
                          <span style={{ color: 'var(--text)' }}>{sets.length}×{top.reps ?? '?'}{top.weight_kg ? ` @ ${top.weight_kg}kg` : ' BW'}{top.rpe ? ` @${top.rpe}` : ''}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {historyModals.Modals()}
      {todayModals.Modals()}
    </div>
  )
}