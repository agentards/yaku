// E2E de la entrada ?vista=3d (G5): primera carga con red en 2D (guarda mapa base + DEM), luego SIN RED abre
// /?vista=3d y comprueba relieve DEM + centros poblados del escenario CENEPRED sobre el relieve; / sigue en 2D;
// sin WebGL 2, ?vista=3d se queda en 2D con aviso. Deja captura y medidas en results/.
//   npm run build && node scripts/e2e-3d-vista.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 4173, BASE = `http://localhost:${PORT}/`;
const OUT = path.resolve('results');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
fs.mkdirSync(OUT, { recursive: true });
const res = { fecha: new Date().toISOString(), checks: [] };
const check = (name, ok, detail = {}) => { res.checks.push({ name, ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };

function startServer() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  return new Promise((ok, ko) => { p.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) ok(p); }); p.on('exit', (c) => ko(new Error('preview salió ' + c))); });
}
const stopServer = (p) => { try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(p.pid), '/T', '/F']) : p.kill('SIGTERM'); } catch {} };
const idle = (page) => page.evaluate(() => new Promise((r) => { const m = window.__yaku.getMap(); if (m.loaded() && !m.isMoving()) r(); else m.once('idle', r); setTimeout(r, 8000); }));
const listo = (page) => page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
const estado = (page) => page.evaluate(() => {
  const m = window.__yaku.getMap();
  // Con terreno, queryRenderedFeatures sobre todo el lienzo no devuelve los círculos acostados en el relieve:
  // se cuentan los del origen que caen dentro de la pantalla (proyectados sobre la malla) con la capa visible.
  const capa = m.getLayer('cenepred-ccpp');
  const { width: w, height: h } = m.getCanvas().getBoundingClientRect();
  const cp = !capa || m.getLayoutProperty('cenepred-ccpp', 'visibility') === 'none' ? -1
    : new Set(m.querySourceFeatures('cenepred').filter((f) => { const p = m.project(f.geometry.coordinates); return p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h; }).map((f) => f.properties.cod)).size;
  return {
    online: navigator.onLine, vista: document.body.dataset.vista, pitch: +m.getPitch().toFixed(1), terreno: m.getTerrain(),
    relieve: !!m.getLayer('v3d-relieve-color'), sky: !!m.getSky?.(), alt: m.queryTerrainElevation([-79.45, -5.25]),
    dem: window.__yaku3d.dem(), cenepredVisibles: cp,
    cenepredDrapeado: m.getLayer('cenepred-ccpp') ? m.getPaintProperty('cenepred-ccpp', 'circle-pitch-alignment') : null,
  };
});

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADLESS !== '0', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-PE', timezoneId: 'America/Lima' });
  const page = await ctx.newPage();
  const externas = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) externas.push(r.url()); });

  // 1) Primera carga con red: 2D por defecto; mapa base y DEM quedan guardados.
  await page.goto(BASE); await listo(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => window.__yaku.basemap().state === 'saved', null, { timeout: 180000 }).catch(() => {});
  await page.waitForFunction(() => window.__yaku3d.dem().estado === 'guardado', null, { timeout: 120000 }).catch(() => {});
  const s0 = await estado(page);
  check('con red: / abre en 2D plano y guarda el DEM', s0.vista === '2d' && s0.pitch === 0 && !s0.terreno && s0.dem.estado === 'guardado', { vista: s0.vista, pitch: s0.pitch, dem: s0.dem.estado });

  // 2) Sin red (DevTools offline): /?vista=3d entra directo al relieve con CENEPRED encima.
  await ctx.setOffline(true);
  const t0 = Date.now();
  await page.goto(BASE + '?vista=3d'); await listo(page);
  await page.waitForFunction(() => document.body.dataset.vista === '3d', null, { timeout: 20000 });
  await page.waitForFunction(() => (document.querySelector('.v3d-conmutador')?.dataset.fase ?? 'inactivo') === 'inactivo', null, { timeout: 20000 });
  await idle(page);
  const s1 = await estado(page);
  check('sin red: ?vista=3d con terreno DEM 1,6× desde la copia local', !s1.online && !!s1.terreno && s1.terreno.exaggeration === 1.6 && s1.dem.desdeCache && typeof s1.alt === 'number' && s1.alt > 500, { terreno: s1.terreno, alt: s1.alt, dem: s1.dem, ms: Date.now() - t0 });
  check('sin red: color por altitud, sombreado y cielo con bruma', s1.relieve && s1.sky);
  check('sin red: centros poblados del escenario CENEPRED dibujados sobre el relieve', s1.cenepredVisibles > 0 && s1.cenepredDrapeado === 'map', { visibles: s1.cenepredVisibles, alineacion: s1.cenepredDrapeado });
  await page.screenshot({ path: path.join(OUT, 'vista3d-sin-red-escritorio.jpg'), type: 'jpeg', quality: 78 });
  // fps con la cámara en movimiento (órbita lenta), no con el mapa en reposo.
  res.fps3D = await page.evaluate(async () => { const r = window.__yaku3d.vista.recorrido; r.orbitar(); const f = await window.__yaku3d.fps(3000); r.detener(); return f; });
  res.gpu = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'desconocido'; });

  // 3) 2D intacto: / sin parámetro sigue plano, sin terreno ni capas de relieve.
  await page.goto(BASE); await listo(page); await idle(page);
  const s2 = await estado(page);
  check('sin red: / sigue en 2D (predeterminado), sin relieve', s2.vista === '2d' && s2.pitch === 0 && !s2.terreno && !s2.relieve && s2.cenepredVisibles > 0, { vista: s2.vista, pitch: s2.pitch, cenepred: s2.cenepredVisibles });
  await page.screenshot({ path: path.join(OUT, 'vista3d-2d-intacto.jpg'), type: 'jpeg', quality: 72 });
  check('cero peticiones a CDN o teselas externas', externas.length === 0, { externas: externas.slice(0, 5) });
  await ctx.close();

  // 4) Sin WebGL 2 (la comprobación previa no obtiene contexto): ?vista=3d se queda en 2D con aviso.
  const nctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-PE' });
  await nctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // Solo el lienzo suelto de la sonda soportaWebGL2(); el del mapa 2D (ya en el DOM) sigue funcionando.
    HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' && !this.isConnected ? null : orig.call(this, t, ...a); };
  });
  const npage = await nctx.newPage();
  await npage.goto(BASE + '?vista=3d'); await listo(npage); await idle(npage);
  await npage.waitForTimeout(800);
  const s3 = await npage.evaluate(() => ({ vista: document.body.dataset.vista, terreno: !!window.__yaku.getMap().getTerrain(), aviso: document.querySelector('.v3d-aviso')?.textContent ?? '' }));
  check('sin WebGL 2: ?vista=3d degrada a 2D con aviso', s3.vista === '2d' && !s3.terreno && /WebGL/.test(s3.aviso), s3);
  await nctx.close();
} finally {
  await browser.close();
  stopServer(server);
  fs.writeFileSync(path.join(OUT, 'e2e-3d-vista.json'), JSON.stringify(res, null, 2));
  const ko = res.checks.filter((c) => !c.ok).length;
  console.log(`\n${res.checks.length - ko}/${res.checks.length} verificaciones · fps 3D: ${JSON.stringify(res.fps3D)}`);
  process.exitCode = ko ? 1 : 0;
}
