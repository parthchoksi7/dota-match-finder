/**
 * Tests for needsIOSInstall() — detects iOS Safari's in-tab push limitation.
 * iOS 16.4+ reports serviceWorker/PushManager/Notification as present even when the
 * site is only open in a browser tab, but push delivery only works once installed to
 * the home screen. Callers must gate on this before calling subscribeToPush.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { needsIOSInstall } from '../utils/push'

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36'

function setUserAgent(ua) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}

function setStandalone(standalone) {
  window.matchMedia = (query) => ({
    matches: query === '(display-mode: standalone)' ? standalone : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true })
}

afterEach(() => {
  setUserAgent(ANDROID_UA)
  setStandalone(false)
})

describe('needsIOSInstall', () => {
  it('true on iOS Safari in a normal browser tab (not standalone)', () => {
    setUserAgent(IOS_UA)
    setStandalone(false)
    expect(needsIOSInstall()).toBe(true)
  })

  it('false on iOS once installed to the home screen (standalone)', () => {
    setUserAgent(IOS_UA)
    setStandalone(true)
    expect(needsIOSInstall()).toBe(false)
  })

  it('false on iOS when navigator.standalone (legacy Safari flag) is true', () => {
    setUserAgent(IOS_UA)
    setStandalone(false) // matchMedia standalone=false, but navigator.standalone below wins
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true })
    expect(needsIOSInstall()).toBe(false)
  })

  it('false on Android regardless of standalone state', () => {
    setUserAgent(ANDROID_UA)
    setStandalone(false)
    expect(needsIOSInstall()).toBe(false)
  })

  it('false on desktop', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15')
    setStandalone(false)
    expect(needsIOSInstall()).toBe(false)
  })
})
