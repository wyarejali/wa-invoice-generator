import { SHORTCUTS } from '../lib/shortcuts'
import Modal from './ui/Modal'

export default function ShortcutsDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="shortcuts-title" width="max-w-lg">
      <div className="p-5">
        <h2 id="shortcuts-title" className="text-[15px] font-semibold">
          Keyboard shortcuts
        </h2>

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {SHORTCUTS.map((section) => (
            <div key={section.group}>
              <h3 className="text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">
                {section.group}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {section.items.map((item) => (
                  <li
                    key={`${section.group}-${item.label}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-[13px] text-fg-muted">{item.label}</span>
                    <span className="flex shrink-0 gap-1">
                      {item.keys.map((k, i) => (
                        <kbd key={i} className="ui-kbd">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <button type="button" data-autofocus className="ui-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
