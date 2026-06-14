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
            <span className={styles.panelTitle}>$ fahim.chat</span>
            <button className={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
          </div>
          <ChatPanel compact />
        </div>
      )}
      <button className={styles.fab} onClick={() => setOpen(o => !o)} title="Chat with Fahim">
        {open ? '✕' : '🔩'}
      </button>
    </>
  )
}