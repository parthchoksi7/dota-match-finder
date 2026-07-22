/**
 * Tests for LiveStreamPicker — the multi-language/co-stream list for the currently live game
 * inside the Live Series Companion. Sibling to StreamPicker (VOD/replay): same render-mode
 * rules (null/inline/collapsed pill), but no deep_link/from-stream-start marker — every row is
 * just "watch live now".
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LiveStreamPicker from '../components/LiveStreamPicker'

vi.mock('../utils', () => ({ trackEvent: vi.fn() }))
import { trackEvent } from '../utils'

const RU_STREAM = { raw_url: 'https://www.twitch.tv/pgl_ru', channel: 'pgl_ru', language: 'ru', source: 'twitch', official: false }
const ES_STREAM = { raw_url: 'https://www.twitch.tv/caster_es', channel: 'caster_es', language: 'es', source: 'twitch', official: false }
const EN2_OFFICIAL = { raw_url: 'https://www.twitch.tv/pgl_dota2en2', channel: 'pgl_dota2en2', language: 'en', source: 'twitch', official: true }

afterEach(() => vi.clearAllMocks())

describe('LiveStreamPicker', () => {
  it('renders nothing for empty or missing streams', () => {
    const { container: c1 } = render(<LiveStreamPicker streams={[]} matchId="1" />)
    expect(c1).toBeEmptyDOMElement()
    const { container: c2 } = render(<LiveStreamPicker streams={undefined} matchId="1" />)
    expect(c2).toBeEmptyDOMElement()
  })

  it('renders a single extra stream inline without a pill', () => {
    render(<LiveStreamPicker streams={[RU_STREAM]} matchId="1" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    const row = screen.getByRole('link')
    expect(row).toHaveAttribute('href', RU_STREAM.raw_url)
    expect(screen.getByText('RU')).toBeInTheDocument()
    expect(screen.getByText('Co-stream')).toBeInTheDocument()
  })

  it('collapses two or more streams behind a count pill and expands on click', () => {
    render(<LiveStreamPicker streams={[EN2_OFFICIAL, RU_STREAM, ES_STREAM]} matchId="ps42" />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    const pill = screen.getByRole('button')
    expect(pill).toHaveTextContent('3 more streams')
    expect(pill).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(pill)
    expect(pill).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(trackEvent).toHaveBeenCalledWith('live_stream_picker_expand', { matchId: 'ps42', count: 3 })

    fireEvent.click(pill)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it('never shows a channel-link marker or deep-link glyph (no VOD-timestamp concept live)', () => {
    render(<LiveStreamPicker streams={[RU_STREAM]} matchId="1" />)
    expect(screen.queryByText(/Channel link/)).not.toBeInTheDocument()
    expect(document.querySelector('svg[viewBox="0 0 12 12"]')).not.toBeInTheDocument()
  })

  it('shows no CO-STREAM badge on official streams', () => {
    render(<LiveStreamPicker streams={[EN2_OFFICIAL]} matchId="1" />)
    expect(screen.queryByText('Co-stream')).not.toBeInTheDocument()
  })

  it('fires live_match_watch with picker + live_series_sheet attribution on row click', () => {
    render(<LiveStreamPicker streams={[RU_STREAM]} matchId="ps7" />)
    fireEvent.click(screen.getByRole('link'))
    expect(trackEvent).toHaveBeenCalledWith('live_match_watch', {
      matchId: 'ps7',
      channel: 'pgl_ru',
      language: 'ru',
      official: false,
      source: 'live_series_sheet',
      from_picker: true,
    })
  })

  it('exposes an accessible label describing language, channel, and live/co-stream state', () => {
    render(<LiveStreamPicker streams={[ES_STREAM]} matchId="1" />)
    expect(screen.getByRole('link')).toHaveAttribute('aria-label', 'Watch live in ES on caster_es, co-stream')
  })
})
