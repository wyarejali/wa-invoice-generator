import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  createInvoice,
  duplicateInvoice as buildDuplicate,
  generateNumber,
  normalizeInvoice,
  sortInvoices,
} from '../lib/invoice'
import { clearLocal, loadLocal, saveLocal } from '../lib/storage'
import { fromRow, supabase, supabaseEnabled, toRow } from '../lib/supabase'

const InvoicesContext = createContext(null)

const SYNC_DEBOUNCE_MS = 800
const HISTORY_LIMIT = 100
/** Consecutive edits under the same key inside this window are one undo step. */
const COALESCE_MS = 700

/**
 * Which rows changed between two snapshots.
 *
 * Every mutation produces new objects for the invoices it touches, so identity
 * comparison is enough. Deriving the sync set this way rather than having each
 * action remember to call markDirty means undo, redo and import all sync
 * correctly for free.
 */
function diffSnapshots(prev, next) {
  const prevById = new Map(prev.map((i) => [i.id, i]))
  const dirty = []
  const deleted = []
  for (const inv of next) {
    if (prevById.get(inv.id) !== inv) dirty.push(inv.id)
    prevById.delete(inv.id)
  }
  for (const id of prevById.keys()) deleted.push(id)
  return { dirty, deleted }
}

export function InvoicesProvider({ children }) {
  const [invoices, setInvoices] = useState(() => sortInvoices(loadLocal()))
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(!supabaseEnabled)
  // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  const [syncState, setSyncState] = useState(supabaseEnabled ? 'idle' : 'offline')
  const [syncError, setSyncError] = useState(null)
  const [history, setHistory] = useState({ past: 0, future: 0 })

  const user = session?.user ?? null

  const dirtyRef = useRef(new Set())
  const deletedRef = useRef(new Set())
  const timerRef = useRef(null)
  const invoicesRef = useRef(invoices)
  invoicesRef.current = invoices

  // Undo/redo stacks hold whole-collection snapshots. Invoices are small JSON,
  // and a single stack means a deleted invoice is as undoable as a typo.
  const historyRef = useRef({ past: [], future: [], key: null, at: 0 })

  useEffect(() => {
    saveLocal(invoices)
  }, [invoices])

  /* ------------------------------------------------------------------ *
   * Sync plumbing
   * ------------------------------------------------------------------ */
  const scheduleSyncRef = useRef(() => {})

  const queueSync = useCallback((prev, next) => {
    const { dirty, deleted } = diffSnapshots(prev, next)
    if (!dirty.length && !deleted.length) return
    dirty.forEach((id) => {
      deletedRef.current.delete(id)
      dirtyRef.current.add(id)
    })
    deleted.forEach((id) => {
      dirtyRef.current.delete(id)
      deletedRef.current.add(id)
    })
    scheduleSyncRef.current()
  }, [])

  /**
   * The single write path. `producer` maps the current list to the next one;
   * returning the same reference is a no-op.
   */
  const commit = useCallback(
    (producer, { history: track = true, coalesce = null, coalesceMs = COALESCE_MS } = {}) => {
      const prev = invoicesRef.current
      const next = typeof producer === 'function' ? producer(prev) : producer
      if (next === prev) return prev

      if (track) {
        const h = historyRef.current
        const now = Date.now()
        const continues =
          coalesce && h.key === coalesce && h.past.length > 0 && now - h.at < coalesceMs
        if (!continues) {
          h.past.push(prev)
          if (h.past.length > HISTORY_LIMIT) h.past.shift()
        }
        h.key = coalesce
        h.at = now
        h.future = []
        setHistory({ past: h.past.length, future: 0 })
      }

      invoicesRef.current = next
      setInvoices(next)
      queueSync(prev, next)
      return next
    },
    [queueSync],
  )

  /** Restore a snapshot without recording it as a new history entry. */
  const restore = useCallback(
    (snapshot) => {
      const prev = invoicesRef.current
      invoicesRef.current = snapshot
      setInvoices(snapshot)
      queueSync(prev, snapshot)
    },
    [queueSync],
  )

  const undo = useCallback(() => {
    const h = historyRef.current
    if (!h.past.length) return false
    const snapshot = h.past.pop()
    h.future.push(invoicesRef.current)
    h.key = null
    setHistory({ past: h.past.length, future: h.future.length })
    restore(snapshot)
    return true
  }, [restore])

  const redo = useCallback(() => {
    const h = historyRef.current
    if (!h.future.length) return false
    const snapshot = h.future.pop()
    h.past.push(invoicesRef.current)
    h.key = null
    setHistory({ past: h.past.length, future: h.future.length })
    restore(snapshot)
    return true
  }, [restore])

  const resetHistory = useCallback(() => {
    historyRef.current = { past: [], future: [], key: null, at: 0 }
    setHistory({ past: 0, future: 0 })
  }, [])

  /* ------------------------------------------------------------------ *
   * Auth
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!supabase) return
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session ?? null)
      setAuthReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null)
      setAuthReady(true)
    })
    return () => {
      alive = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  /* ------------------------------------------------------------------ *
   * Sign-in handoff: pull the cloud rows, merge whatever is local into
   * them by invoice number, and push the merged result back up.
   * ------------------------------------------------------------------ */
  const mergeOnSignIn = useCallback(
    async (userId) => {
      setSyncState('syncing')
      setSyncError(null)
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('user_id', userId)
        if (error) throw error

        const cloud = (data || []).map((row) => normalizeInvoice(fromRow(row)))
        const local = invoicesRef.current

        // Number is the human identity of an invoice, so it is the merge key.
        const byNumber = new Map()
        for (const inv of cloud) byNumber.set(inv.number.toLowerCase(), inv)

        const toPush = []
        for (const inv of local) {
          const key = inv.number.toLowerCase()
          const existing = byNumber.get(key)
          if (!existing) {
            byNumber.set(key, inv)
            toPush.push(inv)
            continue
          }
          if (existing.id === inv.id) {
            if ((inv.updatedAt || '') > (existing.updatedAt || '')) {
              byNumber.set(key, inv)
              toPush.push(inv)
            }
          } else {
            // A different invoice that merely collides on number is renumbered
            // rather than silently dropped.
            const renumbered = {
              ...inv,
              number: generateNumber([...byNumber.keys()], inv.date),
            }
            byNumber.set(renumbered.number.toLowerCase(), renumbered)
            toPush.push(renumbered)
          }
        }

        const merged = sortInvoices([...byNumber.values()])
        invoicesRef.current = merged
        setInvoices(merged)
        resetHistory()

        if (toPush.length) {
          const { error: upErr } = await supabase
            .from('invoices')
            .upsert(
              toPush.map((inv) => toRow(inv, userId)),
              { onConflict: 'id' },
            )
          if (upErr) throw upErr
        }
        setSyncState('synced')
      } catch (err) {
        setSyncState('error')
        setSyncError(err.message || String(err))
      }
    },
    [resetHistory],
  )

  const mergedForRef = useRef(null)
  useEffect(() => {
    if (!supabase || !user) return
    if (mergedForRef.current === user.id) return
    mergedForRef.current = user.id
    mergeOnSignIn(user.id)
  }, [user, mergeOnSignIn])

  // Signing out must not leave the previous account's invoices on the device:
  // they would otherwise be merged into whichever account signs in next.
  const lastUserRef = useRef(null)
  useEffect(() => {
    const previous = lastUserRef.current
    lastUserRef.current = user?.id ?? null
    if (user) return

    mergedForRef.current = null
    if (supabaseEnabled) setSyncState('idle')
    if (previous) {
      clearTimeout(timerRef.current)
      dirtyRef.current = new Set()
      deletedRef.current = new Set()
      invoicesRef.current = []
      setInvoices([])
      resetHistory()
      clearLocal()
    }
  }, [user, resetHistory])

  /* ------------------------------------------------------------------ *
   * Debounced push of dirty / deleted rows.
   * ------------------------------------------------------------------ */
  const flush = useCallback(async () => {
    if (!supabase || !user) return
    const dirty = [...dirtyRef.current]
    const deleted = [...deletedRef.current]
    dirtyRef.current = new Set()
    deletedRef.current = new Set()
    if (!dirty.length && !deleted.length) return

    setSyncState('syncing')
    try {
      if (deleted.length) {
        const { error } = await supabase
          .from('invoices')
          .delete()
          .in('id', deleted)
          .eq('user_id', user.id)
        if (error) throw error
      }
      if (dirty.length) {
        const rows = invoicesRef.current
          .filter((inv) => dirty.includes(inv.id))
          .map((inv) => toRow(inv, user.id))
        if (rows.length) {
          const { error } = await supabase
            .from('invoices')
            .upsert(rows, { onConflict: 'id' })
          if (error) throw error
        }
      }
      setSyncState('synced')
      setSyncError(null)
    } catch (err) {
      // Re-queue so the next edit retries instead of losing the write.
      dirty.forEach((id) => dirtyRef.current.add(id))
      deleted.forEach((id) => deletedRef.current.add(id))
      setSyncState('error')
      setSyncError(err.message || String(err))
    }
  }, [user])

  useEffect(() => {
    scheduleSyncRef.current = () => {
      if (!supabase || !user) return
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flush, SYNC_DEBOUNCE_MS)
    }
  }, [flush, user])

  // Don't leave a pending write behind if the tab goes away mid-debounce.
  useEffect(() => {
    const onHide = () => {
      if (dirtyRef.current.size || deletedRef.current.size) flush()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide()
    }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  /* ------------------------------------------------------------------ *
   * Actions
   * ------------------------------------------------------------------ */
  const addInvoice = useCallback(() => {
    const invoice = createInvoice(invoicesRef.current.map((i) => i.number))
    commit((prev) => sortInvoices([invoice, ...prev]))
    return invoice
  }, [commit])

  const duplicateInvoice = useCallback(
    (id) => {
      const source = invoicesRef.current.find((i) => i.id === id)
      if (!source) return null
      const copy = buildDuplicate(source, invoicesRef.current.map((i) => i.number))
      commit((prev) => sortInvoices([copy, ...prev]))
      return copy
    },
    [commit],
  )

  const updateInvoice = useCallback(
    (id, patch, options) => {
      commit(
        (prev) =>
          prev.map((inv) =>
            inv.id === id
              ? {
                  ...inv,
                  ...(typeof patch === 'function' ? patch(inv) : patch),
                  updatedAt: new Date().toISOString(),
                }
              : inv,
          ),
        {
          // Keystrokes in one field collapse into a single undo step.
          coalesce: options?.coalesce ? `${id}:${options.coalesce}` : null,
          coalesceMs: options?.coalesceMs,
        },
      )
    },
    [commit],
  )

  const deleteInvoices = useCallback(
    (ids) => {
      const set = new Set(ids)
      const removed = invoicesRef.current.filter((inv) => set.has(inv.id))
      commit((prev) => prev.filter((inv) => !set.has(inv.id)))
      return removed
    },
    [commit],
  )

  const importInvoices = useCallback(
    (incoming) => {
      let added = 0
      let updated = 0
      commit((prev) => {
        const byNumber = new Map(prev.map((i) => [i.number.toLowerCase(), i]))
        const byId = new Map(prev.map((i) => [i.id, i]))
        const next = [...prev]

        for (const raw of incoming) {
          const inv = normalizeInvoice(raw)
          const existing = byId.get(inv.id) || byNumber.get(inv.number.toLowerCase())
          if (existing) {
            const idx = next.findIndex((i) => i.id === existing.id)
            // Keep the existing row's identity; take the imported content.
            next[idx] = { ...inv, id: existing.id }
            byNumber.set(next[idx].number.toLowerCase(), next[idx])
            updated += 1
          } else {
            const numbers = next.map((i) => i.number)
            const number = numbers.some((n) => n.toLowerCase() === inv.number.toLowerCase())
              ? generateNumber(numbers, inv.date)
              : inv.number
            const fresh = { ...inv, number }
            next.push(fresh)
            byNumber.set(number.toLowerCase(), fresh)
            byId.set(fresh.id, fresh)
            added += 1
          }
        }
        return sortInvoices(next)
      })
      return { added, updated }
    },
    [commit],
  )

  const value = useMemo(
    () => ({
      invoices,
      addInvoice,
      duplicateInvoice,
      updateInvoice,
      deleteInvoices,
      importInvoices,
      undo,
      redo,
      canUndo: history.past > 0,
      canRedo: history.future > 0,
      user,
      session,
      authReady,
      syncState,
      syncError,
      supabaseEnabled,
      flush,
    }),
    [
      invoices,
      addInvoice,
      duplicateInvoice,
      updateInvoice,
      deleteInvoices,
      importInvoices,
      undo,
      redo,
      history,
      user,
      session,
      authReady,
      syncState,
      syncError,
      flush,
    ],
  )

  return <InvoicesContext.Provider value={value}>{children}</InvoicesContext.Provider>
}

export function useInvoices() {
  const ctx = useContext(InvoicesContext)
  if (!ctx) throw new Error('useInvoices must be used inside <InvoicesProvider>')
  return ctx
}
