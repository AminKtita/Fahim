import styles from './Badge.module.css'

export default function Badge({ children, type = 'neutral' }) {
  return <span className={`${styles.badge} ${styles[type]}`}>{children}</span>
}