import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getWorkouts, getNutrition, getSummaries, getPlan } from '../lib/api'
import { useStatus } from '../lib/StatusContext'
import { useWorkoutModals, getPlanDayForDate } from '../lib/WorkoutModals'
import { useNutritionModals, deriveNutStatus } from '../lib/NutritionModals'
import { groupSetsByExercise } from '../lib/exerciseGrouping'
import dayjs from 'dayjs'
import styles from './Schedule.module.css'

const isRestOrMissed = (w) => w?.session_type === 'rest' || w?.session_type === 'missed'

const DAY_MAP = {
  sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6,
  sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6,
}

export default function Schedule() {
  const [cursor,   setCursor]   = useState(dayjs().startOf('month'))
  const [selected, setSelected] = useState(dayjs().format('YYYY-MM-DD'))

  const { refresh: refreshStatus } = useStatus()
  const { data: workouts,  refetch: refetchWorkouts }  = useApi(() => getWorkouts(120))
  const { data: nutrition, refetch: refetchNutrition } = useApi(() => getNutrition(120))
  const { data: summaries }  = useApi(() => getSummaries(120))
  const { data: plan }       = useApi(getPlan)

  const today = dayjs().format('YYYY-MM-DD')

  const workoutMap   = {}; workouts?.forEach(w  => { workoutMap[w.date]   = w })
  const nutritionMap = {}; nutrition?.forEach(n => { nutritionMap[n.date] = n })
  const summaryMap   = {}; summaries?.forEach(s => { summaryMap[s.date]   = s })

  // ── Plan rest-day helper ──
  const isPlanRest = (iso) => {
    if (!plan?.days?.length) return false
    const dow = dayjs(iso).day()
    return !plan.days.find(d => DAY_MAP[d.day_name?.toLowerCase()] === dow)
  }

  // ── Streak chain dates ──
  const streakDates = (() => {
    const set = new Set()
    if (!workouts || !nutrition) return set
    let d = dayjs()
    for (let i = 0; i < 120; i++) {
      const iso = d.format('YYYY-MM-DD')
      const isRest = isPlanRest(iso)
      const n = nutritionMap[iso]
      const nutStatus = deriveNutStatus(n, plan?.nutrition_targets)
      const nutHit = nutStatus === 'hit'
      const w = workoutMap[iso]
      const todayUntouched = i === 0 && nutStatus == null && !w
      if (isRest) {
        if (nutHit) { set.add(iso); d = d.subtract(1,'day'); continue }
        if (todayUntouched) { d = d.subtract(1,'day'); continue }
        break
      }
      const workoutDone = !!(w && w.session_type !== 'missed' && w.session_type !== 'rest')
      if (workoutDone && nutHit) { set.add(iso); d = d.subtract(1,'day') }
      else if (todayUntouched)   { d = d.subtract(1,'day'); continue }
      else                        { break }
    }
    return set
  })()

  // ── Week summary (current week Mon–Sun) ──
  const weekStart = dayjs().startOf('week')
  const weekDays  = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day').format('YYYY-MM-DD'))
  const weekSessionsDone = weekDays.filter(d => {
    const w = workoutMap[d]
    return w && !isRestOrMissed(w)
  }).length
  const weekSessionsPlanned = weekDays.filter(d => getPlanDayForDate(plan, d)).length
  const weekNutritionHit = weekDays.filter(d => {
    const n = nutritionMap[d]
    return deriveNutStatus(n, plan?.nutrition_targets) === 'hit'
  }).length
  const weekNutritionLogged = weekDays.filter(d => nutritionMap[d]?.calories).length

  const gridStart = cursor.startOf('month').startOf('week')
  const days = Array.from({ length: 42 }, (_, i) => gridStart.add(i, 'day'))

  const prevMonth = () => setCursor(c => c.subtract(1, 'month'))
  const nextMonth = () => setCursor(c => c.add(1, 'month'))
  const goToday   = () => { setCursor(dayjs().startOf('month')); setSelected(today) }

  const selWorkout   = selected ? workoutMap[selected]   : null
  const selNutrition = selected ? nutritionMap[selected] : null
  const selSummary   = selected ? summaryMap[selected]   : null
  const selPlanDay   = selected ? getPlanDayForDate(plan, selected) : null
  const isPast       = selected ? selected <= today : false
  const isFuture     = selected ? selected > today : false
  const canLogW      = isPast && !selWorkout
  const canLogN      = isPast && !selNutrition?.calories && selNutrition?.notes !== '__MISSED__'

  const onSaved = () => { refetchWorkouts(); refetchNutrition(); refreshStatus() }

  const workoutModals   = useWorkoutModals({ plan, selDate: selected, selWorkout, onSaved })
  const nutritionModals = useNutritionModals({ selDate: selected, selNutrition, plan, onSaved })

  return (
    <div className={styles.wrap}>

      {/* ── PAGE HEADER ── */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>Schedule</div>
          <div className={styles.pageSub}>
            {plan?.name
              ? <><span className={styles.planDot} />Active plan: <strong>{plan.name}</strong></>
              : 'No active plan — ask Fahim to build one'}
          </div>
        </div>
        <div className={styles.headerNav}>
          <button className="btn-ghost" style={{ padding: '6px 14px' }} onClick={prevMonth}>← Prev</button>
          <span className={styles.monthLabel}>{cursor.format('MMMM YYYY')}</span>
          <button className="btn-ghost" style={{ padding: '6px 14px' }} onClick={nextMonth}>Next →</button>
          <button className="btn-ghost" style={{ padding: '6px 14px', marginLeft: 8 }} onClick={goToday}>Today</button>
        </div>
      </div>

      {/* ── WEEK SUMMARY STRIP ── */}
      <div className={styles.weekStrip}>
        <span className={styles.weekStripLabel}>This week</span>
        <div className={styles.weekStats}>
          <WeekStat
            icon="🏋"
            value={weekSessionsPlanned > 0
              ? `${weekSessionsDone} / ${weekSessionsPlanned} sessions`
              : `${weekSessionsDone} sessions`}
            status={weekSessionsPlanned > 0
              ? (weekSessionsDone >= weekSessionsPlanned ? 'good' : weekSessionsDone > 0 ? 'partial' : 'empty')
              : 'neutral'}
          />
          <div className={styles.weekStripDiv} />
          <WeekStat
            icon="🥗"
            value={`${weekNutritionLogged} days logged · ${weekNutritionHit} on target`}
            status={weekNutritionHit >= 5 ? 'good' : weekNutritionLogged > 0 ? 'partial' : 'empty'}
          />
          <div className={styles.weekStripDiv} />
          <WeekStat
            icon="🔥"
            value={streakDates.size > 0 ? `${streakDates.size}-day streak` : 'No streak yet'}
            status={streakDates.size >= 7 ? 'good' : streakDates.size > 0 ? 'partial' : 'empty'}
          />
        </div>
        {/* Mini week dots */}
        <div className={styles.weekDots}>
          {weekDays.map(d => {
            const w = workoutMap[d]
            const n = nutritionMap[d]
            const done = w && !isRestOrMissed(w)
            const rest = isPlanRest(d) || (w && w.session_type === 'rest')
            const missed = w?.session_type === 'missed'
            const nutSt = deriveNutStatus(n, plan?.nutrition_targets)
            const isFut = d > today
            return (
              <div key={d} className={styles.weekDotCol} onClick={() => setSelected(d)}>
                <span className={styles.weekDotDay}>{dayjs(d).format('dd')}</span>
                <span className={`${styles.weekDot} ${
                  isFut   ? styles.weekDotFuture :
                  missed  ? styles.weekDotMissed :
                  done    ? styles.weekDotDone   :
                  rest    ? styles.weekDotRest   :
                  styles.weekDotEmpty
                }`} />
                <span className={`${styles.weekNutDot} ${
                  nutSt === 'hit'      ? styles.nutOk       :
                  nutSt === 'exceeded' ? styles.nutExceeded :
                  nutSt === 'partial'  ? styles.nutPartial  :
                  nutSt === 'missed'   ? styles.nutMissed   :
                  styles.nutEmpty
                }`} />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div className={styles.layout}>

        {/* ── CALENDAR ── */}
        <div className={styles.calWrap}>
          <div className={styles.dowRow}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d =>
              <div key={d} className={styles.dowCell}>{d}</div>
            )}
          </div>
          <div className={styles.grid}>
            {days.map(day => {
              const iso     = day.format('YYYY-MM-DD')
              const inMonth = day.month() === cursor.month()
              const isToday = iso === today
              const isSel   = iso === selected
              const isFut   = iso > today
              const w       = workoutMap[iso]
              const n       = nutritionMap[iso]
              const pd      = getPlanDayForDate(plan, iso)
              const isRM       = w && isRestOrMissed(w)
              const isPlanned  = !!pd && !w && !isFut && iso < today  // planned but missed
              const isScheduled= !!pd && !w && isFut               // future planned
              const isPlanRestDay = !pd && !!plan                   // explicit plan rest
              const workoutDone = w && !isRM

              // Cell variant class
              let cellClass = styles.cell
              if (!inMonth)                              cellClass = styles.cellOut
              else if (isToday && isSel)                 cellClass = styles.cellTodaySel
              else if (isToday)                          cellClass = styles.cellToday
              else if (isSel)                            cellClass = styles.cellSel
              else if (w?.session_type === 'missed')     cellClass = styles.cellMissed
              else if (isPlanned)                        cellClass = styles.cellMissed  // planned+past+no log = missed
              else if (isRM)                             cellClass = styles.cellRest
              else if (isPlanRestDay && !isFut)          cellClass = styles.cellPlanRest
              else if (workoutDone)                      cellClass = styles.cellDone
              else if (isScheduled)                      cellClass = styles.cellScheduled

              const nutStatus = deriveNutStatus(n, plan?.nutrition_targets)

              return (
                <div key={iso} onClick={() => setSelected(iso)} className={cellClass}>
                  <span className={styles.dayNum}>{day.date()}</span>

                  {/* Workout tag */}
                  {workoutDone && (
                    <span className={styles.wTag}>
                      {(w.session_type ?? 'W').slice(0, 4)}
                    </span>
                  )}
                  {w?.session_type === 'missed' && <span className={styles.missedTag}>Missed</span>}
                  {isRM && w?.session_type === 'rest' && <span className={styles.restTag}>Rest</span>}
                  {isPlanRestDay && !isFut && !w && <span className={styles.autoRestTag}>Rest</span>}
                  {isScheduled && (
                    <span className={styles.scheduledTag}>
                      {(pd.session_type ?? pd.day_name ?? 'Plan').slice(0, 4)}
                    </span>
                  )}

                  {/* Nutrition dot */}
                  {!isFut && (
                    <span className={`${styles.nutDot} ${
                      nutStatus === 'hit'      ? styles.nutDotOk       :
                      nutStatus === 'exceeded' ? styles.nutDotExceeded :
                      nutStatus === 'partial'  ? styles.nutDotPartial  :
                      nutStatus === 'off'      ? styles.nutDotOff      :
                      nutStatus === 'missed'   ? styles.nutDotMissed   :
                      styles.nutDotEmpty
                    }`} />
                  )}

                  {/* Streak indicator */}
                  {streakDates.has(iso) && (
                    <span className={styles.streakDot} title="Streak day — target hit" />
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className={styles.legend}>
            <div className={styles.legendGroup}>
              <span className={styles.lgDone}>■ Trained</span>
              <span className={styles.lgScheduled}>■ Scheduled</span>
              <span className={styles.lgMissed}>■ Missed</span>
              <span className={styles.lgRest}>■ Rest (logged)</span>
              <span className={styles.lgPlanRest}>■ Rest (plan)</span>
            </div>
            <div className={styles.legendGroup}>
              <span className={styles.lgNutOk}>● Nutrition on target</span>
              <span className={styles.lgNutPartial}>● Partial</span>
              <span className={styles.lgNutMissed}>● Missed</span>
              <span className={styles.lgStreak}>✦ Streak day</span>
            </div>
          </div>
        </div>

        {/* ── DETAIL PANEL ── */}
        <div className={styles.detail}>
          {!selected ? (
            <div className={styles.emptyDetail}>
              <span className={styles.emptyIcon}>📅</span>
              <span className={styles.emptyTitle}>Select a day</span>
              <span className={styles.emptySub}>Click any day on the calendar to see its details</span>
            </div>
          ) : (
            <>
              {/* Date header */}
              <div className={styles.detailDate}>
                <span className={styles.detailDateText}>
                  {dayjs(selected).format('dddd, MMMM D')}
                </span>
                {selected === today && <span className={styles.todayTag}>Today</span>}
                {isFuture && <span className={styles.futureTag}>Upcoming</span>}
              </div>

              {/* ── PLAN section ── */}
              <div className={styles.detailSection}>
                <div className={styles.detailLabelRow}>
                  <span className={styles.detailLabel}>Plan</span>
                  {selPlanDay && (
                    <button className={styles.detailBtn} onClick={workoutModals.openPlanDetail}>
                      Full plan →
                    </button>
                  )}
                </div>
                {selPlanDay ? (
                  <div className={styles.detailCard}>
                    <div className={styles.detailCardType}>
                      {selPlanDay.session_type ?? selPlanDay.day_name ?? 'Training'}
                    </div>
                    {selPlanDay.exercises?.length > 0 && (
                      <div className={styles.planExList}>
                        {selPlanDay.exercises
                          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                          .map((ex, i) => (
                            <div key={i} className={styles.planExRow}>
                              <span className={styles.planExName}>{ex.exercise}</span>
                              <span className={styles.planExDetail}>
                                {ex.sets ?? '?'} × {ex.reps ?? '?'}
                                {ex.rir != null ? ` · ${ex.rir} RiR` : ''}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.noDataCard}>
                    {plan
                      ? <><span className={styles.noDataIcon}>○</span> Rest day — no session planned</>
                      : <><span className={styles.noDataIcon}>💬</span> No plan — ask Fahim to build one</>}
                  </div>
                )}
              </div>

              {/* ── WORKOUT section ── */}
              <div className={styles.detailSection}>
                <div className={styles.detailLabelRow}>
                  <span className={styles.detailLabel}>Workout</span>
                  <div className={styles.detailActions}>
                    {selWorkout && (
                      <>
                        <button className={styles.detailBtn} onClick={workoutModals.openEdit}>Edit</button>
                        {!isRestOrMissed(selWorkout) && (
                          <button className={styles.detailBtn} onClick={workoutModals.openDetail}>Details →</button>
                        )}
                      </>
                    )}
                    {canLogW && (
                      <button className={`${styles.detailBtn} ${styles.detailBtnPrimary}`}
                        onClick={workoutModals.openLog}>
                        + Log
                      </button>
                    )}
                  </div>
                </div>

                {selWorkout ? (
                  isRestOrMissed(selWorkout) ? (
                    <div className={selWorkout.session_type === 'missed' ? styles.missedCard : styles.restCard}>
                      <span>{selWorkout.session_type === 'rest' ? '○ Rest day' : '✗ Missed session'}</span>
                    </div>
                  ) : (
                    <div className={styles.detailCard}>
                      <div className={styles.detailCardType}>{selWorkout.session_type ?? 'Session'}</div>
                      <div className={styles.detailMetaRow}>
                        {selWorkout.duration_min && (
                          <span className={styles.detailMeta}>{selWorkout.duration_min} min</span>
                        )}
                        {selWorkout.perceived_effort && (
                          <span className={styles.detailMeta}>RPE {selWorkout.perceived_effort}/10</span>
                        )}
                      </div>
                      {selWorkout.sets?.filter(s => !s.is_warmup).length > 0 && (
                        <div className={styles.setsPreview}>
                          {groupSetsByExercise(selWorkout.sets.filter(s => !s.is_warmup)).slice(0, 5).map(({ key, name, sets }) => {
                            const top = sets.reduce((b, s) => (s.weight_kg ?? 0) > (b.weight_kg ?? 0) ? s : b, sets[0])
                            return (
                              <div key={key} className={styles.setPreviewRow}>
                                <span className={styles.setEx}>{name}</span>
                                <span className={styles.setVal}>
                                  {sets.length} × {top.reps ?? '—'}{top.weight_kg ? ` @ ${top.weight_kg}kg` : ' BW'}
                                </span>
                              </div>
                            )
                          })}
                          {selWorkout.sets.filter(s => !s.is_warmup).length > 5 && (
                            <span className={styles.moreSets}>
                              +{selWorkout.sets.filter(s => !s.is_warmup).length - 5} more exercises
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className={styles.noDataCard}>
                    {isFuture
                      ? <><span className={styles.noDataIcon}>○</span> Not logged yet — future date</>
                      : canLogW
                        ? <><span className={styles.noDataIcon}>○</span> Not logged — tap + Log to record</>
                        : <><span className={styles.noDataIcon}>○</span> Not logged</>
                    }
                  </div>
                )}
              </div>

              {/* ── NUTRITION section ── */}
              <div className={styles.detailSection}>
                <div className={styles.detailLabelRow}>
                  <span className={styles.detailLabel}>Nutrition</span>
                  <div className={styles.detailActions}>
                    {(selNutrition?.calories || selNutrition?.notes === '__MISSED__') && (
                      <>
                        <button className={styles.detailBtn} onClick={nutritionModals.openEdit}>Edit</button>
                        {selNutrition?.calories && (
                          <button className={styles.detailBtn} onClick={nutritionModals.openDetail}>Details →</button>
                        )}
                      </>
                    )}
                    {canLogN && (
                      <>
                      <button className={styles.detailBtn}
                        onClick={nutritionModals.openMeals}>
                        From recipe
                      </button>
                      <button className={`${styles.detailBtn} ${styles.detailBtnPrimary}`}
                        onClick={nutritionModals.openLog}>
                        + Log
                      </button>
                    </>
                  )}
                  </div>
                </div>

                {selNutrition?.notes === '__MISSED__' ? (
                  <div className={styles.missedCard}>✗ Nutrition missed</div>
                ) : selNutrition?.calories ? (
                  <div className={styles.detailCard}>
                    {(() => {
                      const st = deriveNutStatus(selNutrition, plan?.nutrition_targets)
                      const STATUS_LABEL = { hit: 'On target', exceeded: 'Exceeded', partial: 'Partial', off: 'Off plan', missed: 'Missed' }
                      const STATUS_CLS   = { hit: styles.nutTagHit, exceeded: styles.nutTagExceeded, partial: styles.nutTagPartial, off: styles.nutTagOff, missed: styles.nutTagMissed }
                      return st ? <span className={`${styles.nutTag} ${STATUS_CLS[st]}`}>{STATUS_LABEL[st]}</span> : null
                    })()}
                    <div className={styles.nutDetailGrid}>
                      {[
                        { k: 'Calories', v: selNutrition.calories,   u: 'kcal', t: plan?.nutrition_targets?.calories   },
                        { k: 'Protein',  v: selNutrition.protein_g,  u: 'g',    t: plan?.nutrition_targets?.protein_g  },
                        { k: 'Carbs',    v: selNutrition.carbs_g,    u: 'g',    t: plan?.nutrition_targets?.carbs_g    },
                        { k: 'Fat',      v: selNutrition.fat_g,      u: 'g',    t: plan?.nutrition_targets?.fat_g      },
                      ].filter(r => r.v != null).map(r => (
                        <div key={r.k} className={styles.nutDetailRow}>
                          <span className={styles.nutDetailKey}>{r.k}</span>
                          <span className={styles.nutDetailVal}>
                            {r.v}{r.u}
                            {r.t && <span className={styles.nutDetailTarget}> / {r.t}{r.u}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={styles.noDataCard}>
                    {isFuture
                      ? <><span className={styles.noDataIcon}>○</span> Not logged yet — future date</>
                      : canLogN
                        ? <><span className={styles.noDataIcon}>○</span> Not logged — tap + Log to record</>
                        : <><span className={styles.noDataIcon}>○</span> Not logged</>
                    }
                  </div>
                )}
              </div>

              {/* Coach note */}
              {selSummary?.coach_note && (
                <div className={styles.detailSection}>
                  <div className={styles.detailLabel}>Coach note</div>
                  <div className={styles.coachNote}>{selSummary.coach_note}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {workoutModals.Modals()}
      {nutritionModals.Modals()}
    </div>
  )
}

function WeekStat({ icon, value, status }) {
  return (
    <div className={`${styles.weekStat} ${styles[`weekStat_${status}`]}`}>
      <span className={styles.weekStatIcon}>{icon}</span>
      <span className={styles.weekStatVal}>{value}</span>
    </div>
  )
}