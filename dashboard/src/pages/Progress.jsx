import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getWeightTrend, getLatestMetrics, getSummaries } from '../lib/api'
import Panel from '../components/ui/Panel'
import SectionDivider from '../components/ui/SectionDivider'
import MetricsForm from '../components/forms/MetricsForm'
import WeightChart from '../components/charts/WeightChart'
import dayjs from 'dayjs'
import styles from './Progress.module.css'

const MEASUREMENTS = [
  { key: 'waist_cm',  label: 'Waist',  unit: 'cm' },
  { key: 'chest_cm',  label: 'Chest',  unit: 'cm' },
  { key: 'arm_cm',    label: 'Arm',    unit: 'cm' },
  { key: 'thigh_cm',  label: 'Thigh',  unit: 'cm' },
  { key: 'hips_cm',   label: 'Hips',   unit: 'cm' },
]

export default function Progress() {
  const { data: trend,   refetch: refetchTrend }   = useApi(() => getWeightTrend(90))
  const { data: latest,  refetch: refetchLatest }  = useApi(getLatestMetrics)
  const { data: summaries }                         = useApi(() => getSummaries(30))
  const [showForm, setShowForm] = useState(false)

  const refetch = () => { refetchTrend(); refetchLatest() }

  // streak consistency from summaries
  const workoutDays = summaries?.filter(s => s.workout_done).length ?? 0
  const totalDays   = summaries?.length ?? 0
  const consistency = totalDays ? Math.round((workoutDays / totalDays) * 100) : null

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>PROGRESS.db</div>
          <div className={styles.pageTitle}>Body progress</div>
        </div>
        <button onClick={() => setShowForm(v => !v)}>
          {showForm ? 'CANCEL ✕' : '+ LOG_METRICS'}
        </button>
      </div>

      {showForm && (
        <>
          <SectionDivider label="LOG_BODY_METRICS.input" />
          <div className={styles.formWrap}>
            <Panel label="METRICS_LOGGER">
              <MetricsForm onSaved={() => { refetch(); setShowForm(false) }} />
            </Panel>
          </div>
        </>
      )}

      {/* SUMMARY STATS */}
      <SectionDivider label="CURRENT_STATS.latest" />
      <div className={styles.statsGrid}>
        {[
          { label: 'Current weight',  val: latest?.weight_kg,    unit: 'kg',  key: null },
          { label: 'Body fat',        val: latest?.body_fat_pct,  unit: '%',   key: null },
          { label: 'Training consistency', val: consistency,     unit: '%',   key: null },
          { label: 'Entries (90d)',   val: trend?.length ?? 0,   unit: '',    key: null },
        ].map(s => (
          <div key={s.label} className={styles.statBox}>
            <div className={styles.statLabel}>{s.label}</div>
            <div className={styles.statVal}>
              {s.val ?? '—'}
              {s.val != null && <span className={styles.statUnit}>{s.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* WEIGHT TREND */}
      <SectionDivider label="WEIGHT_TREND.90d" />
      <div className={styles.chartWrap}>
        <Panel label="BODYWEIGHT.line_chart">
          <WeightChart data={trend ?? []} />
        </Panel>
      </div>

      {/* MEASUREMENTS */}
      <SectionDivider label="MEASUREMENTS.latest" />
      <div className={styles.metricsGrid}>
        <Panel label="BODY_MEASUREMENTS.current">
          {latest && Object.values(latest).some(Boolean) ? (
            <div>
              <div className={styles.lastLogged}>
                last logged: {latest.date ? dayjs(latest.date).format('MMM D, YYYY') : '—'}
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
                {latest.body_fat_pct != null && (
                  <div className={styles.measureRow}>
                    <span className={styles.measureLabel}>Body fat</span>
                    <span className={styles.measureVal}>{latest.body_fat_pct}%</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)' }}>
              NO_DATA · log body metrics to see measurements
            </span>
          )}
        </Panel>

        <Panel label="TRAINING_CONSISTENCY.30d">
          <div className={styles.consistencyWrap}>
            <div className={styles.bigPct}>
              {consistency ?? '—'}
              {consistency != null && <span className={styles.bigPctUnit}>%</span>}
            </div>
            <div className={styles.consistencySub}>
              {workoutDays} workout days out of {totalDays} tracked
            </div>

            {/* mini calendar dots */}
            <div className={styles.dotGrid}>
              {summaries?.slice().reverse().map(s => (
                <div
                  key={s.date}
                  title={`${s.date} · ${s.workout_done ? 'trained' : 'rest'}`}
                  className={`${styles.calDot} ${s.workout_done ? styles.dotDone : styles.dotRest}`}
                />
              ))}
            </div>
            <div className={styles.dotLegend}>
              <span className={styles.ldDone}>■ trained</span>
              <span className={styles.ldRest}>■ rest</span>
            </div>
          </div>
        </Panel>

        <Panel label="WEIGHT_HISTORY.table">
          {trend?.length ? (
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
          ) : (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)' }}>
              NO_DATA · log body weight to see history
            </span>
          )}
        </Panel>
      </div>
    </div>
  )
}