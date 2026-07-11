/**
 * Tests for fetchStoredReplay (src/api.js) — the Supabase-first replay read.
 * Contract: full stored shape { hasRow, main, others } whenever a row exists
 * (the caller decides whether main is a usable start point); null on any failure
 * (404/5xx/bad JSON/timeout) so the caller falls back to the LOCKED KV/Helix
 * resolver.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchStoredReplay } from '../api'

const MAIN = { kind: 'start_point', url: 'https://www.twitch.tv/videos/900?t=1842s', channel: 'pgl_dota2', language: 'en', source: 'twitch', official: true, deep_link: true }
const OTHER_RU = { kind: 'start_point', url: 'https://www.twitch.tv/videos/777?t=50s', channel: 'pgl_ru', language: 'ru', source: 'twitch', official: false, deep_link: true }

function mockFetchOnce({ ok = true, status = 200, json }) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(json),
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('fetchStoredReplay', () => {
  it('returns the full stored shape for a resolved start-point VOD with others', async () => {
    mockFetchOnce({ json: { main: MAIN, others: [OTHER_RU] } })
    const r = await fetchStoredReplay('8123456789')
    expect(r).toEqual({ hasRow: true, main: MAIN, others: [OTHER_RU] })
  })

  it('calls the replay endpoint with the encoded match id and an abort signal', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ main: null }) })
    vi.stubGlobal('fetch', f)
    await fetchStoredReplay('8123')
    expect(f).toHaveBeenCalledWith(
      '/api/pipeline?type=replay&id=8123',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('keeps a replay-without-offset and a stream-page main (caller decides on fallback)', async () => {
    const replayMain = { kind: 'replay', url: 'https://www.twitch.tv/videos/900', channel: 'pgl_dota2' }
    mockFetchOnce({ json: { main: replayMain, others: [] } })
    expect(await fetchStoredReplay('1')).toEqual({ hasRow: true, main: replayMain, others: [] })

    const pageMain = { kind: 'stream_page', url: 'https://www.twitch.tv/pgl_dota2', channel: 'pgl_dota2' }
    mockFetchOnce({ json: { main: pageMain, others: [OTHER_RU] } })
    expect(await fetchStoredReplay('1')).toEqual({ hasRow: true, main: pageMain, others: [OTHER_RU] })
  })

  it('drops a url-less main and filters url-less/null others', async () => {
    mockFetchOnce({ json: { main: { kind: 'stream_page', url: null }, others: [OTHER_RU, { channel: 'x' }, null] } })
    const r = await fetchStoredReplay('1')
    expect(r.hasRow).toBe(true)
    expect(r.main).toBeNull()
    expect(r.others).toEqual([OTHER_RU])
  })

  it('returns null on 404 (no record) and 500 (Supabase error)', async () => {
    mockFetchOnce({ ok: false, status: 404, json: { error: 'not_found' } })
    expect(await fetchStoredReplay('1')).toBe(null)
    mockFetchOnce({ ok: false, status: 500, json: { error: 'boom' } })
    expect(await fetchStoredReplay('1')).toBe(null)
  })

  it('returns null on malformed JSON and non-object bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(new Error('bad json')) }))
    expect(await fetchStoredReplay('1')).toBe(null)
    mockFetchOnce({ json: null })
    expect(await fetchStoredReplay('1')).toBe(null)
  })

  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect(await fetchStoredReplay('1')).toBe(null)
  })

  it('returns null for null/undefined id without fetching', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await fetchStoredReplay(null)).toBe(null)
    expect(await fetchStoredReplay(undefined)).toBe(null)
    expect(f).not.toHaveBeenCalled()
  })

  it('aborts after 2.5s so a hanging Supabase degrades to the KV backup', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    ))
    const pending = fetchStoredReplay('1')
    await vi.advanceTimersByTimeAsync(2600)
    expect(await pending).toBe(null)
  })
})
