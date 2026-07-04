import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getWeightTrend, getLatestMetrics, getSummaries, getExerciseHistory, getWorkouts } from '../lib/api'
import { groupSetsByExercise } from '../lib/exerciseGrouping'
import Panel from '../components/ui/Panel'
import SectionDivider from '../components/ui/SectionDivider'
import MetricsForm from '../components/forms/MetricsForm'
import WeightChart from '../components/charts/WeightChart'
import dayjs from 'dayjs'
import styles from './Progress.module.css'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const MEASUREMENTS = [
  { key: 'waist_cm',  label: 'Waist',  unit: 'cm' },
  { key: 'chest_cm',  label: 'Chest',  unit: 'cm' },
  { key: 'arm_cm',    label: 'Arm',    unit: 'cm' },
  { key: 'thigh_cm',  label: 'Thigh',  unit: 'cm' },
  { key: 'hips_cm',   label: 'Hips',   unit: 'cm' },
]

const COMMON_LIFTS = ['bench press', 'squat', 'deadlift', 'overhead press', 'row', 'pull up']

export default function Progress() {
  const { data: trend,     refetch: refetchTrend }   = useApi(() => getWeightTrend(90))
  const { data: latest,    refetch: refetchLatest }  = useApi(getLatestMetrics)
  const { data: summaries }                          = useApi(() => getSummaries(30))
  const { data: workouts }                           = useApi(() => getWorkouts(90))
  const [showForm,       setShowForm]       = useState(false)
  const [selectedLift,   setSelectedLift]   = useState(null) // { key, name, queryValue } | null
  const { data: liftHistory }               = useApi(
    selectedLift ? () => getExerciseHistory(selectedLift.queryValue, 30) : null,
    [selectedLift?.key]
  )

  const refetch = () => { refetchTrend(); refetchLatest() }

  // Consistency from summaries
  const workoutDays = summaries?.filter(s => s.workout_done).length ?? 0
  const totalDays   = summaries?.length ?? 0
  const consistency = totalDays ? Math.round((workoutDays / totalDays) * 100) : null

  // Previous weight for delta
  const weightHistory = [...(trend ?? [])].sort((a,b) => a.date.localeCompare(b.date))
  const latestWeight  = weightHistory[weightHistory.length - 1]?.weight_kg ?? null
  const prevWeight    = weightHistory[weightHistory.length - 2]?.weight_kg ?? null
  const weightDelta   = latestWeight && prevWeight ? (latestWeight - prevWeight).toFixed(1) : null

  // Detect exercises user has actually logged
  const allSets = workouts?.flatMap(w => w.sets ?? []) ?? []
  const loggedExerciseGroups = groupSetsByExercise(allSets)
    .map(g => ({
      key: g.key,
      name: g.name,
      // exercise_id is the more reliable query value when present —
      // falls back to the free-text name for legacy/unlinked sets.
      queryValue: g.sets[0]?.exercise_id || g.sets[0]?.exercise,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Lift history chart data
  const liftChartData = liftHistory?.map(h => ({
    label: dayjs(h.date).format('MMM D'),
    weight: h.max_weight_kg ?? null,
    reps: h.reps,
  })).filter(d => d.weight != null) ?? []

  // Has enough data checks
  const hasTrendData     = (trend?.length ?? 0) >= 2
  const hasLiftData      = liftChartData.length >= 2
  const hasConsistency   = (summaries?.length ?? 0) > 0
  const hasMeasurements  = latest && MEASUREMENTS.some(m => latest[m.key] != null)

  return (
    <div>
      {/* PAGE HEADER */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Progress</div>
          <div className={styles.pageSub}>Track body composition, strength, and consistency over time.</div>
        </div>
        <button className={showForm ? 'btn-ghost' : 'btn-accent'} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Log metrics'}
        </button>
      </div>

      {/* METRICS FORM */}
      {showForm && (
        <>
          <SectionDivider label="Log body metrics" />
          <div className={styles.formWrap}>
            <Panel label="Body metrics">
              <MetricsForm initial={latest} onSaved={() => { refetch(); setShowForm(false) }} />
            </Panel>
          </div>
        </>
      )}

      {/* STATS ROW */}
      <SectionDivider label="Current stats" />
      <div className={styles.statsGrid}>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Current weight</div>
          <div className={styles.statVal}>
            {latest?.weight_kg ?? '—'}
            {latest?.weight_kg && <span className={styles.statUnit}>kg</span>}
          </div>
          {weightDelta !== null && (
            <div className={`${styles.statDelta} ${Number(weightDelta) > 0 ? styles.deltaUp : styles.deltaDown}`}>
              {Number(weightDelta) > 0 ? '↑' : '↓'} {Math.abs(weightDelta)}kg vs previous
            </div>
          )}
        </div>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Body fat</div>
          <div className={styles.statVal}>
            {latest?.body_fat_pct ?? '—'}
            {latest?.body_fat_pct != null && <span className={styles.statUnit}>%</span>}
          </div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Training consistency</div>
          <div className={styles.statVal}>
            {consistency ?? '—'}
            {consistency != null && <span className={styles.statUnit}>%</span>}
          </div>
          {hasConsistency && (
            <div className={styles.statSub}>{workoutDays} of {totalDays} days trained</div>
          )}
        </div>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Measurements logged</div>
          <div className={styles.statVal}>{trend?.length ?? 0}</div>
          <div className={styles.statSub}>weight entries</div>
        </div>
      </div>

      {/* STRENGTH PROGRESS */}
      <SectionDivider label="Strength progress" />
      <div className={styles.strengthSection}>
        {/* Exercise selector */}
        <div className={styles.liftSelector}>
          {loggedExerciseGroups.filter(g => COMMON_LIFTS.includes(g.name.toLowerCase())).map(g => (
            <button
              key={g.key}
              className={`${styles.liftChip} ${selectedLift?.key === g.key ? styles.liftChipActive : ''}`}
              onClick={() => setSelectedLift(selectedLift?.key === g.key ? null : g)}
            >
              {g.name}
            </button>
          ))}
          {loggedExerciseGroups.filter(g => !COMMON_LIFTS.includes(g.name.toLowerCase())).map(g => (
            <button
              key={g.key}
              className={`${styles.liftChip} ${selectedLift?.key === g.key ? styles.liftChipActive : ''}`}
              onClick={() => setSelectedLift(selectedLift?.key === g.key ? null : g)}
            >
              {g.name}
            </button>
          ))}
          {loggedExerciseGroups.length === 0 && (
            <span className={styles.emptyHint}>No exercises logged yet</span>
          )}
        </div>

        {selectedLift && (
          <div className={styles.liftChartWrap}>
            {!hasLiftData ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyStateIcon}>📈</span>
                <span className={styles.emptyStateText}>Not enough data for {selectedLift.name} yet</span>
                <span className={styles.emptyStateSub}>Log at least 2 sessions with this exercise to see a trend.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={liftChartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--mono)' }}
                    axisLine={false} tickLine={false}
                    interval={Math.floor(liftChartData.length / 5)}
                  />
                  <YAxis
                    tick={{ fill: 'var(--faint)', fontSize: 9, fontFamily: 'var(--mono)' }}
                    axisLine={false} tickLine={false} width={36}
                    tickFormatter={v => `${v}kg`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div style={{ background:'var(--surface2)', border:'1px solid var(--border2)', borderRadius:6, padding:'8px 12px', fontFamily:'var(--mono)', fontSize:11 }}>
                          <div style={{ color:'var(--muted)', marginBottom:3 }}>{label}</div>
                          <div style={{ color:'var(--accent)', fontWeight:600 }}>{payload[0].value}kg</div>
                        </div>
                      )
                    }}
                  />
                  <Line
                    type="monotone" dataKey="weight"
                    stroke="var(--accent)" strokeWidth={2}
                    dot={{ fill: 'var(--accent)', r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: 'var(--accent)' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {!selectedLift && loggedExerciseGroups.length > 0 && (
          <div className={styles.liftPrompt}>Select an exercise above to see its strength trend</div>
        )}
      </div>

      {/* WEIGHT TREND */}
      <SectionDivider label="Weight trend" />
      <div className={styles.chartWrap}>
        <Panel label="Body weight · 90 days" noPad>
          <div style={{padding:'12px 16px 8px'}}>
            {!hasTrendData ? (
              <div className={styles.emptyState} style={{height:180}}>
                <span className={styles.emptyStateIcon}>⚖</span>
                <span className={styles.emptyStateText}>Not enough weight data yet</span>
                <span className={styles.emptyStateSub}>Log at least 2 body metric entries to see your weight trend.</span>
              </div>
            ) : (
              <WeightChart data={trend ?? []} />
            )}
          </div>
        </Panel>
      </div>

      {/* MEASUREMENTS + CONSISTENCY + HISTORY */}
      <SectionDivider label="Measurements & history" />
      <div className={styles.metricsGrid}>
        <Panel label="Body measurements">
          {!hasMeasurements ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyStateIcon}>📏</span>
              <span className={styles.emptyStateText}>No measurements logged</span>
              <span className={styles.emptyStateSub}>Log your body metrics above to track chest, waist, arm, and more.</span>
            </div>
          ) : (
            <div>
              <div className={styles.lastLogged}>
                Last logged: {latest?.date ? dayjs(latest.date).format('MMM D, YYYY') : '—'}
              </div>
              <div className={styles.measureList}>
                {MEASUREMENTS.map(m => (
                  <div key={m.key} className={styles.measureRow}>
                    <span className={styles.measureLabel}>{m.label}</span>
                    <span className={styles.measureVal}>
                      {latest[m.key] != null ? `${latest[m.key]} ${m.unit}` : '—'}
                    </span>
                  </div>
                ))}
                {latest?.body_fat_pct != null && (
                  <div className={styles.measureRow}>
                    <span className={styles.measureLabel}>Body fat</span>
                    <span className={styles.measureVal}>{latest.body_fat_pct}%</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>

        <Panel label="Training consistency · 30 days">
          {!hasConsistency ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyStateIcon}>📅</span>
              <span className={styles.emptyStateText}>No data yet</span>
              <span className={styles.emptyStateSub}>Start logging workouts to track your training consistency.</span>
            </div>
          ) : (
            <div className={styles.consistencyWrap}>
              <div className={styles.bigPct}>
                {consistency ?? '—'}
                {consistency != null && <span className={styles.bigPctUnit}>%</span>}
              </div>
              <div className={styles.consistencySub}>
                {workoutDays} sessions in {totalDays} days tracked
              </div>
              <div className={styles.dotGrid}>
                {summaries?.slice().reverse().map(s => (
                  <div
                    key={s.date}
                    title={`${dayjs(s.date).format('MMM D')} · ${s.workout_done ? 'trained' : 'rest'}`}
                    className={`${styles.calDot} ${s.workout_done ? styles.dotDone : styles.dotRest}`}
                  />
                ))}
              </div>
              <div className={styles.dotLegend}>
                <span className={styles.ldDone}>● Trained</span>
                <span className={styles.ldRest}>○ Rest</span>
              </div>
            </div>
          )}
        </Panel>

        <Panel label="Weight history">
          {!(trend?.length) ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyStateIcon}>📋</span>
              <span className={styles.emptyStateText}>No weight entries</span>
              <span className={styles.emptyStateSub}>Log body weight to see your history here.</span>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.wTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Weight</th>
                    <th>Δ prev</th>
                    <th>Body fat</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trend].reverse().slice(0, 15).map((row, i, arr) => {
                    const prev  = arr[i + 1]
                    const delta = prev ? (row.weight_kg - prev.weight_kg).toFixed(1) : null
                    const up    = delta > 0
                    return (
                      <tr key={row.date}>
                        <td>{dayjs(row.date).format('MMM D')}</td>
                        <td className={styles.weightCell}>{row.weight_kg}kg</td>
                        <td className={delta != null ? (up ? styles.deltaUp : styles.deltaDown) : ''}>
                          {delta != null ? `${up ? '+' : ''}${delta}` : '—'}
                        </td>
                        <td>{row.body_fat_pct != null ? `${row.body_fat_pct}%` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}