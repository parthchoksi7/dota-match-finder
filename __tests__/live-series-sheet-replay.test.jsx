/**
 * Coverage for LiveSeriesSheet's tap-through loading state (fixed 2026-07-18: clicking a
 * finished game's replay row — e.g. "G1" while G2 is still live — used to close this sheet
 * immediately and flash the bare homepage while App.jsx fetched the OD match. The fix keeps
 * the sheet mounted and shows a per-row "Loading…" state via the `loadingGameId` prop instead.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LiveSeriesSheet from '../src/components/LiveSeriesSheet.jsx'

vi.mock('../src/components/SeriesGameDraftStrip', () => ({ default: () => null }))
vi.mock('../src/components/SeriesGameIndicators', () => ({ default: () => null }))
vi.mock('../src/components/SeriesGameScore', () => ({ default: () => null }))
vi.mock('../src/components/SeriesLivePulse', () => ({ default: () => null }))
vi.mock('../src/api', () => ({ fetchLiveSeriesGameIds: vi.fn().mockResolvedValue({}) }))

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

describe('LiveSeriesSheet replay loading state', () => {
  it('stays mounted with a per-row loading indicator while the clicked game is fetching', () => {
    const onReplay = vi.fn()
    const { rerender } = render(
      <LiveSeriesSheet match={match} onDismiss={() => {}} onReplay={onReplay} loadingGameId={null} spoilerFree={false} />
    )

    fireEvent.click(screen.getByRole('button', { name: /Game 1/ }))
    expect(onReplay).toHaveBeenCalledWith('od1')

    // App.jsx sets loadingGameId synchronously while its OD fetch is in flight.
    rerender(
      <LiveSeriesSheet match={match} onDismiss={() => {}} onReplay={onReplay} loadingGameId="od1" spoilerFree={false} />
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
    // .border-gray-50 is unique to game-row wrappers (the header row uses .border-gray-100)
    const innerRow = container.querySelector('.border-gray-50 > div')
    expect(innerRow.className).toBe('')
  })

  it('dims and disables other rows while one row is loading', () => {
    const twoFinishedMatch = {
      ...match,
      games: [
        { position: 1, status: 'finished', matchId: 'od1', winnerName: 'Team Falcons' },
        { position: 2, status: 'finished', matchId: 'od2', winnerName: 'Xtreme Gaming' },
      ],
    }
    render(
      <LiveSeriesSheet match={twoFinishedMatch} onDismiss={() => {}} onReplay={vi.fn()} loadingGameId="od1" spoilerFree={false} />
    )
    expect(screen.queryByRole('button', { name: /Game 2/ })).not.toBeInTheDocument()
  })
})
