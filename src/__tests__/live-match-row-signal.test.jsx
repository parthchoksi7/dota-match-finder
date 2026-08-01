/**
 * Component tests for LiveMatchRow's live "worth watching" badge
 * (`.claude/specs/live-worth-watching-signal-spec.md`), owner-only as of this build.
 *
 * `match.signal` is only ever present in the API response for an owner-flagged request
 * (api/live-matches.js's stripSignalForResponse strips it for everyone else) — these tests feed
 * `match.signal` directly, since LiveMatchRow itself has no notion of who's asking; the gate is
 * entirely "is this field present on the object I was given."
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LiveMatchRow from '../components/LiveMatchRow.jsx'

function baseMatch(overrides = {}) {
  return {
    id: 1,
    teamA: 'Team Spirit',
    teamB: 'Gaimin Gladiators',
    tournament: 'Test Cup',
    seriesLabel: 'BO3',
    seriesScore: '0-0',
    bracketRound: 'Upper Bracket Final',
    currentGame: 1,
    games: [],
    streams: [],
    ...overrides,
  }
}

describe('LiveMatchRow — signal badge visibility', () => {
  it('renders nothing when match.signal is absent (public payload today)', () => {
    render(<LiveMatchRow match={baseMatch()} />)
    expect(screen.queryByText('CLOSE')).toBeNull()
    expect(screen.queryByText('SWINGING')).toBeNull()
    expect(screen.queryByText('ONE-SIDED')).toBeNull()
  })

  it('renders CLOSE in the positive (red) treatment', () => {
    render(<LiveMatchRow match={baseMatch({ signal: 'CLOSE' })} />)
    const el = screen.getByText('CLOSE')
    expect(el.className).toContain('text-red-500')
  })

  it('renders SWINGING sharing the same positive treatment as CLOSE', () => {
    render(<LiveMatchRow match={baseMatch({ signal: 'SWINGING' })} />)
    const el = screen.getByText('SWINGING')
    expect(el.className).toContain('text-red-500')
  })

  it('renders ONE-SIDED in the recessive gray treatment', () => {
    render(<LiveMatchRow match={baseMatch({ signal: 'ONE_SIDED', bracketRound: 'Group Stage' })} />)
    const el = screen.getByText('ONE-SIDED')
    expect(el.className).toContain('text-gray-500')
    expect(el.className).not.toContain('text-red-500')
  })

  it('is suppressed entirely in spoiler-free mode, all three states', () => {
    for (const signal of ['CLOSE', 'SWINGING', 'ONE_SIDED']) {
      render(<LiveMatchRow match={baseMatch({ signal, bracketRound: 'Group Stage' })} spoilerFree />)
    }
    expect(screen.queryByText('CLOSE')).toBeNull()
    expect(screen.queryByText('SWINGING')).toBeNull()
    expect(screen.queryByText('ONE-SIDED')).toBeNull()
  })

  it('carries a descriptive aria-label distinct from the bare state word', () => {
    render(<LiveMatchRow match={baseMatch({ signal: 'CLOSE' })} />)
    expect(screen.getByLabelText('Current game is close')).toBeTruthy()
  })
})

describe('LiveMatchRow — ONE_SIDED product-review suppressions (2026-08-01 critique)', () => {
  it('suppresses ONE_SIDED on a followed team\'s row (partisan fans stay invested behind)', () => {
    render(<LiveMatchRow match={baseMatch({ signal: 'ONE_SIDED', bracketRound: 'Group Stage' })} isFollowedMatch />)
    expect(screen.queryByText('ONE-SIDED')).toBeNull()
  })

  it('suppresses ONE_SIDED on a Grand Final regardless of followed status', () => {
    render(<LiveMatchRow match={baseMatch({ signal: 'ONE_SIDED', bracketRound: 'Grand Final' })} />)
    expect(screen.queryByText('ONE-SIDED')).toBeNull()
  })

  it('suppresses ONE_SIDED on a BO3 decider (1-1)', () => {
    render(<LiveMatchRow match={baseMatch({ signal: 'ONE_SIDED', bracketRound: 'Group Stage', seriesLabel: 'BO3', seriesScore: '1-1' })} />)
    expect(screen.queryByText('ONE-SIDED')).toBeNull()
  })

  it('does NOT suppress CLOSE or SWINGING on a followed team or Grand Final row', () => {
    render(<LiveMatchRow match={baseMatch({ signal: 'CLOSE', bracketRound: 'Grand Final' })} isFollowedMatch />)
    expect(screen.getByText('CLOSE')).toBeTruthy()
  })

  it('still renders ONE_SIDED on an ordinary, non-followed, non-decider row', () => {
    render(<LiveMatchRow match={baseMatch({ signal: 'ONE_SIDED', bracketRound: 'Group Stage', seriesScore: '0-0' })} />)
    expect(screen.getByText('ONE-SIDED')).toBeTruthy()
  })
})

describe('LiveMatchRow — mobile yield rule (badge wins, bracketRound yields below sm:)', () => {
  it('gives bracketRound the hidden sm:inline class only when a badge is present', () => {
    const { rerender } = render(<LiveMatchRow match={baseMatch({ bracketRound: 'Group Stage' })} />)
    expect(screen.getByText('Group Stage').className).not.toContain('hidden')

    rerender(<LiveMatchRow match={baseMatch({ bracketRound: 'Group Stage', signal: 'CLOSE' })} />)
    expect(screen.getByText('Group Stage').className).toContain('hidden sm:inline')
  })
})
