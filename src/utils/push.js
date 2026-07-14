const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function isPushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

export function getPushPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

// iOS Safari 16.4+ reports serviceWorker/PushManager/Notification as present even in a
// normal browser tab (isPushSupported() returns true), but Apple only delivers push to a
// site installed to the home screen — requesting permission in-tab silently can't work.
// Callers must check this BEFORE calling subscribeToPush and offer the install guide
// instead, so the one-shot OS permission prompt is never wasted on a dead end.
export function needsIOSInstall() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  return isIOS && !isStandalone
}

export async function subscribeToPush(teamNames) {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return { ok: false, reason: 'unsupported' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    // Send the browser's IANA timezone so the server can evaluate quiet hours. Full prefs
    // (type toggles, quiet-hours window) are added by the Settings UI; the server merges
    // this partial payload over any stored prefs, so tz-only calls never clobber them.
    let tz = null
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { /* unsupported */ }

    const res = await fetch('/api/live-matches?mode=push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), teamNames, prefs: { tz } }),
    })

    return res.ok ? { ok: true } : { ok: false, reason: 'server_error' }
  } catch (err) {
    console.error('push subscribe failed:', err)
    return { ok: false, reason: 'error' }
  }
}

// Syncs notification-type toggles / quiet hours for an ALREADY-granted subscription. Reuses
// the existing subscription via getSubscription() (never .subscribe() — no re-permission,
// no new endpoint) and posts to the same push-subscribe endpoint, which merges partial prefs
// over what's stored server-side. Callers only need to send the fields that changed.
export async function updatePushPrefs(teamNames, prefs) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return { ok: false, reason: 'no_subscription' }

    let tz = null
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { /* unsupported */ }

    const res = await fetch('/api/live-matches?mode=push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), teamNames, prefs: { ...prefs, tz } }),
    })

    return res.ok ? { ok: true } : { ok: false, reason: 'server_error' }
  } catch (err) {
    console.error('push prefs update failed:', err)
    return { ok: false, reason: 'error' }
  }
}
