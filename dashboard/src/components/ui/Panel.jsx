import styles from './Panel.module.css'

/**
 * Panel — labeled card container
 * @param {string}  label     - section label (human-readable)
 * @param {string}  action    - optional action button text
 * @param {fn}      onAction  - action button handler
 * @param {boolean} noPad     - skip body padding (for charts / full-bleed content)
 */
export default function Panel({ label, action, onAction, children, className = '', noPad = false }) {
  return (
    <div className={`${styles.panel} ${className}`}>
      {label && (
        <div className={styles.header}>
          <span className={styles.label}>{label}</span>
          {action && (
            <button className={styles.action} onClick={onAction}>
              {action}
            </button>
          )}
        </div>
      )}
      <div className={noPad ? styles.bodyRaw : styles.body}>{children}</div>
    </div>
  )
}
