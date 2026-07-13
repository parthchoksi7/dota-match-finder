import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendGa4Event } from '../api/_shared.js'

describe('sendGa4Event (server-side GA4 Measurement Protocol)', () => {
  const realFetch = global.fetch
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve({ ok: true }))
    global.fetch = fetchMock
    delete process.env.GA4_API_SECRET
    delete process.env.GA4_MEASUREMENT_ID
  })
  afterEach(() => { global.fetch = realFetch })

  it('no-ops (no fetch) when GA4_API_SECRET is unset', async () => {
    await sendGa4Event('push_sent', { type: 'soon', count: 3 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs the event to the MP endpoint when configured', async () => {
    process.env.GA4_API_SECRET = 'secret123'
    await sendGa4Event('push_sent', { type: 'replay', count: 2 }, 'push-replay')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('https://www.google-analytics.com/mp/collect')
    expect(url).toContain('measurement_id=G-XM3M9BCBWD') // default when GA4_MEASUREMENT_ID unset
    expect(url).toContain('api_secret=secret123')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    // A semantic key is coerced to a valid <digits>.<digits> GA4 client_id (GA4 can drop
    // malformed ids), and must be STABLE per key so it stays one pseudo-user.
    expect(body.client_id).toMatch(/^\d+\.\d+$/)
    expect(body.events).toEqual([{ name: 'push_sent', params: { type: 'replay', count: 2 } }])
  })

  it('coerces a semantic client key to a stable numeric id (same key → same id)', async () => {
    process.env.GA4_API_SECRET = 'secret123'
    await sendGa4Event('push_sent', { type: 'live', count: 1 }, 'push-live')
    await sendGa4Event('push_sent', { type: 'live', count: 2 }, 'push-live')
    const cid1 = JSON.parse(fetchMock.mock.calls[0][1].body).client_id
    const cid2 = JSON.parse(fetchMock.mock.calls[1][1].body).client_id
    expect(cid1).toMatch(/^\d+\.\d+$/)
    expect(cid1).toBe(cid2)
    // Different key → different pseudo-user
    await sendGa4Event('push_sent', { type: 'soon', count: 1 }, 'push-soon')
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).client_id).not.toBe(cid1)
  })

  it('uses a custom measurement id when provided', async () => {
    process.env.GA4_API_SECRET = 'secret123'
    process.env.GA4_MEASUREMENT_ID = 'G-CUSTOM01'
    await sendGa4Event('push_opened', { type: 'live' })
    expect(fetchMock.mock.calls[0][0]).toContain('measurement_id=G-CUSTOM01')
  })

  it('never throws when fetch rejects (best-effort)', async () => {
    process.env.GA4_API_SECRET = 'secret123'
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    await expect(sendGa4Event('push_sent', { type: 'soon', count: 1 })).resolves.toBeUndefined()
  })

  it('synthesizes a valid-format client_id when none is given', async () => {
    process.env.GA4_API_SECRET = 'secret123'
    await sendGa4Event('push_sent', { type: 'soon', count: 1 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.client_id).toMatch(/^\d+\.\d+$/)
  })
})
