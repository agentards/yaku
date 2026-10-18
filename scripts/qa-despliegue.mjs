// QA del despliegue en Dokploy: el usuario de la municipalidad se crea solo al desplegar y las sesiones y los datos
// sobreviven a cada redespliegue. Resuelve las variables con `docker compose config` (lo mismo que hace Dokploy con
// docker-compose.yml + la pestaña Environment; no necesita el daemon de Docker), arranca el MISMO servidor
// empaquetado que corre la imagen (servidor-local/salida/servidor.mjs con el ENV del Dockerfile) sobre una carpeta
// que hace de volumen yaku-datos, y encadena despliegues: primero → redespliegue → cambio de contraseña →
// MUNI_CLAVE vacía → sin MUNI_PIN. Datos de prueba SIMULADO en una carpeta temporal.
//   npm run qa:despliegue          (compila como el Dockerfile; --sin-compilar si dist/ y el paquete ya están)
import { execFileSync, execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeObservation } from '../src/codec.ts';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIST = path.join(RAIZ, 'dist'), PAQUETE = path.join(RAIZ, 'servidor-local/salida/servidor.mjs');
const VOLUMEN = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-qa-volumen-'));
const VACIO = path.join(VOLUMEN, '..', `yaku-qa-env-${process.pid}`); // --env-file vacío: ignora un .env local
const PIN = 'qa-pin-' + Math.random().toString(36).slice(2, 10);
const C1 = 'qa-clave-' + Math.random().toString(36).slice(2, 12), C2 = 'qa-otra-' + Math.random().toString(36).slice(2, 12);
const checks = [];
const check = (n, ok, d) => { checks.push({ n, ok }); console.log(`${ok ? '✅' : '❌'} ${n}`, d === undefined ? '' : JSON.stringify(d).slice(0, 220)); };
const fase = (t) => console.log(`\n── ${t}`);

if (!process.argv.includes('--sin-compilar')) {
  fase('Compilar como el Dockerfile (vite build + empaquetar el servidor)');
  execSync('npx vite build', { cwd: RAIZ, stdio: 'ignore' });
  execSync('node servidor-local/empaquetar.mjs', { cwd: RAIZ, stdio: 'ignore' });
}
if (!fs.existsSync(PAQUETE) || !fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('falta dist/ o el paquete del servidor: corre sin --sin-compilar');

// ENV de la imagen final (última línea ENV del Dockerfile).
const ENV_IMAGEN = Object.fromEntries(fs.readFileSync(path.join(RAIZ, 'Dockerfile'), 'utf8').split(/\r?\n/).filter((l) => /^ENV /.test(l)).at(-1)
  .slice(4).trim().split(/\s+/).map((kv) => kv.split('=')));

const VARS = ['MUNI_PIN', 'MUNI_CLAVE', 'MUNI_USUARIO', 'MUNI_NOMBRE', 'YAKU_SESION_HORAS', 'YAKU_MODO_ESTRICTO'];
function compose(vars) {
  fs.writeFileSync(VACIO, '');
  const env = { ...process.env };
  for (const k of VARS) delete env[k];
  Object.assign(env, vars);
  try {
    const c = JSON.parse(execFileSync('docker', ['compose', '--env-file', VACIO, '-f', 'docker-compose.yml', 'config', '--format', 'json'], { cwd: RAIZ, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    return { ok: true, s: c.services.yaku };
  } catch (e) { return { ok: false, error: String(e.stderr || e.message).trim() }; }
}

const puerto = await new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const BASE = `http://127.0.0.1:${puerto}`;
const libre = () => new Promise((ok) => { const s = net.createServer().once('error', () => ok(false)).listen(puerto, '127.0.0.1', () => s.close(() => ok(true))); });
async function desplegar(vars, intento = 1) {
  const c = compose(vars);
  if (!c.ok) return { c };
  for (const t0 = Date.now(); !(await libre()) && Date.now() - t0 < 10_000;) await new Promise((r) => setTimeout(r, 200)); // el contenedor anterior suelta el puerto
  // El contenedor solo ve el ENV de la imagen + el environment del compose. Localmente cambian puerto, host y rutas.
  const env = { ...ENV_IMAGEN, ...c.s.environment, PORT: String(puerto), HOST: '127.0.0.1', YAKU_DIST: DIST, YAKU_DATOS: VOLUMEN, PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT ?? '' };
  const p = spawn(process.execPath, [PAQUETE], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  p.stdout.on('data', (d) => (log += d)); p.stderr.on('data', (d) => (log += d));
  let sano = false;
  for (const t0 = Date.now(); Date.now() - t0 < 10_000 && p.exitCode === null; await new Promise((r) => setTimeout(r, 200))) { // HEALTHCHECK: /salud, start-period 10 s
    sano = await fetch(BASE + '/salud').then((r) => r.status === 200).catch(() => false);
    if (sano) break;
  }
  if (!sano && intento === 1 && /EADDRINUSE/.test(log)) { await new Promise((r) => setTimeout(r, 1000)); return desplegar(vars, 2); }
  return { c, sano, log: () => log, parar: () => new Promise((r) => { if (p.exitCode !== null) return r(); p.once('exit', r); p.kill('SIGTERM'); }) };
}
const pedir = async (ruta, init = {}) => { const r = await fetch(BASE + ruta, init); return { status: r.status, j: await r.json().catch(() => null) }; };
const entrar = (usuario, clave) => pedir('/api/sesion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario, clave }) });
const conToken = (t, ruta = '/api/sesion', init = {}) => pedir(ruta, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${t}` } });
function base() {
  const db = new DatabaseSync(path.join(VOLUMEN, 'yaku.db'), { readOnly: true });
  try { return { usuarios: db.prepare('select usuario, nombre, rol, sal, hash from usuarios').all(), sesiones: db.prepare('select count(*) n from sesiones').get().n }; } finally { db.close(); }
}
const enClaro = (clave) => fs.readdirSync(VOLUMEN).filter((f) => f.startsWith('yaku.db')).some((f) => fs.readFileSync(path.join(VOLUMEN, f)).includes(clave));

// Navegador (opcional): la sesión del Centro de monitoreo sobrevive al redespliegue.
let browser = null, page = null;
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
try {
  const { chromium } = await import('playwright');
  if (fs.existsSync(CHROME)) browser = await chromium.launch({ executablePath: CHROME, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
} catch { /* sin playwright: solo API */ }
const dentro = () => page.waitForSelector('[data-usuario] .ycm-acc-chip', { timeout: 30000 }).then(() => true).catch(() => false);
const pideAcceso = () => page.waitForSelector('.ycm-acc-pin', { timeout: 15000 }).then(() => true).catch(() => false);

let d = null, token = '', incId = '';
try {
  fase('Despliegue 1 · Dokploy con MUNI_PIN y MUNI_CLAVE (volumen vacío)');
  d = await desplegar({ MUNI_PIN: PIN, MUNI_CLAVE: C1 });
  const e = d.c.s?.environment ?? {};
  check('docker-compose.yml resuelve las variables por defecto (usuario central, 72 h, modo MVP)', d.c.ok && e.MUNI_USUARIO === 'central' && e.MUNI_NOMBRE === 'Municipio central' && e.YAKU_SESION_HORAS === '72' && e.YAKU_MODO_ESTRICTO === '0' && e.YAKU_DATOS === '/datos' && d.c.s.volumes?.[0]?.target === '/datos');
  check('el contenedor arranca y el HEALTHCHECK /salud responde 200', d.sano, d.sano ? undefined : d.log().slice(-400));
  check('el log dice «usuario «central» (creado)»', /usuario «central» \(creado\)/.test(d.log()));
  check('/municipalidad sirve la página (200)', (await fetch(BASE + '/municipalidad')).status === 200);
  check('API protegida: /api/incidentes sin credencial = 401', (await pedir('/api/incidentes')).status === 401);
  check('contraseña mala o usuario inexistente = 403', (await entrar('central', 'mala')).status === 403 && (await entrar('nadie', C1)).status === 403);
  const r = await entrar('central', C1);
  token = r.j?.token ?? '';
  check('central + MUNI_CLAVE entra: token de sesión por 72 h', r.status === 200 && token.length === 43 && Math.abs(r.j.expira - Date.now() - 72 * 3_600_000) < 60_000, { nombre: r.j?.nombre });
  check('GET /api/sesion con el token = central', (await conToken(token)).j?.usuario === 'central');
  const ts = Math.floor(Date.now() / 1000) - 60;
  const rec = makeObservation({ type: 'atrapados', severity: 3, lat: -5.19449, lon: -80.63282, note: 'SIMULADO qa-despliegue', ts, deviceId: 'qadesp01' });
  await pedir('/api/sync', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ records: [rec] }) });
  incId = (await conToken(token, '/api/incidentes')).j?.incidentes?.[0]?.id ?? '';
  const est = await conToken(token, `/api/incidentes/${incId}/estado`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ estado: 'en_revision', quien: 'QA despliegue' }) });
  check('con el token se lee y se cambia el estado de un incidente (SIMULADO)', !!incId && est.status === 200);
  check('el PIN sigue sirviendo de respaldo (X-Muni-Pin)', (await pedir('/api/incidentes', { headers: { 'x-muni-pin': PIN } })).status === 200);
  if (browser) {
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })).newPage();
    await page.goto(BASE + '/municipalidad');
    await pideAcceso();
    await page.fill('.ycm-acc-pin input[name="clave"]', C1);
    await page.fill('.ycm-acc-pin input[name="nombre"]', 'QA despliegue');
    await page.click('.ycm-acc-pin .ycm-acc-entrar');
    check('navegador: entra al Centro de monitoreo con central + contraseña', await dentro());
  }
  await d.parar();
  const b1 = base();
  check('SQLite: tabla usuarios con UN usuario «central» (Municipio central, operador) y la contraseña con scrypt', b1.usuarios.length === 1 && b1.usuarios[0].usuario === 'central' && b1.usuarios[0].nombre === 'Municipio central' && b1.usuarios[0].rol === 'operador' && b1.usuarios[0].hash.length === 43 && b1.usuarios[0].sal.length > 0, b1.usuarios.map(({ usuario, nombre, rol }) => ({ usuario, nombre, rol })));
  check('SQLite: la contraseña NO está en claro en ningún archivo del volumen', !enClaro(C1));
  check('SQLite: las sesiones quedan guardadas (solo el hash del token)', b1.sesiones >= 1 && !enClaro(token), { sesiones: b1.sesiones });

  fase('Despliegue 2 · redespliegue con las mismas variables (mismo volumen)');
  d = await desplegar({ MUNI_PIN: PIN, MUNI_CLAVE: C1 });
  check('arranca y el log dice «contraseña sin cambios»', d.sano && /usuario «central» \(contraseña sin cambios\)/.test(d.log()));
  check('la sesión de antes del redespliegue sigue valiendo (no hay que volver a entrar)', (await conToken(token)).status === 200);
  const i2 = (await conToken(token, '/api/incidentes')).j?.incidentes?.find((i) => i.id === incId);
  check('los datos siguen: el incidente sigue «en revisión»', i2?.estado === 'en_revision', { estado: i2?.estado });
  if (page) { await page.reload(); check('navegador: al recargar después del redespliegue NO pide la contraseña', (await dentro()) && !(await page.locator('.ycm-acc-pin').count())); }
  await d.parar();
  check('SQLite: sigue habiendo un solo usuario (no se duplica al redesplegar)', base().usuarios.length === 1);

  fase('Despliegue 3 · cambian MUNI_CLAVE en Dokploy');
  d = await desplegar({ MUNI_PIN: PIN, MUNI_CLAVE: C2 });
  check('arranca y el log dice «contraseña actualizada: se cerraron sus sesiones»', d.sano && /contraseña actualizada/.test(d.log()), d.sano && /contraseña actualizada/.test(d.log()) ? undefined : { sano: d.sano, log: d.log().slice(-600) });
  check('el token viejo ya no sirve (401) y la contraseña vieja tampoco (403)', (await conToken(token)).status === 401 && (await entrar('central', C1)).status === 403);
  check('la contraseña nueva entra', (await entrar('central', C2)).status === 200);
  if (page) { await page.reload(); check('navegador: después del cambio de contraseña vuelve a pedirla', await pideAcceso()); }
  await d.parar();

  fase('Despliegue 4 · MUNI_CLAVE sin definir en Dokploy (el compose la pasa vacía)');
  d = await desplegar({ MUNI_PIN: PIN });
  check('docker compose la resuelve como cadena vacía', d.c.ok && d.c.s.environment.MUNI_CLAVE === '');
  check('el contenedor arranca igual y el log dice «contraseña = MUNI_PIN»', d.sano && /contraseña = MUNI_PIN/.test(d.log()), d.sano ? undefined : d.log().slice(-300));
  check('central entra con el MUNI_PIN', (await entrar('central', PIN)).status === 200);
  await d.parar();

  fase('Despliegue 5 · sin MUNI_PIN');
  d = await desplegar({});
  check('Dokploy no despliega y explica qué falta («Define MUNI_PIN en Dokploy → Environment»)', !d.c.ok && /MUNI_PIN/.test(d.c.error) && /Define MUNI_PIN en Dokploy/.test(d.c.error));
  d = null;
} catch (e) {
  check('sin excepciones', false, String(e?.stack || e).slice(0, 500));
} finally {
  await d?.parar?.();
  await browser?.close();
  fs.rmSync(VOLUMEN, { recursive: true, force: true });
  fs.rmSync(VACIO, { force: true });
}
const ok = checks.filter((c) => c.ok).length;
console.log(`\n${ok === checks.length ? 'OK' : 'FALLA'} · ${ok}/${checks.length}${browser ? '' : ' (sin navegador: instala playwright y Chrome para las pruebas de pantalla)'}`);
process.exit(ok === checks.length ? 0 : 1);
