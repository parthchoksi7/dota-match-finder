/**
 * Coverage for the R4 objective row in SeriesLivePulse.jsx (owner-only during verification —
 * see DESIGN_GUIDELINES.md "Objective row"). The row renders only when ALL of these hold:
 * isOwner, spoiler-free is off, and the resolved pulse carries `objectives` (server already
 * confidence-gates that field, so its mere presence is sufficient — no separate low-confidence
 * state to test here, same reasoning as `series-live-pulse-watch.test.jsx`'s sibling surfaces).
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
vi.mock('../utils', () => ({ trackEvent: vi.fn() }))
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

describe('SeriesLivePulse — objective row (owner-only)', () => {
  it('renders the tower counts when isOwner, not spoiler-free, and objectives is present', async () => {
    await renderPulse(pulseWith({ objectives: { rt: 9, dt: 4 } }))
    const row = screen.getByLabelText('Objectives: Team Lynx 9 towers standing, KW 4 towers standing')
    expect(row).toHaveTextContent('9')
    expect(row).toHaveTextContent('4')
  })

  it('falls back to Radiant/Dire in the aria-label when team names are missing', async () => {
    await renderPulse(pulseWith({ radiantName: null, direName: null, objectives: { rt: 3, dt: 7 } }))
    expect(screen.getByLabelText('Objectives: Radiant 3 towers standing, Dire 7 towers standing')).toBeInTheDocument()
  })

  it('renders nothing when objectives is absent (low-confidence or not-yet-decoded, indistinguishable to the client)', async () => {
    await renderPulse(pulseWith())
    expect(screen.queryByText('Towers')).not.toBeInTheDocument()
  })

  it('renders nothing when isOwner is false, even though objectives is present (API already gates this, frontend gate is defense-in-depth)', async () => {
    await renderPulse(pulseWith({ objectives: { rt: 9, dt: 4 } }), { isOwner: false })
    expect(screen.queryByText('Towers')).not.toBeInTheDocument()
  })

  it('renders nothing in spoiler-free mode, even for an owner with objectives present', async () => {
    await renderPulse(pulseWith({ objectives: { rt: 9, dt: 4 } }), { spoilerFree: true })
    expect(screen.queryByText('Towers')).not.toBeInTheDocument()
  })

  it('does not render before the pulse resolves', async () => {
    fetchLiveGamePulse.mockResolvedValue(null)
    await act(async () => { render(<SeriesLivePulse {...baseProps} />) })
    expect(screen.queryByText('Towers')).not.toBeInTheDocument()
  })
})
