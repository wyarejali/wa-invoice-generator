import { useEffect, useMemo, useRef, useState } from 'react'
import { computeTotals, money } from '../lib/invoice'
import Icon from './ui/Icon'
import Modal from './ui/Modal'

/** Every typed word must appear somewhere, so "pdf export" still finds
 *  "Export as PDF" regardless of the order they were typed in. */
function matches(haystack, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = haystack.toLowerCase()
  return words.every((word) => text.includes(word))
}

export default function CommandPalette({ open, onClose, commands, invoices, onOpenInvoice }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const listRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
    }
  }, [open])

  const rows = useMemo(() => {
    const available = commands.filter((c) => !c.disabled)
    const commandRows = available
      .filter((c) => matches(`${c.label} ${c.group ?? ''}`, query))
      .map((c) => ({ type: 'command', key: `c:${c.id}`, command: c }))

    const invoiceRows = invoices
      .filter((i) => matches(`${i.number} ${i.status}`, query))
      .slice(0, query ? 8 : 4)
      .map((i) => ({ type: 'invoice', key: `i:${i.id}`, invoice: i }))

    return [...commandRows, ...invoiceRows]
  }, [commands, invoices, query])

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, rows.length - 1)))
  }, [rows.length])

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const run = (row) => {
    onClose()
    if (row.type === 'command') row.command.run()
    else onOpenInvoice(row.invoice.id)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (rows.length ? (c + 1) % rows.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (rows.length ? (c - 1 + rows.length) % rows.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rows[cursor]) run(rows[cursor])
    }
  }

  return (
    <Modal open={open} onClose={onClose} width="max-w-xl" align="top" labelledBy="palette-label">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <Icon name="search" size={16} className="text-fg-subtle" />
        <input
          data-autofocus
          id="palette-label"
          className="w-full bg-transparent text-[14px] outline-none placeholder:text-fg-subtle"
          placeholder="Search commands and invoices…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursor(0)
          }}
          onKeyDown={onKeyDown}
          aria-label="Search commands and invoices"
        />
        <kbd className="ui-kbd">Esc</kbd>
      </div>

      <div ref={listRef} className="scroll-thin max-h-[55vh] overflow-y-auto p-1.5">
        {rows.length === 0 && (
          <p className="px-3 py-6 text-center text-[13px] text-fg-muted">No matches.</p>
        )}

        {rows.map((row, index) => {
          const active = index === cursor
          const previous = rows[index - 1]
          const showInvoiceHeader = row.type === 'invoice' && previous?.type !== 'invoice'
          return (
            <div key={row.key}>
              {showInvoiceHeader && (
                <p className="px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">
                  Invoices
                </p>
              )}
              <button
                type="button"
                data-active={active}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left ${
                  active ? 'bg-accent-soft text-accent' : 'hover:bg-raised'
                }`}
                onMouseMove={() => setCursor(index)}
                onClick={() => run(row)}
              >
                {row.type === 'command' ? (
                  <>
                    <Icon
                      name={row.command.icon}
                      size={15}
                      className={active ? '' : 'text-fg-muted'}
                    />
                    <span className="flex-1 text-[13px]">{row.command.label}</span>
                    {row.command.hint && (
                      <span className="flex shrink-0 gap-1">
                        {row.command.hint.map((k, i) => (
                          <kbd key={i} className="ui-kbd">
                            {k}
                          </kbd>
                        ))}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Icon name="receipt" size={15} className={active ? '' : 'text-fg-muted'} />
                    <span className="flex-1 font-mono text-[13px]">{row.invoice.number}</span>
                    <span className="shrink-0 text-[12px] capitalize opacity-70">
                      {row.invoice.status}
                    </span>
                    <span className="shrink-0 font-mono text-[12px] tabular-nums opacity-70">
                      {money(computeTotals(row.invoice).total)}
                    </span>
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
