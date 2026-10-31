import { useEffect, useRef, useState } from 'react'

/**
 * Popover anchored to a trigger. Closes on Escape, on an outside click, and
 * whenever the content calls `close()`.
 *
 *   <Dropdown trigger={(open) => <button>…</button>}>
 *     {(close) => <MenuItem onClick={() => { … ; close() }} />}
 *   </Dropdown>
 */
export default function Dropdown({
  trigger,
  children,
  align = 'right',
  width = 'w-56',
  label,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        {trigger(open)}
      </div>
      {open && (
        <div
          role="menu"
          className={`ui-panel absolute z-40 mt-1.5 ${width} p-1 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** A row inside a Dropdown. */
export function MenuItem({ children, onClick, disabled, danger, trailing }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] disabled:opacity-40 ${
        danger ? 'text-danger hover:bg-danger/10' : 'hover:bg-raised'
      }`}
    >
      {children}
      {trailing && <span className="ml-auto">{trailing}</span>}
    </button>
  )
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-line" />
}
