/**
 * Tests for Grand Final visual treatment in MatchDrawer (the match detail page/sheet).
 *
 * Before this change, MatchDrawer had no isGrandFinal detection at all — the header
 * only ever rendered tournament name, date, duration, and the "Game X of Y" pill,
 * even when match.bracketRound was "Grand Final". Mirrors the existing MatchCard
 * treatment (src/__tests__/grand-final-card.test.jsx) so the badge is consistent
 * between the homepage feed, search results, and the match detail drawer.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import MatchDrawer from '../components/MatchDrawer'

vi.mock('../utils', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    trackEvent: vi.fn(),
  }
})

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    fetchMatchIndicators: vi.fn().mockResolvedValue({}),
    fetchMatchStats: vi.fn().mockResolvedValue(null),
    fetchHighlights: vi.fn().mockResolvedValue([]),
    matchHighlightsToSeries: vi.fn().mockReturnValue(null),
  }
})

vi.mock('../components/DraftDisplay', () => ({ default: () => null }))
vi.mock('../components/GoldGraph', () => ({ default: () => null }))
vi.mock('../components/PlayerStatsSection', () => ({ default: () => null }))
vi.mock('../components/StreamPicker', () => ({ default: () => null, streamLabel: () => '' }))

const baseMatch = {
  id: '8904012666',
  tournament: 'Esports World Cup',
  date: 'Jul 19, 2026',
  duration: '0:45',
  radiantTeam: 'BoomBoys',
  direTeam: 'PVISION',
  radiantScore: 25,
  direScore: 29,
  radiantWin: false,
  startTime: 1_752_953_000,
}

// Flushes the mocked fetchMatchIndicators/fetchMatchStats/fetchHighlights promises fired by
// MatchDrawer's mount effects so their state updates land inside act() before assertions run.
async function renderDrawer(match) {
  let result
  await act(async () => {
    result = render(<MatchDrawer match={match} onDismiss={vi.fn()} />)
  })
  return result
}

describe('MatchDrawer — Grand Final treatment', () => {
  it('shows the Grand Final badge when match.bracketRound is "Grand Final"', async () => {
    await renderDrawer({ ...baseMatch, bracketRound: 'Grand Final' })
    expect(screen.getByText('Grand Final')).toBeInTheDocument()
    expect(screen.getByText('🏆')).toBeInTheDocument()
  })

  it('also matches "Finals" and "Final" bracketRound values', async () => {
    const { unmount } = await renderDrawer({ ...baseMatch, bracketRound: 'Finals' })
    expect(screen.getByText('Grand Final')).toBeInTheDocument()
    unmount()
    await renderDrawer({ ...baseMatch, bracketRound: 'Final' })
    expect(screen.getByText('Grand Final')).toBeInTheDocument()
  })

  it('does not show the badge for a non-final bracketRound', async () => {
    await renderDrawer({ ...baseMatch, bracketRound: 'Semifinal' })
    expect(screen.queryByText('Grand Final')).not.toBeInTheDocument()
  })

  it('does not show the badge when bracketRound is missing', async () => {
    await renderDrawer({ ...baseMatch, bracketRound: undefined })
    expect(screen.queryByText('Grand Final')).not.toBeInTheDocument()
  })

  it('does not match "Upper Bracket Final"', async () => {
    await renderDrawer({ ...baseMatch, bracketRound: 'Upper Bracket Final' })
    expect(screen.queryByText('Grand Final')).not.toBeInTheDocument()
  })
})
