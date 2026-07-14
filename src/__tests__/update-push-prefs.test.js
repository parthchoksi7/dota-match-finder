/**
 * Tests for updatePushPrefs() — syncs notification-type toggles / quiet hours for an
 * ALREADY-granted subscription. Must reuse the existing subscription (getSubscription,
 * never .subscribe()) so no re-permission or new endpoint is ever created just from
 * flipping a settings toggle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { updatePushPrefs } from '../utils/push'

const realServiceWorker = navigator.serviceWorker
const realPushManager = window.PushManager
const realNotification = window.Notification

function stubPushSupported() {
  Object.defineProperty(window, 'PushManager', { value: function PushManager() {}, configurable: true })
  Object.defineProperty(window, 'Notification', { value: function Notification() {}, configurable: true })
}

describe('updatePushPrefs', () => {
  let getSubscriptionMock
  let fetchMock

  beforeEach(() => {
    stubPushSupported()
    getSubscriptionMock = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: getSubscriptionMock } }) },
      configurable: true,
    })
    fetchMock = vi.fn(() => Promise.resolve({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(navigator, 'serviceWorker', { value: realServiceWorker, configurable: true })
    Object.defineProperty(window, 'PushManager', { value: realPushManager, configurable: true })
    Object.defineProperty(window, 'Notification', { value: realNotification, configurable: true })
  })

  it('returns unsupported without touching serviceWorker when push APIs are absent', async () => {
    // 'PushManager' in window checks key presence, not truthiness — must actually delete it.
    delete window.PushManager
    const result = await updatePushPrefs(['Team Liquid'], { types: { soon: false } })
    expect(result).toEqual({ ok: false, reason: 'unsupported' })
    expect(getSubscriptionMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns no_subscription when there is no active push subscription', async () => {
    getSubscriptionMock.mockResolvedValue(null)
    const result = await updatePushPrefs(['Team Liquid'], { types: { soon: false } })
    expect(result).toEqual({ ok: false, reason: 'no_subscription' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reuses the existing subscription (never re-subscribes) and posts the merged body', async () => {
    const fakeSub = { toJSON: () => ({ endpoint: 'https://push.example/ep', keys: { p256dh: 'p', auth: 'a' } }) }
    getSubscriptionMock.mockResolvedValue(fakeSub)

    const result = await updatePushPrefs(['Team Liquid'], { types: { soon: false, live: true, replay: true }, quietStart: 23, quietEnd: 8 })

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/live-matches?mode=push-subscribe')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.subscription.endpoint).toBe('https://push.example/ep')
    expect(body.teamNames).toEqual(['Team Liquid'])
    expect(body.prefs.types).toEqual({ soon: false, live: true, replay: true })
    expect(body.prefs.quietStart).toBe(23)
    expect(body.prefs.quietEnd).toBe(8)
    expect(typeof body.prefs.tz === 'string' || body.prefs.tz === null).toBe(true)
  })

  it('returns server_error on a non-ok response', async () => {
    getSubscriptionMock.mockResolvedValue({ toJSON: () => ({ endpoint: 'https://push.example/ep' }) })
    fetchMock.mockResolvedValue({ ok: false })
    const result = await updatePushPrefs([], { types: { soon: false } })
    expect(result).toEqual({ ok: false, reason: 'server_error' })
  })

  it('returns error (never throws) when fetch rejects', async () => {
    getSubscriptionMock.mockResolvedValue({ toJSON: () => ({ endpoint: 'https://push.example/ep' }) })
    fetchMock.mockRejectedValue(new Error('network down'))
    const result = await updatePushPrefs([], { types: { soon: false } })
    expect(result).toEqual({ ok: false, reason: 'error' })
  })
})
