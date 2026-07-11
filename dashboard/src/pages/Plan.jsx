import { useApi } from '../hooks/useApi'
import { getPlan } from '../lib/api'
import Panel from '../components/ui/Panel'
import SectionDivider from '../components/ui/SectionDivider'
import Badge from '../components/ui/Badge'
import dayjs from 'dayjs'
import styles from './Plan.module.css'

export default function Plan() {
  const { data: plan, loading, error } = useApi(getPlan)

  if (loading) return <LoadingState />
  if (error)   return <ErrorState msg={error} />
  if (!plan || !Object.keys(plan).length) return <EmptyState />

  const daysLeft = plan.end_date
    ? dayjs(plan.end_date).diff(dayjs(), 'day')
    : null

  const weekProgress = plan.start_date
    ? dayjs().diff(dayjs(plan.start_date), 'week') + 1
    : null

  return (
    <div>
      {/* PLAN HEADER */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>TRAINING_PLAN.active</div>
          <div className={styles.pageTitle}>{plan.name ?? 'Active plan'}</div>
          <div className={styles.planSub}>
            {plan.split_type && <span>{plan.split_type}</span>}
            {plan.days_per_week && <span>· {plan.days_per_week} days/week</span>}
            {plan.mesocycle_number && <span>· meso #{plan.mesocycle_number}</span>}
          </div>
        </div>
        {plan.is_active && (
          <Badge type="positive">ACTIVE</Badge>
        )}
      </div>

      {/* MESO STATS */}
      <SectionDivider label="MESOCYCLE.stats" />
      <div className={styles.mesoGrid}>
        <div className={styles.mesoStat}>
          <div className={styles.mesoLabel}>Start date</div>
          <div className={styles.mesoVal}>{plan.start_date ? dayjs(plan.start_date).format('MMM D, YYYY') : '—'}</div>
        </div>
        <div className={styles.mesoStat}>
          <div className={styles.mesoLabel}>End date</div>
          <div className={styles.mesoVal}>{plan.end_date ? dayjs(plan.end_date).format('MMM D, YYYY') : '—'}</div>
        </div>
        <div className={styles.mesoStat}>
          <div className={styles.mesoLabel}>Days remaining</div>
          <div className={`${styles.mesoVal} ${daysLeft != null && daysLeft < 7 ? styles.warn : ''}`}>
            {daysLeft != null ? `${daysLeft}d` : '—'}
          </div>
        </div>
        <div className={styles.mesoStat}>
          <div className={styles.mesoLabel}>Current week</div>
          <div className={styles.mesoVal}>
            {weekProgress != null ? `W${weekProgress}` : '—'}
            {plan.deload_week && weekProgress === plan.deload_week && (
              <span className={styles.deloadTag}>DELOAD</span>
            )}
          </div>
        </div>
        <div className={styles.mesoStat}>
          <div className={styles.mesoLabel}>Deload week</div>
          <div className={styles.mesoVal}>{plan.deload_week ? `W${plan.deload_week}` : '—'}</div>
        </div>
      </div>

      {/* PLAN DAYS */}
      <SectionDivider label="PLAN_DAYS.schedule" />
      {plan.days?.length ? (
        <div className={styles.daysGrid}>
          {plan.days
            .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
            .map(day => (
              <div key={day.id} className={styles.dayCard}>
                <div className={styles.dayHeader}>
                  <span className={styles.dayName}>{day.day_name}</span>
                  {day.session_type && (
                    <Badge type="positive">{day.session_type.toUpperCase()}</Badge>
                  )}
                </div>

                {day.exercises?.length ? (
                  <table className={styles.exTable}>
                    <thead>
                      <tr>
                        <th>Exercise</th>
                        <th>Sets</th>
                        <th>Reps</th>
                        <th>RiR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.exercises
                        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                        .map(ex => (
                          <tr key={ex.id}>
                            <td className={styles.exName}>{ex.exercise}</td>
                            <td>{ex.sets ?? '—'}</td>
                            <td>{ex.reps ?? '—'}</td>
                            <td>{ex.rir != null ? ex.rir : '—'}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                ) : (
                  <div className={styles.noExercises}>REST · no exercises assigned</div>
                )}

                {day.exercises?.some(e => e.progression_rule) && (
                  <div className={styles.progressionNotes}>
                    {day.exercises.filter(e => e.progression_rule).map(e => (
                      <div key={e.id} className={styles.progressionRow}>
                        <span className={styles.progEx}>{e.exercise}</span>
                        <span className={styles.progRule}>{e.progression_rule}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          }
        </div>
      ) : (
        <Panel label="NO_PLAN_DAYS">
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)' }}>
            no plan days defined · ask Fahim to create a training plan
          </span>
        </Panel>
      )}

      {/* NUTRITION TARGETS */}
      {plan.nutrition_targets && Object.keys(plan.nutrition_targets).length > 0 && (
        <>
          <SectionDivider label="NUTRITION_TARGETS.plan" />
          <div className={styles.targetsRow}>
            {[
              { label: 'Calories', val: plan.nutrition_targets.calories, unit: 'kcal' },
              { label: 'Protein',  val: plan.nutrition_targets.protein_g, unit: 'g' },
              { label: 'Carbs',    val: plan.nutrition_targets.carbs_g,   unit: 'g' },
              { label: 'Fat',      val: plan.nutrition_targets.fat_g,     unit: 'g' },
            ].map(t => (
              <div key={t.label} className={styles.targetBox}>
                <div className={styles.targetLabel}>{t.label}</div>
                <div className={styles.targetVal}>
                  {t.val ?? '—'}
                  <span className={styles.targetUnit}>{t.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* NOTES */}
      {plan.notes && (
        <>
          <SectionDivider label="PLAN_NOTES" />
          <Panel label="COACH_NOTES">
            <p className={styles.planNotes}>{plan.notes}</p>
          </Panel>
        </>
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ padding: '60px 24px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>
      LOADING.plan…
    </div>
  )
}

function ErrorState({ msg }) {
  return (
    <div style={{ padding: '60px 24px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--warn)', marginBottom: 8 }}>
        PLAN_FUNCTIONS.not_implemented
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)' }}>
        Add get_active_plan(), get_plan_days(), get_plan_exercises(), and get_active_nutrition_targets() to memory_manager.py to enable this page.
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ padding: '60px 24px' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        NO_ACTIVE_PLAN
      </div>
      <div style={{ fontSize: 12, color: 'var(--faint)' }}>
        Ask Fahim in the chat to create a training plan for you. It will appear here once created.
      </div>
    </div>
  )
}