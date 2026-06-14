import styles from './Panel.module.css'

export default function Panel({ label, action, onAction, children, className = '' }) {
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
      {children}
    </div>
  )
}