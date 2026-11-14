import { useState } from 'react'

/**
 * Two series, one column per period.
 *
 * Plain elements rather than SVG: a bar chart is a row of boxes, and boxes
 * size themselves against their container for free, where an SVG would need a
 * measured viewBox to stay sharp and proportional at every width.
 *
 * The readout sits in the header instead of floating over the bars — a
 * tooltip that follows the pointer is the part of a chart that breaks on
 * touch, and there is nothing here it would say that the header cannot.
 */
export default function ColumnChart({ data, series, format, height = 150, onHover }) {
  const [active, setActive] = useState(null)
  const peak = Math.max(
    1,
    ...data.flatMap((row) => series.map((s) => row[s.key] || 0)),
  )

  const hover = (index) => {
    setActive(index)
    onHover?.(index === null ? null : data[index])
  }

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((row, index) => (
          <div
            key={row.key}
            className={`group flex h-full flex-1 cursor-default flex-col justify-end ${
              // Outside the selected period: still drawn, so the trend stays
              // readable, but not competing with the part being asked about.
              row.dim ? 'opacity-35' : ''
            }`}
            onMouseEnter={() => hover(index)}
            onMouseLeave={() => hover(null)}
            onFocus={() => hover(index)}
            onBlur={() => hover(null)}
            tabIndex={0}
            aria-label={`${row.label}: ${series
              .map((s) => `${s.label} ${format(row[s.key] || 0)}`)
              .join(', ')}`}
          >
            <div
              className={`flex h-full items-end gap-[2px] rounded-[3px] px-[1px] transition-colors ${
                active === index ? 'bg-raised' : ''
              }`}
            >
              {series.map((s) => {
                const value = row[s.key] || 0
                return (
                  <div
                    key={s.key}
                    className={`flex-1 rounded-t-[2px] ${s.className}`}
                    // A month with nothing in it still gets a sliver, so the
                    // baseline reads as a row of months and not a gap.
                    style={{ height: `${value > 0 ? Math.max(2, (value / peak) * 100) : 1}%` }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-1.5">
        {data.map((row, index) => (
          <div
            key={row.key}
            className={`flex-1 text-center text-[10px] ${
              active === index ? 'text-fg' : 'text-fg-subtle'
            } ${row.dim ? 'opacity-50' : ''}`}
          >
            {row.label}
          </div>
        ))}
      </div>
    </div>
  )
}
