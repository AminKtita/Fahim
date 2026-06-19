import styles from './Statcard.module.css'

/**
 * StatCard — single metric display
 * @param {string}  label     - top label
 * @param {*}       value     - main value
 * @param {string}  unit      - unit suffix
 * @param {string}  sub       - subtitle/context line
 * @param {string}  subType   - 'neutral'|'positive'|'warning'|'info'
 * @param {string}  delta     - trend string e.g. "+0.3 vs last week"
 * @param {string}  deltaType - 'up'|'down'|'neutral'
 * @param {string}  icon      - optional emoji icon
 */
export default function StatCard({ label, value, unit, sub, subType = 'neutral', delta, deltaType = 'neutral', icon }) {
  return (
    <div className={styles.card}>
      <div className={styles.labelRow}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <span className={styles.label}>{label}</span>
      </div>
      <div className={styles.value}>
        {value}
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {delta && (
        <div className={`${styles.delta} ${styles[`delta_${deltaType}`]}`}>
          {delta}
        </div>
      )}
      {sub && <div className={`${styles.sub} ${styles[subType]}`}>{sub}</div>}
    </div>
  )
}
