// E2E de rutas y dominio (plan-landing-yaku-lat.md, «Rutas y dominio») contra el SERVIDOR LOCAL REAL (servidor-local/,
// SQLite temporal fuera del repo) sobre el dist/ ya compilado:
//   1) HTTP: / = landing, /reportar · /municipalidad · /app = app.html, /?vista=… viejos → 302, robots, sitemap, manifest.
//   2) Celular Android 412×915 con service worker: con red y luego en modo avión (ctx.setOffline) cada ruta abre su
//      pantalla desde la caché, y un enlace viejo /?vista=poblador abierto sin red termina en /reportar.
// Capturas en docs/evidencia-rutas/, resultado en results/e2e-rutas.json.
//   npm run build && node scripts/e2e-rutas.mjs        (PORT_E2E=8097 por defecto; Node ≥ 23.6 importa .ts)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { iniciar } from '../servidor-local/servidor.ts';

const PORT = Number(process.env.PORT_E2E ?? 8097), BASE = `http://localhost:${PORT}`;
const OUT = path.resolve('results'), EVID = path.resolve('docs/evidencia-rutas');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-e2e-rutas-'));
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(EVID, { recursive: true });
const res = { fecha: new Date().toISOString(), servidor: 'servidor-local (SQLite temporal)', checks: [] };
const check = (name, ok, detail = {}) => { res.checks.push({ name, ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail).slice(0, 400)); };

const srv = iniciar({ puerto: PORT, host: '127.0.0.1', datos: DATOS, pin: 'e2e-rutas-' + Math.random().toString(36).slice(2, 8), silencioso: true });
await srv.listo;
const pedir = async (p) => { const r = await fetch(BASE + p, { redirect: 'manual' }); return { s: r.status, l: r.headers.get('location'), tipo: r.headers.get('content-type') ?? '', t: await r.text() }; };

const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADLESS !== '0', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
try {
  // ---------- 1) HTTP ----------
  const [raiz, rep, muni, app] = await Promise.all(['/', '/reportar', '/municipalidad', '/app'].map(pedir));
  check('/ sirve la landing (index.html, no la app)', raiz.s === 200 && /data-cta|landing/i.test(raiz.t) && !/id="app"/.test(raiz.t), { s: raiz.s });
  check('/reportar, /municipalidad y /app sirven app.html', [rep, muni, app].every((r) => r.s === 200 && /id="app"/.test(r.t)), { s: [rep.s, muni.s, app.s] });
  const tabla = { '/?vista=poblador': '/reportar', '/?vista=municipalidad': '/municipalidad', '/?vista=incidentes': '/municipalidad', '/?vista=portal': '/municipalidad?vista=portal', '/?vista=2d': '/app', '/?vista=portal-relevo': '/app?vista=portal-relevo', '/?vista=poblador&lang=qu': '/reportar?lang=qu', '/reportar/': '/reportar' };
  const reds = await Promise.all(Object.keys(tabla).map(async (p) => [p, await pedir(p)]));
  check('enlaces viejos /?vista=… → 302 a la ruta nueva (tabla del plan)', reds.every(([p, r]) => r.s === 302 && r.l === tabla[p]), { reds: reds.map(([p, r]) => `${p} → ${r.s} ${r.l}`) });
  const desconocida = await pedir('/no-existe');
  check('ruta desconocida: la landing con 404', desconocida.s === 404 && desconocida.t === raiz.t, { s: desconocida.s });
  const [robots, sitemap, man] = await Promise.all(['/robots.txt', '/sitemap.xml', '/manifest.webmanifest'].map(pedir));
  check('robots.txt (Sitemap de yaku.lat, sin /api/ ni /municipalidad) y sitemap.xml (application/xml)', robots.s === 200 && robots.t.includes('Sitemap: https://yaku.lat/sitemap.xml') && /Disallow: \/api\//.test(robots.t) && sitemap.s === 200 && sitemap.tipo.startsWith('application/xml') && sitemap.t.includes('<loc>https://yaku.lat/reportar</loc>'), { robots: robots.s, sitemap: `${sitemap.s} ${sitemap.tipo}` });
  const m = JSON.parse(man.t);
  check('manifest: nombre «Yaku», start_url /reportar, scope /', m.name === 'Yaku' && m.short_name === 'Yaku' && m.start_url === '/reportar' && m.scope === '/', { name: m.name, start_url: m.start_url, scope: m.scope });
  check('landing: canonical https://yaku.lat/', /<link rel="canonical" href="https:\/\/yaku\.lat\/"/.test(raiz.t));

  // ---------- 2) celular con service worker, con red y en modo avión ----------
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, locale: 'es-PE', timezoneId: 'America/Lima' });
  const page = await ctx.newPage();
  const externas = [], errores = [];
  page.on('pageerror', (e) => errores.push(String(e.message).slice(0, 200)));
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) externas.push(r.url()); });
  const pantalla = () => page.evaluate(() => ({
    ruta: location.pathname + location.search,
    landing: document.body.dataset.landing === '1' && !document.getElementById('app'),
    poblador: document.querySelector('.pb')?.dataset.listo === '1',
    acceso: !!document.querySelector('.ycm-acc'),
    tecnica: !!document.querySelector('body > .top')?.offsetParent && !document.querySelector('.pb'),
  }));
  const ir = async (p, listo, nombre) => {
    await page.goto(BASE + p);
    await page.waitForFunction(listo, null, { timeout: 30000 });
    if (nombre) await page.screenshot({ path: path.join(EVID, `${nombre}.jpg`), type: 'jpeg', quality: 70 });
    return pantalla();
  };
  const esPoblador = () => document.querySelector('.pb')?.dataset.listo === '1';
  const esAcceso = () => !!document.querySelector('.ycm-acc');
  const esTecnica = () => !!document.querySelector('body > .top') && !!document.getElementById('map');
  const esLanding = () => document.body.dataset.landing === '1';

  const conRed = {
    landing: await ir('/', esLanding, 'rutas-412-landing'),
    reportar: await ir('/reportar', esPoblador, 'rutas-412-reportar'),
  };
  const sw = await page.evaluate(async () => { const r = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((ok) => setTimeout(() => ok(false), 30000))]); return { listo: r, controla: !!navigator.serviceWorker.controller }; });
  conRed.municipalidad = await ir('/municipalidad', esAcceso, 'rutas-412-municipalidad');
  conRed.app = await ir('/app', esTecnica, null);
  check('con red: / landing, /reportar poblador, /municipalidad acceso con PIN, /app técnica; service worker activo', conRed.landing.landing && conRed.reportar.poblador && conRed.municipalidad.acceso && conRed.app.tecnica && sw.listo, { ...conRed, sw });

  await ctx.setOffline(true);
  externas.length = 0;
  const sinRed = {
    reportar: await ir('/reportar', esPoblador, 'rutas-412-reportar-sin-red'),
    municipalidadPortal: await ir('/municipalidad?vista=portal', esAcceso, null),
    app: await ir('/app?vista=2d', esTecnica, null),
    landing: await ir('/', esLanding, 'rutas-412-landing-sin-red'),
    viejo: await ir('/?vista=poblador', esPoblador, null),
  };
  check('modo avión: /reportar, /municipalidad?vista=portal, /app?vista=2d y / abren desde la caché del service worker', sinRed.reportar.poblador && sinRed.municipalidadPortal.acceso && sinRed.app.tecnica && sinRed.landing.landing, sinRed);
  check('modo avión: el enlace viejo /?vista=poblador abre el poblador y la barra queda en /reportar', sinRed.viejo.poblador && sinRed.viejo.ruta === '/reportar', sinRed.viejo);
  await ctx.setOffline(false);
  check('cero peticiones a CDN o servicios externos sin red', externas.length === 0, { externas: externas.slice(0, 5) });
  check('sin errores de JavaScript', errores.length === 0, { errores });
  await ctx.close();
} catch (e) {
  check('sin excepciones', false, { error: String(e?.stack || e).slice(0, 600) });
} finally {
  await browser.close();
  await srv.cerrar();
  fs.rmSync(DATOS, { recursive: true, force: true });
}
res.ok = res.checks.every((c) => c.ok);
fs.writeFileSync(path.join(OUT, 'e2e-rutas.json'), JSON.stringify(res, null, 2));
console.log(`\n${res.ok ? 'OK' : 'FALLÓ'} · ${res.checks.filter((c) => c.ok).length}/${res.checks.length}`);
process.exit(res.ok ? 0 : 1);
