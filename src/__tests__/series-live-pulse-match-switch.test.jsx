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
  return { ...actual, fetchLiveGamePulse: vi.fn(), fetchHeroes: vi.fn().mockResolvedValue({}) }
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
})
