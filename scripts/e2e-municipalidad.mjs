// E2E de la pantalla de la municipalidad (?vista=municipalidad) con /api/reports SIMULADO (Playwright route):
// ignora los reportes existentes, detecta los nuevos, vuela, marcador pulsante, aviso, tarjeta, columna con
// contador, «Visto» local, consulta cada 3 s, se recupera de un error y nunca escribe (solo GET). Deja capturas
// 1920×1080 en docs/evidencia-3d/ y medidas en results/e2e-municipalidad.json.
//   npm run build && node scripts/e2e-municipalidad.mjs
import { chromium } from 'playwright';
import { accederConPin } from './acceso-pin.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 4173, BASE = `http://localhost:${PORT}/`;
const OUT = path.resolve('results'), EVID = path.resolve('docs/evidencia-3d');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(EVID, { recursive: true });
const res = { fecha: new Date().toISOString(), checks: [] };
const check = (name, ok, detail = {}) => { res.checks.push({ name, ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };

function startServer() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  return new Promise((ok, ko) => { p.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) ok(p); }); p.on('exit', (c) => ko(new Error('preview salió ' + c))); });
}
const stopServer = (p) => { try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(p.pid), '/T', '/F']) : p.kill('SIGTERM'); } catch {} };

// ---------- /api/reports simulado (datos de prueba, etiquetados como tales en la nota) ----------
const ahora = Date.now();
const mk = (id, type, severity, lat, lon, note, received_at) => ({ id, type, severity, lat, lon, note, ts: Math.floor(received_at / 1000) - 40, device_id: 'e2e00000', verified: 0, received_at });
const mock = {
  falla: false,
  filas: [
    mk('prev0000001', 'agua', 1, -5.19449, -80.63282, 'prueba e2e previo 1', ahora - 3_600_000),
    mk('prev0000002', 'cauce', 2, -5.19349, -80.63382, 'prueba e2e previo 2', ahora - 3_000_000),
  ],
};
const api = []; // todas las peticiones a /api: método + ruta + hora
const NUEVO1 = mk('nuevo000001', 'huaico', 3, -4.6386, -79.7142, 'SIMULADO e2e: lodo en la quebrada', 0);
const NUEVO2 = mk('nuevo000002', 'via_bloq', 2, -5.0847, -80.1626, 'SIMULADO e2e: trocha cortada', 0);

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADLESS !== '0', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'es-PE', timezoneId: 'America/Lima', serviceWorkers: 'block' });
  await ctx.route('**/api/**', (route) => {
    const req = route.request(), u = new URL(req.url());
    api.push({ m: req.method(), p: u.pathname + u.search, t: Date.now() });
    if (req.method() === 'GET' && u.pathname === '/api/reports') {
      if (mock.falla) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulado"}' });
      const reports = [...mock.filas].sort((a, b) => b.received_at - a.received_at);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: reports.length, reports, note: 'Reportes ciudadanos NO VERIFICADOS' }) });
    }
    return route.fulfill({ status: 404, body: 'no' });
  });
  const page = await ctx.newPage();
  const externas = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) externas.push(r.url()); });
  const est = () => page.evaluate(() => window.__yakuMuni.estado());

  // 1) Al abrir: siembra con los 2 existentes y no anima nada.
  await page.goto(BASE + '?vista=municipalidad');
  await accederConPin(page);
  await page.waitForFunction(() => window.__yakuMuni?.estado().sembrado, null, { timeout: 30000 });
  const s0 = await est();
  const texto = await page.evaluate(() => document.body.innerText);
  check('título «Municipalidad · reportes de campo» y sin la palabra COE en pantalla', texto.includes('Municipalidad · reportes de campo') && !/\bCOE\b/i.test(texto) && !/\bCOE\b/i.test(await page.title()));
  check('al iniciar ignora los reportes existentes (2), sin tarjeta ni lista', s0.previos === 2 && s0.nuevos.length === 0 && !(await page.isVisible('.muni-tarjeta')) && (await page.locator('.muni-lista li').count()) === 0, { previos: s0.previos });
  const hay3D = await page.evaluate(() => !!window.__yakuMuni.escena());
  if (hay3D) await page.evaluate(() => window.__yakuMuni.escena().listo);
  const capas = await page.evaluate(() => { const m = window.__yakuMuni.escena()?.map; return m ? { terreno: !!m.getTerrain(), cenepred: !!m.getLayer('cenepred-ccpp'), senamhi: !!m.getLayer('senamhi-fill'), citizen: !!m.getLayer('citizen-dot') } : null; });
  check('mapa 3D de Piura con relieve y capas reales (CENEPRED, SENAMHI, reportes)', !!capas && capas.terreno && capas.cenepred && capas.senamhi && capas.citizen, { capas });
  await page.click('.muni-sonido');
  const sonido = await page.getAttribute('.muni-sonido', 'aria-pressed');
  check('botón de sonido se activa con un clic', sonido === 'true', { sonido });

  // 2) Llega un reporte nuevo → vuelo, marcador pulsante, aviso, tarjeta grande.
  await page.waitForTimeout(800);
  mock.filas.push({ ...NUEVO1, received_at: Date.now(), ts: Math.floor(Date.now() / 1000) - 40 });
  const t1 = Date.now();
  await page.waitForFunction(() => window.__yakuMuni.estado().nuevos.length === 1, null, { timeout: 8000 });
  const msDeteccion = Date.now() - t1;
  const s1 = await est();
  const tarjeta = await page.locator('.muni-tarjeta').innerText();
  check('detecta el reporte nuevo en ≤ 1 ciclo de consulta (3 s + margen)', msDeteccion <= 4500 && s1.actual === NUEVO1.id, { msDeteccion });
  check('tarjeta: tipo, severidad, hora, «Reporte vecinal · por validar» y «llegó hace N s»', /Huaico \/ flujo de lodo/.test(tarjeta) && /Severidad 3 de 3/.test(tarjeta) && /Reporte vecinal · por validar/.test(tarjeta) && /llegó hace \d+ s/.test(tarjeta) && /Hora del reporte/.test(tarjeta) && /No es una alerta oficial/.test(tarjeta), { tarjeta: tarjeta.replace(/\s+/g, ' ').slice(0, 220) });
  check('aviso sonoro disparado una vez', s1.avisos === 1, { avisos: s1.avisos });
  check('marcador pulsante en el mapa', (await page.locator('.muni-pulso').count()) === 1 || !hay3D);
  if (hay3D) {
    await page.waitForFunction(() => window.__yakuMuni.estado().fase === 'orbita', null, { timeout: 15000 }).catch(() => {});
    const cam = await page.evaluate(([lon, lat]) => { const m = window.__yakuMuni.escena().map, c = m.getCenter(); return { fase: window.__yakuMuni.estado().fase, dLon: Math.abs(c.lng - lon), dLat: Math.abs(c.lat - lat), zoom: +m.getZoom().toFixed(2), pitch: +m.getPitch().toFixed(1) }; }, [NUEVO1.lon, NUEVO1.lat]);
    check('la cámara vuela hasta el reporte y queda en órbita lenta', cam.fase === 'orbita' && cam.dLon < 0.02 && cam.dLat < 0.02 && cam.pitch > 50, cam);
    res.fps = await page.evaluate(async () => { const m = window.__yakuMuni.escena().map; const t = []; let last = performance.now(); const f = () => { const n = performance.now(); t.push(n - last); last = n; }; m.on('render', f); await new Promise((r) => setTimeout(r, 3000)); m.off('render', f); return { cuadros: t.length, fps: +(t.length / 3).toFixed(1) }; });
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(EVID, 'municipalidad-1920-reporte-nuevo.jpg'), type: 'jpeg', quality: 80 });

  // 3) Segundo reporte: la columna lo pone arriba y el contador sube.
  mock.filas.push({ ...NUEVO2, received_at: Date.now(), ts: Math.floor(Date.now() / 1000) - 25 });
  await page.waitForFunction(() => window.__yakuMuni.estado().nuevos.length === 2, null, { timeout: 8000 });
  const ids = await page.locator('.muni-lista li').evaluateAll((l) => l.map((x) => x.dataset.id));
  const n = await page.locator('.muni-n').innerText();
  check('columna: más nuevo arriba y contador en 2', ids[0] === NUEVO2.id && ids[1] === NUEVO1.id && n === '2', { ids, n });
  check('dos reportes nuevos = dos avisos', (await est()).avisos === 2);

  // 4) «Visto» (demo) marca solo localmente.
  const antes = api.length;
  await page.locator(`.muni-lista li[data-id="${NUEVO1.id}"] .muni-visto`).click();
  const s4 = await est();
  const sinver = await page.locator('.muni-n-sinver').innerText();
  const rotulo = await page.locator(`.muni-lista li[data-id="${NUEVO1.id}"] .muni-visto`).innerText();
  check('«Visto» marca localmente, rotulado demo, sin llamar al servidor', s4.vistos.includes(NUEVO1.id) && sinver === '1' && /demo/i.test(rotulo) && api.slice(antes).every((r) => r.m === 'GET'), { sinver, rotulo });
  await page.waitForTimeout(4000); // deja terminar el vuelo al segundo reporte
  await page.screenshot({ path: path.join(EVID, 'municipalidad-1920-columna.jpg'), type: 'jpeg', quality: 80 });

  // 5) Cadencia: GET /api/reports cada ~3 s.
  const v0 = api.filter((r) => r.p.startsWith('/api/reports')).length;
  await page.waitForTimeout(9200);
  const v1 = api.filter((r) => r.p.startsWith('/api/reports')).length;
  check('consulta GET /api/reports cada 3 s (3 ± 1 en 9 s)', v1 - v0 >= 2 && v1 - v0 <= 4, { consultas9s: v1 - v0 });

  // 6) El servidor falla → aviso en la cabecera; vuelve → «En vivo» otra vez, sin duplicar reportes.
  mock.falla = true;
  await page.waitForFunction(() => document.querySelector('.muni-en-vivo')?.dataset.estado === 'error', null, { timeout: 8000 }).catch(() => {});
  const eErr = await page.locator('.muni-en-vivo').getAttribute('data-estado');
  mock.falla = false;
  await page.waitForFunction(() => document.querySelector('.muni-en-vivo')?.dataset.estado === 'ok', null, { timeout: 8000 }).catch(() => {});
  const eOk = await page.locator('.muni-en-vivo').getAttribute('data-estado');
  check('error del servidor visible y recuperación sin duplicar', eErr === 'error' && eOk === 'ok' && (await est()).nuevos.length === 2, { eErr, eOk });

  check('solo lectura: todas las peticiones a /api fueron GET a /api/reports', api.length > 0 && api.every((r) => r.m === 'GET' && r.p.startsWith('/api/reports')), { total: api.length, otras: api.filter((r) => r.m !== 'GET' || !r.p.startsWith('/api/reports')).slice(0, 5) });
  check('cero peticiones a CDN o servicios externos', externas.length === 0, { externas: externas.slice(0, 5) });

  // 7) La vista 2D predeterminada no cambia.
  await page.goto(BASE);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  check('/ sigue en 2D sin la pantalla de la municipalidad', (await page.locator('.muni').count()) === 0 && (await page.evaluate(() => document.body.dataset.vista)) === '2d');
  await ctx.close();
} finally {
  await browser.close();
  stopServer(server);
  fs.writeFileSync(path.join(OUT, 'e2e-municipalidad.json'), JSON.stringify(res, null, 2));
  const ko = res.checks.filter((c) => !c.ok).length;
  console.log(`\n${res.checks.length - ko}/${res.checks.length} verificaciones · fps: ${JSON.stringify(res.fps)}`);
  process.exitCode = ko ? 1 : 0;
}
