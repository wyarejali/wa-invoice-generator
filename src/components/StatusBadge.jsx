/**
 * Tinted status chip — semantic colours that stay the same across palettes.
 * This is chrome; the exported document never shows one.
 */
export default function StatusBadge({ status, className = '' }) {
  return <span className={`ui-status ui-status-${status} ${className}`}>{status}</span>
}
