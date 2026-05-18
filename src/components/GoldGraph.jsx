import { useId } from 'react'

// SVG coordinate constants (viewBox: 480 × 140)
const VW = 480
const VH = 140
const PL = 40     // left padding for RADIANT/DIRE labels
const PR = 54     // right padding for final gold value
const PT = 14     // top padding
const PB = 22     // bottom padding for time axis labels
const CW = VW - PL - PR    // chart width: 386
const CH = VH - PT - PB    // chart height: 104
const MID = PT + CH / 2    // y-coordinate of the zero line: 66

// Maps data array to SVG {x, y} points. Exported for unit tests.
export function computePoints(data) {
  const n = data.length
  if (n < 2) return []
  const maxAbs = Math.max(...data.map(v => Math.abs(v)), 1)
  return data.map((v, i) => ({
    x: PL + (i / (n - 1)) * CW,
    y: MID - (v / maxAbs) * (CH / 2),
  }))
}

function formatGold(val) {
  if (val === 0) return '0'
  const abs = Math.abs(val)
  const sign = val > 0 ? '+' : '-'
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`
  return `${sign}${abs}`
}

export default function GoldGraph({ radiantGoldAdv, radiantName, direName, loading }) {
  // Strip colons so the id is safe in url(#...) references
  const uid = useId().replace(/:/g, '')

  if (loading) {
    return <div className="h-[140px] rounded animate-pulse bg-gray-200 dark:bg-gray-800" />
  }

  const data = radiantGoldAdv || []

  if (data.length < 2) {
    return (
      <div className="h-[140px] flex items-center justify-center">
        <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-600">
          Gold data unavailable
        </p>
      </div>
    )
  }

  const pts = computePoints(data)
  const n = data.length

  const linePts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  // Closed area path: baseline left → data line → baseline right → close
  const fillPath = [
    `M ${PL},${MID}`,
    ...pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `L ${(PL + CW).toFixed(1)},${MID}`,
    'Z',
  ].join(' ')

  // Time axis labels at every 5-minute mark
  const timeLabels = []
  for (let i = 5; i < n; i += 5) {
    timeLabels.push({ x: PL + (i / (n - 1)) * CW, label: `${i}m` })
  }

  const finalVal = data[n - 1]
  const finalPt = pts[n - 1]
  const finalColor = finalVal > 0 ? 'rgb(34,197,94)' : finalVal < 0 ? 'rgb(239,68,68)' : 'rgb(156,163,175)'
  // Clamp label so it stays inside the chart bounds
  const finalLabelY = Math.max(PT + 10, Math.min(VH - PB - 2, finalPt.y + 4))

  const aboveId = `gold-above-${uid}`
  const belowId = `gold-below-${uid}`

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      height={VH}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Gold advantage: ${radiantName || 'Radiant'} vs ${direName || 'Dire'}`}
    >
      <defs>
        {/* Clip the fill path to the above-zero half (radiant green area) */}
        <clipPath id={aboveId}>
          <rect x={PL} y={PT} width={CW} height={CH / 2} />
        </clipPath>
        {/* Clip the fill path to the below-zero half (dire red area) */}
        <clipPath id={belowId}>
          <rect x={PL} y={MID} width={CW} height={CH / 2} />
        </clipPath>
      </defs>

      {/* Radiant (green) fill — above zero */}
      <path d={fillPath} fill="rgba(34,197,94,0.20)" clipPath={`url(#${aboveId})`} />

      {/* Dire (red) fill — below zero */}
      <path d={fillPath} fill="rgba(239,68,68,0.20)" clipPath={`url(#${belowId})`} />

      {/* Dashed zero line */}
      <line
        x1={PL} y1={MID} x2={PL + CW} y2={MID}
        className="stroke-gray-200 dark:stroke-gray-700"
        strokeWidth="0.75"
        strokeDasharray="4 3"
      />

      {/* Gold advantage line */}
      <polyline
        points={linePts}
        fill="none"
        className="stroke-gray-400 dark:stroke-gray-500"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Time axis labels */}
      {timeLabels.map(({ x, label }) => (
        <text
          key={label}
          x={x}
          y={VH - 5}
          textAnchor="middle"
          fontSize="9"
          fill="rgb(156,163,175)"
          fontFamily="inherit"
        >
          {label}
        </text>
      ))}

      {/* RADIANT label (top-left) */}
      <text
        x={PL - 3}
        y={PT + 10}
        textAnchor="end"
        fontSize="8"
        fill="rgb(34,197,94)"
        fontWeight="bold"
        fontFamily="inherit"
      >
        RADIANT
      </text>

      {/* DIRE label (bottom-left) */}
      <text
        x={PL - 3}
        y={PT + CH - 2}
        textAnchor="end"
        fontSize="8"
        fill="rgb(239,68,68)"
        fontWeight="bold"
        fontFamily="inherit"
      >
        DIRE
      </text>

      {/* Final gold advantage value (right edge) */}
      <text
        x={PL + CW + 6}
        y={finalLabelY}
        textAnchor="start"
        fontSize="10"
        fill={finalColor}
        fontWeight="bold"
        fontFamily="inherit"
      >
        {formatGold(finalVal)}
      </text>
    </svg>
  )
}
