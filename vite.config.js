import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
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
      injectManifest: {
        globPatterns: ['**/*.{js,css,html}'],
        globIgnores: ['**/logo*.png', '**/og-image.png'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
  },
})
