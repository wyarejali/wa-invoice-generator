# Invoice

A minimal invoice app. The **invoice itself** stays a flat, monochrome,
monospaced document — that is what gets exported and printed. Everything
around it is a modern application shell that follows your light/dark
preference. The two palettes are kept deliberately separate in
`src/index.css`, which is what lets the chrome be restyled without touching a
pixel of the document.

```bash
npm install
npm run dev          # http://localhost:5173
```

## Routes

| Path | What it is |
| --- | --- |
| `/` | The landing page — what a first-time visitor sees. Sign in with Google, or go straight in as a guest. |
| `/app` | The way in: opens the newest invoice, creating one if the archive is empty. Google sign-in redirects here. |
| `/i/:id` | The editor for one invoice. |

Deep links are client-side routes, so a static host needs a rewrite of every
unknown path to `index.html` (Netlify `_redirects`, Vercel `rewrites`, or
`try_files $uri /index.html` on nginx). `vite dev` and `vite preview` already
do this.

## Layout

A top header, an invoice list rail on the left, the document in the middle, and
a properties panel on the right. The rail and the panel each toggle from the
header, so the document can have the full width when you want it.

Below `lg` both side panels become drawers — the list slides in from the left,
the properties panel from the right. Only one copy of each is ever mounted (a
media query drives it), so search and filter state is never duplicated or
diverged between the two presentations.

Icons are [Tabler](https://tabler.io/icons) (MIT), imported by name through
`src/components/ui/Icon.jsx` so only the ones actually used are bundled.

## Properties panel

Everything that acts on the invoice lives here rather than in a bar above it:

- **Status** — a dropdown; pick any state directly, listed in lifecycle order.
- **Export** — PNG and PDF.
- **Template layout** — minimal or business, previewed as a wireframe.
- **Actions** — undo, redo, duplicate, delete.
- **Columns** — item description, quantity & price.
- **Rows** — previous balance, discount, tax, fee.
- **Appearance** — light/dark/auto, and the palette.

## Template layouts

Both layouts share one data shape, so switching is lossless in either
direction and adding a third never migrates an existing invoice.

| Layout | Adds |
| --- | --- |
| `minimal` | Nothing — number, date, lines, totals, note, terms. |
| `business` | A **From** block, a **Bill to** block, an *Amount due* box beside the client, and a payment-details block above the footer. |

Each party is a name plus one free-form block rather than six labelled
fields: an address, a VAT number and a phone all go in whatever shape the
sender already writes them.

A new invoice inherits `template`, `from` and `payment` from the most recent
one (`addInvoice` in `src/context/InvoicesContext.jsx`) — they are identical
on every invoice a person writes — but never the client.

## Editor

| Feature | Notes |
| --- | --- |
| Invoice number | Editable. New invoices get `#YYMMDD`, then `-2`, `-3`, … on collision. |
| Date | Native date input, defaults to today. |
| Line items | Auto-numbered, reorderable, with description + amount. |
| Item description | Optional second line per item, in an auto-sizing field that costs no height when empty. |
| Quantity & price | Optional columns. With them on, the amount is derived from qty x price and shown rather than typed. |
| Previous balance | Optional row; counts toward the subtotal. |
| Discount / Tax / Fee | Optional rows under the subtotal, each with a `+ / −` toggle. |
| Footer note & terms | Both editable; the terms badge auto-sizes to its text. |

Amounts render as money (`$150.00`, `-$15.00`) while idle and as raw numbers
while focused, so they stay easy to type.

Switching the quantity column on or off never moves the total: turning it on
seeds qty 1 x the existing price, and turning it off folds qty x price back
into a plain amount.

### Reordering

Each line's number doubles as a drag handle — hover (or focus) the row and it
becomes a grip. Dragging works with mouse, pen and touch (it is built on
pointer events, not HTML5 drag-and-drop, which touch does not support). The
whole drag collapses into a single undo step.

Without a pointer, <kbd>⌥</kbd>/<kbd>Alt</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd>
moves the line the cursor is in.

### Undo / redo

<kbd>⌘</kbd><kbd>Z</kbd> and <kbd>⌘</kbd><kbd>⇧</kbd><kbd>Z</kbd>, or the
panel's buttons. History is a stack of whole-collection snapshots, so a
*deleted invoice* is as undoable as a typo — the toast that follows a delete
or an import offers Undo directly.

Consecutive keystrokes in one field collapse into a single step (a 700 ms
coalescing window), so undo moves field by field rather than character by
character. Cloud sync is derived by diffing snapshots, which means undo, redo
and import all sync correctly without any action having to remember to flag
itself as dirty.

## Theming

Two palettes are kept deliberately separate in `src/index.css`:

- The **document** is fixed black-on-white (`ink`, `paper`, `mute`, `faint`)
  and is never themed, because it is what gets exported and printed.
- The **shell** is themed. Four palettes — Monochrome (default), Slate, Teal
  and Burgundy — each in light and dark, chosen from the properties panel.

Each palette is a single block of `light-dark()` declarations, so one
declaration covers both schemes; `color-scheme` on `:root` picks the half.
Status chips stay semantic (gray / amber / blue / green) across every palette.

## Keyboard

| | |
| --- | --- |
| <kbd>⌘</kbd><kbd>K</kbd> | Command palette (also lists and jumps to invoices) |
| <kbd>⌘</kbd><kbd>N</kbd> / <kbd>⌘</kbd><kbd>D</kbd> | New / duplicate invoice |
| <kbd>⌘</kbd><kbd>Z</kbd> / <kbd>⌘</kbd><kbd>⇧</kbd><kbd>Z</kbd> | Undo / redo |
| <kbd>⌘</kbd><kbd>Enter</kbd> | Add a line |
| <kbd>Enter</kbd> | Walks the row left to right (description → qty → price), then starts the next line, focused |
| <kbd>⌥</kbd><kbd>↑</kbd>/<kbd>↓</kbd> | Move the current line |
| <kbd>Backspace</kbd> | Remove an empty line |
| <kbd>?</kbd> | Show the shortcut list |

Destructive actions always confirm first through a dialog, never a
`window.confirm`.

## Sidebar

Search by number, filter by status with live counts, a running **open**
(unpaid + sent + draft) total, multi-select with "Select all" scoped to the
current filter, and per-row duplicate and delete on hover.

Account, sign-in and JSON import/export live in the header's profile menu.

## Export

The **Export** dropdown offers PNG (`html-to-image`) and PDF (`jsPDF`, fit to
US Letter). Both libraries load on first use rather than in the initial bundle.

During a capture the card gets an `.exporting` class, which strips everything
marked `data-chrome` — drag handles, remove buttons, `+ Add line`, the
`+ / −` toggles, the date picker glyph — so only the invoice is captured.
Three quirks of `html-to-image` are worth knowing if you edit the card:

- It inlines **resolved** computed styles, so an `mx-auto` on the captured node
  becomes a real `0 161px` margin and shifts/clips the output. Keep centering on
  a wrapper; the captured node must have no auto margins.
- Pseudo-element rules (`::placeholder`, `::-webkit-calendar-picker-indicator`)
  do **not** survive the clone. Placeholders are blanked in JS during the
  capture, and the date is exported via a `[data-print]` sibling span.
- It resolves its image loads inside `requestAnimationFrame`, which never fires
  in a background tab.

## Persistence

Guest invoices live in `localStorage` under `wainvoice:invoices:v1` and are
saved on every change. With Supabase configured, signing in merges the local
set into the account **by invoice number** — newer `updatedAt` wins, and a
local invoice that merely collides on number is renumbered rather than
dropped. Writes are then debounced (800 ms) and flushed on `pagehide`. Signing
out clears the local copy so the next account cannot inherit it.

### Supabase setup

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=…
VITE_SUPABASE_ANON_KEY=…
```

Without these the app runs in guest mode. Then:

1. Run `supabase/schema.sql` in the SQL editor. It creates the `invoices` table
   (`id uuid`, `user_id uuid`, `number text`, `data jsonb`, `created_at`,
   `updated_at`), a per-user unique index on `lower(number)`, and RLS policies
   restricting every operation to `auth.uid() = user_id`.
2. Enable the Google provider under **Authentication → Providers**.
3. Add your app origin to **Authentication → URL Configuration**, and
   `<origin>/app` to the allowed redirect URLs — that is where
   `signInWithGoogle()` returns to.

Google is the only provider, on purpose: no password to store, reset or leak,
and it is an account the user already has.

### Why not store invoices in the user's own Google Drive?

It is possible — a Drive app would write to `appDataFolder`, a hidden
per-user folder only this app can see — but it is a worse fit than it sounds:

- The `drive.appdata` scope is **sensitive**, so a published app needs Google
  verification before anyone outside the test list can sign in.
- Drive is a file store, not a database. Every change rewrites a whole file,
  there is no query, and two open tabs overwrite each other with no conflict
  detection.
- Supabase's `provider_token` is not refreshed with the session, so a Drive
  token dies about an hour after sign-in unless a server refreshes it.

The same promise — *your data is yours* — is already met here by guest mode,
JSON export/import and row-level security. Drive is better as an optional
**backup target** ("keep a copy in my Drive") than as the primary store.

## MCP server (optional)

```bash
npm run mcp     # http://localhost:8787/mcp
```

Exposes the invoices over MCP with tools `list_invoices`, `get_invoice`,
`create_invoice`, and `delete_invoice`.

Auth is Supabase's, bridged through this server: `/oauth/register` (dynamic
client registration), `/oauth/authorize` (a consent screen that signs the user
in with Google), and `/oauth/token` (authorization code + PKCE). The code is
exchanged for the user's *own* Supabase access token, and every query runs as
that user — so RLS does the enforcing and the service-role key is never needed.
Discovery lives at `/.well-known/oauth-protected-resource` and
`/.well-known/oauth-authorization-server`.

Point an MCP client at `http://localhost:8787/mcp`. Requests without a valid
bearer token get a `401` with a `WWW-Authenticate` header naming the metadata
URL, which is what triggers the client's OAuth flow.

> The OAuth client and code stores are in-memory, which is fine for a single
> process. Move them to Redis or Postgres before running more than one node,
> since the token request may land on a different one than the authorize.

## Stack

React 18 + hooks, React Router, Tailwind CSS v4, `html-to-image`, `jspdf`,
`@supabase/supabase-js`, `@tabler/icons-react`, and `@modelcontextprotocol/sdk`
for the MCP server. No UI component library — the dialogs, dropdowns, toasts
and switches are in `src/components/ui/`.
