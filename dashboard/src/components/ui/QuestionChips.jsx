import { useStatus } from '../../lib/StatusContext'
import { getSuggestedQuestions } from '../../lib/suggestedQuestions'
import styles from './QuestionChips.module.css'

/**
 * QuestionChips — renders contextual suggested-question chips above the
 * chat input. Clicking a chip fills the input (via onSelect) rather than
 * sending immediately, so the user can edit before confirming.
 */
export default function QuestionChips({ onSelect, compact = false }) {
  const { status } = useStatus()
  const questions = getSuggestedQuestions(status)

  if (!questions.length) return null

  return (
    <div className={`${styles.row} ${compact ? styles.compact : ''}`}>
      {questions.map(q => (
        <button
          key={q.id}
          className={styles.chip}
          onClick={() => onSelect(q.text)}
          title={q.text}
        >
          {q.label}
        </button>
      ))}
    </div>
  )
}