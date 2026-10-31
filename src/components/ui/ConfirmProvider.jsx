import { createContext, useCallback, useContext, useRef, useState } from 'react'
import Modal from './Modal'

const ConfirmContext = createContext(null)

/**
 * Promise-based confirmation.
 *
 *   const confirm = useConfirm()
 *   if (await confirm({ title: 'Delete invoice?', tone: 'danger' })) { … }
 *
 * One dialog is rendered for the whole app, which keeps every call site free
 * of its own open/close state.
 */
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null)
  const resolveRef = useRef(null)

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setRequest({
        title: 'Are you sure?',
        body: null,
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        tone: 'default',
        ...options,
      })
    })
  }, [])

  const settle = useCallback((value) => {
    setRequest(null)
    resolveRef.current?.(value)
    resolveRef.current = null
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={Boolean(request)} onClose={() => settle(false)} labelledBy="confirm-title">
        {request && (
          <div className="p-5">
            <h2 id="confirm-title" className="text-[15px] font-semibold">
              {request.title}
            </h2>
            {request.body && (
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{request.body}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="ui-btn" onClick={() => settle(false)}>
                {request.cancelLabel}
              </button>
              <button
                type="button"
                data-autofocus
                className={`ui-btn ${request.tone === 'danger' ? 'ui-btn-danger' : 'ui-btn-primary'}`}
                onClick={() => settle(true)}
              >
                {request.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return ctx
}
