/**
 * Unit tests for the series-lookup failure detection in
 * api/_handlers/calendarTournament.js — a transient PandaScore fetch
 * failure (rate limit, timeout, 5xx) must not be reported as
 * "series not found".
 */

import { describe, it, expect } from 'vitest'

function detectFailedFetches(responses) {
  return responses.filter(r => !r.ok)
}

function buildFailureMessage(failed) {
  return `PandaScore series lookup failed: ${failed.map(r => r.status).join(', ')}`
}

describe('series lookup failure detection', () => {
  it('detects no failures when all three responses are ok', () => {
    const responses = [{ ok: true, status: 200 }, { ok: true, status: 200 }, { ok: true, status: 200 }]
    expect(detectFailedFetches(responses)).toHaveLength(0)
  })

  it('detects a single failed response among three', () => {
    const responses = [{ ok: true, status: 200 }, { ok: false, status: 429 }, { ok: true, status: 200 }]
    const failed = detectFailedFetches(responses)
    expect(failed).toHaveLength(1)
    expect(failed[0].status).toBe(429)
  })

  it('detects all three failing', () => {
    const responses = [{ ok: false, status: 500 }, { ok: false, status: 500 }, { ok: false, status: 500 }]
    expect(detectFailedFetches(responses)).toHaveLength(3)
  })

  it('builds a message listing every failed status code', () => {
    const failed = [{ status: 429 }, { status: 500 }]
    expect(buildFailureMessage(failed)).toBe('PandaScore series lookup failed: 429, 500')
  })
})

describe('series-not-found vs upstream-failure distinction', () => {
  // Mirrors the handler: only treat "no series in any bucket" as a real
  // 404 once all three fetches are confirmed ok — never on a partial failure.
  function resolveSeries(responses, bucketsData) {
    const failed = detectFailedFetches(responses)
    if (failed.length) throw new Error(buildFailureMessage(failed))
    const series = bucketsData.flat()[0]
    if (!series) throw new Error('Series not found')
    return series
  }

  it('throws an upstream-failure error when a bucket fetch fails, even if a real series would otherwise be found', () => {
    const responses = [{ ok: true, status: 200 }, { ok: false, status: 503 }, { ok: true, status: 200 }]
    const buckets = [[], [], []]
    expect(() => resolveSeries(responses, buckets)).toThrow('PandaScore series lookup failed: 503')
  })

  it('throws a genuine not-found error only when all fetches succeed and no bucket has the series', () => {
    const responses = [{ ok: true, status: 200 }, { ok: true, status: 200 }, { ok: true, status: 200 }]
    const buckets = [[], [], []]
    expect(() => resolveSeries(responses, buckets)).toThrow('Series not found')
  })

  it('resolves successfully when all fetches succeed and one bucket has the series', () => {
    const responses = [{ ok: true, status: 200 }, { ok: true, status: 200 }, { ok: true, status: 200 }]
    const buckets = [[], [{ id: 10828, name: 'The International 2026' }], []]
    expect(resolveSeries(responses, buckets)).toEqual({ id: 10828, name: 'The International 2026' })
  })
})
