// E2E de la cámara en Chrome real: getUserMedia + canvas + scanLoop de src/scanner.ts.
// La «cámara» es un video Y4M de cuadros SIMULADOS (tests/qr-camara-sim.ts: perspectiva, desenfoque,
// reflejo, moiré, ruido) del QR animado de 20 registros; cada fragmento aparece en 6 cuadros distintos
// (mano que se mueve). Se fuerza jsQR (sin BarcodeDetector), que es la ruta de iPhone y la más difícil.
//   npx vite build && npx vite-node scripts/e2e-camara.ts      → results/e2e-camara.json
// El video se escribe en la carpeta temporal del sistema y se borra al terminar.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeForQR, DEFAULT_CHUNK } from '../src/codec';
import { sample } from '../tests/fixtures';
import { simFrame } from '../tests/qr-camara-sim';

const PORT = +(process.env.PORT || 4181), BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const CHUNK = +(process.env.CHUNK || DEFAULT_CHUNK);
const frags = encodeForQR(sample(20, 42), CHUNK).fragments;

function writeY4M(file: string, W: number, H: number, perFrag = 6) {
  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, `YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
  const uv = Buffer.alloc((W * H) / 2, 128);
  frags.forEach((f, i) => {
    for (let t = 0; t < perFrag; t++) {
      const { px } = simFrame(f, W, H, 77_000 + i * 100 + t);
      const Y = Buffer.alloc(W * H);
      for (let p = 0; p < W * H; p++) Y[p] = px.data[p * 4];
      fs.writeSync(fd, 'FRAME\n'); fs.writeSync(fd, Y); fs.writeSync(fd, uv);
    }
  });
  fs.closeSync(fd);
}

function startServer() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  return new Promise<typeof p>((ok, ko) => { p.stdout!.on('data', (d) => { if (String(d).includes(String(PORT))) ok(p); }); p.on('exit', (c) => ko(new Error('preview salió ' + c))); });
}
// síncrono: si no, process.exit corta antes de que taskkill cierre el preview y el puerto queda tomado
const stopServer = (p: any) => { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']) : p.kill('SIGTERM'); } catch {} };

const results: any[] = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-cam-'));
const server = await startServer();
try {
  for (const [W, H] of [[1280, 720], [1920, 1080]]) {
    const y4m = path.join(tmp, `qr-${W}.y4m`);
    writeY4M(y4m, W, H);
    const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] });
    try {
      const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: 'es-PE', permissions: ['camera'], serviceWorkers: 'block' });
      await ctx.addInitScript(() => { delete (window as any).BarcodeDetector; });
      await ctx.route('**/api/**', (r) => r.abort()); // sin servidor: los registros quedan en el celular
      const page = await ctx.newPage();
      await page.goto(BASE);
      await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
      await page.click('[role=tab][data-tab=relevo]');
      const t0 = Date.now();
      await page.click('#cam-start');
      let ok = true;
      try { await page.waitForFunction(() => /completo/.test(document.getElementById('recv-status')!.textContent!), null, { timeout: 45000 }); } catch { ok = false; }
      const ms = Date.now() - t0;
      const out = {
        cuadro: `${W}×${H}`, fragmentos: frags.length, chunk: CHUNK, ok, msHastaCompleto: ms,
        estado: await page.textContent('#recv-status'), progreso: await page.textContent('#recv-progress-label').catch(() => null),
        registros: +(await page.textContent('#count'))!,
        motor: await page.getAttribute('#recv-status', 'data-engine'),
        video: await page.evaluate(() => { const v = document.querySelector('video')!; return `${v.videoWidth}×${v.videoHeight}`; }),
      };
      out.ok = ok && out.registros === 20;
      results.push(out);
      console.log(`${out.ok ? '✅' : '❌'} cámara ${out.cuadro}`, JSON.stringify(out));
    } finally { await browser.close(); fs.rmSync(y4m, { force: true }); }
  }
} finally {
  stopServer(server);
  fs.rmSync(tmp, { recursive: true, force: true });
}
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/e2e-camara.json', JSON.stringify({ fecha: new Date().toISOString(), simulado: 'cuadros de cámara SIMULADOS en Chrome real (fake device)', results }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
