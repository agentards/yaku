import { defineConfig, type Connect, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { ARCHIVO_APP, RUTAS_APP, esRutaApp, redireccionRuta } from './src/rutas';
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

// Multipágina (plan-landing-yaku-lat.md): / = landing (index.html); /reportar, /municipalidad y /app = app.html.
// En dev y preview, las mismas reescrituras y redirecciones que servidor-local/estaticos.ts (tabla en src/rutas.ts).
export const rutasMiddleware: Connect.NextHandleFunction = (req, res, next) => {
  const u = new URL(req.url ?? '/', 'http://local');
  if (req.method === 'GET' || req.method === 'HEAD') {
    const r = redireccionRuta(u.pathname, u.search);
    if (r) { res.statusCode = 302; res.setHeader('location', r); res.end(); return; }
    if (esRutaApp(u.pathname)) req.url = ARCHIVO_APP + u.search;
  }
  next();
};
const rutasYaku = (): Plugin => ({
  name: 'yaku-rutas',
  configureServer(s) { s.middlewares.use(rutasMiddleware); },
  configurePreviewServer(s) { s.middlewares.use(rutasMiddleware); },
});

export default defineConfig({
  define: { __BUILD__: JSON.stringify(new Date().toISOString()) },
  build: { target: 'es2020', rollupOptions: { input: { landing: 'index.html', app: 'app.html' } } },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  plugins: [
    rutasYaku(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // lo registramos en main.ts
      includeAssets: ['icon-192.png', 'icon-512.png'],
      workbox: {
        // Glyphs (.pbf) y sprites (.json/.png) del mapa base entran al precache (~0,9 MB).
        // El .pmtiles NO: se guarda aparte, completo y con progreso visible (src/basemap.ts).
        // La landing (index.html + su JS/CSS/fuentes) también queda en caché. Sus fotos (.jpg/.webp) se guardan al
        // verlas (runtimeCaching) para no gastar datos del vecino al instalar; videos (.mp4/.webm) nunca: van por red.
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest,geojson,pbf,json,woff2}'],
        globIgnores: ['**/*.pmtiles', '**/*.mp4', '**/*.webm', ...(PHASE < 2 ? ['data/cenepred-*'] : [])],
        runtimeCaching: [{
          urlPattern: ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) => sameOrigin && request.destination === 'image' && !url.pathname.startsWith('/api/'),
          handler: 'CacheFirst',
          options: { cacheName: 'yaku-imagenes', expiration: { maxEntries: 60 } },
        }],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // maplibre-gl ~1 MB
        // Sin red, solo /reportar, /municipalidad y /app (con o sin ?parámetros: Workbox compara ruta + búsqueda) caen en
        // app.html, y también un enlace viejo /?vista=… (app.html lo pasa a la ruta nueva); / sale del precache (index.html).
        navigateFallback: 'app.html',
        navigateFallbackAllowlist: [...RUTAS_APP.map((r) => new RegExp(`^${r}/?(\\?|$)`)), /^\/(index\.html)?\?(.*&)?vista=/],
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        name: 'Yaku',
        short_name: 'Yaku',
        description: 'Reporte vecinal por validar: pasa de celular en celular por QR hasta la municipalidad, también cuando cae la señal.',
        lang: 'es',
        id: '/reportar',
        start_url: '/reportar',
        scope: '/',
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
