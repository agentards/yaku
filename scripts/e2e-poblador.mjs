// E2E del modo poblador (/reportar; también ?vista=poblador) en Android 412×915, flujo A ↔ B de la demo de 3 min:
// A y B sin red reportan (A: casa dañada + personas atrapadas con aviso 116/105; B: casa dañada a 40 m con
// foto comprimida), «Intercambiar» en un paso con CÁMARA SIMULADA (cada cámara ve el QR que dibuja el otro
// celular: canvas.captureStream), B recupera internet y sincroniza solo (sube la foto), la municipalidad
// asigna «Bomberos» (/api SIMULADO con el contrato de servidor-local/) y el estado vuelve a B por internet y a A
// por QR sin red. Compila en una carpeta temporal (no pisa dist/) y sirve en el puerto 4183.
// Deja capturas en docs/evidencia-poblador/ y medidas en results/e2e-poblador.json.
//   node scripts/e2e-poblador.mjs                    → /api SIMULADO en el navegador (vite preview :4183)
//   node scripts/e2e-poblador.mjs --real (o SERVIDOR=real) → servidor-local/ REAL (SQLite en carpeta temporal, :4184, PIN de prueba)
//   (OUT_DIR=… conserva la carpeta temporal del build)
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';

const REAL = process.env.SERVIDOR === 'real' || process.argv.includes('--real');
const PORT = REAL ? 4184 : 4183, BASE = `http://${REAL ? "127.0.0.1" : "localhost"}:${PORT}/`, PIN = 'e2e-poblador-pin';
const TMP = process.env.OUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-poblador-'));
const DIST = path.join(TMP, 'dist');
const OUT = path.resolve('results'), EVID = path.resolve('docs/evidencia-poblador');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(EVID, { recursive: true });
const res = { fecha: new Date().toISOString(), viewport: '412x915 Android', servidor: REAL ? 'servidor-local real (SQLite temporal)' : '/api simulado', checks: [], medidas: {} };
const check = (name, ok, detail = {}) => { res.checks.push({ name, ok: !!ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };
const shot = (p, nombre) => p.screenshot({ path: path.join(EVID, nombre), type: 'jpeg', quality: 78 });

// ---------- build aparte + preview ----------
const t0 = Date.now();
const b = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (b.status !== 0) throw new Error('vite build falló');
res.medidas.buildMs = Date.now() - t0;
function startServer() {
  if (REAL) {
    const p = spawn(process.execPath, ['servidor-local/servidor.ts'], { stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', YAKU_DIST: DIST, YAKU_DATOS: path.join(TMP, 'datos'), MUNI_PIN: PIN } });
    p.stderr.on('data', (d) => process.stderr.write(d));
    return new Promise((ok, ko) => { p.stdout.on('data', (d) => { if (/servidor local en/i.test(String(d))) ok(p); }); p.on('exit', (c) => ko(new Error('servidor salió ' + c))); });
  }
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--outDir', DIST], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  return new Promise((ok, ko) => { p.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) ok(p); }); p.on('exit', (c) => ko(new Error('preview salió ' + c))); });
}
const stopServer = (p) => { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']) : p.kill('SIGTERM'); } catch {} };

// ---------- foto de prueba: 2400×1800 (degradado + ruido), como la de un celular ----------
const FOTO = path.join(TMP, 'foto-prueba.png');
{
  const W = 2400, H = 1800, png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, n = (Math.random() * 40) | 0;
    png.data[i] = 120 + ((x / W) * 100) + n; png.data[i + 1] = 90 + ((y / H) * 80) + n; png.data[i + 2] = 60 + n; png.data[i + 3] = 255;
  }
  fs.writeFileSync(FOTO, PNG.sync.write(png));
  res.medidas.fotoOriginalBytes = fs.statSync(FOTO).size;
}

// ---------- /api SIMULADO (contrato de servidor-local/api.ts) ----------
const api = { reportes: new Map(), fotos: [], estado: new Map(), peticiones: [] };
async function rutaApi(route) {
  const req = route.request(), u = new URL(req.url());
  api.peticiones.push(`${req.method()} ${u.pathname}`);
  const json = (j, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(j) });
  if (req.method() === 'POST' && u.pathname === '/api/sync') {
    const { records } = JSON.parse(req.postData() || '{}');
    let inserted = 0;
    for (const r of records ?? []) if (!api.reportes.has(r.id)) { api.reportes.set(r.id, r); inserted++; }
    return json({ accepted: (records ?? []).map((r) => r.id), inserted, duplicates: (records ?? []).length - inserted });
  }
  if (req.method() === 'GET' && u.pathname === '/api/estado') {
    const ids = (u.searchParams.get('ids') ?? '').split(',').filter(Boolean);
    return json({ estados: ids.map((id) => api.reportes.has(id)
      ? { id, recibido: true, recibido_at: Date.now(), estado: 'nuevo', accion: null, motivo: '', cuando: null, personas: 2, ...api.estado.get(id) }
      : { id, recibido: false }), generado: Date.now() });
  }
  if (req.method() === 'POST' && u.pathname === '/api/fotos') {
    const body = JSON.parse(req.postData() || '{}');
    const bytes = Buffer.from(String(body.data ?? ''), 'base64');
    if (!api.reportes.has(body.report_id) || bytes.length > 400_000) return json({ error: 'no' }, 400);
    api.fotos.push({ report_id: body.report_id, bytes: bytes.length, jpeg: bytes[0] === 0xff && bytes[1] === 0xd8 });
    return json({ id: 'f' + api.fotos.length, url: '/api/fotos/f' + api.fotos.length, bytes: bytes.length });
  }
  if (u.pathname === '/api/stats') return json({ total: api.reportes.size, unique_ids: api.reportes.size });
  if (u.pathname === '/api/reports') return json({ count: 0, reports: [] });
  return route.fulfill({ status: 404, body: 'no' });
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
  const md = navigator.mediaDevices;
  if (md) md.getUserMedia = async (cons) => { window.__camPedida = JSON.stringify(cons?.video ?? null); return c.captureStream(15); };
}

// Lo que el servidor tiene (simulado en memoria o el real por HTTP/disco) y lo que hace la municipalidad.
const servidor = {
  async reportes() { return REAL ? (await (await fetch(BASE + 'api/stats')).json()).total : api.reportes.size; },
  async fotos() {
    if (!REAL) return api.fotos;
    const dir = path.join(TMP, 'datos', 'fotos');
    return fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => { const b = fs.readFileSync(path.join(dir, f)); return { archivo: f, bytes: b.length, jpeg: b[0] === 0xff && b[1] === 0xd8 }; }) : [];
  },
  /** Casas → validado + «Bomberos»; atrapados → en revisión. En el real, por incidente y con PIN. */
  async asignar(casas, atr) {
    if (!REAL) {
      const cuando = Date.now();
      for (const c of casas) api.estado.set(c.id, { estado: 'accion_asignada', accion: 'bomberos', cuando });
      api.estado.set(atr.id, { estado: 'en_revision', cuando });
      return { incidentes: 2, casasEnUno: true };
    }
    const { incidentes } = await (await fetch(BASE + 'api/incidentes', { headers: { 'x-muni-pin': PIN } })).json(); // protegido con PIN
    const post = async (id, body) => {
      const r = await fetch(BASE + `api/incidentes/${encodeURIComponent(id)}/estado`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-muni-pin': PIN }, body: JSON.stringify({ quien: 'Operador e2e', ...body }) });
      if (!r.ok) throw new Error(`POST estado ${r.status}: ${await r.text()}`);
    };
    const incCasa = incidentes.find((i) => casas.every((c) => (i.reportes_ids ?? []).includes(c.id)));
    const incAtr = incidentes.find((i) => (i.reportes_ids ?? []).includes(atr.id));
    res.medidas.incidentes = incidentes.map((i) => ({ tipo: i.tipo, personas: i.personas, reportes: (i.reportes_ids ?? []).length, respaldo: i.respaldo ?? i.puntaje }));
    for (const estado of ['en_revision', 'validado']) await post(incCasa.id, { estado });
    await post(incCasa.id, { estado: 'accion_asignada', accion: 'bomberos' });
    await post(incAtr.id, { estado: 'en_revision' });
    return { incidentes: incidentes.length, casasEnUno: !!incCasa, personasCasa: incCasa?.personas };
  },
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADLESS !== '0' });
const externas = [];
const ANDROID = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, locale: 'es-PE', timezoneId: 'America/Lima', serviceWorkers: 'block', permissions: ['geolocation'] };
const GPS_A = { latitude: -5.19449, longitude: -80.63282, accuracy: 12 };
const GPS_B = { latitude: -5.19449 + 40 / 111320, longitude: -80.63282, accuracy: 9 }; // 40 m al norte de A

async function celular(gps) {
  const ctx = await browser.newContext({ ...ANDROID, geolocation: gps });
  if (!REAL) await ctx.route('**/api/**', rutaApi);
  await ctx.addInitScript(camaraSimulada);
  const p = await ctx.newPage();
  p.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) externas.push(u.host); });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(BASE + 'reportar');
  await p.waitForFunction(() => document.querySelector('.pb')?.dataset.listo === '1', null, { timeout: 30000 });
  return { ctx, p };
}
const est = (p) => p.evaluate(() => window.__yakuPoblador.estado());
async function reportar(p, tipo, { foto = false, nota = '' } = {}) {
  await p.click(`.pb-tipo[data-tipo="${tipo}"]`);
  if (await p.isVisible('[data-v="aviso"]')) await p.click('#pb-aviso-seguir');
  await p.waitForFunction(() => /Ubicación del GPS/.test(document.getElementById("pb-loc-txt").textContent), null, { timeout: 10000 });
  if (foto) {
    await p.setInputFiles('#pb-foto-in', FOTO);
    await p.waitForFunction(() => !!document.querySelector('.pb').dataset.foto, null, { timeout: 20000 });
  }
  if (nota) await p.fill('#pb-nota', nota);
  await p.click('#pb-guardar');
  await p.waitForFunction(() => document.querySelector('.pb').dataset.vista === 'lista');
}
/** Pone los dos celulares frente a frente: cada cámara simulada ve el QR del otro, hasta que se cumpla `hasta`. */
async function frenteAFrente(A, B, hasta, ms = 40000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const [qa, qb] = await Promise.all([A.evaluate(() => document.getElementById('pb-qr').toDataURL()), B.evaluate(() => document.getElementById('pb-qr').toDataURL())]);
    await Promise.all([B.evaluate((u) => window.__camVer(u), qa), A.evaluate((u) => window.__camVer(u), qb)]);
    if (await hasta()) return Date.now() - (fin - ms);
    await A.waitForTimeout(200);
  }
  return -1;
}

try {
  const { ctx: cA, p: A } = await celular(GPS_A);
  const { ctx: cB, p: B } = await celular(GPS_B);

  // 0) primera vez: aviso de datos personales; la app técnica no se ve
  check('Primera vez: aviso de ubicación + código anónimo + art. 315-A, y la app técnica oculta',
    await A.isVisible('#pb-consent') && /315-A/.test(await A.textContent('#pb-consent')) && !(await A.isVisible('body > .top')));
  await shot(A, 'poblador-412-inicio.jpg');
  for (const p of [A, B]) await p.click('#pb-consent-ok');

  // 1) sin red
  await cA.setOffline(true); await cB.setOffline(true);
  await A.waitForTimeout(150);
  check('Sin red: el chip dice SIN RED', (await A.textContent('#pb-red')) === 'SIN RED' && (await B.textContent('#pb-red')) === 'SIN RED');

  // Accesibilidad básica: letra ≥ 18 px y áreas táctiles ≥ 48 px en lo que se toca. La barra inferior es mínima a
  // propósito (nombre de 14 px bajo un ícono, como en los celulares): ahí solo se exige ≥ 14 px, una línea y ≥ 48 px.
  const a11y = await A.evaluate(() => {
    const els = [...document.querySelectorAll('.pb button, .pb a, .pb label.pb-btn, .pb .pb-g span')].filter((e) => e.offsetParent);
    const malos = els.map((e) => ({ t: (e.textContent || '').trim().slice(0, 20), f: parseFloat(getComputedStyle(e).fontSize), h: e.getBoundingClientRect().height, nav: !!e.closest('.pb-nav'), desborda: !!e.closest('.pb-nav') && e.querySelector('span').scrollWidth > e.querySelector('span').clientWidth }))
      .filter((x) => (x.nav ? x.f < 14 : x.f < 18) || x.h < 48 || x.desborda);
    const ps = [...document.querySelectorAll('.pb h1, .pb p.pb-ayuda, .pb .pb-tipo span')].filter((e) => e.offsetParent).map((e) => parseFloat(getComputedStyle(e).fontSize));
    return { n: els.length, malos, minTexto: Math.min(...ps), scrollX: document.documentElement.scrollWidth > innerWidth };
  });
  check('Letra ≥ 18 px (barra inferior ≥ 14 px, en una línea) y botones ≥ 48 px de alto; sin scroll horizontal', a11y.malos.length === 0 && a11y.minTexto >= 18 && !a11y.scrollX, a11y);

  // 2) A: casa dañada; luego personas atrapadas → aviso 116/105 PRIMERO
  await reportar(A, 'vivienda', { nota: 'pared rajada' });
  await A.click('.pb-nav button[data-ir="reportar"]');
  await A.click('.pb-tipo[data-tipo="atrapados"]');
  const aviso = await A.evaluate(() => ({
    visible: !document.querySelector('[data-v="aviso"]').hidden, detalleOculto: document.querySelector('[data-v="detalle"]').hidden,
    t116: document.getElementById('pb-tel-116').getAttribute('href'), t105: document.getElementById('pb-tel-105').getAttribute('href'),
  }));
  check('Atrapados: el aviso 116/105 sale antes del formulario, con enlaces tel:', aviso.visible && aviso.detalleOculto && aviso.t116 === 'tel:116' && aviso.t105 === 'tel:105', aviso);
  await shot(A, 'poblador-412-aviso-116-105.jpg');
  await A.click('#pb-aviso-seguir');
  const sev3 = await A.evaluate(() => document.querySelector('input[name="pb-sev"]:checked').value);
  await A.click('#pb-guardar');
  await A.waitForFunction(() => document.querySelector('.pb').dataset.vista === 'lista');
  // heridos también avisa
  await A.click('.pb-nav button[data-ir="reportar"]');
  await A.click('.pb-tipo[data-tipo="heridos"]');
  const avisoHeridos = !(await A.evaluate(() => document.querySelector('[data-v="aviso"]').hidden));
  await A.click('.pb-nav button[data-ir="lista"]');
  const eA1 = await est(A);
  check('A sin red: 2 reportes guardados en el celular (atrapados con «Muy grave»); heridos también avisa', eA1.mios === 2 && eA1.pendientes === 2 && sev3 === '3' && avisoHeridos, { ...eA1, sev3, avisoHeridos, estados: undefined });
  check('Tarjeta: rótulo «Reporte vecinal · por validar» y «Guardado en tu celular»',
    (await A.textContent('#pb-mios')).includes('Reporte vecinal · por validar') && (await A.textContent('#pb-mios')).includes('Guardado en tu celular'));

  // 3) B: casa dañada a 40 m CON FOTO (en la demo la foto la toma B)
  await B.click('.pb-tipo[data-tipo="vivienda"]');
  await B.waitForFunction(() => /Ubicación del GPS/.test(document.getElementById("pb-loc-txt").textContent), null, { timeout: 10000 });
  const tf = Date.now();
  await B.setInputFiles('#pb-foto-in', FOTO);
  await B.waitForFunction(() => !!document.querySelector('.pb').dataset.foto, null, { timeout: 20000 });
  res.medidas.compresionMs = Date.now() - tf;
  await B.fill('#pb-nota', 'techo caído');
  await shot(B, 'poblador-412-detalle-foto.jpg');
  await B.click('#pb-guardar');
  await B.waitForFunction(() => document.querySelector('.pb').dataset.vista === 'lista');
  const eB1 = await est(B);
  const fB = eB1.fotos[0];
  res.medidas.foto = fB;
  check('Foto comprimida a ≤ 150 KB y guardada en el celular (IndexedDB), lado ≤ 1280 px', fB && fB.bytes <= 150_000 && Math.max(fB.w, fB.h) <= 1280 && !fB.subida,
    { original: res.medidas.fotoOriginalBytes, ...fB, ms: res.medidas.compresionMs });

  // 4) Intercambiar en un paso, ambos sin red
  for (const p of [A, B]) await p.click('.pb-nav button[data-ir="intercambiar"]');
  await A.waitForFunction(() => /Cámara lista/.test(document.getElementById('pb-cam-txt').textContent), null, { timeout: 10000 });
  const camPedida = await A.evaluate(() => window.__camPedida);
  await shot(A, 'poblador-412-intercambiar.jpg');
  const msX = await frenteAFrente(A, B, async () => (await est(A)).completo && (await est(B)).completo);
  res.medidas.intercambioMs = msX;
  const eA2 = await est(A), eB2 = await est(B);
  check('Intercambiar en un paso (mi QR + cámara frontal leyendo el del otro): los dos llevan los 3 reportes', msX > 0 && eA2.total === 3 && eB2.total === 3 && eA2.llevo === 1 && eB2.llevo === 2,
    { ms: msX, A: [eA2.mios, eA2.llevo], B: [eB2.mios, eB2.llevo], lector: eA2.lector, camara: camPedida });
  check('«Listo» visible en los dos celulares', (await A.textContent('#pb-listo')).startsWith('Listo') && (await B.textContent('#pb-listo')).startsWith('Listo'));
  await shot(B, 'poblador-412-intercambio-listo.jpg');

  // 5) mismo hecho, 2 vecinos: el celular lo muestra en palabras, sin número 0–100
  for (const p of [A, B]) await p.click('#pb-terminar');
  const coincide = await B.evaluate(() => [...document.querySelectorAll('.pb-rep[data-tipo="vivienda"]')].map((li) => [li.dataset.vecinos, li.querySelector('.pb-respaldo')?.textContent]));
  check('Casa dañada de A y B (40 m): «2 vecinos lo reportan · 1 foto» en ambas tarjetas', coincide.length === 2 && coincide.every(([n, t]) => n === '2' && t === '2 vecinos lo reportan · 1 foto'), { coincide });
  const sinNumero = !/\b(\d{2,3}) ?\/ ?100\b|respaldo \d/i.test(await B.textContent('.pb-main'));
  check('Al vecino nunca se le muestra el puntaje 0–100', sinNumero);
  await shot(B, 'poblador-412-lista-sin-red.jpg');

  // 6) B recupera internet: se sincroniza solo y sube SU foto
  const antes = await servidor.reportes();
  await cB.setOffline(false);
  await B.waitForFunction(() => window.__yakuPoblador.estado().pendientes === 0, null, { timeout: 15000 });
  await B.waitForFunction(() => window.__yakuPoblador.estado().fotos.every((f) => f.subida), null, { timeout: 15000 });
  const [nRep, fotosSrv] = [await servidor.reportes(), await servidor.fotos()];
  check('B con red: sincroniza solo los 3 (incluye los de A) y sube la foto JPEG ≤ 150 KB', antes === 0 && nRep === 3 && fotosSrv.length === 1 && fotosSrv[0].jpeg && fotosSrv[0].bytes <= 150_000,
    { reportes: nRep, fotos: fotosSrv });

  // 7) la municipalidad valida y asigna «Bomberos» al incidente de las 2 casas; atrapados queda en revisión
  const ids = await B.evaluate(() => window.__yaku.all().then((xs) => xs.map((r) => ({ id: r.id, type: r.type, note: r.note }))));
  const esTipo = (r, t, etiqueta) => r.type === t || r.note.startsWith(etiqueta);
  const casas = ids.filter((r) => esTipo(r, 'vivienda', 'Casa dañada')), atr = ids.find((r) => esTipo(r, 'atrapados', 'Personas atrapadas'));
  const muni = await servidor.asignar(casas, atr);
  check('Servidor: las 2 casas dañadas (2 vecinos, 40 m) son 1 incidente; atrapados va aparte', muni.casasEnUno && muni.incidentes === 2, muni);
  await B.click('#pb-actualizar');
  await B.waitForFunction(() => document.querySelectorAll('.pb-chip-muni').length >= 3, null, { timeout: 10000 });
  const chipsB = await B.evaluate(() => [...document.querySelectorAll('.pb-rep')].map((li) => [li.dataset.tipo, li.querySelector('.pb-chip-muni')?.textContent, li.querySelector('.pb-estado').textContent]));
  check('B: estado de vuelta tras sincronizar: «Bomberos asignados · Asignado por la municipalidad · hh:mm» y atrapados «En revisión»',
    chipsB.filter(([t, c, d]) => t === 'vivienda' && c === 'Bomberos asignados' && /Asignado por la municipalidad · \d{2}:\d{2}$/.test(d)).length === 2
    && chipsB.some(([t, c]) => t === 'atrapados' && c === 'En revisión por la municipalidad'), { chipsB });
  check('Con estado municipal el vecino ve solo el estado (no el rótulo vecinal)', !(await B.textContent('.pb-rep[data-tipo="vivienda"]')).includes('por validar'));
  await shot(B, 'poblador-412-bomberos-asignados.jpg');

  // 8) A sigue SIN RED: B le pasa el estado por QR («YE1») al intercambiar
  for (const p of [A, B]) await p.click('.pb-nav button[data-ir="intercambiar"]');
  await A.waitForFunction(() => /Cámara lista/.test(document.getElementById('pb-cam-txt').textContent), null, { timeout: 10000 });
  const msE = await frenteAFrente(A, B, async () => (await est(A)).estadosRecibidos >= 3);
  await A.click('#pb-terminar');
  const chipsA = await A.evaluate(() => [...document.querySelectorAll('.pb-rep')].map((li) => [li.dataset.tipo, li.querySelector('.pb-chip-muni')?.textContent]));
  check('A sin red recibe por QR el estado: «Bomberos asignados» y «En revisión por la municipalidad»', msE > 0 && !(await A.evaluate(() => navigator.onLine))
    && chipsA.filter(([t, c]) => t === 'vivienda' && c === 'Bomberos asignados').length === 2 && chipsA.some(([t, c]) => t === 'atrapados' && c === 'En revisión por la municipalidad'),
    { ms: msE, chipsA, estadosRecibidos: (await est(A)).estadosRecibidos });
  await shot(A, 'poblador-412-estado-por-qr.jpg');
  await A.evaluate(() => document.querySelector('.pb-main').scrollTo(0, 99999));
  await shot(A, 'poblador-412-pie-legal.jpg');

  // 9) A recupera internet: no duplica nada en el servidor; sube 0 fotos (la foto era de B)
  const rA = await servidor.reportes();
  await cA.setOffline(false);
  await A.waitForFunction(() => window.__yakuPoblador.estado().pendientes === 0, null, { timeout: 15000 });
  check('A con red: sus reportes ya estaban (relevo) → el servidor sigue con 3, sin duplicados', (await servidor.reportes()) === rA && rA === 3, { reportes: rA });

  // 10) rutas: / es la landing (no la app); /app y el enlace viejo /?vista=2d abren la app técnica
  const p2 = await cA.newPage();
  await p2.goto(BASE); await p2.waitForFunction(() => document.body.dataset.landing === '1', null, { timeout: 30000 });
  const landing = await p2.evaluate(() => ({ landing: true, app: !!document.querySelector('#app'), pb: !!document.querySelector('.pb') }));
  await p2.goto(BASE + 'app'); await p2.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  const tecnica = await p2.evaluate(() => ({ top: !!document.querySelector('body > .top')?.offsetParent, pb: !!document.querySelector('.pb') }));
  await p2.goto(BASE + '?vista=2d'); await p2.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  const tecnica2d = await p2.evaluate(() => !document.querySelector('.pb') && location.pathname === '/app');
  check('/ abre la landing; /app y /?vista=2d (→ /app) abren la app técnica', !landing.app && !landing.pb && tecnica.top && !tecnica.pb && tecnica2d, { landing, tecnica, tecnica2d });
  await p2.close();

  // 11) escritorio también funciona (1280×800)
  const cD = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-PE', serviceWorkers: 'block' });
  if (!REAL) await cD.route('**/api/**', rutaApi);
  const D = await cD.newPage();
  await D.goto(BASE + '?vista=poblador'); // enlace viejo: redirige a /reportar
  await D.waitForFunction(() => document.querySelector('.pb')?.dataset.listo === '1', null, { timeout: 30000 });
  await D.click('#pb-consent-ok');
  await D.screenshot({ path: path.join(EVID, 'poblador-1280-inicio.jpg'), type: 'jpeg', quality: 75 });
  check('Escritorio 1280×800: 9 botones de tipo en 3 columnas', await D.evaluate(() => getComputedStyle(document.querySelector('.pb-grid')).gridTemplateColumns.split(' ').length === 3 && document.querySelectorAll('.pb-tipo').length === 9));
  await cD.close();

  check('Ninguna petición fuera de localhost', externas.length === 0, { externas: [...new Set(externas)] });
  res.medidas.peticionesApi = [...new Set(api.peticiones)];
} catch (e) {
  check('excepción', false, { error: String(e?.message || e).split('\n')[0], linea: String(e?.stack || '').split('\n').find((l) => l.includes('e2e-poblador')) });
  for (const pg of browser.contexts().flatMap((c) => c.pages())) {
    try { console.log('diag', JSON.stringify(await pg.evaluate(() => ({ vista: document.querySelector('.pb')?.dataset.vista, sy: scrollY, sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, vv: visualViewport && [visualViewport.width, visualViewport.height, visualViewport.offsetTop, visualViewport.scale], nav: document.querySelector('.pb-nav')?.getBoundingClientRect().toJSON(), pb: document.querySelector('.pb')?.getBoundingClientRect().toJSON(), main: document.querySelector('.pb-main')?.scrollTop })))); await pg.screenshot({ path: path.join(TMP, '..', 'yaku-poblador-fallo.png') }); } catch {}
  }
} finally {
  await browser.close();
  stopServer(server);
  if (!process.env.OUT_DIR) fs.rmSync(TMP, { recursive: true, force: true });
}
const ok = res.checks.every((c) => c.ok);
res.resumen = `${res.checks.filter((c) => c.ok).length}/${res.checks.length}`;
fs.writeFileSync(path.join(OUT, REAL ? 'e2e-poblador-servidor-real.json' : 'e2e-poblador.json'), JSON.stringify(res, null, 2));
console.log(`\n${ok ? 'OK' : 'FALLÓ'} ${res.resumen}`);
process.exit(ok ? 0 : 1);
