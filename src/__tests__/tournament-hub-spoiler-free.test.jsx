/**
 * Tests for spoiler-free gating in Tournament Hub / tournament detail pages.
 *
 * Covers:
 * - StandingsTable (TournamentHub.jsx) hides W/L, rank, and advancement
 *   coloring when spoilerFree, and shows them when not
 * - BracketFlatView (BracketView.jsx) hides match scores when spoilerFree
 * - HorizontalBracket (BracketView.jsx) hides bracket-card scores when spoilerFree
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StandingsTable } from '../components/TournamentHub'
import { BracketFlatView, HorizontalBracket } from '../components/BracketView'

const standings = [
  { rank: 1, team: 'Team Spirit', wins: 2, losses: 0 },
  { rank: 2, team: 'BoomBoys', wins: 2, losses: 0 },
  { rank: 3, team: 'Aurora', wins: 1, losses: 1 },
  { rank: 4, team: 'Iron Wing', wins: 0, losses: 2 },
]

const advancement = [
  { type: 'up', rankRange: [1, 1], label: 'Top 1', dest: 'Playoffs' },
  { type: 'out', rankRange: [4, 4], label: '4th', dest: 'Eliminated' },
]

describe('StandingsTable spoiler-free gating', () => {
  it('shows real W/L numbers and rank when not spoiler-free', () => {
    render(<StandingsTable standings={standings} advancement={advancement} spoilerFree={false} />)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
    expect(screen.queryByText('?·?')).toBeNull()
  })

  it('hides W/L numbers and rank behind a placeholder when spoiler-free', () => {
    render(<StandingsTable standings={standings} advancement={advancement} spoilerFree={true} />)
    expect(screen.getAllByText('?·?').length).toBe(standings.length)
    // No raw win/loss counts should leak through as text nodes
    standings.forEach(s => {
      expect(screen.queryByText(String(s.wins))).toBeNull()
    })
  })

  it('re-sorts alphabetically instead of by rank when spoiler-free', () => {
    const { container } = render(<StandingsTable standings={standings} advancement={advancement} spoilerFree={true} />)
    const teamCells = Array.from(container.querySelectorAll('tbody tr td:nth-child(2)')).map(td => td.textContent)
    expect(teamCells).toEqual(['Aurora', 'BoomBoys', 'Iron Wing', 'Team Spirit'])
  })
})

const flatBracket = [
  {
    round: 1,
    label: 'Round 1',
    matches: [
      { id: 'm1', teamA: 'Team Falcons', teamB: 'LGD Gaming', scoreA: 2, scoreB: 1, status: 'finished' },
      { id: 'm2', teamA: 'Iron Wing', teamB: 'Nigma Galaxy', scoreA: 2, scoreB: 0, status: 'finished' },
    ],
  },
]

describe('BracketFlatView spoiler-free gating', () => {
  it('shows real scores when not spoiler-free', () => {
    render(<BracketFlatView bracket={flatBracket} spoilerFree={false} />)
    expect(screen.queryByText('?·?')).toBeNull()
  })

  it('replaces finished-match scores with a placeholder when spoiler-free', () => {
    render(<BracketFlatView bracket={flatBracket} spoilerFree={true} />)
    expect(screen.getAllByText('?·?').length).toBe(flatBracket[0].matches.length)
  })
})

const horizontalBracket = [
  {
    section: 'main',
    round: 1,
    label: 'Round 1',
    matches: [
      { id: 'm1', teamA: 'Team Spirit', teamB: 'Aurora', scoreA: 2, scoreB: 0, status: 'finished' },
    ],
  },
]

describe('HorizontalBracket spoiler-free gating', () => {
  it('shows real scores when not spoiler-free', () => {
    render(<HorizontalBracket bracket={horizontalBracket} spoilerFree={false} />)
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('hides scores entirely when spoiler-free', () => {
    render(<HorizontalBracket bracket={horizontalBracket} spoilerFree={true} />)
    expect(screen.queryByText('2')).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
  })
})
