/**
 * Cache-Control contract for /api/og (2026-08-12, Fluid Active CPU).
 *
 * Why this is worth a test: rasterising one card costs ~600-860ms of ACTIVE CPU (satori layout +
 * resvg), measured with process.cpuUsage around the real handler — 75-100x a normal JSON handler
 * in this repo. That made /api/og the single largest CPU consumer while sitting near the BOTTOM of
 * the invocation-count charts, which is exactly why three earlier rounds of invocation-count tuning
 * missed it. The TTL is the whole mitigation, it is invisible in the rendered PNG, and nothing else
 * in the suite would fail if someone shortened it back.
 *
 * The correctness line these assertions defend: cache forever ONLY where the response is a pure
 * function of its URL. The one case that is not — a match OpenDota has not indexed yet, which
 * renders a generic placeholder — must stay short, or the placeholder gets pinned onto a match that
 * gets indexed minutes later.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ONE_YEAR = 31536000

function mockRes() {
  const res = { headers: {} }
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.status = () => res
  res.json = () => res
  res.end = (body) => { res.body = body; return res }
  return res
}

let handler
beforeEach(async () => {
  handler = (await import('../api/og.js')).default
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function cc(res) { return res.headers['Cache-Control'] || '' }

describe('/api/og cache headers', () => {
  it('caches the series card immutably — every input comes from the query string', async () => {
    const res = mockRes()
    await handler({ url: '/api/og?mode=series&team1=A&team2=B&winner=A&score=2-1&tournament=TI' }, res)
    expect(cc(res)).toContain('immutable')
    expect(cc(res)).toContain(`s-maxage=${ONE_YEAR}`)
  })

  it('caches the article card immutably — title/category/date are query params only', async () => {
    const res = mockRes()
    await handler({ url: '/api/og?mode=article&title=Hello&category=GUIDE&date=Aug+12' }, res)
    expect(cc(res)).toContain('immutable')
  })

  it('caches the no-matchId branding card immutably — it renders the same fixed artwork every time', async () => {
    const res = mockRes()
    await handler({ url: '/api/og' }, res)
    expect(cc(res)).toContain('immutable')
  })

  it('caches the article TTL at the full year, not merely "some" immutable value', async () => {
    const res = mockRes()
    await handler({ url: '/api/og?mode=article&title=Hello' }, res)
    expect(cc(res)).toContain(`s-maxage=${ONE_YEAR}`)
  })

  it('keeps the BROWSER copy far shorter than the CDN copy — the CPU win is CDN-side, and a browser copy is the one layer no purge can reach', async () => {
    const res = mockRes()
    await handler({ url: '/api/og?mode=series&team1=A&team2=B' }, res)
    expect(cc(res)).toContain('max-age=86400')
    expect(cc(res)).toContain(`s-maxage=${ONE_YEAR}`)
  })

  it('caches a fully-populated match for a long but FINITE time, never immutable — the URL carries only matchId while team/league names echo OpenDota tables that do get renamed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        match_id: 123, radiant_name: 'A', dire_name: 'B', radiant_win: true,
        radiant_score: 30, dire_score: 12, duration: 2100, start_time: 1786000000,
        league: { name: 'TI 2026' }, series_type: 1,
      }),
    }))
    const res = mockRes()
    await handler({ url: '/api/og?matchId=123' }, res)
    expect(cc(res)).not.toContain('immutable')
    expect(cc(res)).toContain('s-maxage=2592000')
  })

  it('does NOT cache a match row whose team names have not been joined yet — OpenDota creates the row before resolving teams, and that window is exactly when a just-finished game gets shared', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ match_id: 123, radiant_win: true, duration: 2100 }),
    }))
    const res = mockRes()
    await handler({ url: '/api/og?matchId=123' }, res)
    expect(cc(res)).toContain('s-maxage=300')
  })

  it('does NOT cache long when radiant_win is absent — false is a valid result, so a missing value would render the WRONG winner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ match_id: 123, radiant_name: 'A', dire_name: 'B', radiant_win: null }),
    }))
    const res = mockRes()
    await handler({ url: '/api/og?matchId=123' }, res)
    expect(cc(res)).toContain('s-maxage=300')
  })

  it('does NOT cache long on a non-OK OpenDota response — it rate-limits, and a 429 body parses as JSON perfectly well', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 429,
      json: async () => ({ error: 'rate limit exceeded' }),
    }))
    const res = mockRes()
    await handler({ url: '/api/og?matchId=123' }, res)
    expect(cc(res)).not.toContain('immutable')
    expect(cc(res)).toContain('s-maxage=300')
  })

  it('does NOT cache an UNRESOLVED match long — that render is a placeholder, and pinning it would outlive the indexing that replaces it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    const res = mockRes()
    await handler({ url: '/api/og?matchId=999999' }, res)
    expect(cc(res)).not.toContain('immutable')
    expect(cc(res)).toContain('s-maxage=300')
  })

  it('does NOT cache long when the OpenDota lookup throws, for the same reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const res = mockRes()
    await handler({ url: '/api/og?matchId=999999' }, res)
    expect(cc(res)).not.toContain('immutable')
    expect(cc(res)).toContain('s-maxage=300')
  })
})
