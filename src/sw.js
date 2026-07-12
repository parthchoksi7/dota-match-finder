import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// Precache app shell (manifest injected by vite-plugin-pwa at build time)
precacheAndRoute(self.__WB_MANIFEST)

// Live matches: short TTL — stale data is meaningless for "now live"
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/live-matches'),
  new NetworkFirst({
    cacheName: 'api-live',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 120 })],
  })
)

// Upcoming matches: 15-min fallback is acceptable
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/upcoming-matches'),
  new NetworkFirst({
    cacheName: 'api-upcoming',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 900 })],
  })
)

// Recent completed: scores change within minutes of a match ending
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.searchParams.get('mode') === 'recent-completed',
  new NetworkFirst({
    cacheName: 'api-recent-completed',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 300 })],
  })
)

// Match stats and indicators are immutable once a game is parsed — cache aggressively
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.searchParams.get('mode') === 'match-stats',
  new CacheFirst({
    cacheName: 'api-match-stats',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 7 * 86400, maxEntries: 200 })],
  })
)

registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.searchParams.get('mode') === 'match-indicators',
  new CacheFirst({
    cacheName: 'api-match-indicators',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 7 * 86400, maxEntries: 200 })],
  })
)

// All other same-origin API routes: NetworkFirst, 1-day fallback
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 86400 })],
  })
)

// PNG images: CacheFirst, 30-day TTL
registerRoute(
  ({ url }) => url.pathname.endsWith('.png'),
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 2592000 })],
  })
)

// Push notification received from server
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Spectate Esports', {
      body: data.body ?? 'A match you follow is now live',
      icon: '/pwa-192.jpg',
      badge: '/favicon.png',
      // tag collapses a repeat of the same (type, series) into one entry instead of stacking.
      ...(data.tag ? { tag: data.tag } : {}),
      data: { url: data.url ?? '/' },
    })
  )
})

// Notification tapped: focus existing window or open new one
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) return client.focus()
      }
      return clients.openWindow(targetUrl)
    })
  )
})
