import { useState } from 'react'
import ChatPanel from './ChatPanel'
import styles from './FloatingChat.module.css'

export default function FloatingChat() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && (
        <div className={styles.panelWrap}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitleGroup}>
              <span className={styles.panelDot} />
              <span className={styles.panelTitle}>Fahim</span>
              <span className={styles.panelSub}>AI coach</span>
            </div>
            <button className={styles.closeBtn} onClick={() => setOpen(false)} title="Close">✕</button>
          </div>
          <ChatPanel compact />
        </div>
      )}
      <button
        className={`${styles.fab} ${open ? styles.fabOpen : ''}`}
        onClick={() => setOpen(o => !o)}
        title={open ? 'Close Fahim' : 'Chat with Fahim'}
      >
        {open ? '✕' : 'F'}
      </button>
    </>
  )
}
