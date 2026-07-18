/**
 * Tests for LiveGoldGraph — the compact, non-interactive net-worth trend line for the currently
 * running game in the Live Series Companion (Live Story R1). Render modes: nothing for < 2
 * points, the graph for >= 2, plus the honest "started mid-game" caption when the first capture
 * wasn't near kickoff.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LiveGoldGraph from '../components/LiveGoldGraph'

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

  it('renders the graph for 2+ points with finite leads', () => {
    const history = [point(0, 0), point(60, 500), point(120, 1200)]
    render(<LiveGoldGraph history={history} />)
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.getByText('Net Worth Trend')).toBeInTheDocument()
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
