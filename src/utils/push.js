const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
const PUSH_UID_KEY = 'spectate-push-uid'

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

    let userId = localStorage.getItem(PUSH_UID_KEY)
    if (!userId) {
      userId = crypto.randomUUID()
      localStorage.setItem(PUSH_UID_KEY, userId)
    }

    const res = await fetch('/api/live-matches?mode=push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), teamNames, userId }),
    })

    return res.ok ? { ok: true } : { ok: false, reason: 'server_error' }
  } catch (err) {
    console.error('push subscribe failed:', err)
    return { ok: false, reason: 'error' }
  }
}
