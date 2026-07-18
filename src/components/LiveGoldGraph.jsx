import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { formatGold, formatHoverLabel } from './GoldGraph'
import { formatClock } from './SeriesLivePulse'
import { trackEvent } from '../utils'

// Compact viewBox for the companion sheet — shorter than GoldGraph's full 160px drawer graph, but
// carrying the same visual language (green/red area fill, dashed zero line, RADIANT/DIRE header,
// time axis, hover/scrub tooltip) so it reads as the pre-game sibling of the finished-game graph.
const VW = 480
const VH = 128
const PL = 4      // minimal stroke-buffer only — labels are HTML/text nodes
const PR = 8      // right buffer so the last hover dot (r≈4.5) stays inside the viewBox
const PT = 8      // top padding
const PB = 20     // bottom padding for the time-axis labels
const CW = VW - PL - PR    // chart width: 468
const CH = VH - PT - PB    // chart height: 100
const MID = PT + CH / 2    // y of the zero line: 58

// Maps the net-worth timeseries to SVG {x, y} points on a REAL time axis (x ∝ game_time), unlike
// GoldGraph.computePoints which is index-based (evenly spaced). The live capture is sparse and
// irregular (~1 point / capture, ~60–110s cadence, with gaps on pauses/reconnects) — spacing points
// by index would silently compress a real capture gap, so we scale by game_time instead: a longer
// gap between two captures shows as more horizontal distance, which is the honest picture. Assumes
// finite t/lead on every point (the component filters + sorts before calling). Exported for tests.
export function computeTimeScaledPoints(history) {
  const n = history.length
  if (n < 2) return []
  const minT = history[0].t
  const maxT = history[n - 1].t
  const span = Math.max(maxT - minT, 1)
  const maxAbs = Math.max(...history.map(h => Math.abs(h.lead)), 1)
  return history.map(h => ({
    x: PL + ((h.t - minT) / span) * CW,
    y: MID - (h.lead / maxAbs) * (CH / 2),
    t: h.t,
    lead: h.lead,
  }))
}

// Time-axis ticks at every `stepS` seconds (default 5 min) that fall inside [minT, maxT]. A young
// game whose whole span is < one step shows no ticks (honest — nothing to label yet) rather than a
// forced minimum. Labels are whole minutes (`10m`) since ticks land on 5-min multiples. Exported
// for tests.
export function computeTimeTicks(minT, maxT, stepS = 300) {
  const ticks = []
  if (!(maxT > minT)) return ticks
  const span = Math.max(maxT - minT, 1)
  const first = Math.ceil(minT / stepS) * stepS
  // Strict `< maxT` (not `<=`), same as GoldGraph's time-axis loop: a tick sitting exactly on the
  // right edge (when the captured span ends on a 5-min boundary) would center ~8px from the viewBox
  // edge and clip. `s <= minT` likewise skips a tick on the cramped left edge (e.g. "0m").
  for (let s = first; s < maxT; s += stepS) {
    if (s <= minT) continue
    ticks.push({ t: s, x: PL + ((s - minT) / span) * CW, label: `${Math.round(s / 60)}m` })
  }
  return ticks
}

function advColor(val) {
  return val > 0 ? 'rgb(34,197,94)' : val < 0 ? 'rgb(239,68,68)' : 'rgb(156,163,175)'
}

// Live Story R1 (now interactive): a compact net-worth trajectory for the CURRENTLY RUNNING game —
// answers "was this a steady lead or a comeback," which the score row's single current number can't.
// Hover (desktop) or drag (mobile) to read the net worth at any past capture point. The live capture
// is coarse, so the crosshair SNAPS to the nearest real captured point (never interpolates between
// them) — the one deliberate divergence from GoldGraph, which can interpolate because it has a value
// at every minute. No event markers (there is no live rapier/roshan/teamfight feed — those are R3/R4
// and only exist post-game once OpenDota parses the match).
export default function LiveGoldGraph({ history, radiantName, direName }) {
  const uid = useId().replace(/:/g, '')
  const [hoverIdx, setHoverIdx] = useState(null)
  const [hoverViewport, setHoverViewport] = useState(null) // { x, y, source: 'mouse' | 'touch' }
  const hasTrackedScrubRef = useRef(false)
  const svgRef = useRef(null)
  const wrapperRef = useRef(null)
  const touchStateRef = useRef({ startX: 0, startY: 0, intent: null, hideTimer: null })

  // Filter to plottable points (non-negative game_time + finite net-worth lead) and sort ascending
  // by time so the line never zigzags even if a caller ever hands us unsorted rows. shapeGoldHistory
  // already drops pre-horn (game_time < 0) and null-lead points upstream, but re-applying it here
  // keeps the component correct on its own (a negative t would otherwise render a blank tooltip clock,
  // since formatClock returns null for it). Memoized on the history prop so the derived pts/clean stay
  // reference-stable across the frequent hover/scrub re-renders within a poll — that keeps
  // nearestIndex's identity stable so the touch-listener effect doesn't re-subscribe on every render.
  const { pts, clean } = useMemo(() => {
    const cleaned = (Array.isArray(history) ? history : [])
      .filter(h => h && Number.isFinite(h.t) && h.t >= 0 && Number.isFinite(h.lead))
      .sort((a, b) => a.t - b.t)
    return { clean: cleaned, pts: cleaned.length >= 2 ? computeTimeScaledPoints(cleaned) : [] }
  }, [history])

  const nearestIndex = useCallback((svgX) => {
    if (pts.length === 0) return null
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - svgX)
      if (d < bestD) { bestD = d; best = i }
    }
    return best
  }, [pts])

  // Imperative touch scrub — passive:false so a horizontal drag can preventDefault() the sheet
  // scroll. Vertical intent falls through to normal scroll (5px threshold). Same model as GoldGraph.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el || pts.length < 2) return

    function onTouchStart(e) {
      clearTimeout(touchStateRef.current.hideTimer)
      const t = e.touches[0]
      touchStateRef.current = { startX: t.clientX, startY: t.clientY, intent: null, hideTimer: null }
    }
    function onTouchMove(e) {
      const t = e.touches[0]
      const state = touchStateRef.current
      if (state.intent === null) {
        const dx = Math.abs(t.clientX - state.startX)
        const dy = Math.abs(t.clientY - state.startY)
        if (dx < 5 && dy < 5) return
        state.intent = dx > dy ? 'horizontal' : 'vertical'
      }
      if (state.intent === 'vertical') return
      e.preventDefault()
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      const svgX = ((t.clientX - rect.left) / rect.width) * VW
      if (!hasTrackedScrubRef.current) {
        trackEvent('live_gold_scrub', { source: 'touch' })
        hasTrackedScrubRef.current = true
      }
      setHoverIdx(nearestIndex(svgX))
      setHoverViewport({ x: t.clientX, y: t.clientY, source: 'touch' })
    }
    function onTouchEnd() {
      touchStateRef.current.intent = null
      hasTrackedScrubRef.current = false
      touchStateRef.current.hideTimer = setTimeout(() => {
        setHoverIdx(null)
        setHoverViewport(null)
      }, 600)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      clearTimeout(touchStateRef.current.hideTimer)
    }
  }, [pts, nearestIndex])

  if (pts.length < 2) return null

  const finalVal = clean[clean.length - 1].lead
  const finalColor = advColor(finalVal)
  const trend = finalVal > clean[0].lead ? 'trending up' : finalVal < clean[0].lead ? 'trending down' : 'flat'
  const ariaLabel = `Net worth trend, ${trend}`

  const linePts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  // Closed area path: baseline left → data line → baseline right → close (same shape as GoldGraph).
  const fillPath = [
    `M ${PL},${MID}`,
    ...pts.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `L ${(PL + CW).toFixed(1)},${MID}`,
    'Z',
  ].join(' ')

  const ticks = computeTimeTicks(clean[0].t, clean[clean.length - 1].t)

  const aboveId = `lgg-above-${uid}`
  const belowId = `lgg-below-${uid}`

  // Guard hoverIdx against a shrunk history (new game resolved → fewer points) so a stale index
  // never reads past the array.
  const hoverPt = hoverIdx != null && hoverIdx < pts.length ? pts[hoverIdx] : null
  const hoverColor = hoverPt ? advColor(hoverPt.lead) : null

  // A game whose first captured point isn't near kickoff started mid-graph (traffic-dependent
  // capture start) — say so rather than implying the trend covers the whole game.
  const partial = clean[0].t > 90
  const sinceLabel = formatClock(clean[0].t)

  function handleMouseMove(e) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const svgX = ((e.clientX - rect.left) / rect.width) * VW
    if (!hasTrackedScrubRef.current) {
      trackEvent('live_gold_scrub', { source: 'mouse' })
      hasTrackedScrubRef.current = true
    }
    setHoverIdx(nearestIndex(svgX))
    setHoverViewport({ x: e.clientX, y: e.clientY, source: 'mouse' })
  }
  function handleMouseLeave() {
    hasTrackedScrubRef.current = false
    setHoverIdx(null)
    setHoverViewport(null)
  }

  return (
    <div className="mt-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-2">
        Net Worth
      </p>

      {/* Header row — RADIANT (green) · current net-worth diff (advantage color) · DIRE (red).
          Mirrors GoldGraph's header so both graphs read as one system. */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'rgb(34,197,94)' }}>
          Radiant
        </span>
        <span className="text-[10px] font-bold tabular-nums" style={{ color: finalColor }}>
          {formatGold(finalVal)}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'rgb(239,68,68)' }}>
          Dire
        </span>
      </div>

      <div ref={wrapperRef} className="relative select-none">
        {/* Scrub tooltip — floating fixed card, viewport-clamped so it never clips at the sheet edge.
            Same dark card as GoldGraph's scrub tooltip. */}
        {hoverPt && hoverViewport && (
          <div
            className="pointer-events-none z-50 bg-gray-900 dark:bg-gray-950 border border-gray-700 dark:border-gray-800 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-xl whitespace-nowrap"
            style={{
              position: 'fixed',
              left: Math.max(8, Math.min(window.innerWidth - 210, hoverViewport.x - 80)),
              top: Math.max(8, hoverViewport.y - (hoverViewport.source === 'touch' ? 70 : 50)),
            }}
          >
            <span className="text-gray-400 font-medium tabular-nums">{formatClock(hoverPt.t)}</span>
            <span className="mx-1.5 text-gray-600">·</span>
            <span style={{ color: hoverColor }}>{formatHoverLabel(hoverPt.lead, radiantName, direName)}</span>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%"
          height={VH}
          preserveAspectRatio="none"
          overflow="hidden"
          role="img"
          aria-label={ariaLabel}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <clipPath id={aboveId}><rect x={PL} y={PT} width={CW} height={CH / 2} /></clipPath>
            <clipPath id={belowId}><rect x={PL} y={MID} width={CW} height={CH / 2} /></clipPath>
          </defs>

          {/* Radiant (green) fill above zero, Dire (red) fill below — same tint as GoldGraph */}
          <path d={fillPath} fill="rgba(34,197,94,0.25)" clipPath={`url(#${aboveId})`} />
          <path d={fillPath} fill="rgba(239,68,68,0.25)" clipPath={`url(#${belowId})`} />

          {/* Dashed zero line */}
          <line
            x1={PL} y1={MID} x2={PL + CW} y2={MID}
            className="stroke-gray-200 dark:stroke-gray-700"
            strokeWidth="0.75"
            strokeDasharray="4 3"
          />

          {/* Net-worth line */}
          <polyline
            points={linePts}
            fill="none"
            className="stroke-gray-400 dark:stroke-gray-500"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Time-axis labels */}
          {ticks.map(({ t, x, label }) => (
            <text
              key={t}
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

          {/* Crosshair + dot at the snapped point */}
          {hoverPt && (
            <>
              <line
                x1={hoverPt.x.toFixed(1)} y1={PT}
                x2={hoverPt.x.toFixed(1)} y2={VH - PB}
                stroke="rgb(156,163,175)"
                strokeWidth="0.75"
                strokeDasharray="3 2"
                pointerEvents="none"
              />
              <circle
                cx={hoverPt.x.toFixed(1)}
                cy={hoverPt.y.toFixed(1)}
                r="4.5"
                fill="white"
                stroke={hoverColor}
                strokeWidth="2.5"
                pointerEvents="none"
              />
            </>
          )}
        </svg>
      </div>

      {partial && sinceLabel && (
        <p className="text-[9px] text-gray-400 dark:text-gray-600 mt-1">
          Since {sinceLabel} — full trend after the game ends
        </p>
      )}
    </div>
  )
}
