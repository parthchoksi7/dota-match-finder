/**
 * Coverage for the R4 tower map (DotaMinimap) rendering inside SeriesLivePulse.jsx
 * (owner-only during verification — see DESIGN_GUIDELINES.md "Tower map"). The map renders
 * only when ALL of these hold: isOwner, spoiler-free is off, and the resolved pulse carries
 * `objectives` (server already confidence-gates that field, so its mere presence is
 * sufficient — no separate low-confidence state to test here, same reasoning as
 * `series-live-pulse-watch.test.jsx`'s sibling surfaces). DotaMinimap's own rendering details
 * (marker count, destroyed-state, the unknown-data caption) are covered in
 * `dota-minimap.test.jsx` — this file only tests the gating that decides whether it mounts.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import SeriesLivePulse from '../components/SeriesLivePulse.jsx'

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

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchLiveGamePulse: vi.fn(), fetchHeroes: vi.fn().mockResolvedValue({}) }
})
// Spread the real module rather than stubbing a single export: SeriesLivePulse also pulls
// getStreamLanguage/pickPreferredStream from utils, and a bare stub silently makes those
// undefined at render time.
vi.mock('../utils', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, trackEvent: vi.fn() }
})
import { fetchLiveGamePulse } from '../api'

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

async function renderPulse(pulse, propOverrides = {}) {
  fetchLiveGamePulse.mockResolvedValue(pulse)
  let result
  await act(async () => {
    result = render(<SeriesLivePulse {...baseProps} {...propOverrides} />)
  })
  return result
}

const OBJECTIVES = { radiant: [3, 3, 3], dire: [1, 3, 2] }

describe('SeriesLivePulse — tower map gating (owner-only)', () => {
  it('renders the map when isOwner, not spoiler-free, and objectives is present', async () => {
    await renderPulse(pulseWith({ objectives: OBJECTIVES }))
    expect(screen.getByRole('img', { name: /Team Lynx:/ })).toBeInTheDocument()
    expect(screen.getByText(/barracks, base towers & ancient status unknown/i)).toBeInTheDocument()
  })

  it('renders nothing map-related when objectives is absent (low-confidence or not-yet-decoded, indistinguishable to the client)', async () => {
    await renderPulse(pulseWith())
    expect(screen.queryByRole('img', { name: /Team Lynx:/ })).not.toBeInTheDocument()
  })

  it('renders nothing when isOwner is false, even though objectives is present (API already gates this, frontend gate is defense-in-depth)', async () => {
    await renderPulse(pulseWith({ objectives: OBJECTIVES }), { isOwner: false })
    expect(screen.queryByRole('img', { name: /Team Lynx:/ })).not.toBeInTheDocument()
  })

  it('renders nothing in spoiler-free mode, even for an owner with objectives present', async () => {
    await renderPulse(pulseWith({ objectives: OBJECTIVES }), { spoilerFree: true })
    expect(screen.queryByRole('img', { name: /Team Lynx:/ })).not.toBeInTheDocument()
  })

  it('does not render before the pulse resolves', async () => {
    fetchLiveGamePulse.mockResolvedValue(null)
    await act(async () => { render(<SeriesLivePulse {...baseProps} />) })
    expect(screen.queryByRole('img', { name: /Team Lynx:/ })).not.toBeInTheDocument()
  })
})
