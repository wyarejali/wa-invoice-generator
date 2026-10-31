/**
 * MCP server for the invoice app.
 *
 *   POST /mcp   Streamable HTTP MCP endpoint (stateless: one server per request)
 *   GET  /oauth/authorize   consent screen -> Supabase Google sign-in
 *   POST /oauth/token       authorization-code + PKCE exchange
 *   POST /oauth/register    dynamic client registration
 *
 * Authorization is Supabase's: the code issued by /oauth/authorize is exchanged
 * for the user's own Supabase access token, and every database call is made
 * with that token so the RLS policies in supabase/schema.sql do the enforcing.
 * The server therefore never needs the service-role key.
 */
import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

const PORT = Number(process.env.MCP_PORT || 8787)
const PUBLIC_URL = (process.env.MCP_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '')
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (see .env.example) before starting.')
  process.exit(1)
}

const app = express()
app.use(cors({ origin: true, exposedHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'] }))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

/* -------------------------------------------------------------------------- *
 * In-memory OAuth state.
 * Fine for a single-process deployment; move to Redis/Postgres before scaling
 * this horizontally, since codes must be readable by whichever node gets the
 * token request.
 * -------------------------------------------------------------------------- */
const clients = new Map() // client_id -> registration
const codes = new Map() // code -> { clientId, redirectUri, challenge, method, tokens, exp }

const CODE_TTL_MS = 5 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [code, rec] of codes) if (rec.exp < now) codes.delete(code)
}, 60_000).unref()

const b64url = (buf) => buf.toString('base64url')
const randomId = () => b64url(crypto.randomBytes(24))

function verifyPkce(verifier, challenge, method) {
  if (!challenge) return true // client did not use PKCE
  if (!verifier) return false
  if (method === 'plain') return verifier === challenge
  return b64url(crypto.createHash('sha256').update(verifier).digest()) === challenge
}

/* -------------------------------------------------------------------------- *
 * Discovery metadata (RFC 9728 + RFC 8414) so MCP clients can find the flow.
 * -------------------------------------------------------------------------- */
app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.json({
    resource: PUBLIC_URL,
    authorization_servers: [PUBLIC_URL],
    scopes_supported: ['invoices:read', 'invoices:write'],
    bearer_methods_supported: ['header'],
  })
})
// Some clients probe the endpoint-suffixed variant.
app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) =>
  res.redirect(307, '/.well-known/oauth-protected-resource'),
)

app.get(
  ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration'],
  (_req, res) => {
    res.json({
      issuer: PUBLIC_URL,
      authorization_endpoint: `${PUBLIC_URL}/oauth/authorize`,
      token_endpoint: `${PUBLIC_URL}/oauth/token`,
      registration_endpoint: `${PUBLIC_URL}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256', 'plain'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['invoices:read', 'invoices:write'],
    })
  },
)

/* -------------------------------------------------------------------------- *
 * Dynamic client registration (RFC 7591) — public clients only.
 * -------------------------------------------------------------------------- */
app.post('/oauth/register', (req, res) => {
  const { redirect_uris, client_name } = req.body || {}
  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return res.status(400).json({ error: 'invalid_redirect_uri' })
  }
  const client_id = randomId()
  const record = {
    client_id,
    client_name: client_name || 'MCP client',
    redirect_uris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  }
  clients.set(client_id, record)
  res.status(201).json({ ...record, client_id_issued_at: Math.floor(Date.now() / 1000) })
})

/* -------------------------------------------------------------------------- *
 * Consent screen.
 *
 * The page runs supabase-js in the browser: it signs the user in with Google,
 * shows what the connecting client is asking for, and only on an explicit
 * Approve does it hand the session up to /oauth/approve for a code.
 * -------------------------------------------------------------------------- */
app.get('/oauth/authorize', (req, res) => {
  const {
    client_id,
    redirect_uri,
    state = '',
    code_challenge = '',
    code_challenge_method = 'S256',
    scope = 'invoices:read invoices:write',
  } = req.query

  const client = clients.get(client_id)
  if (!client) return res.status(400).send('Unknown client_id. Register at /oauth/register first.')
  if (!client.redirect_uris.includes(redirect_uri)) {
    return res.status(400).send('redirect_uri is not registered for this client.')
  }

  const ctx = JSON.stringify({
    client_id,
    client_name: client.client_name,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
    scope,
  })

  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize · Invoices</title>
<style>
  :root { color-scheme: light }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#fafafa;
         color:#000; font:14px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace }
  .card { width:min(420px,92vw); border:1px solid #000; background:#fff; padding:28px }
  h1 { font-size:12px; letter-spacing:.2em; text-transform:uppercase; margin:0 0 18px }
  dl { margin:0 0 20px; font-size:12px }
  dt { color:#737373; font-size:10px; letter-spacing:.16em; text-transform:uppercase; margin-top:12px }
  dd { margin:2px 0 0; word-break:break-all }
  button { width:100%; border:1px solid #000; background:#000; color:#fff; padding:10px;
           font:inherit; font-size:11px; letter-spacing:.08em; text-transform:uppercase; cursor:pointer }
  button.ghost { background:#fff; color:#000; margin-top:8px }
  button:hover { background:#fff; color:#000 }
  button.ghost:hover { background:#000; color:#fff }
  .msg { font-size:11px; color:#737373; margin-top:14px; line-height:1.6 }
</style></head>
<body><div class="card">
  <h1>Authorize access</h1>
  <div id="body"><p class="msg">Loading…</p></div>
</div>
<script type="module">
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const ctx = ${ctx}
const supabase = createClient(${JSON.stringify(SUPABASE_URL)}, ${JSON.stringify(SUPABASE_ANON_KEY)})
const body = document.getElementById('body')

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))

async function render() {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) {
    body.innerHTML = '<p class="msg">Sign in to let <b>' + esc(ctx.client_name) +
      '</b> read and write your invoices.</p><button id="in">Sign in with Google</button>'
    document.getElementById('in').onclick = () =>
      supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } })
    return
  }
  body.innerHTML =
    '<dl><dt>Application</dt><dd>' + esc(ctx.client_name) + '</dd>' +
    '<dt>Account</dt><dd>' + esc(session.user.email) + '</dd>' +
    '<dt>Scope</dt><dd>' + esc(ctx.scope) + '</dd></dl>' +
    '<button id="ok">Approve</button><button class="ghost" id="no">Deny</button>' +
    '<p class="msg" id="m"></p>'

  document.getElementById('no').onclick = () => {
    const u = new URL(ctx.redirect_uri)
    u.searchParams.set('error', 'access_denied')
    if (ctx.state) u.searchParams.set('state', ctx.state)
    location.href = u.toString()
  }
  document.getElementById('ok').onclick = async () => {
    document.getElementById('m').textContent = 'Authorizing…'
    const r = await fetch('/oauth/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...ctx,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
      }),
    })
    const out = await r.json()
    if (!r.ok) { document.getElementById('m').textContent = out.error || 'Failed.'; return }
    const u = new URL(ctx.redirect_uri)
    u.searchParams.set('code', out.code)
    if (ctx.state) u.searchParams.set('state', ctx.state)
    location.href = u.toString()
  }
}
render()
</script></body></html>`)
})

/** Mint a short-lived authorization code bound to the approved session. */
app.post('/oauth/approve', async (req, res) => {
  const { client_id, redirect_uri, code_challenge, code_challenge_method, access_token, refresh_token, expires_at } =
    req.body || {}

  const client = clients.get(client_id)
  if (!client || !client.redirect_uris.includes(redirect_uri)) {
    return res.status(400).json({ error: 'invalid_client' })
  }

  // Never take the browser's word for who this is — verify the token itself.
  const probe = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data, error } = await probe.auth.getUser(access_token)
  if (error || !data?.user) return res.status(401).json({ error: 'invalid_token' })

  const code = randomId()
  codes.set(code, {
    clientId: client_id,
    redirectUri: redirect_uri,
    challenge: code_challenge,
    method: code_challenge_method,
    tokens: { access_token, refresh_token, expires_at },
    exp: Date.now() + CODE_TTL_MS,
  })
  res.json({ code })
})

app.post('/oauth/token', async (req, res) => {
  const { grant_type, code, code_verifier, client_id, redirect_uri, refresh_token } = req.body || {}

  if (grant_type === 'refresh_token') {
    const probe = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data, error } = await probe.auth.refreshSession({ refresh_token })
    if (error || !data?.session) return res.status(400).json({ error: 'invalid_grant' })
    return res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: 'Bearer',
      expires_in: data.session.expires_in ?? 3600,
      scope: 'invoices:read invoices:write',
    })
  }

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' })
  }

  const rec = codes.get(code)
  codes.delete(code) // single use, whether or not it validates
  if (!rec || rec.exp < Date.now()) return res.status(400).json({ error: 'invalid_grant' })
  if (rec.clientId !== client_id || rec.redirectUri !== redirect_uri) {
    return res.status(400).json({ error: 'invalid_grant' })
  }
  if (!verifyPkce(code_verifier, rec.challenge, rec.method)) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE check failed' })
  }

  const expiresIn = rec.tokens.expires_at
    ? Math.max(60, rec.tokens.expires_at - Math.floor(Date.now() / 1000))
    : 3600

  res.json({
    access_token: rec.tokens.access_token,
    refresh_token: rec.tokens.refresh_token,
    token_type: 'Bearer',
    expires_in: expiresIn,
    scope: 'invoices:read invoices:write',
  })
})

/* -------------------------------------------------------------------------- *
 * MCP endpoint
 * -------------------------------------------------------------------------- */

/** A Supabase client acting as the caller, so RLS scopes every query. */
function userClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function authenticate(req, res) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    res
      .status(401)
      .set('WWW-Authenticate', `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource"`)
      .json({ error: 'unauthorized' })
    return null
  }
  const probe = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data, error } = await probe.auth.getUser(token)
  if (error || !data?.user) {
    res
      .status(401)
      .set('WWW-Authenticate', `Bearer error="invalid_token", resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource"`)
      .json({ error: 'invalid_token' })
    return null
  }
  return { user: data.user, db: userClient(token) }
}

const text = (value) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})
const fail = (message) => ({ content: [{ type: 'text', text: message }], isError: true })

function buildServer({ user, db }) {
  const server = new McpServer({ name: 'wainvoice', version: '1.0.0' })

  server.registerTool(
    'list_invoices',
    {
      title: 'List invoices',
      description: 'List the signed-in user\'s invoices, newest first.',
      inputSchema: {
        status: z.enum(['draft', 'unpaid', 'sent', 'paid']).optional()
          .describe('Only return invoices with this status.'),
        limit: z.number().int().min(1).max(200).optional().describe('Max rows (default 50).'),
      },
    },
    async ({ status, limit }) => {
      const { data, error } = await db
        .from('invoices')
        .select('id, number, data, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(limit ?? 50)
      if (error) return fail(error.message)
      const rows = (data || [])
        .filter((r) => !status || r.data?.status === status)
        .map((r) => ({
          id: r.id,
          number: r.number,
          date: r.data?.date,
          status: r.data?.status,
          total: (r.data?.items || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0),
          updated_at: r.updated_at,
        }))
      return text({ count: rows.length, invoices: rows })
    },
  )

  server.registerTool(
    'get_invoice',
    {
      title: 'Get invoice',
      description: 'Fetch one full invoice by id or by invoice number (e.g. "#260819").',
      inputSchema: {
        id: z.string().uuid().optional().describe('Invoice id.'),
        number: z.string().optional().describe('Invoice number, with or without the leading #.'),
      },
    },
    async ({ id, number }) => {
      if (!id && !number) return fail('Provide either id or number.')
      let query = db.from('invoices').select('*')
      query = id ? query.eq('id', id) : query.ilike('number', number.startsWith('#') ? number : `#${number}`)
      const { data, error } = await query.limit(1)
      if (error) return fail(error.message)
      if (!data?.length) return fail('No matching invoice.')
      return text(data[0])
    },
  )

  server.registerTool(
    'create_invoice',
    {
      title: 'Create invoice',
      description: 'Create a new invoice. The number is generated as #YYMMDD when omitted.',
      inputSchema: {
        number: z.string().optional().describe('Invoice number; auto-generated if omitted.'),
        date: z.string().optional().describe('ISO date, YYYY-MM-DD. Defaults to today.'),
        status: z.enum(['draft', 'unpaid', 'sent', 'paid']).optional(),
        items: z
          .array(z.object({ description: z.string(), amount: z.union([z.number(), z.string()]) }))
          .optional()
          .describe('Line items.'),
        note: z.string().optional().describe('Footer note.'),
        terms: z.string().optional().describe('Payment terms badge, e.g. "DUE ON RECEIPT".'),
      },
    },
    async (input) => {
      const date = input.date || new Date().toISOString().slice(0, 10)

      let number = input.number
      if (!number) {
        const base = `#${date.slice(2).replace(/-/g, '')}`
        const { data: taken } = await db.from('invoices').select('number').ilike('number', `${base}%`)
        const used = new Set((taken || []).map((r) => r.number.toLowerCase()))
        number = base
        let n = 2
        while (used.has(number.toLowerCase())) number = `${base}-${n++}`
      }

      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      const invoice = {
        id,
        number,
        date,
        status: input.status || 'draft',
        items: (input.items?.length ? input.items : [{ description: '', amount: '' }]).map((i) => ({
          id: crypto.randomUUID(),
          description: i.description ?? '',
          amount: String(i.amount ?? ''),
        })),
        previousBalance: { enabled: false, label: 'Previous balance', amount: '' },
        adjustments: {
          discount: { enabled: false, label: 'Discount', amount: '', sign: -1 },
          tax: { enabled: false, label: 'Tax', amount: '', sign: 1 },
          fee: { enabled: false, label: 'Fee', amount: '', sign: 1 },
        },
        note: input.note ?? 'Thank you for your business.',
        terms: input.terms ?? 'DUE ON RECEIPT',
        createdAt: now,
        updatedAt: now,
      }

      const { error } = await db.from('invoices').insert({
        id,
        user_id: user.id,
        number,
        data: invoice,
        created_at: now,
        updated_at: now,
      })
      if (error) return fail(error.message)
      return text({ created: true, id, number })
    },
  )

  server.registerTool(
    'delete_invoice',
    {
      title: 'Delete invoice',
      description: 'Permanently delete one invoice by id or number.',
      inputSchema: {
        id: z.string().uuid().optional(),
        number: z.string().optional(),
      },
    },
    async ({ id, number }) => {
      if (!id && !number) return fail('Provide either id or number.')
      let query = db.from('invoices').delete()
      query = id ? query.eq('id', id) : query.ilike('number', number.startsWith('#') ? number : `#${number}`)
      const { data, error } = await query.select('id, number')
      if (error) return fail(error.message)
      if (!data?.length) return fail('No matching invoice.')
      return text({ deleted: data })
    },
  )

  return server
}

app.all('/mcp', async (req, res) => {
  const auth = await authenticate(req, res)
  if (!auth) return

  // Stateless: a fresh server and transport per request keeps the deployment
  // horizontally scalable and avoids cross-user session bleed.
  const server = buildServer(auth)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  res.on('close', () => {
    transport.close()
    server.close()
  })

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (err) {
    console.error('[mcp]', err)
    if (!res.headersSent) res.status(500).json({ error: 'internal_error' })
  }
})

app.get('/healthz', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`MCP server on ${PUBLIC_URL}/mcp`)
})
