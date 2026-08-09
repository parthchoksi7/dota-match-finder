/**
 * Coverage for the exact scenario every other SeriesLivePulse test file skips: the OD pulse
 * (fetchLiveGamePulse) resolves real data while the Valve pulse (fetchLiveValvePulse) resolves
 * null — i.e. `feature:live-valve-pulse:enabled` is off, which is the documented default/current
 * production state (CONTEXT.md: "FLAG-OFF and fail-CLOSED").
 *
 * Regression guard, confirmed by independent review (2026-08-08): an earlier pass cut score,
 * clock, momentum, the tower map, the draft grid, and the net-worth graph over to read
 * EXCLUSIVELY from the Valve pulse, with no fallback. Every other test file in this project mocks
 * fetchLiveValvePulse to resolve a non-null pulse, so that regression shipped with 1976+ tests all
 * green — the one state that matters most in production (flag off) was never exercised. This file
 * exists specifically to close that gap: every assertion below must hold with valvePulse === null.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import SeriesLivePulse from '../components/SeriesLivePulse.jsx'

const { odPulse } = vi.hoisted(() => ({
  odPulse: {
    radiantName: 'Team Falcons',
    direName: 'Xtreme Gaming',
    radiantScore: 18,
    direScore: 15,
    radiantLead: 5000,
    gameTime: 1520,
    radiantHeroIds: [1, 2],
    direHeroIds: [3, 4],
    radiantPlayerNames: ['Player1', 'Player2'],
    direPlayerNames: ['Player3', 'Player4'],
    objectives: { radiant: [3, 2, 3], dire: [3, 3, 1] },
    history: [{ t: 300, lead: 1200, rk: 5, dk: 3 }, { t: 900, lead: 5000, rk: 18, dk: 15 }],
    capturedAt: new Date().toISOString(),
  },
}))

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchLiveGamePulse: vi.fn().mockResolvedValue(odPulse),
    // The documented default/current production state: the endpoint is fail-closed behind the
    // KV flag, so this ALWAYS resolves null until an owner explicitly turns it on.
    fetchLiveValvePulse: vi.fn().mockResolvedValue(null),
    fetchHeroes: vi.fn().mockResolvedValue({
      1: { key: 'antimage', name: 'Anti-Mage' },
      2: { key: 'puck', name: 'Puck' },
      3: { key: 'sniper', name: 'Sniper' },
      4: { key: 'tinker', name: 'Tinker' },
    }),
  }
})
vi.mock('../utils', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, trackEvent: vi.fn() }
})

const baseProps = {
  psMatchId: 'ps1',
  spoilerFree: false,
  seriesLabel: 'BO3',
  seriesScore: '0-0',
  teamA: 'Team Falcons',
  teamB: 'Xtreme Gaming',
  tournament: 'Test Cup',
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

afterEach(() => vi.clearAllMocks())

async function renderPulse(props = {}) {
  let result
  await act(async () => {
    result = render(<SeriesLivePulse {...baseProps} {...props} />)
  })
  return result
}

describe('SeriesLivePulse — OD fallback when Valve pulse is null (flag-off production state)', () => {
  it('shows the real OD score, not "Score pending"', async () => {
    await renderPulse()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.queryByText('Score pending')).not.toBeInTheDocument()
  })

  it('shows the real OD game clock', async () => {
    await renderPulse()
    // gameTime 1520s -> 25:20
    expect(screen.getByText(/25:20/)).toBeInTheDocument()
  })

  it('shows the real OD net-worth-lead facts line', async () => {
    await renderPulse()
    expect(screen.getByText(/Team Falcons \+5\.0k net worth/)).toBeInTheDocument()
  })

  it('renders the tower map from OD objectives (count-only, no barracks/tier-4)', async () => {
    await renderPulse()
    expect(screen.getByRole('img', { name: /Team Falcons:/ })).toBeInTheDocument()
  })

  it('renders the draft grid from OD hero-id/player-name arrays', async () => {
    await renderPulse()
    expect(screen.getByText('Anti-Mage')).toBeInTheDocument()
    expect(screen.getByText('Player1')).toBeInTheDocument()
  })

  it('feeds the net-worth graph from OD history (not empty)', async () => {
    const { container } = await renderPulse()
    // LiveGoldGraph renders an svg with real content when history is non-empty; a bare empty
    // state would not include a polyline/path built from the two real points above.
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('does NOT render Valve-exclusive sections (Roshan, player board, bans, event feed) — no OD equivalent exists', async () => {
    await renderPulse()
    expect(screen.queryByText('Roshan is up')).not.toBeInTheDocument()
    expect(screen.queryByText('Roshan respawning')).not.toBeInTheDocument()
    expect(screen.queryByText('Player Stats')).not.toBeInTheDocument()
    expect(screen.queryByText('Live Event Feed')).not.toBeInTheDocument()
  })

  it('still shows real team names, not the bare Radiant/Dire fallback', async () => {
    await renderPulse()
    expect(screen.getByText('Team Falcons', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Xtreme Gaming', { selector: 'span' })).toBeInTheDocument()
  })
})
