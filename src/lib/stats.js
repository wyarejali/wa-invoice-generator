// Everything the dashboard shows, derived from the invoice list and nothing
// else. Pure functions: no component needs to know how a figure is reached,
// and each one can be checked on its own.

import { computeTotals, daysBetween, isOverdue, reckoningDate, todayISO } from './invoice'

const OPEN = ['unpaid', 'sent']

/** "2026-11-14T09:00:00Z" -> "2026-11" */
function monthKey(iso) {
  return String(iso || '').slice(0, 7)
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' })
}

function total(invoice) {
  return computeTotals(invoice).total
}

function sum(list) {
  return list.reduce((acc, inv) => acc + total(inv), 0)
}

/** Shift an ISO day by `days`, staying in the local calendar. */
function shiftDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * The four figures at the top of the dashboard.
 *
 * Outstanding and drafts are stocks — what is true right now. Paid is a flow,
 * so it is measured over a window and compared with the window before it,
 * which is the only way a single number says whether things are improving.
 */
export function summary(invoices, today = todayISO()) {
  const open = invoices.filter((i) => OPEN.includes(i.status))
  const overdue = open.filter((i) => isOverdue(i, today))
  const drafts = invoices.filter((i) => i.status === 'draft')
  const paid = invoices.filter((i) => i.status === 'paid' && i.paidAt)

  const windowStart = shiftDays(today, -30)
  const previousStart = shiftDays(today, -60)
  const paidIn = (from, to) =>
    paid.filter((i) => {
      const day = String(i.paidAt).slice(0, 10)
      return day >= from && day < to
    })

  const recent = paidIn(windowStart, shiftDays(today, 1))
  const previous = paidIn(previousStart, windowStart)
  const recentAmount = sum(recent)
  const previousAmount = sum(previous)

  const ages = open.map((i) => daysBetween(reckoningDate(i), today)).filter((n) => n !== null)
  const speeds = paid
    .map((i) => daysBetween(i.date, String(i.paidAt).slice(0, 10)))
    .filter((n) => n !== null && n >= 0)

  return {
    outstanding: { amount: sum(open), count: open.length },
    overdue: { amount: sum(overdue), count: overdue.length },
    drafts: { amount: sum(drafts), count: drafts.length },
    paidRecent: {
      amount: recentAmount,
      count: recent.length,
      // No previous window to compare against is not the same as 0% change.
      change: previousAmount > 0 ? (recentAmount - previousAmount) / previousAmount : null,
    },
    oldestOpenDays: ages.length ? Math.max(...ages) : null,
    daysToPay: { median: median(speeds), count: speeds.length },
    average: invoices.length ? sum(invoices) / invoices.length : 0,
    count: invoices.length,
  }
}

/**
 * Billed against collected, month by month. Billed reads the invoice date —
 * when the work was charged for — while collected reads `paidAt`, when the
 * money actually arrived, so the gap between the two bars is the lag.
 */
export function monthlySeries(invoices, months = 12, today = todayISO()) {
  const [year, month] = today.split('-').map(Number)
  const keys = []
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(year, month - 1 - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const empty = () => ({ billed: 0, collected: 0, billedCount: 0, collectedCount: 0 })
  const byKey = new Map(keys.map((k) => [k, empty()]))

  for (const invoice of invoices) {
    const value = total(invoice)
    const billedAt = byKey.get(monthKey(invoice.date))
    if (billedAt && invoice.status !== 'draft') {
      billedAt.billed += value
      billedAt.billedCount += 1
    }
    if (invoice.status === 'paid' && invoice.paidAt) {
      const collectedAt = byKey.get(monthKey(invoice.paidAt))
      if (collectedAt) {
        collectedAt.collected += value
        collectedAt.collectedCount += 1
      }
    }
  }

  return keys.map((key) => ({ key, label: monthLabel(key), ...byKey.get(key) }))
}

/**
 * Count and value per status. Overdue is deliberately absent: it is drawn
 * from unpaid and sent, so including it would count the same money twice.
 */
export function statusMix(invoices) {
  const order = ['draft', 'unpaid', 'sent', 'paid']
  return order.map((status) => {
    const rows = invoices.filter((i) => i.status === status)
    return { status, count: rows.length, amount: sum(rows) }
  })
}

export const AGING_BUCKETS = [
  { id: 'notdue', label: 'Not due yet', from: -Infinity, to: -1 },
  { id: '0-30', label: '1–30 days', from: 0, to: 30 },
  { id: '31-60', label: '31–60 days', from: 31, to: 60 },
  { id: '61-90', label: '61–90 days', from: 61, to: 90 },
  { id: '90+', label: 'Over 90 days', from: 91, to: Infinity },
]

/**
 * Open invoices by how long they have been waiting, measured from the due
 * date where there is one and the invoice date where there is not.
 */
export function agingBuckets(invoices, today = todayISO()) {
  const open = invoices.filter((i) => OPEN.includes(i.status))
  const buckets = AGING_BUCKETS.map((b) => ({ ...b, amount: 0, count: 0, invoices: [] }))

  for (const invoice of open) {
    const age = daysBetween(reckoningDate(invoice), today) ?? 0
    const bucket = buckets.find((b) => age >= b.from && age <= b.to) || buckets[buckets.length - 1]
    bucket.amount += total(invoice)
    bucket.count += 1
    bucket.invoices.push({ invoice, age })
  }

  const waiting = open
    .map((invoice) => ({ invoice, age: daysBetween(reckoningDate(invoice), today) ?? 0 }))
    .sort((a, b) => b.age - a.age)

  return { buckets, oldest: waiting[0] || null, waiting }
}

/**
 * Who the money comes from. Only the business layout carries a client name,
 * so everything else lands in one honest bucket rather than being dropped.
 */
export function topClients(invoices, limit = 5) {
  const byName = new Map()
  for (const invoice of invoices) {
    if (invoice.status === 'draft') continue
    const name = invoice.to?.name?.trim() || 'No client recorded'
    const row = byName.get(name) || { name, amount: 0, outstanding: 0, count: 0 }
    row.amount += total(invoice)
    if (OPEN.includes(invoice.status)) row.outstanding += total(invoice)
    row.count += 1
    byName.set(name, row)
  }
  const rows = [...byName.values()].sort((a, b) => b.amount - a.amount)
  return { rows: rows.slice(0, limit), more: Math.max(0, rows.length - limit) }
}

/** Most recently touched, for the activity list. */
export function recentlyTouched(invoices, limit = 6) {
  return [...invoices]
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, limit)
}
