/**
 * Coverage for the broadcast-delay indicator (2026-08-09). Valve's `stream_delay_s` is a real
 * spoiler risk specific to this data source: the live pulse reflects the game right now, while
 * the tournament's public Twitch/Kick stream a fan might be watching alongside it lags behind by
 * however many seconds/minutes the tournament configured (10s-15min observed). Surfaced as a
 * small label + InfoButton near the top of the sheet whenever the Valve pulse carries it.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import SeriesLivePulse from '../components/SeriesLivePulse.jsx'

function valvePulseWith(overrides = {}) {
  return {
    matchId: '8937335830',
    radiantName: 'Level UP',
    direName: 'MOUZ',
    radiantLead: 0,
    radiantScore: 0,
    direScore: 0,
    gameTime: 300,
    players: { radiant: [], dire: [] },
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

describe('SeriesLivePulse — broadcast delay indicator', () => {
  it('shows the delay in minutes for a real tournament delay (900s -> ~15m)', async () => {
    await renderPulse(valvePulseWith({ streamDelayS: 900 }))
    expect(screen.getByText('Broadcast delay ~15m')).toBeInTheDocument()
  })

  it('shows the delay in seconds when under a minute', async () => {
    await renderPulse(valvePulseWith({ streamDelayS: 10 }))
    expect(screen.getByText('Broadcast delay ~10s')).toBeInTheDocument()
  })

  it('renders no indicator when the delay is zero (no delay configured)', async () => {
    await renderPulse(valvePulseWith({ streamDelayS: 0 }))
    expect(screen.queryByText(/Broadcast delay/)).not.toBeInTheDocument()
  })

  it('renders no indicator when streamDelayS is absent (missing field, or OD fallback path)', async () => {
    await renderPulse(valvePulseWith())
    expect(screen.queryByText(/Broadcast delay/)).not.toBeInTheDocument()
  })

  it('explains the spoiler risk via the info popover', async () => {
    await renderPulse(valvePulseWith({ streamDelayS: 900 }))
    fireEvent.click(screen.getByRole('button', { name: /what does broadcast delay mean/i }))
    expect(screen.getByText(/can spoil what you're about to see/i)).toBeInTheDocument()
  })
})
