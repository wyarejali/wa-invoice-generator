import { useCallback, useEffect, useState } from 'react'

const THEME_KEY = 'wainvoice:theme'
const PALETTE_KEY = 'wainvoice:palette'

/** Swatches are [accent, muted, line] — what the picker previews. */
export const PALETTES = [
  { id: 'mono', label: 'Mono', title: 'Monochrome', swatch: ['#18181b', '#71717a', '#e4e4e7'] },
  { id: 'indigo', label: 'Slate', swatch: ['#4f46e5', '#64748b', '#e2e8f0'] },
  { id: 'teal', label: 'Teal', swatch: ['#0f766e', '#737373', '#e5e5e5'] },
  { id: 'burgundy', label: 'Burgundy', swatch: ['#9f1239', '#78716c', '#e7e5e4'] },
]

const PALETTE_IDS = PALETTES.map((p) => p.id)

function read(key, allowed, fallback) {
  try {
    const value = localStorage.getItem(key)
    return allowed.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

function persist(key, value, fallback) {
  try {
    if (value === fallback) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage unavailable — the document attributes below still apply */
  }
}

/**
 * Shell appearance: light/dark plus one of four palettes.
 *
 * 'system' leaves `data-theme` off so the CSS media query decides; an explicit
 * choice pins it. The invoice card is deliberately unaffected by both — it
 * stays black on white in every combination, because that is what gets
 * exported and printed.
 */
export function useAppearance() {
  const [theme, setTheme] = useState(() => read(THEME_KEY, ['light', 'dark'], 'system'))
  const [palette, setPalette] = useState(() => read(PALETTE_KEY, PALETTE_IDS, 'mono'))
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mql) return
    const onChange = (e) => setSystemDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    persist(THEME_KEY, theme, 'system')
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    if (palette === 'mono') root.removeAttribute('data-palette')
    else root.setAttribute('data-palette', palette)
    persist(PALETTE_KEY, palette, 'mono')
  }, [palette])

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  const toggleTheme = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved])

  return { theme, resolved, setTheme, toggleTheme, palette, setPalette }
}
