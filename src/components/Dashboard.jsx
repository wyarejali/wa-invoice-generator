import { useEffect, useMemo, useState } from 'react'
import {
  computeTotals,
  displayStatus,
  formatDay,
  money,
  reckoningDate,
  statusPatch,
  todayISO,
} from '../lib/invoice'
import {
  PERIODS,
  agingBuckets,
  invoicesIn,
  monthlySeries,
  monthsSpan,
  recentlyTouched,
  revenue,
  statusMix,
  summary,
  topClients,
} from '../lib/stats'
import { downloadCSV } from '../lib/storage'
import { useInvoices } from '../context/InvoicesContext'
import { useToast } from './ui/ToastProvider'
import { StatusText } from './StatusBadge'
import BarList from './charts/BarList'
import ColumnChart from './charts/ColumnChart'
import Donut from './charts/Donut'
import Icon from './ui/Icon'

const PERIOD_KEY = 'wainvoice:period'

function Card({ title, aside, children, className = '' }) {
  return (
    // min-w-0, because a grid item defaults to min-width:auto and will refuse
    // to shrink below its content — which makes the whole column overflow.
    <section className={`min-w-0 rounded-xl border border-line bg-surface p-4 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="ui-section">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value, hint, hintTone }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
      <p className="ui-section">{label}</p>
      <p className="mt-2 font-mono text-[22px] leading-none tracking-tight tabular-nums">{value}</p>
      <p
        className={`mt-2 text-[11.5px] ${
          hintTone === 'danger'
            ? 'text-danger'
            : hintTone === 'good'
              ? 'ui-status-paid'
              : 'text-fg-subtle'
        }`}
      >
        {hint}
      </p>
    </div>
  )
}

/** One of the smaller figures beside the grand total. */
function Figure({ label, value, meta, tone }) {
  return (
    <div className="min-w-0">
      <p className="ui-section">{label}</p>
      <p
        className={`mt-1.5 font-mono text-[15px] leading-none tabular-nums ${
          tone === 'danger' ? 'text-danger' : ''
        }`}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] text-fg-subtle">{meta}</p>
    </div>
  )
}

function percent(change) {
  const rounded = Math.round(Math.abs(change) * 100)
  return `${change >= 0 ? '+' : '−'}${rounded}%`
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** "1 Nov – 14 Nov 2026", or an open-ended phrase for a half-set custom range. */
function rangeText(range) {
  if (!range.from && !range.to) return 'everything on record'
  if (range.from && range.to) return `${formatDay(range.from)} – ${formatDay(range.to)}`
  return range.from ? `from ${formatDay(range.from)}` : `up to ${formatDay(range.to)}`
}

function PeriodPicker({ value, onChange, custom, onCustomChange }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="relative">
        <select
          className="ui-select"
          value={value}
          aria-label="Period"
          onChange={(e) => onChange(e.target.value)}
        >
          {PERIODS.map((period) => (
            <option key={period.id} value={period.id}>
              {period.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevronDown"
          size={13}
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-fg-subtle"
        />
      </div>
      {value === 'custom' && (
        <>
          <input
            type="date"
            className="ui-date"
            aria-label="From"
            value={custom.from}
            onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
          />
          <span className="text-[12px] text-fg-subtle">to</span>
          <input
            type="date"
            className="ui-date"
            aria-label="To"
            value={custom.to}
            onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
          />
        </>
      )}
    </div>
  )
}

/**
 * Where the period's money stands: paid, still out, and not yet sent.
 *
 * Measured over the invoices *dated* in the period, so the three segments add
 * up to one whole. The headline figure above it is collected by payment date
 * instead, which is a different question — the caption says which is which.
 */
function ShareBar({ paid, open, draft }) {
  const total = paid + open + draft
  if (total <= 0) return null
  const pct = (value) => `${(value / total) * 100}%`
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
      {paid > 0 && <span className="bg-accent" style={{ width: pct(paid) }} />}
      {open > 0 && <span className="bg-accent/35" style={{ width: pct(open) }} />}
      {draft > 0 && <span className="bg-line-strong" style={{ width: pct(draft) }} />}
    </div>
  )
}

export default function Dashboard({ onOpenInvoice, onNew }) {
  const { invoices, updateInvoice, user, authReady, syncState } = useInvoices()
  const toast = useToast()
  const [month, setMonth] = useState(null)

  // The period someone looks at is a standing preference, not a per-visit
  // choice: an accountant lives in "this year" and goes back to it every time.
  const [period, setPeriod] = useState(() => {
    try {
      const saved = localStorage.getItem(PERIOD_KEY)
      return PERIODS.some((p) => p.id === saved) ? saved : 'year'
    } catch {
      return 'year'
    }
  })
  const [custom, setCustom] = useState({ from: '', to: '' })

  useEffect(() => {
    try {
      localStorage.setItem(PERIOD_KEY, period)
    } catch {
      /* storage unavailable — the choice just will not outlive the tab */
    }
  }, [period])

  const rev = useMemo(() => revenue(invoices, period, undefined, custom), [invoices, period, custom])
  const stats = useMemo(() => summary(invoices), [invoices])
  const aging = useMemo(() => agingBuckets(invoices), [invoices])
  const recent = useMemo(() => recentlyTouched(invoices), [invoices])

  // Dated in the period: what the per-period breakdowns are about.
  const inPeriod = useMemo(() => invoicesIn(invoices, rev.range), [invoices, rev.range])
  const mix = useMemo(() => statusMix(inPeriod), [inPeriod])
  const clients = useMemo(() => topClients(inPeriod), [inPeriod])

  /**
   * The trend is always a run of months, long enough to cover the period and
   * never shorter than a year — a chart of one month is not a trend. It ends
   * at the period's last month when that is in the past, so looking at 2025
   * does not leave every column faded off the right-hand edge.
   */
  const months = useMemo(() => {
    const today = todayISO()
    const end = rev.range.to && rev.range.to < today ? rev.range.to : today
    const span = rev.range.from ? monthsSpan(rev.range.from, end) : 0
    const count = Math.min(24, Math.max(12, span))
    const from = rev.range.from?.slice(0, 7)
    const to = rev.range.to?.slice(0, 7)
    return monthlySeries(invoices, count, end).map((row) => ({
      ...row,
      dim: Boolean((from && row.key < from) || (to && row.key > to)),
    }))
  }, [invoices, rev.range])

  const share = useMemo(() => {
    const sum = (list) => list.reduce((acc, i) => acc + computeTotals(i).total, 0)
    return {
      paid: sum(rev.lists.billed.filter((i) => i.status === 'paid')),
      open: rev.open.amount,
      draft: rev.drafted.amount,
      count: rev.lists.billed.length + rev.lists.drafted.length,
    }
  }, [rev])

  const markPaid = (invoice) => {
    updateInvoice(invoice.id, statusPatch(invoice, 'paid'))
    toast({ title: `${invoice.number} marked paid` })
  }

  // A signed-in user's rows arrive a moment after the page does. Telling them
  // there is nothing to measure, and then filling the page in, reads as a bug.
  if (!invoices.length && (!authReady || syncState === 'syncing')) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-[13px] text-fg-subtle">Loading your invoices…</p>
      </div>
    )
  }

  if (!invoices.length) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <Icon name="chart" size={30} className="mx-auto text-fg-subtle" />
          <p className="mt-3 text-[14px] font-medium">Nothing to measure yet</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-fg-muted">
            Write an invoice and this page fills in: what you are owed, what has come in, and
            who is slow to pay.
          </p>
          <button type="button" className="ui-btn ui-btn-primary mt-4" onClick={onNew}>
            <Icon name="plus" size={14} />
            New invoice
          </button>
        </div>
      </div>
    )
  }

  const shown = month || months[months.length - 1]
  const emptyPeriod = share.count === 0 && rev.collected.count === 0

  return (
    <div className="@container mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Full width on a phone, so the controls get their own line rather
            than squeezing the subtitle into three. */}
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <h1 className="text-[18px] font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-[12.5px] text-fg-subtle">
            {plural(stats.count, 'invoice')}
            {user ? ' · synced to your account' : ' · saved on this device'}
          </p>
        </div>
        <PeriodPicker
          value={period}
          onChange={setPeriod}
          custom={custom}
          onCustomChange={setCustom}
        />
        <button
          type="button"
          className="ui-btn"
          onClick={() => {
            downloadCSV(invoices)
            toast({ title: `Exported ${invoices.length} rows as CSV` })
          }}
        >
          <Icon name="download" size={14} />
          CSV
        </button>
        <button type="button" className="ui-btn ui-btn-primary" onClick={onNew}>
          <Icon name="plus" size={14} />
          New invoice
        </button>
      </div>

      {/* ----------------------------------------------------------------- *
       * Grand total. The one figure the page is for, with the period's
       * supporting numbers around it.
       * ----------------------------------------------------------------- */}
      <section className="mt-5 overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-5 p-4 sm:p-5">
          <div className="min-w-0 flex-1 basis-[250px]">
            <p className="ui-section">Revenue collected · {rev.range.label}</p>
            <p className="mt-2 font-mono text-[32px] leading-none font-medium tracking-tight tabular-nums sm:text-[38px]">
              {money(rev.collected.amount)}
            </p>
            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              {rev.change !== null && (
                <span
                  className={`font-medium ${rev.change >= 0 ? 'ui-status-paid' : 'text-danger'}`}
                  title={
                    rev.previous?.partial
                      ? 'Against the same number of days into the period before'
                      : 'Against the period before'
                  }
                >
                  {percent(rev.change)}
                  <span className="ml-1 font-normal text-fg-subtle">
                    on {rev.previous?.partial ? 'the same point before' : 'the period before'}
                  </span>
                </span>
              )}
              <span className="text-fg-subtle">
                {plural(rev.collected.count, 'payment')} · {rangeText(rev.range)}
              </span>
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-7 gap-y-4 @2xl:grid-cols-4">
            <Figure
              label="Billed"
              value={money(rev.billed.amount)}
              meta={plural(rev.billed.count, 'invoice')}
            />
            <Figure
              label="Still open"
              value={money(rev.open.amount)}
              tone={rev.open.amount > 0 ? 'danger' : undefined}
              meta={rev.open.count ? 'awaiting payment' : 'all settled'}
            />
            <Figure
              label="In draft"
              value={money(rev.drafted.amount)}
              meta={rev.drafted.count ? 'not sent yet' : 'nothing pending'}
            />
            <Figure
              label="Average"
              value={money(rev.average)}
              meta={rev.billed.count ? 'per invoice billed' : '—'}
            />
          </dl>
        </div>

        {emptyPeriod ? (
          <p className="border-t border-line px-4 py-3 text-[12px] text-fg-subtle sm:px-5">
            Nothing was billed or collected in this period. Try a wider one.
          </p>
        ) : (
          <div className="border-t border-line px-4 py-3 sm:px-5">
            <ShareBar paid={share.paid} open={share.open} draft={share.draft} />
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
              <span className="text-fg-muted">
                {plural(share.count, 'invoice')} dated in this period:
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" />
                paid <span className="font-mono tabular-nums">{money(share.paid)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[2px] bg-accent/35" />
                open <span className="font-mono tabular-nums">{money(share.open)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[2px] bg-line-strong" />
                draft <span className="font-mono tabular-nums">{money(share.draft)}</span>
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ----------------------------------------------------------------- *
       * Everything below the period card that the period does not touch:
       * what is true at this moment, whichever span is selected above.
       * ----------------------------------------------------------------- */}
      <p className="mt-6 mb-2 px-0.5 text-[11.5px] text-fg-subtle">As of today</p>
      <div className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        <Stat
          label="Outstanding"
          value={money(stats.outstanding.amount)}
          hint={
            stats.overdue.count
              ? `${stats.overdue.count} overdue · ${money(stats.overdue.amount)}`
              : `${plural(stats.outstanding.count, 'open invoice')}`
          }
          hintTone={stats.overdue.count ? 'danger' : undefined}
        />
        <Stat
          label="Collected · 30 days"
          value={money(stats.paidRecent.amount)}
          hint={
            stats.paidRecent.change === null
              ? plural(stats.paidRecent.count, 'payment')
              : `${percent(stats.paidRecent.change)} on the 30 days before`
          }
          hintTone={
            stats.paidRecent.change === null
              ? undefined
              : stats.paidRecent.change >= 0
                ? 'good'
                : 'danger'
          }
        />
        <Stat
          label="In draft"
          value={money(stats.drafts.amount)}
          hint={`${stats.drafts.count} not sent yet`}
        />
        <Stat
          label="Typical time to pay"
          value={
            stats.daysToPay.median === null
              ? '—'
              : stats.daysToPay.median === 0
                ? 'Same day'
                : `${stats.daysToPay.median}d`
          }
          hint={
            stats.daysToPay.count
              ? `median across ${stats.daysToPay.count} paid`
              : 'no payments recorded yet'
          }
        />
      </div>

      <div className="mt-3 grid gap-3 @3xl:grid-cols-3">
        <Card
          className="@3xl:col-span-2"
          title="Billed against collected"
          aside={
            <span className="text-[11.5px] text-fg-subtle">
              <span className="text-fg">{shown.label}</span> · billed{' '}
              <span className="font-mono tabular-nums">{money(shown.billed)}</span> · collected{' '}
              <span className="font-mono tabular-nums">{money(shown.collected)}</span>
            </span>
          }
        >
          <ColumnChart
            data={months}
            format={money}
            onHover={setMonth}
            series={[
              { key: 'billed', label: 'Billed', className: 'bg-accent/30' },
              { key: 'collected', label: 'Collected', className: 'bg-accent' },
            ]}
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-accent/30" />
              Billed, by invoice date
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" />
              Collected, by payment date
            </span>
            {rev.range.from && (
              <span className="text-fg-subtle/70">Faded months fall outside {rev.range.label}.</span>
            )}
          </div>
        </Card>

        <Card
          title="Status"
          aside={<span className="text-[11.5px] text-fg-subtle">{rev.range.label}</span>}
        >
          {inPeriod.length === 0 ? (
            <p className="py-10 text-center text-[12.5px] text-fg-subtle">
              No invoices dated in this period.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <Donut
                size={112}
                segments={mix.map((row) => ({
                  id: row.status,
                  value: row.count,
                  className: `ui-status-${row.status}`,
                }))}
              >
                <span className="font-mono text-[20px] leading-none tabular-nums">
                  {inPeriod.length}
                </span>
                <span className="mt-1 text-[10px] text-fg-subtle">invoices</span>
              </Donut>
              <ul className="min-w-[132px] flex-1 space-y-1.5">
                {mix.map((row) => (
                  <li key={row.status} className="flex items-baseline justify-between gap-2">
                    <StatusText status={row.status} size={12} className="text-[11.5px]" />
                    <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-fg-muted">
                      {row.count} · {money(row.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-3 grid gap-3 @3xl:grid-cols-3">
        <Card
          className="@3xl:col-span-2"
          title="Waiting on payment"
          aside={
            // Only worth saying when something has actually been waiting:
            // everything still inside its terms has a negative age.
            stats.oldestOpenDays > 0 ? (
              <span className="text-[11.5px] text-fg-subtle">
                oldest {stats.oldestOpenDays} days
              </span>
            ) : null
          }
        >
          {aging.waiting.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-fg-subtle">
              Nothing outstanding. Everything sent has been paid.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {aging.waiting.slice(0, 6).map(({ invoice, age }) => (
                <li key={invoice.id} className="group flex items-center gap-3 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-baseline gap-2.5 text-left"
                    onClick={() => onOpenInvoice(invoice.id)}
                  >
                    <span className="shrink-0 font-mono text-[12.5px] font-medium">
                      {invoice.number}
                    </span>
                    <StatusText
                      status={displayStatus(invoice)}
                      size={12}
                      className="shrink-0 text-[11px]"
                    />
                    <span className="min-w-0 truncate text-[12px] text-fg-subtle">
                      {invoice.to?.name || formatDay(reckoningDate(invoice))}
                    </span>
                  </button>
                  {/* A negative age is an invoice that is not due yet, which
                      reads as "-8d" unless it is said the other way round.
                      Dropped on a phone, where the row has no width to spare
                      and the aging card says the same thing. */}
                  <span className="hidden shrink-0 text-[11.5px] text-fg-subtle tabular-nums sm:inline">
                    {age < 0 ? `in ${-age}d` : age === 0 ? 'today' : `${age}d`}
                  </span>
                  <span className="shrink-0 font-mono text-[12.5px] tabular-nums">
                    {money(computeTotals(invoice).total)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Mark ${invoice.number} paid`}
                    title="Mark paid"
                    className="ui-btn shrink-0 px-2 py-1 text-[11px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100"
                    onClick={() => markPaid(invoice)}
                  >
                    <Icon name="circleCheck" size={13} />
                    {/* Icon only where the row is tight; there is no hover on a
                        phone either, so the button is always showing there. */}
                    <span className="hidden sm:inline">Mark paid</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="How long they have waited">
          <BarList
            format={money}
            empty="Nothing outstanding."
            rows={aging.buckets
              .filter((bucket) => bucket.count > 0)
              .map((bucket) => ({
                id: bucket.id,
                label: bucket.label,
                value: bucket.amount,
                meta: `${bucket.count}`,
                className:
                  bucket.id === '90+' || bucket.id === '61-90' ? 'bg-danger/15' : 'bg-accent-soft',
              }))}
          />
        </Card>
      </div>

      <div className="mt-3 grid gap-3 @2xl:grid-cols-2">
        <Card
          title="Top clients"
          aside={
            <span className="text-[11.5px] text-fg-subtle">
              {clients.more ? `+${clients.more} more · ` : ''}
              {rev.range.label}
            </span>
          }
        >
          <BarList
            format={money}
            empty="No invoices dated in this period."
            rows={clients.rows.map((row) => ({
              id: row.name,
              label: row.name,
              value: row.amount,
              meta: row.outstanding ? `${money(row.outstanding)} open` : `${row.count}`,
            }))}
          />
        </Card>

        <Card title="Recent activity">
          <ul className="divide-y divide-line">
            {recent.map((invoice) => (
              <li key={invoice.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 py-2 text-left"
                  onClick={() => onOpenInvoice(invoice.id)}
                >
                  <span className="shrink-0 font-mono text-[12.5px] font-medium">
                    {invoice.number}
                  </span>
                  <StatusText
                    status={displayStatus(invoice)}
                    size={12}
                    className="shrink-0 text-[11px]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-fg-subtle">
                    {invoice.to?.name || ''}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-fg-subtle">
                    {formatDay(String(invoice.updatedAt).slice(0, 10))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
