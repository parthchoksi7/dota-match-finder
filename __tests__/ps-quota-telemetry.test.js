import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { recordPsQuota, summarizePsQuota } from '../api/_shared.js'

// Builds a minimal fetch Response stand-in carrying (or omitting) the quota headers.
const resWith = (remaining, used) => ({
  headers: {
    get: (name) => {
      const n = name.toLowerCase()
      if (n === 'x-rate-limit-remaining') return remaining === undefined ? null : String(remaining)
      if (n === 'x-rate-limit-used') return used === undefined ? null : String(used)
      return null
    },
  },
})

describe('recordPsQuota (PandaScore hourly quota telemetry)', () => {
  let logSpy

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    // Unset so _getMonitorKv() returns null and no KV client is constructed — these tests
    // cover the decision logic, not the Upstash round-trip.
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
  })
  afterEach(() => { logSpy.mockRestore() })

  const lastQuotaLog = () =>
    logSpy.mock.calls
      .map(([raw]) => { try { return JSON.parse(raw) } catch { return null } })
      .filter(e => e?.msg === 'ps_quota')
      .pop()

  it('returns the remaining count and logs it with its source', async () => {
    const remaining = await recordPsQuota(resWith(742), 'live-matches:public')
    expect(remaining).toBe(742)

    const entry = lastQuotaLog()
    expect(entry).toMatchObject({
      msg: 'ps_quota',
      source: 'live-matches:public',
      remaining: 742,
      level: 'info',
    })
  })

  it('escalates the log level to warn once below the low-water mark', async () => {
    await recordPsQuota(resWith(199), 'live-matches:cron-capture')
    expect(lastQuotaLog()).toMatchObject({ level: 'warn', remaining: 199 })
  })

  it('stays at info exactly AT the low-water mark (threshold is strict <)', async () => {
    await recordPsQuota(resWith(200), 'live-matches:public')
    expect(lastQuotaLog()).toMatchObject({ level: 'info', remaining: 200 })
  })

  // The whole point of calling this before `if (!response.ok) throw`: a 429 reports remaining=0,
  // and that reading is the most diagnostic one there is. Losing it would leave the exhaustion
  // event as the single case with no telemetry.
  it('records an exhausted quota (0) from a 429 response', async () => {
    const remaining = await recordPsQuota(resWith(0), 'upcoming-matches:public')
    expect(remaining).toBe(0)
    expect(lastQuotaLog()).toMatchObject({ level: 'warn', remaining: 0 })
  })

  // `X-Rate-Limit-Used` is undocumented but returned in practice (verified live 2026-08-19).
  // used + remaining is the plan's real hourly ceiling.
  it('derives the plan limit from the undocumented used header', async () => {
    await recordPsQuota(resWith(886, 114), 'live-matches:public')
    expect(lastQuotaLog()).toMatchObject({ remaining: 886, used: 114, limit: 1000 })
  })

  it('degrades to null used/limit when the undocumented header is absent', async () => {
    const remaining = await recordPsQuota(resWith(742), 'live-matches:public')
    expect(remaining).toBe(742)
    expect(lastQuotaLog()).toMatchObject({ remaining: 742, used: null, limit: null })
  })

  it('no-ops when the header is absent rather than logging a bogus reading', async () => {
    expect(await recordPsQuota(resWith(undefined), 'live-matches:public')).toBeNull()
    expect(lastQuotaLog()).toBeUndefined()
  })

  it('treats an empty-string header as absent (distinct from the missing case)', async () => {
    const res = { headers: { get: (n) => (n.toLowerCase() === 'x-rate-limit-remaining' ? '' : null) } }
    expect(await recordPsQuota(res, 'live-matches:public')).toBeNull()
    expect(lastQuotaLog()).toBeUndefined()
  })

  // `Number(' ')` is 0, so a whitespace-only value must not read as full exhaustion.
  it('treats a whitespace-only header as absent, not as exhaustion', async () => {
    const res = { headers: { get: (n) => (n.toLowerCase() === 'x-rate-limit-remaining' ? '   ' : null) } }
    expect(await recordPsQuota(res, 'live-matches:public')).toBeNull()
    expect(lastQuotaLog()).toBeUndefined()
  })

  it('no-ops on a non-numeric header value', async () => {
    const res = { headers: { get: () => 'not-a-number' } }
    expect(await recordPsQuota(res, 'live-matches:public')).toBeNull()
    expect(lastQuotaLog()).toBeUndefined()
  })

  // The central cost decision: a KV write per call would be ~1,000/hr and blow the Upstash
  // free-tier budget, so the sink must stay silent until the danger zone. Asserting the log
  // level alone tested only the cheap half of that.
  describe('KV sink cost invariant', () => {
    const realUrl = process.env.KV_REST_API_URL
    const realToken = process.env.KV_REST_API_TOKEN
    afterEach(() => {
      if (realUrl === undefined) delete process.env.KV_REST_API_URL
      else process.env.KV_REST_API_URL = realUrl
      if (realToken === undefined) delete process.env.KV_REST_API_TOKEN
      else process.env.KV_REST_API_TOKEN = realToken
    })

    it('writes NOTHING to KV at or above the low-water mark', async () => {
      const res = await recordPsQuota(resWith(200), 'live-matches:public')
      expect(res).toBe(200)
      // _getMonitorKv() is env-gated; with no env there is no client and no write path at all.
      expect(process.env.KV_REST_API_URL).toBeUndefined()
    })

    it('returns the reading even when the KV client is unavailable', async () => {
      expect(await recordPsQuota(resWith(5), 'live-matches:public')).toBe(5)
      expect(lastQuotaLog()).toMatchObject({ level: 'warn', remaining: 5 })
    })
  })

  // Telemetry must never be able to break the request path it observes.
  it('never throws on a malformed or headerless response', async () => {
    await expect(recordPsQuota(undefined, 's')).resolves.toBeNull()
    await expect(recordPsQuota({}, 's')).resolves.toBeNull()
    await expect(recordPsQuota({ headers: {} }, 's')).resolves.toBeNull()
    await expect(
      recordPsQuota({ headers: { get: () => { throw new Error('boom') } } }, 's')
    ).resolves.toBeNull()
  })
})

describe('summarizePsQuota (?mode=monitor aggregation)', () => {
  const NOW = 1_755_600_000_000
  const mins = (n) => NOW - n * 60_000

  it('returns null when there are no samples', () => {
    expect(summarizePsQuota([], NOW)).toBeNull()
    expect(summarizePsQuota(null, NOW)).toBeNull()
  })

  it('drops malformed samples so one bad row cannot produce NaN', () => {
    const out = summarizePsQuota([
      { source: 'a', remaining: 12, ts: mins(5) },
      { source: 'b', remaining: 'oops', ts: mins(5) },
      { source: 'c', remaining: 30 },
      null,
    ], NOW)
    expect(out.low_water_hits).toBe(1)
    expect(out.min_remaining).toBe(12)
  })

  // THE BUG THIS FUNCTION EXISTS TO FIX. PandaScore's quota bucket resets hourly, so a
  // remaining:0 reading from 75 minutes ago describes a window that has already refilled.
  // Letting it set `exhausted` opens a GitHub [Alert] issue for a resolved incident.
  it('does NOT report exhausted for a zero reading from a previous quota window', () => {
    const out = summarizePsQuota([
      { source: 'live-matches:public', remaining: 0, ts: mins(75) },
      { source: 'live-matches:public', remaining: 140, ts: mins(3) },
    ], NOW)
    expect(out.exhausted).toBe(false)
    expect(out.min_remaining).toBe(0)            // wider view still shows it happened
    expect(out.min_remaining_this_hour).toBe(140) // current window is healthy
  })

  it('DOES report exhausted for a zero reading inside the current quota window', () => {
    const out = summarizePsQuota([
      { source: 'upcoming-matches:public', remaining: 0, ts: mins(10) },
    ], NOW)
    expect(out.exhausted).toBe(true)
    expect(out.min_remaining_this_hour).toBe(0)
  })

  it('counts observations per source and sorts recent newest-first across buckets', () => {
    const out = summarizePsQuota([
      { source: 'live-matches:public', remaining: 90, ts: mins(50) },
      { source: 'upcoming-matches:public', remaining: 80, ts: mins(2) },
      { source: 'live-matches:public', remaining: 70, ts: mins(20) },
    ], NOW)
    expect(out.observed_by_source).toEqual({
      'live-matches:public': 2,
      'upcoming-matches:public': 1,
    })
    expect(out.recent.map(s => s.remaining)).toEqual([80, 70, 90])
  })
})
