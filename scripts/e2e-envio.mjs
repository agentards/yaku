// E2E del tiempo de envío del celular CON internet contra el SERVIDOR LOCAL real: cuánto tarda un reporte en llegar
// al servidor después de tocar «Guardar», también cuando la foto anterior todavía se está subiendo por una red lenta
// (la foto no debe frenar el reporte siguiente). Datos SIMULADO.
//   npm run build && node scripts/e2e-envio.mjs      (PORT_E2E=8091 por defecto)
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { iniciar } from '../servidor-local/servidor.ts';

const PORT = Number(process.env.PORT_E2E ?? 8091), BASE = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-e2e-envio-'));
const FOTO = path.join(DATOS, 'foto.png');
const FOTO_LENTA_MS = 8000; // red lenta: la subida de la foto tarda 8 s
const checks = [];
const check = (n, ok, d) => { checks.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}`, d === undefined ? '' : JSON.stringify(d)); };
{
  const W = 2000, H = 1500, png = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H * 4; i += 4) { const n = (Math.random() * 60) | 0; png.data[i] = 120 + n; png.data[i + 1] = 90 + n; png.data[i + 2] = 60 + n; png.data[i + 3] = 255; }
  fs.writeFileSync(FOTO, PNG.sync.write(png));
}

const srv = iniciar({ puerto: PORT, host: '127.0.0.1', datos: DATOS, pin: 'pin-e2e-envio', silencioso: true });
await srv.listo;
const total = async () => (await (await fetch(`${BASE}/api/stats`)).json()).total;
const hasta = async (fn, ms = 40000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return Date.now() - t0; await new Promise((r) => setTimeout(r, 100)); } return null; };

const browser = await chromium.launch({ executablePath: CHROME });
try {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, locale: 'es-PE', timezoneId: 'America/Lima', serviceWorkers: 'block', permissions: ['geolocation'], geolocation: { latitude: -5.19449, longitude: -80.63282, accuracy: 10 } });
  let fotosLentas = false, fotosSubidas = 0;
  await ctx.route('**/api/fotos', async (route) => {
    if (fotosLentas) await new Promise((r) => setTimeout(r, FOTO_LENTA_MS));
    await route.continue();
    fotosSubidas++;
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`${BASE}/reportar`);
  await p.waitForFunction(() => document.querySelector('.pb')?.dataset.listo === '1', null, { timeout: 30000 });
  if (await p.isVisible('#pb-consent-ok')) await p.click('#pb-consent-ok');
  const reportar = async (tipo, foto) => {
    if (await p.evaluate(() => document.querySelector('.pb').dataset.vista !== 'reportar')) await p.click('.pb-nav button[data-ir="reportar"]');
    await p.click(`.pb-tipo[data-tipo="${tipo}"]`);
    if (await p.isVisible('[data-v="aviso"]')) await p.click('#pb-aviso-seguir');
    await p.waitForFunction(() => /Ubicación del GPS/.test(document.getElementById('pb-loc-txt').textContent), null, { timeout: 10000 });
    if (foto) { await p.setInputFiles('#pb-foto-in', FOTO); await p.waitForFunction(() => !!document.querySelector('.pb').dataset.foto, null, { timeout: 20000 }); }
    await p.click('#pb-guardar');
    await p.waitForFunction(() => document.querySelector('.pb').dataset.vista === 'lista');
    return Date.now();
  };

  // 1) Red normal: reporte con foto.
  const n0 = await total();
  const t1 = await reportar('vivienda', true);
  const llega1 = await hasta(async () => (await total()) > n0);
  check('con internet, el reporte llega al servidor en menos de 2 s', llega1 !== null && llega1 < 2000, { ms: llega1 });
  const foto1 = await hasta(async () => fotosSubidas >= 1);
  check('su foto sube enseguida después (≤ 150 KB)', foto1 !== null && Date.now() - t1 < 5000, { msDesdeGuardar: Date.now() - t1 });

  // 2) Red lenta: la foto del reporte A tarda 8 s en subir; mientras, el vecino guarda el reporte B.
  fotosLentas = true;
  const n1 = await total();
  await reportar('agua', true);
  await hasta(async () => (await total()) > n1); // A llegó; su foto empieza a subir (lenta)
  await p.waitForTimeout(500);
  const n2 = await total();
  await reportar('via_bloq', false);
  const llegaB = await hasta(async () => (await total()) > n2);
  check(`con la foto anterior subiendo por red lenta (${FOTO_LENTA_MS / 1000} s), el reporte siguiente no la espera: llega en menos de 3 s`, llegaB !== null && llegaB < 3000, { ms: llegaB });
  const fotoA = await hasta(async () => fotosSubidas >= 2, 30000);
  check('y la foto lenta igual termina de subir', fotoA !== null, { ms: fotoA });
} finally {
  await browser.close();
  await srv.cerrar();
  fs.rmSync(DATOS, { recursive: true, force: true });
}
const ok = checks.filter(Boolean).length;
console.log(`\n${ok === checks.length ? 'OK' : 'FALLA'} · ${ok}/${checks.length}`);
process.exit(ok === checks.length ? 0 : 1);
