/**
 * Surface-level coverage for the preferred-broadcast-language preference on the two places a
 * fan actually picks a stream: the Live Series Companion (SeriesLivePulse) and the match
 * drawer's replay section (MatchDrawer).
 *
 * Both surfaces promote the fan's language into the PRIMARY slot without hiding the default —
 * the previous primary demotes to an outline button in the same row. The replay surface
 * additionally keeps the "Channel link" honesty marker on a promoted stream that has no VOD
 * timestamp, so a fan is never led to expect a jump-to-the-moment replay and handed a bare
 * channel instead.
 *
 * pickPreferredStream's own ranking/fallback rules live in preferred-stream-language.test.js.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import SeriesLivePulse from '../components/SeriesLivePulse'
import MatchDrawer from '../components/MatchDrawer'
import { STORAGE_KEYS } from '../utils'

vi.mock('../utils', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, trackEvent: vi.fn() }
})

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    fetchLiveGamePulse: vi.fn().mockResolvedValue(null),
    fetchHeroes: vi.fn().mockResolvedValue({}),
    fetchMatchIndicators: vi.fn().mockResolvedValue({}),
    fetchMatchStats: vi.fn().mockResolvedValue(null),
    fetchHighlights: vi.fn().mockResolvedValue([]),
    matchHighlightsToSeries: vi.fn().mockReturnValue(null),
  }
})

vi.mock('../components/DraftDisplay', () => ({ default: () => null }))
vi.mock('../components/GoldGraph', () => ({ default: () => null }))
vi.mock('../components/PlayerStatsSection', () => ({ default: () => null }))

const RU_LIVE = { raw_url: 'https://www.twitch.tv/pgl_ru', channel: 'pgl_ru', language: 'ru', source: 'twitch', official: false }
const ES_LIVE = { raw_url: 'https://www.twitch.tv/caster_es', channel: 'caster_es', language: 'es', source: 'twitch', official: false }

const liveProps = {
  psMatchId: 'ps1',
  spoilerFree: false,
  isOwner: false,
  seriesLabel: 'BO3',
  seriesScore: '0-0',
  teamA: 'Team Lynx',
  teamB: 'KW',
  tournament: 'EPL Masters',
  streams: [{ label: 'PGL', url: 'https://www.twitch.tv/pgl_dota2' }],
  youtubeStream: null,
}

const RU_PAGE = { url: 'https://www.twitch.tv/pgl_ru', channel: 'pgl_ru', language: 'ru', source: 'twitch', official: false, deep_link: false, kind: 'stream_page' }
const RU_DEEP = { url: 'https://www.twitch.tv/videos/777?t=50s', channel: 'pgl_ru', language: 'ru', source: 'twitch', official: false, deep_link: true, kind: 'start_point' }

const drawerMatch = {
  id: '8904012666',
  tournament: 'Esports World Cup',
  date: 'Jul 19, 2026',
  duration: '0:45',
  radiantTeam: 'BoomBoys',
  direTeam: 'PVISION',
  radiantScore: 25,
  direScore: 29,
  radiantWin: false,
  startTime: 1_752_953_000,
  url: 'https://www.twitch.tv/videos/111?t=600s',
  channel: 'pgl_dota2',
  // Deliberately the KV/Helix resolver's REAL shape — api/match-streams.js returns
  // { url, channel, startedAt } with no `source` and no `language`. An earlier version of this
  // fixture hand-added source:'twitch', which hid the fact that the drawer was branding genuine
  // timestamped VODs as green "Channel link" buttons on that path.
  allVods: [{ url: 'https://www.twitch.tv/videos/111?t=600s', channel: 'pgl_dota2', startedAt: '2026-07-19T10:00:00Z' }],
}

beforeEach(() => {
  localStorage.clear()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})
afterEach(() => { localStorage.clear(); vi.clearAllMocks() })

async function renderLive(props = {}) {
  let r
  await act(async () => { r = render(<SeriesLivePulse {...liveProps} {...props} />) })
  return r
}

async function renderDrawer(match = {}) {
  let r
  await act(async () => {
    r = render(<MatchDrawer match={{ ...drawerMatch, ...match }} onDismiss={() => {}} />)
  })
  return r
}

describe('live surface — preferred language in the primary slot', () => {
  it('leaves the watch row untouched when no preference is set', async () => {
    await renderLive({ otherStreams: [RU_LIVE] })
    const primary = screen.getByRole('link', { name: /Watch · PGL/ })
    expect(primary).toHaveClass('bg-purple-700')
    // RU stays a LiveStreamPicker row (a lone extra stream renders inline there, per that
    // component's 0/1/≥2 rule) rather than being promoted into the primary slot.
    const ru = screen.getByRole('link', { name: /Watch live in RU/ })
    expect(ru).not.toHaveClass('bg-purple-700')
  })

  it('leaves the watch row untouched when the preferred language is not broadcast', async () => {
    localStorage.setItem(STORAGE_KEYS.STREAM_LANGUAGE, 'ru')
    await renderLive({ otherStreams: [ES_LIVE] })
    const primary = screen.getByRole('link', { name: /Watch · PGL/ })
    expect(primary).toHaveClass('bg-purple-700')
  })

  it('promotes the preferred-language stream to the primary slot and demotes the default', async () => {
    localStorage.setItem(STORAGE_KEYS.STREAM_LANGUAGE, 'ru')
    await renderLive({ otherStreams: [RU_LIVE, ES_LIVE] })

    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', RU_LIVE.raw_url)
    expect(links[0]).toHaveClass('bg-purple-700')
    expect(screen.getByText('RU')).toBeInTheDocument()

    const demoted = screen.getByRole('link', { name: /Watch · PGL/ })
    expect(demoted).not.toHaveClass('bg-purple-700')
    // the official default is demoted, never removed
    expect(demoted).toHaveAttribute('href', 'https://www.twitch.tv/pgl_dota2')
  })

  it('does not promote when the official broadcast is already in the preferred language', async () => {
    localStorage.setItem(STORAGE_KEYS.STREAM_LANGUAGE, 'en')
    await renderLive({ otherStreams: [{ ...ES_LIVE, language: 'en', channel: 'caster_en' }], primaryLanguages: ['en'] })
    const primary = screen.getByRole('link', { name: /Watch · PGL/ })
    expect(primary).toHaveClass('bg-purple-700')
  })

  it('shows a language chip on a promoted English stream, matching the picker rows below', async () => {
    localStorage.setItem(STORAGE_KEYS.STREAM_LANGUAGE, 'en')
    await renderLive({ otherStreams: [{ ...ES_LIVE, language: 'en', channel: 'caster_en' }], primaryLanguages: ['ru'] })
    expect(screen.getByText('EN')).toBeInTheDocument()
  })

  it('does not leave the promoted stream duplicated in the picker below', async () => {
    localStorage.setItem(STORAGE_KEYS.STREAM_LANGUAGE, 'ru')
    await renderLive({ otherStreams: [RU_LIVE, ES_LIVE] })
    const ruLinks = screen.getAllByRole('link').filter(a => a.getAttribute('href') === RU_LIVE.raw_url)
    expect(ruLinks).toHaveLength(1)
  })
})

describe('replay surface — preferred language in the primary slot', () => {
  it('leaves the resolved VOD as primary when no preference is set', async () => {
    await renderDrawer({ otherStreams: [RU_PAGE] })
    const vod = screen.getByRole('link', { name: /PGL/ })
    expect(vod).toHaveAttribute('href', drawerMatch.url)
    expect(vod).toHaveClass('bg-purple-700')
  })

  it('promotes the preferred-language stream ahead of the resolved VOD and demotes it', async () => {
    localStorage.setItem(STORAGE_KEYS.STREAM_LANGUAGE, 'ru')
    await renderDrawer({ otherStreams: [RU_PAGE] })

    const promoted = screen.getByRole('link', { name: /RU/ })
    expect(promoted).toHaveAttribute('href', RU_PAGE.url)
    expect(promoted).toHaveClass('bg-purple-700')

    const vod = screen.getByRole('link', { name: /PGL/ })
    expect(vod).toHaveAttribute('href', drawerMatch.url)
    expect(vod).not.toHaveClass('bg-purple-700')
  })

  it('keeps the Channel link marker on a promoted stream with no VOD timestamp', async () => {
    localStorage.setItem(STORAGE_KEYS.STREAM_LANGUAGE, 'ru')
    await renderDrawer({ otherStreams: [RU_PAGE] })
    expect(screen.getByText('Channel link')).toBeInTheDocument()
  })

  it('omits the Channel link marker when the promoted stream is a real deep-linked replay', async () => {
    localStorage.setItem(STORAGE_KEYS.STREAM_LANGUAGE, 'ru')
    await renderDrawer({ otherStreams: [RU_DEEP] })
    expect(screen.getByRole('link', { name: /RU/ })).toHaveAttribute('href', RU_DEEP.url)
    expect(screen.queryByText('Channel link')).not.toBeInTheDocument()
  })

  it('never brands the resolved VOD itself as a channel link, even on the KV path with no source field', async () => {
    // The resolver's entries have neither `source` nor `deep_link`; inferring "not a real VOD"
    // from either absence would wrongly mark a genuine timestamped VOD as a bare channel link.
    await renderDrawer({ otherStreams: [] })
    expect(screen.queryByText('Channel link')).not.toBeInTheDocument()
    // ...and it keeps the Twitch primary treatment rather than the unknown-source green button.
    expect(screen.getByRole('link', { name: /PGL/ })).toHaveClass('bg-purple-700')
  })

  it('does not promote when the resolved VOD is already in the preferred language', async () => {
    // The fan asked for Russian and already has it. Promoting an unofficial RU co-stream page
    // over an official deep-linked RU VOD would hand them a strictly worse link.
    localStorage.setItem(STORAGE_KEYS.STREAM_LANGUAGE, 'ru')
    await renderDrawer({
      allVods: [{ url: 'https://www.twitch.tv/videos/999?t=30s', channel: 'pgl_ru_official', source: 'twitch', language: 'ru', deep_link: true }],
      otherStreams: [RU_PAGE],
    })
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', 'https://www.twitch.tv/videos/999?t=30s')
    expect(links[0]).toHaveClass('bg-purple-700')
    // The RU co-stream stays a picker row (where a "Channel link" marker is correct) and is
    // never promoted into the primary button.
    expect(links[0]).not.toHaveTextContent('Channel link')
  })

  it('keeps the no-replay notice and Search Twitch when a promoted stream is the only button', async () => {
    localStorage.setItem(STORAGE_KEYS.STREAM_LANGUAGE, 'ru')
    await renderDrawer({ url: undefined, channel: undefined, allVods: [], otherStreams: [RU_PAGE] })
    expect(screen.getByRole('link', { name: /RU/ })).toBeInTheDocument()
    // Setting a preference must not cost the fan the honesty copy or the escape hatch.
    expect(screen.getByText(/No replay found for the official broadcast/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Search Twitch' })).toBeInTheDocument()
    expect(screen.queryByText('Copy VOD link')).not.toBeInTheDocument()
  })
})
