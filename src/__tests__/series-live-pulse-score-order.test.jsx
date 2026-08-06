/**
 * Coverage for the 2026-07-30 score-row reorder in SeriesLivePulse.jsx (see DESIGN_GUIDELINES.md
 * "Live series companion — score row" placement note): the kill-score row now renders directly
 * under the momentum band, ahead of the tower map, so a fan sees it without scrolling. Also covers
 * the dedup rule for the trailing clock line — it must only render as a fallback when the momentum
 * band above it didn't already show "game time MM:SS".
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import SeriesLivePulse from '../components/SeriesLivePulse.jsx'

// Score/clock/momentum/map now all read from the Valve pulse (fetchLiveValvePulse), not the OD
// one — see SeriesLivePulse.jsx's 2026-08-06 cutover. `valvePulseWith` builds that shape;
// `pulseWith` (OD) is kept only where a test still needs SOMETHING resolved from the OD mock so
// the component clears its initial "neither pulse has arrived yet" watch-links-only state.
function pulseWith(overrides = {}) {
  return {
    matchId: '8913598312',
    radiantName: 'Team Lynx',
    direName: 'KW',
    radiantLead: 616,
    radiantScore: 2,
    direScore: 1,
    gameTime: 253, // formatClock -> "4:13"
    radiantHeroIds: [],
    direHeroIds: [],
    capturedAt: new Date().toISOString(),
    ...overrides,
  }
}

function towerStateFromCounts([top, mid, bot]) {
  const laneBools = n => [0, 1, 2].map(i => i < n)
  return { lanes: { top: laneBools(top), mid: laneBools(mid), bot: laneBools(bot) }, tier4: [true, true], laneVerified: false }
}

function valvePulseWith(overrides = {}) {
  const { objectives, ...rest } = overrides
  return {
    matchId: '8913598312',
    radiantName: 'Team Lynx',
    direName: 'KW',
    radiantLead: 616,
    radiantScore: 2,
    direScore: 1,
    gameTime: 253, // formatClock -> "4:13"
    players: { radiant: [], dire: [] },
    towers: objectives ? { radiant: towerStateFromCounts(objectives.radiant), dire: towerStateFromCounts(objectives.dire) } : { radiant: null, dire: null },
    barracks: { radiant: null, dire: null },
    draft: { radiantPicks: [], direPicks: [], radiantBans: [], direBans: [] },
    capturedAt: new Date().toISOString(),
    ...rest,
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
  isOwner: true,
  seriesLabel: 'BO3',
  seriesScore: '0-0',
  teamA: 'Team Lynx',
  teamB: 'KW',
  tournament: 'EPL Masters Play-In',
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

afterEach(() => vi.clearAllMocks())

async function renderPulse(valvePulse, propOverrides = {}) {
  fetchLiveGamePulse.mockResolvedValue(pulseWith())
  fetchLiveValvePulse.mockResolvedValue(valvePulse)
  let result
  await act(async () => {
    result = render(<SeriesLivePulse {...baseProps} {...propOverrides} />)
  })
  return result
}

const OBJECTIVES = { radiant: [3, 3, 3], dire: [1, 3, 2] }

describe('SeriesLivePulse — score row placement + clock dedup', () => {
  it('renders the score row before the tower map in DOM order', async () => {
    await renderPulse(valvePulseWith({ objectives: OBJECTIVES }))
    const scoreName = screen.getByText('Team Lynx')
    const map = screen.getByRole('img', { name: /Team Lynx:/ })
    // eslint-disable-next-line no-bitwise
    expect(scoreName.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the game-time clock only once when the momentum band renders', async () => {
    await renderPulse(valvePulseWith())
    expect(screen.getAllByText(/4:13/)).toHaveLength(1)
  })

  it('falls back to the score-row clock line when momentum is null but gameTime is present', async () => {
    // radiantLead not finite -> computeMomentum returns null, but formatClock(gameTime) still resolves
    await renderPulse(valvePulseWith({ radiantLead: null }))
    expect(screen.queryByText(/Even|Ahead/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/4:13/)).toHaveLength(1)
  })
})
