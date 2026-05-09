import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Spectate Esports',
        short_name: 'Spectate',
        description: 'Track live and upcoming Dota 2 pro matches',
        theme_color: '#030712',
        background_color: '#030712',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192.jpg', sizes: '192x192', type: 'image/jpeg' },
          { src: '/pwa-512.jpg', sizes: '512x512', type: 'image/jpeg' },
          { src: '/pwa-512.jpg', sizes: '512x512', type: 'image/jpeg', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        globIgnores: ['**/logo*.png', '**/og-image.png'],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxAgeSeconds: 86400 } },
          },
          {
            urlPattern: /^https:\/\/api\.opendota\.com\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'opendota-cache', expiration: { maxAgeSeconds: 3600 } },
          },
          {
            urlPattern: /\.png$/,
            handler: 'CacheFirst',
            options: { cacheName: 'image-cache', expiration: { maxAgeSeconds: 2592000 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
  },
})
