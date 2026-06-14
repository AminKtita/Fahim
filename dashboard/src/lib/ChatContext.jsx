import { createContext, useContext, useState, useRef, useCallback } from 'react'
import { useStatus } from './StatusContext'

/**
 * ChatContext — persists chat history across page navigation and between
 * the Overview panel and the floating widget. Mounted once at the app root,
 * so the conversation survives route changes for the whole session
 * (reset on full page reload).
 */
const GREETING = "Hey, I'm Fahim — your training coach. Ask me anything about your workouts, nutrition, or progress, or tell me what you did today and I'll log it for you."

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const [messages, setMessages]   = useState([
    { role: 'assistant', content: GREETING },
  ]) // { role, content, thinking?, logs?, error? }
  const [streaming, setStreaming] = useState(false)
  const [error, setError]         = useState(null)
  const { refresh: refreshStatus } = useStatus()
  const abortRef = useRef(null)

  const send = useCallback(async (text) => {
    if (!text.trim() || streaming) return
    setError(null)

    const history = messages.map(m => ({ role: m.role, content: m.content }))
    const userMsg = { role: 'user', content: text }
    const assistantMsg = { role: 'assistant', content: '', thinking: '' }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE messages are separated by double newlines
        const parts = buffer.split('\n\n')
        buffer = parts.pop() // keep incomplete chunk in buffer

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const jsonStr = line.slice(5).trim()
          if (!jsonStr) continue

          let evt
          try { evt = JSON.parse(jsonStr) } catch { continue }

          if (evt.type === 'thinking') {
            setMessages(prev => {
              const next = [...prev]
              const last = next[next.length - 1]
              next[next.length - 1] = { ...last, thinking: (last.thinking || '') + evt.data }
              return next
            })
          } else if (evt.type === 'reply') {
            setMessages(prev => {
              const next = [...prev]
              const last = next[next.length - 1]
              next[next.length - 1] = { ...last, content: last.content + evt.data }
              return next
            })
          } else if (evt.type === 'log') {
            setMessages(prev => {
              const next = [...prev]
              const last = next[next.length - 1]
              const logs = [...(last.logs || []), evt.data]
              next[next.length - 1] = { ...last, logs }
              return next
            })
          } else if (evt.type === 'done') {
            if (evt.data?.changed?.length) {
              refreshStatus()
            }
          } else if (evt.type === 'error') {
            setMessages(prev => {
              const next = [...prev]
              const last = next[next.length - 1]
              next[next.length - 1] = { ...last, error: evt.data }
              return next
            })
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message)
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], error: e.message }
          return next
        })
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [messages, streaming, refreshStatus])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clear = useCallback(() => setMessages([{ role: 'assistant', content: GREETING }]), [])

  return (
    <ChatContext.Provider value={{ messages, streaming, error, send, stop, clear }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useSharedChat() {
  return useContext(ChatContext)
}