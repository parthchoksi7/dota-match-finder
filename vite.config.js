import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'

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
    // Uploads source maps so Sentry can de-minify stack traces — only runs when the auth
    // token is present (a CI/local build without it just skips this plugin, no build failure).
    ...(process.env.SENTRY_AUTH_TOKEN ? [sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Maps are uploaded to Sentry for de-minifying stack traces, then deleted from the
      // build output so they're never shipped/publicly servable from production.
      sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
    })] : []),
  ],
  build: {
    sourcemap: !!process.env.SENTRY_AUTH_TOKEN,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
  },
})
