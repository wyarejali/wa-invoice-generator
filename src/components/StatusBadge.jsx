import Icon from './ui/Icon'

/**
 * A status reads as a shape first and a tint second. Colour alone cannot carry
 * a state — it is lost to a colour-blind reader and to a greyscale print — so
 * every status gets an icon, and the tint is reinforcement.
 */
export const STATUS_ICON = {
  draft: 'pencil',
  unpaid: 'clock',
  sent: 'send',
  paid: 'circleCheck',
}

/** Tinted pill. For places that need the status to look like a control. */
export default function StatusBadge({ status, className = '' }) {
  return (
    <span className={`ui-status ui-status-${status} ${className}`}>
      <Icon name={STATUS_ICON[status]} size={12} stroke={2} />
      {status}
    </span>
  )
}

/** Icon and word, no pill. For dense rows, where a pill is too much weight. */
export function StatusText({ status, size = 13, className = '' }) {
  return (
    <span className={`ui-status-${status} inline-flex items-center gap-1 capitalize ${className}`}>
      <Icon name={STATUS_ICON[status]} size={size} stroke={2} />
      {status}
    </span>
  )
}
