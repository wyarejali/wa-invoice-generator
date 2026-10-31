import { normalizeInvoice } from './invoice'

const KEY = 'wainvoice:invoices:v1'

export function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(normalizeInvoice) : []
  } catch {
    // Corrupt or unavailable storage (private mode, cleared site data).
    return []
  }
}

export function saveLocal(invoices) {
  try {
    localStorage.setItem(KEY, JSON.stringify(invoices))
  } catch {
    /* quota or blocked storage — the in-memory copy still works */
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function downloadJSON(invoices, filename = 'invoices.json') {
  const blob = new Blob([JSON.stringify(invoices, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Read a user-picked .json file and return normalized invoices. */
export async function readJSONFile(file) {
  const text = await file.text()
  const parsed = JSON.parse(text)
  // Accept either a bare array or { invoices: [...] }.
  const list = Array.isArray(parsed) ? parsed : parsed?.invoices
  if (!Array.isArray(list)) throw new Error('File does not contain an invoice array.')
  return list.map(normalizeInvoice)
}
