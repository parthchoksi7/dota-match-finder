/**
 * SeriesLivePulse's poll backoff once a series leaves the live feed (2026-08-11, Fluid Active CPU).
 *
 * Why this needs its own coverage: the cadence is invisible in the rendered output, so nothing else
 * in the suite would fail if a future edit dropped `seriesConcluded` from the interval expression
 * and quietly restored full-rate polling. That is the same class of silent regression the earlier
 * invocation-count work existed to fix — it ran for weeks with the whole suite green.
 *
 * The saving this protects is specifically the LONE-viewer case: a single forgotten foreground tab
 * polling every 40s against the endpoint's 30s s-maxage misses on every poll, so the edge cache
 * covers none of it (~2,160 invocations/day by itself).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import SeriesLivePulse from '../src/components/SeriesLivePulse.jsx'

const { fetchLivePulse } = vi.hoisted(() => ({ fetchLivePulse: vi.fn() }))

vi.mock('../src/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchLivePulse,
    fetchHeroes: vi.fn().mockResolvedValue({}),
  }
})
vi.mock('../src/utils', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, trackEvent: vi.fn() }
})

const LIVE_POLL_MS = 40 * 1000
const IDLE_POLL_MS = 5 * 60 * 1000

const baseProps = {
  psMatchId: 'ps1',
  spoilerFree: false,
  seriesLabel: 'BO3',
  seriesScore: '1-1',
  teamA: 'Team Falcons',
  teamB: 'Xtreme Gaming',
  tournament: 'Test Cup',
}

// Flushes the mocked pulse promise so the component's state settles between timer advances.
async function settle() {
  await act(async () => { await Promise.resolve() })
}

async function advance(ms) {
  await act(async () => { vi.advanceTimersByTime(ms) })
  await settle()
}

beforeEach(() => {
  vi.useFakeTimers()
  fetchLivePulse.mockReset()
  fetchLivePulse.mockResolvedValue({ od: null, valve: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SeriesLivePulse — idle backoff when the series has concluded', () => {
  it('polls at the live cadence while the series is still running', async () => {
    render(<SeriesLivePulse {...baseProps} seriesConcluded={false} />)
    await settle()
    const afterMount = fetchLivePulse.mock.calls.length

    await advance(LIVE_POLL_MS)
    expect(fetchLivePulse.mock.calls.length).toBe(afterMount + 1)

    await advance(LIVE_POLL_MS)
    expect(fetchLivePulse.mock.calls.length).toBe(afterMount + 2)
  })

  it('does NOT poll at the live cadence once the series has concluded', async () => {
    render(<SeriesLivePulse {...baseProps} seriesConcluded />)
    await settle()
    const afterMount = fetchLivePulse.mock.calls.length

    // Three full live-rate intervals would have been three polls before this change.
    await advance(LIVE_POLL_MS * 3)
    expect(fetchLivePulse.mock.calls.length).toBe(afterMount)
  })

  it('still polls on the idle cadence — a backoff, never a full stop, so a wrong conclusion signal self-corrects instead of freezing the sheet until it is reopened', async () => {
    render(<SeriesLivePulse {...baseProps} seriesConcluded />)
    await settle()
    const afterMount = fetchLivePulse.mock.calls.length

    await advance(IDLE_POLL_MS)
    expect(fetchLivePulse.mock.calls.length).toBe(afterMount + 1)
  })

  it('defaults to the live cadence when seriesConcluded is not supplied, so an omitted prop can never silently slow a running series', async () => {
    render(<SeriesLivePulse {...baseProps} />)
    await settle()
    const afterMount = fetchLivePulse.mock.calls.length

    await advance(LIVE_POLL_MS)
    expect(fetchLivePulse.mock.calls.length).toBe(afterMount + 1)
  })

  it('returns to the live cadence if the series reappears in the live feed', async () => {
    const { rerender } = render(<SeriesLivePulse {...baseProps} seriesConcluded />)
    await settle()

    await advance(LIVE_POLL_MS * 2)
    const whileIdle = fetchLivePulse.mock.calls.length

    rerender(<SeriesLivePulse {...baseProps} seriesConcluded={false} />)
    await settle()

    // Exact count, not toBeGreaterThan: a loose assertion here passes under BOTH mutations
    // (always-live and always-idle) and so contributes nothing to catching a regression. Pinning
    // it to +1 asserts the real property — the rebuilt interval runs at the live rate, and does
    // not serve out the remainder of the 5-min idle tick it replaced.
    await advance(LIVE_POLL_MS)
    expect(fetchLivePulse.mock.calls.length).toBe(whileIdle + 1)
  })
})
