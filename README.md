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
| `/` | The landing page, for visitors without an account. Anyone signed in is sent to `/dashboard` instead. |
| `/app` | The way in. Signed in → the dashboard; a guest → the editor, with a first invoice created if the archive is empty. Google sign-in redirects here. |
| `/dashboard` | Stats and charts over the whole archive. Open to guests too — their invoices are local, but the arithmetic is the same. |
| `/i/:id` | The editor for one invoice. |

Both redirects wait for `authReady`, or a returning user sees the marketing
page flash past before being moved on. The dashboard and the editor are the
same `Shell` component with two middles, so they share the header, the rail,
the drawers, the command palette and every shortcut.

Deep links are client-side routes, so a static host needs a rewrite of every
unknown path to `index.html`, or signing in lands on the host's own 404
instead of `/app`. `vercel.json` in the repo root does this for Vercel; on
Netlify use `_redirects`, on nginx `try_files $uri /index.html`. `vite dev`
and `vite preview` already do it.

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
- **Template layout** — minimal or business, previewed as a wireframe, plus the
  business layout's amount-due box.
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

## Dashboard

Four figures, then the charts. Outstanding and drafts are stocks — what is
true right now. Collected is a flow, so it is measured over 30 days and
compared with the 30 before it, which is the only way one number says whether
things are improving.

| Card | Reads |
| --- | --- |
| Billed against collected | 12 months. Billed by invoice date, collected by payment date — the gap between the bars is the lag. |
| Status | Count and value per status. Overdue is deliberately absent: it is drawn from unpaid and sent, so it would count the same money twice. |
| Waiting on payment | Open invoices, oldest first, each with a one-click **Mark paid**. |
| How long they have waited | Aged into buckets from the due date, or the invoice date where there is none. |
| Top clients | Grouped by client name. Only the business layout records one, so everything else lands in "No client recorded" rather than being dropped. |
| Recent activity | Last six touched. |

Everything is derived in `src/lib/stats.js` — pure functions over the invoice
array, so no component knows how a figure is reached and each one can be
checked on its own.

### Charts without a chart library

Three shapes were needed: columns, a ring and ranked bars. Recharts is ~100 kB
against a ~140 kB gzipped bundle, and the dashboard is the home page for
anyone signed in, so lazy-loading would not have hidden the cost. They are
~150 lines in `src/components/charts/` instead:

- **ColumnChart** is plain elements, not SVG: a bar chart is a row of boxes,
  and boxes size themselves against their container, where an SVG needs a
  measured viewBox to stay proportional at every width.
- **Donut** draws each segment as a dashed circle stroke — one dash as long as
  the share, one gap covering the rest, rotated into place. No path
  arithmetic, crisp at any size.
- Colour comes from `currentColor` on the status classes in `index.css`, so
  all four palettes and both schemes follow for free.

The readout sits in the card header rather than in a tooltip that follows the
pointer: that is the part of a chart that breaks on touch, and there is
nothing it would say that the header cannot.

### Renamed item fields

A line used to store `description` (the one line) and `detail` (the optional
note), which reads backwards once the note is the description proper. They are
now `title` and `description`.

Old data is migrated on load, and the absence of `title` is what marks an item
as old — checking the values instead would copy a one-line item into both
fields. That covers browser storage, cloud rows, exported JSON and anything an
MCP client sends, since all four go through `normalizeInvoice`. The option
that shows the second field moved from `options.itemDetail` to
`options.itemDescription` the same way.

## Lifecycle dates

`updatedAt` cannot answer "what did I get paid in October?" — fixing a typo in
January rewrites it — and the invoice date is when the work was billed, not
when the money arrived. So `statusPatch()` stamps **`paidAt`** and **`sentAt`**
as a status changes, and every revenue figure reads those. Moving a status
backwards clears the stamp: an invoice marked paid by mistake and set back to
unpaid has no payment date, because no payment happened.

Invoices written before this existed are backfilled from the invoice date on
load — the best evidence left of when it happened.

## Due dates and overdue

An optional **Due date** field, switched on per invoice from the panel. Overdue
is then a *reading* of unpaid and sent rather than a fifth stored status
(`isOverdue` / `displayStatus`), so nothing has to keep a stored flag honest as
the clock moves. The sidebar grows an **Overdue** filter only once something
has actually gone past due.

## Editor

| Feature | Notes |
| --- | --- |
| Invoice number | Editable. New invoices get `#YYMMDD`, then `-2`, `-3`, … on collision. |
| Date | Native date input, defaults to today. |
| Line items | Auto-numbered, reorderable: a **title** and an amount. Titles wrap over as many lines as they need, on screen and in the export. |
| Item description | An optional second field under the title, in an auto-sizing field that costs no height when empty. The title is set in medium; the description is a step smaller and muted, so a line reads as one thing with a note rather than two competing lines. |
| Quantity & price | Optional columns. With them on, the amount is derived from qty x price and shown rather than typed. The quantity steps with ↑/↓ or the arrows beside the field. |
| Previous balance | Optional row; counts toward the subtotal. |
| Discount / Tax / Fee | Optional rows under the subtotal, each with a `+ / −` toggle. |
| Footer note & terms | Both editable; the terms badge auto-sizes to its text. |
| Amount due (business) | A second, prominent copy of the total beside the client. Standard on a sent invoice, and switchable from the panel. |

Enter on a blank last line does nothing rather than minting another blank one
— holding it used to produce dozens, which then printed as numbered empty rows.


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

- The **document** is fixed black-on-white (`ink`, `paper`, `rule`, `mute`,
  `faint`) and is never themed, because it is what gets exported and printed.
  `rule` (`#a1a1a6`) is the section rules and the card edge — softer than the
  text, and one line to change. Reaching for a shell token such as `border-line`
  here is a trap: the printed invoice would then change with the app theme.
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

A row is two lines: number and amount on the first, status and date on the
second. The status is an icon plus a tinted word rather than a pill — colour
alone cannot carry a state (it is lost to a colour-blind reader and to a
greyscale print), so each status reads as a shape first:

| Status | Icon |
| --- | --- |
| Draft | pencil |
| Unpaid | clock |
| Sent | paper plane |
| Paid | check in a circle |

The active row is marked with a bar rather than a border, because a border on
a rounded row has to follow the corner and reads as a box. Hover actions sit
on the second line: covering a date costs nothing, covering the total does.

Account, sign-in and JSON import/export live in the header's profile menu.

## Export

PNG (`html-to-image`) and PDF (`jsPDF`), both loaded on first use rather than
in the initial bundle.

**PNG** is one tall image of the whole invoice, however long it is.

**PDF is A4 and paginates.** The capture is a single tall bitmap, and each page
is a slice of it drawn at the same scale — the invoice is never shrunk to fit,
which is what made a long list unreadable. A page ends at the last *breakpoint*
that fits, where a breakpoint is the lower edge of a line row or of a top-level
block, so a row is never cut in half. Breakpoints are measured with the chrome
already hidden, because that is the layout that gets printed.

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
- The auto-sizing fields carry an explicit pixel height measured against the
  on-screen layout. Hiding the chrome widens the description column, so a line
  that wrapped on screen now fits, and the stale height prints as a blank
  second line. `ResizeObserver` fixes it a frame too late, so the capture
  re-fits every textarea itself.

## CSV

The dashboard's **CSV** button writes one row per invoice — number, dates,
status, client, subtotal, each adjustment, total, when it was sent and paid,
and how many days that took. Money is written as bare numbers: a currency
symbol in a CSV cell is a string, and nobody can sum a column of strings.

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

## Security

- **No secrets in the repo.** `.env` is ignored and has never been committed.
  The only keys the browser bundle carries are `VITE_SUPABASE_URL` and the
  **anon** key, which are public by design — row-level security is what keeps
  one account out of another's rows, not the key. The service-role key must
  never be given a `VITE_` name, or Vite will inline it into the bundle.
- **Every database call is made as the signed-in user**, in the app and in the
  MCP server alike, so the policies in `supabase/schema.sql` do the enforcing
  and no part of this needs the service-role key.
- **Signing out clears the local cache**, so the next account on a shared
  browser cannot inherit the previous one's invoices.
- **The MCP consent page escapes `<`, `>` and `&` when embedding JSON in a
  `<script>` block.** `state`, `scope` and `client_name` are all supplied by
  whoever is connecting, and that origin holds the user's Supabase session.
- **PKCE (S256) is mandatory.** Clients register as public
  (`token_endpoint_auth_method: 'none'`), so the code challenge is the only
  thing binding an authorization code to the client that asked for it.
- **Dependencies are at zero known advisories** (`npm audit`). Keep them there
  — jspdf and dompurify ship to the browser.

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
