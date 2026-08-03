/**
 * Component tests for LiveMatchRow's in-game elapsed-time chip.
 *
 * `match.gameTime` (raw seconds) is attached server-side in api/live-matches.js by reusing
 * resolveRunningPulses — not owner-gated, since elapsed minutes carries no score/spoiler info.
 * Rendered as rounded whole minutes (never mm:ss), per product decision.
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

describe('LiveMatchRow — game-time chip', () => {
  it('renders nothing when match.gameTime is absent', () => {
    render(<LiveMatchRow match={baseMatch()} />)
    expect(screen.queryByText(/^\d+m$/)).toBeNull()
  })

  it('rounds down under the 30s midpoint', () => {
    render(<LiveMatchRow match={baseMatch({ gameTime: 724 })} />) // 12:04
    expect(screen.getByText('12m')).toBeTruthy()
  })

  it('rounds up at/past the 30s midpoint', () => {
    render(<LiveMatchRow match={baseMatch({ gameTime: 750 })} />) // 12:30
    expect(screen.getByText('13m')).toBeTruthy()
  })

  it('does not render mm:ss anywhere', () => {
    render(<LiveMatchRow match={baseMatch({ gameTime: 754 })} />)
    expect(screen.queryByText(/\d+:\d{2}/)).toBeNull()
  })

  it('hides during a pre-horn/draft phase (negative gameTime)', () => {
    render(<LiveMatchRow match={baseMatch({ gameTime: -30 })} />)
    expect(screen.queryByText(/^\d+m$/)).toBeNull()
  })

  it('hides when there is no currently running game, even if gameTime is present', () => {
    render(<LiveMatchRow match={baseMatch({ gameTime: 600, currentGame: null })} />)
    expect(screen.queryByText(/^\d+m$/)).toBeNull()
  })

  it('renders 0m at the very start of the game', () => {
    render(<LiveMatchRow match={baseMatch({ gameTime: 0 })} />)
    expect(screen.getByText('0m')).toBeTruthy()
  })
})
