/**
 * Regression coverage for a real bug observed live (2026-08-09, EPL Masters S1, Level UP vs
 * MOUZ): Valve's `GetLiveLeagueGames` can mark a game as "live" before its clock actually starts
 * (draft just locked in, world still loading) — `gameTime: 0`, every player's `heroId: 0`,
 * `gold: 600` (starting gold), everything else genuinely 0. That's honest data, not a shaping
 * bug, but SeriesLivePulse rendered it as a full player-stat grid with blank hero portraits and
 * 0/0/0 stats, which read as broken rather than "match starting." Fixed by gating the Player
 * Stats section on `valvePulse.gameTime > 0` and showing a loading message instead.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import SeriesLivePulse from '../components/SeriesLivePulse.jsx'

function pregamePlayer(over = {}) {
  return {
    playerSlot: 0, accountId: '1', name: 'bb3px', heroId: 0, level: 0,
    kills: 0, deaths: 0, assists: 0, lastHits: 0, denies: 0, gold: 600, netWorth: 0,
    gpm: 0, xpm: 0, items: [0, 0, 0, 0, 0, 0], respawnTimer: 0, isDead: false,
    ultimate: { unlocked: false, ready: false, cooldown: null },
    ...over,
  }
}

function valvePulseWith(overrides = {}) {
  return {
    matchId: '8937335830',
    radiantName: 'Level UP',
    direName: 'MOUZ',
    radiantLead: 0,
    radiantScore: 0,
    direScore: 0,
    gameTime: 0,
    players: { radiant: [pregamePlayer()], dire: [pregamePlayer({ name: 'Crystallis' })] },
    towers: { radiant: null, dire: null },
    barracks: { radiant: null, dire: null },
    draft: { radiantPicks: [], direPicks: [], radiantBans: [], direBans: [] },
    itemNames: {},
    capturedAt: new Date().toISOString(),
    ...overrides,
  }
}

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchLiveGamePulse: vi.fn(), fetchLiveValvePulse: vi.fn(), fetchHeroes: vi.fn().mockResolvedValue({}) }
})
vi.mock('../utils', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, trackEvent: vi.fn() }
})
import { fetchLiveGamePulse, fetchLiveValvePulse } from '../api'

const baseProps = {
  psMatchId: 'ps1',
  spoilerFree: false,
  seriesLabel: 'BO3',
  seriesScore: '1-0',
  teamA: 'Level UP',
  teamB: 'MOUZ',
  tournament: 'EPL Masters S1',
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

afterEach(() => vi.clearAllMocks())

async function renderPulse(valvePulse) {
  fetchLiveGamePulse.mockResolvedValue(null)
  fetchLiveValvePulse.mockResolvedValue(valvePulse)
  let result
  await act(async () => {
    result = render(<SeriesLivePulse {...baseProps} />)
  })
  return result
}

describe('SeriesLivePulse — Valve pre-game loading state', () => {
  it('shows a loading message instead of a zeroed player-stat grid when gameTime is 0', async () => {
    await renderPulse(valvePulseWith())
    expect(screen.getByText(/Match starting/i)).toBeInTheDocument()
    expect(screen.queryByText('0/0/0')).not.toBeInTheDocument()
  })

  it('renders the real player board once the clock has actually started', async () => {
    await renderPulse(valvePulseWith({
      gameTime: 45,
      players: {
        radiant: [pregamePlayer({ heroId: 41, kills: 1, gold: 650 })],
        dire: [pregamePlayer({ name: 'Crystallis', heroId: 8 })],
      },
    }))
    expect(screen.queryByText(/Match starting/i)).not.toBeInTheDocument()
    // "1/0/0" (kills/deaths/assists) only appears in the real per-player stat row, not the draft
    // list — distinguishes "the board actually rendered" from just the player's name showing up
    // elsewhere (e.g. the Draft section, which also lists player names).
    expect(screen.getByText('1/0/0')).toBeInTheDocument()
  })

  it('treats a missing/undefined gameTime the same as 0 — still loading, not broken', async () => {
    const pulse = valvePulseWith()
    delete pulse.gameTime
    await renderPulse(pulse)
    expect(screen.getByText(/Match starting/i)).toBeInTheDocument()
  })
})
