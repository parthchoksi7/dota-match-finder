/**
 * Tests for getMatchData() in api/summarize.js — the server-side OpenDota match fetch that
 * replaced the browser-side fetch in fetchMatchSummary() (src/api.js). Same failure class as the
 * fetchHeroes() CORS/bot-protection break fixed by ?mode=heroes-proxy: OpenDota's Cloudflare bot
 * protection can 403 direct browser requests and drop the CORS header, which browsers report as a
 * CORS failure rather than the underlying 403 — moving the fetch server-to-server avoids that
 * entirely. Mirrors getHeroNames()'s fail-open shape: any error returns null, never throws.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getMatchData } from '../api/summarize.js'

function mockLog() {
  return { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}

describe('getMatchData', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('returns the parsed match object on a successful fetch', async () => {
    const matchData = { match_id: 123, radiant_name: 'Vici Gaming', dire_name: 'Team Yandex' }
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => matchData }))

    const result = await getMatchData('123', mockLog())
    expect(result).toEqual(matchData)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.opendota.com/api/matches/123',
      expect.objectContaining({ signal: expect.anything() })
    )
  })

  it('returns null and does NOT call .json() when OpenDota responds non-2xx', async () => {
    const jsonSpy = vi.fn()
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: jsonSpy }))

    const log = mockLog()
    const result = await getMatchData('999999999', log)
    expect(result).toBeNull()
    expect(jsonSpy).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith('OpenDota match fetch failed', { matchId: '999999999', status: 404 })
  })

  it('returns null (never throws) when fetch itself rejects (network error / abort)', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network down')))

    const log = mockLog()
    const result = await getMatchData('123', log)
    expect(result).toBeNull()
    expect(log.warn).toHaveBeenCalledWith('OpenDota match fetch threw', { matchId: '123', error: 'network down' })
  })

  it('returns null when the response body is not valid JSON', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => { throw new Error('bad json') } }))

    const result = await getMatchData('123', mockLog())
    expect(result).toBeNull()
  })
})
