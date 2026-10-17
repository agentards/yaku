import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: { __BUILD__: JSON.stringify(new Date().toISOString()) },
  build: { target: 'es2020' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // lo registramos en main.ts
      includeAssets: ['icon-192.png', 'icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest,geojson}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // maplibre-gl ~1 MB
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        name: 'Yaku Relay (prototipo)',
        short_name: 'Yaku Relay',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f6f8',
        theme_color: '#14212b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as any);
