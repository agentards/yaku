// E2E de yaku.lat/estamos-bien contra el SERVIDOR LOCAL real: una familia en el exterior (celular, hora de Madrid)
// busca por nombre el «Estoy bien» que subió un celular, sin abrir la app del vecino. Datos SIMULADO.
//   npm run build && node scripts/e2e-estamos-bien.mjs      (PORT_E2E=8092 por defecto)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { iniciar } from '../servidor-local/servidor.ts';
import { idCarta } from '../servidor-local/cartas.ts';

const PORT = Number(process.env.PORT_E2E ?? 8092), BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-e2e-eb-'));
const checks = [];
const check = (n, ok, d) => { checks.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}`, d === undefined ? '' : JSON.stringify(d).slice(0, 300)); };

const srv = iniciar({ puerto: PORT, host: '127.0.0.1', datos: DATOS, pin: 'pin-e2e-eb', silencioso: true });
await srv.listo;
const ts = Date.parse('2026-10-18T11:04:00Z') / 1000; // 06:04 en Lima
const base = { nombre: 'Rosa Chunga SIMULADO', para: 'mi hijo Luis', mensaje: 'Hola Luis, soy tu mamá. Estoy bien, en el colegio de Castilla.', zona: 'Castilla', ts, deviceId: 'celulara' };
const carta = { ...base, id: idCarta(base) }; // mismo id que calcula el celular (hash del contenido)
const sub = await (await fetch(`${BASE}/api/cartas`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ cartas: [carta], subidoPor: 'celularb' }) })).json();
check('un celular con señal sube el «Estoy bien»', sub.inserted === 1, sub);

const browser = await chromium.launch({ executablePath: CHROME });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', timezoneId: 'Europe/Madrid', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const pedidas = [], errores = [];
  page.on('request', (r) => pedidas.push(r.url()));
  page.on('pageerror', (e) => errores.push(e.message));

  const resp = await page.goto(`${BASE}/estamos-bien`);
  check('/estamos-bien abre su propia página (200), sin la app del vecino ni el registro de la PWA', resp.status() === 200 && (await page.title()).startsWith('Estamos bien') && !(await page.locator('#app, .top').count()), { titulo: await page.title() });
  await page.fill('#eb-nombre', 'ro');
  await page.click('#eb-form button');
  check('con menos de 3 letras pide más letras y no busca', /al menos 3 letras/.test(await page.locator('#eb-estado').innerText()) && !pedidas.some((u) => u.includes('/api/estamos-bien')));
  await page.fill('#eb-nombre', 'rosa chunga');
  await page.click('#eb-form button');
  await page.waitForSelector('.eb-msj', { timeout: 10000 });
  const t = (await page.locator('.eb-msj').first().innerText()).replace(/\s+/g, ' ');
  check('encuentra a «Rosa Chunga» sin tildes ni mayúsculas: está bien · para quién · zona · mensaje', /Rosa Chunga SIMULADO está bien/.test(t) && /Para mi hijo Luis/.test(t) && /Castilla/.test(t) && /Estoy bien, en el colegio/.test(t), { t });
  check('la hora sale en hora de Perú aunque la familia esté en Madrid (06:04, no 13:04)', /06:04/.test(t) && /hora de Perú/.test(t), { t });
  check('el enlace queda listo para compartir (?nombre=)', new URL(page.url()).searchParams.get('nombre') === 'rosa chunga');
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/estamos-bien?nombre=Luis`);
  check('abrir el enlace compartido busca solo (también por «para quién»)', await p2.waitForSelector('.eb-msj', { timeout: 10000 }).then(() => true).catch(() => false));
  await p2.goto(`${BASE}/estamos-bien?nombre=Pedro`);
  await p2.waitForFunction(() => /Todavía no hay mensajes/.test(document.getElementById('eb-estado').textContent), null, { timeout: 10000 }).catch(() => {});
  check('sin coincidencias explica que puede seguir viajando entre celulares', /Todavía no hay mensajes con «Pedro»/.test(await p2.locator('#eb-estado').innerText()));
  const sinScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check('celular 390 px: sin scroll horizontal; buscar es un botón de ≥ 48 px', sinScroll && (await page.locator('#eb-form button').boundingBox()).height >= 48);
  const js = pedidas.filter((u) => /\.js(\?|$)/.test(u));
  check('liviana: no descarga el código de la app ni del mapa', !js.some((u) => /\/assets\/(app|main|maplibre|landing)-/.test(u)), { js: js.map((u) => u.split('/').pop()) });
  check('cero peticiones fuera del servidor y sin errores de JavaScript', pedidas.every((u) => u.startsWith(BASE)) && errores.length === 0, { errores });
  const api = await (await fetch(`${BASE}/api/estamos-bien?nombre=rosa`)).json();
  check('la API pública no expone el código del celular', api.count === 1 && !('deviceId' in api.cartas[0]));
  if (process.env.CAPTURAS) {
    await page.screenshot({ path: path.join(process.env.CAPTURAS, 'estamos-bien-claro.png'), fullPage: true });
    const osc = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', timezoneId: 'Europe/Madrid' });
    const p3 = await osc.newPage(); await p3.goto(`${BASE}/estamos-bien?nombre=rosa`); await p3.waitForSelector('.eb-msj');
    await p3.screenshot({ path: path.join(process.env.CAPTURAS, 'estamos-bien-oscuro.png'), fullPage: true });
  }
} finally {
  await browser.close();
  await srv.cerrar();
  fs.rmSync(DATOS, { recursive: true, force: true });
}
const ok = checks.filter(Boolean).length;
console.log(`\n${ok === checks.length ? 'OK' : 'FALLA'} · ${ok}/${checks.length}`);
process.exit(ok === checks.length ? 0 : 1);
