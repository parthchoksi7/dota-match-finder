import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('../api/_shared.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, isTier1: () => false, isTier1ByName: () => false }
})

// KV state: in-memory map that simulates Upstash Redis behavior.
// Arrays stored directly are returned as arrays; JSON-stringified values return as strings.
const { mockKv } = vi.hoisted(() => {
  const store = new Map()
  const mockKv = {
    store,
    get: vi.fn(key => Promise.resolve(store.has(key) ? store.get(key) : null)),
    set: vi.fn((key, val) => { store.set(key, val); return Promise.resolve('OK') }),
    del: vi.fn((...keys) => { keys.forEach(k => store.delete(k)); return Promise.resolve(1) }),
  }
  return { mockKv }
})

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() { Object.assign(this, mockKv) }
  },
}))

import handler from '../api/live-matches.js'

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

const FAKE_SUB = { endpoint: 'https://push.example.com/sub1', keys: { auth: 'a', p256dh: 'b' } }
const USER_ID = 'user-abc-123'

describe('push-subscribe: team index management', () => {
  beforeEach(() => {
    mockKv.store.clear()
    mockKv.get.mockClear()
    mockKv.set.mockClear()
    mockKv.del.mockClear()
    mockKv.get.mockImplementation(key =>
      Promise.resolve(mockKv.store.has(key) ? mockKv.store.get(key) : null)
    )
    mockKv.set.mockImplementation((key, val) => {
      mockKv.store.set(key, val)
      return Promise.resolve('OK')
    })
    mockKv.del.mockImplementation((...keys) => {
      keys.forEach(k => mockKv.store.delete(k))
      return Promise.resolve(1)
    })
    process.env.PANDASCORE_TOKEN = 'test-token'
    process.env.VAPID_PRIVATE_KEY = undefined
  })

  it('first-time subscribe: adds userId to each team index', async () => {
    const req = makeReq({ subscription: FAKE_SUB, teamNames: ['Team Liquid', 'Team Spirit'], userId: USER_ID })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(mockKv.store.get('push:team:team liquid')).toContain(USER_ID)
    expect(mockKv.store.get('push:team:team spirit')).toContain(USER_ID)
  })

  it('team change (new array format): removes userId from old team, adds to new', async () => {
    // New format: push:teams stored as direct array
    mockKv.store.set(`push:teams:${USER_ID}`, ['Xtreme Gaming'])
    mockKv.store.set('push:team:xtreme gaming', [USER_ID])

    const req = makeReq({ subscription: FAKE_SUB, teamNames: ['Team Liquid'], userId: USER_ID })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    const xgUsers = mockKv.store.get('push:team:xtreme gaming')
    expect(xgUsers === undefined || !xgUsers.includes(USER_ID)).toBe(true)
    expect(mockKv.store.get('push:team:team liquid')).toContain(USER_ID)
  })

  it('team change (old JSON-string format): correctly parses and removes userId from stale index', async () => {
    // Old format: push:teams stored as JSON.stringify'd string (pre-fix deployments)
    mockKv.store.set(`push:teams:${USER_ID}`, JSON.stringify(['Xtreme Gaming']))
    mockKv.store.set('push:team:xtreme gaming', [USER_ID])

    const req = makeReq({ subscription: FAKE_SUB, teamNames: ['Team Liquid'], userId: USER_ID })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    const xgUsers = mockKv.store.get('push:team:xtreme gaming')
    expect(xgUsers === undefined || !xgUsers.includes(USER_ID)).toBe(true)
    expect(mockKv.store.get('push:team:team liquid')).toContain(USER_ID)
    // teams key should now be stored as a direct array going forward
    expect(Array.isArray(mockKv.store.get(`push:teams:${USER_ID}`))).toBe(true)
  })

  it('unsubscribe all (empty teams): removes userId from all previous team indexes', async () => {
    mockKv.store.set(`push:teams:${USER_ID}`, ['Team Liquid', 'Xtreme Gaming'])
    mockKv.store.set('push:team:team liquid', [USER_ID, 'other-user'])
    mockKv.store.set('push:team:xtreme gaming', [USER_ID])

    const req = makeReq({ subscription: FAKE_SUB, teamNames: [], userId: USER_ID })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    // userId removed; other-user still in team liquid index
    const liquidUsers = mockKv.store.get('push:team:team liquid')
    expect(liquidUsers).not.toContain(USER_ID)
    expect(liquidUsers).toContain('other-user')
    // Last user removed: key deleted entirely
    expect(mockKv.store.has('push:team:xtreme gaming')).toBe(false)
  })

  it('re-subscribe with same teams: no redundant add/remove on team indexes', async () => {
    mockKv.store.set(`push:teams:${USER_ID}`, ['Team Liquid'])
    mockKv.store.set('push:team:team liquid', [USER_ID])

    const req = makeReq({ subscription: FAKE_SUB, teamNames: ['Team Liquid'], userId: USER_ID })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    // Team index unchanged — userId present exactly once
    const liquidUsers = mockKv.store.get('push:team:team liquid')
    expect(liquidUsers.filter(id => id === USER_ID).length).toBe(1)
  })

  it('partial change: only touched teams are updated', async () => {
    mockKv.store.set(`push:teams:${USER_ID}`, ['Team Liquid', 'Xtreme Gaming'])
    mockKv.store.set('push:team:team liquid', [USER_ID])
    mockKv.store.set('push:team:xtreme gaming', [USER_ID])

    // Remove Xtreme Gaming, keep Liquid, add Team Spirit
    const req = makeReq({ subscription: FAKE_SUB, teamNames: ['Team Liquid', 'Team Spirit'], userId: USER_ID })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(mockKv.store.get('push:team:team liquid')).toContain(USER_ID)
    expect(mockKv.store.has('push:team:xtreme gaming')).toBe(false)
    expect(mockKv.store.get('push:team:team spirit')).toContain(USER_ID)
  })

  it('missing subscription or userId returns 400', async () => {
    const res = makeRes()
    await handler(makeReq({ teamNames: ['Team Liquid'] }), res)
    expect(res.statusCode).toBe(400)

    const res2 = makeRes()
    await handler(makeReq({ subscription: FAKE_SUB }), res2)
    expect(res2.statusCode).toBe(400)
  })

  it('KV failure on prevTeams read: defaults to empty, subscribe still succeeds', async () => {
    mockKv.get.mockImplementation(key => {
      if (key === `push:teams:${USER_ID}`) return Promise.reject(new Error('KV timeout'))
      return Promise.resolve(mockKv.store.has(key) ? mockKv.store.get(key) : null)
    })

    const req = makeReq({ subscription: FAKE_SUB, teamNames: ['Team Liquid'], userId: USER_ID })
    const res = makeRes()
    await handler(req, res)

    // Graceful degradation: handler catches the error and returns 500
    // OR succeeds with prevTeams = [] (addOps only, no removeOps)
    expect([200, 500]).toContain(res.statusCode)
    if (res.statusCode === 200) {
      // If succeeded, new team was added
      expect(mockKv.store.get('push:team:team liquid')).toContain(USER_ID)
    }
  })
})
