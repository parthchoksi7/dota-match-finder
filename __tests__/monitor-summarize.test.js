/**
 * Coverage for the monitor's error aggregation (pending-refactors #37).
 *
 * `handleMonitor` computes `critical`, which drives .github/workflows/log-monitor.yml opening a
 * GitHub [Alert] issue every 2h — so an untested boolean here can wake a human up. The parsing,
 * the 2h/24h windowing and the critical rule were all unexercised until this file; they were
 * extracted into the pure `summarizeErrors`/`parseMonitorEntry` (_shared.js) the same way
 * `summarizePsQuota` was, specifically so they could be covered.
 */
import { describe, it, expect } from 'vitest'
import { summarizeErrors, parseMonitorEntry } from '../api/_shared.js'

const NOW = Date.UTC(2026, 7, 20, 12, 0, 0)
const minsAgo = (m) => NOW - m * 60 * 1000
const err = (over = {}) => ({ endpoint: '/api/live-matches', statusCode: 500, detail: 'boom', ts: minsAgo(5), ...over })

describe('parseMonitorEntry — both Upstash shapes', () => {
  it('accepts an already-deserialized object', () => {
    expect(parseMonitorEntry(err())?.endpoint).toBe('/api/live-matches')
  })

  it('accepts the raw JSON string form', () => {
    expect(parseMonitorEntry(JSON.stringify(err()))?.endpoint).toBe('/api/live-matches')
  })

  it('produces the same result from both shapes', () => {
    const e = err()
    expect(parseMonitorEntry(JSON.stringify(e))).toEqual(parseMonitorEntry(e))
  })

  it('coerces a stringified ts to a number so windowing compares numerically', () => {
    // A string ts would make `ts > cutoff` a lexicographic comparison and silently drop entries.
    expect(parseMonitorEntry({ ...err(), ts: String(minsAgo(5)) })?.ts).toBe(minsAgo(5))
  })

  it('rejects unusable input rather than returning a half-populated entry', () => {
    for (const bad of [null, undefined, '', 'not json', '[]', [], 42, { endpoint: '/x' }, { ...err(), ts: 'nope' }]) {
      expect(parseMonitorEntry(bad)).toBeNull()
    }
  })

  it('does not stamp a NaN statusCode onto ps_quota samples', () => {
    // parseMonitorEntry parses BOTH rings; quota samples have no statusCode.
    const sample = { remaining: 12, source: 'live-matches:public', ts: minsAgo(3) }
    expect(parseMonitorEntry(sample)).toEqual(sample)
  })
})

describe('summarizeErrors — windowing', () => {
  it('counts only the last 2h as recent, and the last 24h as daily', () => {
    const r = summarizeErrors([
      err({ ts: minsAgo(30) }),
      err({ ts: minsAgo(119) }),
      err({ ts: minsAgo(121) }),      // outside 2h, inside 24h
      err({ ts: minsAgo(60 * 23) }),  // inside 24h
      err({ ts: minsAgo(60 * 25) }),  // outside both
    ], NOW)
    expect(r.recentCount).toBe(2)
    expect(r.dailyCount).toBe(4)
  })

  it('returns an empty, non-critical summary for an empty ring', () => {
    const r = summarizeErrors([], NOW)
    expect(r).toMatchObject({ recentCount: 0, dailyCount: 0, byEndpoint: {}, criticalEndpoint: null })
  })

  it('tolerates a ring containing unparseable members', () => {
    const r = summarizeErrors([err(), 'garbage', null, JSON.stringify(err())], NOW)
    expect(r.recentCount).toBe(2)
  })

  it('sorts recent errors newest-first for the report', () => {
    const r = summarizeErrors([err({ ts: minsAgo(90) }), err({ ts: minsAgo(5) }), err({ ts: minsAgo(45) })], NOW)
    expect(r.recent.map(e => e.ts)).toEqual([minsAgo(5), minsAgo(45), minsAgo(90)])
  })
})

describe('summarizeErrors — critical truth table', () => {
  const many = (n, over = {}) => Array.from({ length: n }, () => err(over))

  it('is not critical below 3 user-visible errors on one endpoint', () => {
    expect(summarizeErrors(many(2), NOW).criticalEndpoint).toBeNull()
  })

  it('is critical at exactly 3 user-visible errors on one endpoint', () => {
    expect(summarizeErrors(many(3), NOW).criticalEndpoint?.[0]).toBe('/api/live-matches')
  })

  it('does not aggregate across different endpoints to reach the threshold', () => {
    const r = summarizeErrors([
      ...many(2, { endpoint: '/api/live-matches' }),
      ...many(2, { endpoint: '/api/upcoming-matches' }),
    ], NOW)
    expect(r.criticalEndpoint).toBeNull()
    expect(r.byEndpoint).toEqual({ '/api/live-matches': 2, '/api/upcoming-matches': 2 })
  })

  it('does not count errors older than the 2h window toward critical', () => {
    expect(summarizeErrors(many(3, { ts: minsAgo(180) }), NOW).criticalEndpoint).toBeNull()
  })

  it('counts 502 as user-visible', () => {
    expect(summarizeErrors(many(3, { statusCode: 502 }), NOW).criticalEndpoint).not.toBeNull()
  })
})

describe('summarizeErrors — absorbed failures must not page a human', () => {
  const absorbed = (n) => Array.from({ length: n }, () => err({
    statusCode: 200,
    detail: 'absorbed, served last-known-good: PandaScore error: 429',
  }))

  it('never marks an endpoint critical on absorbed (200) failures alone', () => {
    // The whole point of #34: the visitor got a usable feed, so this is not an incident.
    expect(summarizeErrors(absorbed(50), NOW).criticalEndpoint).toBeNull()
  })

  it('still surfaces absorbed failures in byEndpoint for diagnosis', () => {
    const r = summarizeErrors(absorbed(5), NOW)
    expect(r.byEndpoint['/api/live-matches']).toBe(5)
    expect(r.userVisibleByEndpoint['/api/live-matches']).toBeUndefined()
    expect(r.recentCount).toBe(5)
  })

  it('still pages when real 5xx cross the threshold alongside absorbed ones', () => {
    const r = summarizeErrors([...absorbed(20), ...Array.from({ length: 3 }, () => err())], NOW)
    expect(r.criticalEndpoint?.[0]).toBe('/api/live-matches')
  })

  it('does not let a 4xx reach the critical threshold', () => {
    const r = summarizeErrors(Array.from({ length: 9 }, () => err({ statusCode: 400 })), NOW)
    expect(r.criticalEndpoint).toBeNull()
  })
})
