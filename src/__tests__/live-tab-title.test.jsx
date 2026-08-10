/**
 * Browser tab title mirroring, inside SeriesLivePulse.jsx (see DESIGN_GUIDELINES.md
 * "Glanceable live score"). The formatting itself is covered in `live-score.test.js`; this
 * file covers the three lifecycle properties that only exist at the component level:
 *
 *  1. the title tracks the running game while the companion is open,
 *  2. it is restored EXACTLY on unmount, so a stale score never outlives the live game,
 *  3. spoiler-free suppresses it unconditionally (unlike the score push, the tab title is a
 *     passive surface the fan never opted into).
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import SeriesLivePulse from '../components/SeriesLivePulse.jsx'

// The tab title now mirrors the Valve pulse (fetchLiveValvePulse), not the OD one — see
// SeriesLivePulse.jsx's 2026-08-06 cutover (useLiveScoreTabTitle is now called with valvePulse).
function pulseWith(overrides = {}) {
  return {
    matchId: '8913598312',
    radiantName: 'Tundra Esports',
    direName: 'BetBoom Team',
    radiantLead: 2400,
    radiantScore: 24,
    direScore: 19,
    gameTime: 1930,
    players: { radiant: [], dire: [] },
    towers: { radiant: null, dire: null },
    barracks: { radiant: null, dire: null },
    draft: { radiantPicks: [], direPicks: [], radiantBans: [], direBans: [] },
    capturedAt: new Date().toISOString(),
    ...overrides,
  }
}

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  const fetchLiveGamePulse = vi.fn()
  const fetchLiveValvePulse = vi.fn()
  // SeriesLivePulse polls both sources through ONE transport now (fetchLivePulse, 2026-08-09).
  // Composing that mock from the two per-source mocks keeps every test below expressing the OD and
  // Valve sources independently — which is the property these suites exist to check — instead of
  // rewriting each case around a merged payload shape.
  const fetchLivePulse = vi.fn(async (id, owner) => ({
    od: await fetchLiveGamePulse(id, owner),
    valve: await fetchLiveValvePulse(id),
  }))
  return { ...actual, fetchLiveGamePulse, fetchLiveValvePulse, fetchLivePulse, fetchHeroes: vi.fn().mockResolvedValue({}) }
})
vi.mock('../utils', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, trackEvent: vi.fn() }
})
import { fetchLiveGamePulse, fetchLiveValvePulse } from '../api'
import { trackEvent } from '../utils'

const ORIGINAL_TITLE = 'Spectate Esports — Watch Pro Dota 2 Match VODs Instantly'

const baseProps = {
  psMatchId: 'ps1',
  spoilerFree: false,
  isOwner: false,
  seriesLabel: 'BO3',
  seriesScore: '1-0',
  teamA: 'Tundra Esports',
  teamB: 'BetBoom Team',
  tournament: 'Esports World Cup 2026',
}

beforeEach(() => {
  document.title = ORIGINAL_TITLE
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

afterEach(() => vi.clearAllMocks())

async function renderWithPulse(valvePulse, props = {}) {
  fetchLiveGamePulse.mockResolvedValue(valvePulse ? pulseWith() : null)
  fetchLiveValvePulse.mockResolvedValue(valvePulse)
  let result
  await act(async () => { result = render(<SeriesLivePulse {...baseProps} {...props} />) })
  return result
}

describe('live score in the browser tab title', () => {
  it('shows the running game score, gold lead fused onto the leading side\'s digit', async () => {
    await renderWithPulse(pulseWith())
    expect(document.title).toBe('24(+2.4k)-19 Tundra v BetBoom')
  })

  it('restores the original title exactly when the companion closes', async () => {
    const { unmount } = await renderWithPulse(pulseWith())
    expect(document.title).not.toBe(ORIGINAL_TITLE)
    act(() => unmount())
    expect(document.title).toBe(ORIGINAL_TITLE)
  })

  it('leaves the title alone in spoiler-free mode', async () => {
    await renderWithPulse(pulseWith(), { spoilerFree: true })
    expect(document.title).toBe(ORIGINAL_TITLE)
  })

  it('leaves the title alone while no pulse has resolved', async () => {
    await renderWithPulse(null)
    expect(document.title).toBe(ORIGINAL_TITLE)
  })

  it('leaves the title alone rather than showing a fabricated score', async () => {
    await renderWithPulse(pulseWith({ radiantScore: null, direScore: null }))
    expect(document.title).toBe(ORIGINAL_TITLE)
  })

  it('fires its activation event once, not once per poll', async () => {
    const { rerender } = await renderWithPulse(pulseWith())
    await act(async () => { rerender(<SeriesLivePulse {...baseProps} />) })
    expect(trackEvent.mock.calls.filter(([name]) => name === 'live_tab_title_active')).toHaveLength(1)
  })
})
