/**
 * A ring of segments.
 *
 * Each arc is a dashed circle stroke: one dash as long as the share, one gap
 * covering the rest, rotated into place. That is the whole trick — no path
 * arithmetic, and the ring stays crisp at any size.
 *
 * Colour comes from `currentColor` on the segment's own class, so the status
 * palette in index.css stays the single source for what each state looks like.
 */
export default function Donut({ segments, size = 132, thickness = 16, children }) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  let offset = 0
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const share = s.value / total
      const arc = { ...s, dash: share * circumference, offset }
      offset += share * circumference
      return arc
    })

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={thickness}
            className="stroke-raised"
          />
          {arcs.map((arc) => (
            <circle
              key={arc.id}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={thickness}
              strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
              strokeDashoffset={-arc.offset}
              className={arc.className}
            />
          ))}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  )
}
