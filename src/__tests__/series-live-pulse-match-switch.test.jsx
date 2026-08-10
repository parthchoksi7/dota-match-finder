/**
 * Regression coverage for the 2026-08-04 wrong-series-data bug: App.jsx keeps the live-series
 * sheet host (and therefore this component) mounted across a switch from one live series to a
 * different one, to avoid a close/reopen flash. Before this fix, `pulse` state wasn't reset when
 * `psMatchId` changed, so the previous series' radiant/dire names and score kept rendering under
 * the new series' chrome until (if ever) a fresh poll for the new id resolved.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import SeriesLivePulse from '../components/SeriesLivePulse.jsx'

function pulseWith(overrides = {}) {
  return {
    matchId: '8913598312',
    radiantName: 'Yakult Brothers',
    direName: 'Rune Eaters',
    radiantLead: 0,
    radiantScore: 0,
    direScore: 0,
    gameTime: 0,
    radiantHeroIds: [],
    direHeroIds: [],
    capturedAt: new Date().toISOString(),
    ...overrides,
  }
}

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal()
  const fetchLiveGamePulse = vi.fn()
  // SeriesLivePulse polls both sources through one transport (2026-08-09). Composed from the OD
  // mock this suite already drives; Valve stays absent, which is what it asserted before.
  const fetchLivePulse = vi.fn(async (id, owner) => ({ od: await fetchLiveGamePulse(id, owner), valve: null }))
  return { ...actual, fetchLiveGamePulse, fetchLivePulse, fetchHeroes: vi.fn().mockResolvedValue({}) }
})
vi.mock('../utils', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, trackEvent: vi.fn() }
})
import { fetchLiveGamePulse } from '../api'

const baseProps = {
  spoilerFree: false,
  isOwner: true,
  seriesLabel: 'BO3',
  seriesScore: '0-0',
  tournament: '1Win Essence S2',
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

afterEach(() => vi.clearAllMocks())

describe('SeriesLivePulse — pulse reset on psMatchId change', () => {
  it('does not keep rendering the previous series pulse when switching to a different live series', async () => {
    fetchLiveGamePulse.mockResolvedValueOnce(
      pulseWith({ radiantName: 'Yakult Brothers', direName: 'Rune Eaters' })
    )
    let rerender
    await act(async () => {
      const result = render(
        <SeriesLivePulse {...baseProps} psMatchId="ps-yakult-rune" teamA="Yakult Brothers" teamB="Rune Eaters" />
      )
      rerender = result.rerender
    })
    expect(screen.getByText('Yakult Brothers')).toBeInTheDocument()
    expect(screen.getByText('Rune Eaters')).toBeInTheDocument()

    // Switch to a different live series (e.g. via push-notification landing or clicking another
    // live row) — same component instance, new psMatchId. The next poll for the new id hasn't
    // resolved yet, mirroring the real-world race.
    fetchLiveGamePulse.mockReturnValue(new Promise(() => {})) // never resolves within this test
    await act(async () => {
      rerender(
        <SeriesLivePulse {...baseProps} psMatchId="ps-liquid-falcons" teamA="Team Liquid" teamB="Team Falcons" />
      )
    })

    expect(screen.queryByText('Yakult Brothers')).not.toBeInTheDocument()
    expect(screen.queryByText('Rune Eaters')).not.toBeInTheDocument()
  })

  it('renders the new series own pulse once its poll resolves after a switch', async () => {
    fetchLiveGamePulse.mockResolvedValueOnce(
      pulseWith({ radiantName: 'Yakult Brothers', direName: 'Rune Eaters' })
    )
    let rerender
    await act(async () => {
      const result = render(
        <SeriesLivePulse {...baseProps} psMatchId="ps-yakult-rune" teamA="Yakult Brothers" teamB="Rune Eaters" />
      )
      rerender = result.rerender
    })
    expect(screen.getByText('Yakult Brothers')).toBeInTheDocument()

    fetchLiveGamePulse.mockResolvedValueOnce(
      pulseWith({ radiantName: 'Team Liquid', direName: 'Team Falcons' })
    )
    await act(async () => {
      rerender(
        <SeriesLivePulse {...baseProps} psMatchId="ps-liquid-falcons" teamA="Team Liquid" teamB="Team Falcons" />
      )
    })

    expect(screen.getByText('Team Liquid')).toBeInTheDocument()
    expect(screen.getByText('Team Falcons')).toBeInTheDocument()
    expect(screen.queryByText('Yakult Brothers')).not.toBeInTheDocument()
    expect(screen.queryByText('Rune Eaters')).not.toBeInTheDocument()
  })

  // Regression coverage for a bug introduced (and caught pre-deploy) during the 2026-08-09 poll
  // merge: the OD and Valve pollers were collapsed into one shared `useCallback`, and the
  // effect-local `let cancelled` each poller used to close over became a single boolean ref.
  // That broke isolation — cleanup set it true, the new effect immediately set it back to false,
  // and a STILL-IN-FLIGHT poll for the OLD series would then resolve, see false, and write the old
  // series' data into the new series' sheet. Neither test above catches it, because both leave the
  // old poll either already resolved or never resolving. Now guarded by a monotonic token.
  it('drops a stale in-flight poll that resolves AFTER a switch to another series', async () => {
    let resolveOld
    fetchLiveGamePulse.mockReturnValueOnce(new Promise(r => { resolveOld = r }))

    let rerender
    await act(async () => {
      const result = render(
        <SeriesLivePulse {...baseProps} psMatchId="ps-yakult-rune" teamA="Yakult Brothers" teamB="Rune Eaters" />
      )
      rerender = result.rerender
    })

    // Switch before the first series' poll has come back; the new series' poll never resolves, so
    // anything rendered afterwards can only have come from the stale response.
    fetchLiveGamePulse.mockReturnValue(new Promise(() => {}))
    await act(async () => {
      rerender(
        <SeriesLivePulse {...baseProps} psMatchId="ps-liquid-falcons" teamA="Team Liquid" teamB="Team Falcons" />
      )
    })

    // The old series' request lands late — it must be discarded, not applied.
    await act(async () => {
      resolveOld(pulseWith({ radiantName: 'Yakult Brothers', direName: 'Rune Eaters', radiantScore: 31, direScore: 4 }))
    })

    expect(screen.queryByText('Yakult Brothers')).not.toBeInTheDocument()
    expect(screen.queryByText('Rune Eaters')).not.toBeInTheDocument()
    expect(screen.queryByText('31')).not.toBeInTheDocument()
  })
})
