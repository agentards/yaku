// E2E de la interfaz 3D completa (?vista=portal): shell, panel de capas, línea de tiempo, portal de campo,
// relevo animado (demo SIMULADO y flujo real) y uso sin red. Deja capturas, video corto y medidas en docs/evidencia-3d/.
//   npm run build && node scripts/e2e-portal.mjs
//   VIEWPORT=android|desktop  CHROME=…  VIDEO=1
import { chromium } from 'playwright';
import { accederConPin } from './acceso-pin.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 4175, BASE = `http://localhost:${PORT}/`;
const OUT = path.resolve('docs/evidencia-3d');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const VP_NAME = process.env.VIEWPORT || 'desktop';
const VPS = {
  android: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 } },
};
fs.mkdirSync(OUT, { recursive: true });
const res = { fecha: new Date().toISOString(), viewport: VP_NAME, checks: [], medidas: {} };
const check = (name, ok, detail = {}) => { res.checks.push({ name, ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };
const shot = (page, n) => page.screenshot({ path: path.join(OUT, `portal-${VP_NAME}-${n}.jpg`), type: 'jpeg', quality: 72 });

function startServer() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32', detached: process.platform !== 'win32' });
  return new Promise((ok, ko) => { p.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) ok(p); }); p.on('exit', (c) => ko(new Error('preview salió ' + c))); });
}
const stopServer = (p) => { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']) : process.kill(-p.pid, 'SIGTERM'); } catch {} };

const sinProhibidos = async (page) => {
  const t = (await page.evaluate(() => document.querySelector('.v3d')?.innerText ?? '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return ['via segura', 'ruta segura', 'camino seguro', 'transitable', 'afectado', 'con danos', 'sin senal', 'centros poblados expuestos'].filter((b) => t.includes(b));
};
const entrar = async (page) => {
  await page.goto(BASE + '?vista=portal');
  await accederConPin(page);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  await page.waitForSelector('body[data-v3d="listo"]', { timeout: 30000 });
  await page.waitForFunction(() => window.__yaku3dUI?.tienda.centros.length > 0, null, { timeout: 15000 });
};
/** fps de la página (cuadros de requestAnimationFrame) y cuadros dibujados por cada mapa (evento «render»). */
const fps = (page, ms = 5000) => page.evaluate((ms) => new Promise((r) => {
  const u = window.__yaku3dUI, mini = u.portal?.mini?.();
  const n = { escena: 0, mini: 0, pagina: 0 };
  const fe = () => n.escena++, fm = () => n.mini++;
  u.escena.map.on('render', fe); mini?.on('render', fm);
  let raf = 0, peor = 0, prev = 0;
  const paso = (t) => { if (prev) peor = Math.max(peor, t - prev); prev = t; n.pagina++; raf = requestAnimationFrame(paso); };
  raf = requestAnimationFrame(paso);
  setTimeout(() => {
    cancelAnimationFrame(raf); u.escena.map.off('render', fe); mini?.off('render', fm);
    const q = (x) => +(x * 1000 / ms).toFixed(1);
    r({ paginaFps: q(n.pagina), escenaRenders: q(n.escena), miniRenders: q(n.mini), peorCuadroMs: Math.round(peor) });
  }, ms);
}), ms);

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
try {
  const ctx = await browser.newContext({ ...VPS[VP_NAME], locale: 'es-PE', timezoneId: 'America/Lima', ...(process.env.VIDEO ? { recordVideo: { dir: OUT, size: VPS[VP_NAME].viewport } } : {}) });
  const page = await ctx.newPage();
  const errores = [], externas = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && !/^(data|blob):/.test(u.protocol)) externas.push(r.url()); });

  // (0) 2D sigue por defecto: sin ?vista no se monta nada del portal
  await page.goto(BASE); await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  check('(p0) 2D por defecto: sin ?vista=portal no hay interfaz 3D', !(await page.$('.v3d')) && !(await page.evaluate(() => !!window.__yaku3dUI)));

  // (1) entrada y shell
  const t0 = Date.now();
  await entrar(page);
  const shell = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll('.v3d-tabs [role=tab]')].map((b) => b.textContent.trim().replace(/\s+\d+$/, '')),
    // C2: el pronóstico SENAMHI (con VIGENTE/VENCIDO) vive en la ficha de fuente; la cabecera lleva el chip de fuente.
    ventana: document.querySelector('[data-fuente-ficha] [data-senamhi]')?.textContent.trim(),
    chip: document.querySelector('.v3d-top [data-fuente]')?.textContent.trim(),
    capas: [...document.querySelectorAll('.v3d-capa')].map((l) => l.dataset.capa),
    red: document.querySelector('[data-red]')?.textContent,
    graficos: document.querySelectorAll('.v3d-graf').length,
  }));
  await page.waitForTimeout(5500);
  await shot(page, '1-regional');
  await page.click('.v3d-top [data-fuente]');
  await page.waitForTimeout(200);
  const ficha = await page.evaluate(() => { const d = document.querySelector('[data-fuente-ficha]'); return { abierta: d.open, txt: d.innerText }; });
  await shot(page, '5-ficha-fuente');
  await page.keyboard.press('Escape');
  const cerrada = await page.evaluate(() => !document.querySelector('[data-fuente-ficha]').open);
  const okFicha = ficha.abierta && cerrada && /SIGRID 23077/.test(ficha.txt) && /16\/10\/2026/.test(ficha.txt) && /Descargado/.test(ficha.txt) && /IGN/.test(ficha.txt) && /OSIPTEL[^]*2025-IV/.test(ficha.txt) && /Nivel referencial del escenario: no es pronóstico ni alerta/.test(ficha.txt);
  check('(p1) shell: pestañas Escenario · Campo · Relevo, ventana SENAMHI (en la ficha de fuente), chip de fuente, capas reales y 3 gráficos', shell.tabs.join('|') === 'Escenario|Campo|Relevo' && /SENAMHI/.test(shell.ventana) && shell.chip === 'Fuente: CENEPRED/SIGRID 23077 · 16/10/2026' && okFicha && shell.capas.includes('cenepred') && shell.capas.includes('terreno') && shell.graficos === 3, { ...shell, okFicha, ms: Date.now() - t0 });

  // (2) capas: casilla y opacidad conectadas a la escena
  if (VP_NAME === 'android') { await page.click('.v3d-abrir-cajon'); await page.waitForTimeout(300); }
  await page.click('#v3d-c-cenepred');
  const vis = await page.evaluate(() => window.__yaku3dUI.escena.map.getLayoutProperty('cenepred-ccpp', 'visibility'));
  await page.click('#v3d-c-cenepred');
  await page.locator('.v3d-capa[data-capa="senamhi"] input[type=range]').fill('40');
  await page.waitForTimeout(150);
  const op = await page.evaluate(() => window.__yaku3dUI.escena.map.getPaintProperty('senamhi-fill', 'fill-opacity'));
  check('(p2) capas: la casilla apaga la capa y el deslizador escala su opacidad de diseño', vis === 'none' && Math.abs(op - 0.32 * 0.4) < 0.01, { vis, op });
  if (VP_NAME === 'android') await page.click('[data-cerrar]');

  // (3) línea de tiempo: teclado y gráficos sincronizados
  await page.focus('.v3d-pista');
  await page.keyboard.press('End');
  const fin = await page.evaluate(() => ({ t: window.__yaku3dUI.tienda.t, b: window.__yaku3dUI.tienda.rango[1], txt: document.querySelector('.v3d-pista').getAttribute('aria-valuetext') }));
  await page.keyboard.press('Home');
  const ini = await page.evaluate(() => window.__yaku3dUI.tienda.t === window.__yaku3dUI.tienda.rango[0]);
  check('(p3) cabezal: Fin/Inicio por teclado con texto accesible en hora de Lima', fin.t === fin.b && ini && /hora de Lima/.test(fin.txt), fin);

  // (4) portal de campo: elegir un centro poblado sin cobertura garantizada y nivel alto
  await page.click('.v3d-tabs [data-tab=campo]'); // en celular abre el cajón
  await page.waitForTimeout(300);
  const objetivo = await page.evaluate(() => window.__yaku3dUI.tienda.centros.filter((c) => c.cg === false && c.r >= 4 && c.lon > -79.9).sort((a, b) => b.pob - a.pob)[0]);
  await page.fill('[data-q]', objetivo.n);
  await page.waitForTimeout(250);
  await page.click(`[data-cod="${objetivo.cod}"]`);
  await page.waitForSelector('.v3d-portal:not([hidden])');
  await page.waitForTimeout(7000);
  const hud = await page.evaluate(() => ({ txt: document.querySelector('.v3d-portal').innerText, mini: !!window.__yaku3dUI.portal.mini(), c: window.__yaku3dUI.escena.map.getCenter() }));
  const cerca = Math.abs(hud.c.lng - objetivo.lon) < 0.05 && Math.abs(hud.c.lat - objetivo.lat) < 0.05;
  const okHud = hud.txt.includes(objetivo.n) && /OSIPTEL/.test(hud.txt) && /SIN COBERTURA GARANTIZADA/i.test(hud.txt) && /m s\.n\.m\./i.test(hud.txt) && /(Sin ficha de evaluación|NO VERIFICADO)/i.test(hud.txt) && /(EN LÍNEA|SIN RED)/.test(hud.txt) && /CENEPRED/.test(hud.txt);
  check('(p4) portal: HUD con nombre, altitud DEM, OSIPTEL, estado de ficha, red, fuente; la escena voló al centro poblado', okHud && hud.mini && cerca, { centro: objetivo.n, cerca, mini: hud.mini });
  await shot(page, '2-portal');
  res.medidas.fpsPortal = await fps(page, 5000);

  // (5) cambiar de centro poblado: el portal cambia
  const otro = await page.evaluate(() => { const t = window.__yaku3dUI.tienda; const c = t.centros.find((c) => c.cg === true && c.r >= 3); t.seleccionar(c); return c.n; });
  await page.waitForTimeout(1200);
  check('(p5) elegir otro centro poblado cambia el portal', (await page.textContent('.v3d-portal [data-h="titulo"]')).includes(otro), { otro });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__yaku3dUI.tienda.seleccionar(null));

  // (6) relevo demo SIMULADO: arcos en el canvas y aviso etiquetado
  await page.evaluate(() => { const u = window.__yaku3dUI; u.tienda.setPestana('relevo'); u.escena.vistaRegional(); });
  await page.evaluate(() => document.querySelector('.v3d').removeAttribute('data-cajon'));
  await page.waitForTimeout(4000);
  await page.evaluate(() => { const u = window.__yaku3dUI; u.tienda.setDemo(true); const ts = u.tienda.simuladas.flatMap((f) => f.saltos.map((s) => s.t)); u.tienda.setT(Math.min(...ts) - 1800_000); u.linea.jugar(); });
  await page.waitForTimeout(2200);
  const arcos = await page.evaluate(() => { const c = document.querySelector('.v3d-arcos'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  const toast = await page.textContent('[data-aviso]');
  await shot(page, '3-relevo-simulado');
  res.medidas.fpsRelevo = await fps(page, 3000);
  await page.evaluate(() => window.__yaku3dUI.linea.pausar());
  check('(p6) relevo SIMULADO: arcos dibujados y aviso etiquetado SIMULADO / NO VERIFICADO', arcos > 200 && /SIMULADO/.test(toast), { pixelesArco: arcos, toast });

  // (7) flujo real: una ficha recibida por relevo en IndexedDB dispara su arco
  await page.evaluate(() => window.__yaku3dUI.tienda.setDemo(false));
  await page.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open('yaku-relay-proto', 1); q.onsuccess = () => r(q.result); });
    await new Promise((r) => { const tx = db.transaction('obs', 'readwrite'); tx.objectStore('obs').put({ id: 'e2e-portal-1', type: 'agua', severity: 2, lat: -4.7135, lon: -79.6458, note: 'prueba e2e', ts: Math.floor(Date.now() / 1000), deviceId: 'e2e00000', verified: false, source: 'qr', receivedAt: Date.now(), synced: false }); tx.oncomplete = r; });
  });
  await page.waitForFunction(() => /recibida/.test(document.querySelector('[data-aviso]')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
  const real = await page.evaluate(() => ({ toast: document.querySelector('[data-aviso]').textContent, fichas: window.__yaku3dUI.tienda.reales.length }));
  check('(p7) flujo real: ficha recibida por QR en IndexedDB → arco y aviso NO VERIFICADO', /recibida/.test(real.toast) && /NO VERIFICADO/.test(real.toast) && real.fichas >= 1, real);
  await page.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open('yaku-relay-proto', 1); q.onsuccess = () => r(q.result); });
    await new Promise((r) => { const tx = db.transaction('obs', 'readwrite'); tx.objectStore('obs').delete('e2e-portal-1'); tx.oncomplete = r; });
  });

  // (8) sin red: recarga desde el service worker, DEM desde Cache Storage, sin peticiones externas
  await page.waitForFunction(() => window.__yaku3d?.dem?.().estado === 'guardado', null, { timeout: 30000 }).catch(() => {});
  await ctx.setOffline(true);
  externas.length = 0;
  await entrar(page);
  await page.evaluate(() => { const t = window.__yaku3dUI.tienda; t.seleccionar(t.centros.find((c) => c.cg === false && c.r >= 4)); });
  await page.waitForTimeout(6000);
  const off = await page.evaluate(() => { const b = document.querySelector('.v3d-banda'); return { red: document.querySelector('[data-red]').textContent, hud: document.querySelector('.v3d-portal').innerText.includes('SIN RED'), terreno: window.__yaku3dUI.escena.tieneTerreno(),
    banda: b && !b.hidden ? b.innerText.replace(/\s+/g, ' ').trim() : '', bandaAlto: b ? Math.round(b.getBoundingClientRect().height) : 0 }; });
  await shot(page, '4-sin-red');
  const okBanda = off.bandaAlto >= 32 && off.banda.includes('SIN RED · trabajando con datos guardados en este equipo (escenario CENEPRED del 16/10/2026)') && /(Sincronizado ✓|pendientes? de sincronizar)/.test(off.banda);
  check('(p8) sin red: interfaz y portal cargan del service worker, relieve activo, HUD «SIN RED», banda ≥ 32 px con cola de sync, 0 peticiones externas', off.red === 'SIN RED' && off.hud && off.terreno && okBanda && externas.length === 0, { ...off, externas: externas.slice(0, 3) });
  await ctx.setOffline(false);

  const prohibidos = await sinProhibidos(page);
  check('(p9) sin textos prohibidos ni errores de página', !prohibidos.length && !errores.length, { prohibidos, errores: errores.slice(0, 3) });
  res.medidas.renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'desconocido'; });
  await ctx.close();
} finally {
  await browser.close();
  stopServer(server);
}
fs.writeFileSync(path.join(OUT, `portal-${VP_NAME}.json`), JSON.stringify(res, null, 2));
const malos = res.checks.filter((c) => !c.ok).length;
console.log(`\n${res.checks.length - malos}/${res.checks.length} OK · fps ${JSON.stringify(res.medidas)}`);
process.exit(malos ? 1 : 0);
