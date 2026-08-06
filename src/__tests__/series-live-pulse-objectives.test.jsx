/**
 * Coverage for the R4 tower map (DotaMinimap) rendering inside SeriesLivePulse.jsx. Public since
 * 2026-07-31 (see DESIGN_GUIDELINES.md "Tower map") — the map renders whenever spoiler-free is
 * off and the resolved pulse carries `objectives` (server already confidence-gates that field,
 * so its mere presence is sufficient — no separate low-confidence state to test here, same
 * reasoning as `series-live-pulse-watch.test.jsx`'s sibling surfaces). DotaMinimap's own
 * rendering details (marker count, destroyed-state, the unknown-data caption) are covered in
 * `dota-minimap.test.jsx` — this file only tests the gating that decides whether it mounts.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import SeriesLivePulse from '../components/SeriesLivePulse.jsx'

// The tower map now reads from the Valve pulse's `towers` field (fetchLiveValvePulse), not the OD
// pulse's `objectives` — see SeriesLivePulse.jsx's 2026-08-06 cutover.
function pulseWith(overrides = {}) {
  return {
    matchId: '8913598312',
    radiantName: 'Team Lynx',
    direName: 'KW',
    radiantLead: 616,
    radiantScore: 2,
    direScore: 1,
    gameTime: 253,
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
    gameTime: 253,
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
// Spread the real module rather than stubbing a single export: SeriesLivePulse also pulls
// getStreamLanguage/pickPreferredStream from utils, and a bare stub silently makes those
// undefined at render time.
vi.mock('../utils', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, trackEvent: vi.fn() }
})
import { fetchLiveGamePulse, fetchLiveValvePulse } from '../api'

const baseProps = {
  psMatchId: 'ps1',
  spoilerFree: false,
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

describe('SeriesLivePulse — tower map gating (public)', () => {
  it('renders the map for any viewer when not spoiler-free and objectives is present', async () => {
    await renderPulse(valvePulseWith({ objectives: OBJECTIVES }))
    expect(screen.getByRole('img', { name: /Team Lynx:/ })).toBeInTheDocument()
    expect(screen.getByText(/barracks, base towers & ancient status unknown/i)).toBeInTheDocument()
  })

  it('renders nothing map-related when objectives is absent (low-confidence or not-yet-decoded, indistinguishable to the client)', async () => {
    await renderPulse(valvePulseWith())
    expect(screen.queryByRole('img', { name: /Team Lynx:/ })).not.toBeInTheDocument()
  })

  it('renders nothing in spoiler-free mode, even with objectives present', async () => {
    await renderPulse(valvePulseWith({ objectives: OBJECTIVES }), { spoilerFree: true })
    expect(screen.queryByRole('img', { name: /Team Lynx:/ })).not.toBeInTheDocument()
  })

  it('does not render before either pulse resolves', async () => {
    fetchLiveGamePulse.mockResolvedValue(null)
    fetchLiveValvePulse.mockResolvedValue(null)
    await act(async () => { render(<SeriesLivePulse {...baseProps} />) })
    expect(screen.queryByRole('img', { name: /Team Lynx:/ })).not.toBeInTheDocument()
  })
})
