// Ensayo automatizado de la demo de 3 min: los 6 pasos, todo en localhost.
// servidor-local/ REAL (SQLite en carpeta temporal, PIN de prueba), 2 celulares Android 412×915 (A y B) con cámara
// simulada que ve el QR que dibuja el otro (canvas.captureStream → scanner.ts), y el Centro de monitoreo
// 1920×1080 operado con clics (acceso con PIN; Validar + «Bomberos» con confirmación). Datos de prueba SIMULADOS. Mide cada paso.
//   node scripts/ensayo-demo.mjs            (compila a una carpeta temporal: no pisa dist/; HEADLESS=0 para verlo)
//   → results/ensayo-demo.json
// Limitación: las páginas se cargan con red y luego se cortan (setOffline); el arranque en frío sin red del
// service worker se prueba en scripts/e2e.mjs y a mano en el celular.
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { iniciar } from '../servidor-local/servidor.ts';
import { accederConPin } from './acceso-pin.mjs';

const PORT = Number(process.env.PORT_ENSAYO ?? 8099), BASE = `http://127.0.0.1:${PORT}/`, PIN = 'ensayo-' + Math.random().toString(36).slice(2, 8);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-ensayo-'));
const DIST = path.join(TMP, 'dist');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const res = { fecha: new Date().toISOString(), servidor: 'servidor-local real (SQLite temporal)', datos: 'SIMULADO', pasos: [], checks: [] };
const check = (name, ok, detail = {}) => { res.checks.push({ name, ok: !!ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };
let tPaso = Date.now();
const paso = (n, nombre) => { const ms = Date.now() - tPaso; res.pasos.push({ paso: n, nombre, ms }); console.log(`— paso ${n} «${nombre}»: ${(ms / 1000).toFixed(1)} s`); tPaso = Date.now(); };

// ---------- build aparte ----------
const b = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], { stdio: 'ignore', shell: process.platform === 'win32' });
if (b.status !== 0) throw new Error('vite build falló');
console.log('build ok');

// ---------- foto de prueba 2400×1800, como la de un celular ----------
const FOTO = path.join(TMP, 'foto-prueba.png');
{
  const W = 2400, H = 1800, png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, n = (Math.random() * 40) | 0;
    png.data[i] = 120 + (x / W) * 100 + n; png.data[i + 1] = 90 + (y / H) * 80 + n; png.data[i + 2] = 60 + n; png.data[i + 3] = 255;
  }
  fs.writeFileSync(FOTO, PNG.sync.write(png));
}

// ---------- cámara simulada: un canvas que la prueba pinta con lo que «ve» la cámara ----------
function camaraSimulada() {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const g = c.getContext('2d');
  g.fillStyle = '#6b6258'; g.fillRect(0, 0, 640, 480);
  let tic = 0;
  setInterval(() => { g.fillStyle = tic++ % 2 ? '#6b6258' : '#6b6259'; g.fillRect(0, 0, 2, 2); }, 100); // fuerza cuadros nuevos
  window.__camVer = (url) => new Promise((ok) => {
    const im = new Image();
    im.onload = () => { g.fillStyle = '#6b6258'; g.fillRect(0, 0, 640, 480); const s = 420; g.drawImage(im, (640 - s) / 2, (480 - s) / 2, s, s); ok(true); };
    im.onerror = () => ok(false);
    im.src = url;
  });
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => c.captureStream(15);
}

const srv = iniciar({ puerto: PORT, host: '127.0.0.1', dist: DIST, datos: path.join(TMP, 'datos'), pin: PIN, silencioso: true });
await srv.listo;
console.log('servidor ok', PORT);
const stats = async () => (await (await fetch(BASE + 'api/stats')).json());
const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADLESS !== '0', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const externas = [];
const vigilar = (p) => {
  p.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) externas.push(u.host); });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
};
const ANDROID = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, locale: 'es-PE', timezoneId: 'America/Lima', serviceWorkers: 'block', permissions: ['geolocation'] };
const GPS_A = { latitude: -5.19449, longitude: -80.63282, accuracy: 12 };
const GPS_B = { latitude: -5.19449 + 40 / 111320, longitude: -80.63282, accuracy: 9 }; // 40 m al norte de A

async function celular(gps) {
  const ctx = await browser.newContext({ ...ANDROID, geolocation: gps });
  await ctx.addInitScript(camaraSimulada);
  const p = await ctx.newPage();
  vigilar(p);
  await p.goto(BASE + 'reportar');
  await p.waitForFunction(() => document.querySelector('.pb')?.dataset.listo === '1', null, { timeout: 30000 });
  await p.click('#pb-consent-ok');
  return { ctx, p };
}
const est = (p) => p.evaluate(() => window.__yakuPoblador.estado());
async function reportar(p, tipo, { foto = false, nota = '' } = {}) {
  await p.click('.pb-nav button[data-ir="reportar"]');
  await p.click(`.pb-tipo[data-tipo="${tipo}"]`);
  if (await p.isVisible('[data-v="aviso"]')) await p.click('#pb-aviso-seguir');
  await p.waitForFunction(() => /Ubicación del GPS/.test(document.getElementById('pb-loc-txt').textContent), null, { timeout: 10000 });
  if (foto) {
    await p.setInputFiles('#pb-foto-in', FOTO);
    await p.waitForFunction(() => !!document.querySelector('.pb').dataset.foto, null, { timeout: 20000 });
  }
  if (nota) await p.fill('#pb-nota', nota);
  await p.click('#pb-guardar');
  await p.waitForFunction(() => document.querySelector('.pb').dataset.vista === 'lista');
}
/** Celulares frente a frente: cada cámara simulada ve el QR del otro hasta que se cumpla `hasta`. */
async function frenteAFrente(A, B, hasta, ms = 40000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const [qa, qb] = await Promise.all([A.evaluate(() => document.getElementById('pb-qr').toDataURL()), B.evaluate(() => document.getElementById('pb-qr').toDataURL())]);
    await Promise.all([B.evaluate((u) => window.__camVer(u), qa), A.evaluate((u) => window.__camVer(u), qb)]);
    if (await hasta()) return Date.now() - t;
    await A.waitForTimeout(200);
  }
  return -1;
}

try {
  // Pantalla grande de la municipalidad abierta desde antes (como en el escenario).
  const cM = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'es-PE', timezoneId: 'America/Lima', serviceWorkers: 'block' });
  const M = await cM.newPage();
  vigilar(M);
  await M.goto(BASE + 'municipalidad');
  await accederConPin(M, { pin: PIN }); // Centro de monitoreo: acceso con nombre + PIN
  await M.waitForFunction(() => window.__yakuMonitoreo?.estado().sembrado, null, { timeout: 30000 });
  // Procedencia: ¿la pantalla municipal dice fuente y fecha de las capas? (se informa; no detiene el ensayo)
  res.procedenciaMunicipalidad = await M.evaluate(() => (document.body.innerText.match(/Fuente[^\n]{0,80}/) ?? [null])[0]);
  console.log('municipalidad abierta · procedencia:', res.procedenciaMunicipalidad);
  const muni = () => M.evaluate(() => window.__yakuMonitoreo.estado());
  const { ctx: cA, p: A } = await celular(GPS_A);
  const { ctx: cB, p: B } = await celular(GPS_B);
  await cA.setOffline(true); await cB.setOffline(true);
  tPaso = Date.now();

  // 1) A sin red reporta «Casa dañada» y guarda en su celular.
  await reportar(A, 'vivienda', { nota: 'SIMULADO ensayo: pared rajada' });
  const eA1 = await est(A);
  check('1 · A sin red: «Casa dañada» guardada en su celular', (await A.textContent('#pb-red')) === 'SIN RED' && eA1.mios === 1 && eA1.pendientes === 1 && (await A.textContent('#pb-mios')).includes('Guardado en tu celular'), { mios: eA1.mios, pendientes: eA1.pendientes });
  paso(1, 'A reporta sin red');

  // 2) Intercambiar en un paso: cada uno lee el QR del otro.
  for (const p of [A, B]) await p.click('.pb-nav button[data-ir="intercambiar"]');
  await A.waitForFunction(() => /Cámara lista/.test(document.getElementById('pb-cam-txt').textContent), null, { timeout: 10000 });
  const msX = await frenteAFrente(A, B, async () => (await est(A)).completo && (await est(B)).completo);
  const eB2 = await est(B);
  check('2 · Intercambiar sin red: B ahora lleva el reporte de A', msX > 0 && eB2.llevo === 1, { ms: msX, lector: eB2.lector });
  for (const p of [A, B]) await p.click('#pb-terminar');
  paso(2, 'Intercambiar A ↔ B');

  // 3) B reporta lo mismo a 40 m, con foto: su celular ya lo cuenta como otra persona que coincide.
  await reportar(B, 'vivienda', { foto: true, nota: 'SIMULADO ensayo: techo caído' });
  const resp = await B.evaluate(() => [...document.querySelectorAll('.pb-rep[data-tipo="vivienda"]')].map((li) => li.querySelector('.pb-respaldo')?.textContent));
  check('3 · B reporta cerca con foto: «2 vecinos lo reportan · 1 foto» en su celular', resp.length === 2 && resp.every((t) => t === '2 vecinos lo reportan · 1 foto'), { resp });
  paso(3, 'B reporta lo mismo cerca');

  // 4) B recupera internet: sincroniza solo (los 2 reportes) y sube su foto.
  const s0 = await stats();
  await cB.setOffline(false);
  await B.waitForFunction(() => window.__yakuPoblador.estado().pendientes === 0 && window.__yakuPoblador.estado().fotos.every((f) => f.subida), null, { timeout: 20000 });
  const s1 = await stats();
  check('4 · B con red: se sincroniza solo, 2 reportes en el servidor', s0.total === 0 && s1.total === 2 && s1.unique_ids === 2, { antes: s0.total, despues: s1.total });
  paso(4, 'B recupera internet');

  // 5) Pantalla de la municipalidad: 1 incidente «2 vecinos · 1 foto», sin duplicados, y vuela al punto.
  await M.waitForFunction(() => window.__yakuMonitoreo.estado().incidentes.some((i) => i.tipo === 'vivienda' && i.personas === 2 && i.nFotos === 1), null, { timeout: 20000 });
  const m5 = await muni();
  const inc = m5.incidentes.find((i) => i.tipo === 'vivienda');
  await M.waitForSelector('[data-tarjeta]:not([hidden])', { timeout: 10000 });
  const tarjeta = await M.locator('[data-tarjeta]').innerText();
  check('5 · Municipalidad: 1 incidente de casa dañada con «2 vecinos · 1 foto», rótulo vecinal, sin duplicados',
    m5.incidentes.filter((i) => i.tipo === 'vivienda').length === 1 && /2 vecinos · 1 foto/.test(tarjeta) && /Reporte vecinal/.test(tarjeta),
    { incidentes: m5.incidentes.length, personas: inc.personas, fotos: inc.nFotos, puntaje: inc.puntaje, tarjeta: tarjeta.slice(0, 160) });
  const fase = await M.waitForFunction(() => ['regional', 'acercamiento', 'orbita'].includes(window.__yakuMonitoreo.estado().fase), null, { timeout: 15000 }).then(() => true).catch(() => false);
  check('5 · El mapa 3D vuela al incidente', fase && m5.actual === inc.id, { fase: (await muni()).fase });
  paso(5, 'Pantalla municipal muestra el incidente');

  // 6) El operador valida y asigna «Bomberos» con PIN; B lo ve al sincronizar y se lo pasa a A por QR.
  await M.click(`[data-lista] li[data-id="${inc.id}"] .mon-item`);
  await M.click('[data-tarjeta] .mon-acc[data-destino="validado"]');
  await M.click('[data-dlg-confirmar] button[value="ok"]'); // confirmación (queda a nombre del operador)
  await M.waitForFunction((id) => window.__yakuMonitoreo.estado().incidentes.find((i) => i.id === id)?.estado === 'validado', inc.id, { timeout: 10000 });
  await M.click('[data-tarjeta] .mon-acc[data-accion="bomberos"]');
  await M.fill('[data-dlg-confirmar] input[name="mensaje"]', 'Llegan por el puente en 20 min'); // va en el aviso firmado
  await M.click('[data-dlg-confirmar] button[value="ok"]');
  await M.waitForFunction((id) => window.__yakuMonitoreo.estado().incidentes.find((i) => i.id === id)?.accion === 'bomberos', inc.id, { timeout: 10000 });
  await B.click('#pb-actualizar');
  await B.waitForFunction(() => [...document.querySelectorAll('.pb-rep[data-tipo="vivienda"] .pb-chip-muni')].filter((c) => c.textContent === 'Bomberos asignados').length === 2, null, { timeout: 15000 });
  check('6 · Municipalidad valida + «Bomberos» con PIN; B lo ve tras sincronizar', true);
  const avisoB = await B.waitForFunction(() => window.__yakuPoblador.estado().avisos.some((a) => a.accion === 'bomberos' && a.verificado && a.via === 'red'), null, { timeout: 15000 }).then(() => true).catch(() => false);
  const textoB = await B.evaluate(() => document.querySelector('.pb-aviso[data-accion="bomberos"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  check('6 · B (con red) recibe el aviso firmado de la municipalidad: «Bomberos asignados» + mensaje', avisoB && /Bomberos asignados/.test(textoB) && /puente/.test(textoB) && /Firmado por la municipalidad/.test(textoB), { textoB });
  // «Estoy bien»: A, sin red, deja un mensaje para su hijo; viaja en el mismo intercambio.
  await A.click('.pb-nav button[data-ir="bien"]');
  await A.fill('#pb-bien-form input[name="nombre"]', 'Rosa Chunga');
  await A.fill('#pb-bien-form input[name="para"]', 'mi hijo Luis');
  await A.fill('#pb-bien-form textarea[name="mensaje"]', 'Hola Luis, soy tu mamá. Si lees esto: estoy bien, en el colegio.');
  await A.check('#pb-bien-form input[name="consent"]');
  await A.click('#pb-bien-form button[type="submit"]');
  const cartaA = await A.waitForFunction(() => document.querySelectorAll('#pb-bien-mias .pb-carta').length === 1, null, { timeout: 5000 }).then(() => true).catch(() => false);
  check('7 · A sin red escribe «Estoy bien» para su familia y queda en su celular', cartaA && !(await A.evaluate(() => navigator.onLine)));
  for (const p of [A, B]) await p.click('.pb-nav button[data-ir="intercambiar"]');
  await A.waitForFunction(() => /Cámara lista/.test(document.getElementById('pb-cam-txt').textContent), null, { timeout: 10000 });
  const msE = await frenteAFrente(A, B, async () => { const e = await est(A); return e.estadosRecibidos >= 1 && e.avisos.some((a) => a.accion === 'bomberos') && (await est(B)).cartasRecibidas >= 1; });
  await A.click('#pb-terminar');
  const chipsA = await A.evaluate(() => [...document.querySelectorAll('.pb-rep[data-tipo="vivienda"] .pb-chip-muni')].map((c) => c.textContent));
  check('6 · A sigue sin red y recibe el estado por QR: «Bomberos asignados»', msE > 0 && !(await A.evaluate(() => navigator.onLine)) && chipsA.length === 2 && chipsA.every((c) => c === 'Bomberos asignados'), { ms: msE, chipsA });
  const avisosA = (await est(A)).avisos;
  const textoA = await A.evaluate(() => document.querySelector('.pb-aviso[data-accion="bomberos"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  check('6 · A sin red recibe por QR el aviso firmado y lo verifica', avisosA.some((a) => a.accion === 'bomberos' && a.verificado && a.via === 'qr') && /te lo pasó otro vecino/.test(textoA) && !(await A.evaluate(() => navigator.onLine)), { avisosA, textoA });
  paso(6, 'Validar + Bomberos y acuse por QR');

  // 7) B (con red) sube la carta de A; un familiar la encuentra por nombre en /estoy-bien.
  await B.evaluate(() => window.__yakuPoblador.sincronizar());
  const enServidor = await (await fetch(BASE + 'api/cartas?q=rosa')).json();
  check('7 · B (con red) sube por la cadena el «Estoy bien» de A', enServidor.count === 1 && enServidor.cartas[0].nombre === 'Rosa Chunga', { count: enServidor.count });
  const F = await cM.newPage(); // el familiar, en una computadora con internet
  await F.goto(BASE + 'estoy-bien');
  await F.fill('#pb-bien-q', 'rosa chunga');
  await F.click('#pb-bien-buscar button[type="submit"]');
  const halla = await F.waitForSelector('#pb-bien-res .pb-carta', { timeout: 10000 }).then(() => true).catch(() => false);
  const textoF = halla ? (await F.locator('#pb-bien-res .pb-carta').first().innerText()).replace(/\s+/g, ' ') : '';
  check('7 · Un familiar la encuentra en yaku.lat/estoy-bien: «Rosa Chunga está bien · Para mi hijo Luis»', /Rosa Chunga está bien/.test(textoF) && /Para mi hijo Luis/.test(textoF) && /no lo verifica/.test(textoF), { textoF: textoF.slice(0, 200) });
  await F.close();
  paso(7, '«Estoy bien» por QR y búsqueda de la familia');

  // Cierre: A recupera internet y no duplica; nada salió de localhost.
  await cA.setOffline(false);
  await A.waitForFunction(() => window.__yakuPoblador.estado().pendientes === 0, null, { timeout: 15000 });
  const s2 = await stats();
  check('Cierre · A con red: el servidor sigue con 2 reportes (sin duplicados)', s2.total === 2 && s2.unique_ids === 2, { total: s2.total });
  check('Cierre · Ninguna petición fuera de localhost', externas.length === 0, { externas: [...new Set(externas)] });
} catch (e) {
  check('excepción', false, { error: String(e?.message || e).split('\n')[0] });
} finally {
  await browser.close();
  await srv.cerrar();
  fs.rmSync(TMP, { recursive: true, force: true });
}
const ok = res.checks.every((c) => c.ok);
res.resumen = `${res.checks.filter((c) => c.ok).length}/${res.checks.length}`;
res.totalPasosS = +(res.pasos.reduce((a, p) => a + p.ms, 0) / 1000).toFixed(1);
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/ensayo-demo.json', JSON.stringify(res, null, 2));
console.log(`\n${ok ? 'OK' : 'FALLÓ'} ${res.resumen} · pasos automatizados en ${res.totalPasosS} s`);
process.exit(ok ? 0 : 1);
