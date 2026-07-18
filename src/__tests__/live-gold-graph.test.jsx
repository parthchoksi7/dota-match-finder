/**
 * Tests for LiveGoldGraph — the compact, interactive net-worth trend for the currently running game
 * in the Live Series Companion (Live Story R1). Covers: render gating (< 2 plottable points → null),
 * the honest "started mid-game" caption, the trend aria-label, and the two pure mapping helpers
 * (time-scaled points + irregular time-axis ticks).
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LiveGoldGraph, { computeTimeScaledPoints, computeTimeTicks } from '../components/LiveGoldGraph'

function point(t, lead) {
  return { t, lead, rk: 0, dk: 0 }
}

describe('LiveGoldGraph — render gating', () => {
  it('renders nothing for missing/non-array history', () => {
    const { container: c1 } = render(<LiveGoldGraph history={undefined} />)
    expect(c1).toBeEmptyDOMElement()
    const { container: c2 } = render(<LiveGoldGraph history={null} />)
    expect(c2).toBeEmptyDOMElement()
  })

  it('renders nothing for 0 or 1 points', () => {
    const { container: c1 } = render(<LiveGoldGraph history={[]} />)
    expect(c1).toBeEmptyDOMElement()
    const { container: c2 } = render(<LiveGoldGraph history={[point(0, 0)]} />)
    expect(c2).toBeEmptyDOMElement()
  })

  it('renders nothing when fewer than 2 points have a finite lead', () => {
    const history = [point(0, null), point(60, undefined), point(120, NaN)]
    const { container } = render(<LiveGoldGraph history={history} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('drops pre-horn (negative game_time) points, rendering nothing if too few remain', () => {
    // Only one non-negative point survives → below the 2-point render floor.
    const history = [point(-90, 0), point(-30, 200), point(0, 500)]
    const { container } = render(<LiveGoldGraph history={history} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the graph for 2+ points with finite leads', () => {
    const history = [point(0, 0), point(60, 500), point(120, 1200)]
    render(<LiveGoldGraph history={history} />)
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.getByText('Net Worth')).toBeInTheDocument()
  })
})

describe('LiveGoldGraph — partial-history honesty label', () => {
  it('does NOT show the "since" caption when the first point is near kickoff', () => {
    const history = [point(0, 0), point(60, 500)]
    render(<LiveGoldGraph history={history} />)
    expect(screen.queryByText(/^Since/)).not.toBeInTheDocument()
  })

  it('shows the "since" caption when the first captured point is well past kickoff', () => {
    const history = [point(600, 2000), point(660, 2500)]
    render(<LiveGoldGraph history={history} />)
    expect(screen.getByText(/^Since 10:00/)).toBeInTheDocument()
    expect(screen.getByText(/full trend after the game ends/)).toBeInTheDocument()
  })
})

describe('LiveGoldGraph — aria-label reflects trend direction', () => {
  it('labels an upward trend', () => {
    const history = [point(0, -1000), point(60, 500), point(120, 3000)]
    render(<LiveGoldGraph history={history} />)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('trending up'))
  })

  it('labels a downward trend', () => {
    const history = [point(0, 3000), point(60, 500), point(120, -1000)]
    render(<LiveGoldGraph history={history} />)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('trending down'))
  })
})

describe('computeTimeScaledPoints — x maps to real game_time, not point index', () => {
  it('returns [] for < 2 points', () => {
    expect(computeTimeScaledPoints([])).toEqual([])
    expect(computeTimeScaledPoints([point(0, 0)])).toEqual([])
  })

  it('anchors the first point at the left edge and the last at the right edge', () => {
    const pts = computeTimeScaledPoints([point(0, 0), point(60, 1000)])
    expect(pts[0].x).toBeCloseTo(4, 5) // PL
    expect(pts[1].x).toBeCloseTo(472, 5) // PL + CW
    // lead 0 sits on the zero line; +max lead sits above it (smaller y)
    expect(pts[0].y).toBeGreaterThan(pts[1].y)
  })

  it('spaces points by TIME, so a large capture gap shows as more horizontal distance', () => {
    // Middle point at t=600 of a 0..660 span is ~91% across, NOT at the index midpoint (~50%).
    const pts = computeTimeScaledPoints([point(0, 0), point(600, 100), point(660, 200)])
    const frac = (pts[1].x - pts[0].x) / (pts[2].x - pts[0].x)
    expect(frac).toBeCloseTo(600 / 660, 5)
    expect(frac).toBeGreaterThan(0.85) // index-based spacing would put it at 0.5
  })
})

describe('computeTimeTicks — 5-minute ticks within the captured span', () => {
  it('returns no ticks when the span is shorter than one step', () => {
    expect(computeTimeTicks(0, 120)).toEqual([])
  })

  it('emits 5-minute ticks and skips the cramped left-edge tick at t=minT', () => {
    const ticks = computeTimeTicks(0, 660)
    expect(ticks.map(t => t.label)).toEqual(['5m', '10m'])
  })

  it('handles a partial-history start (minT > 0)', () => {
    const ticks = computeTimeTicks(180, 700)
    expect(ticks.map(t => t.label)).toEqual(['5m', '10m'])
    // first tick (300s) sits to the right of the left edge (PL=4) since minT=180 < 300
    expect(ticks[0].x).toBeGreaterThan(4)
  })

  it('excludes a tick sitting exactly on the right edge (span ends on a 5-min boundary)', () => {
    // maxT = 600 (10:00): the 10m tick would center on the viewBox edge and clip, so it is dropped.
    expect(computeTimeTicks(0, 600).map(t => t.label)).toEqual(['5m'])
  })
})
