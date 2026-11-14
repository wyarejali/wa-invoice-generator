import { ADJUSTMENT_KEYS, computeTotals, daysBetween, normalizeInvoice } from './invoice'

const KEY = 'wainvoice:invoices:v1'

export function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(normalizeInvoice) : []
  } catch {
    // Corrupt or unavailable storage (private mode, cleared site data).
    return []
  }
}

export function saveLocal(invoices) {
  try {
    localStorage.setItem(KEY, JSON.stringify(invoices))
  } catch {
    /* quota or blocked storage — the in-memory copy still works */
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function downloadJSON(invoices, filename = 'invoices.json') {
  const blob = new Blob([JSON.stringify(invoices, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Anything with a comma, a quote or a newline has to be quoted; "" escapes a quote. */
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const CSV_COLUMNS = [
  'number',
  'date',
  'due_date',
  'status',
  'client',
  'lines',
  'subtotal',
  ...ADJUSTMENT_KEYS,
  'total',
  'sent_at',
  'paid_at',
  'days_to_pay',
]

/**
 * One row per invoice, for a spreadsheet or a bookkeeper. Money is written as
 * bare numbers — a currency symbol in a CSV cell is a string, and nobody can
 * sum a column of strings.
 */
export function downloadCSV(invoices, filename = 'invoices.csv') {
  const rows = invoices.map((invoice) => {
    const totals = computeTotals(invoice)
    const applied = Object.fromEntries(totals.applied.map((a) => [a.key, a.value.toFixed(2)]))
    const paidDay = invoice.paidAt ? String(invoice.paidAt).slice(0, 10) : ''
    return {
      number: invoice.number,
      date: invoice.date,
      due_date: invoice.options?.dueDate ? invoice.dueDate || '' : '',
      status: invoice.status,
      client: invoice.to?.name || '',
      lines: invoice.items.length,
      subtotal: totals.subtotal.toFixed(2),
      ...Object.fromEntries(ADJUSTMENT_KEYS.map((key) => [key, applied[key] ?? ''])),
      total: totals.total.toFixed(2),
      sent_at: invoice.sentAt ? String(invoice.sentAt).slice(0, 10) : '',
      paid_at: paidDay,
      days_to_pay: paidDay ? (daysBetween(invoice.date, paidDay) ?? '') : '',
    }
  })

  const body = [CSV_COLUMNS, ...rows.map((row) => CSV_COLUMNS.map((key) => row[key]))]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')

  const blob = new Blob([`\ufeff${body}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Read a user-picked .json file and return normalized invoices. */
export async function readJSONFile(file) {
  const text = await file.text()
  const parsed = JSON.parse(text)
  // Accept either a bare array or { invoices: [...] }.
  const list = Array.isArray(parsed) ? parsed : parsed?.invoices
  if (!Array.isArray(list)) throw new Error('File does not contain an invoice array.')
  return list.map(normalizeInvoice)
}
