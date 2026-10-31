// Invoice model: creation, numbering, and money math.
// Everything else in the app treats these shapes as read-only and produces
// new objects, so React state updates stay cheap and predictable.

export const STATUSES = ['draft', 'unpaid', 'sent', 'paid']

export const ADJUSTMENT_KEYS = ['discount', 'tax', 'fee']

const ADJUSTMENT_DEFAULTS = {
  discount: { label: 'Discount', sign: -1 },
  tax: { label: 'Tax', sign: 1 },
  fee: { label: 'Fee', sign: 1 },
}

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Fallback for older browsers / non-secure origins.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function todayISO() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

/** "2026-09-04" -> "260904" */
function ymd(dateISO) {
  const [y, m, d] = (dateISO || todayISO()).split('-')
  return `${y.slice(2)}${m}${d}`
}

/**
 * Build a `#YYMMDD` number for `dateISO`, appending -2, -3, … until it no
 * longer collides with anything in `existing`.
 */
export function generateNumber(existing = [], dateISO = todayISO()) {
  const taken = new Set(existing.map((n) => String(n).trim().toLowerCase()))
  const base = `#${ymd(dateISO)}`
  if (!taken.has(base.toLowerCase())) return base
  let n = 2
  while (taken.has(`${base}-${n}`.toLowerCase())) n += 1
  return `${base}-${n}`
}

export function emptyLine() {
  return { id: uid(), description: '', detail: '', qty: '', rate: '', amount: '' }
}

/** Optional columns and rows, toggled from the properties panel. */
export const DEFAULT_OPTIONS = { itemDetail: false, quantity: false }

export function createInvoice(existingNumbers = []) {
  const date = todayISO()
  const now = new Date().toISOString()
  return {
    id: uid(),
    number: generateNumber(existingNumbers, date),
    date,
    status: 'draft',
    items: [emptyLine()],
    options: { ...DEFAULT_OPTIONS },
    previousBalance: { enabled: false, label: 'Previous balance', amount: '' },
    adjustments: {
      discount: { enabled: false, label: 'Discount', amount: '', sign: -1 },
      tax: { enabled: false, label: 'Tax', amount: '', sign: 1 },
      fee: { enabled: false, label: 'Fee', amount: '', sign: 1 },
    },
    note: 'Thank you for your business.',
    terms: 'DUE ON RECEIPT',
    createdAt: now,
    updatedAt: now,
  }
}

/** Coerce whatever is in a money field into a finite number. */
export function num(value) {
  if (value === '' || value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function money(value) {
  const n = num(value)
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * What a line contributes. With the quantity column on, the amount is derived
 * from qty x price and the stored `amount` is ignored; with it off, the typed
 * amount is used directly.
 */
export function lineAmount(item, options) {
  if (options?.quantity) return num(item.qty) * num(item.rate)
  return num(item.amount)
}

export function computeTotals(invoice) {
  const options = invoice.options || DEFAULT_OPTIONS
  const lines = (invoice.items || []).reduce((sum, i) => sum + lineAmount(i, options), 0)
  const prev = invoice.previousBalance?.enabled ? num(invoice.previousBalance.amount) : 0
  const subtotal = lines + prev

  const applied = ADJUSTMENT_KEYS.map((key) => {
    const a = invoice.adjustments?.[key]
    if (!a?.enabled) return null
    const sign = a.sign === -1 ? -1 : 1
    return { key, label: a.label || ADJUSTMENT_DEFAULTS[key].label, sign, value: sign * num(a.amount) }
  }).filter(Boolean)

  const total = applied.reduce((sum, a) => sum + a.value, subtotal)
  return { lines, prev, subtotal, applied, total }
}

export function nextStatus(status) {
  const i = STATUSES.indexOf(status)
  return STATUSES[(i + 1) % STATUSES.length]
}

/**
 * Repair an invoice coming from storage, an import file, or the cloud so the
 * editor never has to guard against missing fields.
 */
export function normalizeInvoice(raw = {}) {
  const base = createInvoice()
  const adjustments = {}
  for (const key of ADJUSTMENT_KEYS) {
    const src = raw.adjustments?.[key] || {}
    adjustments[key] = {
      enabled: Boolean(src.enabled),
      label: src.label || ADJUSTMENT_DEFAULTS[key].label,
      amount: src.amount ?? '',
      sign: src.sign === -1 ? -1 : 1,
    }
  }
  const items = Array.isArray(raw.items) && raw.items.length
    ? raw.items.map((i) => ({
        id: i.id || uid(),
        description: i.description ?? '',
        detail: i.detail ?? '',
        qty: i.qty ?? '',
        rate: i.rate ?? '',
        amount: i.amount ?? '',
      }))
    : [emptyLine()]

  return {
    id: raw.id || base.id,
    number: raw.number || base.number,
    date: raw.date || base.date,
    status: STATUSES.includes(raw.status) ? raw.status : 'draft',
    items,
    options: {
      itemDetail: Boolean(raw.options?.itemDetail),
      quantity: Boolean(raw.options?.quantity),
    },
    previousBalance: {
      enabled: Boolean(raw.previousBalance?.enabled),
      label: raw.previousBalance?.label || 'Previous balance',
      amount: raw.previousBalance?.amount ?? '',
    },
    adjustments,
    note: raw.note ?? base.note,
    terms: raw.terms ?? base.terms,
    createdAt: raw.createdAt || base.createdAt,
    updatedAt: raw.updatedAt || base.updatedAt,
  }
}

/** Newest first, by invoice date then creation time. */
export function sortInvoices(list) {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1
  })
}

/** Copy an invoice as a fresh draft: new ids, new number, today's date. */
export function duplicateInvoice(source, existingNumbers = []) {
  const now = new Date().toISOString()
  const date = todayISO()
  return {
    ...normalizeInvoice(source),
    id: uid(),
    number: generateNumber(existingNumbers, date),
    date,
    status: 'draft',
    // Fresh ids, or React would see two rows sharing a key across invoices.
    items: (source.items || []).map((i) => ({ ...i, id: uid() })),
    createdAt: now,
    updatedAt: now,
  }
}

/** Move `from` to `to`, returning a new array. Out-of-range indexes no-op. */
export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Sum of an invoice list's totals — used for the sidebar's outstanding figure. */
export function sumTotals(list) {
  return list.reduce((sum, inv) => sum + computeTotals(inv).total, 0)
}
