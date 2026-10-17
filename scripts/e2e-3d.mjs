// E2E de la vista 3D (Playwright + Chrome del sistema): conmutador 2D|3D, terreno DEM, cámara, fps,
// uso sin red y vuelta a 2D si se pierde el contexto WebGL. Deja capturas y medidas en docs/evidencia-3d/.
//   npm run build && node scripts/e2e-3d.mjs
//   CHROME=… VIDEO=1 HEADLESS=0 node scripts/e2e-3d.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 4174, BASE = `http://localhost:${PORT}/`;
const OUT = path.resolve('docs/evidencia-3d');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const HEADLESS = process.env.HEADLESS !== '0';
fs.mkdirSync(OUT, { recursive: true });
const res = { fecha: new Date().toISOString(), checks: [], fps: {} };
const check = (name, ok, detail = {}) => { res.checks.push({ name, ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };

function startServer() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  return new Promise((ok, ko) => { p.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) ok(p); }); p.on('exit', (c) => ko(new Error('preview salió ' + c))); });
}
const stopServer = (p) => { try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(p.pid), '/T', '/F']) : p.kill('SIGTERM'); } catch {} };

const fase = (page) => page.evaluate(() => document.querySelector('.v3d-conmutador')?.dataset.fase ?? 'inactivo');
const esperarFase = (page, f, timeout = 20000) => page.waitForFunction((f) => (document.querySelector('.v3d-conmutador')?.dataset.fase ?? 'inactivo') === f, f, { timeout });
const idle = (page) => page.evaluate(() => new Promise((r) => { const m = window.__yaku.getMap(); if (m.loaded() && !m.isMoving()) r(); else m.once('idle', r); setTimeout(r, 8000); }));
const shot = (page, n) => page.screenshot({ path: path.join(OUT, n.replace(/\.png$/, '.jpg')), type: 'jpeg', quality: 72 });
const renderer = (page) => page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'desconocido'; });

/** Centro poblado del escenario CENEPRED de mayor nivel sin cobertura garantizada según OSIPTEL, en sierra. */
function objetivo() {
  const fc = JSON.parse(fs.readFileSync('public/data/cenepred-ccpp.geojson', 'utf8'));
  const f = fc.features.filter((f) => f.properties.cg === false && f.properties.r >= 4 && f.geometry.coordinates[0] > -79.9).sort((a, b) => b.properties.pob - a.properties.pob)[0];
  return { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], n: f.properties.n, d: f.properties.d };
}

async function recorridoCompleto(page, etiqueta, { capturas = true } = {}) {
  const externas = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && !u.protocol.startsWith('data') && !u.protocol.startsWith('blob')) externas.push(r.url()); });
  await page.goto(BASE); await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await idle(page);
  check(`[${etiqueta}] 2D por defecto, conmutador visible`, await page.evaluate(() => document.body.dataset.vista === '2d' && !!document.querySelector('.v3d-conmutador') && window.__yaku.getMap().getPitch() === 0));
  // El DEM se guarda en reposo después del mapa base.
  await page.waitForFunction(() => window.__yaku3d.dem().estado === 'guardado', null, { timeout: 90000 }).catch(() => {});
  const dem = await page.evaluate(() => window.__yaku3d.dem());
  check(`[${etiqueta}] DEM guardado en Cache Storage (sha256 verificado)`, dem.estado === 'guardado', dem);
  if (capturas) await shot(page, `01-2d-${etiqueta}.png`);
  // Línea base: fps del mapa 2D actual durante un desplazamiento de 3 s.
  const fps2D = page.evaluate(() => window.__yaku3d.fps(3000));
  await page.evaluate(() => { const m = window.__yaku.getMap(); m.easeTo({ center: [m.getCenter().lng + 0.4, m.getCenter().lat], zoom: m.getZoom() + 0.6, duration: 3000 }); });
  res.fps[`${etiqueta}-2d-desplazamiento`] = await fps2D;
  await idle(page);

  const t0 = Date.now();
  await page.click('.v3d-conmutador button[data-modo="3d"]');
  await page.waitForFunction(() => document.body.dataset.vista === '3d', null, { timeout: 15000 });
  const fpsVuelo = page.evaluate(() => window.__yaku3d.fps(3500));
  await page.waitForTimeout(1800); if (capturas) await shot(page, `02-vuelo-regional-${etiqueta}.png`);
  res.fps[`${etiqueta}-vuelo-regional`] = await fpsVuelo;
  await esperarFase(page, 'inactivo'); await idle(page);
  const st = await page.evaluate(() => { const m = window.__yaku.getMap(); return { pitch: +m.getPitch().toFixed(1), bearing: +m.getBearing().toFixed(1), zoom: +m.getZoom().toFixed(2), terreno: m.getTerrain(), alt: m.queryTerrainElevation([-79.45, -5.25]), sky: !!m.getSky?.() }; });
  check(`[${etiqueta}] 3D: terreno 1,6×, vista oblicua con horizonte (pitch ≥ 65)`, !!st.terreno && st.terreno.exaggeration === 1.6 && st.pitch >= 65, { ...st, ms: Date.now() - t0 });
  check(`[${etiqueta}] relieve real: altitud consultable sobre la sierra`, typeof st.alt === 'number' && st.alt > 500, { alt: st.alt });
  if (capturas) await shot(page, `03-regional-3d-${etiqueta}.png`);

  const o = objetivo();
  const vuelo = page.evaluate(({ lon, lat }) => window.__yaku3d.vista.volarA(lon, lat), o);
  await page.waitForTimeout(1500); if (capturas) await shot(page, `04-acercamiento-${etiqueta}.png`);
  await esperarFase(page, 'orbita', 15000);
  res.fps[`${etiqueta}-orbita`] = await page.evaluate(() => window.__yaku3d.fps(5000));
  if (capturas) await shot(page, `05-orbita-${etiqueta}.png`);
  const b1 = await page.evaluate(() => window.__yaku.getMap().getBearing());
  await page.waitForTimeout(600);
  const b2 = await page.evaluate(() => window.__yaku.getMap().getBearing());
  check(`[${etiqueta}] órbita lenta alrededor de ${o.n} (${o.d})`, Math.abs(b2 - b1) > 0.5 && (await fase(page)) === 'orbita', { b1, b2 });
  // Cancelable por el usuario: un gesto (rueda) detiene la órbita.
  const box = await page.locator('#map').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -100);
  await page.waitForTimeout(200);
  check(`[${etiqueta}] un gesto del usuario cancela la órbita`, (await fase(page)) === 'inactivo');
  await vuelo;

  await page.click('.v3d-conmutador button[data-modo="2d"]');
  await page.waitForFunction(() => document.body.dataset.vista === '2d' && window.__yaku.getMap().getPitch() === 0, null, { timeout: 5000 });
  const st2 = await page.evaluate(() => { const m = window.__yaku.getMap(); return { pitch: m.getPitch(), bearing: m.getBearing(), terreno: m.getTerrain(), relieve: !!m.getLayer('v3d-relieve-color') }; });
  check(`[${etiqueta}] vuelta a 2D: plano, norte arriba, sin terreno ni capas de relieve`, st2.pitch === 0 && st2.bearing === 0 && !st2.terreno && !st2.relieve, st2);
  if (capturas) await shot(page, `06-vuelta-2d-${etiqueta}.png`);
  check(`[${etiqueta}] cero peticiones a CDN o teselas externas`, externas.length === 0, { externas: externas.slice(0, 5) });
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, headless: HEADLESS, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
try {
  // ---------- escritorio ----------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-PE', timezoneId: 'America/Lima', ...(process.env.VIDEO ? { recordVideo: { dir: OUT, size: { width: 960, height: 600 } } } : {}) });
  const page = await ctx.newPage();
  await recorridoCompleto(page, 'escritorio');
  res.gpu = await renderer(page);

  // Sin red: recarga en modo avión, entra a 3D y el relieve sale de la copia local.
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  await page.click('.v3d-conmutador button[data-modo="3d"]');
  await page.waitForFunction(() => document.body.dataset.vista === '3d', null, { timeout: 15000 });
  await esperarFase(page, 'inactivo'); await idle(page);
  const off = await page.evaluate(() => { const m = window.__yaku.getMap(); return { online: navigator.onLine, dem: window.__yaku3d.dem(), alt: m.queryTerrainElevation([-79.45, -5.25]), terreno: !!m.getTerrain() }; });
  check('[sin red] 3D con relieve desde la copia guardada', !off.online && off.terreno && off.dem.desdeCache && typeof off.alt === 'number' && off.alt > 500, off);
  await shot(page, '07-sin-red-3d-escritorio.png');
  // Pérdida del contexto WebGL → vuelve a 2D con aviso.
  await page.evaluate(() => window.__yaku.getMap().getCanvas().getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(() => document.body.dataset.vista === '2d', null, { timeout: 5000 }).catch(() => {});
  check('[degradación] pérdida del contexto WebGL → vuelta a 2D', await page.evaluate(() => document.body.dataset.vista === '2d'));
  await ctx.setOffline(false);
  await ctx.close();

  // ---------- celular (emulado: 412×915, DPR 2,625, CPU 4× más lenta) ----------
  const mctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: 'es-PE', timezoneId: 'America/Lima' });
  const mpage = await mctx.newPage();
  const cdp = await mctx.newCDPSession(mpage);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await recorridoCompleto(mpage, 'movil');
  await mctx.close();
} finally {
  await browser.close();
  stopServer(server);
  fs.writeFileSync(path.join(OUT, 'medidas.json'), JSON.stringify(res, null, 2));
  const ko = res.checks.filter((c) => !c.ok).length;
  console.log(`\n${res.checks.length - ko}/${res.checks.length} verificaciones · GPU: ${res.gpu}`);
  console.log(JSON.stringify(res.fps, null, 1));
  process.exitCode = ko ? 1 : 0;
}
