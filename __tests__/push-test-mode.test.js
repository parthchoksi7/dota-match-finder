import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn() }))

const { mockKv, mockSendNotification } = vi.hoisted(() => {
  const store = new Map()
  const mockKv = {
    store,
    get: vi.fn(key => Promise.resolve(store.has(key) ? store.get(key) : null)),
    set: vi.fn((key, val) => { store.set(key, val); return Promise.resolve('OK') }),
    del: vi.fn((...keys) => { keys.forEach(k => store.delete(k)); return Promise.resolve(1) }),
    incr: vi.fn(key => {
      const next = (store.get(key) || 0) + 1
      store.set(key, next)
      return Promise.resolve(next)
    }),
    expire: vi.fn(() => Promise.resolve(1)),
  }
  return { mockKv, mockSendNotification: vi.fn() }
})

vi.mock('@upstash/redis', () => ({
  Redis: class { constructor() { Object.assign(this, mockKv) } },
}))

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: mockSendNotification,
  },
}))

import handler from '../api/live-matches.js'

const FAKE_SUB = { endpoint: 'https://push.example.com/device1', keys: { auth: 'a', p256dh: 'b' } }

function makeReq(body, ip = '1.2.3.4') {
  return {
    method: 'POST',
    query: { mode: 'push-test' },
    body,
    headers: { 'x-forwarded-for': ip },
  }
}

function makeRes() {
  const res = { statusCode: null, body: null }
  res.setHeader = vi.fn()
  res.status = vi.fn(code => { res.statusCode = code; return res })
  res.json = vi.fn(body => { res.body = body; return res })
  res.end = vi.fn()
  return res
}

describe('push-test mode', () => {
  beforeEach(() => {
    mockKv.store.clear()
    mockSendNotification.mockReset()
    process.env.PANDASCORE_TOKEN = 'test-token'
    process.env.VAPID_PRIVATE_KEY = 'test-vapid-key'
  })

  it('sends a spoiler-free test payload to the posted subscription', async () => {
    mockSendNotification.mockResolvedValue({})
    const res = makeRes()
    await handler(makeReq({ subscription: FAKE_SUB }), res)

    expect(res.statusCode).toBe(200)
    expect(mockSendNotification).toHaveBeenCalledTimes(1)
    const [sub, payloadStr] = mockSendNotification.mock.calls[0]
    expect(sub.endpoint).toBe(FAKE_SUB.endpoint)
    const payload = JSON.parse(payloadStr)
    expect(payload.title).toBe('Notifications are on')
    expect(payload.tag).toBe('push-test')
  })

  it('400 when subscription endpoint is missing', async () => {
    const res = makeRes()
    await handler(makeReq({}), res)
    expect(res.statusCode).toBe(400)
    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  it('503 when VAPID is not configured', async () => {
    delete process.env.VAPID_PRIVATE_KEY
    const res = makeRes()
    await handler(makeReq({ subscription: FAKE_SUB }), res)
    expect(res.statusCode).toBe(503)
  })

  it('410 when the push service reports the subscription gone', async () => {
    mockSendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }))
    const res = makeRes()
    await handler(makeReq({ subscription: FAKE_SUB }), res)
    expect(res.statusCode).toBe(410)
  })

  it('429 after exceeding 3 sends per minute from one IP', async () => {
    mockSendNotification.mockResolvedValue({})
    for (let i = 0; i < 3; i++) {
      const res = makeRes()
      await handler(makeReq({ subscription: FAKE_SUB }, '9.9.9.9'), res)
      expect(res.statusCode).toBe(200)
    }
    const res4 = makeRes()
    await handler(makeReq({ subscription: FAKE_SUB }, '9.9.9.9'), res4)
    expect(res4.statusCode).toBe(429)
    expect(mockSendNotification).toHaveBeenCalledTimes(3)
  })

  it('502 on other push-service errors (no KV state poisoned)', async () => {
    mockSendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }))
    const res = makeRes()
    await handler(makeReq({ subscription: FAKE_SUB }), res)
    expect(res.statusCode).toBe(502)
  })
})
