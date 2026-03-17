/**
 * Tests for Grand Final visual treatment in MatchCard.
 *
 * Covers:
 * - isGrandFinal=true renders trophy badge and "Grand Final" label
 * - isGrandFinal=false (default) renders no badge
 * - Combined detection used by LatestMatches/MyTeamsSection:
 *     string-based (tournament name includes "grand final")
 *     OR match-ID-based (grandFinalMatchIds Set contains a game id)
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
  tournament: 'DreamLeague Season 25 — Grand Final',
  date: 'Mar 17, 2026',
  startTime: 1_742_000_000,
  seriesType: 2,
  games: [
    {
      id: 'g1',
      radiantTeam: 'Team Spirit',
      direTeam: 'Tundra Esports',
      radiantWin: true,
      duration: '0:45',
      startTime: 1_742_000_000,
    },
    {
      id: 'g2',
      radiantTeam: 'Team Spirit',
      direTeam: 'Tundra Esports',
      radiantWin: true,
      duration: '0:38',
      startTime: 1_742_003_000,
    },
  ],
}

// OpenDota-sourced series — league name only, no stage info
const openDotaSeries = {
  ...baseSeries,
  id: '99',
  tournament: 'PGL Wallachia Season 7', // no "Grand Final" in name
  games: [
    { id: '7890001', radiantTeam: 'Liquid', direTeam: 'Yandex', radiantWin: false, duration: '0:42', startTime: 1_742_100_000 },
    { id: '7890002', radiantTeam: 'Liquid', direTeam: 'Yandex', radiantWin: true,  duration: '0:51', startTime: 1_742_103_000 },
    { id: '7890003', radiantTeam: 'Liquid', direTeam: 'Yandex', radiantWin: false, duration: '0:38', startTime: 1_742_106_000 },
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
    const normalSeries = { ...baseSeries, id: '2', tournament: 'DreamLeague Season 25' }
    render(<MatchCard series={normalSeries} onSelectGame={vi.fn()} isGrandFinal={false} />)
    expect(screen.queryByText('Grand Final')).not.toBeInTheDocument()
  })

  it('does not show the Grand Final badge by default (no prop)', () => {
    const normalSeries = { ...baseSeries, id: '3', tournament: 'DreamLeague Season 25' }
    render(<MatchCard series={normalSeries} onSelectGame={vi.fn()} />)
    expect(screen.queryByText('Grand Final')).not.toBeInTheDocument()
  })

  it('applies amber border class when isGrandFinal=true', () => {
    const { container } = render(
      <MatchCard series={baseSeries} onSelectGame={vi.fn()} isGrandFinal={true} />
    )
    expect(container.firstChild.className).toMatch(/amber/)
  })

  it('does not apply amber border class when isGrandFinal=false', () => {
    const normalSeries = { ...baseSeries, id: '4', tournament: 'DreamLeague Season 25' }
    const { container } = render(
      <MatchCard series={normalSeries} onSelectGame={vi.fn()} isGrandFinal={false} />
    )
    expect(container.firstChild.className).not.toMatch(/amber/)
  })
})

// ── Combined detection heuristic ─────────────────────────────────────────────

describe('Grand Final detection — combined heuristic', () => {
  function detect(series, grandFinalMatchIds = new Set()) {
    return (
      series.tournament?.toLowerCase().includes('grand final') ||
      series.games.some(g => grandFinalMatchIds.has(g.id))
    )
  }

  it('detects via tournament name for PandaScore-sourced data', () => {
    expect(detect(baseSeries)).toBe(true)
    expect(detect({ ...baseSeries, tournament: 'PGL Wallachia S7 — Grand Final' })).toBe(true)
  })

  it('detects via match ID set for OpenDota-sourced data (Yandex vs Liquid scenario)', () => {
    const gfIds = new Set(['7890001', '7890002', '7890003'])
    expect(detect(openDotaSeries, gfIds)).toBe(true)
  })

  it('detects when only one game ID is in the set', () => {
    const gfIds = new Set(['7890001']) // just the first game
    expect(detect(openDotaSeries, gfIds)).toBe(true)
  })

  it('returns false when tournament name has no stage info and set is empty', () => {
    expect(detect(openDotaSeries, new Set())).toBe(false)
  })

  it('returns false when match IDs are different (non-GF series)', () => {
    const gfIds = new Set(['9999999']) // different IDs
    expect(detect(openDotaSeries, gfIds)).toBe(false)
  })

  it('is case insensitive for tournament name', () => {
    expect(detect({ ...baseSeries, tournament: 'ESL One — GRAND FINAL' })).toBe(true)
    expect(detect({ ...baseSeries, tournament: 'ESL One — grand final' })).toBe(true)
  })

  it('handles null/undefined tournament gracefully', () => {
    const s = { ...openDotaSeries, tournament: null }
    expect(detect(s, new Set())).toBe(false)
    expect(detect(s, new Set(['7890001']))).toBe(true)
  })
})
