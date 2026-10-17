// Evidencia del preset «Ver desde la cuenca» (C3) en ?vista=3d y ?vista=portal, SIN RED (DEM desde yakudem://):
// botón y nota fija visibles, el vuelo llega a la vista río abajo, un gesto lo corta, reduced-motion salta sin
// animar, y fps del preset frente a la órbita (headless, alternados, misma vista de partida). Capturas y JSON en
// docs/evidencia-3d/cuenca-*.  npm run build && node scripts/evidencia-cuenca.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 4176, BASE = `http://localhost:${PORT}/`;
const OUT = path.resolve('docs/evidencia-3d');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const NOTA = 'Relieve: Terrain Tiles z5–9 (descargado 17/10/2026), exageración vertical 1,6×. Ayuda a leer por dónde baja el agua; no es un modelo de inundación';
const VPS = {
  escritorio: { viewport: { width: 1280, height: 800 } },
  movil: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const RONDAS = 3, MS = 4000;
// El mapa 2D también monta su control (oculto fuera de 3D): cada entrada busca su propio botón.
const SEL = { '3d': '.v3d-cuenca [data-cuenca]', portal: '.v3d-ctrl.ad [data-cuenca]' };
const SEL_NOTA = { '3d': '.v3d-cuenca [data-nota-relieve]', portal: '.v3d-nota-portal' };
fs.mkdirSync(OUT, { recursive: true });
const res = { fecha: new Date().toISOString(), checks: [], fps: {} };
const check = (name, ok, detail = {}) => { res.checks.push({ name, ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };
const shot = (page, n) => page.screenshot({ path: path.join(OUT, `cuenca-${n}.jpg`), type: 'jpeg', quality: 74 });

function startServer() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32', detached: process.platform !== 'win32' });
  return new Promise((ok, ko) => { p.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) ok(p); }); p.on('exit', (c) => ko(new Error('preview salió ' + c))); });
}
const stopServer = (p) => { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']) : process.kill(-p.pid, 'SIGTERM'); } catch {} };

// Acceso uniforme a mapa + Recorrido en las dos entradas (se inyecta en la página).
const API = `window.__c3 = () => window.__yakuEscena ? { map: window.__yakuEscena.map, cam: window.__yakuEscena.cam } : { map: window.__yaku.getMap(), cam: window.__yaku3d.vista.recorrido };`;
const idle = (page) => page.evaluate(() => new Promise((r) => { const { map } = window.__c3(); if (map.loaded() && !map.isMoving()) r(); else map.once('idle', r); setTimeout(r, 8000); }));
const vista = (page) => page.evaluate(() => { const { map, cam } = window.__c3(); const c = map.getCenter(); return { fase: cam.fase, center: [+c.lng.toFixed(4), +c.lat.toFixed(4)], zoom: +map.getZoom().toFixed(2), pitch: +map.getPitch().toFixed(1), bearing: +map.getBearing().toFixed(1), moviendo: map.isMoving(), terreno: map.getTerrain() }; });
const enCuenca = (v) => v.fase === 'inactivo' && Math.abs(v.pitch - 76) < 1.5 && v.bearing < -140 && v.bearing > -165 && Math.abs(v.center[0] + 80.6251) < 0.02 && Math.abs(v.center[1] + 5.4148) < 0.02;

/** fps de cuadros dibujados por el mapa (evento «render») durante `ms`, arrancando `accion` ('orbita' | 'cuenca'). */
const medir = (page, accion, ms) => page.evaluate(async ([accion, ms]) => {
  const { map, cam } = window.__c3();
  const iv = []; let prev = 0;
  const f = () => { const t = performance.now(); if (prev) iv.push(t - prev); prev = t; };
  map.on('render', f);
  const t0 = performance.now();
  if (accion === 'orbita') cam.orbitar(); else cam.verCuenca();
  await new Promise((r) => setTimeout(r, ms));
  map.off('render', f); cam.detener();
  const o = [...iv].sort((a, b) => a - b);
  return { fps: +((iv.length * 1000) / (performance.now() - t0)).toFixed(1), p95ms: +(o[Math.floor(o.length * 0.95)] ?? 0).toFixed(1) };
}, [accion, ms]);

async function fpsComparado(page, clave) {
  const inicio = await vista(page);
  const r = { orbita: [], cuenca: [] };
  // Ronda 0 = pasada en frío (decodifica las teselas del destino por primera vez): se anota aparte y no entra en
  // la mediana, porque la órbita nunca la paga (gira sobre teselas ya cargadas).
  for (let i = 0; i <= RONDAS; i++) for (const a of ['orbita', 'cuenca']) {
    await page.evaluate((v) => { const { map, cam } = window.__c3(); cam.detener(); map.jumpTo({ center: v.center, zoom: v.zoom, pitch: v.pitch, bearing: v.bearing }); }, inicio);
    await idle(page);
    r[a].push(await medir(page, a, MS));
  }
  const mediana = (xs) => { const s = xs.slice(1).map((x) => x.fps).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  res.fps[clave] = { ...r, mediaOrbita: mediana(r.orbita), mediaCuenca: mediana(r.cuenca), frioCuenca: r.cuenca[0].fps, partida: inicio };
  return res.fps[clave];
}

async function probar(browser, entrada, vp) {
  const clave = `${entrada}-${vp}`;
  const ctx = await browser.newContext({ ...VPS[vp], locale: 'es-PE', timezoneId: 'America/Lima' });
  await ctx.addInitScript(API);
  const page = await ctx.newPage();
  const externas = [], errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && !/^(data|blob):/.test(u.protocol)) externas.push(r.url()); });
  if (vp === 'movil') { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }

  // Con red: / guarda mapa base + DEM (como la primera visita real). Luego todo sin red.
  await page.goto(BASE); await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => window.__yaku.basemap().state === 'saved', null, { timeout: 180000 }).catch(() => {});
  await page.waitForFunction(() => window.__yaku3d.dem().estado === 'guardado', null, { timeout: 120000 }).catch(() => {});
  await ctx.setOffline(true);

  if (entrada === '3d') {
    await page.goto(BASE + '?vista=3d'); await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
    await page.waitForFunction(() => document.body.dataset.vista === '3d', null, { timeout: 20000 });
  } else {
    await page.goto(BASE + '?vista=portal'); await page.waitForSelector('body[data-v3d="listo"]', { timeout: 30000 });
  }
  await page.waitForFunction(() => window.__c3().cam.fase === 'inactivo', null, { timeout: 25000 }).catch(() => {});
  await idle(page);

  const ui = await page.evaluate(([portal, sb, sn]) => {
    const b = document.querySelector(sb), n = document.querySelector(sn);
    const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && getComputedStyle(e).visibility !== 'hidden'; };
    return { boton: vis(b), enCtrlAd: portal ? !!b?.closest('.v3d-ctrl.ad') : true, nota: n?.textContent ?? '', notaVisible: vis(n), online: navigator.onLine, red: document.querySelector('[data-red]')?.textContent ?? null, dem: window.__yaku3d?.dem?.() ?? null };
  }, [entrada === 'portal', SEL[entrada], SEL_NOTA[entrada]]);
  check(`[${clave}] botón «Ver desde la cuenca»${entrada === 'portal' ? ' en .v3d-ctrl.ad' : ''} y nota fija visibles, texto exacto`, ui.boton && ui.enCtrlAd && ui.notaVisible && ui.nota === NOTA, ui);
  await shot(page, `${clave}-inicio`);
  if (entrada === 'portal') {
    // Pestaña Relevo: aparecen las anclas «Servidor» / «Este teléfono» abajo a la izquierda; nada debe taparse.
    await page.evaluate(() => window.__yaku3dUI.tienda.setPestana('relevo'));
    await page.waitForTimeout(500);
    const sol = await page.evaluate(([sb, sn]) => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none'; };
      const choca = (a, b) => { const r = a.getBoundingClientRect(), q = b.getBoundingClientRect(); return r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom; };
      const nombre = (e) => (typeof e.className === 'string' && e.className) || e.tagName;
      const mios = [document.querySelector(sb), document.querySelector(sn)];
      const otros = [...document.querySelectorAll('.v3d-ancla, .v3d-leyenda, .v3d-ctrl.ad > *, .v3d-ctrl.ai > *, .v3d-portal')].filter((e) => vis(e) && !mios.includes(e));
      return { anclas: [...document.querySelectorAll('.v3d-ancla')].filter(vis).length, choques: mios.flatMap((m) => otros.filter((o) => choca(m, o)).map((o) => `${nombre(m)} × ${nombre(o)}`)) };
    }, [SEL[entrada], SEL_NOTA[entrada]]);
    await shot(page, `${clave}-relevo`);
    check(`[${clave}] pestaña Relevo: botón y nota no se tapan con las anclas ni con otros controles`, sol.anclas === 2 && sol.choques.length === 0, sol);
    await page.evaluate(() => window.__yaku3dUI.tienda.setPestana('escenario'));
  }

  // Vuelo completo con el botón real.
  await page.click(SEL[entrada]);
  const f0 = (await vista(page)).fase;
  await page.waitForFunction(() => window.__c3().cam.fase === 'inactivo', null, { timeout: 12000 }).catch(() => {});
  await idle(page);
  const v1 = await vista(page);
  check(`[${clave}] sin red: el botón vuela río abajo (Bajo Piura, pitch 76, rumbo SSO) sobre el relieve yakudem 1,6×`, f0 === 'cuenca' && enCuenca(v1) && v1.terreno?.exaggeration === 1.6 && externas.length === 0, { fase0: f0, ...v1, externas: externas.slice(0, 3) });
  await shot(page, clave);

  // Un gesto (rueda sobre el mapa) corta el vuelo.
  await page.evaluate(() => { const { map } = window.__c3(); map.jumpTo({ center: [-79.9, -5.1], zoom: 8, pitch: 60, bearing: 40 }); });
  await page.click(SEL[entrada]);
  await page.waitForTimeout(1200);
  const box = await page.locator(entrada === 'portal' ? '[data-mapa] canvas' : '#map canvas').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(400);
  const v2 = await vista(page);
  check(`[${clave}] un gesto (rueda) corta el vuelo del preset`, v2.fase === 'inactivo' && !enCuenca({ ...v2, fase: 'inactivo' }), v2);

  res.fps[clave] = await fpsComparado(page, clave);
  const { mediaOrbita: o, mediaCuenca: c } = res.fps[clave];
  check(`[${clave}] fps del preset no peores que la órbita (±10 % de margen de medida)`, c >= o * 0.9, { orbita: o, cuenca: c });
  check(`[${clave}] sin errores de página`, errores.length === 0, { errores: errores.slice(0, 3) });
  await ctx.close();
}

async function reducido(browser) {
  const ctx = await browser.newContext({ ...VPS.escritorio, reducedMotion: 'reduce', locale: 'es-PE' });
  await ctx.addInitScript(API);
  const page = await ctx.newPage();
  await page.goto(BASE + '?vista=3d'); await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  await page.waitForFunction(() => document.body.dataset.vista === '3d', null, { timeout: 20000 });
  await page.waitForFunction(() => window.__c3().cam.fase === 'inactivo', null, { timeout: 25000 }).catch(() => {});
  const t0 = Date.now();
  await page.click(SEL['3d']);
  await page.waitForFunction(() => window.__c3().cam.fase === 'inactivo', null, { timeout: 3000 }).catch(() => {});
  const v = await vista(page);
  check('[reduced-motion] el preset salta a la vista sin animar', enCuenca(v) && Date.now() - t0 < 1500, { ...v, ms: Date.now() - t0 });
  await ctx.close();
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
try {
  res.gpu = await (async () => { const p = await browser.newPage(); const g = await p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'desconocido'; }); await p.close(); return g; })();
  for (const [e, vp] of [['3d', 'escritorio'], ['3d', 'movil'], ['portal', 'escritorio'], ['portal', 'movil']]) await probar(browser, e, vp);
  await reducido(browser);
} finally {
  await browser.close();
  stopServer(server);
  fs.writeFileSync(path.join(OUT, 'cuenca.json'), JSON.stringify(res, null, 2));
  // fps anotados junto a los del resto de la vista 3D.
  const fm = path.join(OUT, 'medidas.json'), med = JSON.parse(fs.readFileSync(fm, 'utf8'));
  med.fpsCuenca = {
    fecha: res.fecha, gpu: res.gpu,
    nota: `cuadros dibujados por MapLibre (evento render), headless, sin red; mediana de ${RONDAS} rondas alternadas de ${MS / 1000} s desde la misma vista, tras una pasada en frío (cuencaFrio); movil = 360×780 DPR 3 con CPU 4× más lenta`,
    ...Object.fromEntries(Object.entries(res.fps).map(([k, v]) => [k, { orbita: v.mediaOrbita, cuenca: v.mediaCuenca, cuencaFrio: v.frioCuenca }])),
  };
  fs.writeFileSync(fm, JSON.stringify(med, null, 2) + '\n');
  const ko = res.checks.filter((c) => !c.ok).length;
  console.log(`\n${res.checks.length - ko}/${res.checks.length} verificaciones`);
  for (const [k, v] of Object.entries(res.fps)) console.log(`fps ${k}: órbita ${v.mediaOrbita} · cuenca ${v.mediaCuenca} (en frío ${v.frioCuenca})`);
  process.exitCode = ko ? 1 : 0;
}
