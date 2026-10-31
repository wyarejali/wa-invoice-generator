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

export function signInWithGoogle() {
  if (!supabase) return Promise.resolve()
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
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
