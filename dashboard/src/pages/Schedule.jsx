import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { getWorkouts, getNutrition, getSummaries, getPlan } from '../lib/api'
import { useStatus } from '../lib/StatusContext'
import { useWorkoutModals, getPlanDayForDate } from '../lib/WorkoutModals'
import { useNutritionModals, deriveNutStatus } from '../lib/NutritionModals'
import SectionDivider from '../components/ui/SectionDivider'
import dayjs from 'dayjs'
import styles from './Schedule.module.css'

const isRestOrMissed = (w) => w?.session_type === 'rest' || w?.session_type === 'missed'

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

  // ── streak chain dates — only HIT-status days count, missed/partial/off all break the chain ──
  const streakDates = (() => {
    const set = new Set()
    if (!workouts || !nutrition) return set
    const DAY_MAP = { sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6,sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6 }
    const isPlanRest = (iso) => {
      if (!plan?.days?.length) return false
      const dow = dayjs(iso).day()
      return !plan.days.find(d => DAY_MAP[d.day_name?.toLowerCase()] === dow)
    }
    let d = dayjs()
    for (let i = 0; i < 120; i++) {
      const iso = d.format('YYYY-MM-DD')
      const isRest = isPlanRest(iso)
      const n = nutritionMap[iso]
      const nutStatus = deriveNutStatus(n, plan?.nutrition_targets)
      const nutHit = nutStatus === 'hit'
      const w = workoutMap[iso]

      // i===0 (today) gets a pass ONLY if NOTHING has been logged yet today.
      // An explicit 'missed' nutrition or workout entry for today is a
      // completed, deliberate failure and breaks the streak immediately.
      const todayUntouched = i === 0 && nutStatus == null && !w

      if (isRest) {
        // Rest day counts only if nutrition status is exactly 'hit'
        if (nutHit) { set.add(iso); d = d.subtract(1,'day'); continue }
        if (todayUntouched) { d = d.subtract(1,'day'); continue } // today not started yet
        break
      }

      const workoutDone = !!(w && w.session_type !== 'missed' && w.session_type !== 'rest')

      if (workoutDone && nutHit) { set.add(iso); d = d.subtract(1,'day') }
      else if (todayUntouched)   { d = d.subtract(1,'day'); continue }
      else                        { break }
    }
    return set
  })()

  const gridStart = cursor.startOf('month').startOf('week')
  const days = Array.from({ length:42 }, (_,i) => gridStart.add(i,'day'))

  const prevMonth = () => setCursor(c => c.subtract(1,'month'))
  const nextMonth = () => setCursor(c => c.add(1,'month'))
  const goToday   = () => { setCursor(dayjs().startOf('month')); setSelected(today) }

  const selWorkout   = selected ? workoutMap[selected]   : null
  const selNutrition = selected ? nutritionMap[selected] : null
  const selSummary   = selected ? summaryMap[selected]   : null
  const selPlanDay   = selected ? getPlanDayForDate(plan, selected) : null
  const isPast       = selected ? selected <= today : false
  const canLogW      = isPast && !selWorkout
  const canLogN      = isPast && !selNutrition?.calories && selNutrition?.notes !== '__MISSED__'

  const onSaved = () => { refetchWorkouts(); refetchNutrition(); refreshStatus() }

  // ── shared modal hooks — re-keyed on `selected` so edit always opens with that day's data ──
  const workoutModals = useWorkoutModals({ plan, selDate: selected, selWorkout, onSaved })
  const nutritionModals = useNutritionModals({ selDate: selected, selNutrition, plan, onSaved })

  return (
    <div className={styles.wrap}>

      {/* HEADER */}
      <div className={styles.calHeader}>
        <div className={styles.calNav}>
          <button className="btn-ghost" style={{padding:'5px 14px'}} onClick={prevMonth}>← prev</button>
          <span className={styles.monthLabel}>{cursor.format('MMMM YYYY').toUpperCase()}</span>
          <button className="btn-ghost" style={{padding:'5px 14px'}} onClick={nextMonth}>next →</button>
        </div>
        <div className={styles.headerRight}>
          {plan?.name && <span className={styles.planBadge}><span className={styles.planDot}/>{plan.name}</span>}
          <button className="btn-ghost" style={{padding:'5px 14px'}} onClick={goToday}>TODAY</button>
        </div>
      </div>

      <SectionDivider label={`SCHEDULE.${cursor.format('YYYY_MM')}`} />

      <div className={styles.layout}>

        {/* ── CALENDAR ── */}
        <div className={styles.calWrap}>
          <div className={styles.dowRow}>
            {['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d =>
              <div key={d} className={styles.dowCell}>{d}</div>
            )}
          </div>
          <div className={styles.grid}>
            {days.map(day => {
              const iso      = day.format('YYYY-MM-DD')
              const inMonth  = day.month() === cursor.month()
              const isToday  = iso === today
              const isSel    = iso === selected
              const w        = workoutMap[iso]
              const n        = nutritionMap[iso]
              const pd       = getPlanDayForDate(plan, iso)
              const isPlanned   = !!pd && !w && iso >= today
              const isRM        = w && isRestOrMissed(w)
              const isAutoRest  = !w && plan && !pd

              return (
                <div key={iso}
                  onClick={() => setSelected(iso)}
                  className={[
                    styles.cell,
                    !inMonth    ? styles.outMonth     : '',
                    isToday     ? styles.todayCell    : '',
                    isSel       ? styles.selectedCell : '',
                    isRM && w?.session_type === 'missed' ? styles.missedCell : '',
                    (isRM && w?.session_type !== 'missed') || isAutoRest ? styles.restCell : '',
                  ].join(' ')}
                >
                  <span className={styles.dayNum}>{day.date()}</span>
                  {w && !isRM && <span className={styles.wTag}>{(w.session_type??'W').toUpperCase().slice(0,4)}</span>}
                  {isRM && w?.session_type === 'missed' && <span className={styles.missedTag}>MISSED</span>}
                  {isRM && w?.session_type !== 'missed' && <span className={styles.restTag}>REST</span>}
                  {isAutoRest && <span className={styles.autoRestTag}>REST</span>}
                  {isPlanned  && <span className={styles.plannedTag}>{(pd.session_type??pd.day_name??'plan').toUpperCase().slice(0,4)}</span>}
                  {(n?.calories || n?.notes === '__MISSED__') && (() => {
                    const st = deriveNutStatus(n, plan?.nutrition_targets)
                    const map = {
                      hit:     { cls: styles.nutCellHit,    lbl: 'HIT'  },
                      partial: { cls: styles.nutCellPartial, lbl: 'PART' },
                      off:     { cls: styles.nutCellOff,    lbl: 'OFF'  },
                      missed:  { cls: styles.nutCellMissed, lbl: 'MISS' },
                    }
                    const { cls, lbl } = map[st] ?? map['partial']
                    return <span className={cls}>{lbl}</span>
                  })()}
                  {streakDates.has(iso) && (
                    <span className={styles.streakDot} title="streak ✓ — target hit">●</span>
                  )}
                </div>
              )
            })}
          </div>
          <div className={styles.legend}>
            <span className={styles.lgDone}>■ workout</span>
            <span className={styles.lgPlanned}>■ planned</span>
            <span className={styles.lgRest}>■ rest</span>
            <span className={styles.lgMissed}>■ missed</span>
            <span className={styles.lgNutHit}>■ nutrition hit</span>
            <span className={styles.lgNutPartial}>■ partial</span>
            <span className={styles.lgStreak}>● target hit (streak)</span>
          </div>
        </div>

        {/* ── DETAIL PANEL ── */}
        <div className={styles.detail}>
          {!selected ? (
            <div className={styles.emptyDetail}>
              <span className={styles.emptyMono}>SELECT_DAY →</span>
              <span className={styles.emptySub}>click a day to see details</span>
            </div>
          ) : (
            <>
              <div className={styles.detailDate}>
                {dayjs(selected).format('dddd, MMMM D YYYY').toUpperCase()}
                {selected === today && <span className={styles.todayTag}> · TODAY</span>}
              </div>

              {/* PLAN */}
              <div className={styles.detailSection}>
                <div className={styles.detailLabelRow}>
                  <span className={styles.detailLabel}>PLAN.day</span>
                  {selPlanDay && (
                    <button className={styles.detailBtn} onClick={workoutModals.openPlanDetail}>details →</button>
                  )}
                </div>
                {selPlanDay ? (
                  <div className={styles.detailCard}>
                    <div className={styles.detailRow}>
                      <span className={styles.dk}>session</span>
                      <span className={styles.dv}>{selPlanDay.session_type ?? selPlanDay.day_name}</span>
                    </div>
                    {selPlanDay.exercises?.length > 0 && (
                      <div className={styles.planExList}>
                        {selPlanDay.exercises
                          .sort((a,b) => (a.order_index??0)-(b.order_index??0))
                          .map((ex,i) => (
                            <div key={i} className={styles.planExRow}>
                              <span className={styles.planExName}>{ex.exercise}</span>
                              <span className={styles.planExDetail}>
                                {ex.sets??'?'}×{ex.reps??'?'}{ex.rir!=null?` @${ex.rir}RiR`:''}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.noData}>
                    {plan ? 'REST_DAY · no session planned' : 'NO_PLAN · ask Fahim to build one'}
                  </div>
                )}
              </div>

              {/* WORKOUT */}
              <div className={styles.detailSection}>
                <div className={styles.detailLabelRow}>
                  <span className={styles.detailLabel}>WORKOUT.logged</span>
                  <div style={{display:'flex',gap:6}}>
                    {selWorkout && (
                      <>
                        <button className={styles.detailBtn} onClick={workoutModals.openEdit}>edit</button>
                        {!isRestOrMissed(selWorkout) && (
                          <button className={styles.detailBtn} onClick={workoutModals.openDetail}>details →</button>
                        )}
                      </>
                    )}
                    {canLogW && (
                      <button style={{padding:'3px 10px',fontSize:10}} onClick={workoutModals.openLog}>+ LOG</button>
                    )}
                  </div>
                </div>
                {selWorkout ? (
                  isRestOrMissed(selWorkout) ? (
                    <div className={selWorkout.session_type === 'missed' ? styles.missedCard : styles.restCard}>
                      <span className={styles.restIcon}>{selWorkout.session_type==='rest'?'○':'✗'}</span>
                      <span className={styles.restCardLabel}>{selWorkout.session_type==='rest'?'Rest day':'Missed session'}</span>
                    </div>
                  ) : (
                    <div className={styles.detailCard}>
                      <div className={styles.detailRow}>
                        <span className={styles.dk}>type</span>
                        <span className={styles.dv}>{selWorkout.session_type??'—'}</span>
                      </div>
                      <div className={styles.detailRow}>
                        <span className={styles.dk}>duration</span>
                        <span className={styles.dv}>{selWorkout.duration_min?`${selWorkout.duration_min} min`:'—'}</span>
                      </div>
                      <div className={styles.detailRow}>
                        <span className={styles.dk}>effort</span>
                        <span className={styles.dv}>{selWorkout.perceived_effort?`${selWorkout.perceived_effort}/10`:'—'}</span>
                      </div>
                      {selWorkout.sets?.filter(s=>!s.is_warmup).length > 0 && (
                        <div className={styles.setsPreview}>
                          {selWorkout.sets.filter(s=>!s.is_warmup).slice(0,5).map((s,i)=>(
                            <div key={i} className={styles.setPreviewRow}>
                              <span className={styles.setEx}>{s.exercise}</span>
                              <span className={styles.setVal}>{s.reps??'—'}×{s.weight_kg?`${s.weight_kg}kg`:'BW'}{s.rpe?` @${s.rpe}`:''}</span>
                            </div>
                          ))}
                          {selWorkout.sets.filter(s=>!s.is_warmup).length > 5 && (
                            <span className={styles.moreSets}>+{selWorkout.sets.filter(s=>!s.is_warmup).length-5} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className={styles.noData}>
                    {isPast ? 'NOT_LOGGED · tap LOG to record' : 'UPCOMING'}
                  </div>
                )}
              </div>

              {/* NUTRITION */}
              <div className={styles.detailSection}>
                <div className={styles.detailLabelRow}>
                  <span className={styles.detailLabel}>NUTRITION.logged</span>
                  <div style={{display:'flex',gap:6}}>
                    {(selNutrition?.calories || selNutrition?.notes === '__MISSED__') && (
                      <>
                        <button className={styles.detailBtn} onClick={nutritionModals.openEdit}>edit</button>
                        {selNutrition?.calories && (
                          <button className={styles.detailBtn} onClick={nutritionModals.openDetail}>details →</button>
                        )}
                      </>
                    )}
                    {canLogN && (
                      <button style={{padding:'3px 10px',fontSize:10}} onClick={nutritionModals.openLog}>+ LOG</button>
                    )}
                  </div>
                </div>
                {selNutrition?.notes === '__MISSED__' ? (
                  <div className={styles.missedCard}>
                    <span className={styles.restIcon}>✗</span>
                    <span className={styles.restCardLabel}>Nutrition missed</span>
                  </div>
                ) : selNutrition?.calories ? (
                  <div className={styles.detailCard}>
                    {[
                      {k:'calories',v:selNutrition.calories,u:'kcal'},
                      {k:'protein', v:selNutrition.protein_g,u:'g'},
                      {k:'carbs',   v:selNutrition.carbs_g,u:'g'},
                      {k:'fat',     v:selNutrition.fat_g,u:'g'},
                      {k:'water',   v:selNutrition.water_ml!=null?+(selNutrition.water_ml/1000).toFixed(2):null,u:'L'},
                    ].filter(r=>r.v!=null).map(r=>(
                      <div key={r.k} className={styles.detailRow}>
                        <span className={styles.dk}>{r.k}</span>
                        <span className={styles.dv}>{r.v}{r.u}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.noData}>NOT_LOGGED{isPast?' · tap LOG':''}</div>
                )}
              </div>

              {selSummary?.coach_note && (
                <div className={styles.detailSection}>
                  <div className={styles.detailLabel}>COACH_NOTE</div>
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