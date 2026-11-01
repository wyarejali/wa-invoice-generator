import { Link, useNavigate } from 'react-router-dom'
import { MOD, SHORTCUTS } from '../lib/shortcuts'
import { signInWithGoogle } from '../lib/supabase'
import { useAppearance } from '../lib/theme'
import { useInvoices } from '../context/InvoicesContext'
import { useToast } from './ui/ToastProvider'
import Dropdown, { MenuDivider, MenuItem } from './ui/Dropdown'
import Icon from './ui/Icon'

const NAV = [
  { id: 'features', label: 'Features' },
  { id: 'layouts', label: 'Layouts' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'faq', label: 'FAQ' },
]

const FEATURES = [
  {
    icon: 'keyboard',
    title: 'Keyboard first',
    body: `Enter walks across a row and starts the next line. ${MOD}↵ adds one from anywhere, ${MOD}K reaches everything else.`,
  },
  {
    icon: 'image',
    title: 'Clean exports',
    body: 'PNG or PDF of the document alone — every button, grip and placeholder is stripped out of the capture.',
  },
  {
    icon: 'columns',
    title: 'Only the rows you need',
    body: 'Quantity, price, per-item notes, previous balance, discount, tax and fees each switch on when the invoice calls for them.',
  },
  {
    icon: 'undo',
    title: 'Nothing is lost',
    body: 'A full undo history, right back through a deleted invoice. Reorder lines by dragging the row number.',
  },
  {
    icon: 'cloud',
    title: 'Yours by default',
    body: 'Invoices live in your browser. Sign in with Google only when you want them on another device.',
  },
  {
    icon: 'palette',
    title: 'Light, dark, four palettes',
    body: 'Theme the app however you like. The invoice stays black on white, because that is what prints.',
  },
]

const FAQ = [
  {
    q: 'Do I need an account?',
    a: 'No. The app opens straight into a blank invoice and saves to this browser as you type. Google sign-in is only there for keeping invoices across devices.',
  },
  {
    q: 'Where is my data kept?',
    a: 'On your device, in browser storage. If you sign in, a copy is also stored against your account with row-level security, so no other session can read it. You can export everything as JSON whenever you want, and import it back.',
  },
  {
    q: 'Can I send the invoice from here?',
    a: 'Not yet — you export a PNG or PDF and attach it to your own email. Sending, due dates and reminders are the next things on the list.',
  },
  {
    q: 'Does it work on a phone?',
    a: 'Yes. The invoice list and the settings become drawers, the numeric columns stack, and export behaves the same as on a desktop.',
  },
]

/* --------------------------------------------------------------------------
 * Static product shots. These are plain divs using the document palette, not
 * the editor — a landing page should never mount the real thing just to show
 * what it looks like.
 * ------------------------------------------------------------------------ */

const DEMO_LINES = [
  ['Brand identity', '2', '1,200.00', '2,400.00'],
  ['Landing page build', '1', '1,800.00', '1,800.00'],
  ['Icon set', '1', '320.00', '320.00'],
]

function HeroDocument() {
  return (
    <div className="min-w-0 overflow-hidden border border-ink bg-paper px-4 py-5 font-mono text-[10px] text-ink sm:px-7 sm:py-8 sm:text-[12px]">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="label">From</div>
          <div className="mt-1 text-[14px] font-semibold tracking-tight">Studio Fieldnote</div>
          <div className="mt-0.5 text-mute">
            14 Rue Daguerre
            <br />
            Paris · hello@fieldnote.studio
          </div>
        </div>
        <div className="text-right">
          <div className="label">Invoice</div>
          <div className="mt-1 text-[20px] tracking-tight">#261101</div>
          <div className="label mt-2.5">Date</div>
          <div className="mt-0.5 tabular-nums">01/11/2026</div>
        </div>
      </div>

      <div className="mt-5 border-t border-faint" />

      <div className="mt-4 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="label">Bill to</div>
          <div className="mt-1 text-[13px] font-semibold">Northbend Coffee</div>
          <div className="mt-0.5 truncate text-mute">accounts@northbend.co</div>
        </div>
        <div className="border border-ink px-3 py-2 text-right">
          <div className="label">Amount due</div>
          <div className="mt-0.5 text-[17px] tabular-nums">$4,676.00</div>
        </div>
      </div>

      <div className="mt-5 border-t-2 border-ink" />

      <div className="mt-3 flex gap-3 pb-1.5 text-[9px] tracking-[0.16em] text-mute uppercase">
        <span className="w-5">#</span>
        <span className="min-w-0 flex-1">Description</span>
        <span className="hidden w-8 text-right sm:block">Qty</span>
        <span className="hidden w-16 text-right sm:block">Price</span>
        <span className="w-20 text-right">Amount</span>
      </div>

      {DEMO_LINES.map(([description, qty, price, amount], i) => (
        <div key={description} className="flex gap-3 border-t border-faint py-1.5">
          <span className="w-5 text-mute tabular-nums">{String(i + 1).padStart(2, '0')}</span>
          <span className="min-w-0 flex-1 truncate">{description}</span>
          <span className="hidden w-8 text-right tabular-nums sm:block">{qty}</span>
          <span className="hidden w-16 text-right tabular-nums sm:block">${price}</span>
          <span className="w-20 text-right tabular-nums">${amount}</span>
        </div>
      ))}

      <div className="mt-5 border-t-2 border-ink" />

      <div className="mt-3 ml-auto w-full max-w-[16rem]">
        <div className="flex justify-between py-1">
          <span className="text-[9px] tracking-[0.16em] text-mute uppercase">Subtotal</span>
          <span className="tabular-nums">$4,520.00</span>
        </div>
        <div className="flex justify-between border-t border-faint py-1">
          <span className="text-[9px] tracking-[0.16em] text-mute uppercase">Tax 20%</span>
          <span className="tabular-nums">$904.00</span>
        </div>
        <div className="flex justify-between border-t border-faint py-1">
          <span className="text-[9px] tracking-[0.16em] text-mute uppercase">Deposit</span>
          <span className="tabular-nums">-$748.00</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-ink pt-2">
          <span className="text-[9px] tracking-[0.16em] text-mute uppercase">Total</span>
          <span className="text-[17px] tabular-nums">$4,676.00</span>
        </div>
      </div>

      <div className="mt-7 flex items-end justify-between gap-4">
        <span className="text-mute italic">Thank you for your business.</span>
        <span className="border border-ink bg-ink px-2.5 py-1.5 text-[9px] tracking-[0.16em] text-paper uppercase">
          Net 14
        </span>
      </div>
    </div>
  )
}

/** Thumbnail of a layout, in the document's own black and white. */
function MiniDocument({ business }) {
  const rule = 'border-t border-faint'
  return (
    <div className="border border-ink bg-paper p-4 font-mono text-[9px] text-ink">
      {business ? (
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="h-1.5 w-16 bg-ink" />
            <div className="mt-1.5 h-1 w-20 bg-faint" />
            <div className="mt-1 h-1 w-14 bg-faint" />
          </div>
          <div className="text-right">
            <div className="ml-auto h-2 w-12 bg-ink" />
            <div className="mt-1.5 ml-auto h-1 w-10 bg-faint" />
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="h-2.5 w-20 bg-ink" />
          <div className="h-1 w-10 bg-faint" />
        </div>
      )}

      {business && (
        <div className={`mt-3 flex items-end justify-between gap-4 ${rule} pt-3`}>
          <div>
            <div className="h-1 w-8 bg-faint" />
            <div className="mt-1.5 h-1.5 w-14 bg-ink" />
          </div>
          <div className="border border-ink px-2 py-1">
            <div className="h-1 w-8 bg-faint" />
            <div className="mt-1 h-1.5 w-10 bg-ink" />
          </div>
        </div>
      )}

      <div className="mt-3 border-t-2 border-ink" />
      {[22, 28, 18].map((w, i) => (
        <div key={i} className={`flex items-center gap-2 ${rule} py-1.5`}>
          <span className="h-1 w-2 bg-faint" />
          <span className="h-1 bg-faint" style={{ width: `${w * 3}px` }} />
          <span className="ml-auto h-1 w-8 bg-faint" />
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between border-t-2 border-ink pt-2">
        <span className="h-1 w-6 bg-faint" />
        <span className="h-2 w-12 bg-ink" />
      </div>

      {business && (
        <div className="mt-4 border-t border-faint pt-2">
          <div className="h-1 w-10 bg-faint" />
          <div className="mt-1.5 h-1 w-24 bg-faint" />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------ */

export default function LandingPage() {
  const { user, invoices, supabaseEnabled } = useInvoices()
  const { resolved, toggleTheme } = useAppearance()
  const toast = useToast()
  const navigate = useNavigate()

  const signedIn = Boolean(user)
  const hasWork = invoices.length > 0
  const enterLabel = signedIn || hasWork ? 'Open your invoices' : 'Start a blank invoice'

  const handleSignIn = () => {
    if (!supabaseEnabled) {
      toast({
        title: 'Google sign-in is not configured yet',
        description: 'Add Supabase keys to .env.local to switch it on. Guest mode needs nothing.',
        tone: 'error',
      })
      return
    }
    signInWithGoogle()
  }

  const jump = (id) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="min-h-dvh bg-bg">
      {/* Nav --------------------------------------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-[14px] font-semibold tracking-tight"
          >
            <Icon name="receipt" size={18} className="text-accent" />
            Invoice
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => jump(item.id)}
                className="rounded-md px-2.5 py-1.5 text-[13px] text-fg-muted hover:bg-raised hover:text-fg"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              className="ui-icon-btn"
              aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={toggleTheme}
            >
              <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={17} />
            </button>

            {signedIn ? (
              <Link to="/app" className="ui-btn ui-btn-primary">
                Open app
                <Icon name="chevronRight" size={14} />
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  className="ui-btn hidden sm:inline-flex"
                  onClick={handleSignIn}
                >
                  <Icon name="google" size={15} />
                  Sign in
                </button>
                <Link to="/app" className="ui-btn ui-btn-primary hidden sm:inline-flex">
                  Use as guest
                </Link>
              </>
            )}

            {/* Everything above folds into one menu on a phone. */}
            <div className="md:hidden">
              <Dropdown
                label="Menu"
                width="w-60"
                trigger={() => (
                  <button type="button" className="ui-icon-btn" aria-label="Menu">
                    <Icon name="menu" size={19} />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    {!signedIn && (
                      <>
                        <MenuItem
                          onClick={() => {
                            close()
                            handleSignIn()
                          }}
                        >
                          <Icon name="google" size={15} className="text-fg-muted" />
                          Sign in with Google
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            close()
                            navigate('/app')
                          }}
                        >
                          <Icon name="user" size={15} className="text-fg-muted" />
                          Continue as a guest
                        </MenuItem>
                        <MenuDivider />
                      </>
                    )}
                    {signedIn && (
                      <>
                        <MenuItem
                          onClick={() => {
                            close()
                            navigate('/app')
                          }}
                        >
                          <Icon name="receipt" size={15} className="text-fg-muted" />
                          Open your invoices
                        </MenuItem>
                        <MenuDivider />
                      </>
                    )}
                    {NAV.map((item) => (
                      <MenuItem
                        key={item.id}
                        onClick={() => {
                          close()
                          jump(item.id)
                        }}
                      >
                        <Icon name="chevronRight" size={15} className="text-fg-subtle" />
                        {item.label}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Dropdown>
            </div>
          </div>
        </div>
      </header>

      {/* Hero -------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <span className="ui-chip" data-on="true">
              <Icon name="dot" size={8} />
              No account needed
            </span>
            <h1 className="mt-5 text-[34px] leading-[1.08] font-semibold tracking-tight sm:text-[46px]">
              Invoices, without
              <br />
              the paperwork.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-fg-muted">
              Type an invoice in a handful of keystrokes, export a clean PNG or PDF, and keep
              the whole archive on your own device. Sign in with Google only when you want it
              on another one.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Link to="/app" className="ui-btn ui-btn-primary px-4 py-2.5 text-[14px]">
                <Icon name="plus" size={16} />
                {enterLabel}
              </Link>
              {!signedIn && (
                <button
                  type="button"
                  className="ui-btn px-4 py-2.5 text-[14px]"
                  onClick={handleSignIn}
                >
                  <Icon name="google" size={16} />
                  Sign in with Google
                </button>
              )}
            </div>

            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-subtle">
              <span className="flex items-center gap-1.5">
                <Icon name="check" size={13} />
                Free to use
              </span>
              <span className="flex items-center gap-1.5">
                <Icon name="check" size={13} />
                Works offline
              </span>
              <span className="flex items-center gap-1.5">
                <Icon name="check" size={13} />
                Nothing to install
              </span>
            </p>
          </div>

          <HeroDocument />
        </div>
      </section>

      {/* Features ---------------------------------------------------------- */}
      <section id="features" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-[11px] font-semibold tracking-[0.12em] text-fg-subtle uppercase">
            What it does
          </h2>
          <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title}>
                <Icon name={feature.icon} size={19} className="text-accent" />
                <h3 className="mt-2.5 text-[14px] font-semibold tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Layouts ----------------------------------------------------------- */}
      <section id="layouts" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-[11px] font-semibold tracking-[0.12em] text-fg-subtle uppercase">
            Two layouts, one document
          </h2>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-fg-muted">
            Switch at any time from the panel beside the invoice — the lines and totals stay
            exactly as they were, so nothing is lost either way.
          </p>

          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            {[
              {
                business: false,
                title: 'Minimal',
                body: 'A number, the lines, the total. For a regular client who only needs the figure.',
              },
              {
                business: true,
                title: 'Business',
                body: 'Adds your own details, who it is for, the amount due up top and how to pay at the bottom.',
              },
            ].map((layout) => (
              <div key={layout.title} className="border border-line bg-surface p-4 sm:p-5">
                <MiniDocument business={layout.business} />
                <h3 className="mt-4 text-[14px] font-semibold tracking-tight">{layout.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{layout.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[12px] text-fg-subtle">
            More layouts are on the way; these two share the same data, so adding one never
            changes an invoice you already wrote.
          </p>
        </div>
      </section>

      {/* Shortcuts --------------------------------------------------------- */}
      <section id="shortcuts" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-[11px] font-semibold tracking-[0.12em] text-fg-subtle uppercase">
            Built for the keyboard
          </h2>
          <div className="mt-6 grid gap-x-12 gap-y-7 sm:grid-cols-2">
            {SHORTCUTS.map((group) => (
              <div key={group.group}>
                <h3 className="text-[13px] font-semibold tracking-tight">{group.group}</h3>
                <ul className="mt-3 space-y-2">
                  {group.items.map((item) => (
                    <li
                      key={`${group.group}-${item.label}`}
                      className="flex items-center justify-between gap-4 border-b border-line pb-2 last:border-0"
                    >
                      <span className="text-[13px] text-fg-muted">{item.label}</span>
                      <span className="flex shrink-0 gap-1">
                        {item.keys.map((key, i) => (
                          <kbd key={i} className="ui-kbd">
                            {key}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ --------------------------------------------------------------- */}
      <section id="faq" className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-[11px] font-semibold tracking-[0.12em] text-fg-subtle uppercase">
            Questions
          </h2>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-3.5">
                <summary className="flex cursor-pointer list-none items-center gap-3 text-[14px] font-medium">
                  <Icon
                    name="chevronRight"
                    size={15}
                    className="text-fg-subtle transition-transform group-open:rotate-90"
                  />
                  {item.q}
                </summary>
                <p className="mt-2 pl-[27px] text-[13px] leading-relaxed text-fg-muted">
                  {item.a}
                </p>
              </details>
            ))}
          </div>

          <div className="mt-12 border border-line bg-surface px-5 py-7 text-center">
            <h3 className="text-[18px] font-semibold tracking-tight">
              Your next invoice is one click away.
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-fg-muted">
              Guest mode opens a blank invoice immediately. Sign in later and whatever you wrote
              comes with you.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              <Link to="/app" className="ui-btn ui-btn-primary px-4 py-2.5 text-[14px]">
                <Icon name="plus" size={16} />
                {enterLabel}
              </Link>
              {!signedIn && (
                <button
                  type="button"
                  className="ui-btn px-4 py-2.5 text-[14px]"
                  onClick={handleSignIn}
                >
                  <Icon name="google" size={16} />
                  Sign in with Google
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-7 text-[12px] text-fg-subtle sm:flex-row sm:items-center sm:px-6">
          <span className="flex items-center gap-1.5">
            <Icon name="receipt" size={14} />
            Invoice
          </span>
          <span className="sm:ml-auto">
            Saved on your device unless you sign in. Export everything as JSON any time.
          </span>
        </div>
      </footer>
    </div>
  )
}
