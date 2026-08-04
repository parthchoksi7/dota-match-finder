import { createHmac } from 'crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('../api/_shared.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, isTier1: () => false, isTier1ByName: () => false }
})
// live-matches.js still imports the KV client for the unrelated stream-cache paths this file
// doesn't exercise — mock it out for import safety only (mirrors push-payload.test.js).
vi.mock('@upstash/redis', () => ({ Redis: class { constructor() {} } }))

// In-memory push_subscriptions table. Keyed by user_id (the schema's UNIQUE column), matching
// the real onConflict:'user_id' upsert behavior — this is the entire fixture the mock needs.
const { subsStore, mockState, mockGetSupabaseAdmin } = vi.hoisted(() => {
  const subsStore = new Map()
  const mockState = { forceSelectError: null, forceUpsertError: null }

  function client() {
    return {
      from(_table) {
        return {
          select(_cols) {
            return {
              eq(_col, val) {
                return {
                  maybeSingle: async () => {
                    if (mockState.forceSelectError) return { data: null, error: mockState.forceSelectError }
                    return { data: subsStore.get(val) || null, error: null }
                  },
                }
              },
            }
          },
          upsert: async (row) => {
            if (mockState.forceUpsertError) return { data: null, error: mockState.forceUpsertError }
            subsStore.set(row.user_id, { ...row })
            return { data: [row], error: null }
          },
        }
      },
    }
  }

  return { subsStore, mockState, mockGetSupabaseAdmin: vi.fn(() => client()) }
})

vi.mock('../api/_supabase.js', () => ({ getSupabaseAdmin: mockGetSupabaseAdmin }))

import handler from '../api/live-matches.js'

// Server derives userId from HMAC(VAPID_PRIVATE_KEY, endpoint) — compute it here too.
const FAKE_SUB = { endpoint: 'https://push.example.com/sub1', keys: { auth: 'a', p256dh: 'b' } }
const VAPID_TEST_KEY = 'test-vapid-key'
const USER_ID = createHmac('sha256', VAPID_TEST_KEY).update(FAKE_SUB.endpoint).digest('hex').slice(0, 32)

function makeReq(body) {
  return { method: 'POST', query: { mode: 'push-subscribe' }, body }
}

function makeRes() {
  const res = { statusCode: null, body: null }
  res.setHeader = vi.fn()
  res.status = vi.fn(code => { res.statusCode = code; return res })
  res.json = vi.fn(body => { res.body = body; return res })
  res.end = vi.fn()
  return res
}

describe('push-subscribe: Supabase push_subscriptions upsert', () => {
  beforeEach(() => {
    subsStore.clear()
    mockState.forceSelectError = null
    mockState.forceUpsertError = null
    process.env.PANDASCORE_TOKEN = 'test-token'
    process.env.VAPID_PRIVATE_KEY = VAPID_TEST_KEY
  })

  it('first-time subscribe: upserts a row with lowercased teams', async () => {
    const req = makeReq({ subscription: FAKE_SUB, teamNames: ['Team Liquid', 'Team Spirit'] })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    const row = subsStore.get(USER_ID)
    expect(row).toBeTruthy()
    expect(row.endpoint).toBe(FAKE_SUB.endpoint)
    expect(row.p256dh).toBe('b')
    expect(row.auth).toBe('a')
    // Case-folded at write time: dispatchPush's `overlaps` query lowercases match.teamA/teamB the
    // same way the old push:team:{name} reverse-index key did — a mismatch here is a silent,
    // total notification blackout for the affected subscriber.
    expect(row.teams).toEqual(['team liquid', 'team spirit'])
  })

  it('re-subscribe with a new team list: fully replaces the previous teams array (no reverse index to diff)', async () => {
    subsStore.set(USER_ID, {
      user_id: USER_ID, endpoint: FAKE_SUB.endpoint, p256dh: 'b', auth: 'a',
      teams: ['xtreme gaming'], prefs: { tz: null, types: { soon: true, live: true, replay: true, score: false }, quietStart: null, quietEnd: null },
    })

    const req = makeReq({ subscription: FAKE_SUB, teamNames: ['Team Liquid'] })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(subsStore.get(USER_ID).teams).toEqual(['team liquid'])
  })

  it('unsubscribe all (empty teams): stores an empty teams array rather than deleting the row', async () => {
    subsStore.set(USER_ID, {
      user_id: USER_ID, endpoint: FAKE_SUB.endpoint, p256dh: 'b', auth: 'a',
      teams: ['team liquid', 'xtreme gaming'], prefs: { tz: null, types: { soon: true, live: true, replay: true, score: false }, quietStart: null, quietEnd: null },
    })

    const req = makeReq({ subscription: FAKE_SUB, teamNames: [] })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(subsStore.get(USER_ID).teams).toEqual([])
  })

  it('prefs merge: a tz-only re-subscribe (the auto re-subscribe on visit) does not clobber stored type toggles', async () => {
    subsStore.set(USER_ID, {
      user_id: USER_ID, endpoint: FAKE_SUB.endpoint, p256dh: 'b', auth: 'a',
      teams: ['team liquid'],
      prefs: { tz: 'America/New_York', types: { soon: false, live: true, replay: true, score: true }, quietStart: 23, quietEnd: 8 },
    })

    const req = makeReq({ subscription: FAKE_SUB, teamNames: ['Team Liquid'], prefs: { tz: 'Europe/London' } })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    const { prefs } = subsStore.get(USER_ID)
    expect(prefs.tz).toBe('Europe/London')
    // Untouched by the partial update — must survive the merge.
    expect(prefs.types).toEqual({ soon: false, live: true, replay: true, score: true })
    expect(prefs.quietStart).toBe(23)
    expect(prefs.quietEnd).toBe(8)
  })

  it('missing subscription endpoint returns 400', async () => {
    const res = makeRes()
    await handler(makeReq({ teamNames: ['Team Liquid'] }), res)
    expect(res.statusCode).toBe(400)

    const res2 = makeRes()
    await handler(makeReq({ subscription: { keys: { auth: 'a', p256dh: 'b' } }, teamNames: [] }), res2)
    expect(res2.statusCode).toBe(400)
  })

  it('returns 503 when VAPID_PRIVATE_KEY is missing', async () => {
    delete process.env.VAPID_PRIVATE_KEY
    const res = makeRes()
    await handler(makeReq({ subscription: FAKE_SUB, teamNames: ['Team Liquid'] }), res)
    expect(res.statusCode).toBe(503)
  })

  it('Supabase upsert failure: returns 500, does not silently report success', async () => {
    mockState.forceUpsertError = { message: 'connection refused' }
    const req = makeReq({ subscription: FAKE_SUB, teamNames: ['Team Liquid'] })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(500)
    expect(subsStore.has(USER_ID)).toBe(false)
  })

  it('Supabase read failure on the prefs-merge lookup: subscribe still succeeds (defaults to permissive prefs)', async () => {
    mockState.forceSelectError = { message: 'timeout' }
    const req = makeReq({ subscription: FAKE_SUB, teamNames: ['Team Liquid'] })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(subsStore.get(USER_ID).teams).toEqual(['team liquid'])
  })
})
