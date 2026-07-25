/**
 * Regression tests for the hero-name bug in middleware.js SSR content.
 *
 * Root cause: `/heroes/:slug` (title/meta/JSON-LD) and the "Hero Draft"/"Player Stats"
 * tables on `/match/:slug` used to derive a hero's display name by title-casing its
 * Valve internal key (heroSlugToDisplayName), via a hand-maintained slug→id map
 * (HERO_ID_MAP) that required a manual update whenever a new hero shipped. That
 * naive derivation is wrong for every hero whose internal key predates a later
 * public rename — e.g. "nevermore" -> "Nevermore" (real name: Shadow Fiend),
 * "windrunner" -> "Windrunner" (real name: Windranger), "necrolyte" -> "Necrolyte"
 * (real name: Necrophos) — roughly a third of the roster. The client (src/api.js
 * fetchHeroes()) never had this bug: it always read OpenDota's `localized_name`.
 *
 * The fix replaces the static map with getHeroDataSSR(), which reads the same
 * `localized_name` field from our cached heroes-proxy endpoint, so SSR content
 * matches the client and never regresses to the internal key.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getHeroDataSSR,
  heroSlugToDisplayName,
  handleHeroDetail,
  handleMatch,
  _resetHeroSsrCache,
} from '../middleware.js'

const HEROES_PROXY_FIXTURE = [
  { id: 11, name: 'npc_dota_hero_nevermore', localized_name: 'Shadow Fiend' },
  { id: 1, name: 'npc_dota_hero_antimage', localized_name: 'Anti-Mage' },
  { id: 21, name: 'npc_dota_hero_windrunner', localized_name: 'Windranger' },
  { id: 8, name: 'npc_dota_hero_juggernaut', localized_name: 'Juggernaut' },
]

const INDEX_HTML_FIXTURE = '<!doctype html><html><head><title>old</title></head><body><div id="root"></div></body></html>'

function mockResponse({ ok = true, body = null } = {}) {
  return {
    ok,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

function installFetchMock(routes) {
  global.fetch = vi.fn((input) => {
    const url = typeof input === 'string' ? input : input?.url || String(input)
    for (const [match, respond] of routes) {
      if (url.includes(match)) return Promise.resolve(respond(url))
    }
    return Promise.resolve(mockResponse({ ok: false }))
  })
}

beforeEach(() => {
  _resetHeroSsrCache()
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

describe('getHeroDataSSR', () => {
  it('builds slug/id maps from localized_name, not the internal Valve key', async () => {
    installFetchMock([['mode=heroes-proxy', () => mockResponse({ body: HEROES_PROXY_FIXTURE })]])
    const { bySlug, byId } = await getHeroDataSSR('https://example.com')
    expect(bySlug.nevermore).toEqual({ id: 11, name: 'Shadow Fiend' })
    expect(bySlug.windrunner).toEqual({ id: 21, name: 'Windranger' })
    expect(byId[11]).toEqual({ id: 11, name: 'Shadow Fiend' })
    expect(byId[21].name).toBe('Windranger')
  })

  it('fails open to empty maps when the proxy responds non-ok', async () => {
    installFetchMock([['mode=heroes-proxy', () => mockResponse({ ok: false })]])
    const { bySlug, byId } = await getHeroDataSSR('https://example.com')
    expect(bySlug).toEqual({})
    expect(byId).toEqual({})
  })

  it('fails open to empty maps when the proxy returns a non-array (error shape)', async () => {
    installFetchMock([['mode=heroes-proxy', () => mockResponse({ body: { error: 'rate limited' } })]])
    const { bySlug, byId } = await getHeroDataSSR('https://example.com')
    expect(bySlug).toEqual({})
    expect(byId).toEqual({})
  })

  it('fails open to empty maps when the underlying fetch throws', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network down')))
    const { bySlug, byId } = await getHeroDataSSR('https://example.com')
    expect(bySlug).toEqual({})
    expect(byId).toEqual({})
  })

  // api/tournaments.js's ?mode=heroes-proxy responds 200 + `[]` (not a non-2xx status) whenever
  // OpenDota itself is down or rate-limited — this is the realistic production failure shape,
  // and the one that must NOT be cached: _heroSsrCache has no TTL, so caching an empty result
  // here would silently regress every hero page/match page back to the wrong slug-derived name
  // for as long as the warm instance lives, well after OpenDota recovers.
  it('does not cache a 200-ok-but-empty-array response (the real heroes-proxy failure shape)', async () => {
    installFetchMock([['mode=heroes-proxy', () => mockResponse({ body: [] })]])
    const { bySlug, byId } = await getHeroDataSSR('https://example.com')
    expect(bySlug).toEqual({})
    expect(byId).toEqual({})
  })

  it('retries on the next call after a 200-empty-array response, instead of serving a poisoned cache once OpenDota recovers', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(mockResponse({ body: [] })) // OpenDota down on first attempt
      .mockResolvedValueOnce(mockResponse({ body: HEROES_PROXY_FIXTURE })) // recovered
    global.fetch = fetchSpy

    const first = await getHeroDataSSR('https://example.com')
    expect(first.bySlug).toEqual({})

    const second = await getHeroDataSSR('https://example.com')
    expect(second.bySlug.nevermore).toEqual({ id: 11, name: 'Shadow Fiend' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('caches a successful result so a second call does not refetch', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(mockResponse({ body: HEROES_PROXY_FIXTURE })))
    global.fetch = fetchSpy
    await getHeroDataSSR('https://example.com')
    await getHeroDataSSR('https://example.com')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('heroSlugToDisplayName (fallback only — not the primary name source)', () => {
  it('mismatches the real hero name for legacy-keyed heroes, demonstrating why it is fallback-only', () => {
    expect(heroSlugToDisplayName('nevermore')).toBe('Nevermore') // real name: Shadow Fiend
    expect(heroSlugToDisplayName('windrunner')).toBe('Windrunner') // real name: Windranger
  })

  it('happens to match for heroes whose key already equals the display name', () => {
    expect(heroSlugToDisplayName('juggernaut')).toBe('Juggernaut')
  })
})

describe('handleHeroDetail — /heroes/:slug SSR content', () => {
  it('uses the real localized hero name in title/h1/JSON-LD, not the internal slug', async () => {
    installFetchMock([
      ['mode=heroes-proxy', () => mockResponse({ body: HEROES_PROXY_FIXTURE })],
      ['mode=hero-matches', () => mockResponse({ body: { rows: [] } })],
      ['/index.html', () => mockResponse({ body: INDEX_HTML_FIXTURE })],
    ])
    const url = new URL('https://spectateesports.live/heroes/nevermore')
    const res = await handleHeroDetail(url)
    const html = await res.text()
    expect(html).toContain('Shadow Fiend Pro Matches')
    expect(html).toContain('"name":"Shadow Fiend"')
    expect(html).not.toContain('Nevermore')
  })

  it('falls back to a title-cased slug (without crashing) when the heroes-proxy fetch fails', async () => {
    installFetchMock([
      ['mode=heroes-proxy', () => mockResponse({ ok: false })],
      ['mode=hero-matches', () => mockResponse({ body: { rows: [] } })],
      ['/index.html', () => mockResponse({ body: INDEX_HTML_FIXTURE })],
    ])
    const url = new URL('https://spectateesports.live/heroes/puck')
    const res = await handleHeroDetail(url)
    const html = await res.text()
    expect(html).toContain('Puck Pro Matches')
  })
})

describe('handleMatch — SSR "Hero Draft" / "Player Stats" tables', () => {
  const odMatch = {
    match_id: 123,
    radiant_name: 'Team A',
    dire_name: 'Team B',
    radiant_win: true,
    radiant_score: 30,
    dire_score: 20,
    start_time: 1700000000,
    league: { name: 'Some Premium League', tier: 'premium' },
    picks_bans: [
      { is_pick: true, hero_id: 11, team: 0, order: 0 },
      { is_pick: true, hero_id: 21, team: 1, order: 1 },
    ],
    players: [
      { hero_id: 11, personaname: 'PlayerA', kills: 5, deaths: 1, assists: 3, gold_per_min: 600 },
      { hero_id: 21, personaname: 'PlayerB', kills: 2, deaths: 3, assists: 8, gold_per_min: 400 },
    ],
  }

  it('renders real localized hero names in the draft and player tables', async () => {
    installFetchMock([
      ['mode=heroes-proxy', () => mockResponse({ body: HEROES_PROXY_FIXTURE })],
      ['api.opendota.com/api/matches/', () => mockResponse({ body: odMatch })],
      ['/index.html', () => mockResponse({ body: INDEX_HTML_FIXTURE })],
    ])
    const url = new URL('https://spectateesports.live/match/team-a-vs-team-b-some-league-123')
    const html = await (await handleMatch(url)).text()
    expect(html).toContain('Shadow Fiend')
    expect(html).toContain('Windranger')
    expect(html).not.toContain('Nevermore')
    expect(html).not.toContain('>Windrunner<')
  })

  it('omits a hero name (rather than crashing or printing "undefined") for a hero_id missing from the proxy data', async () => {
    installFetchMock([
      ['mode=heroes-proxy', () => mockResponse({ body: [] })],
      ['api.opendota.com/api/matches/', () => mockResponse({ body: odMatch })],
      ['/index.html', () => mockResponse({ body: INDEX_HTML_FIXTURE })],
    ])
    const url = new URL('https://spectateesports.live/match/team-a-vs-team-b-some-league-123')
    const html = await (await handleMatch(url)).text()
    expect(html).not.toContain('undefined')
  })
})
