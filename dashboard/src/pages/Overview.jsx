import { useApi } from '../hooks/useApi'
import { getProfile, getWorkouts, getNutrition, getSummaries, getGoals } from '../lib/api'
import { useStatus } from '../lib/StatusContext'
import Panel from '../components/ui/Panel'
import StatCard from '../components/ui/StatCard'
import SectionDivider from '../components/ui/SectionDivider'
import GoalRow from '../components/ui/GoalRow'
import Badge from '../components/ui/Badge'
import VolumeChart from '../components/charts/VolumeChart'
import ChatPanel from '../components/ui/ChatPanel'
import dayjs from 'dayjs'
import styles from './Overview.module.css'

export default function Overview() {
  const { data: profile }    = useApi(getProfile)
  const { data: workouts }   = useApi(() => getWorkouts(30))
  const { data: nutrition }  = useApi(() => getNutrition(30))
  const { data: summaries }  = useApi(() => getSummaries(14))
  const { data: goals }      = useApi(getGoals)
  const { status }           = useStatus()

  const today        = dayjs().format('YYYY-MM-DD')
  const todayNut     = nutrition?.find(n => n.date === today)
  const todayWorkout = workouts?.find(w => w.date === today)
  const streak       = status?.streak ?? 0

  const avgProtein = nutrition?.length
    ? Math.round(nutrition.reduce((a, n) => a + (n.protein_g || 0), 0) / nutrition.length)
    : null

  const latestWeight = workouts
    ? (() => {
        // from summaries if available
        const s = summaries?.find(d => d.weight_kg)
        return s?.weight_kg ?? null
      })()
    : null

  // recent activity feed: combine workouts + nutrition, sort desc
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

  // weekly grid: last 14 days split into 2 rows of 7
  const last14 = Array.from({ length: 14 }, (_, i) =>
    dayjs().subtract(13 - i, 'day').format('YYYY-MM-DD')
  )
  const week1 = last14.slice(0, 7)
  const week2 = last14.slice(7)

  const WorkoutCell = ({ date }) => {
    const w = workouts?.find(x => x.date === date)
    const isToday = date === today
    const label = w ? (w.session_type ?? 'session').toUpperCase().slice(0, 4) : dayjs(date).format('dd').toUpperCase()
    const cls = isToday ? styles.cellToday : w ? styles.cellDone : styles.cell
    return <div className={cls}>{label}</div>
  }

  return (
    <div>
      {/* HERO */}
      <div className={styles.hero}>
        <div className={styles.eyebrow}>ATHLETE.profile · {today}</div>
        <div className={styles.name}>{profile?.name ?? 'Athlete'}</div>
        <div className={styles.sub}>{profile?.goal_type ?? '—'} · {profile?.activity_level ?? '—'}</div>
        <div className={styles.statGrid}>
          <StatCard label="current weight"  value={latestWeight ?? '—'} unit="kg"  sub="from body metrics"  />
          <StatCard label="streak"          value={streak}              unit=" days" sub="on plan"           subType="positive" />
          <StatCard label="sessions / 30d"  value={workouts?.length ?? 0}           sub="logged workouts"   />
          <StatCard label="avg protein"     value={avgProtein ?? '—'}   unit="g"
            sub={avgProtein && profile ? `target ${profile.goal_type}` : 'log nutrition'}
            subType={avgProtein ? 'positive' : 'warning'} />
        </div>
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
            <span className={styles.lgToday}>■ today</span>
            <span className={styles.lgEmpty}>■ rest / upcoming</span>
          </div>
        </Panel>
      </div>

      <SectionDivider label="GOALS.active" />

      <div className={styles.grid2}>
        <Panel label="GOAL_PROGRESS.tracker">
          {goals?.length
            ? goals.map(g => <GoalRow key={g.id} goal={g} />)
            : <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)' }}>NO_GOALS · add goals on the Goals page</span>
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
          )) : <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)' }}>NO_ACTIVITY · start logging</span>}
        </Panel>
      </div>

      {/* today's nutrition snapshot */}
      {todayNut && (
        <>
          <SectionDivider label="TODAY.nutrition_snapshot" />
          <div className={styles.todayPanel}>
            <Panel label="MACRO_SUMMARY.today">
              <div className={styles.todayGrid}>
                {[
                  { label: 'Calories', value: todayNut.calories, unit: 'kcal' },
                  { label: 'Protein',  value: todayNut.protein_g, unit: 'g' },
                  { label: 'Carbs',    value: todayNut.carbs_g, unit: 'g' },
                  { label: 'Fat',      value: todayNut.fat_g, unit: 'g' },
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