import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * `null` when the app runs without credentials — every call site treats that
 * as guest mode rather than erroring, so the app is fully usable unconfigured.
 */
export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null

export const supabaseEnabled = Boolean(supabase)

/**
 * Google is the only provider: one button, no password to lose, and the
 * account is one the user already has. The redirect lands on `/app` so a
 * sign-in from the landing page ends up inside the editor.
 */
export function signInWithGoogle() {
  if (!supabase) return Promise.resolve()
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/app`,
      // Let people pick which Google account, rather than silently reusing the
      // one the browser happens to be signed into.
      queryParams: { prompt: 'select_account' },
    },
  })
}

export function signOut() {
  if (!supabase) return Promise.resolve()
  return supabase.auth.signOut()
}

/** Row shape for the `invoices` table. `data` holds the whole invoice JSON. */
export function toRow(invoice, userId) {
  return {
    id: invoice.id,
    user_id: userId,
    number: invoice.number,
    data: invoice,
    created_at: invoice.createdAt,
    updated_at: invoice.updatedAt,
  }
}

export function fromRow(row) {
  return {
    ...row.data,
    id: row.id,
    number: row.number ?? row.data?.number,
    createdAt: row.created_at ?? row.data?.createdAt,
    updatedAt: row.updated_at ?? row.data?.updatedAt,
  }
}
