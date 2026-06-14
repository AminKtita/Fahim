import { useState, useRef, useEffect } from 'react'
import { useSharedChat } from '../../lib/ChatContext'
import styles from './ChatPanel.module.css'

const CATEGORY_LABEL = {
  workout:   'Workout logged',
  nutrition: 'Nutrition logged',
  metrics:   'Body metrics logged',
  goal:      'Goal updated',
}

export default function ChatPanel({ compact = false }) {
  const { messages, streaming, error, send, stop, clear } = useSharedChat()
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return
    send(input)
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ''}`}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>FAHIM.chat</span>
        <div className={styles.headerRight}>
          {streaming && <span className={styles.thinkingDot}>● thinking…</span>}
          {messages.length > 0 && (
            <button className={styles.clearBtn} onClick={clear}>clear</button>
          )}
        </div>
      </div>

      <div className={styles.messages} ref={scrollRef}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyMono}>$ fahim --chat</span>
            <span className={styles.emptySub}>Ask about your training, log a workout, or get advice.</span>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`${styles.msgRow} ${styles[m.role]}`}>
            <span className={styles.msgRole}>{m.role === 'user' ? 'YOU' : 'FAHIM'}</span>

            {m.role === 'assistant' && m.thinking && (
              <details className={styles.thinkingBlock} open={streaming && i === messages.length - 1}>
                <summary className={styles.thinkingSummary}>thinking…</summary>
                <div className={styles.thinkingText}>{m.thinking}</div>
              </details>
            )}

            {m.content && <div className={styles.msgContent}>{m.content}</div>}

            {!m.content && m.role === 'assistant' && streaming && i === messages.length - 1 && (
              <div className={styles.msgContent}><span className={styles.cursor}>▋</span></div>
            )}

            {m.logs?.map((log, li) => (
              <div key={li} className={styles.logBadge}>
                {log.category === 'error'
                  ? <span className={styles.logError}>⚠ log failed: {log.error}</span>
                  : <span className={styles.logOk}>✓ {CATEGORY_LABEL[log.category] ?? log.category} · {log.date ?? ''}</span>
                }
              </div>
            ))}

            {m.error && <div className={styles.msgError}>⚠ {m.error}</div>}
          </div>
        ))}
      </div>

      <div className={styles.inputRow}>
        <textarea
          className={styles.input}
          placeholder="Message Fahim…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        {streaming ? (
          <button className="btn-ghost" onClick={stop}>STOP</button>
        ) : (
          <button onClick={handleSend} disabled={!input.trim()}>SEND →</button>
        )}
      </div>
    </div>
  )
}