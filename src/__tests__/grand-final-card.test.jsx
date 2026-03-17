/**
 * Tests for Grand Final visual treatment in MatchCard.
 *
 * Covers:
 * - isGrandFinal=true renders trophy badge and "Grand Final" label
 * - isGrandFinal=false (default) renders no badge
 * - Grand Final detection string used by LatestMatches/MyTeamsSection
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
    const card = container.firstChild
    expect(card.className).toMatch(/amber/)
  })

  it('does not apply amber border class when isGrandFinal=false', () => {
    const normalSeries = { ...baseSeries, id: '4', tournament: 'DreamLeague Season 25' }
    const { container } = render(
      <MatchCard series={normalSeries} onSelectGame={vi.fn()} isGrandFinal={false} />
    )
    const card = container.firstChild
    expect(card.className).not.toMatch(/amber/)
  })
})

// ── Grand Final detection heuristic ─────────────────────────────────────────

describe('Grand Final detection string heuristic', () => {
  function detectGrandFinal(tournamentName) {
    return tournamentName?.toLowerCase().includes('grand final') ?? false
  }

  it('detects "Grand Final" in PandaScore stage tournament names', () => {
    expect(detectGrandFinal('DreamLeague Season 25 — Grand Final')).toBe(true)
    expect(detectGrandFinal('PGL Wallachia S7 — Grand Final')).toBe(true)
    expect(detectGrandFinal('The International 2025 — Grand Final')).toBe(true)
  })

  it('is case insensitive', () => {
    expect(detectGrandFinal('ESL One — grand final')).toBe(true)
    expect(detectGrandFinal('ESL One — GRAND FINAL')).toBe(true)
  })

  it('returns false for regular stage names', () => {
    expect(detectGrandFinal('DreamLeague Season 25')).toBe(false)
    expect(detectGrandFinal('PGL Wallachia S7 — Lower Bracket Round 3')).toBe(false)
    expect(detectGrandFinal('DreamLeague Season 25 — Playoffs')).toBe(false)
  })

  it('returns false for null or undefined', () => {
    expect(detectGrandFinal(null)).toBe(false)
    expect(detectGrandFinal(undefined)).toBe(false)
  })
})
