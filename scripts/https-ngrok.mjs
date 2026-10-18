// HTTPS para los celulares de la demo: servidor-local + túnel ngrok. Los celulares necesitan HTTPS para la
// cámara (getUserMedia) y el service worker (modo avión). Comprueba por el túnel: /salud, la PWA, sw.js,
// manifest y, en Chrome móvil, contexto seguro + cámara disponible + service worker activo. Imprime la URL y un
// QR en la terminal para abrirla en los celulares.
//   npm run build && node scripts/https-ngrok.mjs           → prueba y cierra (deja results/https-ngrok.json)
//   MANTENER=1 node scripts/https-ngrok.mjs                  → además queda abierto para la demo (Ctrl+C cierra)
//   NGROK_DOMAIN=mi-dominio.ngrok-free.app …                 → dominio fijo (la URL no cambia entre ensayos)
// El authtoken vive en la configuración de ngrok (%LOCALAPPDATA%/ngrok/ngrok.yml), nunca en el repo ni en .env
// del repo; este script no lo lee ni lo imprime. MUNI_PIN: por variable de entorno o PIN temporal en consola.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { iniciar } from '../servidor-local/servidor.ts';

const PORT = Number(process.env.PORT ?? 8080);
const DIST = process.env.YAKU_DIST ?? 'dist';
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const SALTA = { 'ngrok-skip-browser-warning': '1' }; // la cuenta gratis muestra un aviso antes de la página
const res = { fecha: new Date().toISOString(), checks: [] };
const check = (name, ok, detail = {}) => { res.checks.push({ name, ok: !!ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };
const matar = (p) => { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']) : p.kill('SIGTERM'); } catch {} };

if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error(`Falta ${DIST}/index.html: corre «npm run build» primero.`); process.exit(1); }
const srv = iniciar({ puerto: PORT, host: '127.0.0.1', dist: DIST });
await srv.listo;

const args = ['http', `127.0.0.1:${PORT}`, '--log', 'stdout', '--log-format', 'json'];
if (process.env.NGROK_DOMAIN) args.push(`--domain=${process.env.NGROK_DOMAIN}`);
const ng = spawn('ngrok', args, { stdio: ['ignore', 'pipe', 'pipe'] });
let errNgrok = '';
ng.stdout.on('data', (d) => { for (const l of String(d).split('\n')) { try { const j = JSON.parse(l); if (j.lvl === 'eror' || j.lvl === 'crit') errNgrok = String(j.err ?? j.msg); } catch {} } });
ng.on('error', (e) => { errNgrok = 'no se pudo ejecutar ngrok: ' + e.message; });

async function urlPublica() {
  for (let i = 0; i < 40; i++) {
    if (errNgrok) return null;
    try {
      const { tunnels } = await (await fetch('http://127.0.0.1:4040/api/tunnels')).json();
      const t = tunnels.find((x) => x.public_url?.startsWith('https://'));
      if (t) return t.public_url;
    } catch { /* la API local de ngrok aún no responde */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

let codigo = 0;
const URL_PUB = await urlPublica();
try {
  if (!URL_PUB) {
    const sinToken = /ERR_NGROK_4018|authtoken|not authenticated/i.test(errNgrok);
    check('ngrok abre un túnel HTTPS', false, { error: errNgrok.split('\n')[0] || 'sin respuesta de ngrok en 20 s' });
    if (sinToken) console.error('\nFalta el authtoken de ngrok: Jorge debe iniciar sesión en https://dashboard.ngrok.com/get-started/your-authtoken y ejecutar «ngrok config add-authtoken <token>» en esta laptop (queda fuera del repo).');
    codigo = 2;
  } else {
    res.url = URL_PUB;
    const get = async (p) => { const t = Date.now(); const r = await fetch(URL_PUB + p, { headers: SALTA }); return { status: r.status, ms: Date.now() - t, tipo: r.headers.get('content-type'), texto: await r.text() }; };
    const salud = await get('/salud');
    check('túnel → /salud', salud.status === 200 && salud.texto.trim() === 'ok', { ms: salud.ms });
    const raiz = await get('/');
    check('túnel → la PWA (index.html)', raiz.status === 200 && /<html/i.test(raiz.texto), { ms: raiz.ms });
    for (const p of ['/sw.js', '/manifest.webmanifest', '/api/stats']) { const r = await get(p); check(`túnel → ${p}`, r.status === 200, { ms: r.ms, tipo: r.tipo }); }

    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    try {
      const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, locale: 'es-PE', extraHTTPHeaders: SALTA });
      const page = await ctx.newPage();
      await page.goto(URL_PUB + '/?vista=poblador');
      await page.waitForFunction(() => document.querySelector('.pb')?.dataset.listo === '1', null, { timeout: 45000 });
      const seg = await page.evaluate(async () => {
        const sw = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 20000))]);
        return { seguro: isSecureContext, camara: !!navigator.mediaDevices?.getUserMedia, sw };
      });
      check('Chrome móvil por HTTPS: contexto seguro, cámara disponible y service worker activo', seg.seguro && seg.camara && seg.sw, seg);
    } finally { await browser.close(); }

    console.log(`\nURL para los celulares: ${URL_PUB}/   (municipalidad: ${URL_PUB}/?vista=municipalidad)`);
    console.log(await QRCode.toString(URL_PUB + '/', { type: 'terminal', small: true }));
    if (process.env.MANTENER === '1') {
      console.log('Túnel abierto. La primera vez, en cada celular toca «Visit Site» en el aviso de ngrok. Ctrl+C para cerrar.');
      await new Promise((r) => process.on('SIGINT', r));
    }
  }
} finally {
  matar(ng);
  await srv.cerrar();
}
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/https-ngrok.json', JSON.stringify({ ...res, url: res.url ? '(efímera, no se guarda)' : null }, null, 2));
process.exit(codigo || (res.checks.every((c) => c.ok) ? 0 : 1));
