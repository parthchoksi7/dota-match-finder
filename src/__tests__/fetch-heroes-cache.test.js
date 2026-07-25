/**
 * Regression tests for a cache-poisoning bug in fetchHeroes() (src/api.js).
 *
 * `/api/tournaments?mode=heroes-proxy` fails open with an HTTP 200 + `[]` body whenever
 * OpenDota itself is down, rate-limited, or times out (api/tournaments.js) — indistinguishable
 * from a real "zero heroes" response. fetchHeroes() used to treat that `[]` as trustworthy
 * data: it built an empty `{}` map and cached it both in-memory (heroCache) and in
 * localStorage with a fresh timestamp (24h TTL). Every consumer (DraftDisplay, PlayerStatsSection,
 * TournamentHub, HeroIcon, ...) falls back to `Hero {id}` text and a null heroKey (blank
 * placeholder box) when a hero isn't in the map — so this silently broke every hero name and
 * icon across the entire site for 24 real hours per browser, self-inflicted by a single
 * transient OpenDota hiccup, long after OpenDota recovered.
 *
 * The fix: only cache a non-empty map, in both the in-memory and localStorage layers, and
 * ignore a previously-poisoned empty localStorage entry even if it's still within its TTL.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchHeroes, _resetHeroCacheForTests } from '../api.js'
import { STORAGE_KEYS } from '../utils.js'

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body }
}

const REAL_HEROES = [
  { id: 1, name: 'npc_dota_hero_antimage', localized_name: 'Anti-Mage' },
  { id: 8, name: 'npc_dota_hero_juggernaut', localized_name: 'Juggernaut' },
]

beforeEach(() => {
  _resetHeroCacheForTests()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('fetchHeroes', () => {
  it('caches a successful non-empty response in-memory and in localStorage', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(REAL_HEROES)))
    const heroes = await fetchHeroes()
    expect(heroes[1]).toEqual({ name: 'Anti-Mage', key: 'antimage' })

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.HEROES))
    expect(stored.data[1]).toEqual({ name: 'Anti-Mage', key: 'antimage' })

    // A second call must not hit the network again — served from the in-memory cache.
    await fetchHeroes()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not poison the cache when the heroes-proxy fails open with an empty array', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse([])))
    const heroes = await fetchHeroes()
    expect(heroes).toEqual({})
    expect(localStorage.getItem(STORAGE_KEYS.HEROES)).toBeNull()
  })

  it('retries the network on the next call after an empty-array failure, instead of reusing a poisoned result', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse([])) // OpenDota down on first attempt
      .mockResolvedValueOnce(jsonResponse(REAL_HEROES)) // recovered by the second attempt

    const first = await fetchHeroes()
    expect(first).toEqual({})

    const second = await fetchHeroes()
    expect(second[8]).toEqual({ name: 'Juggernaut', key: 'juggernaut' })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('ignores a pre-existing poisoned empty localStorage entry even though it is within the 24h TTL', async () => {
    localStorage.setItem(STORAGE_KEYS.HEROES, JSON.stringify({ ts: Date.now(), data: {} }))
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(REAL_HEROES)))

    const heroes = await fetchHeroes()
    expect(heroes[1]).toEqual({ name: 'Anti-Mage', key: 'antimage' })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('uses a valid, non-empty localStorage entry within the TTL without hitting the network', async () => {
    localStorage.setItem(
      STORAGE_KEYS.HEROES,
      JSON.stringify({ ts: Date.now(), data: { 1: { name: 'Anti-Mage', key: 'antimage' } } })
    )
    global.fetch = vi.fn()

    const heroes = await fetchHeroes()
    expect(heroes[1]).toEqual({ name: 'Anti-Mage', key: 'antimage' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('dedupes concurrent cold-cache callers into a single network request', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(REAL_HEROES)))
    const [a, b] = await Promise.all([fetchHeroes(), fetchHeroes()])
    expect(a).toBe(b)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
