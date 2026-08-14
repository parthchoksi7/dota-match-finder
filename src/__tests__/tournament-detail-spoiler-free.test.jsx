/**
 * Tests for spoiler-free gating on the standalone TournamentDetail page.
 *
 * This page previously had no spoiler awareness at all: a completed
 * tournament's champion banner ("🏆 Team Spirit") rendered unconditionally.
 * Covers:
 * - Champion banner hidden when ?spoilers=off (spoiler-free)
 * - Champion banner shown when ?spoilers=on (scores visible)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import TournamentDetail from '../pages/TournamentDetail'

vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils')
  return { ...actual, trackEvent: vi.fn() }
})
vi.mock('../components/SiteHeader', () => ({ default: () => null }))
vi.mock('../components/SiteFooter', () => ({ default: () => null }))
vi.mock('../components/BottomTabBar', () => ({ default: () => null }))
vi.mock('../components/StageTimeline', () => ({ default: () => null }))
vi.mock('../components/TeamRoster', () => ({ default: () => null }))
vi.mock('../components/RegionBreakdown', () => ({ default: () => null }))

const completedTournament = {
  id: '123',
  name: 'The International 2026',
  leagueName: 'The International',
  status: 'completed',
  winner: { name: 'Team Spirit' },
  stages: [],
  teams: [],
}

function setUrl({ pathname, search = '' }) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname, search },
    writable: true,
  })
}

beforeEach(() => {
  localStorage.clear()
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(completedTournament),
    })
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TournamentDetail champion banner spoiler-free gating', () => {
  it('hides the champion name when spoiler-free (?spoilers=off)', async () => {
    setUrl({ pathname: '/tournament/123', search: '?spoilers=off' })
    render(<TournamentDetail />)
    await waitFor(() => expect(screen.getByText('The International 2026')).toBeInTheDocument())
    expect(screen.queryByText('Team Spirit')).toBeNull()
    expect(screen.queryByText('🏆')).toBeNull()
  })

  it('shows the champion name when scores are visible (?spoilers=on)', async () => {
    setUrl({ pathname: '/tournament/123', search: '?spoilers=on' })
    render(<TournamentDetail />)
    await waitFor(() => expect(screen.getByText('Team Spirit')).toBeInTheDocument())
    expect(screen.getByText('🏆')).toBeInTheDocument()
  })
})
