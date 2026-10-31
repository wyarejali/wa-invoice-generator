import { signInWithGoogle, signOut } from '../lib/supabase'
import { MOD } from '../lib/shortcuts'
import { useInvoices } from '../context/InvoicesContext'
import Dropdown, { MenuDivider, MenuItem } from './ui/Dropdown'
import Icon from './ui/Icon'

const SYNC = {
  idle: { icon: 'cloudOff', label: 'Not signed in' },
  syncing: { icon: 'sync', label: 'Syncing…' },
  synced: { icon: 'cloudCheck', label: 'Synced' },
  error: { icon: 'alert', label: 'Sync failed' },
  offline: { icon: 'cloud', label: 'Saved on this device' },
}

function ProfileMenu({ onImport, onExport, onShortcuts }) {
  const { user, syncState, syncError, supabaseEnabled, invoices } = useInvoices()
  const sync = SYNC[syncState] ?? SYNC.offline
  const initial = (user?.email || '?').slice(0, 1).toUpperCase()

  return (
    <Dropdown
      label="Account"
      width="w-64"
      trigger={() => (
        <button type="button" className="ui-icon-btn" aria-label="Account">
          {user ? (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg">
              {initial}
            </span>
          ) : (
            <Icon name="userCircle" size={20} />
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="px-2.5 py-2">
            <p className="truncate text-[13px] font-medium">{user ? user.email : 'Guest'}</p>
            <p
              className={`mt-0.5 flex items-center gap-1.5 text-[11px] ${
                syncState === 'error' ? 'text-danger' : 'text-fg-subtle'
              }`}
              title={syncError || undefined}
            >
              <Icon name={sync.icon} size={12} />
              {sync.label}
            </p>
          </div>

          <MenuDivider />

          {!user && supabaseEnabled && (
            <MenuItem
              onClick={() => {
                close()
                signInWithGoogle()
              }}
            >
              <Icon name="google" size={15} className="text-fg-muted" />
              Sign in or sign up
            </MenuItem>
          )}

          {!user && !supabaseEnabled && (
            <p className="px-2.5 py-1.5 text-[11px] leading-relaxed text-fg-subtle">
              Add Supabase keys to <code className="font-mono">.env</code> to sign in and sync
              across devices.
            </p>
          )}

          {user && (
            <MenuItem
              onClick={() => {
                close()
                signOut()
              }}
            >
              <Icon name="logOut" size={15} className="text-fg-muted" />
              Sign out
            </MenuItem>
          )}

          <MenuDivider />

          <MenuItem
            disabled={!invoices.length}
            onClick={() => {
              close()
              onExport()
            }}
          >
            <Icon name="download" size={15} className="text-fg-muted" />
            Export all as JSON
          </MenuItem>
          <MenuItem
            onClick={() => {
              close()
              onImport()
            }}
          >
            <Icon name="upload" size={15} className="text-fg-muted" />
            Import from JSON
          </MenuItem>

          <MenuDivider />

          <MenuItem
            onClick={() => {
              close()
              onShortcuts()
            }}
            trailing={<kbd className="ui-kbd">?</kbd>}
          >
            <Icon name="keyboard" size={15} className="text-fg-muted" />
            Keyboard shortcuts
          </MenuItem>
        </>
      )}
    </Dropdown>
  )
}

export default function Header({
  isDesktop,
  railOpen,
  onToggleRail,
  panelOpen,
  onTogglePanel,
  onPalette,
  onImport,
  onExport,
  onShortcuts,
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 sm:px-3">
      <button
        type="button"
        className="ui-icon-btn"
        aria-label={isDesktop ? (railOpen ? 'Hide invoice list' : 'Show invoice list') : 'Open invoice list'}
        aria-expanded={isDesktop ? railOpen : undefined}
        onClick={onToggleRail}
      >
        <Icon name={isDesktop ? (railOpen ? 'railClose' : 'railOpen') : 'menu'} size={19} />
      </button>

      <span className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight">
        <Icon name="receipt" size={17} className="text-accent" />
        Invoice
      </span>

      {/* Command palette doubles as the app's search, so it gets real estate
          rather than hiding in a menu. */}
      <button
        type="button"
        className="ui-input mx-auto hidden max-w-xs items-center gap-2 text-fg-subtle hover:border-line-strong sm:flex"
        onClick={onPalette}
      >
        <Icon name="search" size={14} />
        <span className="flex-1 text-left text-[13px]">Search…</span>
        <kbd className="ui-kbd">{MOD}K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1 sm:ml-0">
        <button
          type="button"
          className="ui-icon-btn sm:hidden"
          aria-label="Search commands"
          onClick={onPalette}
        >
          <Icon name="search" size={18} />
        </button>
        <button
          type="button"
          className="ui-icon-btn"
          aria-label={panelOpen ? 'Hide invoice settings' : 'Show invoice settings'}
          aria-expanded={panelOpen}
          onClick={onTogglePanel}
        >
          <Icon name="panel" size={18} />
        </button>
        <ProfileMenu onImport={onImport} onExport={onExport} onShortcuts={onShortcuts} />
      </div>
    </header>
  )
}
