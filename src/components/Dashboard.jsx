import { useMemo, useState } from 'react'
import { computeTotals, displayStatus, formatDay, money, reckoningDate, statusPatch } from '../lib/invoice'
import {
  agingBuckets,
  monthlySeries,
  recentlyTouched,
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

function percent(change) {
  const rounded = Math.round(Math.abs(change) * 100)
  return `${change >= 0 ? '+' : '−'}${rounded}%`
}

export default function Dashboard({ onOpenInvoice, onNew }) {
  const { invoices, updateInvoice, user, authReady, syncState } = useInvoices()
  const toast = useToast()
  const [month, setMonth] = useState(null)

  const stats = useMemo(() => summary(invoices), [invoices])
  const months = useMemo(() => monthlySeries(invoices, 12), [invoices])
  const mix = useMemo(() => statusMix(invoices), [invoices])
  const aging = useMemo(() => agingBuckets(invoices), [invoices])
  const clients = useMemo(() => topClients(invoices), [invoices])
  const recent = useMemo(() => recentlyTouched(invoices), [invoices])

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Full width on a phone, so the two buttons get their own line rather
            than squeezing the subtitle into three. */}
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <h1 className="text-[18px] font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-[12.5px] text-fg-subtle">
            {stats.count} invoice{stats.count === 1 ? '' : 's'}
            {user ? ' · synced to your account' : ' · saved on this device'}
          </p>
        </div>
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

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Outstanding"
          value={money(stats.outstanding.amount)}
          hint={
            stats.overdue.count
              ? `${stats.overdue.count} overdue · ${money(stats.overdue.amount)}`
              : `${stats.outstanding.count} open invoice${stats.outstanding.count === 1 ? '' : 's'}`
          }
          hintTone={stats.overdue.count ? 'danger' : undefined}
        />
        <Stat
          label="Collected · 30 days"
          value={money(stats.paidRecent.amount)}
          hint={
            stats.paidRecent.change === null
              ? `${stats.paidRecent.count} payment${stats.paidRecent.count === 1 ? '' : 's'}`
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
          value={stats.daysToPay.median === null ? '—' : `${stats.daysToPay.median}d`}
          hint={
            stats.daysToPay.count
              ? `median across ${stats.daysToPay.count} paid`
              : 'no payments recorded yet'
          }
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
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
          <div className="mt-3 flex items-center gap-4 text-[11px] text-fg-subtle">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-accent/30" />
              Billed, by invoice date
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" />
              Collected, by payment date
            </span>
          </div>
        </Card>

        <Card title="Status">
          <div className="flex items-center gap-4">
            <Donut
              segments={mix.map((row) => ({
                id: row.status,
                value: row.count,
                className: `ui-status-${row.status}`,
              }))}
            >
              <span className="font-mono text-[20px] leading-none tabular-nums">{stats.count}</span>
              <span className="mt-1 text-[10px] text-fg-subtle">invoices</span>
            </Donut>
            <ul className="min-w-0 flex-1 space-y-1.5">
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
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
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

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Top clients" aside={clients.more ? <span className="text-[11.5px] text-fg-subtle">+{clients.more} more</span> : null}>
          <BarList
            format={money}
            empty="No invoices have a client yet."
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
