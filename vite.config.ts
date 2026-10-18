import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
const PHASE = Number(process.env.VITE_PHASE ?? 3);
// Solo en local (dev/preview), a dónde va /api:
//  - por defecto, al servidor local (servidor-local/, `npm run servidor`, http://localhost:8080 o YAKU_API_LOCAL):
//    lectura y escritura sobre la base local.
//  - con YAKU_API=produccion, a producción y SOLO LECTURA: cualquier método que no sea GET/HEAD responde 404 aquí
//    mismo, así una prueba local nunca escribe en la base de producción.
// En producción (o servido por servidor-local) /api es del mismo origen y este proxy no existe.
const API_PROD = 'https://yaku-relay-proto.pages.dev';
export function proxyApi(env: Record<string, string | undefined> = process.env) {
  if (env.YAKU_API === 'produccion') {
    return { '/api': { target: API_PROD, changeOrigin: true, secure: true, bypass: (req: { method?: string }) => (req.method === 'GET' || req.method === 'HEAD' ? undefined : false) } };
  }
  return { '/api': { target: env.YAKU_API_LOCAL || 'http://localhost:8080', changeOrigin: true } };
}
const apiProxy = proxyApi();

export default defineConfig({
  define: { __BUILD__: JSON.stringify(new Date().toISOString()) },
  build: { target: 'es2020' },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // lo registramos en main.ts
      includeAssets: ['icon-192.png', 'icon-512.png'],
      workbox: {
        // Glyphs (.pbf) y sprites (.json/.png) del mapa base entran al precache (~0,9 MB).
        // El .pmtiles NO: se guarda aparte, completo y con progreso visible (src/basemap.ts).
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest,geojson,pbf,json}'],
        globIgnores: ['**/*.pmtiles', ...(PHASE < 2 ? ['data/cenepred-*'] : [])],
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
