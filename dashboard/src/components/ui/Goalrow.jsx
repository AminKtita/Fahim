import styles from './GoalRow.module.css'

export default function GoalRow({ goal }) {
  const pct = goal.target_value
    ? Math.min(Math.round((goal.current_value / goal.target_value) * 100), 100)
    : 0
  const colorClass = pct >= 80 ? 'accent' : pct >= 50 ? 'blue' : 'warning'

  return (
    <div className={styles.row}>
      <div className={styles.meta}>
        <span className={styles.name}>{goal.title}</span>
        <span className={`${styles.pct} ${styles[colorClass]}`}>{pct}%</span>
      </div>
      <div className={styles.track}>
        <div className={`${styles.fill} ${styles[colorClass]}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.detail}>
        <span>{goal.current_value ?? '—'} / {goal.target_value} {goal.metric}</span>
        {goal.deadline && <span className={styles.deadline}>→ {goal.deadline}</span>}
      </div>
    </div>
  )
}