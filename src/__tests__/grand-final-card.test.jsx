/**
 * Tests for Grand Final visual treatment in MatchCard.
 *
 * Covers:
 * - isGrandFinal=true renders trophy badge and "Grand Final" label
 * - isGrandFinal=false (default) renders no badge
 * - Detection used by HomeFeed/LatestMatches/MyTeamsSection:
 *     bracketRound-based (parsed from PandaScore match name via parseBracketRound)
 *     embedded directly on each game object from the recent-completed endpoint
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MatchCard from '../components/MatchCard'

vi.mock('../utils', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    trackEvent: vi.fn(),
  }
})

const baseSeries = {
  id: '1',
  tournament: 'DreamLeague Season 25',
  date: 'Mar 17, 2026',
  startTime: 1_742_000_000,
  seriesType: 2,
  games: [
    {
      id: 'g1',
      bracketRound: 'Grand Final',
      radiantTeam: 'Team Spirit',
      direTeam: 'Tundra Esports',
      radiantWin: true,
      duration: '0:45',
      startTime: 1_742_000_000,
    },
    {
      id: 'g2',
      bracketRound: 'Grand Final',
      radiantTeam: 'Team Spirit',
      direTeam: 'Tundra Esports',
      radiantWin: true,
      duration: '0:38',
      startTime: 1_742_003_000,
    },
  ],
}

// Series with a non-GF bracket round
const semiFinalSeries = {
  ...baseSeries,
  id: '99',
  games: [
    { id: '7890001', bracketRound: 'Semifinal', radiantTeam: 'Liquid', direTeam: 'Yandex', radiantWin: false, duration: '0:42', startTime: 1_742_100_000 },
    { id: '7890002', bracketRound: 'Semifinal', radiantTeam: 'Liquid', direTeam: 'Yandex', radiantWin: true,  duration: '0:51', startTime: 1_742_103_000 },
  ],
}

// ── MatchCard visual treatment ────────────────────────────────────────────────

describe('MatchCard — Grand Final treatment', () => {
  it('shows the Grand Final badge when isGrandFinal=true', () => {
    render(<MatchCard series={baseSeries} onSelectGame={vi.fn()} isGrandFinal={true} />)
    expect(screen.getByText('Grand Final')).toBeInTheDocument()
  })

  it('shows the trophy emoji when isGrandFinal=true', () => {
    render(<MatchCard series={baseSeries} onSelectGame={vi.fn()} isGrandFinal={true} />)
    expect(screen.getByText('🏆')).toBeInTheDocument()
  })

  it('does not show the Grand Final badge when isGrandFinal=false', () => {
    render(<MatchCard series={semiFinalSeries} onSelectGame={vi.fn()} isGrandFinal={false} />)
    expect(screen.queryByText('Grand Final')).not.toBeInTheDocument()
  })

  it('does not show the Grand Final badge by default (no prop)', () => {
    render(<MatchCard series={semiFinalSeries} onSelectGame={vi.fn()} />)
    expect(screen.queryByText('Grand Final')).not.toBeInTheDocument()
  })

  it('applies amber border class when isGrandFinal=true', () => {
    const { container } = render(
      <MatchCard series={baseSeries} onSelectGame={vi.fn()} isGrandFinal={true} />
    )
    expect(container.firstChild.className).toMatch(/amber/)
  })

  it('does not apply amber border class when isGrandFinal=false', () => {
    const { container } = render(
      <MatchCard series={semiFinalSeries} onSelectGame={vi.fn()} isGrandFinal={false} />
    )
    expect(container.firstChild.className).not.toMatch(/amber/)
  })
})

// ── Detection heuristic ───────────────────────────────────────────────────────
// Detection is bracketRound-based: parseBracketRound(m.name) is embedded on each
// game by the recent-completed endpoint. The parent checks s.games.some(g =>
// /^(grand )?finals?$/i.test(g.bracketRound || '')).

describe('Grand Final detection — bracketRound heuristic', () => {
  function detect(series) {
    return series.games.some(g => /^(grand )?finals?$/i.test(g.bracketRound || ''))
  }

  it('detects Grand Final when bracketRound is "Grand Final"', () => {
    expect(detect(baseSeries)).toBe(true)
  })

  it('detects when only one game has the bracketRound set', () => {
    const s = { ...baseSeries, games: [{ ...baseSeries.games[0] }, { ...baseSeries.games[1], bracketRound: null }] }
    expect(detect(s)).toBe(true)
  })

  it('returns false for Semifinal bracketRound', () => {
    expect(detect(semiFinalSeries)).toBe(false)
  })

  it('returns false when bracketRound is null', () => {
    const s = { games: [{ id: '1', bracketRound: null }, { id: '2', bracketRound: null }] }
    expect(detect(s)).toBe(false)
  })

  it('returns false when bracketRound is missing', () => {
    const s = { games: [{ id: '1' }, { id: '2' }] }
    expect(detect(s)).toBe(false)
  })

  it('also matches "Finals" and "Final" bracketRound values', () => {
    const finals = { games: [{ bracketRound: 'Finals' }] }
    const final = { games: [{ bracketRound: 'Final' }] }
    expect(detect(finals)).toBe(true)
    expect(detect(final)).toBe(true)
  })

  it('does not match Upper Bracket Final', () => {
    const s = { games: [{ bracketRound: 'Upper Bracket Final' }] }
    expect(detect(s)).toBe(false)
  })
})
