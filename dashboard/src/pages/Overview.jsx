import { useApi } from '../hooks/useApi'
import { getProfile, getWorkouts, getNutrition, getGoals, getLatestMetrics, getPlan } from '../lib/api'
import { useStatus } from '../lib/StatusContext'
import { getPlanDayForDate } from '../lib/WorkoutModals'
import Panel from '../components/ui/Panel'
import StatCard from '../components/ui/StatCard'
import SectionDivider from '../components/ui/SectionDivider'
import GoalRow from '../components/ui/GoalRow'
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

  // Current weight — from body_metrics table, not dead daily_summary
  const currentWeight = metrics?.weight_kg ?? null

  const avgProtein = nutrition?.length
    ? Math.round(nutrition.filter(n => n.calories).reduce((a, n) => a + (n.protein_g || 0), 0) /
        Math.max(nutrition.filter(n => n.calories).length, 1))
    : null

  // ── Notification logic ─────────────────────────────────────────
  // Missed workout: today has a planned session but nothing logged yet, OR
  // explicitly marked missed. Also look back 1-2 past planned days.
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

  // Check today + last 3 days for workout issues.
  // Three distinct cases:
  //   1. Today has a planned session but nothing logged yet (nudge, not alarm)
  //   2. A past planned session has no log AND no rest/missed row (genuinely skipped)
  //   3. A past planned session is explicitly logged as 'missed'
  // Rest days (no plan session, or session_type='rest') are never flagged.
  const unloggedWorkoutDays  = []  // planned, past, no row at all
  let todayPlannedNotLogged  = false

  for (let i = 0; i <= 3; i++) {
  const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
  const w = workoutMap[d]
  const session = (w?.session_type || '').toLowerCase()
  const planned = isPlannedDay(d)

  if (i === 0) {
    if (planned && !w) {
      todayPlannedNotLogged = true
    }
  } else {
    if (!planned) continue
    if (session === 'rest') continue

    // missed workouts count as logged
    if (!w) {
      unloggedWorkoutDays.push(d)
    }
  }
}

const showWorkoutAlert =
  todayPlannedNotLogged ||
  unloggedWorkoutDays.length > 0

const alertWorkoutMsg = (() => {
  if (!showWorkoutAlert) return ''

  const parts = []

  if (todayPlannedNotLogged) {
    parts.push("Today's session hasn't been logged yet")
  }

  if (unloggedWorkoutDays.length) {
    parts.push(
      `${unloggedWorkoutDays.length} past planned session${unloggedWorkoutDays.length > 1 ? 's' : ''} with no entry`
    )
  }

  return parts.join(' · ') + '.'
})()

  // Check today + last 3 days for unlogged nutrition.
  // '__MISSED__' (off-plan/cheat day) is deliberate — not flagged.
  // Rest days are still flagged if nutrition wasn't logged (nutrition is expected every day).
  const unloggedNutritionDays  = []
  let todayNutritionNotLogged  = false

  for (let i = 0; i <= 3; i++) {
    const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
    const n = nutritionMap[d]
    const hasEntry = n?.calories || n?.notes === '__MISSED__'
    if (i === 0) {
      if (!hasEntry) todayNutritionNotLogged = true
    } else {
      if (!hasEntry) unloggedNutritionDays.push(d)
    }
  }

  const showNutritionAlert = todayNutritionNotLogged || unloggedNutritionDays.length > 0

  const alertNutritionMsg = (() => {
    if (!showNutritionAlert) return ''
    const parts = []
    if (todayNutritionNotLogged)        parts.push("Today's nutrition hasn't been logged yet")
    if (unloggedNutritionDays.length)   parts.push(`${unloggedNutritionDays.length} day${unloggedNutritionDays.length > 1 ? 's' : ''} without a nutrition entry recently`)
    return parts.join(' · ') + '.'
  })()

  // ── Weekly grid ────────────────────────────────────────────────
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

    const label = w
      ? (isMissed ? 'MISS' : isRest ? 'REST' : session.toUpperCase().slice(0, 4))
      : isToday ? dayjs(date).format('ddd').toUpperCase()
      : dayjs(date).format('dd').toUpperCase()

    let cls = styles.cell  // default: upcoming / no plan
    if (isDone)              cls = styles.cellDone
    else if (isMissed)       cls = styles.cellMissed
    else if (isRest)         cls = styles.cellRest
    else if (isToday)        cls = styles.cellToday
    else if (planned && !isFuture) cls = styles.cellMissed  // past planned day never logged

    return <div className={cls} title={date}>{label}</div>
  }

  // recent activity feed
  const feed = [
    ...(workouts?.slice(0, 6).map(w => ({
      date: w.date, type: 'workout',
      msg: `${w.session_type ?? 'session'} · ${w.duration_min ? w.duration_min + ' min' : ''} · effort ${w.perceived_effort ?? '—'}/10`,
    })) ?? []),
    ...(nutrition?.slice(0, 6).filter(n => n.calories).map(n => ({
      date: n.date, type: 'nutrition',
      msg: `${n.calories} kcal · ${n.protein_g ?? '—'}g protein · ${n.carbs_g ?? '—'}g carbs`,
    })) ?? []),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7)

  const badgeType = { workout: 'positive', nutrition: 'info', metrics: 'warning' }

  return (
    <div>
      {/* HERO */}
      <div className={styles.hero}>
        <div className={styles.eyebrow}>ATHLETE.profile · {today}</div>
        <div className={styles.name}>{profile?.name ?? 'Athlete'}</div>
        <div className={styles.sub}>{profile?.goal_type ?? '—'} · {profile?.activity_level ?? '—'}</div>
        <div className={styles.statGrid}>
          <StatCard label="current weight"  value={currentWeight ?? '—'} unit="kg"  sub="from body metrics" />
          <StatCard label="streak"          value={streak}               unit=" days" sub="on plan" subType="positive" />
          <StatCard label="sessions / 30d"  value={workouts?.filter(w => !['missed','rest'].includes(w.session_type)).length ?? 0} sub="logged workouts" />
          <StatCard label="avg protein"     value={avgProtein ?? '—'}    unit="g"
            sub={avgProtein ? 'per logged day' : 'log nutrition'}
            subType={avgProtein ? 'positive' : 'warning'} />
        </div>

        {/* ── ALERT BANNERS — below stat grid, above chat ── */}
        {(showWorkoutAlert || showNutritionAlert) && (
          <div className={styles.alertGroup}>
            {showWorkoutAlert && (
              <div className={styles.alert} data-type="workout">
                <div className={styles.alertLeft}>
                  <span className={styles.alertIcon}>⚠</span>
                  <div>
                    <div className={styles.alertTitle}>WORKOUT_LOG.incomplete</div>
                    <div className={styles.alertMsg}>{alertWorkoutMsg}</div>
                  </div>
                </div>
                <button className={styles.alertBtn} onClick={() => navigate('/schedule')}>
                  GO TO SCHEDULE →
                </button>
              </div>
            )}
            {showNutritionAlert && (
              <div className={styles.alert} data-type="nutrition">
                <div className={styles.alertLeft}>
                  <span className={styles.alertIcon}>⚠</span>
                  <div>
                    <div className={styles.alertTitle}>NUTRITION_LOG.incomplete</div>
                    <div className={styles.alertMsg}>{alertNutritionMsg}</div>
                  </div>
                </div>
                <button className={styles.alertBtn} onClick={() => navigate('/nutrition')}>
                  GO TO NUTRITION →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <SectionDivider label="CHAT.fahim" />
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
        <ChatPanel />
      </div>

      <SectionDivider label="WEEKLY_OVERVIEW.log" />
      <div className={styles.grid2}>
        <Panel label="WORKOUT_VOLUME.30d">
          <VolumeChart workouts={workouts ?? []} />
        </Panel>
        <Panel label="TRAINING_WEEK.grid">
          <div className={styles.weekSection}>
            <span className={styles.weekLabel}>prev week</span>
            <div className={styles.weekRow}>{week1.map(d => <WorkoutCell key={d} date={d} />)}</div>
          </div>
          <div className={styles.weekSection}>
            <span className={styles.weekLabel}>this week</span>
            <div className={styles.weekRow}>{week2.map(d => <WorkoutCell key={d} date={d} />)}</div>
          </div>
          <div className={styles.weekLegend}>
            <span className={styles.lgDone}>■ trained</span>
            <span className={styles.lgMissed}>■ missed</span>
            <span className={styles.lgRest}>■ rest</span>
            <span className={styles.lgToday}>■ today</span>
            <span className={styles.lgEmpty}>□ upcoming</span>
          </div>
        </Panel>
      </div>

      <SectionDivider label="GOALS.active" />
      <div className={styles.grid2}>
        <Panel label="GOAL_PROGRESS.tracker">
          {goals?.length
            ? goals.map(g => <GoalRow key={g.id} goal={g} />)
            : <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--faint)' }}>NO_GOALS · add goals on the Goals page</span>
          }
        </Panel>
        <Panel label="ACTIVITY_FEED.recent">
          {feed.length ? feed.map((f, i) => (
            <div key={i} className={styles.feedRow}>
              <span className={styles.feedDate}>{dayjs(f.date).format('MMM D')}</span>
              <div>
                <Badge type={badgeType[f.type]}>{f.type.toUpperCase()}</Badge>
                <span className={styles.feedMsg}>{f.msg}</span>
              </div>
            </div>
          )) : <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--faint)' }}>NO_ACTIVITY · start logging</span>}
        </Panel>
      </div>

      {todayNut?.calories && (
        <>
          <SectionDivider label="TODAY.nutrition_snapshot" />
          <div className={styles.todayPanel}>
            <Panel label="MACRO_SUMMARY.today">
              <div className={styles.todayGrid}>
                {[
                  { label:'Calories', value:todayNut.calories,  unit:'kcal' },
                  { label:'Protein',  value:todayNut.protein_g, unit:'g' },
                  { label:'Carbs',    value:todayNut.carbs_g,   unit:'g' },
                  { label:'Fat',      value:todayNut.fat_g,     unit:'g' },
                ].map(m => (
                  <div key={m.label} className={styles.macroItem}>
                    <span className={styles.macroLabel}>{m.label}</span>
                    <span className={styles.macroVal}>{m.value ?? '—'}<span className={styles.macroUnit}>{m.unit}</span></span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}