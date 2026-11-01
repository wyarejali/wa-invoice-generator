import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ADJUSTMENT_KEYS,
  computeTotals,
  emptyLine,
  lineAmount,
  money,
  moveItem,
  num,
} from '../lib/invoice'
import Icon from './ui/Icon'

/** "2026-08-19" -> the viewer's locale date, matching the native control. */
function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString()
}

/**
 * Numeric field. While focused it shows the raw value so it stays easy to
 * type; otherwise a money field renders as money, carrying the adjustment's
 * sign (`-$15.00`) since the +/- toggle is chrome and never exported.
 * An empty field stays empty rather than showing a 0.00 on every blank row.
 */
function NumberField({
  value,
  onChange,
  sign = 1,
  label,
  placeholder = '0.00',
  format = 'money',
  inputRef,
  onKeyDown,
}) {
  const [editing, setEditing] = useState(false)
  const raw = value ?? ''
  const display =
    editing || raw === ''
      ? raw
      : format === 'money'
        ? `${sign === -1 ? '-' : ''}${money(raw)}`
        : String(num(raw))

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      className="field text-right tabular-nums"
      value={display}
      placeholder={placeholder}
      aria-label={label}
      onFocus={() => setEditing(true)}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        setEditing(false)
        const next = e.target.value.trim()
        if (next === '') return onChange('')
        // Normalize whatever was typed ("1,200.5", "$40") to a clean number.
        onChange(format === 'money' ? num(next).toFixed(2) : String(num(next)))
      }}
    />
  )
}

/** Textarea that grows with its content, so an empty one costs no height. */
function AutoTextarea({ value, onChange, inputRef, className = '', ...rest }) {
  const ref = useRef(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useLayoutEffect(resize, [value, resize])

  // Height depends on the wrapped line count, so it has to be recomputed when
  // the column gets narrower or wider — a viewport change, or the rail and
  // properties panel opening and closing.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [resize])

  return (
    <textarea
      ref={(el) => {
        ref.current = el
        if (typeof inputRef === 'function') inputRef(el)
      }}
      rows={1}
      className={`field resize-none overflow-hidden ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  )
}

/**
 * A sender or client block: one prominent name line and a free-form block
 * underneath. Deliberately two fields rather than six — an address, an email
 * and a tax number all live in the same place, in whatever shape the sender
 * already writes them.
 */
function Party({ label, value, onChange, namePlaceholder, detailPlaceholder, align = '' }) {
  return (
    <div className={`min-w-0 flex-1 basis-[46%] ${align}`}>
      <div className="label">{label}</div>
      <input
        className={`field mt-1 text-[16px] leading-snug font-semibold tracking-tight ${align}`}
        value={value.name}
        placeholder={namePlaceholder}
        aria-label={`${label} name`}
        onChange={(e) => onChange({ name: e.target.value }, 'name')}
      />
      <AutoTextarea
        className={`mt-0.5 text-[12.5px] leading-relaxed text-mute ${align}`}
        value={value.detail}
        placeholder={detailPlaceholder}
        aria-label={`${label} details`}
        onChange={(v) => onChange({ detail: v }, 'detail')}
      />
    </div>
  )
}

/** The +/- control that flips an adjustment between adding and subtracting. */
function SignToggle({ sign, onToggle }) {
  return (
    <button
      type="button"
      data-chrome
      title={sign === -1 ? 'Subtracting — click to add' : 'Adding — click to subtract'}
      className="h-5 w-5 shrink-0 border border-ink bg-paper text-[11px] leading-none hover:bg-ink hover:text-paper"
      onClick={onToggle}
    >
      {sign === -1 ? '−' : '+'}
    </button>
  )
}

export default function InvoiceCard({ invoice, onChange, cardRef }) {
  const totals = computeTotals(invoice)
  const items = invoice.items
  const options = invoice.options
  const withQty = options.quantity
  const business = invoice.template === 'business'

  /* ------------------------------------------------------------------ *
   * Focus handoff. Adding or removing a line sets a target; the effect
   * below focuses it once React has rendered the new row.
   * ------------------------------------------------------------------ */
  const fieldRefs = useRef(new Map())
  const [focusTarget, setFocusTarget] = useState(null)

  const register = useCallback(
    (key) => (el) => {
      if (el) fieldRefs.current.set(key, el)
      else fieldRefs.current.delete(key)
    },
    [],
  )

  useEffect(() => {
    if (!focusTarget) return
    const el = fieldRefs.current.get(`${focusTarget.id}:${focusTarget.field}`)
    if (el) {
      el.focus()
      if (focusTarget.caret === 'end') {
        const end = el.value.length
        el.setSelectionRange?.(end, end)
      }
    }
    setFocusTarget(null)
  }, [focusTarget])

  /* ------------------------------------------------------------------ *
   * Line operations
   * ------------------------------------------------------------------ */
  const setItem = (id, patch, field) =>
    onChange(
      { items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)) },
      { coalesce: `item:${id}:${field}` },
    )

  const addLineAt = useCallback(
    (index) => {
      const line = emptyLine()
      const next = [...items]
      next.splice(index, 0, line)
      onChange({ items: next })
      setFocusTarget({ id: line.id, field: 'description' })
    },
    [items, onChange],
  )

  const removeLine = (id) => {
    const index = items.findIndex((i) => i.id === id)
    const rest = items.filter((i) => i.id !== id)
    onChange({ items: rest.length ? rest : [emptyLine()] })
    // Land on the row that takes its place, or the one above it.
    const neighbour = rest[index] || rest[index - 1]
    if (neighbour) setFocusTarget({ id: neighbour.id, field: 'description', caret: 'end' })
  }

  const moveLine = (from, to, { instant = false } = {}) => {
    const next = moveItem(items, from, to)
    if (next === items) return
    onChange(
      { items: next },
      // A whole drag collapses into one undo step; keyboard nudges use the
      // normal time window so a pause starts a fresh one.
      { coalesce: 'reorder', coalesceMs: instant ? Infinity : undefined },
    )
  }

  /* ------------------------------------------------------------------ *
   * Pointer-driven reordering. Works with mouse, pen and touch, which
   * HTML5 drag-and-drop does not.
   * ------------------------------------------------------------------ */
  const listRef = useRef(null)
  const dragRef = useRef(null)
  const [draggingId, setDraggingId] = useState(null)

  const beginDrag = (e, id) => {
    if (e.button != null && e.button !== 0) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Capture can be refused if the pointer is already gone; the drag still
      // works through the handler on this element.
    }
    dragRef.current = { id, pointerId: e.pointerId }
    setDraggingId(id)
  }

  const onDragMove = (e) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const rows = Array.from(listRef.current?.querySelectorAll('[data-line-row]') ?? [])
    const from = items.findIndex((i) => i.id === drag.id)
    if (from < 0 || rows.length < 2) return

    // The first row whose midpoint sits below the pointer is the drop target.
    let to = rows.findIndex((row) => {
      const box = row.getBoundingClientRect()
      return e.clientY < box.top + box.height / 2
    })
    if (to === -1) to = rows.length - 1
    if (to !== from) moveLine(from, to, { instant: true })
  }

  const endDrag = (e) => {
    const drag = dragRef.current
    if (!drag) return
    try {
      e.currentTarget.releasePointerCapture(drag.pointerId)
    } catch {
      /* the pointer may already be released */
    }
    dragRef.current = null
    setDraggingId(null)
  }

  /* ------------------------------------------------------------------ *
   * Keyboard flow through the line items
   * ------------------------------------------------------------------ */
  const nudge = (e, index) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return false
    e.preventDefault()
    moveLine(index, index + (e.key === 'ArrowUp' ? -1 : 1))
    return true
  }

  const isPlainEnter = (e) => e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey

  /** Enter walks the row left to right, then starts the next line. */
  const onFieldKey = (e, item, index, field) => {
    if (nudge(e, index)) return
    if (!isPlainEnter(e)) return

    const order = withQty ? ['description', 'qty', 'rate'] : ['description', 'amount']
    const at = order.indexOf(field)
    e.preventDefault()
    if (at > -1 && at < order.length - 1) {
      setFocusTarget({ id: item.id, field: order[at + 1] })
    } else {
      addLineAt(index + 1)
    }
  }

  const onDescriptionKey = (e, item, index) => {
    // Backspace on a line that holds nothing removes it, like a list editor.
    if (
      e.key === 'Backspace' &&
      item.description === '' &&
      String(item.amount ?? '') === '' &&
      String(item.qty ?? '') === '' &&
      String(item.rate ?? '') === '' &&
      items.length > 1
    ) {
      e.preventDefault()
      removeLine(item.id)
      return
    }
    onFieldKey(e, item, index, 'description')
  }

  // ⌘/Ctrl+Enter adds a line from anywhere in the editor.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return
      // A dialog (command palette, confirm) owns the keyboard while open.
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      addLineAt(items.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addLineAt, items.length])

  const setParty = (which, patch, field) =>
    onChange(
      { [which]: { ...invoice[which], ...patch } },
      { coalesce: `${which}:${field}` },
    )

  const setAdjustment = (key, patch, field) =>
    onChange(
      {
        adjustments: {
          ...invoice.adjustments,
          [key]: { ...invoice.adjustments[key], ...patch },
        },
      },
      field ? { coalesce: `adj:${key}:${field}` } : undefined,
    )

  // No auto margins on the captured node: html-to-image inlines the *resolved*
  // margin, so an `mx-auto` here would offset and clip the export.
  return (
    <div
      ref={cardRef}
      className="w-full border border-ink bg-paper px-6 py-8 font-mono text-[14px] text-ink sm:px-10 sm:py-12"
    >
      {/* Header ------------------------------------------------------- *
        * Both layouts carry the same number and date; the business one adds
        * the sender above them and the client below.                       */}
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        {business ? (
          <Party
            label="From"
            value={invoice.from}
            namePlaceholder="Your name or business"
            detailPlaceholder={'Street address\nCity, country\nemail · phone'}
            onChange={(patch, field) => setParty('from', patch, field)}
          />
        ) : (
          <div className="min-w-0">
            <div className="label">Invoice</div>
            <input
              className="field mt-1 text-2xl tracking-tight sm:text-3xl"
              value={invoice.number}
              placeholder="#000000"
              aria-label="Invoice number"
              onChange={(e) => onChange({ number: e.target.value }, { coalesce: 'number' })}
            />
          </div>
        )}

        {/* A fixed width, because the number input's intrinsic size is wide
            enough to wrap the whole block onto its own row otherwise. */}
        <div
          className={
            business ? 'w-full shrink-0 sm:w-44 sm:text-right' : 'text-left sm:text-right'
          }
        >
          {business && (
            <>
              <div className="label">Invoice</div>
              <input
                className="field mt-1 text-2xl tracking-tight sm:text-right sm:text-3xl"
                value={invoice.number}
                placeholder="#000000"
                aria-label="Invoice number"
                onChange={(e) => onChange({ number: e.target.value }, { coalesce: 'number' })}
              />
            </>
          )}
          <div className={`label ${business ? 'mt-3' : ''}`}>Date</div>
          {/* The native picker (calendar glyph and all) is chrome; exports get
              the plain formatted string from the sibling below instead. */}
          <input
            type="date"
            data-chrome
            className="field mt-1 text-left sm:text-right"
            value={invoice.date}
            aria-label="Invoice date"
            onChange={(e) => onChange({ date: e.target.value })}
          />
          <span data-print className="mt-1 tabular-nums">
            {formatDate(invoice.date)}
          </span>
        </div>
      </div>

      {business && (
        <>
          <div className="mt-6 border-t border-faint" />
          <div className="mt-5 flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
            <Party
              label="Bill to"
              value={invoice.to}
              namePlaceholder="Client name"
              detailPlaceholder={'Company\nAddress\nemail'}
              onChange={(patch, field) => setParty('to', patch, field)}
            />
            {/* Derived, not a field: the figure a client looks for first. */}
            <div className="border border-ink px-4 py-3 sm:min-w-[11rem] sm:text-right">
              <div className="label">Amount due</div>
              <div className="mt-1 text-xl tabular-nums">{money(totals.total)}</div>
            </div>
          </div>
        </>
      )}

      <div className="mt-6 border-t-2 border-ink" />

      {/* Line items --------------------------------------------------- */}
      <div className="mt-5 flex items-center gap-3 pb-2 text-[10px] tracking-[0.16em] text-mute uppercase">
        <span className="w-6">#</span>
        <span className="flex-1">Description</span>
        {withQty && <span className="hidden w-14 text-right sm:block">Qty</span>}
        {withQty && <span className="hidden w-24 text-right sm:block">Price</span>}
        <span className="hidden w-28 text-right sm:block">Amount</span>
        <span data-chrome className="hidden w-5 sm:block" />
      </div>

      <div ref={listRef} className={draggingId ? 'select-none' : undefined}>
        {items.map((item, idx) => {
          const computed = lineAmount(item, options)
          const hasQtyValues = String(item.qty ?? '') !== '' || String(item.rate ?? '') !== ''
          return (
            <div
              key={item.id}
              data-line-row
              className={`group/row flex flex-wrap items-start gap-x-3 border-t border-faint py-2 ${
                draggingId === item.id ? 'bg-faint/40' : ''
              }`}
            >
              {/* The row number doubles as the drag handle: the grip fades in
                  over it on hover, and being chrome it never reaches an export. */}
              <div className="relative w-6 shrink-0">
                <span
                  data-line-number
                  className="block text-mute tabular-nums group-hover/row:opacity-0"
                >
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  data-chrome
                  aria-label={`Reorder line ${idx + 1}`}
                  title="Drag to reorder (⌥↑ / ⌥↓)"
                  style={{ touchAction: 'none' }}
                  className="absolute inset-0 flex cursor-grab items-center justify-center text-mute opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
                  onPointerDown={(e) => beginDrag(e, item.id)}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={(e) => nudge(e, idx)}
                >
                  <Icon name="grip" size={14} stroke={2} />
                </button>
              </div>

              {/* Description column, with the optional detail underneath. */}
              <div className="min-w-0 flex-1">
                <input
                  ref={register(`${item.id}:description`)}
                  className="field"
                  value={item.description}
                  placeholder="Description"
                  aria-label={`Line ${idx + 1} description`}
                  onChange={(e) =>
                    setItem(item.id, { description: e.target.value }, 'description')
                  }
                  onKeyDown={(e) => onDescriptionKey(e, item, idx)}
                />
                {options.itemDetail && (
                  <AutoTextarea
                    inputRef={register(`${item.id}:detail`)}
                    value={item.detail ?? ''}
                    placeholder="Add a description…"
                    aria-label={`Line ${idx + 1} detail`}
                    onChange={(v) => setItem(item.id, { detail: v }, 'detail')}
                  />
                )}
              </div>

              {/* w-full drops this group onto its own line on phones; from `sm`
                  up it sits back in the numeric columns. */}
              <div
                className={`flex w-full items-start gap-2 sm:w-auto sm:gap-3 sm:pl-0 ${
                  withQty ? '' : 'pl-9'
                }`}
              >
                {withQty && (
                  <>
                    <div className="w-14 shrink-0">
                      <NumberField
                        inputRef={register(`${item.id}:qty`)}
                        value={item.qty}
                        format="plain"
                        placeholder="Qty"
                        label={`Line ${idx + 1} quantity`}
                        onChange={(v) => setItem(item.id, { qty: v }, 'qty')}
                        onKeyDown={(e) => onFieldKey(e, item, idx, 'qty')}
                      />
                    </div>
                    <div className="min-w-0 flex-1 sm:w-24 sm:flex-none">
                      <NumberField
                        inputRef={register(`${item.id}:rate`)}
                        value={item.rate}
                        placeholder="Price"
                        label={`Line ${idx + 1} price`}
                        onChange={(v) => setItem(item.id, { rate: v }, 'rate')}
                        onKeyDown={(e) => onFieldKey(e, item, idx, 'rate')}
                      />
                    </div>
                  </>
                )}

                {withQty ? (
                  // Derived from qty x price, so it is shown rather than typed.
                  <span className="w-24 shrink-0 py-[2px] text-right tabular-nums sm:w-28">
                    {hasQtyValues ? money(computed) : ''}
                  </span>
                ) : (
                  <div className="min-w-0 flex-1 sm:w-28 sm:flex-none">
                    <NumberField
                      inputRef={register(`${item.id}:amount`)}
                      value={item.amount}
                      label={`Line ${idx + 1} amount`}
                      onChange={(v) => setItem(item.id, { amount: v }, 'amount')}
                      onKeyDown={(e) => onFieldKey(e, item, idx, 'amount')}
                    />
                  </div>
                )}

                <button
                  type="button"
                  data-chrome
                  aria-label={`Remove line ${idx + 1}`}
                  title="Remove line"
                  className="w-5 shrink-0 text-mute hover:text-ink"
                  onClick={() => removeLine(item.id)}
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}

        {invoice.previousBalance.enabled && (
          <div className="flex flex-wrap items-start gap-x-3 border-t border-faint py-2">
            <span className="w-6 shrink-0" />
            <input
              className="field min-w-0 flex-1"
              value={invoice.previousBalance.label}
              placeholder="Previous balance"
              aria-label="Previous balance label"
              onChange={(e) =>
                onChange(
                  { previousBalance: { ...invoice.previousBalance, label: e.target.value } },
                  { coalesce: 'prev:label' },
                )
              }
            />
            <div className="flex w-full items-start gap-3 pl-9 sm:w-auto sm:pl-0">
              <div className="min-w-0 flex-1 sm:w-28 sm:flex-none">
                <NumberField
                  value={invoice.previousBalance.amount}
                  label="Previous balance amount"
                  onChange={(v) =>
                    onChange(
                      { previousBalance: { ...invoice.previousBalance, amount: v } },
                      { coalesce: 'prev:amount' },
                    )
                  }
                />
              </div>
              <span data-chrome className="w-5 shrink-0" />
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        data-chrome
        className="mt-3 w-full border border-dashed border-mute py-2.5 text-[11px] tracking-[0.16em] text-mute uppercase hover:border-ink hover:text-ink"
        onClick={() => addLineAt(items.length)}
      >
        + Add line
      </button>

      <div className="mt-6 border-t-2 border-ink" />

      {/* Totals ------------------------------------------------------- */}
      <div className="mt-4 flex justify-end">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 py-1.5">
            <span data-chrome className="w-5 shrink-0" />
            <span className="flex-1 text-right text-[10px] tracking-[0.16em] text-mute uppercase">
              Subtotal
            </span>
            <span className="w-28 shrink-0 text-right tabular-nums">
              {money(totals.subtotal)}
            </span>
          </div>

          {ADJUSTMENT_KEYS.map((key) => {
            const adj = invoice.adjustments[key]
            if (!adj.enabled) return null
            return (
              <div key={key} className="flex items-center gap-3 border-t border-faint py-1.5">
                <SignToggle
                  sign={adj.sign}
                  onToggle={() => setAdjustment(key, { sign: adj.sign === -1 ? 1 : -1 })}
                />
                <input
                  className="field flex-1 text-right"
                  value={adj.label}
                  placeholder={key}
                  aria-label={`${key} label`}
                  onChange={(e) => setAdjustment(key, { label: e.target.value }, 'label')}
                />
                <div className="w-28 shrink-0">
                  <NumberField
                    value={adj.amount}
                    sign={adj.sign}
                    label={`${key} amount`}
                    onChange={(v) => setAdjustment(key, { amount: v }, 'amount')}
                  />
                </div>
              </div>
            )
          })}

          <div className="mt-1 flex items-center gap-3 border-t border-ink pt-3">
            <span data-chrome className="w-5 shrink-0" />
            <span className="flex-1 text-right text-[10px] tracking-[0.16em] text-mute uppercase">
              Total
            </span>
            <span className="w-28 shrink-0 text-right text-xl tabular-nums">
              {money(totals.total)}
            </span>
          </div>
        </div>
      </div>

      {/* Footer ------------------------------------------------------- */}
      {business && (
        <div className="mt-10 border-t border-faint pt-4">
          <div className="label">Payment details</div>
          <AutoTextarea
            className="mt-0.5 text-[12.5px] leading-relaxed"
            value={invoice.payment}
            placeholder={'Bank · account or IBAN\nor a payment link'}
            aria-label="Payment details"
            onChange={(v) => onChange({ payment: v }, { coalesce: 'payment' })}
          />
        </div>
      )}

      <div
        className={`${
          business ? 'mt-8' : 'mt-12'
        } flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between`}
      >
        <textarea
          className="field min-h-[2.5rem] w-full resize-none italic sm:flex-1"
          rows={2}
          value={invoice.note}
          placeholder="Footer note"
          aria-label="Footer note"
          onChange={(e) => onChange({ note: e.target.value }, { coalesce: 'note' })}
        />
        {/* Grid mirror: the invisible span sizes the cell, so the badge grows
            and shrinks with its text instead of clipping it. */}
        <div className="inline-grid shrink-0">
          <span
            aria-hidden
            className="col-start-1 row-start-1 invisible border border-transparent px-3 py-2 text-[11px] tracking-[0.16em] whitespace-pre uppercase"
          >
            {invoice.terms || 'Terms'}
          </span>
          <input
            className="col-start-1 row-start-1 border border-ink bg-ink px-3 py-2 text-center text-[11px] tracking-[0.16em] text-paper uppercase"
            value={invoice.terms}
            placeholder="Terms"
            aria-label="Payment terms"
            onChange={(e) => onChange({ terms: e.target.value }, { coalesce: 'terms' })}
          />
        </div>
      </div>
    </div>
  )
}
