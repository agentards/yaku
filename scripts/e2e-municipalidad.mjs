// E2E de la pantalla de la municipalidad (?vista=municipalidad) contra el SERVIDOR LOCAL real (servidor-local/,
// SQLite en una carpeta temporal fuera del repo, PIN de prueba). Dos vecinos reportan el mismo hecho → 1 incidente
// con contador 1 → 2 (animado), foto en la galería, atrapados arriba, Validar + «Bomberos» con PIN (incorrecto y
// correcto) que persiste tras recargar y vuelve al celular por /api/estado, descarte con motivo y modo solo lectura
// si el servidor no tiene /api/incidentes. Datos de prueba etiquetados SIMULADO. Capturas 1920×1080 en docs/evidencia-3d/.
//   npm run e2e:municipalidad        (vite build + este script; Node ≥ 23.6 importa los .ts directo)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { iniciar } from '../servidor-local/servidor.ts';
import { makeObservation } from '../src/codec.ts';

const PORT = Number(process.env.PORT_E2E ?? 8097), BASE = `http://localhost:${PORT}/`;
const OUT = path.resolve('results'), EVID = path.resolve('docs/evidencia-3d');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-e2e-muni-'));
const PIN = 'e2e-' + Math.random().toString(36).slice(2, 8);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(EVID, { recursive: true });
const res = { fecha: new Date().toISOString(), servidor: 'servidor-local (SQLite temporal)', checks: [] };
const check = (name, ok, detail = {}) => { res.checks.push({ name, ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };

const srv = iniciar({ puerto: PORT, host: '127.0.0.1', datos: DATOS, pin: PIN, silencioso: true });
await srv.listo;
const api = (p, o) => fetch(`http://127.0.0.1:${PORT}${p}`, o).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const ahoraS = () => Math.floor(Date.now() / 1000);
const obs = (type, lat, lon, deviceId, note, severity = 2, ts = ahoraS() - 30) => makeObservation({ type, severity, lat, lon, note: 'SIMULADO e2e: ' + note, ts, deviceId });
const sync = (records) => api('/api/sync', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ records }) });
const incidentes = async () => (await api('/api/incidentes')).body?.incidentes ?? [];

// Punto del ejemplo: Castilla (Piura). A y B a ~30 m.
const A = obs('vivienda', -5.18801, -80.61002, 'pobla001', 'casa con el techo caído');
const B = obs('vivienda', -5.18774, -80.61002, 'poblb002', 'misma casa, pared rajada', 3);
const ATR = obs('atrapados', -5.08470, -80.16260, 'poblc003', 'familia en el techo (con foto)', 3); // la foto no llega: «1 foto pendiente de subir»
const PREVIO = obs('agua', -5.19449, -80.63282, 'pobld004', 'agua en la calle', 1, ahoraS() - 600);

const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADLESS !== '0', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
try {
  await sync([PREVIO]);
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'es-PE', timezoneId: 'America/Lima', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const externas = [], apiPeticiones = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) externas.push(r.url());
    if (u.pathname.startsWith('/api/')) apiPeticiones.push({ m: r.method(), p: u.pathname, pin: r.headers()['x-muni-pin'] ? 'sí' : 'no' });
  });
  const est = () => page.evaluate(() => window.__yakuMuni.estado());
  const esperar = (fn, arg, ms = 9000) => page.waitForFunction(fn, arg, { timeout: ms });

  // 1) Al abrir: el incidente previo está en la lista, sin vuelo ni tarjeta.
  await page.goto(BASE + '?vista=municipalidad');
  await esperar(() => window.__yakuMuni?.estado().sembrado, null, 30000);
  const s0 = await est();
  check('mismo origen: lee /api/incidentes del servidor local (sin agrupar en pantalla)', s0.fuente === 'incidentes' && s0.incidentes.length === 1, { fuente: s0.fuente, n: s0.incidentes.length });
  check('al abrir: incidentes previos en la lista, sin tarjeta ni vuelo', s0.nuevos.length === 0 && !(await page.isVisible('.muni-tarjeta')) && (await page.locator('.muni-lista li[data-id]').count()) === 1);
  const hay3D = await page.evaluate(() => !!window.__yakuMuni.escena());
  if (hay3D) await page.evaluate(() => window.__yakuMuni.escena().listo);
  const capas = await page.evaluate(() => { const m = window.__yakuMuni.escena()?.map; return m ? { terreno: !!m.getTerrain(), cenepred: !!m.getLayer('cenepred-ccpp'), citizen: !!m.getLayer('citizen-dot') } : null; });
  check('mapa 3D con relieve y capas reales (servido por el servidor local con Range)', !!capas && capas.terreno && capas.cenepred && capas.citizen, { capas });
  await page.click('.muni-sonido');

  // 2) Vecino A sincroniza: incidente NUEVO con 1 vecino → vuelo + tarjeta.
  await sync([A]);
  await esperar(() => window.__yakuMuni.estado().nuevos.length === 1);
  const s1 = await est();
  const incA = s1.incidentes.find((i) => i.tipo === 'vivienda');
  const t1 = (await page.locator('.muni-tarjeta').innerText()).replace(/\s+/g, ' ');
  check('incidente nuevo: tarjeta con rótulo vecinal, respaldo y «1 vecino · 0 fotos · primer reporte hh:mm»', s1.actual === incA?.id && /Reporte vecinal · por validar/.test(t1) && /Respaldo 25 · N1/.test(t1) && /1 vecino · 0 fotos · primer reporte \d\d:\d\d/.test(t1) && /no una alerta oficial/.test(t1), { tarjeta: t1.slice(0, 260) });
  if (hay3D) {
    await esperar(() => window.__yakuMuni.estado().fase === 'orbita', null, 15000).catch(() => {});
    const cam = await page.evaluate(([lon, lat]) => { const m = window.__yakuMuni.escena().map, c = m.getCenter(); return { fase: window.__yakuMuni.estado().fase, dLon: Math.abs(c.lng - lon), dLat: Math.abs(c.lat - lat), pitch: +m.getPitch().toFixed(1) }; }, [A.lon, A.lat]);
    check('la cámara vuela al incidente nuevo y queda en órbita lenta', cam.fase === 'orbita' && cam.dLon < 0.02 && cam.dLat < 0.02 && cam.pitch > 50, cam);
  }

  // 3) Vecino B recupera internet: sube su reporte y el de A (relevo por QR) + su foto → coincide, contador 1 → 2.
  const foto = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 480; c.height = 360; const g = c.getContext('2d'); g.fillStyle = '#8a7a64'; g.fillRect(0, 0, 480, 360); g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.fillText('FOTO SIMULADA', 100, 170); g.font = '22px sans-serif'; g.fillText('E2E · casa dañada', 140, 210); return c.toDataURL('image/jpeg', 0.7); });
  const dup = await sync([A, B]);
  const subida = await api('/api/fotos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reportId: B.id, data: foto }) });
  check('servidor: A duplicado no se repite (relevo) y la foto de B sube', dup.body?.inserted === 1 && dup.body?.duplicates === 1 && subida.status === 200, { sync: dup.body, foto: subida.status });
  await esperar((id) => window.__yakuMuni.estado().incidentes.find((i) => i.id === id)?.personas === 2, incA.id);
  const animado = await page.locator('.muni-t-cont.sube, .muni-i-cont.sube').count();
  const rodillo = await page.locator('.muni-t-cont .muni-k-personas .muni-rod-sube .muni-rod-c[data-de="1"]').count();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(EVID, 'municipalidad-rodillo-1-a-2.jpg'), type: 'jpeg', quality: 80, clip: await page.locator('.muni-tarjeta').boundingBox() });
  const s2 = await est();
  const i2 = s2.incidentes.find((i) => i.id === incA.id);
  const toast = await page.locator('.muni-toast-coincide').allInnerTexts();
  check('2 reportes cercanos = 1 incidente con contador 2 (sin duplicar)', s2.incidentes.filter((i) => i.tipo === 'vivienda').length === 1 && i2.personas === 2 && i2.nFotos === 1 && s2.nuevos.length === 1, { personas: i2.personas, fotos: i2.nFotos, puntaje: i2.puntaje });
  check('el contador se anima cuando otro vecino coincide (+ aviso «Otro vecino coincide»)', animado >= 1 && toast.some((t) => /Otro vecino coincide.*2 vecinos/.test(t)) && s2.coincidencias >= 1, { animado, toast });
  check('rodillo 1 → 2 vecinos en la tarjeta (el 1 sale, entra el 2; innerText solo «2 vecinos»)', rodillo === 1, { rodillo });
  const t2 = (await page.locator('.muni-tarjeta').innerText()).replace(/\s+/g, ' ');
  check('tarjeta: «2 vecinos · 1 foto», detalle y desglose del respaldo', /2 vecinos · 1 foto · primer reporte/.test(t2) && /2 vecinos lo reportan · 1 foto|2 vecinos coinciden/.test(t2) && /Personas 40 · Fotos 15 · Cercanía \d+ · Recencia/.test(t2), { tarjeta: t2.slice(0, 300) });
  await page.waitForFunction(() => { const img = document.querySelector('.muni-tarjeta .muni-foto img'); return img && img.complete && img.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
  const galeria = await page.evaluate(() => { const img = document.querySelector('.muni-tarjeta .muni-foto img'); return img ? { w: img.naturalWidth, src: new URL(img.src).pathname } : null; });
  check('galería: la foto se ve desde GET /api/fotos/:id', !!galeria && galeria.w === 480 && /^\/api\/fotos\/[0-9a-f]{20}$/.test(galeria.src), { galeria });
  await page.click('.muni-tarjeta .muni-foto');
  const full = await page.locator('.muni-galeria-full').isVisible();
  const cap = await page.locator('.muni-galeria-full figcaption').innerText();
  await page.keyboard.press('Escape');
  check('galería a pantalla completa con leyenda «enviada por un vecino · por validar» y cierra con Esc', full && /vecino/.test(cap) && !(await page.locator('.muni-galeria-full').isVisible()), { cap });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(EVID, 'municipalidad-1920-incidente-2-vecinos.jpg'), type: 'jpeg', quality: 78 });

  // 4) Atrapados: incidente nuevo de riesgo de vida → arriba de la lista y aviso 116/105.
  await sync([ATR]);
  await esperar(() => window.__yakuMuni.estado().nuevos.length === 2);
  const orden = await page.locator('.muni-lista li[data-id]').evaluateAll((l) => l.map((x) => x.querySelector('b').textContent));
  const t4 = (await page.locator('.muni-tarjeta').innerText()).replace(/\s+/g, ' ');
  check('prioridad: personas atrapadas arriba, aviso 116 / 105 y vuelo al nuevo', orden[0] === 'Personas atrapadas' && /116/.test(t4) && /105/.test(t4) && (await est()).actual?.startsWith('inc-'), { orden });
  check('marca «con foto» sin imagen recibida: «1 foto pendiente de subir» y respaldo sin fotos', /1 foto pendiente de subir/.test(t4) && /Fotos 0 · /.test(t4) && /Respaldo 25 · N1/.test(t4), { tarjeta: t4.slice(0, 200) });

  // 5) Acciones con PIN sobre el incidente de la casa: Validar (PIN incorrecto → correcto) y asignar Bomberos.
  await page.click(`.muni-lista li[data-id="${incA.id}"] .muni-item`);
  await page.click('.muni-tarjeta .muni-acc[data-destino="validado"]');
  await page.fill('.muni-dlg-pin input[name="quien"]', 'Operador SIMULADO');
  await page.fill('.muni-dlg-pin input[name="pin"]', 'pin-malo');
  await page.click('.muni-dlg-pin button[value="ok"]');
  await page.waitForSelector('.muni-dlg-pin[open]', { timeout: 8000 });
  const errPin = await page.locator('.muni-dlg-error').innerText();
  await page.fill('.muni-dlg-pin input[name="pin"]', PIN);
  await page.click('.muni-dlg-pin button[value="ok"]');
  await esperar((id) => window.__yakuMuni.estado().incidentes.find((i) => i.id === id)?.estado === 'validado', incA.id);
  check('PIN incorrecto se rechaza (403) y se vuelve a pedir; con el correcto queda «Validado por la municipalidad»', /PIN incorrecto/.test(errPin) && /Validado por la municipalidad/.test(await page.locator('.muni-tarjeta').innerText()), { errPin });
  await page.click('.muni-tarjeta .muni-acc[data-accion="bomberos"]');
  await esperar((id) => window.__yakuMuni.estado().incidentes.find((i) => i.id === id)?.accion === 'bomberos', incA.id);
  const srvInc = (await incidentes()).find((i) => i.id === incA.id);
  check('servidor: validado → acción «bomberos», con quién y cuándo en el historial', srvInc.estado === 'accion_asignada' && srvInc.accion === 'bomberos' && srvInc.historial.map((h) => h.estado).join('>') === 'en_revision>validado>accion_asignada' && srvInc.historial.every((h) => h.quien === 'Operador SIMULADO' && h.cuando > 0) && srvInc.respaldo_congelado === true, { historial: srvInc.historial.map((h) => h.estado), congelado: srvInc.respaldo_congelado });
  const acuse = (await api(`/api/estado?ids=${B.id}`)).body;
  const acuseB = (Array.isArray(acuse) ? acuse : acuse?.estados ?? acuse?.reportes ?? [])[0];
  check('el estado vuelve al celular de B por /api/estado (acuse)', acuseB?.estado === 'accion_asignada' && acuseB?.accion === 'bomberos', { acuseB });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(EVID, 'municipalidad-1920-bomberos-asignados.jpg'), type: 'jpeg', quality: 78 });

  // 6) Descartar con motivo (incidente previo).
  const previo = (await incidentes()).find((i) => i.tipo === 'agua');
  await page.click(`.muni-lista li[data-id="${previo.id}"] .muni-item`);
  await page.click('.muni-tarjeta .muni-acc[data-destino="descartado"]');
  await page.selectOption('.muni-dlg-descartar select', { index: 1 });
  await page.fill('.muni-dlg-descartar input[name="detalle"]', 'prueba e2e');
  await page.click('.muni-dlg-descartar button[value="ok"]');
  await esperar((id) => window.__yakuMuni.estado().incidentes.find((i) => i.id === id)?.estado === 'descartado', previo.id);
  const srvPrev = (await incidentes()).find((i) => i.id === previo.id);
  check('descartar pide motivo, pasa por «en revisión» y queda «Revisado por la municipalidad», al final de la lista', srvPrev.estado === 'descartado' && /prueba e2e/.test(srvPrev.motivo) && (await page.locator('.muni-lista li[data-id]').last().getAttribute('data-id')) === previo.id, { motivo: srvPrev.motivo });

  // 7) Persistencia: recargar la pantalla mantiene estados y acción (vienen de SQLite).
  await page.reload();
  await esperar(() => window.__yakuMuni?.estado().sembrado, null, 30000);
  const s7 = await est();
  const lista7 = await page.locator('.muni-lista').innerText();
  check('tras recargar: «Bomberos asignados» y el descarte persisten', s7.incidentes.find((i) => i.id === incA.id)?.accion === 'bomberos' && /Bomberos asignados/.test(lista7) && s7.incidentes.find((i) => i.id === previo.id)?.estado === 'descartado' && s7.nuevos.length === 0);
  const posts = apiPeticiones.filter((r) => r.m === 'POST');
  check('las escrituras desde la pantalla son solo POST /api/incidentes/:id/estado y siempre con PIN', posts.length >= 5 && posts.every((r) => /^\/api\/incidentes\/[^/]+\/estado$/.test(r.p) && r.pin === 'sí'), { posts: posts.length });
  check('cero peticiones a CDN o servicios externos', externas.length === 0, { externas: externas.slice(0, 5) });
  if (hay3D) res.fps = await page.evaluate(async () => { const m = window.__yakuMuni.escena().map; await window.__yakuMuni.escena().listo; m.triggerRepaint(); const t = []; let last = performance.now(); const f = () => { const n = performance.now(); t.push(n - last); last = n; }; m.on('render', f); const id = setInterval(() => m.triggerRepaint(), 0); await new Promise((r) => setTimeout(r, 3000)); clearInterval(id); m.off('render', f); return { cuadros: t.length, fps: +(t.length / 3).toFixed(1) }; });
  await ctx.close();

  // 8) Servidor sin /api/incidentes (producción actual): agrupa /api/reports en pantalla, solo lectura.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-PE', timezoneId: 'America/Lima', serviceWorkers: 'block' });
  await ctx2.route('**/api/incidentes', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no encontrado"}' }));
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '?vista=municipalidad');
  await p2.waitForFunction(() => window.__yakuMuni?.estado().sembrado, null, { timeout: 30000 });
  const s8 = await p2.evaluate(() => window.__yakuMuni.estado());
  await p2.click('.muni-lista li[data-id] .muni-item');
  const t8 = await p2.locator('.muni-tarjeta').innerText();
  check('sin /api/incidentes: agrupa en pantalla (A+B = 1 incidente de 2 vecinos) y desactiva las acciones', s8.fuente === 'agrupado-en-pantalla' && s8.incidentes.some((i) => i.tipo === 'vivienda' && i.personas === 2) && (await p2.locator('.muni-acc').count()) === 0 && /solo lectura/.test(t8), { fuente: s8.fuente, n: s8.incidentes.length });
  await ctx2.close();

  // 9) La vista 2D predeterminada no cambia.
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const p3 = await ctx3.newPage();
  await p3.goto(BASE);
  await p3.waitForSelector('body[data-ready="1"]', { timeout: 30000 }).catch(() => {});
  check('/ sigue en 2D sin la pantalla de la municipalidad', (await p3.locator('.muni').count()) === 0 && (await p3.evaluate(() => document.body.dataset.vista)) === '2d');
  await ctx3.close();
} finally {
  await browser.close();
  await srv.cerrar();
  fs.rmSync(DATOS, { recursive: true, force: true });
  fs.writeFileSync(path.join(OUT, 'e2e-municipalidad.json'), JSON.stringify(res, null, 2));
  const ko = res.checks.filter((c) => !c.ok).length;
  console.log(`\n${res.checks.length - ko}/${res.checks.length} verificaciones · fps: ${JSON.stringify(res.fps)}`);
  process.exitCode = ko ? 1 : 0;
}
