import styles from './Sectiondivider.module.css'

export default function SectionDivider({ label }) {
  return (
    <div className={styles.divider}>
      <span className={styles.label}>{label}</span>
      <div className={styles.line} />
    </div>
  )
}