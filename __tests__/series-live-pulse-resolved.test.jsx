/**
 * Coverage for SeriesLivePulse's resolved-pulse render (2026-07-31 rewrite): names row, score
 * row, follow stars, and the net-worth-lead/clock facts line — restructured to mirror
 * MatchDrawer.jsx's own names/score section so a fan sees the same visual system whether a game
 * is live or completed. Previously untested — the existing test files only covered pure helpers
 * and the pre-pulse watch-links state.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import SeriesLivePulse from '../src/components/SeriesLivePulse.jsx'

// vi.mock factories are hoisted above regular const declarations, so the fixture referenced
// inside must be declared via vi.hoisted() to survive the hoist.
const { pulse } = vi.hoisted(() => ({
  pulse: {
    radiantName: 'Team Falcons',
    direName: 'Xtreme Gaming',
    radiantScore: 18,
    direScore: 15,
    radiantLead: 5000,
    gameTime: 1520,
    radiantHeroIds: [],
    direHeroIds: [],
    capturedAt: '2026-07-31T00:00:00.000Z',
  },
}))

vi.mock('../src/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchLiveGamePulse: vi.fn().mockResolvedValue(pulse),
    fetchHeroes: vi.fn().mockResolvedValue({}),
  }
})
vi.mock('../src/utils', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, trackEvent: vi.fn() }
})
import { trackEvent } from '../src/utils'

const baseProps = {
  psMatchId: 'ps1',
  spoilerFree: false,
  seriesLabel: 'BO3',
  seriesScore: '0-0',
  teamA: 'Team Falcons',
  teamB: 'Xtreme Gaming',
  tournament: 'Test Cup',
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

afterEach(() => vi.clearAllMocks())

async function renderPulse(props) {
  let result
  await act(async () => {
    result = render(<SeriesLivePulse {...baseProps} {...props} />)
  })
  return result
}

describe('SeriesLivePulse resolved-pulse names/score (mirrors MatchDrawer)', () => {
  it('renders both team names, neither winner/loser-colored (no result yet)', async () => {
    await renderPulse({})
    const radiant = screen.getByText('Team Falcons', { selector: 'span' })
    const dire = screen.getByText('Xtreme Gaming', { selector: 'span' })
    expect(radiant.className).toMatch(/text-gray-900/)
    expect(dire.className).toMatch(/text-gray-900/)
    expect(radiant.className).not.toMatch(/text-gray-400|text-gray-500/)
    expect(dire.className).not.toMatch(/text-gray-400|text-gray-500/)
  })

  it('renders centered score digits when a score is available', async () => {
    await renderPulse({})
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('shows "Score pending" instead of fabricated digits when the pulse has no score yet', async () => {
    const { fetchLiveGamePulse } = await import('../src/api')
    fetchLiveGamePulse.mockResolvedValueOnce({ ...pulse, radiantScore: null, direScore: null })
    await renderPulse({})
    expect(screen.getByText('Score pending')).toBeInTheDocument()
    expect(screen.queryByText('18')).not.toBeInTheDocument()
  })

  it('formats the net-worth-lead facts line without a double plus sign', async () => {
    await renderPulse({})
    // radiantLead: 5000 -> Radiant (Team Falcons) is ahead by +5.0k
    expect(screen.getByText(/Team Falcons \+5\.0k net worth/)).toBeInTheDocument()
    expect(screen.queryByText(/\+\+/)).not.toBeInTheDocument()
  })

  it('shows the game clock (via the momentum band, which takes precedence over the facts-line fallback — see series-live-pulse-score-order.test.jsx for the dedup rule)', async () => {
    await renderPulse({})
    // gameTime 1520s -> 25:20
    expect(screen.getByText(/25:20/)).toBeInTheDocument()
  })

  it('labels the watch section "Watch Live" and the draft section "Draft"', async () => {
    await renderPulse({ streams: [{ label: 'ESL', url: 'https://www.twitch.tv/esl_dota2' }] })
    expect(screen.getByText('Watch Live')).toBeInTheDocument()
  })
})

describe('SeriesLivePulse follow stars (mirrors MatchDrawer)', () => {
  it('does not render follow stars when onToggleFollow is not provided', async () => {
    await renderPulse({})
    expect(screen.queryByRole('button', { name: /Follow/ })).not.toBeInTheDocument()
  })

  it('renders follow stars for both teams and calls onToggleFollow with the team name', async () => {
    const onToggleFollow = vi.fn()
    await renderPulse({ onToggleFollow, followedTeams: [] })
    const followRadiant = screen.getByRole('button', { name: 'Follow Team Falcons' })
    fireEvent.click(followRadiant)
    expect(onToggleFollow).toHaveBeenCalledWith('Team Falcons')
    expect(trackEvent).toHaveBeenCalledWith('follow_team', { team_name: 'Team Falcons', source: 'live_series_sheet' })
  })

  it('shows the unfollow label and filled state for an already-followed team', async () => {
    await renderPulse({ onToggleFollow: vi.fn(), followedTeams: ['Xtreme Gaming'] })
    expect(screen.getByRole('button', { name: 'Unfollow Xtreme Gaming' })).toBeInTheDocument()
  })
})

describe('SeriesLivePulse spoiler-free reveal (mirrors MatchDrawer hideScore/scoreRevealed)', () => {
  it('hides names row score/facts behind a Reveal score button in spoiler-free mode, but still shows team names', async () => {
    await renderPulse({ spoilerFree: true })
    expect(screen.getByText('Team Falcons', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('Xtreme Gaming', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal score' })).toBeInTheDocument()
    expect(screen.queryByText('18')).not.toBeInTheDocument()
    expect(screen.queryByText(/net worth/)).not.toBeInTheDocument()
  })

  it('reveals the score and facts line after clicking Reveal score, and tracks the reveal', async () => {
    await renderPulse({ spoilerFree: true })
    fireEvent.click(screen.getByRole('button', { name: 'Reveal score' }))
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText(/Team Falcons \+5\.0k net worth/)).toBeInTheDocument()
    expect(trackEvent).toHaveBeenCalledWith('spoiler_reveal', {
      matchId: 'ps1',
      radiantTeam: 'Team Falcons',
      direTeam: 'Xtreme Gaming',
      source: 'live',
    })
  })

  it('does not gate team names or the draft behind spoiler-free (draft is pre-outcome, names are not a spoiler)', async () => {
    await renderPulse({ spoilerFree: true })
    expect(screen.queryByText('Reveal score')).toBeInTheDocument()
    // Team names still visible even though score is hidden.
    expect(screen.getByText('Team Falcons', { selector: 'span' })).toBeInTheDocument()
  })
})
