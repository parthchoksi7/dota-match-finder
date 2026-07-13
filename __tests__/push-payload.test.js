import { describe, it, expect } from 'vitest'

// Import-safety: live-matches.js constructs an Upstash client at module load and reads dotenv.
// Mock both so importing the pure helpers doesn't require real credentials (mirrors
// push-subscribe.test.js).
import { vi } from 'vitest'
vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() {} } }))

import { buildPushPayload, normalizePrefs, inQuietHours } from '../api/live-matches.js'

// A completed BO3 result — used to prove no score/winner leaks into any payload.
const RESULT_MATCH = {
  id: 998877,
  teamA: 'Team Falcons',
  teamB: 'Tundra Esports',
  tournament: 'Esports World Cup 2026',
  bracketRound: 'Grand Final',
  seriesLabel: 'BO3',
  seriesScore: '2-1',
  games: [{ position: 1, winnerName: 'Team Falcons' }, { position: 2, winnerName: 'Tundra Esports' }],
}

describe('buildPushPayload', () => {
  it('soon: heads-up copy, deep-links to homepage highlight with push attribution, no score', () => {
    const p = buildPushPayload('soon', RESULT_MATCH)
    expect(p.title).toBe('Team Falcons vs Tundra Esports starts soon')
    expect(p.body).toContain('catch the draft')
    expect(p.body).toContain('Grand Final') // stakes from bracketRound
    expect(p.url).toBe('/?m=998877&from=push&pt=soon')
    expect(p.tag).toBe('soon-998877')
  })

  it('live: watch-now copy, deep-links to homepage highlight with push attribution', () => {
    const p = buildPushPayload('live', RESULT_MATCH)
    expect(p.title).toBe('Team Falcons vs Tundra Esports is live')
    expect(p.url).toBe('/?m=998877&from=push&pt=live')
  })

  it('replay: links to the completed-match page with spoilers off; opts.matchId wins', () => {
    const p = buildPushPayload('replay', RESULT_MATCH, { matchId: 8123456789 })
    expect(p.title).toContain('replay is up')
    expect(p.title).not.toContain('—') // no em dashes in user-facing copy
    expect(p.title).not.toMatch(/\d+\s*-\s*\d+/) // never leak a score into the title
    expect(p.url).toBe('/match/8123456789?spoilers=off&from=push&pt=replay')
    // Falls back to the series id when no OD match id is supplied.
    expect(buildPushPayload('replay', RESULT_MATCH).url).toBe('/match/998877?spoilers=off&from=push&pt=replay')
  })

  it('falls back to tournament, then "Pro match", for stakes', () => {
    expect(buildPushPayload('soon', { ...RESULT_MATCH, bracketRound: null }).body).toContain('Esports World Cup 2026')
    expect(buildPushPayload('soon', { ...RESULT_MATCH, bracketRound: null, tournament: null }).body).toContain('Pro match')
  })

  it('SPOILER-SAFE: no payload leaks the series score or a lone winner', () => {
    for (const type of ['soon', 'live', 'replay']) {
      const p = buildPushPayload(type, RESULT_MATCH)
      const text = `${p.title} ${p.body}`
      expect(text).not.toContain('2-1')
      // both team names appear together as a matchup (fine); neither should appear as a result
      expect(text).not.toMatch(/wins|won|beat|defeat|victor/i)
    }
  })
})

describe('normalizePrefs', () => {
  it('null/undefined → permissive defaults (all types on, no quiet hours)', () => {
    const p = normalizePrefs(null)
    expect(p).toEqual({ tz: null, types: { soon: true, live: true, replay: true }, quietStart: null, quietEnd: null })
  })

  it('parses a JSON-string value', () => {
    const p = normalizePrefs(JSON.stringify({ tz: 'America/New_York', types: { live: false } }))
    expect(p.tz).toBe('America/New_York')
    expect(p.types.live).toBe(false)
    expect(p.types.soon).toBe(true)
  })

  it('only explicit false disables a type; non-integer quiet hours → null', () => {
    const p = normalizePrefs({ types: { soon: false, replay: true }, quietStart: '9', quietEnd: 8 })
    expect(p.types).toEqual({ soon: false, live: true, replay: true })
    expect(p.quietStart).toBe(null) // '9' is not an integer
    expect(p.quietEnd).toBe(8)
  })
})

describe('inQuietHours', () => {
  const at = (h) => Date.UTC(2026, 0, 1, h, 0, 0) // hour h UTC on 2026-01-01

  it('no tz → never suppresses (send rather than silently drop)', () => {
    expect(inQuietHours(normalizePrefs({ quietStart: 0, quietEnd: 23 }), at(3))).toBe(false)
  })

  it('wrapping window 23→08 suppresses overnight, not midday', () => {
    const prefs = normalizePrefs({ tz: 'UTC', quietStart: 23, quietEnd: 8 })
    expect(inQuietHours(prefs, at(2))).toBe(true)
    expect(inQuietHours(prefs, at(23))).toBe(true)
    expect(inQuietHours(prefs, at(12))).toBe(false)
    expect(inQuietHours(prefs, at(8))).toBe(false) // end is exclusive
  })

  it('non-wrapping window 09→17 suppresses only within the day', () => {
    const prefs = normalizePrefs({ tz: 'UTC', quietStart: 9, quietEnd: 17 })
    expect(inQuietHours(prefs, at(12))).toBe(true)
    expect(inQuietHours(prefs, at(20))).toBe(false)
  })

  it('start === end → disabled (never suppress)', () => {
    expect(inQuietHours(normalizePrefs({ tz: 'UTC', quietStart: 8, quietEnd: 8 }), at(8))).toBe(false)
  })
})
