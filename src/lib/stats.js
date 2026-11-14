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

/* ------------------------------------------------------------------------- *
 * Periods
 *
 * Every figure on the dashboard is either a stock — true right now, like what
 * is outstanding — or a flow, true over a span of time, like what came in.
 * Stocks ignore the period; flows are measured against one of these.
 * ------------------------------------------------------------------------- */

export const PERIODS = [
  { id: 'month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'year', label: 'This year' },
  { id: 'last-year', label: 'Last year' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom range' },
]

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

/** Days in month `m` (1-based) of year `y`. Day 0 of the next month. */
const lastDay = (y, m) => new Date(y, m, 0).getDate()

function monthName(y, m) {
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** Whole calendar months from `from` to `to`, inclusive of both ends. */
export function monthsSpan(from, to) {
  if (!from || !to) return 0
  const [fy, fm] = String(from).slice(0, 7).split('-').map(Number)
  const [ty, tm] = String(to).slice(0, 7).split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm) + 1
}

function inRange(day, from, to) {
  if (!day) return false
  const d = String(day).slice(0, 10)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

/**
 * Resolve a period id into the days it covers.
 *
 * `from`/`to` are inclusive ISO days, and either may be null, which means
 * unbounded — that is what "all time" is. `open` marks a period that has not
 * finished yet, which is what makes a comparison with the one before it unfair
 * unless the comparison is cut to the same length.
 */
export function periodRange(id, today = todayISO(), custom = {}) {
  const [y, m] = today.split('-').map(Number)
  const make = (from, to, label) => ({ id, from, to, label, open: !to || to >= today })

  switch (id) {
    case 'month':
      return make(iso(y, m, 1), iso(y, m, lastDay(y, m)), monthName(y, m))
    case 'last-month': {
      const d = new Date(y, m - 2, 1)
      const [yy, mm] = [d.getFullYear(), d.getMonth() + 1]
      return make(iso(yy, mm, 1), iso(yy, mm, lastDay(yy, mm)), monthName(yy, mm))
    }
    case 'quarter': {
      const q = Math.floor((m - 1) / 3)
      const end = q * 3 + 3
      return make(iso(y, q * 3 + 1, 1), iso(y, end, lastDay(y, end)), `Q${q + 1} ${y}`)
    }
    case 'year':
      return make(iso(y, 1, 1), iso(y, 12, 31), String(y))
    case 'last-year':
      return make(iso(y - 1, 1, 1), iso(y - 1, 12, 31), String(y - 1))
    case 'custom': {
      let { from = '', to = '' } = custom
      // Picked back to front is a slip, not an empty range.
      if (from && to && from > to) [from, to] = [to, from]
      return make(from || null, to || null, 'Custom range')
    }
    default:
      return make(null, null, 'All time')
  }
}

function shiftMonths(from, to, n) {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const f = new Date(fy, fm - 1 - n, 1)
  const t = new Date(ty, tm - 1 - n, 1)
  const [y2, m2] = [t.getFullYear(), t.getMonth() + 1]
  return { from: iso(f.getFullYear(), f.getMonth() + 1, 1), to: iso(y2, m2, lastDay(y2, m2)) }
}

/**
 * The span immediately before `range`, for the comparison figure.
 *
 * Month-aligned periods step back by whole months — comparing November with
 * "the 30 days before" would spill into October's last day and double-count
 * it. A custom range has no calendar meaning, so it steps back by its own
 * length in days. All time has nothing before it.
 */
export function previousRange(range) {
  if (!range.from || !range.to) return null
  switch (range.id) {
    case 'month':
    case 'last-month':
    case 'quarter':
    case 'year':
    case 'last-year': {
      const span = monthsSpan(range.from, range.to)
      return { ...range, ...shiftMonths(range.from, range.to, span), label: 'the period before' }
    }
    case 'custom': {
      const days = (daysBetween(range.from, range.to) ?? 0) + 1
      return {
        ...range,
        from: shiftDays(range.from, -days),
        to: shiftDays(range.to, -days),
        label: 'the period before',
      }
    }
    default:
      return null
  }
}

function tally(list) {
  return { amount: sum(list), count: list.length }
}

/** Invoices dated inside a period — the basis for the per-period breakdowns. */
export function invoicesIn(invoices, range) {
  if (!range.from && !range.to) return invoices
  return invoices.filter((i) => inRange(i.date, range.from, range.to))
}

/**
 * What happened inside one span of time.
 *
 * `billed` reads the invoice date and `collected` reads `paidAt`, so an
 * invoice raised in one month and paid in the next counts once in each — which
 * is the point. Drafts are kept apart from billed: nothing has been charged
 * for until the invoice leaves the drawer.
 */
export function periodTotals(invoices, range) {
  const within = (day) => (!range.from && !range.to ? Boolean(day) : inRange(day, range.from, range.to))
  const billed = invoices.filter((i) => i.status !== 'draft' && within(i.date))
  const collected = invoices.filter((i) => i.status === 'paid' && i.paidAt && within(i.paidAt))
  const drafted = invoices.filter((i) => i.status === 'draft' && within(i.date))
  const open = invoices.filter((i) => OPEN.includes(i.status) && within(i.date))

  return {
    billed: tally(billed),
    collected: tally(collected),
    drafted: tally(drafted),
    open: tally(open),
    lists: { billed, collected, drafted, open },
  }
}

/**
 * The grand total card: one period's money, and whether it beats the last one.
 *
 * A period still running is compared against the same number of days into the
 * period before, not against the whole of it — November's first fortnight
 * against October's first fortnight. Comparing a fortnight with a full month
 * reads as a collapse in revenue every time a month turns over.
 */
export function revenue(invoices, periodId = 'year', today = todayISO(), custom = {}) {
  const range = periodRange(periodId, today, custom)
  const current = periodTotals(invoices, range)
  const prev = previousRange(range)

  let previous = null
  let change = null
  let partial = false

  if (prev) {
    const end = range.to && range.to > today ? today : range.to
    const elapsed = daysBetween(range.from, end)
    // Cut the earlier window to the part of it that had run by this point.
    if (range.open && elapsed !== null) {
      const cut = shiftDays(prev.from, elapsed)
      if (cut < prev.to) {
        prev.to = cut
        partial = true
      }
    }
    previous = periodTotals(invoices, prev)
    const now = current.collected.amount
    const was = previous.collected.amount
    // No money last time is not a 0% change, and dividing by it says ∞.
    change = was > 0 ? (now - was) / was : null
  }

  return {
    range,
    ...current,
    previous: previous ? { ...previous, range: prev, partial } : null,
    change,
    average: current.billed.count ? current.billed.amount / current.billed.count : 0,
  }
}
