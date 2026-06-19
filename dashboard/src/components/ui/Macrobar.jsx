import styles from './Macrobar.module.css'

export default function MacroBar({ label, current, target, color = 'accent' }) {
  const pct = target ? Math.min(Math.round((current / target) * 100), 100) : 0
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.track}>
        <div className={`${styles.fill} ${styles[color]}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.value}>{current} / {target}{label === 'Water' ? 'L' : 'g'}</span>
    </div>
  )
}