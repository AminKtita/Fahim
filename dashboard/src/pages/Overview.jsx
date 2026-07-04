import { useApi } from '../hooks/useApi'
import { getProfile, getWorkouts, getNutrition, getGoals, getLatestMetrics, getPlan } from '../lib/api'
import { useStatus } from '../lib/StatusContext'
import { getPlanDayForDate } from '../lib/WorkoutModals'
import { deriveNutStatus } from '../lib/NutritionModals'
import Panel from '../components/ui/Panel'
import StatCard from '../components/ui/StatCard'
import SectionDivider from '../components/ui/SectionDivider'
import GoalRow from '../components/ui/Goalrow'
import Badge from '../components/ui/Badge'
import VolumeChart from '../components/charts/VolumeChart'
import ChatPanel from '../components/ui/ChatPanel'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import styles from './Overview.module.css'

export default function Overview() {
  const navigate = useNavigate()
  const { data: profile }  = useApi(getProfile)
  const { data: workouts } = useApi(() => getWorkouts(30))
  const { data: nutrition }= useApi(() => getNutrition(30))
  const { data: goals }    = useApi(getGoals)
  const { data: metrics }  = useApi(getLatestMetrics)
  const { data: plan }     = useApi(getPlan)
  const { status }         = useStatus()

  const today = dayjs().format('YYYY-MM-DD')
  const todayNut     = nutrition?.find(n => n.date === today)
  const todayWorkout = workouts?.find(w => w.date === today)
  const streak       = status?.streak ?? 0

  const currentWeight = metrics?.weight_kg ?? null

  // ── Trend deltas ────────────────────────────────────────────────
  const lastWeekWeight = null // body metrics history not fetched here — show only latest

  const avgProtein = nutrition?.length
    ? Math.round(nutrition.filter(n => n.calories).reduce((a, n) => a + (n.protein_g || 0), 0) /
        Math.max(nutrition.filter(n => n.calories).length, 1))
    : null

  // Sessions this week vs last week
  const thisWeekStart = dayjs().startOf('week')
  const lastWeekStart = thisWeekStart.subtract(1, 'week')
  const sessionsThisWeek = workouts?.filter(w => {
    const d = dayjs(w.date)
    return d.isAfter(thisWeekStart.subtract(1, 'day')) && !['missed','rest'].includes(w.session_type)
  }).length ?? 0
  const sessionsLastWeek = workouts?.filter(w => {
    const d = dayjs(w.date)
    return d.isAfter(lastWeekStart.subtract(1, 'day')) && d.isBefore(thisWeekStart) && !['missed','rest'].includes(w.session_type)
  }).length ?? 0
  const sessionDelta = sessionsThisWeek - sessionsLastWeek

  // Protein delta: this week avg vs last week avg
  const proteinThisWeek = nutrition?.filter(n => {
    const d = dayjs(n.date); return d.isAfter(thisWeekStart.subtract(1, 'day')) && n.protein_g
  })
  const proteinLastWeek = nutrition?.filter(n => {
    const d = dayjs(n.date); return d.isAfter(lastWeekStart.subtract(1, 'day')) && d.isBefore(thisWeekStart) && n.protein_g
  })
  const avgProteinThisWeek = proteinThisWeek?.length ? Math.round(proteinThisWeek.reduce((a,n) => a + n.protein_g, 0) / proteinThisWeek.length) : null
  const avgProteinLastWeek = proteinLastWeek?.length ? Math.round(proteinLastWeek.reduce((a,n) => a + n.protein_g, 0) / proteinLastWeek.length) : null
  const proteinDelta = (avgProteinThisWeek != null && avgProteinLastWeek != null) ? avgProteinThisWeek - avgProteinLastWeek : null

  // ── Today's planned session ─────────────────────────────────────
  const todayPlan = getPlanDayForDate(plan, today)
  const todayExercises = todayPlan?.exercises?.slice(0, 3) ?? []
  const hasTodaySession = !!todayPlan
  const todayLogged = !!todayWorkout && !['missed','rest'].includes(todayWorkout.session_type?.toLowerCase())
  const sessionType = (todayPlan?.session_type || todayWorkout?.session_type || '').toLowerCase()
  const sessionLabel = sessionType ? sessionType.charAt(0).toUpperCase() + sessionType.slice(1) : 'Training'

  // ── Today's nutrition progress ──────────────────────────────────
  const targets = plan?.nutrition_targets
  const nutStatus = deriveNutStatus(todayNut, targets)
  const calTarget  = targets?.calories  ?? null
  const protTarget = targets?.protein_g ?? null
  const calLogged  = todayNut?.calories  ?? 0
  const protLogged = todayNut?.protein_g ?? 0
  const calPct  = calTarget  ? Math.min(100, Math.round((calLogged  / calTarget)  * 100)) : null
  const protPct = protTarget ? Math.min(100, Math.round((protLogged / protTarget) * 100)) : null

  // ── Alert logic ─────────────────────────────────────────────────
  const DAY_NAME_MAP = {
    sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6,
    sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6,
  }
  const isPlannedDay = (date) => {
    if (!plan?.days?.length) return false
    const dow = dayjs(date).day()
    return !!plan.days.find(d => DAY_NAME_MAP[d.day_name?.toLowerCase()] === dow)
  }

  const workoutMap = {}; workouts?.forEach(w => { workoutMap[w.date] = w })
  const nutritionMap = {}; nutrition?.forEach(n => { nutritionMap[n.date] = n })

  const unloggedWorkoutDays = []
  let todayPlannedNotLogged = false

  for (let i = 0; i <= 3; i++) {
    const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
    const w = workoutMap[d]
    const session = (w?.session_type || '').toLowerCase()
    const planned = isPlannedDay(d)
    if (i === 0) {
      if (planned && !w) todayPlannedNotLogged = true
    } else {
      if (!planned) continue
      if (session === 'rest') continue
      if (!w) unloggedWorkoutDays.push(d)
    }
  }

  const showWorkoutAlert = todayPlannedNotLogged || unloggedWorkoutDays.length > 0
  const alertWorkoutMsg = (() => {
    if (!showWorkoutAlert) return ''
    const parts = []
    if (todayPlannedNotLogged) parts.push("Today's session hasn't been logged yet")
    if (unloggedWorkoutDays.length) parts.push(`${unloggedWorkoutDays.length} recent planned session${unloggedWorkoutDays.length > 1 ? 's' : ''} with no entry`)
    return parts.join(' · ')
  })()

  const unloggedNutritionDays = []
  let todayNutritionNotLogged = false
  for (let i = 0; i <= 3; i++) {
    const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
    const n = nutritionMap[d]
    const hasEntry = n?.calories || n?.notes === '__MISSED__'
    if (i === 0) { if (!hasEntry) todayNutritionNotLogged = true }
    else { if (!hasEntry) unloggedNutritionDays.push(d) }
  }
  const showNutritionAlert = todayNutritionNotLogged || unloggedNutritionDays.length > 0
  const alertNutritionMsg = (() => {
    if (!showNutritionAlert) return ''
    const parts = []
    if (todayNutritionNotLogged) parts.push("Today's nutrition hasn't been logged")
    if (unloggedNutritionDays.length) parts.push(`${unloggedNutritionDays.length} day${unloggedNutritionDays.length > 1 ? 's' : ''} without a nutrition entry recently`)
    return parts.join(' · ')
  })()

  // ── Weekly grid ─────────────────────────────────────────────────
  const last14 = Array.from({ length: 14 }, (_, i) =>
    dayjs().subtract(13 - i, 'day').format('YYYY-MM-DD')
  )
  const week1 = last14.slice(0, 7)
  const week2 = last14.slice(7)

  const WorkoutCell = ({ date }) => {
    const w = workoutMap[date]
    const isToday   = date === today
    const isFuture  = date > today
    const planned   = getPlanDayForDate(plan, date)
    const session   = (w?.session_type || '').toLowerCase()
    const isMissed  = session === 'missed'
    const isRest    = session === 'rest' || (!w && plan && !planned && !isFuture)
    const isDone    = w && !isMissed && !isRest
    const nutEntry  = nutritionMap[date]
    const nutOk     = nutEntry?.calories > 0

    const label = w
      ? (isMissed ? 'Miss' : isRest ? 'Rest' : session.charAt(0).toUpperCase() + session.slice(1, 4))
      : isToday ? dayjs(date).format('ddd')
      : dayjs(date).format('dd')

    let cls = styles.cell
    if (isDone)   cls = styles.cellDone
    else if (isMissed) cls = styles.cellMissed
    else if (isRest)   cls = styles.cellRest
    else if (isToday)  cls = styles.cellToday
    else if (planned && !isFuture) cls = styles.cellMissed

    return (
      <div className={cls} title={date}>
        <span className={styles.cellLabel}>{label}</span>
        {!isFuture && !isRest && (
          <span className={`${styles.nutDot} ${nutOk ? styles.nutDotOk : styles.nutDotMiss}`} />
        )}
      </div>
    )
  }

  // ── Activity feed ────────────────────────────────────────────────
  const feed = [
    ...(workouts?.slice(0, 6).map(w => ({
      date: w.date, type: 'workout',
      msg: `${w.session_type ?? 'Session'}${w.duration_min ? ' · ' + w.duration_min + ' min' : ''}${w.perceived_effort ? ' · effort ' + w.perceived_effort + '/10' : ''}`,
    })) ?? []),
    ...(nutrition?.slice(0, 6).filter(n => n.calories).map(n => ({
      date: n.date, type: 'nutrition',
      msg: `${n.calories} kcal · ${n.protein_g ?? '—'}g protein`,
    })) ?? []),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)

  const badgeType = { workout: 'positive', nutrition: 'info' }

  return (
    <div>

      {/* ── ALERTS — always first, below nav ── */}
      {(showWorkoutAlert || showNutritionAlert) && (
        <div className={styles.alertGroup}>
          {showWorkoutAlert && (
            <div className={styles.alert} data-type="workout">
              <div className={styles.alertLeft}>
                <span className={styles.alertIcon}>⚠</span>
                <div>
                  <div className={styles.alertTitle}>Incomplete workout log</div>
                  <div className={styles.alertMsg}>{alertWorkoutMsg}</div>
                </div>
              </div>
              <button className="btn-ghost" style={{fontSize:11}} onClick={() => navigate('/schedule')}>
                Go to Schedule →
              </button>
            </div>
          )}
          {showNutritionAlert && (
            <div className={styles.alert} data-type="nutrition">
              <div className={styles.alertLeft}>
                <span className={styles.alertIcon}>⚠</span>
                <div>
                  <div className={styles.alertTitle}>Nutrition not logged</div>
                  <div className={styles.alertMsg}>{alertNutritionMsg}</div>
                </div>
              </div>
              <button className="btn-ghost" style={{fontSize:11}} onClick={() => navigate('/nutrition')}>
                Go to Nutrition →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── TODAY HEADER ── */}
      <div className={styles.todayHeader}>
        <div className={styles.todayMeta}>
          <span className={styles.todayDate}>{dayjs().format('dddd, MMMM D')}</span>
          {hasTodaySession && (
            <span className={styles.todaySession}>
              <span className={styles.sessionPill}>{sessionLabel} day</span>
              {todayExercises.length > 0 && (
                <span className={styles.exercisePreview}>
                  {todayExercises.map(e => e.exercise).join(' · ')}
                  {(todayPlan?.exercises?.length ?? 0) > 3 ? ` +${(todayPlan.exercises.length - 3)} more` : ''}
                </span>
              )}
            </span>
          )}
        </div>
        {hasTodaySession && !todayLogged && (
          <button className="btn-primary" onClick={() => navigate('/workouts')}>
            Log today's session →
          </button>
        )}
        {todayLogged && (
          <span className={styles.todayDone}>✓ Session logged</span>
        )}
      </div>

      {/* ── STAT CARDS ── */}
      <div className={styles.statGrid}>
        <StatCard
          label="Current weight"
          value={currentWeight ?? '—'}
          unit="kg"
          icon="⚖"
          sub={currentWeight ? 'Latest measurement' : 'No measurement logged'}
          subType={currentWeight ? 'neutral' : 'warning'}
        />
        <StatCard
          label="Streak"
          value={streak}
          unit=" days"
          icon="🔥"
          sub="on plan"
          subType={streak > 0 ? 'positive' : 'neutral'}
        />
        <StatCard
          label="Sessions this week"
          value={sessionsThisWeek}
          icon="🏋"
          sub={sessionDelta !== 0 ? `${sessionDelta > 0 ? '+' : ''}${sessionDelta} vs last week` : 'Same as last week'}
          subType={sessionDelta > 0 ? 'positive' : sessionDelta < 0 ? 'warning' : 'neutral'}
          delta={sessionDelta !== 0 ? `${sessionDelta > 0 ? '↑' : '↓'} ${Math.abs(sessionDelta)} vs last week` : undefined}
          deltaType={sessionDelta > 0 ? 'up' : sessionDelta < 0 ? 'down' : 'neutral'}
        />
        <StatCard
          label="Avg protein"
          value={avgProtein ?? '—'}
          unit="g"
          icon="🥩"
          sub={avgProtein ? 'per logged day' : 'Log nutrition to track'}
          subType={avgProtein ? 'positive' : 'warning'}
          delta={proteinDelta != null ? `${proteinDelta > 0 ? '↑ +' : '↓ '}${Math.abs(proteinDelta)}g vs last week` : undefined}
          deltaType={proteinDelta > 0 ? 'up' : proteinDelta < 0 ? 'down' : 'neutral'}
        />
      </div>

      {/* ── TODAY'S NUTRITION SNAPSHOT ── */}
      <div className={styles.nutritionBar}>
        <div className={styles.nutritionBarLabel}>
          <span className={styles.nutritionBarTitle}>Today's nutrition</span>
          {nutStatus && (
            <span className={`${styles.nutBadge} ${styles[`nutBadge_${nutStatus}`]}`}>
              {nutStatus === 'hit' ? 'On target' : nutStatus === 'exceeded' ? 'Exceeded' : nutStatus === 'partial' ? 'Partial' : nutStatus === 'off' ? 'Off plan' : 'Missed'}
            </span>
          )}
        </div>
        {todayNut?.calories ? (
          <div className={styles.nutritionMacros}>
            <MacroMini label="Calories" value={calLogged} target={calTarget} unit="kcal" pct={calPct} />
            <MacroMini label="Protein"  value={protLogged} target={protTarget} unit="g" pct={protPct} />
            {todayNut.carbs_g != null && (
              <MacroMini label="Carbs" value={todayNut.carbs_g}
                target={targets?.carbs_g} unit="g"
                pct={targets?.carbs_g ? Math.min(100, Math.round(todayNut.carbs_g / targets.carbs_g * 100)) : null} />
            )}
            {todayNut.fat_g != null && (
              <MacroMini label="Fat" value={todayNut.fat_g}
                target={targets?.fat_g} unit="g"
                pct={targets?.fat_g ? Math.min(100, Math.round(todayNut.fat_g / targets.fat_g * 100)) : null} />
            )}
          </div>
        ) : (
          <div className={styles.nutritionEmpty}>
            No nutrition logged today
            <button className="btn-ghost" style={{marginLeft:12,fontSize:11}} onClick={() => navigate('/nutrition')}>
              Log now
            </button>
          </div>
        )}
      </div>

      {/* ── CHAT ── */}
      <SectionDivider label="Ask Fahim" />
      <div className={styles.chatWrap}>
        <ChatPanel />
      </div>

      {/* ── WEEKLY OVERVIEW ── */}
      <SectionDivider label="Weekly overview" />
      <div className={styles.grid2}>
        <Panel label="Training volume · 30 days" noPad>
          <div style={{padding: '12px 16px 8px'}}>
            <VolumeChart workouts={workouts ?? []} />
          </div>
        </Panel>
        <Panel label="Training grid · 2 weeks">
          <div className={styles.weekSection}>
            <span className={styles.weekLabel}>Previous week</span>
            <div className={styles.weekRow}>{week1.map(d => <WorkoutCell key={d} date={d} />)}</div>
          </div>
          <div className={styles.weekSection}>
            <span className={styles.weekLabel}>This week</span>
            <div className={styles.weekRow}>{week2.map(d => <WorkoutCell key={d} date={d} />)}</div>
          </div>
          <div className={styles.weekLegend}>
            <span className={styles.lgDone}>● Trained</span>
            <span className={styles.lgMissed}>● Missed</span>
            <span className={styles.lgRest}>● Rest</span>
            <span className={styles.lgToday}>● Today</span>
            <span className={styles.lgEmpty}>○ Upcoming</span>
          </div>
          <div className={styles.nutLegend}>
            <span className={styles.nutLegendDot + ' ' + styles.nutDotOk}>●</span>
            <span style={{color:'var(--faint)',fontSize:9}}>Nutrition logged</span>
            <span className={styles.nutLegendDot + ' ' + styles.nutDotMiss} style={{marginLeft:8}}>●</span>
            <span style={{color:'var(--faint)',fontSize:9}}>Not logged</span>
          </div>
        </Panel>
      </div>

      {/* ── GOALS + ACTIVITY FEED ── */}
      <SectionDivider label="Goals & recent activity" />
      <div className={styles.grid2}>
        <Panel label="Active goals" action="View all" onAction={() => navigate('/goals')}>
          {goals?.filter(g => g.status === 'active' || !g.status)?.length
            ? goals.filter(g => g.status === 'active' || !g.status).map(g => <GoalRow key={g.id} goal={g} />)
            : <span className={styles.emptyNote}>No active goals — add one on the Goals page</span>
          }
        </Panel>
        <Panel label="Recent activity" action="View all" onAction={() => navigate('/workouts')}>
          {feed.length ? feed.map((f, i) => (
            <div key={i} className={styles.feedRow}>
              <span className={styles.feedDate}>{dayjs(f.date).format('MMM D')}</span>
              <div>
                <Badge type={badgeType[f.type]}>{f.type === 'workout' ? 'Workout' : 'Nutrition'}</Badge>
                <span className={styles.feedMsg}>{f.msg}</span>
              </div>
            </div>
          )) : <span className={styles.emptyNote}>No activity yet — start logging</span>}
        </Panel>
      </div>

    </div>
  )
}

function MacroMini({ label, value, target, unit, pct }) {
  return (
    <div className={styles.macroMini}>
      <div className={styles.macroMiniHead}>
        <span className={styles.macroMiniLabel}>{label}</span>
        <span className={styles.macroMiniVal}>
          {value ?? 0}{unit}
          {target && <span className={styles.macroMiniTarget}> / {target}{unit}</span>}
        </span>
      </div>
      {pct != null && (
        <div className={styles.macroTrack}>
          <div
            className={styles.macroFill}
            style={{
              width: `${pct}%`,
              background: pct >= 95 ? 'var(--accent)' : pct >= 70 ? 'var(--blue)' : 'var(--warn)'
            }}
          />
        </div>
      )}
    </div>
  )
}