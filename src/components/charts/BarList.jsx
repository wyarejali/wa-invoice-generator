/**
 * Ranked rows with a bar behind each one. The bar is a background rather than
 * a separate column, so a long label never squeezes the chart into a sliver.
 */
export default function BarList({ rows, format, empty = 'Nothing yet.' }) {
  const peak = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <p className="py-6 text-center text-[12px] text-fg-subtle">{empty}</p>

  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li key={row.id} className="relative overflow-hidden rounded-md">
          <div
            aria-hidden
            className={`absolute inset-y-0 left-0 rounded-md ${row.className || 'bg-accent-soft'}`}
            style={{ width: `${Math.max(2, (row.value / peak) * 100)}%` }}
          />
          <div className="relative flex items-baseline gap-2 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[12.5px]">{row.label}</span>
            {row.meta && <span className="shrink-0 text-[11px] text-fg-subtle">{row.meta}</span>}
            <span className="shrink-0 font-mono text-[12px] tabular-nums">{format(row.value)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
