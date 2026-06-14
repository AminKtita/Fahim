import { useState, useCallback } from 'react'
import { useApi } from '../hooks/useApi'
import {
  getWorkouts, getNutrition, getSummaries, getPlan,
  logWorkout, updateWorkout, deleteWorkout,
  logNutrition, updateNutrition, deleteNutrition,
} from '../lib/api'
import { useStatus, computeStreak } from '../lib/StatusContext'
import { useWorkoutModals, getPlanDayForDate as getPlanDay } from '../lib/WorkoutModals'
import { useNutritionModals, deriveNutStatus as deriveStatus } from '../lib/NutritionModals'
import SectionDivider from '../components/ui/SectionDivider'
import dayjs from 'dayjs'
import styles from './Schedule.module.css'

// ── helpers ───────────────────────────────────────────────
const DAY_NAME_MAP = {
  sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6,
  sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6,
}
function getPlanDayForDate(plan, date) {
  if (!plan?.days?.length) return null
  const dow = dayjs(date).day()
  return plan.days.find(d => DAY_NAME_MAP[d.day_name?.toLowerCase()] === dow) ?? null
}

// Extract max reps from a range string like "8-10" → 10, or "12" → 12
function parseMaxReps(repsStr) {
  if (!repsStr) return ''
  const s = String(repsStr)
  const range = s.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (range) return range[2]          // return the max
  const single = s.match(/\d+/)
  return single ? single[0] : ''
}

function buildPrefilledSets(planDay) {
  if (!planDay?.exercises?.length) return [blankSet()]
  return planDay.exercises
    .sort((a,b) => (a.order_index??0)-(b.order_index??0))
    .map(ex => ({
      exercise:  ex.exercise ?? '',
      sets:      ex.sets ?? 1,
      reps:      parseMaxReps(ex.reps),
      weight_kg: '',
      rpe:       '',
      is_warmup: false,
    }))
}

const blankSet = () => ({ exercise:'', sets:1, reps:'', weight_kg:'', rpe:'', is_warmup:false })

const SESSION_TYPES = ['push','pull','legs','upper','lower','full_body','cardio','general']

const positiveNum = (v) => { const n = Number(v); return (!v || n > 0) ? v : '' }

// ── nutrition status — derived from numbers vs plan targets ──
// Returns 'hit' | 'partial' | 'off' | null
function deriveNutStatus(n, targets) {
  if (!n) return null
  // Explicit missed flag (stored as __MISSED__ in notes when no numbers logged)
  if (n.notes === '__MISSED__' || n.missed) return 'missed'
  const hasAny = n.calories || n.protein_g || n.carbs_g || n.fat_g
  if (!hasAny) return null

  if (!targets || !targets.calories) {
    // No plan targets: evaluate by completeness
    const filled = [n.calories, n.protein_g, n.carbs_g, n.fat_g].filter(v => v != null && v > 0).length
    if (filled === 4) return 'hit'
    if (filled > 0)   return 'partial'
    return 'off'
  }

  // With plan targets — three-tier thresholds:
  // HIT     ≥ 95% on calories + protein, ≥ 90% on carbs/fat, all 4 filled
  // PARTIAL ≥ 70% on calories (close-ish), or missing some macros
  // OFF     calories logged but < 70% of target
  // MISSED  calories < 40% of target (clearly didn't follow plan at all)
  const cal = n.calories ?? 0
  const prot = n.protein_g ?? 0
  const tCal = targets.calories ?? 0
  const tProt = targets.protein_g ?? 0

  if (tCal > 0 && cal < tCal * 0.40) return 'missed'

  const calOk  = tCal  > 0 ? cal  >= tCal  * 0.95 : true
  const protOk = tProt > 0 ? prot >= tProt * 0.95 : true
  const carbOk = targets.carbs_g > 0 ? (n.carbs_g ?? 0) >= targets.carbs_g * 0.90 : true
  const fatOk  = targets.fat_g   > 0 ? (n.fat_g   ?? 0) >= targets.fat_g   * 0.85 : true
  const filled = [n.calories, n.protein_g, n.carbs_g, n.fat_g].filter(v => v != null && v > 0).length

  if (calOk && protOk && carbOk && fatOk && filled === 4) return 'hit'
  if (tCal > 0 && cal < tCal * 0.70) return 'off'
  return 'partial'
}

// ── Modal types ───────────────────────────────────────────
// null | 'workout' | 'nutrition' | 'workoutDetail' | 'nutritionDetail' | 'planDetail'

export default function Schedule() {
  const [cursor,   setCursor]   = useState(dayjs().startOf('month'))
  const [selected, setSelected] = useState(dayjs().format('YYYY-MM-DD'))
  const [modal,    setModal]    = useState(null)

  const { refresh: refreshStatus } = useStatus()
  const { data: workouts,  refetch: refetchWorkouts }  = useApi(() => getWorkouts(120))
  const { data: nutrition, refetch: refetchNutrition } = useApi(() => getNutrition(120))
  const { data: summaries }  = useApi(() => getSummaries(120))
  const { data: plan }       = useApi(getPlan)

  const today = dayjs().format('YYYY-MM-DD')

  const workoutMap   = {}; workouts?.forEach(w  => { workoutMap[w.date]   = w })
  const nutritionMap = {}; nutrition?.forEach(n => { nutritionMap[n.date] = n })
  const summaryMap   = {}; summaries?.forEach(s => { summaryMap[s.date]   = s })

  // Build the set of dates that are part of the current streak chain
  // Walk back from today the same way computeStreak does, collect each qualifying date
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
      if (isRest) {
        // rest day: check nutrition hit
        const n = nutritionMap[iso]
        const nutHit = !!(n && n.notes !== '__MISSED__' && n.calories > 0)
        if (nutHit) { set.add(iso); d = d.subtract(1,'day'); continue }
        // rest day with no nutrition logged yet (today/future) — allow skip once
        if (i === 0) { d = d.subtract(1,'day'); continue }
        break
      }
      const w = workoutMap[iso]
      const n = nutritionMap[iso]
      const workoutDone = !!(w && w.session_type !== 'missed' && w.session_type !== 'rest')
      const nutHit      = !!(n && n.notes !== '__MISSED__' && n.calories > 0)
      if (workoutDone && nutHit) { set.add(iso); d = d.subtract(1,'day') }
      else if (i === 0)          { d = d.subtract(1,'day'); continue }
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
  const isRestDay    = selPlanDay === null && !!plan  // plan exists but no session this day
  const canLogW      = isPast && !selWorkout
  const canLogN      = isPast && !selNutrition?.calories && selNutrition?.notes !== '__MISSED__'

  const isRestOrMissed = (w) => w?.session_type === 'rest' || w?.session_type === 'missed'

  // ─────────────────────────────────────────────────────────
  // WORKOUT MODAL STATE
  // ─────────────────────────────────────────────────────────
  const [dayStatus,  setDayStatus]  = useState('workout')
  const [wForm,      setWForm]      = useState({})
  const [sets,       setSets]       = useState([])
  const [wSaving,    setWSaving]    = useState(false)
  const [wError,     setWError]     = useState(null)
  const [editWorkoutId, setEditWorkoutId] = useState(null)
  const [confirmDeleteW, setConfirmDeleteW] = useState(false)

  const openWorkoutModal = (forEdit = false) => {
    const w  = workoutMap[selected]
    const pd = getPlanDayForDate(plan, selected)
    if (forEdit && w) {
      setEditWorkoutId(w.id)
      setDayStatus(isRestOrMissed(w) ? w.session_type : 'workout')
      setWForm({
        date:             w.date,
        session_type:     w.session_type ?? 'general',
        duration_min:     w.duration_min ?? '',
        perceived_effort: w.perceived_effort ?? '',
        notes:            w.notes ?? '',
      })
      // When editing an existing logged workout, group by exercise to rebuild the sets-per-exercise view
      const grouped = []
      const seen = {}
      ;(w.sets ?? []).forEach(s => {
        if (!seen[s.exercise]) {
          seen[s.exercise] = { exercise: s.exercise, sets: 0, reps: s.reps ?? '', weight_kg: s.weight_kg ?? '', rpe: s.rpe ?? '', is_warmup: s.is_warmup ?? false }
          grouped.push(seen[s.exercise])
        }
        seen[s.exercise].sets += 1
      })
      setSets(grouped.length ? grouped : [blankSet()])
    } else {
      setEditWorkoutId(null)
      setDayStatus('workout')
      setWForm({
        date:             selected,
        session_type:     pd?.session_type ?? 'general',
        duration_min:     '',
        perceived_effort: '',
        notes:            '',
      })
      setSets(buildPrefilledSets(pd))
    }
    setWError(null)
    setConfirmDeleteW(false)
    setModal('workout')
  }

  const setWF = (k,v) => setWForm(f => ({ ...f, [k]:v }))
  const setS  = (i,k,v) => setSets(prev => prev.map((s,idx) => idx===i ? { ...s,[k]:v } : s))
  const addSet    = () => setSets(prev => [...prev, blankSet()])
  const removeSet = (i) => setSets(prev => prev.filter((_,idx) => idx!==i))

  const handleWorkoutSubmit = async () => {
    setWError(null)
    const isRM = dayStatus === 'rest' || dayStatus === 'missed'
    // Validate required fields for actual workout (not rest/missed)
    if (!isRM) {
      if (!wForm.duration_min)     { setWError('Duration is required.'); return }
      if (!wForm.perceived_effort) { setWError('Effort rating is required.'); return }
      if (sets.length === 0)       { setWError('Add at least one exercise.'); return }
      for (let i = 0; i < sets.length; i++) {
        const s = sets[i]
        if (!s.exercise?.trim()) { setWError(`Row ${i+1}: exercise name is required.`); return }
        if (!s.sets || Number(s.sets) < 1) { setWError(`Row ${i+1}: sets count is required.`); return }
        if (!s.reps || Number(s.reps) < 1) { setWError(`Row ${i+1}: reps is required.`); return }
        if (!s.weight_kg && s.weight_kg !== 0) { setWError(`Row ${i+1}: weight is required (enter 0 for bodyweight).`); return }
      }
    }
    setWSaving(true)
    try {
      const isRM = dayStatus === 'rest' || dayStatus === 'missed'
      const payload = isRM
        ? { date: selected, session_type: dayStatus, duration_min: null, perceived_effort: null,
            notes: dayStatus === 'rest' ? 'Rest day' : 'Missed session', sets: [] }
        : {
            ...wForm,
            duration_min:     wForm.duration_min     ? Number(wForm.duration_min)     : null,
            perceived_effort: wForm.perceived_effort ? Number(wForm.perceived_effort) : null,
            sets: sets.filter(s => s.exercise).flatMap((s, exIdx) => {
              const count = Number(s.sets) || 1
              return Array.from({ length: count }, (_, k) => ({
                exercise:   s.exercise,
                set_number: exIdx * 10 + k + 1,
                reps:       s.reps      ? Number(s.reps)      : null,
                weight_kg:  s.weight_kg ? Number(s.weight_kg) : null,
                rpe:        s.rpe       ? Number(s.rpe)       : null,
                is_warmup:  s.is_warmup ?? false,
              }))
            }),
          }
      if (editWorkoutId) {
        await updateWorkout(editWorkoutId, payload)
      } else {
        await logWorkout(payload)
      }
      setModal(null)
      refetchWorkouts()
      refreshStatus()
    } catch(e) {
      setWError(e.message)
    } finally {
      setWSaving(false)
    }
  }

  const handleWorkoutDelete = async () => {
    setWSaving(true)
    try {
      await deleteWorkout(selWorkout.id)
      setModal(null)
      refetchWorkouts()
      refreshStatus()
    } catch(e) {
      setWError(e.message)
    } finally {
      setWSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────
  // NUTRITION MODAL STATE
  // ─────────────────────────────────────────────────────────
  const [nForm,      setNForm]      = useState({})
  const [nMode,      setNMode]      = useState('log')   // 'log' | 'missed'
  const [nSaving,    setNSaving]    = useState(false)
  const [nError,     setNError]     = useState(null)
  const [editNut,    setEditNut]    = useState(false)
  const [confirmDeleteN, setConfirmDeleteN] = useState(false)

  const openNutritionModal = (forEdit = false) => {
    const n = nutritionMap[selected]
    if (forEdit && n) {
      setEditNut(true)
      setNMode(n.notes === '__MISSED__' ? 'missed' : 'log')
      setNForm({
        date:      n.date,
        calories:  n.calories  ?? '',
        protein_g: n.protein_g ?? '',
        carbs_g:   n.carbs_g   ?? '',
        fat_g:     n.fat_g     ?? '',
        water_ml:  n.water_ml  ?? '',
        notes:     n.notes === '__MISSED__' ? '' : (n.notes ?? ''),
      })
    } else {
      setEditNut(false)
      setNForm({ date: selected, calories:'', protein_g:'', carbs_g:'', fat_g:'', water_ml:'', notes:'' })
    }
    setNError(null)
    setNMode('log')
    setConfirmDeleteN(false)
    setModal('nutrition')
  }

  const setNF = (k,v) => setNForm(f => ({ ...f, [k]:v }))

  const handleNutritionSubmit = async () => {
    setNError(null)
    let payload
    if (nMode === 'missed') {
      // Log a "missed" nutrition day — minimal entry with a flag in notes
      payload = { date: selected, calories: null, protein_g: null, carbs_g: null, fat_g: null, water_ml: null, notes: '__MISSED__' }
    } else {
      // Require at least calories to save a real log
      if (!nForm.calories) {
        setNError('Calories is required.')
        return
      }
      payload = {
        date:      selected,
        calories:  Number(nForm.calories),
        protein_g: nForm.protein_g ? Number(nForm.protein_g) : null,
        carbs_g:   nForm.carbs_g   ? Number(nForm.carbs_g)   : null,
        fat_g:     nForm.fat_g     ? Number(nForm.fat_g)     : null,
        water_ml:  nForm.water_ml  ? Number(nForm.water_ml)  : null,
        notes:     nForm.notes     || null,
      }
    }
    setNSaving(true)
    try {
      if (editNut) {
        await updateNutrition(selected, payload)
      } else {
        await logNutrition(payload)
      }
      setModal(null)
      refetchNutrition()
      refreshStatus()
    } catch(e) {
      setNError(e.message)
    } finally {
      setNSaving(false)
    }
  }

  const handleNutritionDelete = async () => {
    setNSaving(true)
    try {
      await deleteNutrition(selected)
      setModal(null)
      refetchNutrition()
      refreshStatus()
    } catch(e) {
      setNError(e.message)
    } finally {
      setNSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
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
              // No session logged, plan exists, no plan session for this day → auto-rest
              // Applies to BOTH past and future days
              const isAutoRest  = !w && plan && !pd

              return (
                <div key={iso}
                  onClick={() => { setSelected(iso); setModal(null) }}
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
                    <span className={styles.streakDot} title="in streak ✓">●</span>
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
            <span className={styles.lgStreak}>● workout + nutrition</span>
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
                    <button className={styles.detailBtn} onClick={() => setModal('planDetail')}>details →</button>
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
                        <button className={styles.detailBtn} onClick={() => openWorkoutModal(true)}>edit</button>
                        <button className={styles.detailBtn} onClick={() => setModal('workoutDetail')}>details →</button>
                      </>
                    )}
                    {canLogW && (
                      <button style={{padding:'3px 10px',fontSize:10}} onClick={() => openWorkoutModal(false)}>
                        + LOG
                      </button>
                    )}
                  </div>
                </div>
                {selWorkout ? (
                  isRestOrMissed(selWorkout) ? (
                    <div className={selWorkout.session_type === 'missed' ? styles.missedCard : styles.restCard}>
                      <span className={styles.restIcon}>{selWorkout.session_type==='rest'?'○':'✗'}</span>
                      <span className={styles.restCardLabel}>{selWorkout.session_type==='rest'?'Rest day':'Missed session'}</span>
                      <button className={styles.detailBtn} style={{marginLeft:'auto'}} onClick={() => openWorkoutModal(true)}>edit</button>
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
                        <button className={styles.detailBtn} onClick={() => openNutritionModal(true)}>edit</button>
                        {selNutrition?.calories && (
                          <button className={styles.detailBtn} onClick={() => setModal('nutritionDetail')}>details →</button>
                        )}
                      </>
                    )}
                    {canLogN && (
                      <button style={{padding:'3px 10px',fontSize:10}} onClick={() => openNutritionModal(false)}>
                        + LOG
                      </button>
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

      {/* ══════════════════════════════════════
          MODALS
      ══════════════════════════════════════ */}
      {modal && (
        <div className={styles.modalOverlay} onClick={e => { if(e.target===e.currentTarget) setModal(null) }}>

          {/* ── WORKOUT LOG / EDIT MODAL ── */}
          {(modal === 'workout') && (
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>
                  <span className={styles.modalLabel}>{editWorkoutId ? 'EDIT_WORKOUT' : 'LOG_WORKOUT'}</span>
                  <span className={styles.modalDate}>{dayjs(selected).format('dddd, MMMM D YYYY')}</span>
                </div>
                <button className={styles.modalClose} onClick={() => setModal(null)}>✕</button>
              </div>
              <div className={styles.modalBody}>

                {/* Planned day: WORKOUT or MISSED. Non-planned day (free/no plan): WORKOUT only. */}
                {selPlanDay && (
                  <div className={styles.statusBtns}>
                    <button
                      onClick={() => setDayStatus('workout')}
                      className={[styles.statusBtn, dayStatus==='workout' ? `${styles.statusBtnActive} ${styles.workout}` : ''].join(' ')}
                    >WORKOUT</button>
                    <button
                      onClick={() => setDayStatus('missed')}
                      className={[styles.statusBtn, dayStatus==='missed' ? `${styles.statusBtnActive} ${styles.missed}` : ''].join(' ')}
                    >MISSED</button>
                  </div>
                )}

                {dayStatus === 'workout' && (
                  <>
                    {/* plan preview */}
                    {selPlanDay?.exercises?.length > 0 && (
                      <div className={styles.modalPlanPreview}>
                        <div className={styles.modalPlanLabel}>PLAN · pre-filled below — edit weights &amp; reps as needed</div>
                        {selPlanDay.exercises.sort((a,b)=>(a.order_index??0)-(b.order_index??0)).map((ex,i)=>(
                          <div key={i} className={styles.modalPlanEx}>
                            <span className={styles.modalPlanExName}>{ex.exercise}</span>
                            <span className={styles.modalPlanExDetail}>
                              {ex.sets??'?'}×{ex.reps??'?'}{ex.rir!=null?` @${ex.rir}RiR`:''}
                              {ex.progression_rule && <span className={styles.progRule}> · {ex.progression_rule}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* session meta */}
                    <div className={styles.modalGrid2}>
                      <div className={styles.modalField}>
                        <label className={styles.modalFieldLabel}>Session type</label>
                        <select value={wForm.session_type} onChange={e => setWF('session_type',e.target.value)}>
                          {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className={styles.modalField}>
                        <label className={styles.modalFieldLabel}>Duration (min)</label>
                        <input type="number" min="0" placeholder="e.g. 70" value={wForm.duration_min}
                          onChange={e => setWF('duration_min', positiveNum(e.target.value))} />
                      </div>
                      <div className={styles.modalField}>
                        <label className={styles.modalFieldLabel}>Effort (1–10)</label>
                        <input type="number" min="1" max="10" placeholder="e.g. 8" value={wForm.perceived_effort}
                          onChange={e => {
                            const v = Number(e.target.value)
                            if (e.target.value === '') { setWF('perceived_effort', ''); return }
                            if (v >= 1 && v <= 10) setWF('perceived_effort', String(v))
                          }} />
                      </div>
                    </div>

                    {/* sets table */}
                    <div className={styles.modalSetsHeader}>
                      <span className={styles.modalSetsLabel}>SETS</span>
                      <button className="btn-ghost" style={{padding:'2px 10px',fontSize:9}} onClick={addSet}>+ SET</button>
                    </div>
                    <div className={styles.modalSetColHeaders}>
                      <span className={styles.modalSetColHead}>Exercise</span>
                      <span className={styles.modalSetColHead}>Sets</span>
                      <span className={styles.modalSetColHead}>Reps</span>
                      <span className={styles.modalSetColHead}>kg</span>
                      <span className={styles.modalSetColHead}>RPE</span>
                      <span/>
                    </div>
                    {sets.map((s,i) => (
                      <div key={i} className={styles.modalSetRow}>
                        <input placeholder="exercise" value={s.exercise}
                          onChange={e => setS(i,'exercise',e.target.value)} />
                        <input type="number" min="1" placeholder="3" value={s.sets}
                          onChange={e => setS(i,'sets',positiveNum(e.target.value))} />
                        <input type="number" min="0" placeholder="—" value={s.reps}
                          onChange={e => setS(i,'reps',positiveNum(e.target.value))} />
                        <input type="number" min="0" placeholder="—" value={s.weight_kg}
                          onChange={e => setS(i,'weight_kg',positiveNum(e.target.value))} />
                        <input type="number" min="1" max="10" placeholder="—" value={s.rpe}
                          onChange={e => setS(i,'rpe',e.target.value)} />
                        <button className="btn-ghost" style={{padding:'2px 6px',fontSize:10,borderColor:'transparent'}}
                          onClick={() => removeSet(i)}>✕</button>
                      </div>
                    ))}

                    <div className={styles.modalField} style={{marginTop:12}}>
                      <label className={styles.modalFieldLabel}>Notes</label>
                      <input type="text" placeholder="optional" value={wForm.notes}
                        onChange={e => setWF('notes',e.target.value)} />
                    </div>
                  </>
                )}

                {(dayStatus === 'rest' || dayStatus === 'missed') && (
                  <div className={styles.statusMsg}>
                    {dayStatus === 'rest' ? 'This day will be marked as a rest day.' : 'This session will be marked as missed.'}
                  </div>
                )}

                <div className={styles.modalActions}>
                  {wError && <span className={styles.modalError}>{wError}</span>}
                  {editWorkoutId && !confirmDeleteW && (
                    <button className="btn-ghost" style={{color:'var(--danger)',borderColor:'transparent',marginRight:'auto'}}
                      onClick={() => setConfirmDeleteW(true)}>DELETE</button>
                  )}
                  {confirmDeleteW && (
                    <>
                      <span className={styles.confirmText}>Delete this workout?</span>
                      <button className="btn-danger" onClick={handleWorkoutDelete} disabled={wSaving}>
                        {wSaving ? '…' : 'CONFIRM DELETE'}
                      </button>
                      <button className="btn-ghost" onClick={() => setConfirmDeleteW(false)}>CANCEL</button>
                    </>
                  )}
                  {!confirmDeleteW && (
                    <>
                      <button onClick={handleWorkoutSubmit} disabled={wSaving}>
                        {wSaving ? 'SAVING…'
                          : dayStatus==='rest'   ? 'MARK REST →'
                          : dayStatus==='missed' ? 'MARK MISSED →'
                          : editWorkoutId        ? 'SAVE CHANGES →'
                          : 'SAVE WORKOUT →'}
                      </button>
                      <button className="btn-ghost" onClick={() => setModal(null)}>CANCEL</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── WORKOUT DETAIL POPUP ── */}
          {modal === 'workoutDetail' && selWorkout && (
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>
                  <span className={styles.modalLabel}>WORKOUT.detail</span>
                  <span className={styles.modalDate}>{dayjs(selected).format('dddd, MMMM D YYYY')}</span>
                </div>
                <button className={styles.modalClose} onClick={() => setModal(null)}>✕</button>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.detailGrid}>
                  {[
                    {k:'Session type', v:selWorkout.session_type??'—'},
                    {k:'Duration',     v:selWorkout.duration_min?`${selWorkout.duration_min} min`:'—'},
                    {k:'Effort',       v:selWorkout.perceived_effort?`${selWorkout.perceived_effort}/10`:'—'},
                  ].map(r=>(
                    <div key={r.k} className={styles.detailGridRow}>
                      <span className={styles.dk}>{r.k}</span>
                      <span className={styles.dv}>{r.v}</span>
                    </div>
                  ))}
                </div>

                {selWorkout.sets?.filter(s=>!s.is_warmup).length > 0 && (
                  <>
                    <div className={styles.sectionMono}>SETS.log</div>
                    <table className={styles.setsFullTable}>
                      <thead>
                        <tr>
                          <th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th><th>RPE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // group working sets by exercise
                          const grouped = []
                          const seen = {}
                          selWorkout.sets.filter(s=>!s.is_warmup).forEach(s => {
                            if (!seen[s.exercise]) {
                              seen[s.exercise] = { exercise:s.exercise, count:0, reps:s.reps, weight_kg:s.weight_kg, rpe:s.rpe }
                              grouped.push(seen[s.exercise])
                            }
                            seen[s.exercise].count += 1
                          })
                          return grouped.map((g,i) => (
                            <tr key={i}>
                              <td style={{color:'var(--text)'}}>{g.exercise}</td>
                              <td>{g.count}</td>
                              <td>{g.reps??'—'}</td>
                              <td>{g.weight_kg!=null?`${g.weight_kg}kg`:'BW'}</td>
                              <td>{g.rpe??'—'}</td>
                            </tr>
                          ))
                        })()}
                      </tbody>
                    </table>
                  </>
                )}

                {selWorkout.notes && (
                  <div className={styles.notesBlock}>
                    <div className={styles.sectionMono}>NOTES</div>
                    <p className={styles.notesText}>{selWorkout.notes}</p>
                  </div>
                )}

                <div className={styles.modalActions}>
                  <button className="btn-ghost" onClick={() => { setModal(null); openWorkoutModal(true) }}>EDIT WORKOUT</button>
                  <button className="btn-ghost" onClick={() => setModal(null)}>CLOSE</button>
                </div>
              </div>
            </div>
          )}

          {/* ── NUTRITION LOG / EDIT MODAL ── */}
          {modal === 'nutrition' && (
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>
                  <span className={styles.modalLabel}>{editNut ? 'EDIT_NUTRITION' : 'LOG_NUTRITION'}</span>
                  <span className={styles.modalDate}>{dayjs(selected).format('dddd, MMMM D YYYY')}</span>
                </div>
                <button className={styles.modalClose} onClick={() => setModal(null)}>✕</button>
              </div>
              <div className={styles.modalBody}>

                {/* mode switcher: LOG or MISSED */}
                <div className={styles.statusBtns} style={{marginBottom:16}}>
                  <button
                    onClick={() => setNMode('log')}
                    className={[styles.statusBtn, nMode==='log' ? `${styles.statusBtnActive} ${styles.workout}` : ''].join(' ')}
                  >LOG NUTRITION</button>
                  <button
                    onClick={() => setNMode('missed')}
                    className={[styles.statusBtn, nMode==='missed' ? `${styles.statusBtnActive} ${styles.missed}` : ''].join(' ')}
                  >MISSED TODAY</button>
                </div>

                {nMode === 'missed' && (
                  <div className={styles.statusMsg} style={{marginBottom:12}}>
                    This day will be marked as a missed nutrition day. No numbers needed.
                  </div>
                )}

                {nMode === 'log' && (
                <>

                {/* plan targets reference strip */}
                {plan?.nutrition_targets && Object.keys(plan.nutrition_targets).length > 0 && (
                  <div className={styles.nutTargetsStrip}>
                    <span className={styles.nutTargetsLabel}>PLAN TARGETS →</span>
                    {[
                      {k:'calories',  u:'kcal'},
                      {k:'protein_g', u:'g'},
                      {k:'carbs_g',   u:'g'},
                      {k:'fat_g',     u:'g'},
                    ].filter(t => plan.nutrition_targets[t.k]).map(t => (
                      <span key={t.k} className={styles.nutTargetItem}>
                        {t.k.replace('_g','').replace('calories','cal')}: <strong>{plan.nutrition_targets[t.k]}{t.u}</strong>
                      </span>
                    ))}
                  </div>
                )}

                {/* numbers — calories required, rest optional */}
                <div className={styles.modalGrid2}>
                  {[
                    {k:'calories',  label:'Calories (kcal)', ph:'e.g. 2400', required:true},
                    {k:'protein_g', label:'Protein (g)',     ph:'e.g. 185'},
                    {k:'carbs_g',   label:'Carbs (g)',       ph:'e.g. 300'},
                    {k:'fat_g',     label:'Fat (g)',         ph:'e.g. 80'},
                    {k:'water_ml',  label:'Water (ml)',      ph:'e.g. 2500'},
                  ].map(f => (
                    <div key={f.k} className={styles.modalField}>
                      <label className={styles.modalFieldLabel}>
                        {f.label}{f.required && <span className={styles.requiredStar}> *</span>}
                      </label>
                      <input type="number" min="0" placeholder={f.ph} value={nForm[f.k]??''}
                        onChange={e => setNF(f.k, positiveNum(e.target.value))}
                        style={f.required && nError && !nForm[f.k] ? {borderColor:'var(--danger)'} : {}} />
                    </div>
                  ))}
                  <div className={styles.modalField}>
                    <label className={styles.modalFieldLabel}>Notes</label>
                    <input type="text" placeholder="optional" value={nForm.notes??''}
                      onChange={e => setNF('notes', e.target.value)} />
                  </div>
                </div>

                </> /* end nMode === log */
                )}

                {/* live auto-status preview — only in log mode */}
                {nMode === 'log' && (() => {
                  const preview = deriveNutStatus(
                    { calories: nForm.calories ? Number(nForm.calories) : null,
                      protein_g: nForm.protein_g ? Number(nForm.protein_g) : null,
                      carbs_g: nForm.carbs_g ? Number(nForm.carbs_g) : null,
                      fat_g: nForm.fat_g ? Number(nForm.fat_g) : null },
                    plan?.nutrition_targets
                  )
                  if (!preview) return null
                  const cfg = {
                    hit:     { label:'HIT TARGETS', cls:styles.statusHit },
                    partial: { label:'PARTIAL',      cls:styles.statusPartial },
                    off:     { label:'OFF TARGET',   cls:styles.statusOff },
                    missed:  { label:'MISSED',       cls:styles.statusMissed },
                  }
                  const c = cfg[preview] ?? cfg['partial']
                  return (
                    <div className={styles.nutStatusPreview}>
                      <span className={styles.nutStatusPreviewLabel}>AUTO STATUS →</span>
                      <span className={`${styles.nutStatusBadge} ${c.cls}`}>{c.label}</span>
                    </div>
                  )
                })()}

                <div className={styles.modalActions}>
                  {nError && <span className={styles.modalError}>{nError}</span>}
                  {editNut && !confirmDeleteN && (
                    <button className="btn-ghost" style={{color:'var(--danger)',borderColor:'transparent',marginRight:'auto'}}
                      onClick={() => setConfirmDeleteN(true)}>DELETE</button>
                  )}
                  {confirmDeleteN && (
                    <>
                      <span className={styles.confirmText}>Delete this nutrition log?</span>
                      <button className="btn-danger" onClick={handleNutritionDelete} disabled={nSaving}>
                        {nSaving ? '…' : 'CONFIRM DELETE'}
                      </button>
                      <button className="btn-ghost" onClick={() => setConfirmDeleteN(false)}>CANCEL</button>
                    </>
                  )}
                  {!confirmDeleteN && (
                    <>
                      <button onClick={handleNutritionSubmit} disabled={nSaving}>
                        {nSaving ? 'SAVING…' : editNut ? 'SAVE CHANGES →' : 'SAVE LOG →'}
                      </button>
                      <button className="btn-ghost" onClick={() => setModal(null)}>CANCEL</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── NUTRITION DETAIL POPUP ── */}
          {modal === 'nutritionDetail' && selNutrition && (
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>
                  <span className={styles.modalLabel}>NUTRITION.detail</span>
                  <span className={styles.modalDate}>{dayjs(selected).format('dddd, MMMM D YYYY')}</span>
                </div>
                <button className={styles.modalClose} onClick={() => setModal(null)}>✕</button>
              </div>
              <div className={styles.modalBody}>
                {/* Big status badge */}
                {(() => {
                  const st = deriveNutStatus(selNutrition, plan?.nutrition_targets)
                  const cfg = {
                    hit:     { label:'HIT TARGETS',    cls: styles.statusHit },
                    partial: { label:'PARTIAL',         cls: styles.statusPartial },
                    off:     { label:'OFF TARGET',      cls: styles.statusOff },
                    missed:  { label:'MISSED',          cls: styles.statusMissed },
                  }
                  const c = cfg[st] ?? cfg['partial']
                  return (
                    <div className={styles.nutDetailStatusWrap}>
                      <span className={`${styles.nutDetailStatusBadge} ${c.cls}`}>{c.label}</span>
                    </div>
                  )
                })()}
                <div className={styles.detailGrid} style={{marginTop:14}}>
                  {[
                    {k:'Calories', v:selNutrition.calories,  u:'kcal'},
                    {k:'Protein',  v:selNutrition.protein_g, u:'g'},
                    {k:'Carbs',    v:selNutrition.carbs_g,   u:'g'},
                    {k:'Fat',      v:selNutrition.fat_g,     u:'g'},
                    {k:'Water',    v:selNutrition.water_ml,  u:'ml'},
                  ].filter(r=>r.v!=null).map(r=>(
                    <div key={r.k} className={styles.detailGridRow}>
                      <span className={styles.dk}>{r.k}</span>
                      <span className={styles.dv}>{r.v}{r.u}</span>
                    </div>
                  ))}
                </div>
                {selNutrition.notes && (
                  <div className={styles.notesBlock}>
                    <div className={styles.sectionMono}>NOTES</div>
                    <p className={styles.notesText}>{selNutrition.notes}</p>
                  </div>
                )}
                <div className={styles.modalActions}>
                  <button className="btn-ghost" onClick={() => { setModal(null); openNutritionModal(true) }}>EDIT LOG</button>
                  <button className="btn-ghost" onClick={() => setModal(null)}>CLOSE</button>
                </div>
              </div>
            </div>
          )}

          {/* ── PLAN DETAIL POPUP ── */}
          {modal === 'planDetail' && selPlanDay && (
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>
                  <span className={styles.modalLabel}>PLAN.detail</span>
                  <span className={styles.modalDate}>{selPlanDay.day_name?.toUpperCase()} · {selPlanDay.session_type?.toUpperCase()}</span>
                </div>
                <button className={styles.modalClose} onClick={() => setModal(null)}>✕</button>
              </div>
              <div className={styles.modalBody}>
                {selPlanDay.exercises?.length > 0 ? (
                  selPlanDay.exercises
                    .sort((a,b)=>(a.order_index??0)-(b.order_index??0))
                    .map((ex,i)=>(
                      <div key={i} className={styles.planDetailCard}>
                        <div className={styles.planDetailHeader}>
                          <span className={styles.planDetailName}>{ex.exercise}</span>
                          <span className={styles.planDetailSets}>{ex.sets??'?'}×{ex.reps??'?'}</span>
                        </div>
                        <div className={styles.planDetailMeta}>
                          {ex.rir!=null && (
                            <span className={styles.planDetailTag}>RiR {ex.rir}</span>
                          )}
                          {ex.progression_rule && (
                            <span className={styles.planDetailProg}>{ex.progression_rule}</span>
                          )}
                        </div>
                        {ex.notes && (
                          <p className={styles.planDetailNotes}>{ex.notes}</p>
                        )}
                      </div>
                    ))
                ) : (
                  <div className={styles.noData}>No exercises defined for this day.</div>
                )}
                <div className={styles.modalActions}>
                  <button className="btn-ghost" onClick={() => setModal(null)}>CLOSE</button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}