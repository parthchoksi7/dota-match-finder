/**
 * Coverage for the data-sync caveat (corrected 2026-08-09). Originally showed Valve's own
 * `stream_delay_s` as a specific "Broadcast delay ~15m ahead of the stream" figure — corrected
 * after real usage showed the opposite direction can also happen (this sheet's own poll cadence
 * and Valve's own snapshot lag add latency that isn't accounted for by stream_delay_s alone), so
 * a specific number/direction was false precision the data can't back up. Now a plain, direction-
 * agnostic caveat shown whenever the Valve pulse is active, independent of the delay's value.
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

describe('SeriesLivePulse — data-sync caveat', () => {
  it('shows a direction-agnostic caveat whenever Valve data is active', async () => {
    await renderPulse(valvePulseWith({ streamDelayS: 900 }))
    expect(screen.getByText('Data may be ahead or behind the stream')).toBeInTheDocument()
  })

  it('never claims a specific number or a one-way "ahead of the stream" direction', async () => {
    await renderPulse(valvePulseWith({ streamDelayS: 900 }))
    expect(screen.queryByText(/Broadcast delay/)).not.toBeInTheDocument()
    expect(screen.queryByText(/~\d+[ms]/)).not.toBeInTheDocument()
  })

  it('still shows the caveat even when streamDelayS is absent or zero — the risk is not tied to that field', async () => {
    await renderPulse(valvePulseWith({ streamDelayS: 0 }))
    expect(screen.getByText('Data may be ahead or behind the stream')).toBeInTheDocument()
    await renderPulse(valvePulseWith())
    expect(screen.getAllByText('Data may be ahead or behind the stream').length).toBeGreaterThan(0)
  })

  it('renders no caveat on the OD-only fallback path (no Valve pulse)', async () => {
    fetchLiveGamePulse.mockResolvedValue({
      radiantName: 'Level UP', direName: 'MOUZ', radiantScore: 1, direScore: 0, gameTime: 300,
      capturedAt: new Date().toISOString(),
    })
    fetchLiveValvePulse.mockResolvedValue(null)
    await act(async () => { render(<SeriesLivePulse {...baseProps} />) })
    expect(screen.queryByText('Data may be ahead or behind the stream')).not.toBeInTheDocument()
  })

  it('explains the caveat via the info popover without claiming a direction or number', async () => {
    await renderPulse(valvePulseWith({ streamDelayS: 900 }))
    fireEvent.click(screen.getByRole('button', { name: /why might this be out of sync/i }))
    expect(screen.getByText(/can run ahead of or behind/i)).toBeInTheDocument()
  })
})
