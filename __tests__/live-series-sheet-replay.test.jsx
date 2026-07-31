/**
 * Coverage for LiveSeriesSheet's game switcher (default-to-live-game + tab switching) and its
 * tap-through loading state (fixed 2026-07-18: clicking a finished game's replay row used to
 * close this sheet immediately and flash the bare homepage while App.jsx fetched the OD match.
 * The fix keeps the sheet mounted and shows a per-row "Loading…" state via `loadingGameId`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LiveSeriesSheet from '../src/components/LiveSeriesSheet.jsx'
import Sheet from '../src/components/Sheet.jsx'

vi.mock('../src/components/SeriesGameDraftStrip', () => ({ default: () => null }))
vi.mock('../src/components/SeriesGameIndicators', () => ({ default: () => null }))
vi.mock('../src/components/SeriesGameScore', () => ({ default: () => null }))
vi.mock('../src/components/SeriesLivePulse', () => ({
  default: ({ otherStreams }) => <div>Live pulse ({(otherStreams || []).length} other streams)</div>,
}))
vi.mock('../src/api', () => ({
  fetchLiveSeriesGameIds: vi.fn().mockResolvedValue({}),
  fetchMatchStats: vi.fn().mockResolvedValue(null),
}))
vi.mock('../src/utils', () => ({ trackEvent: vi.fn(), isGrandFinal: (r) => /^(grand )?finals?$/i.test(r || '') }))
import { trackEvent } from '../src/utils'
import { fetchMatchStats } from '../src/api'

const match = {
  id: 'ps1',
  teamA: 'Team Falcons',
  teamB: 'Xtreme Gaming',
  tournament: 'Test Cup',
  games: [
    { position: 1, status: 'finished', matchId: 'od1', winnerName: 'Team Falcons' },
    { position: 2, status: 'running' },
  ],
}

describe('LiveSeriesSheet game switcher', () => {
  it('opens on the live game tab by default, not the finished game', () => {
    render(
      <LiveSeriesSheet match={match} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} />
    )
    expect(screen.getByText(/Live pulse/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Game 1/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'G2' })).toHaveAttribute('aria-current', 'true')
  })

  it('opens the full match drawer directly when a finished game with a resolved OD id is tapped', () => {
    // A finished game whose OD match is already indexed should get the same full-drawer
    // treatment as a genuinely completed series' game, not this sheet's abbreviated summary.
    const onReplay = vi.fn()
    render(
      <LiveSeriesSheet match={match} onDismiss={() => {}} onReplay={onReplay} loadingGameId={null} spoilerFree={false} />
    )
    fireEvent.click(screen.getByRole('button', { name: /G1/ }))
    expect(trackEvent).toHaveBeenCalledWith('live_series_tab_click', { position: 1, status: 'finished' })
    expect(onReplay).toHaveBeenCalledWith('od1')
    // The sheet itself stays pinned on the live game — G1 didn't switch it to the summary view.
    expect(screen.getByText(/Live pulse/)).toBeInTheDocument()
  })

  it('falls back to the inline summary for a finished game with no resolved OD id yet', () => {
    const unresolvedMatch = {
      ...match,
      games: [
        { position: 1, status: 'finished', winnerName: 'Team Falcons' },
        { position: 2, status: 'running' },
      ],
    }
    const onReplay = vi.fn()
    render(
      <LiveSeriesSheet match={unresolvedMatch} onDismiss={() => {}} onReplay={onReplay} loadingGameId={null} spoilerFree={false} />
    )
    fireEvent.click(screen.getByRole('button', { name: /G1/ }))
    expect(onReplay).not.toHaveBeenCalled()
    // No matchId yet, so the row isn't clickable and shows the winner name plus the
    // "Stats indexing" placeholder instead of a draft strip. Scoped to the `<p>` since the
    // G1 tab chip now also carries a "Team Falcons" sublabel (a `<span>`) alongside it.
    expect(screen.getByText('Team Falcons', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Stats indexing')).toBeInTheDocument()
    expect(screen.queryByText(/Live pulse/)).not.toBeInTheDocument()
  })

  it('does not show a switcher when there is only one game to show', () => {
    const singleGameMatch = { ...match, games: [{ position: 1, status: 'finished', matchId: 'od1', winnerName: 'Team Falcons' }] }
    render(
      <LiveSeriesSheet match={singleGameMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} />
    )
    expect(screen.queryByRole('button', { name: 'G1' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Game 1/ })).toBeInTheDocument()
  })

  it('respects an explicit initialGamePosition over the live-game default', () => {
    render(
      <LiveSeriesSheet match={match} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} initialGamePosition={1} />
    )
    expect(screen.getByRole('button', { name: /Game 1/ })).toBeInTheDocument()
    expect(screen.queryByText(/Live pulse/)).not.toBeInTheDocument()
  })

  it('disables tab switching while a replay fetch is in flight', () => {
    render(
      <LiveSeriesSheet match={match} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId="od1" spoilerFree={false} />
    )
    expect(screen.getByRole('button', { name: /G1/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'G2' })).toBeDisabled()
  })

  it('auto-follows onto a newly-live game when the fan never touched the switcher', () => {
    const { rerender } = render(
      <LiveSeriesSheet match={match} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} />
    )
    expect(screen.getByRole('button', { name: 'G2' })).toHaveAttribute('aria-current', 'true')

    // Ambient poll: G2 finished, G3 is now running. Same series (match.id unchanged).
    const g3LiveMatch = {
      ...match,
      games: [
        { position: 1, status: 'finished', matchId: 'od1', winnerName: 'Team Falcons' },
        { position: 2, status: 'finished', matchId: 'od2', winnerName: 'Xtreme Gaming' },
        { position: 3, status: 'running' },
      ],
    }
    rerender(
      <LiveSeriesSheet match={g3LiveMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} />
    )
    expect(screen.getByRole('button', { name: 'G3' })).toHaveAttribute('aria-current', 'true')
  })

  it('does NOT auto-follow a newly-live game once the fan has manually picked a tab', () => {
    // G1 has no resolved OD id here so the click pins the inline summary instead of shortcutting
    // to onReplay - keeps this test isolated to pin/auto-follow behavior, not the replay handoff
    // covered above.
    const unresolvedMatch = {
      ...match,
      games: [
        { position: 1, status: 'finished', winnerName: 'Team Falcons' },
        { position: 2, status: 'running' },
      ],
    }
    const { rerender } = render(
      <LiveSeriesSheet match={unresolvedMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} />
    )
    fireEvent.click(screen.getByRole('button', { name: /G1/ }))
    expect(screen.getByRole('button', { name: /G1/ })).toHaveAttribute('aria-current', 'true')

    const g3LiveMatch = {
      ...unresolvedMatch,
      games: [
        { position: 1, status: 'finished', winnerName: 'Team Falcons' },
        { position: 2, status: 'finished', matchId: 'od2', winnerName: 'Xtreme Gaming' },
        { position: 3, status: 'running' },
      ],
    }
    rerender(
      <LiveSeriesSheet match={g3LiveMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} />
    )
    // Still pinned on the fan's explicit choice, not yanked onto the new live game.
    expect(screen.getByRole('button', { name: /G1/ })).toHaveAttribute('aria-current', 'true')
  })

  it('excludes the primary Twitch channel from otherStreams case-insensitively', () => {
    // PandaScore is confirmed to send mixed-case logins (e.g. EWC 2026's EWC_LegionGauntlet_EN2).
    // getTwitchStreams() lowercases via twitchLoginFromUrl; normalizeAllStreams() does not - a
    // case-sensitive comparison here would fail to exclude the primary channel and double-list it.
    const mixedCaseMatch = {
      ...match,
      streams: [{ label: 'EWC', url: 'https://www.twitch.tv/ewc_legiongauntlet_en2' }],
      allStreams: [
        { raw_url: 'https://www.twitch.tv/EWC_LegionGauntlet_EN2', channel: 'EWC_LegionGauntlet_EN2', language: 'en', source: 'twitch', official: true },
        { raw_url: 'https://www.twitch.tv/pgl_ru', channel: 'pgl_ru', language: 'ru', source: 'twitch', official: false },
      ],
    }
    render(
      <LiveSeriesSheet match={mixedCaseMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} />
    )
    expect(screen.getByText(/Live pulse \(1 other streams\)/)).toBeInTheDocument()
  })
})

describe('LiveSeriesSheet Grand Final bracketRound styling', () => {
  it('renders a Grand Final bracketRound in amber', () => {
    const gfMatch = { ...match, bracketRound: 'Grand Final' }
    render(<LiveSeriesSheet match={gfMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} />)
    const label = screen.getByText('Grand Final')
    expect(label.className).toMatch(/text-amber-600/)
  })

  it('does not render a non-final bracketRound in amber', () => {
    const groupStageMatch = { ...match, bracketRound: 'Group Stage' }
    render(<LiveSeriesSheet match={groupStageMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} />)
    const label = screen.getByText('Group Stage')
    expect(label.className).not.toMatch(/text-amber-600/)
    expect(label.className).toMatch(/text-gray-400/)
  })
})

describe('LiveSeriesSheet finished-game winner-name fallback', () => {
  beforeEach(() => {
    fetchMatchStats.mockReset()
    fetchMatchStats.mockResolvedValue(null)
  })

  const unresolvedNameMatch = {
    ...match,
    games: [
      { position: 1, status: 'finished', matchId: 'od1' }, // no winnerName from PandaScore yet
      { position: 2, status: 'running' },
    ],
  }

  it('resolves the winner from OD stats in the body when winnerName is missing but the OD id has resolved', async () => {
    fetchMatchStats.mockResolvedValue({ radiantWin: true, radiantName: 'Team Falcons', direName: 'Xtreme Gaming' })
    render(
      <LiveSeriesSheet match={unresolvedNameMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} initialGamePosition={1} />
    )
    expect(await screen.findByText('Team Falcons', { selector: 'p' })).toBeInTheDocument()
  })

  it('also shows the resolved winner as the G1 tab sublabel while parked on the live G2 tab', async () => {
    // The actual reported gap: a fan viewing the live game must see a finished sibling's
    // resolved winner on its tab chip too, not just after tapping into it.
    fetchMatchStats.mockResolvedValue({ radiantWin: true, radiantName: 'Team Falcons', direName: 'Xtreme Gaming' })
    render(
      <LiveSeriesSheet match={unresolvedNameMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} />
    )
    // Still on G2 (the live default) — G1's tab chip should pick up the resolved name.
    expect(screen.getByText(/Live pulse/)).toBeInTheDocument()
    expect(await screen.findByText('Team Falcons')).toBeInTheDocument()
    const g1Tab = screen.getByRole('button', { name: /G1/ })
    expect(g1Tab).toHaveTextContent('Team Falcons')
  })

  it('falls back to no sublabel when the OD names do not resolve to either PS team', async () => {
    fetchMatchStats.mockResolvedValue({ radiantWin: true, radiantName: 'OG', direName: 'Liquid' })
    render(
      <LiveSeriesSheet match={unresolvedNameMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} />
    )
    await screen.findByText(/Live pulse/)
    const g1Tab = screen.getByRole('button', { name: 'G1' })
    expect(g1Tab).not.toHaveTextContent('OG')
    expect(g1Tab).not.toHaveTextContent('Liquid')
  })

  it('prefers the PandaScore winnerName over the OD-resolved fallback when both are available', () => {
    render(
      <LiveSeriesSheet match={match} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} initialGamePosition={1} />
    )
    expect(screen.getByText('Team Falcons', { selector: 'p' })).toBeInTheDocument()
    expect(fetchMatchStats).not.toHaveBeenCalled()
  })

  it('hides the resolved winner name from the tab sublabel in spoiler-free mode', async () => {
    fetchMatchStats.mockResolvedValue({ radiantWin: true, radiantName: 'Team Falcons', direName: 'Xtreme Gaming' })
    render(
      <LiveSeriesSheet match={unresolvedNameMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={true} />
    )
    await screen.findByText(/Live pulse/)
    const g1Tab = screen.getByRole('button', { name: 'G1' })
    expect(g1Tab).not.toHaveTextContent('Team Falcons')
  })
})

describe('LiveSeriesSheet replay loading state', () => {
  it('stays mounted with a per-row loading indicator while the clicked game is fetching', () => {
    const onReplay = vi.fn()
    // LiveSeriesSheet no longer owns its own <Sheet> (App.jsx now hosts one persistent Sheet
    // shared with MatchDrawer, so switching between them doesn't unmount/remount the panel) —
    // wrapped here to keep exercising the same dialog-role integration surface this test covers.
    const { rerender } = render(
      <Sheet onDismiss={() => {}} ariaLabel="Test series">
        <LiveSeriesSheet match={match} onDismiss={() => {}} onReplay={onReplay} loadingGameId={null} spoilerFree={false} initialGamePosition={1} />
      </Sheet>
    )

    fireEvent.click(screen.getByRole('button', { name: /Game 1/ }))
    expect(onReplay).toHaveBeenCalledWith('od1')

    // App.jsx sets loadingGameId synchronously while its OD fetch is in flight.
    rerender(
      <Sheet onDismiss={() => {}} ariaLabel="Test series">
        <LiveSeriesSheet match={match} onDismiss={() => {}} onReplay={onReplay} loadingGameId="od1" spoilerFree={false} initialGamePosition={1} />
      </Sheet>
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
    expect(screen.getByLabelText('Loading Game 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Game 1/ })).not.toBeInTheDocument()
  })

  it('matches loadingGameId to a row across a string/number type mismatch', () => {
    // Simulates the live poll re-deriving gameMatchId with a different JS type than the id
    // captured at click time — the comparison must not silently miss due to strict ===.
    const numericIdMatch = {
      ...match,
      games: [{ position: 1, status: 'finished', matchId: 123, winnerName: 'Team Falcons' }],
    }
    render(
      <LiveSeriesSheet match={numericIdMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId="123" spoilerFree={false} />
    )
    expect(screen.getByLabelText('Loading Game 1')).toBeInTheDocument()
  })

  it('does not add spacing to a non-clickable, non-loading row (no OD id resolved yet)', () => {
    const noIdMatch = {
      ...match,
      games: [{ position: 1, status: 'finished', winnerName: 'Team Falcons' }],
    }
    const { container } = render(
      <LiveSeriesSheet match={noIdMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId={null} spoilerFree={false} />
    )
    // Scoped to the scrollable content area — the sheet header also carries px-4/py-3 classes.
    const innerRow = container.querySelector('.overflow-y-auto .px-4.py-3 > div')
    expect(innerRow.className).toBe('')
  })
})
