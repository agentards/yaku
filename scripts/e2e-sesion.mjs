// E2E del acceso al Centro de monitoreo contra el SERVIDOR LOCAL real: se entra una vez con usuario + contraseña y
// la sesión sigue al recargar y al cambiar de región (Piura ↔ Lima); «Salir» la cierra.
//   npm run build && node scripts/e2e-sesion.mjs      (PORT_E2E=8098 por defecto)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { iniciar } from '../servidor-local/servidor.ts';

const PORT = Number(process.env.PORT_E2E ?? 8098), BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-e2e-sesion-'));
const CLAVE = 'Prueba-' + Math.random().toString(36).slice(2, 10);
const checks = [];
const check = (name, ok, detail = {}) => { checks.push({ name, ok }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail).slice(0, 300)); };

const srv = iniciar({ puerto: PORT, host: '127.0.0.1', datos: DATOS, pin: 'pin-respaldo-e2e', clave: CLAVE, silencioso: true });
await srv.listo;
const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADLESS !== '0', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const errores = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-PE', timezoneId: 'America/Lima', serviceWorkers: 'block' });
  // Parpadeo: ¿se llega a ver la app técnica 2D («Yaku Relay · prototipo») mientras carga el Centro de monitoreo?
  await ctx.addInitScript(() => {
    window.__shell2d = 0;
    const mirar = () => {
      const top = document.querySelector('body > header.top');
      if (top && getComputedStyle(top).display !== 'none' && top.getBoundingClientRect().height > 0) window.__shell2d++;
      if (document.body?.dataset.v3d !== 'listo') requestAnimationFrame(mirar);
    };
    new MutationObserver(() => mirar()).observe(document, { childList: true, subtree: true });
    requestAnimationFrame(mirar);
  });
  const sinParpadeo = async () => (await page.evaluate(() => window.__shell2d)) === 0;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(String(e.message).slice(0, 200)));
  const pideAcceso = () => page.waitForSelector('.ycm-acc-pin', { timeout: 8000 }).then(() => true).catch(() => false);
  const monitor = () => page.waitForSelector('[data-usuario] .ycm-acc-chip', { timeout: 30000 }).then(() => true).catch(() => false);

  await page.goto(BASE + 'municipalidad');
  check('sin sesión pide usuario y contraseña (usuario «central» ya escrito)', (await pideAcceso()) && (await page.inputValue('.ycm-acc-pin input[name="usuario"]')) === 'central');
  await page.fill('.ycm-acc-pin input[name="clave"]', 'mala');
  await page.click('.ycm-acc-pin .ycm-acc-entrar');
  const error = await page.waitForSelector('.ycm-acc-error:not([hidden])', { timeout: 8000 }).then((e) => e.textContent()).catch(() => '');
  check('contraseña mala: «Usuario o contraseña incorrectos.»', /incorrectos/.test(error ?? ''), { error });
  await page.fill('.ycm-acc-pin input[name="clave"]', CLAVE);
  await page.fill('.ycm-acc-pin input[name="nombre"]', 'Operadora de turno');
  await page.click('.ycm-acc-pin .ycm-acc-entrar');
  check('entra y el chip muestra quién opera', (await monitor()) && /Operadora de turno/.test(await page.locator('[data-usuario]').innerText()));
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('yaku-muni-sesion') ?? 'null')?.token ?? '');
  check('la sesión queda guardada en este equipo (token, no la contraseña)', token.length === 43 && !(await page.evaluate((c) => JSON.stringify(localStorage).includes(c), CLAVE)));

  await page.reload();
  check('al recargar no vuelve a pedir la contraseña', (await monitor()) && !(await page.locator('.ycm-acc-pin').count()));
  await page.click('[data-region="lima"]');
  await page.waitForURL(/region=lima/, { timeout: 15000 });
  check('al cambiar a Lima no vuelve a pedir la contraseña', (await monitor()) && !(await page.locator('.ycm-acc-pin').count()));
  await page.waitForFunction(() => document.body.dataset.v3d === 'listo', null, { timeout: 30000 }).catch(() => {});
  check('al cambiar de región no se ve la app técnica 2D mientras carga (sin parpadeo)', await sinParpadeo(), { vecesVisible: await page.evaluate(() => window.__shell2d) });
  await page.click('[data-region="piura"]');
  await page.waitForURL(/region=piura/, { timeout: 15000 });
  check('al volver a Piura tampoco', (await monitor()) && !(await page.locator('.ycm-acc-pin').count()));
  const r = await fetch(`http://127.0.0.1:${PORT}/api/incidentes`, { headers: { authorization: `Bearer ${token}` } });
  check('el servidor acepta el token (sin PIN)', r.status === 200);

  await page.click('[data-usuario] .ycm-acc-chip button');
  check('«Salir» cierra la sesión: vuelve a pedir el acceso y el token ya no sirve', (await pideAcceso()) && (await fetch(`http://127.0.0.1:${PORT}/api/incidentes`, { headers: { authorization: `Bearer ${token}` } })).status === 401);
  check('sin errores de JavaScript', errores.length === 0, { errores });
} finally {
  await browser.close();
  await srv.cerrar();
  fs.rmSync(DATOS, { recursive: true, force: true });
}
const ok = checks.filter((c) => c.ok).length;
console.log(`\n${ok === checks.length ? 'OK' : 'FALLA'} · ${ok}/${checks.length}`);
process.exit(ok === checks.length ? 0 : 1);
