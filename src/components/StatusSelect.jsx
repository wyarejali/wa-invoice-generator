import { STATUSES } from '../lib/invoice'
import Dropdown, { MenuItem } from './ui/Dropdown'
import Icon from './ui/Icon'
import StatusBadge from './StatusBadge'

/**
 * Pick a status directly instead of clicking through the lifecycle. The order
 * in the menu is still Draft → Unpaid → Sent → Paid, so the progression stays
 * legible.
 */
export default function StatusSelect({ status, onChange, className = '' }) {
  return (
    <Dropdown
      label="Invoice status"
      align="left"
      width="w-full min-w-[12rem]"
      trigger={() => (
        <button
          type="button"
          className={`ui-btn w-full justify-between ${className}`}
        >
          <StatusBadge status={status} />
          <Icon name="selector" size={15} className="text-fg-subtle" />
        </button>
      )}
    >
      {(close) =>
        STATUSES.map((value) => (
          <MenuItem
            key={value}
            onClick={() => {
              if (value !== status) onChange(value)
              close()
            }}
            trailing={
              value === status ? <Icon name="check" size={14} className="text-accent" /> : null
            }
          >
            <StatusBadge status={value} />
          </MenuItem>
        ))
      }
    </Dropdown>
  )
}
