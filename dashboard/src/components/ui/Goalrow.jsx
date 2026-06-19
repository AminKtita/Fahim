import styles from './Goalrow.module.css'
import dayjs from 'dayjs'

export default function GoalRow({ goal }) {
  const pct = goal.target_value && goal.current_value != null
    ? Math.min(Math.round((goal.current_value / goal.target_value) * 100), 100)
    : 0

  const remaining = goal.target_value != null && goal.current_value != null
    ? goal.target_value - goal.current_value : null

  const daysLeft = goal.deadline ? dayjs(goal.deadline).diff(dayjs(), 'day') : null

  const barCls = pct >= 80 ? styles.barAccent : pct >= 50 ? styles.barBlue : styles.barWarn
  const pctCls = pct >= 80 ? styles.pctAccent : pct >= 50 ? styles.pctBlue  : styles.pctWarn

  return (
    <div className={styles.row}>
      <div className={styles.top}>
        <span className={styles.title}>{goal.title}</span>
        <span className={`${styles.pct} ${pctCls}`}>{pct}%</span>
      </div>
      <div className={styles.barWrap}>
        <div className={styles.track}>
          <div className={`${styles.fill} ${barCls}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className={styles.meta}>
        <span className={styles.values}>
          {goal.current_value ?? '—'} / {goal.target_value} {goal.metric}
        </span>
        {daysLeft != null && (
          <span className={`${styles.deadline} ${daysLeft < 14 ? styles.deadlineWarn : ''}`}>
            {daysLeft < 0 ? 'Overdue' : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
          </span>
        )}
      </div>
    </div>
  )
}
