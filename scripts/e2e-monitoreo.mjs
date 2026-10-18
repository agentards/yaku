// E2E del «Yaku 3D · Centro de monitoreo» (/municipalidad; /?vista=incidentes|municipalidad|portal redirigen) contra el SERVIDOR LOCAL REAL
// (servidor-local/, SQLite temporal fuera del repo) con acceso por PIN. Criterios de
// agentards/producto/plan-centro-monitoreo.md: login → 2 reportes cercanos de 2 dispositivos = 1 incidente «2 vecinos» →
// vuelo + tarjeta + sonido → Validar + «Bomberos» persiste tras recargar → el poblador ve «Bomberos asignados» por
// /api/estado → la línea de tiempo muestra los 2 reportes y el cambio de estado → cero peticiones a CDN externos.
// Datos de prueba etiquetados SIMULADO. Capturas 1920×1080 en docs/evidencia-3d/monitoreo-*.jpg.
//   npm run build && node scripts/e2e-monitoreo.mjs      (PORT_E2E=8099 por defecto; Node ≥ 23.6 importa .ts)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accederConPin } from './acceso-pin.mjs';
import { iniciar } from '../servidor-local/servidor.ts';
import { makeObservation } from '../src/codec.ts';
import { ESTADO as ESTADO_POBLADOR } from '../src/poblador/textos.ts';

const PORT = Number(process.env.PORT_E2E ?? 8099), BASE = `http://localhost:${PORT}/`;
const OUT = path.resolve('results'), EVID = path.resolve('docs/evidencia-3d');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-e2e-mon-'));
const PIN = 'e2e-' + Math.random().toString(36).slice(2, 8);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(EVID, { recursive: true });
const res = { fecha: new Date().toISOString(), servidor: 'servidor-local (SQLite temporal, modo PIN)', checks: [] };
const check = (name, ok, detail = {}) => { res.checks.push({ name, ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail).slice(0, 400)); };

const srv = iniciar({ puerto: PORT, host: '127.0.0.1', datos: DATOS, pin: PIN, silencioso: true });
await srv.listo;
const api = (p, o = {}) => fetch(`http://127.0.0.1:${PORT}${p}`, o).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const conPin = { 'x-muni-pin': PIN };
const ahoraS = () => Math.floor(Date.now() / 1000);
const obs = (type, lat, lon, deviceId, note, severity = 2, ts = ahoraS() - 30) => makeObservation({ type, severity, lat, lon, note: 'SIMULADO e2e: ' + note, ts, deviceId });
const sync = (records) => api('/api/sync', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ records }) });
const incidentes = async () => (await api('/api/incidentes', { headers: conPin })).body?.incidentes ?? [];

// Castilla (Piura): A y B a ~30 m, de dos celulares distintos. PREVIO: un reporte anterior a abrir la pantalla.
const PREVIO = obs('agua', -5.19449, -80.63282, 'pobld004', 'agua en la calle', 1, ahoraS() - 900);
const A = obs('vivienda', -5.18801, -80.61002, 'pobla001', 'casa con el techo caído');
const B = obs('vivienda', -5.18774, -80.61002, 'poblb002', 'misma casa, pared rajada', 3);

const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADLESS !== '0', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const foto = async (page, nombre) => { await page.screenshot({ path: path.join(EVID, `monitoreo-${nombre}.jpg`), type: 'jpeg', quality: 80 }); };
try {
  await sync([PREVIO]);
  await new Promise((r) => setTimeout(r, 1200)); // el previo llega antes, con su propia hora de llegada
  check('servidor protegido: GET /api/incidentes sin credencial = 401', (await api('/api/incidentes')).status === 401);

  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'es-PE', timezoneId: 'America/Lima', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const externas = [], apiPet = [], errores = [];
  page.on('pageerror', (e) => errores.push(String(e.message).slice(0, 200)));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) externas.push(r.url());
    if (u.pathname.startsWith('/api/')) apiPet.push({ m: r.method(), p: u.pathname + (u.search.includes('desde') ? '?desde' : ''), pin: r.headers()['x-muni-pin'] === PIN });
  });
  const est = () => page.evaluate(() => window.__yakuMonitoreo.estado());
  const esperar = (fn, arg, ms = 10000) => page.waitForFunction(fn, arg, { timeout: ms });

  // 1) Acceso con PIN → Centro de monitoreo con el histórico real.
  await page.goto(BASE + 'municipalidad');
  const textoAcceso = await page.locator('.ycm-acc').innerText({ timeout: 30000 });
  await accederConPin(page, { nombre: 'Operador SIMULADO', pin: PIN });
  await esperar(() => window.__yakuMonitoreo?.estado().sembrado, null, 30000);
  await page.evaluate(() => window.__yakuMonitoreo.escena.listo);
  await esperar(() => document.body.dataset.v3d === 'listo', null, 30000);
  const s0 = await est();
  const tPrevio = (await api(`/api/reports?ids=${PREVIO.id}`)).body.reports[0].received_at;
  check('login con «Acceso del personal municipal» (nombre + PIN) y sesión en la cabecera', /Acceso del personal municipal/.test(textoAcceso) && s0.sesion.modo === 'pin' && /PIN · Operador SIMULADO/.test(await page.locator('.mon-usuario').innerText()), { sesion: s0.sesion });
  const cab = (await page.locator('.v3d-top').innerText()).replace(/\s+/g, ' ');
  check('cabecera: «Yaku 3D · Centro de monitoreo», chip del escenario, «En vivo · consulta cada 3 s», pestañas Incidentes · Campo · Escenario, Vista 2D',
    /Yaku 3D · Centro de monitoreo/.test(cab) && /Aviso 421/.test(cab) && /En vivo · consulta cada 3 s · \d\d:\d\d:\d\d/.test(cab) && /Incidentes/.test(cab) && /Campo/.test(cab) && /Escenario/.test(cab) && /Vista 2D/.test(cab), { cab });
  check('histórico real: el reporte previo ya está (sin vuelo ni tarjeta) y la línea arranca en él, no en 17–19/10', s0.incidentes.length === 1 && s0.nuevos.length === 0 && !(await page.isVisible('[data-tarjeta]'))
    && s0.rango[0] <= tPrevio && tPrevio - s0.rango[0] <= 10 * 60_000 && s0.rango[1] - s0.rango[0] < 6 * 3600_000 && s0.enVivo, { rango: s0.rango.map((x) => new Date(x).toISOString()), n: s0.incidentes.length });
  const cuerpo = await page.evaluate(() => document.body.innerText);
  check('sin datos fijos de demo: nada de «Modo demo», «Reproducir relevo» ni fichas de ensayo', !/Modo demo|Reproducir relevo|ficha de ensayo/i.test(cuerpo));
  const capas = await page.evaluate(() => { const m = window.__yakuMonitoreo.escena.map; return { terreno: !!m.getTerrain(), cenepred: !!m.getLayer('cenepred-ccpp'), citizen: !!m.getLayer('citizen-dot'), color: JSON.stringify(m.getPaintProperty('citizen-dot', 'circle-color')).includes('grupo') }; });
  check('escena 3D con relieve, capas oficiales y marcadores coloreados por estado/prioridad', capas.terreno && capas.cenepred && capas.citizen && capas.color, capas);
  await page.click('[data-sonido]');
  await page.waitForTimeout(1500);
  await foto(page, '1-inicio');

  // 2) Vecino A: incidente NUEVO → vuelo + marcador pulsante + tarjeta + sonido.
  const sonAntes = (await est()).avisos;
  await sync([A]);
  await esperar(() => window.__yakuMonitoreo.estado().nuevos.length === 1);
  const s1 = await est();
  const incA = s1.incidentes.find((i) => i.tipo === 'vivienda');
  const t1 = (await page.locator('[data-tarjeta]').innerText()).replace(/\s+/g, ' ');
  check('incidente nuevo: tarjeta flotante con tipo, «Reporte vecinal · por validar», «llegó hace N s», vecinos y respaldo',
    s1.actual === incA?.id && /Casa dañada o caída/.test(t1) && /Reporte vecinal · por validar/.test(t1) && /llegó hace \d+ s/.test(t1) && /1 vecino · 0 fotos · primer reporte \d\d:\d\d/.test(t1) && /Respaldo \d+ · N1/.test(t1), { tarjeta: t1.slice(0, 260) });
  check('aviso sonoro (WebAudio) y marcador pulsante sobre el incidente', s1.avisos === sonAntes + 1 && (await page.locator('.mon-pulso').count()) === 1, { avisos: s1.avisos });
  await esperar(() => window.__yakuMonitoreo.estado().fase === 'orbita', null, 20000).catch(() => {});
  const cam = await page.evaluate(([lon, lat]) => { const m = window.__yakuMonitoreo.escena.map, c = m.getCenter(); return { fase: window.__yakuMonitoreo.estado().fase, dLon: Math.abs(c.lng - lon), dLat: Math.abs(c.lat - lat), pitch: +m.getPitch().toFixed(1) }; }, [A.lon, A.lat]);
  check('la cámara vuela al incidente y queda en órbita lenta', cam.fase === 'orbita' && cam.dLon < 0.02 && cam.dLat < 0.02 && cam.pitch > 50, cam);
  await foto(page, '2-incidente-nuevo');

  // 3) Vecino B (otro celular, ~30 m): mismo incidente, contador 1 → 2 animado.
  await sync([B]);
  await esperar((id) => window.__yakuMonitoreo.estado().incidentes.find((i) => i.id === id)?.personas === 2, incA.id);
  const rodillo = await page.locator('[data-tarjeta] .mon-k-personas .muni-rod-sube .muni-rod-c[data-de="1"]').count();
  const toast = await page.locator('.mon-toast-coincide').allInnerTexts();
  const s2 = await est();
  check('2 reportes cercanos de 2 dispositivos = 1 incidente «2 vecinos»', s2.incidentes.filter((i) => i.tipo === 'vivienda').length === 1 && s2.incidentes.find((i) => i.id === incA.id).reportes === 2 && s2.nuevos.length === 1, { incidentes: s2.incidentes });
  check('el contador se anima (rodillo 1 → 2) y avisa «Otro vecino coincide»', rodillo === 1 && toast.some((t) => /Otro vecino coincide.*2 vecinos/.test(t)) && s2.coincidencias >= 1, { rodillo, toast });
  const lista = (await page.locator('[data-lista]').innerText()).replace(/\s+/g, ' ');
  check('pestaña Incidentes: lista por prioridad con «2 vecinos · 0 fotos · primer reporte hh:mm», respaldo y estado', /2 vecinos · 0 fotos · primer reporte \d\d:\d\d/.test(lista) && /Respaldo \d+ · N2/.test(lista) && (await page.locator('[data-tab=incidentes] [data-n]').innerText()) === '2', { lista: lista.slice(0, 200) });
  await page.waitForTimeout(900);
  await foto(page, '3-dos-vecinos');

  // 4) Validar (con confirmación) y asignar «Bomberos» desde la tarjeta flotante.
  await page.click('[data-tarjeta] .mon-acc[data-destino="validado"]');
  await page.waitForSelector('[data-dlg-confirmar][open]');
  const conf = await page.locator('[data-dlg-confirmar]').innerText();
  await page.click('[data-dlg-confirmar] button[value="ok"]');
  await esperar((id) => window.__yakuMonitoreo.estado().incidentes.find((i) => i.id === id)?.estado === 'validado', incA.id);
  check('acción con confirmación: «Validar» dice quién y a qué hora queda registrado', /Validar/.test(conf) && /Operador SIMULADO/.test(conf), { conf: conf.replace(/\s+/g, ' ').slice(0, 200) });
  await page.click('[data-tarjeta] .mon-acc[data-accion="bomberos"]');
  await page.click('[data-dlg-confirmar] button[value="ok"]');
  await esperar((id) => window.__yakuMonitoreo.estado().incidentes.find((i) => i.id === id)?.accion === 'bomberos', incA.id);
  const srvInc = (await incidentes()).find((i) => i.id === incA.id);
  check('servidor: en revisión → validado → bomberos, con quién y cuándo (cabecera X-Muni-Pin)', srvInc.estado === 'accion_asignada' && srvInc.accion === 'bomberos' && srvInc.historial.map((h) => h.estado).join('>') === 'en_revision>validado>accion_asignada' && srvInc.historial.every((h) => h.quien === 'Operador SIMULADO')
    && apiPet.filter((p) => p.m === 'POST').every((p) => p.pin), { historial: srvInc.historial.map((h) => h.estado) });
  const acuse = (await api(`/api/estado?ids=${B.id}`)).body?.estados?.[0];
  const textoPoblador = ESTADO_POBLADOR.accion(acuse?.accion);
  check('el poblador ve «Bomberos asignados» en /api/estado', acuse?.estado === 'accion_asignada' && acuse?.accion === 'bomberos' && /Bomberos asignados/.test(textoPoblador), { acuse, textoPoblador });
  await page.waitForTimeout(800);
  await foto(page, '4-bomberos');

  // 5) Persistencia: recargar (vuelve a pedir acceso) mantiene estado y acción (SQLite).
  await page.reload();
  await accederConPin(page, { nombre: 'Operador SIMULADO', pin: PIN });
  await esperar(() => window.__yakuMonitoreo?.estado().sembrado, null, 30000);
  const s5 = await est();
  const i5 = s5.incidentes.find((i) => i.id === incA.id);
  check('Validar + «Bomberos» persiste tras recargar', i5?.estado === 'accion_asignada' && i5?.accion === 'bomberos' && /Bomberos asignados/.test(await page.locator('[data-lista]').innerText()), { i5 });

  // 6) Línea de tiempo con el histórico real: 3 reportes + 3 cambios de estado; el cabezal muestra el pasado.
  await esperar(() => document.querySelectorAll('[data-ev-est]').length >= 3, null, 10000).catch(() => {});
  const marcas = await page.evaluate(() => ({ rep: document.querySelectorAll('[data-ev-rep]').length, est: document.querySelectorAll('[data-ev-est]').length }));
  check('línea de tiempo: marcas de los reportes recibidos y de los cambios de estado', marcas.rep === 3 && marcas.est === 3, marcas);
  const tA = (await api(`/api/reports?ids=${A.id}`)).body.reports[0].received_at, tB = (await api(`/api/reports?ids=${B.id}`)).body.reports[0].received_at;
  const irA = (t) => page.evaluate((t) => { const p = document.querySelector('.v3d-pista'), r = p.getBoundingClientRect(), [a, b] = window.__yakuMonitoreo.tienda.rango; return { x: r.left + ((t - a) / (b - a)) * r.width, y: r.top + 6 }; }, t);
  let p = await irA(tA + (tB - tA) / 2);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(400);
  const s6 = await est();
  const i6 = s6.incidentes.find((i) => i.id === incA.id);
  check('cabezal entre A y B: el mapa y los contadores vuelven a ese momento (1 vecino, sin revisar)', !s6.enVivo && i6?.personas === 1 && i6?.estado === 'nuevo' && /viendo el/.test(await page.locator('[data-momento]').innerText()), { i6, enVivo: s6.enVivo });
  const graf = (await page.locator('[data-g="reportes"]').innerText()).replace(/\s+/g, ' ');
  check('gráficos sincronizados: «Reportes y vecinos» en ese momento (2 reportes de 2 vecinos)', /Reportes recibidos 2/.test(graf) && /Vecinos distintos 2/.test(graf), { graf });
  await page.click(`[data-lista] li[data-id="${incA.id}"] .mon-item`);
  await esperar(() => window.__yakuMonitoreo.estado().fase === 'orbita', null, 25000).catch(() => {});
  const t6 = (await page.locator('[data-tarjeta]').innerText()).replace(/\s+/g, ' ');
  check('en el histórico la tarjeta muestra el estado de ese momento y no deja actuar', /1 vecino/.test(t6) && /vuelve a «En vivo»/.test(t6), { tarjeta: t6.slice(0, 200) });
  await page.waitForTimeout(600);
  await foto(page, '5-historico');
  p = await irA(tA - 30_000);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(300);
  check('antes del primer reporte de A el incidente no existe', !(await est()).incidentes.some((i) => i.id === incA.id));
  await page.click('[data-a=vivo]');
  await page.waitForTimeout(400);
  const s7 = await est();
  check('«En vivo» vuelve al presente con el estado real', s7.enVivo && s7.incidentes.find((i) => i.id === incA.id)?.accion === 'bomberos');
  const gEst = (await page.locator('[data-g="estado"]').innerText()).replace(/\s+/g, ' ');
  const gCob = (await page.locator('[data-g="cob"]').innerText()).replace(/\s+/g, ' ');
  check('gráficos: «Incidentes por estado» y «Cobertura OSIPTEL por nivel de exposición» (dato oficial)', /Validado o con acción 1/.test(gEst) && /Sin revisar 1/.test(gEst) && /Cobertura OSIPTEL por nivel de exposición/.test(gCob) && /445 de 928/.test(gCob), { gEst, gCob });

  // 7) Reproducir el histórico (15 s) y pestañas Campo y Escenario.
  await page.selectOption('[data-a=dur]', '15');
  await page.click('[data-a=play]');
  await page.waitForTimeout(1500);
  const jugando = await page.evaluate(() => window.__yakuMonitoreo.linea.jugando() && !window.__yakuMonitoreo.estado().enVivo);
  await page.click('[data-a=vivo]');
  check('reproducir repite el histórico y «En vivo» lo corta', jugando && (await est()).enVivo);
  await page.click('[data-tab=escenario]');
  const esc = (await page.locator('#v3d-panel').innerText()).replace(/\s+/g, ' ');
  check('pestaña Escenario: capas oficiales y resumen de escenario.ts, sin «Modo demo SIMULADO»', /Capas oficiales/.test(esc) && /CENEPRED\/SIGRID 23077/.test(esc) && /Reporte recibido/.test(esc) && !/Modo demo/.test(esc));
  await page.click('[data-tab=campo]');
  await page.click('[data-f=coninc]');
  const campo = (await page.locator('#v3d-panel').innerText()).replace(/\s+/g, ' ');
  check('pestaña Campo: centros poblados del escenario con incidentes cercanos', /Centros poblados del escenario CENEPRED/.test(campo), { campo: campo.slice(0, 160) });
  await page.click('[data-tab=incidentes]');

  // 8) Red: lecturas protegidas con la cabecera de la sesión y cero CDN externos.
  const lecturas = apiPet.filter((x) => x.m === 'GET' && (x.p === '/api/incidentes' || x.p.startsWith('/api/reports')));
  check('lecturas protegidas con la cabecera de la sesión (GET /api/incidentes y /api/reports?desde)', lecturas.length > 4 && lecturas.every((x) => x.pin) && lecturas.some((x) => x.p === '/api/reports?desde'), { n: lecturas.length });
  check('cero peticiones a CDN o servicios externos', externas.length === 0, { externas: externas.slice(0, 5) });
  check('sin errores de JavaScript en la página', errores.length === 0, { errores });

  // 9) Enlaces viejos: /?vista=municipalidad y /?vista=portal redirigen a /municipalidad (portal → pestaña Escenario).
  for (const v of ['municipalidad', 'portal']) {
    const pg = await ctx.newPage();
    await pg.goto(BASE + '?vista=' + v);
    await accederConPin(pg, { pin: PIN });
    await pg.waitForFunction(() => window.__yakuMonitoreo?.estado().sembrado, null, { timeout: 30000 });
    const pe = await pg.evaluate(() => window.__yakuMonitoreo.tienda.pestana);
    const ruta = new URL(pg.url()).pathname;
    check(`/?vista=${v} redirige a /municipalidad y abre el Centro de monitoreo`, ruta === '/municipalidad' && (await pg.locator('.mon').count()) === 1 && pe === (v === 'portal' ? 'escenario' : 'incidentes'), { ruta, pestana: pe });
    if (v === 'portal') { await pg.waitForTimeout(2500); await pg.screenshot({ path: path.join(EVID, 'monitoreo-6-portal-escenario.jpg'), type: 'jpeg', quality: 80 }); }
    await pg.close();
  }
} catch (e) {
  check('sin excepciones', false, { error: String(e?.stack || e).slice(0, 600) });
} finally {
  await browser.close();
  await srv.cerrar();
  fs.rmSync(DATOS, { recursive: true, force: true });
}
res.ok = res.checks.every((c) => c.ok);
fs.writeFileSync(path.join(OUT, 'e2e-monitoreo.json'), JSON.stringify(res, null, 2));
console.log(`\n${res.ok ? 'OK' : 'FALLÓ'} · ${res.checks.filter((c) => c.ok).length}/${res.checks.length}`);
process.exit(res.ok ? 0 : 1);
