/**
 * Unit tests for fetchReplayStatus in src/api.js — the client side of the "Has VOD" search
 * filter (pending-refactors #16). Covers: the session cache (both hits AND misses are cached,
 * so re-toggling never re-requests), chunking above the 200-id cap, id-string coercion, and
 * failure propagating as a thrown error (the caller reverts the filter on catch rather than
 * silently under-filtering).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchReplayStatus, _resetReplayStatusCacheForTests } from '../src/api.js'

describe('fetchReplayStatus', () => {
  const realFetch = global.fetch
  let fetchMock

  beforeEach(() => {
    _resetReplayStatusCacheForTests()
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })
  afterEach(() => { global.fetch = realFetch })

  it('returns a Map keyed by the requested ids, true only for available ones', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ available: [1, 3] }) })
    const result = await fetchReplayStatus(['1', '2', '3'])
    expect(result).toEqual(new Map([['1', true], ['2', false], ['3', true]]))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/pipeline?type=replay-status&ids=1,2,3')
  })

  it('caches both hits and misses — a second call for the same ids makes no request', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ available: [1] }) })
    await fetchReplayStatus(['1', '2'])
    fetchMock.mockClear()

    const result = await fetchReplayStatus(['1', '2'])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual(new Map([['1', true], ['2', false]]))
  })

  it('only requests the delta when some ids are already cached', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ available: [1] }) })
    await fetchReplayStatus(['1'])
    fetchMock.mockClear()

    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ available: [2] }) })
    const result = await fetchReplayStatus(['1', '2'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/pipeline?type=replay-status&ids=2')
    expect(result).toEqual(new Map([['1', true], ['2', true]]))
  })

  it('dedupes ids within a single call', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ available: [] }) })
    await fetchReplayStatus(['5', '5', '5'])
    expect(fetchMock).toHaveBeenCalledWith('/api/pipeline?type=replay-status&ids=5')
  })

  it('drops non-numeric ids rather than sending them', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ available: [1] }) })
    const result = await fetchReplayStatus(['1', 'abc; drop table', ''])
    expect(fetchMock).toHaveBeenCalledWith('/api/pipeline?type=replay-status&ids=1')
    expect(result).toEqual(new Map([['1', true]]))
  })

  it('chunks requests above the 200-id server cap', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ available: [] }) })
    const ids = Array.from({ length: 250 }, (_, i) => String(i + 1))
    await fetchReplayStatus(ids)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws on a non-ok response so the caller can revert the filter', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(fetchReplayStatus(['1'])).rejects.toThrow('replay-status failed: 500')
  })

  it('returns an empty Map for an empty input without calling fetch', async () => {
    const result = await fetchReplayStatus([])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual(new Map())
  })
})
