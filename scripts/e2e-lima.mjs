// E2E de la prueba en sala en Lima (?region=lima) contra el SERVIDOR LOCAL REAL (SQLite temporal fuera del repo):
// mapa base de Lima z15, edificios 3D de OpenStreetMap, sin relieve DEM, chip «Lima · prueba en sala», selector
// Piura | Lima, y un reporte en Miraflores que el Centro de monitoreo detecta y al que vuela entre edificios.
// Temas Claro | Noche | Contraste: cambian sin recargar, se recuerdan y mantienen ≥ 30 fps girando en Miraflores a z16.
// Datos de prueba etiquetados SIMULADO. Capturas 1920×1080 en results/lima-*.jpg y results/lima-tema-*.jpg.
//   npm run build && node scripts/e2e-lima.mjs      (PORT_E2E=8098 por defecto; Node ≥ 23.6 importa .ts)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accederConPin } from './acceso-pin.mjs';
import { iniciar } from '../servidor-local/servidor.ts';
import { makeObservation } from '../src/codec.ts';

const PORT = Number(process.env.PORT_E2E ?? 8098), BASE = `http://localhost:${PORT}/`;
const OUT = path.resolve('results');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-e2e-lima-'));
const PIN = 'e2e-' + Math.random().toString(36).slice(2, 8);
fs.mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (name, ok, detail = {}) => { checks.push({ name, ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail).slice(0, 300)); };

const srv = iniciar({ puerto: PORT, host: '127.0.0.1', datos: DATOS, pin: PIN, silencioso: true });
await srv.listo;
const ahoraS = () => Math.floor(Date.now() / 1000);
const sync = (records) => fetch(`http://127.0.0.1:${PORT}/api/sync`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ records }) });
// Miraflores (Lima), cerca del parque Kennedy.
const A = makeObservation({ type: 'agua', severity: 2, lat: -12.1211, lon: -77.0297, note: 'SIMULADO e2e Lima: acumulación de agua', ts: ahoraS() - 20, deviceId: 'limaa001' });

const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADLESS !== '0', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'es-PE', timezoneId: 'America/Lima', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errores = [], externas = [], pmtiles = new Set();
  page.on('pageerror', (e) => errores.push(String(e.message).slice(0, 200)));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) externas.push(r.url());
    if (u.pathname.endsWith('.pmtiles')) pmtiles.add(u.pathname);
  });
  await page.goto(BASE + 'municipalidad?region=lima');
  await accederConPin(page, { nombre: 'Operador SIMULADO', pin: PIN });
  await page.waitForFunction(() => document.body.dataset.v3d === 'listo', null, { timeout: 30000 });
  const m = () => page.evaluate(() => { const map = window.__yakuMonitoreo.escena.map; return { terreno: !!map.getTerrain(), edificios: !!map.getLayer('v3d-edificios'), z: map.getZoom(), c: map.getCenter() }; });
  await page.waitForTimeout(6000); // vuelo de entrada
  const s0 = await m();
  const cab = (await page.locator('.v3d-top').innerText()).replace(/\s+/g, ' ');
  check('cabecera: chip «Lima · prueba en sala» y selector Piura | Lima con Lima activo', /Lima · prueba en sala/.test(cab)
    && (await page.getAttribute('[data-region="lima"]', 'aria-pressed')) === 'true' && (await page.getAttribute('[data-region="piura"]', 'aria-pressed')) === 'false', { cab: cab.slice(0, 160) });
  check('mapa base de Lima (no el de Piura) y sin DEM', [...pmtiles].some((p) => p.includes('lima_basemap_z15')) && ![...pmtiles].some((p) => p.includes('piura_')), { pmtiles: [...pmtiles] });
  check('escena en Lima, sin terreno y con capa de edificios 3D', !s0.terreno && s0.edificios && Math.abs(s0.c.lng + 77.03) < 0.1 && Math.abs(s0.c.lat + 12.11) < 0.1, s0);
  await page.evaluate(() => new Promise((r) => { const map = window.__yakuMonitoreo.escena.map; if (map.loaded()) r(); else map.once('idle', r); }));
  const nEdif = await page.evaluate(() => window.__yakuMonitoreo.escena.map.queryRenderedFeatures({ layers: ['v3d-edificios'] }).length);
  check('edificios dibujados en pantalla', nEdif > 100, { nEdif });
  await page.screenshot({ path: path.join(OUT, 'lima-1-inicio.jpg'), type: 'jpeg', quality: 80 });

  await sync([A]);
  await page.waitForFunction((id) => window.__yakuMonitoreo.estado().nuevos.includes(id) || window.__yakuMonitoreo.estado().incidentes.length > 0, A.id, { timeout: 15000 });
  await page.waitForTimeout(7000); // acercamiento + órbita
  const s1 = await m();
  check('reporte en Miraflores: incidente nuevo, vuelo de cerca (z ≥ 15) sobre el punto', s1.z >= 15 && Math.abs(s1.c.lng + 77.0297) < 0.01 && Math.abs(s1.c.lat + 12.1211) < 0.01 && await page.isVisible('[data-tarjeta]'), s1);
  await page.screenshot({ path: path.join(OUT, 'lima-2-reporte.jpg'), type: 'jpeg', quality: 80 });

  // ---------- temas Claro | Noche | Contraste: en caliente, recordados, FPS en Miraflores a z16 ----------
  const temaBtns = await page.$$eval('[data-tema]', (bs) => bs.filter((b) => b.tagName === 'BUTTON').map((b) => ({ id: b.dataset.tema, on: b.getAttribute('aria-pressed') })));
  check('selector de tema con Claro, Noche y Contraste (claro por defecto)', temaBtns.map((b) => b.id).join() === 'claro,noche,contraste' && temaBtns[0].on === 'true', { temaBtns });
  await page.click('[data-cerrar-tarjeta]').catch(() => {});
  await page.evaluate(() => { window.__sinRecarga = 1; });
  const estadoTema = () => page.evaluate(() => {
    const map = window.__yakuMonitoreo.escena.map;
    return { tema: window.__yakuTema.actual(), fondo: map.getPaintProperty('background', 'background-color'), techos: !!map.getLayer('v3d-techos'),
      guardado: localStorage.getItem('yaku-tema-3d'), sinRecarga: window.__sinRecarga === 1, puntos: map.querySourceFeatures('citizen').length, raiz: document.querySelector('.v3d.mon').dataset.tema };
  });
  // Encuadre fijo de Miraflores (parque Kennedy) a z16 y giro de 5 s: mide los cuadros que MapLibre dibuja.
  const fpsGiro = () => page.evaluate(() => new Promise((res) => {
    const map = window.__yakuMonitoreo.escena.map;
    window.__yakuEscena?.cam?.detener(); map.stop(); map.jumpTo({ center: [-77.0297, -12.1211], zoom: 16, pitch: 66, bearing: 20 });
    window.__quieto(map).then(() => {
      const iv = []; let prev = 0;
      const f = () => { const t = performance.now(); if (prev) iv.push(t - prev); prev = t; };
      map.on('render', f);
      const t0 = performance.now();
      map.easeTo({ bearing: 80, duration: 5000, easing: (x) => x });
      setTimeout(() => { map.off('render', f); const ms = performance.now() - t0; const o = [...iv].sort((a, b) => a - b); res({ fps: +((iv.length * 1000) / ms).toFixed(1), p95ms: +(o[Math.floor(o.length * 0.95)] ?? 0).toFixed(1), z: +map.getZoom().toFixed(2) }); }, 5000);
    });
  }));
  // Espera a que el mapa termine de dibujar (idle), con tope de 6 s.
  await page.evaluate(() => { window.__quieto = (map) => new Promise((r) => { const t = setTimeout(r, 6000); map.once('idle', () => { clearTimeout(t); r(); }); map.triggerRepaint(); }); });
  const fpsTema = {};
  const encuadre = () => page.evaluate(() => { const map = window.__yakuMonitoreo.escena.map; window.__yakuEscena?.cam?.detener(); map.jumpTo({ center: [-77.0305, -12.1205], zoom: 16, pitch: 66, bearing: 35 }); return window.__quieto(map); });
  for (const id of ['claro', 'noche', 'contraste']) {
    await page.click(`button[data-tema="${id}"]`);
    await page.waitForFunction((id) => window.__yakuTema.actual() === id, id);
    fpsTema[id] = await fpsGiro();
    await encuadre();
    await page.screenshot({ path: path.join(OUT, `lima-tema-${id}.jpg`), type: 'jpeg', quality: 85 });
  }
  const e1 = await estadoTema();
  check('el tema cambia sin recargar la página, conserva los reportes y queda guardado', e1.tema === 'contraste' && e1.sinRecarga && e1.guardado === 'contraste' && e1.raiz === 'contraste' && e1.fondo === '#ffffff' && !e1.techos && e1.puntos > 0, e1);
  await page.click('button[data-tema="noche"]');
  await page.waitForFunction(() => window.__yakuTema.actual() === 'noche');
  const e2 = await estadoTema();
  check('noche: fondo oscuro, edificios por altura y borde iluminado (capa de techos)', e2.techos && e2.fondo === '#060a13' && e2.sinRecarga
    && JSON.stringify(await page.evaluate(() => window.__yakuMonitoreo.escena.map.getPaintProperty('v3d-edificios', 'fill-extrusion-color'))).includes('"height"'), e2);
  check('FPS ≥ 30 girando sobre Miraflores a z16 en los tres temas', Object.values(fpsTema).every((f) => f.fps >= 30 && f.z >= 15.9), fpsTema);
  // Recuerda el tema: otra carga de la página arranca en «noche» sin tocar nada.
  await page.reload();
  await Promise.race([page.waitForSelector('.ycm-acc-pin', { timeout: 30000 }).then(() => accederConPin(page, { nombre: 'Operador SIMULADO', pin: PIN })).catch(() => {}), page.waitForFunction(() => document.body.dataset.v3d === 'listo', null, { timeout: 30000 })]);
  await page.waitForFunction(() => document.body.dataset.v3d === 'listo', null, { timeout: 30000 });
  const e3 = await page.evaluate(() => ({ tema: window.__yakuTema.actual(), fondo: window.__yakuMonitoreo.escena.map.getPaintProperty('background', 'background-color'), pulsado: document.querySelector('button[data-tema="noche"]').getAttribute('aria-pressed') }));
  check('al volver a abrir, la escena arranca con el tema recordado (noche)', e3.tema === 'noche' && e3.fondo === '#060a13' && e3.pulsado === 'true', e3);
  await page.evaluate(() => window.__yakuTema.set('claro'));
  check('cero peticiones a servidores externos y sin errores de página', externas.length === 0 && errores.length === 0, { externas: externas.slice(0, 3), errores });
} finally {
  await browser.close();
  await srv.cerrar?.();
  fs.writeFileSync(path.join(OUT, 'e2e-lima.json'), JSON.stringify({ fecha: new Date().toISOString(), checks }, null, 2));
  const ok = checks.every((c) => c.ok);
  console.log(ok ? `\nE2E Lima: ${checks.length}/${checks.length} OK` : `\nE2E Lima: FALLÓ ${checks.filter((c) => !c.ok).length}`);
  process.exit(ok ? 0 : 1);
}
