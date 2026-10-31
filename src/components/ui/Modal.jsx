import { useEffect, useRef } from 'react'

/**
 * Overlay dialog. Closes on Escape and on a click outside the panel, restores
 * focus to whatever was focused before it opened, and keeps Tab inside itself
 * while open.
 */
export default function Modal({
  open,
  onClose,
  labelledBy,
  children,
  width = 'max-w-md',
  align = 'center',
}) {
  const panelRef = useRef(null)
  const restoreRef = useRef(null)

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    // Focus the first meaningful control once the panel is mounted.
    const id = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector('[data-autofocus]')
      ;(target || panelRef.current)?.focus()
    })

    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
      cancelAnimationFrame(id)
      restoreRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={`ui-overlay z-50 flex justify-center px-4 ${
        align === 'top' ? 'items-start pt-[12vh]' : 'items-center'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`ui-panel w-full ${width} outline-none`}
      >
        {children}
      </div>
    </div>
  )
}
