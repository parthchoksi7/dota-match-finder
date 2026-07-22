/**
 * Tests that MatchList correctly computes and passes isGrandFinal to MatchCard.
 *
 * Before this change, MatchList never computed or passed isGrandFinal at all —
 * MatchCard's trophy badge / amber border logic was fully built and tested
 * (src/__tests__/grand-final-card.test.jsx) but unreachable from the search
 * results view, since MatchList (the only caller in that view) never passed the
 * prop. This was a dead-code path, not a missing feature.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MatchList from '../components/MatchList'

vi.mock('../utils', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    trackEvent: vi.fn(),
  }
})

// seriesType 0 (BO1) so a single game already satisfies isSeriesComplete — otherwise
// groupIntoSeries' "drop the oldest incomplete series" trim (for pagination boundaries)
// would silently remove these fixtures for an unrelated reason.
const grandFinalMatch = {
  id: 'g1',
  seriesId: 1,
  seriesType: 0,
  tournament: 'DreamLeague Season 25',
  date: 'Mar 17, 2026',
  startTime: 1_742_000_000,
  bracketRound: 'Grand Final',
  radiantTeam: 'Team Spirit',
  direTeam: 'Tundra Esports',
  radiantWin: true,
  duration: '0:45',
}

const semifinalMatch = {
  id: 'g2',
  seriesId: 2,
  seriesType: 0,
  tournament: 'DreamLeague Season 25',
  date: 'Mar 16, 2026',
  startTime: 1_741_900_000,
  bracketRound: 'Semifinal',
  radiantTeam: 'Liquid',
  direTeam: 'Yandex',
  radiantWin: false,
  duration: '0:42',
}

describe('MatchList — Grand Final prop wiring', () => {
  it('shows the Grand Final badge on a series whose game has bracketRound "Grand Final"', () => {
    render(<MatchList matches={[grandFinalMatch]} onSelect={vi.fn()} />)
    expect(screen.getByText('Grand Final')).toBeInTheDocument()
  })

  it('does not show the Grand Final badge for a non-final series', () => {
    render(<MatchList matches={[semifinalMatch]} onSelect={vi.fn()} />)
    expect(screen.queryByText('Grand Final')).not.toBeInTheDocument()
  })

  it('only badges the grand-final series when both are shown together', () => {
    render(<MatchList matches={[grandFinalMatch, semifinalMatch]} onSelect={vi.fn()} />)
    expect(screen.getAllByText('Grand Final')).toHaveLength(1)
  })
})
