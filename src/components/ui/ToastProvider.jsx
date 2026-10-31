import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Icon from './Icon'

const ToastContext = createContext(null)

let nextId = 0

/** Transient messages, optionally carrying a single action such as Undo. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }, [])

  const toast = useCallback(
    ({ title, description, action, tone = 'default', duration }) => {
      const id = ++nextId
      // A toast carrying an action sticks around long enough to be clicked.
      const ms = duration ?? (action ? 7000 : 3500)
      setToasts((prev) => [...prev.slice(-3), { id, title, description, action, tone }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms),
      )
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const map = timers.current
    return () => map.forEach(clearTimeout)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="ui-panel pointer-events-auto flex items-start gap-3 px-3.5 py-3"
          >
            {t.tone === 'error' && (
              <Icon name="alert" size={16} className="mt-0.5 text-danger" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-[12px] text-fg-muted">{t.description}</p>
              )}
            </div>
            {t.action && (
              <button
                type="button"
                className="shrink-0 text-[12px] font-semibold text-accent hover:underline"
                onClick={() => {
                  t.action.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              className="ui-icon-btn h-6 w-6 shrink-0"
              onClick={() => dismiss(t.id)}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
