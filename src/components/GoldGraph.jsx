import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { RoshanSvg, RampageSvg, RapierSvg } from './GameIndicators'
import { trackEvent } from '../utils'

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

function formatHoverLabel(val, radiantName, direName) {
  if (val === 0) return 'Even'
  const abs = Math.abs(val)
  const formatted = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : `${abs}`
  const team = (val > 0 ? (radiantName || 'Radiant') : (direName || 'Dire')).toUpperCase()
  return `+${formatted} ${team}`
}

// Icon component per event type — same SVG shapes as GameIndicators chips for visual consistency
const MARKER_SVG = {
  roshan: RoshanSvg,
  rampage: RampageSvg,
  rapier: RapierSvg,
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
  const [hoverMinute, setHoverMinute] = useState(null)
  const tooltipRef = useRef(null)
  // Computed fixed-position coords for the event tooltip — measured after render so we
  // can clamp to the viewport and escape the drawer's overflow-x-hidden context.
  const [tooltipFixed, setTooltipFixed] = useState(null)
  // 'mouse' | 'touch' — tracked via ref so tooltip source reads correctly on the same render cycle
  const hoverSourceRef = useRef(null)
  const wrapperRef = useRef(null)
  const svgRef = useRef(null)
  const touchStateRef = useRef({ startX: 0, startY: 0, intent: null, hideTimer: null })
  // Fire gold_chart_scrub GA event once per scrub session (not on every pixel)
  const hasTrackedScrubRef = useRef(false)

  // Convert SVG-space marker coords → viewport-space fixed coords, clamped to stay on screen.
  // Runs synchronously after DOM paint so the tooltip never visibly snaps.
  useLayoutEffect(() => {
    if (!activeEvent || !tooltipRef.current || !svgRef.current) {
      setTooltipFixed(null)
      return
    }
    const svgRect = svgRef.current.getBoundingClientRect()
    const markerVPX = svgRect.left + activeEvent.x * (svgRect.width / VW)
    const markerVPY = svgRect.top + activeEvent.y * (svgRect.height / VH)
    const tipW = tooltipRef.current.offsetWidth
    const flipLeft = (activeEvent.x - PL) / CW > 0.45
    const left = flipLeft
      ? Math.max(8, markerVPX - tipW)
      : Math.min(window.innerWidth - tipW - 8, markerVPX + 4)
    setTooltipFixed({ left, top: Math.max(8, markerVPY - 46) })
  }, [activeEvent])

  const data = radiantGoldAdv || []
  const n = data.length

  const minuteFromSvgX = useCallback((svgX) => {
    const raw = ((svgX - PL) / CW) * (n - 1)
    return Math.max(0, Math.min(n - 1, Math.round(raw)))
  }, [n])

  // Imperative touch listeners — must be passive:false for touchmove so we can call preventDefault()
  // when the user is scrubbing horizontally (prevents page scroll during horizontal drag).
  useEffect(() => {
    const el = wrapperRef.current
    if (!el || n < 2) return

    function onTouchStart(e) {
      clearTimeout(touchStateRef.current.hideTimer)
      const t = e.touches[0]
      touchStateRef.current = { startX: t.clientX, startY: t.clientY, intent: null, hideTimer: null }
    }

    function onTouchMove(e) {
      const t = e.touches[0]
      const state = touchStateRef.current

      // Determine intent on first meaningful movement
      if (state.intent === null) {
        const dx = Math.abs(t.clientX - state.startX)
        const dy = Math.abs(t.clientY - state.startY)
        if (dx < 5 && dy < 5) return
        state.intent = dx > dy ? 'horizontal' : 'vertical'
      }

      // Vertical swipe → let the drawer scroll, ignore
      if (state.intent === 'vertical') return

      // Horizontal scrub → block page scroll and show crosshair
      e.preventDefault()

      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const svgX = ((t.clientX - rect.left) / rect.width) * VW
      hoverSourceRef.current = 'touch'
      if (!hasTrackedScrubRef.current) {
        trackEvent('gold_chart_scrub', { source: 'touch' })
        hasTrackedScrubRef.current = true
      }
      setHoverMinute(minuteFromSvgX(svgX))
    }

    function onTouchEnd() {
      touchStateRef.current.intent = null
      hasTrackedScrubRef.current = false
      // Brief linger so user can read the value before it disappears
      touchStateRef.current.hideTimer = setTimeout(() => setHoverMinute(null), 600)
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
  }, [n, minuteFromSvgX])

  if (loading) {
    return <div ref={wrapperRef} className="h-[140px] rounded animate-pulse bg-gray-200 dark:bg-gray-800" />
  }

  if (n < 2) {
    return (
      <div ref={wrapperRef} className="h-[140px] flex items-center justify-center">
        <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-600">
          Gold data unavailable
        </p>
      </div>
    )
  }

  const pts = computePoints(data)

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
    // Color = side that triggered the event (not event type), so a Dire Roshan in the
    // Radiant-lead (green) band renders red — that contradiction tells the story.
    const sideColor = event.team === 'radiant' ? '#22c55e' : '#ef4444'
    const eventUrl = vodUrl ? buildEventUrl(vodUrl, event.time) : null
    return [{ i, event, x: eventX, y: eventY, sideColor, eventUrl }]
  })

  // Hover state derived values
  const hoverPt = hoverMinute !== null ? pts[hoverMinute] : null
  const hoverVal = hoverMinute !== null ? data[hoverMinute] : null
  const hoverColor = hoverVal != null
    ? hoverVal > 0 ? 'rgb(34,197,94)' : hoverVal < 0 ? 'rgb(239,68,68)' : 'rgb(156,163,175)'
    : null

  // Desktop tooltip: float near cursor, flip alignment at left/right edges
  const hoverXPct = hoverPt ? (hoverPt.x / VW) * 100 : 0
  const tooltipLeft = `${Math.max(5, Math.min(95, hoverXPct))}%`
  const tooltipTransform = hoverXPct < 15 ? 'translateX(0)' : hoverXPct > 85 ? 'translateX(-100%)' : 'translateX(-50%)'

  function handleMouseMove(e) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const svgX = ((e.clientX - rect.left) / rect.width) * VW
    hoverSourceRef.current = 'mouse'
    if (!hasTrackedScrubRef.current) {
      trackEvent('gold_chart_scrub', { source: 'mouse' })
      hasTrackedScrubRef.current = true
    }
    setHoverMinute(minuteFromSvgX(svgX))
  }

  function handleMouseLeave() {
    hoverSourceRef.current = null
    hasTrackedScrubRef.current = false
    setHoverMinute(null)
  }

  return (
    // relative wrapper so tooltips can be absolutely positioned over the SVG
    <div ref={wrapperRef} className="relative select-none">

      {/* Mobile tooltip strip — fixed at top of chart so the finger never occludes it */}
      {hoverPt && hoverSourceRef.current === 'touch' && (
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-2 py-0.5 pointer-events-none">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 tabular-nums">
            {hoverMinute}m
          </span>
          <span className="text-[10px] font-bold tabular-nums" style={{ color: hoverColor }}>
            {formatHoverLabel(hoverVal, radiantName, direName)}
          </span>
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
        aria-label={`Gold advantage: ${radiantName || 'Radiant'} vs ${direName || 'Dire'}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={() => setActiveEvent(null)}
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
        <path d={fillPath} fill="rgba(34,197,94,0.25)" clipPath={`url(#${aboveId})`} />

        {/* Dire (red) fill — below zero */}
        <path d={fillPath} fill="rgba(239,68,68,0.25)" clipPath={`url(#${belowId})`} />

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
          strokeWidth="2"
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

        {/* Crosshair — rendered before event markers so markers always sit on top */}
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
              r="5"
              fill="white"
              stroke={hoverColor}
              strokeWidth="2.5"
              pointerEvents="none"
            />
          </>
        )}

        {/* Vertical dashed ruler at the active marker's x — drawn before markers so markers sit on top */}
        {activeEvent && (
          <line
            x1={activeEvent.x.toFixed(1)} y1={PT}
            x2={activeEvent.x.toFixed(1)} y2={VH - PB}
            stroke="#374151" strokeWidth="1" strokeDasharray="3 4"
            pointerEvents="none"
          />
        )}

        {/* Event markers — active marker rendered last so it sits above all siblings */}
        {[
          ...eventMarkers.filter(m => m.i !== activeEvent?.markerIdx),
          ...eventMarkers.filter(m => m.i === activeEvent?.markerIdx),
        ].map(({ i, event, x, y, sideColor, eventUrl }) => {
          const isActive = activeEvent?.markerIdx === i
          const Icon = MARKER_SVG[event.type] || RapierSvg
          return (
            <g
              key={`ev-${i}`}
              className="gold-graph-marker"
              style={{ color: sideColor }}
              transform={`translate(${(x - 6).toFixed(1)},${(y - 6).toFixed(1)})`}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') setActiveEvent({ event, x, y, sideColor, eventUrl, markerIdx: i }) }}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActiveEvent(null) }}
              onClick={(e) => {
                e.stopPropagation() // prevent SVG onClick from dismissing immediately
                if (activeEvent?.markerIdx === i) {
                  // Second tap (or desktop click-while-hovered): open VOD link
                  if (eventUrl) {
                    trackEvent('gold_graph_marker_click', { type: event.type, team: event.team })
                    window.open(eventUrl, '_blank', 'noopener')
                  } else {
                    setActiveEvent(null)
                  }
                } else {
                  // First tap on mobile: show tooltip
                  setActiveEvent({ event, x, y, sideColor, eventUrl, markerIdx: i })
                }
              }}
            >
              {/* 24px transparent hit area */}
              <circle cx="6" cy="6" r="12" fill="transparent" />
              {/* Focus ring — visible only on the active marker */}
              {isActive && (
                <circle cx="6" cy="6" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
              )}
              {/* Icon: same shape as the GameIndicators chip for this event type */}
              <Icon width="12" height="12" />
            </g>
          )
        })}
      </svg>

      {/* Desktop hover tooltip — floats near cursor, yields to event tooltip */}
      {hoverPt && hoverSourceRef.current === 'mouse' && !activeEvent && (
        <div
          className="absolute pointer-events-none z-50 bg-gray-900 dark:bg-gray-950 border border-gray-700 dark:border-gray-800 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-xl whitespace-nowrap"
          style={{
            left: tooltipLeft,
            top: `${Math.max(0, hoverPt.y - 40)}px`,
            transform: tooltipTransform,
          }}
        >
          <span className="text-gray-400 font-medium tabular-nums">{hoverMinute}m</span>
          <span className="mx-1.5 text-gray-600">·</span>
          <span style={{ color: hoverColor }}>{formatHoverLabel(hoverVal, radiantName, direName)}</span>
        </div>
      )}

      {/* Event marker tooltip — position: fixed so it escapes overflow-x-hidden on the drawer's
          scroll container. useLayoutEffect measures actual width and clamps to viewport before paint. */}
      {activeEvent && (() => {
        const ev = activeEvent.event
        const Icon = MARKER_SVG[ev.type] || RapierSvg
        const teamName = ev.team === 'radiant' ? (radiantName || 'Radiant') : (direName || 'Dire')
        const minute = Math.floor(ev.time / 60)
        const eventLabel = ev.type === 'roshan'
          ? `Roshan${ev.index ? ` ${ev.index}` : ''}`
          : ev.type === 'rampage' ? 'Rampage' : 'Divine Rapier'
        const subject = ev.type === 'roshan'
          ? teamName
          : ev.type === 'rampage'
          ? (ev.player || teamName)
          : ev.player ? `${ev.player}${ev.hero ? ` · ${ev.hero}` : ''}` : teamName
        return (
          <div
            ref={tooltipRef}
            className="pointer-events-none z-[200] whitespace-nowrap"
            style={{
              // Off-screen until useLayoutEffect computes the clamped viewport position.
              // fixed escapes all overflow:hidden ancestors (drawer panel + scroll container).
              position: 'fixed',
              left: tooltipFixed?.left ?? -9999,
              top: tooltipFixed?.top ?? 0,
              background: '#030712',
              border: '1px solid #1f2937',
              borderRadius: '4px',
              padding: '7px 10px',
              fontSize: '13px',
              lineHeight: 1,
              color: '#fff',
              boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ color: activeEvent.sideColor, display: 'inline-flex' }}>
              <Icon style={{ width: 12, height: 12 }} />
            </span>
            <span style={{ fontWeight: 700 }}>{eventLabel}</span>
            <span style={{ color: '#374151' }}>·</span>
            <span style={{ color: '#9ca3af', fontWeight: 500 }}>{subject}</span>
            <span style={{ color: '#374151' }}>·</span>
            <span style={{ color: '#9ca3af', fontWeight: 500 }} className="tabular-nums">{minute}m</span>
            {activeEvent.eventUrl && (
              <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginLeft: 2 }}>
                Watch
              </span>
            )}
          </div>
        )
      })()}
    </div>
  )
}
