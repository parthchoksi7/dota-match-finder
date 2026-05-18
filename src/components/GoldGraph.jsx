import { useId, useState } from 'react'

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

// Adds event.time seconds to an existing Twitch VOD URL's ?t= offset
function buildEventUrl(vodUrl, eventTimeSecs) {
  try {
    const url = new URL(vodUrl)
    const t = url.searchParams.get('t') || '0s'
    const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/)
    const baseSecs = (parseInt(m?.[1] || 0) * 3600) + (parseInt(m?.[2] || 0) * 60) + parseInt(m?.[3] || 0)
    const total = baseSecs + eventTimeSecs
    const h = Math.floor(total / 3600)
    const min = Math.floor((total % 3600) / 60)
    const s = total % 60
    const ts = `${h > 0 ? h + 'h' : ''}${min > 0 || h > 0 ? min + 'm' : ''}${s}s`
    url.searchParams.set('t', ts)
    return url.toString()
  } catch {
    return null
  }
}

export default function GoldGraph({ radiantGoldAdv, radiantName, direName, loading, events, vodUrl }) {
  // Strip colons so the id is safe in url(#...) references
  const uid = useId().replace(/:/g, '')
  const [activeEvent, setActiveEvent] = useState(null)

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

  // Build event marker positions from events array
  const eventMarkers = (events || []).flatMap((event, i) => {
    const minuteFloat = event.time / 60
    if (minuteFloat > n - 1 || minuteFloat < 0) return []
    const lo = Math.min(Math.floor(minuteFloat), n - 2)
    const frac = minuteFloat - lo
    const y0 = pts[lo].y
    const y1 = pts[lo + 1].y
    const eventX = PL + (minuteFloat / (n - 1)) * CW
    const eventY = y0 + (y1 - y0) * frac
    const color = event.type === 'rampage' ? 'rgb(239,68,68)' : 'rgb(251,191,36)'
    const eventUrl = vodUrl ? buildEventUrl(vodUrl, event.time) : null
    return [{ i, event, x: eventX, y: eventY, color, eventUrl }]
  })

  return (
    // relative wrapper so the hover tooltip can be absolutely positioned over the SVG
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        height={VH}
        preserveAspectRatio="none"
        overflow="hidden"
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

        {/* Critical event markers — rendered last so they sit on top of the gold line */}
        {eventMarkers.map(({ i, event, x, y, color, eventUrl }) => (
          <circle
            key={`ev-${i}`}
            cx={x.toFixed(1)}
            cy={y.toFixed(1)}
            r="5"
            fill={color}
            stroke="white"
            strokeWidth="1.5"
            style={{ cursor: eventUrl ? 'pointer' : 'default' }}
            onMouseEnter={() => setActiveEvent({ event, x, y, eventUrl })}
            onMouseLeave={() => setActiveEvent(null)}
            onClick={eventUrl ? () => window.open(eventUrl, '_blank', 'noopener') : undefined}
          />
        ))}
      </svg>

      {/* Hover tooltip — positioned using SVG coordinate math */}
      {activeEvent && (
        <div
          className="absolute pointer-events-none z-50 bg-gray-900 dark:bg-gray-950 text-white text-[10px] font-medium px-1.5 py-1 rounded shadow-lg whitespace-nowrap"
          style={{
            left: `${(activeEvent.x / VW) * 100}%`,
            top: `${activeEvent.y - 30}px`,
            transform: 'translateX(-50%)',
          }}
        >
          {activeEvent.event.type === 'rampage' ? 'Rampage' : 'Rapier'}
          {activeEvent.event.player ? ` · ${activeEvent.event.player}` : ''}
          {` · ${Math.floor(activeEvent.event.time / 60)}m`}
          {activeEvent.eventUrl && (
            <span className="ml-1.5 text-amber-400">Watch</span>
          )}
        </div>
      )}
    </div>
  )
}
