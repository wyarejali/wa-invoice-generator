export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

export const MOD = IS_MAC ? '⌘' : 'Ctrl'
const ALT = IS_MAC ? '⌥' : 'Alt'
const SHIFT = IS_MAC ? '⇧' : 'Shift'

/** Single source of truth for the shortcuts dialog and the command palette. */
export const SHORTCUTS = [
  {
    group: 'General',
    items: [
      { keys: [MOD, 'K'], label: 'Open command palette' },
      { keys: [MOD, 'N'], label: 'New invoice' },
      { keys: [MOD, 'D'], label: 'Duplicate invoice' },
      { keys: [MOD, 'Z'], label: 'Undo' },
      { keys: [MOD, SHIFT, 'Z'], label: 'Redo' },
      { keys: ['?'], label: 'Show this list' },
      { keys: ['Esc'], label: 'Close dialogs' },
    ],
  },
  {
    group: 'Line items',
    items: [
      { keys: [MOD, 'Enter'], label: 'Add a line' },
      { keys: ['Enter'], label: 'Description → amount' },
      { keys: ['Enter'], label: 'Amount → new line below' },
      { keys: [ALT, '↑ / ↓'], label: 'Move the current line' },
      { keys: ['Backspace'], label: 'Remove an empty line' },
    ],
  },
]

/** True when the event target is somewhere the user is typing. */
export function isTypingTarget(target) {
  if (!target) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}
