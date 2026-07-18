import { computePoints } from './GoldGraph'
import { formatClock } from './SeriesLivePulse'

// Compact viewBox for the companion sheet — shorter than GoldGraph's full 160px drawer graph and
// with no time-axis gutter (v1 has no hover, no event markers; those are R3/R4 in the spec).
const VW = 480
const VH = 72
const PL = 4
const PR = 16
const PT = 6
const PB = 6
const CW = VW - PL - PR
const CH = VH - PT - PB
const MID = PT + CH / 2

// Live Story R1: a non-interactive net-worth trajectory for the CURRENTLY RUNNING game — answers
// "was this a steady lead or a comeback," the one thing the score row's single current number
// can't show. Reuses GoldGraph's pure computePoints() (same maxAbs-normalized mapping) with an
// independent, shorter viewBox; no hover or event markers (post-game GoldGraph already covers
// those once the game ends and OD indexes it).
export default function LiveGoldGraph({ history }) {
  if (!Array.isArray(history) || history.length < 2) return null

  const data = history.map(h => h.lead).filter(v => Number.isFinite(v))
  if (data.length < 2) return null

  const pts = computePoints(data)
  if (pts.length === 0) return null

  const linePts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const finalVal = data[data.length - 1]
  const trend = finalVal > data[0] ? 'trending up' : finalVal < data[0] ? 'trending down' : 'flat'
  const ariaLabel = `Net worth trend, ${trend}`

  // A game whose first captured point isn't near kickoff started mid-graph (traffic-dependent
  // capture) — say so rather than implying the trend covers the whole game. formatClock returns
  // null for a negative gameTime (shouldn't occur here, draft-phase points are filtered upstream
  // by shapeGoldHistory), so the fallback keeps this from ever rendering "Since null".
  const firstPoint = history[0]
  const partial = firstPoint.t > 90
  const sinceLabel = formatClock(firstPoint.t)

  return (
    <div className="mt-1.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-1">
        Net Worth Trend
      </p>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        height={VH}
        preserveAspectRatio="none"
        overflow="hidden"
        role="img"
        aria-label={ariaLabel}
      >
        <line
          x1={PL} y1={MID} x2={PL + CW} y2={MID}
          className="stroke-gray-200 dark:stroke-gray-700"
          strokeWidth="0.75"
          strokeDasharray="4 3"
        />
        <polyline
          points={linePts}
          fill="none"
          className="stroke-gray-400 dark:stroke-gray-500"
          strokeWidth="1.5"
        />
      </svg>
      {partial && sinceLabel && (
        <p className="text-[9px] text-gray-400 dark:text-gray-600 mt-0.5">
          Since {sinceLabel} — full trend after the game ends
        </p>
      )}
    </div>
  )
}
