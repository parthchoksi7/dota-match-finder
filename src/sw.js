import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// Precache app shell (manifest injected by vite-plugin-pwa at build time)
precacheAndRoute(self.__WB_MANIFEST)

// Same-origin API routes: NetworkFirst, 1-day fallback
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 86400 })],
  })
)

// OpenDota API: NetworkFirst, fall back to cache after 10s, 1-hour TTL
registerRoute(
  ({ url }) => url.origin === 'https://api.opendota.com',
  new NetworkFirst({
    cacheName: 'opendota-cache',
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 3600 })],
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
