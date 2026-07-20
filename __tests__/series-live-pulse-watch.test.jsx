/**
 * Coverage for SeriesLivePulse's watch links (Twitch/YouTube primary buttons + the
 * LiveStreamPicker for every other language/co-stream). These come from the already-fetched
 * match object, not the 20s live-pulse poll, so they must render even before the first pulse
 * resolves — a fan shouldn't wait on live data just to get a link to the stream.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import SeriesLivePulse from '../src/components/SeriesLivePulse.jsx'

vi.mock('../src/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchLiveGamePulse: vi.fn().mockResolvedValue(null),
    fetchHeroes: vi.fn().mockResolvedValue({}),
  }
})
vi.mock('../src/utils', () => ({ trackEvent: vi.fn() }))
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

// Flushes the mocked fetchLiveGamePulse/fetchHeroes/od-live-capture promises (none resolve to
// anything these tests care about — they only exercise the pulse-independent watch links) so
// the component's state updates land inside act() before assertions run.
async function renderPulse(props) {
  let result
  await act(async () => {
    result = render(<SeriesLivePulse {...baseProps} {...props} />)
  })
  return result
}

describe('SeriesLivePulse watch links', () => {
  it('renders nothing before the pulse resolves when there are no streams at all', async () => {
    const { container } = await renderPulse({})
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the primary Twitch watch button even before the pulse resolves', async () => {
    await renderPulse({ streams: [{ label: 'ESL', url: 'https://www.twitch.tv/esl_dota2' }] })
    const link = screen.getByRole('link', { name: /Watch/ })
    expect(link).toHaveAttribute('href', 'https://www.twitch.tv/esl_dota2')
    expect(link).toHaveTextContent('ESL')
  })

  it('renders the YouTube watch button when a youtubeStream is present', async () => {
    await renderPulse({ youtubeStream: 'https://youtube.com/watch?v=abc' })
    const link = screen.getByRole('link', { name: /Watch on YouTube/ })
    expect(link).toHaveAttribute('href', 'https://youtube.com/watch?v=abc')
  })

  it('fires live_match_watch with the live_series_sheet source on Twitch click', async () => {
    await renderPulse({ streams: [{ label: 'ESL', url: 'https://www.twitch.tv/esl_dota2' }] })
    fireEvent.click(screen.getByRole('link', { name: /Watch/ }))
    expect(trackEvent).toHaveBeenCalledWith('live_match_watch', {
      channel: 'ESL',
      teamA: 'Team Falcons',
      teamB: 'Xtreme Gaming',
      tournament: 'Test Cup',
      source: 'live_series_sheet',
    })
  })

  it('fires live_match_watch_youtube with the live_series_sheet source on YouTube click', async () => {
    await renderPulse({ youtubeStream: 'https://youtube.com/watch?v=abc' })
    fireEvent.click(screen.getByRole('link', { name: /Watch on YouTube/ }))
    expect(trackEvent).toHaveBeenCalledWith('live_match_watch_youtube', {
      teamA: 'Team Falcons',
      teamB: 'Xtreme Gaming',
      tournament: 'Test Cup',
      source: 'live_series_sheet',
    })
  })

  it('renders the other-streams picker alongside the primary buttons', async () => {
    await renderPulse({
      streams: [{ label: 'ESL', url: 'https://www.twitch.tv/esl_dota2' }],
      otherStreams: [{ raw_url: 'https://www.twitch.tv/pgl_ru', channel: 'pgl_ru', language: 'ru', source: 'twitch', official: false }],
    })
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })
})
