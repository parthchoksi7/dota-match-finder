/**
 * Tests for the StreamPicker component — the multi-language stream list in the
 * match drawer's replay section.
 *
 * Render modes: null for no streams, inline row for exactly one, collapsed
 * count pill for two or more. Rows carry the language chip, CO-STREAM badge
 * (unofficial only), and the "from stream start" honesty marker.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StreamPicker from '../components/StreamPicker'

vi.mock('../utils', () => ({ trackEvent: vi.fn() }))
import { trackEvent } from '../utils'

const RU_VOD = { url: 'https://www.twitch.tv/videos/777?t=50s', channel: 'pgl_ru', language: 'ru', source: 'twitch', official: false, deep_link: true, kind: 'start_point' }
const ES_PAGE = { url: 'https://www.twitch.tv/caster_es', channel: 'caster_es', language: 'es', source: 'twitch', official: false, deep_link: false, kind: 'stream_page' }
const EN2_OFFICIAL = { url: 'https://www.twitch.tv/pgl_dota2en2', channel: 'pgl_dota2en2', language: 'en', source: 'twitch', official: true, deep_link: false, kind: 'stream_page' }

afterEach(() => vi.clearAllMocks())

describe('StreamPicker', () => {
  it('renders nothing for empty or missing streams', () => {
    const { container: c1 } = render(<StreamPicker streams={[]} matchId="1" />)
    expect(c1).toBeEmptyDOMElement()
    const { container: c2 } = render(<StreamPicker streams={undefined} matchId="1" />)
    expect(c2).toBeEmptyDOMElement()
  })

  it('renders a single extra stream inline without a pill', () => {
    render(<StreamPicker streams={[RU_VOD]} matchId="1" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    const row = screen.getByRole('link')
    expect(row).toHaveAttribute('href', RU_VOD.url)
    expect(screen.getByText('RU')).toBeInTheDocument()
    expect(screen.getByText('Co-stream')).toBeInTheDocument()
  })

  it('collapses two or more streams behind a count pill and expands on click', () => {
    render(<StreamPicker streams={[EN2_OFFICIAL, RU_VOD, ES_PAGE]} matchId="42" />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    const pill = screen.getByRole('button')
    expect(pill).toHaveTextContent('3 more streams')
    expect(pill).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(pill)
    expect(pill).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(trackEvent).toHaveBeenCalledWith('stream_picker_expand', { matchId: '42', count: 3 })

    fireEvent.click(pill)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    // expand event fires on expand only
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it('marks non-deep-link rows with the from-stream-start marker and no play glyph', () => {
    render(<StreamPicker streams={[ES_PAGE]} matchId="1" />)
    expect(screen.getByText('From stream start')).toBeInTheDocument()
    expect(document.querySelector('svg[viewBox="0 0 12 12"]')).not.toBeInTheDocument()
  })

  it('marks deep-link rows with the play glyph and no marker', () => {
    render(<StreamPicker streams={[RU_VOD]} matchId="1" />)
    expect(screen.queryByText('From stream start')).not.toBeInTheDocument()
    expect(document.querySelector('svg[viewBox="0 0 12 12"]')).toBeInTheDocument()
  })

  it('shows no CO-STREAM badge on official streams', () => {
    render(<StreamPicker streams={[EN2_OFFICIAL]} matchId="1" />)
    expect(screen.queryByText('Co-stream')).not.toBeInTheDocument()
  })

  it('omits the language chip when language is null and labels by source', () => {
    render(<StreamPicker streams={[{ url: 'https://youtube.com/watch?v=z', channel: null, language: null, source: 'youtube', official: true, deep_link: false, kind: 'stream_page' }]} matchId="1" />)
    expect(screen.getByText('YouTube')).toBeInTheDocument()
    expect(screen.getByRole('link').textContent).not.toMatch(/^..\s/)
  })

  it('labels a non-Twitch/YouTube "other" source (e.g. Kick) by its URL host, not "Twitch"', () => {
    render(<StreamPicker streams={[{ url: 'https://kick.com/esl_dota2', channel: null, language: 'en', source: 'other', official: true, deep_link: false, kind: 'stream_page' }]} matchId="1" />)
    expect(screen.getByText('Kick')).toBeInTheDocument()
    expect(screen.queryByText('Twitch')).not.toBeInTheDocument()
  })

  it('fires vod_click with picker dimensions on row click', () => {
    render(<StreamPicker streams={[RU_VOD]} matchId="7" />)
    fireEvent.click(screen.getByRole('link'))
    expect(trackEvent).toHaveBeenCalledWith('vod_click', {
      matchId: '7',
      channel: 'pgl_ru',
      language: 'ru',
      official: false,
      kind: 'start_point',
      from_picker: true,
    })
  })

  it('exposes an accessible label describing language, channel, and start-point honesty', () => {
    render(<StreamPicker streams={[ES_PAGE]} matchId="1" />)
    expect(screen.getByRole('link')).toHaveAttribute('aria-label', 'Watch in ES on caster_es, co-stream, from stream start')
  })
})
