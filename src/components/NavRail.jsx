import { useMemo } from 'react'
import { STATUSES, isOverdue, money, sumTotals } from '../lib/invoice'
import { MOD } from '../lib/shortcuts'
import { PALETTES } from '../lib/theme'
import { signInWithGoogle, signOut } from '../lib/supabase'
import { useInvoices } from '../context/InvoicesContext'
import { StatusText } from './StatusBadge'
import Icon from './ui/Icon'

const SYNC = {
  idle: { icon: 'cloudOff', label: 'Not signed in' },
  syncing: { icon: 'sync', label: 'Syncing…' },
  synced: { icon: 'cloudCheck', label: 'Synced' },
  error: { icon: 'alert', label: 'Sync failed' },
  offline: { icon: 'cloud', label: 'On this device' },
}

function Group({ title, children }) {
  return (
    <div className="px-2 py-2">
      {title && <h3 className="ui-section px-2 pb-1.5">{title}</h3>}
      {children}
    </div>
  )
}

function Row({ icon, label, count, trailing, active, disabled, onClick, status }) {
  return (
    <button
      type="button"
      className="ui-nav"
      data-on={active || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {status ? (
        <StatusText status={status} size={14} className="flex-1 text-[13px] capitalize" />
      ) : (
        <>
          <Icon name={icon} size={15} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </>
      )}
      {count !== undefined && count > 0 && (
        <span className="shrink-0 text-[11.5px] tabular-nums opacity-60">{count}</span>
      )}
      {trailing}
    </button>
  )
}

/**
 * The dashboard's left rail: who you are, where you can go, and the few
 * whole-archive actions.
 *
 * The editor's rail is the invoice list, because that is what you navigate
 * between while writing one. On the dashboard there is nothing to navigate —
 * the page is already about every invoice at once — so the same space carries
 * the account and the filtered ways into the list instead.
 */
export default function NavRail({
  onClose,
  onNew,
  onOpenList,
  onFilter,
  onImport,
  onExportJSON,
  onExportCSV,
  onShortcuts,
  appearance,
}) {
  const { invoices, user, syncState, syncError, supabaseEnabled } = useInvoices()
  const { theme, setTheme, palette, setPalette } = appearance
  const sync = SYNC[syncState] ?? SYNC.offline

  const counts = useMemo(() => {
    const out = { all: invoices.length, overdue: 0 }
    for (const s of STATUSES) out[s] = 0
    for (const inv of invoices) {
      out[inv.status] = (out[inv.status] ?? 0) + 1
      if (isOverdue(inv)) out.overdue += 1
    }
    return out
  }, [invoices])

  const outstanding = useMemo(
    () => sumTotals(invoices.filter((i) => i.status !== 'paid')),
    [invoices],
  )

  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || null
  const avatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null
  const initial = (name || user?.email || '?').slice(0, 1).toUpperCase()

  return (
    <div className="scroll-thin flex h-full min-h-0 flex-col overflow-y-auto bg-surface">
      {/* Account */}
      <div className="px-3 pt-3">
        <div className="flex items-start gap-2.5 rounded-xl border border-line p-2.5">
          {avatar ? (
            // referrerPolicy, or Google's CDN refuses the request and the
            // avatar silently falls back to a broken image.
            <img
              src={avatar}
              alt=""
              referrerPolicy="no-referrer"
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-fg">
              {user ? initial : <Icon name="user" size={17} />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{name || (user ? user.email : 'Guest')}</p>
            <p
              className={`mt-0.5 flex items-center gap-1.5 text-[11px] ${
                syncState === 'error' ? 'text-danger' : 'text-fg-subtle'
              }`}
              title={syncError || undefined}
            >
              <Icon name={sync.icon} size={11} />
              <span className="truncate">{sync.label}</span>
            </p>
          </div>
          <button
            type="button"
            className="ui-icon-btn lg:hidden"
            aria-label="Close menu"
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {!user && supabaseEnabled && (
          <button type="button" className="ui-btn mt-2 w-full" onClick={signInWithGoogle}>
            <Icon name="google" size={14} />
            Sign in with Google
          </button>
        )}
        {!user && !supabaseEnabled && (
          <p className="mt-2 px-0.5 text-[11px] leading-relaxed text-fg-subtle">
            Add Supabase keys to <code className="font-mono">.env</code> to sign in and sync.
          </p>
        )}
        {user && (
          <button type="button" className="ui-btn mt-2 w-full" onClick={signOut}>
            <Icon name="logOut" size={14} />
            Sign out
          </button>
        )}
      </div>

      <Group>
        <Row icon="dashboard" label="Dashboard" active onClick={() => {}} />
        <Row icon="receipt" label="All invoices" count={counts.all} onClick={onOpenList} />
        <Row
          icon="plus"
          label="New invoice"
          onClick={onNew}
          trailing={<kbd className="ui-kbd">{MOD}N</kbd>}
        />
      </Group>

      <Group title="By status">
        {[...STATUSES, ...(counts.overdue ? ['overdue'] : [])].map((status) => (
          <Row
            key={status}
            status={status}
            count={counts[status]}
            disabled={!counts[status]}
            onClick={() => onFilter(status)}
          />
        ))}
        <p className="mt-1.5 px-2 text-[11px] text-fg-subtle tabular-nums">
          {money(outstanding)} not yet paid
        </p>
      </Group>

      <Group title="Archive">
        <Row icon="download" label="Export as CSV" onClick={onExportCSV} disabled={!invoices.length} />
        <Row
          icon="download"
          label="Export as JSON"
          onClick={onExportJSON}
          disabled={!invoices.length}
        />
        <Row icon="upload" label="Import from JSON" onClick={onImport} />
      </Group>

      {/* Appearance lives here because the dashboard has no properties panel,
          and the theme switch was otherwise reachable only from the palette. */}
      <Group title="Appearance">
        <div className="ui-segment w-full">
          {[
            { id: 'light', icon: 'sun', label: 'Light' },
            { id: 'dark', icon: 'moon', label: 'Dark' },
            { id: 'system', icon: 'settings', label: 'Auto' },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              data-on={theme === option.id}
              onClick={() => setTheme(option.id)}
              title={`${option.label} theme`}
            >
              <Icon name={option.icon} size={13} />
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5 px-0.5">
          {PALETTES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-label={`${option.title || option.label} palette`}
              aria-pressed={palette === option.id}
              title={option.title || option.label}
              onClick={() => setPalette(option.id)}
              className={`h-6 w-6 rounded-full border-2 ${
                palette === option.id ? 'border-accent' : 'border-transparent hover:border-line-strong'
              }`}
              style={{ background: option.swatch[0] }}
            />
          ))}
        </div>
      </Group>

      <div className="mt-auto px-2 pb-2">
        <Row
          icon="keyboard"
          label="Keyboard shortcuts"
          onClick={onShortcuts}
          trailing={<kbd className="ui-kbd">?</kbd>}
        />
      </div>
    </div>
  )
}
