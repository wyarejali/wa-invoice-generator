import { useEffect, useRef, useState } from 'react'
import Icon from './ui/Icon'

export default function ExportMenu({ onExport, busy }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = async (format) => {
    setOpen(false)
    await onExport(format)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="ui-btn ui-btn-primary"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="download" size={14} />
        {busy ? 'Exporting…' : 'Export'}
        <Icon name="chevronDown" size={13} />
      </button>

      {open && (
        <div
          role="menu"
          className="ui-panel absolute right-0 z-30 mt-1.5 w-44 overflow-hidden p-1"
        >
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-raised"
            onClick={() => pick('png')}
          >
            <Icon name="image" size={15} className="text-fg-muted" />
            <span className="flex-1">PNG image</span>
          </button>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-raised"
            onClick={() => pick('pdf')}
          >
            <Icon name="file" size={15} className="text-fg-muted" />
            <span className="flex-1">PDF document</span>
          </button>
        </div>
      )}
    </div>
  )
}
