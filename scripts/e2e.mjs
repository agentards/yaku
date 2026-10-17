// E2E con Playwright + Chrome headless del sistema. Uso: npm run e2e
// Escribe results/e2e.json con lo que realmente pasó.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { PNG } from 'pngjs';

const PORT = 4173, REMOTE = process.env.BASE_URL, BASE = REMOTE || `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const results = [];
const log = (name, ok, detail = {}) => { results.push({ name, ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };
const assert = (c, m) => { if (!c) throw new Error(m); };

function startServer() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  return new Promise((res, rej) => {
    p.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) res(p); });
    p.on('exit', (c) => rej(new Error('preview salió ' + c)));
  });
}
const stopServer = (p) => { if (!p) return; try { process.kill(-p.pid, 'SIGTERM'); } catch {} };

async function ready(page) { await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 }); }
async function count(page) { return +(await page.textContent('#count')); }
async function firstVisit(ctx) {
  const page = await ctx.newPage();
  const t = Date.now();
  await page.goto(BASE);
  await ready(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // con clientsClaim el SW toma control sin recargar; esperamos a que controle
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  return { page, ms: Date.now() - t };
}
async function addObs(page, i) {
  await page.selectOption('#f-type', ['agua', 'huaico', 'cauce'][i % 3]);
  await page.selectOption('#f-sev', String(1 + (i % 3)));
  await page.fill('#f-lat', (-5.19449 + i * 0.001).toFixed(5));
  await page.fill('#f-lon', (-80.63282 - i * 0.001).toFixed(5));
  await page.fill('#f-note', `prueba e2e ${i}`);
  await page.click('#save');
  await page.waitForFunction((n) => +document.getElementById('count').textContent >= n, i + 1);
}
async function noForbidden(page) {
  const t = (await page.evaluate(() => document.body.innerText)).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return !['via segura', 'ruta segura', 'camino seguro'].some((b) => t.includes(b));
}
async function captureFragments(page, chunk) {
  await page.fill('#chunk', String(chunk));
  await page.click('#emit');
  await page.waitForSelector('#qr[data-fragment]');
  await page.click('#qr-play').catch(() => {});
  const n = +((await page.textContent('#qr-idx')).match(/\/(\d+)/)[1]);
  // pausar y recorrer determinísticamente desde 1
  await page.evaluate(() => {});
  const pngs = [];
  for (let k = 0; k < n; k++) {
    if (k === 0) { while (+(await page.getAttribute('#qr', 'data-fragment')) !== 1) await page.click('#qr-next'); }
    else await page.click('#qr-next');
    await page.waitForFunction((x) => document.getElementById('qr').dataset.fragment === String(x), k + 1);
    const url = await page.evaluate(() => document.getElementById('qr').toDataURL('image/png'));
    pngs.push(Buffer.from(url.split(',')[1], 'base64'));
  }
  return { n, pngs, info: await page.textContent('#emit-info'), link: await page.inputValue('#link') };
}
function makeY4M(pngs, file, framesEach = 12) {
  const W = 640, H = 480;
  const out = [Buffer.from(`YUV4MPEG2 W${W} H${H} F24:1 Ip A1:1 C420jpeg\n`)];
  const frames = pngs.map((buf) => {
    const p = PNG.sync.read(buf);
    const s = Math.min((H - 20) / p.height, (W - 20) / p.width);
    const Y = Buffer.alloc(W * H, 235);
    const ox = (W - p.width * s) / 2, oy = (H - p.height * s) / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = Math.floor((x - ox) / s), sy = Math.floor((y - oy) / s);
      if (sx >= 0 && sy >= 0 && sx < p.width && sy < p.height) Y[y * W + x] = p.data[(sy * p.width + sx) * 4] < 128 ? 16 : 235;
    }
    return Buffer.concat([Buffer.from('FRAME\n'), Y, Buffer.alloc(W * H / 2, 128)]);
  });
  for (const f of frames) for (let r = 0; r < framesEach; r++) out.push(f);
  fs.writeFileSync(file, Buffer.concat(out));
}

const server = REMOTE ? null : await startServer();
let browser, camBrowser;
const syncServer = { posts: 0, unique: new Set(), received: 0 };
try {
  browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // ---------- (a) offline real: primera visita → offline → recarga y nueva pestaña ----------
  const ctxA = await browser.newContext();
  const { page: A, ms: firstMs } = await firstVisit(ctxA);
  const swCached = await A.evaluate(async () => (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).length))).reduce((a, b) => a + b, 0));
  await ctxA.setOffline(true);
  await A.waitForFunction(() => !navigator.onLine);
  for (let i = 0; i < 3; i++) await addObs(A, i); // creados SIN red
  let t = Date.now();
  await A.reload(); await ready(A);
  const reloadMs = Date.now() - t;
  const afterReload = await count(A);
  const netLabel = await A.textContent('#net');
  const A2 = await ctxA.newPage();
  t = Date.now();
  await A2.goto(BASE); await ready(A2);
  const newTabMs = Date.now() - t;
  const newTabCount = await count(A2);
  const pending = await A2.locator('#list .sync.pend').count();
  await A2.close();
  log('(a) offline: recarga y nueva pestaña cargan y leen IndexedDB', afterReload === 3 && newTabCount === 3 && netLabel === 'SIN RED' && pending === 3,
    { firstVisitMs: firstMs, precachedEntries: swCached, offlineReloadMs: reloadMs, offlineNewTabMs: newTabMs, recordsAfterReload: afterReload, recordsNewTab: newTabCount, net: netLabel, pendingSync: pending });

  // ---------- estilos: NO VERIFICADO distinto de oficial; sin textos prohibidos ----------
  const style = await A.evaluate(() => {
    const li = document.querySelector('#list li'), off = document.getElementById('official-template');
    const cs = (e) => getComputedStyle(e);
    return {
      badges: [...document.querySelectorAll('#list li')].map((l) => l.querySelector('.badge-unverified')?.textContent),
      citizenBorder: cs(li).borderTopStyle + ' ' + cs(li).borderTopColor,
      officialBorder: cs(off).borderTopStyle + ' ' + cs(off).borderTopColor,
    };
  });
  log('estilo: cada reporte con etiqueta NO VERIFICADO y borde distinto al oficial', style.badges.every((b) => b === 'NO VERIFICADO') && style.citizenBorder !== style.officialBorder && (await noForbidden(A)), style);

  // ---------- (b) enlace relay entre dos contextos (B offline tras primera visita) ----------
  const multi = await captureFragments(A, 150);   // QR fragmentado
  const single = await captureFragments(A, 2000); // 1 QR
  const ctxB = await browser.newContext();
  const { page: B0 } = await firstVisit(ctxB);
  await B0.close();
  await ctxB.setOffline(true);
  const B = await ctxB.newPage();
  await B.goto(single.link); await ready(B);
  await B.waitForFunction(() => document.getElementById('recv-status').textContent.includes('Enlace relay'));
  const s1 = await B.textContent('#recv-status');
  const hashCleared = (await B.evaluate(() => location.hash)) === '';
  const B2 = await ctxB.newPage();
  await B2.goto(single.link); await ready(B2);
  await B2.waitForFunction(() => document.getElementById('recv-status').textContent.includes('Enlace relay'));
  const s2 = await B2.textContent('#recv-status');
  const bCount = await count(B2);
  const srcLabel = await B2.textContent('#list li small');
  log('(b) enlace relay #p= entre contextos, offline, con dedup', bCount === 3 && /3 nuevos/.test(s1) && /0 nuevos · 3 duplicados/.test(s2) && hashCleared && srcLabel.includes('enlace'),
    { linkChars: single.link.length, first: s1, second: s2, recordsB: bCount, hashCleared });

  // ---------- (c) subir imágenes de QR fragmentado (jsQR desde archivo) ----------
  const ctxC = await browser.newContext();
  const { page: C0 } = await firstVisit(ctxC);
  await ctxC.setOffline(true);
  await C0.reload(); await ready(C0);
  fs.mkdirSync('results/qr-png', { recursive: true });
  const files = multi.pngs.map((b, i) => { const f = `results/qr-png/frag-${i + 1}-of-${multi.n}.png`; fs.writeFileSync(f, b); return f; }).reverse();
  await C0.setInputFiles('#file', files);
  await C0.waitForFunction(() => /completo/.test(document.getElementById('recv-status').textContent), null, { timeout: 15000 });
  const cStatus = await C0.textContent('#recv-status');
  log('(c) subir imágenes QR (fragmentado, en orden inverso) offline', (await count(C0)) === 3 && multi.n > 1,
    { fragments: multi.n, emitInfo: multi.info, status: cStatus });

  // ---------- (d) cámara simulada (Chrome fake device con video Y4M de QR animado) ----------
  makeY4M(multi.pngs, '/tmp/yaku-qr.y4m');
  camBrowser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=/tmp/yaku-qr.y4m'] });
  const ctxD = await camBrowser.newContext({ permissions: ['camera'] });
  const { page: D } = await firstVisit(ctxD);
  await ctxD.setOffline(true);
  await D.reload(); await ready(D);
  const camsListed = await D.locator('#cams option').count();
  t = Date.now();
  await D.click('#cam-start');
  let dOk = true;
  try { await D.waitForFunction(() => /completo/.test(document.getElementById('recv-status').textContent), null, { timeout: 30000 }); } catch { dOk = false; }
  log('(d) cámara simulada: QR animado leído y reensamblado offline', dOk && (await count(D)) === 3,
    { fragments: multi.n, msToComplete: Date.now() - t, engine: await D.getAttribute('#recv-status', 'data-engine'), cameraOptions: camsListed, status: await D.textContent('#recv-status') });

  // ---------- (e) sync diferida al volver la red, idempotente ----------
  for (const c of [ctxA, ctxB]) await c.route('https://sync.mock.test/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    syncServer.posts++;
    const ids = (body.records || []).map((r) => r.id);
    syncServer.received += ids.length;
    ids.forEach((id) => syncServer.unique.add(id));
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ accepted: ids }) });
  });
  for (const p of [A, B2]) { await p.fill('#endpoint', 'https://sync.mock.test/api'); await p.dispatchEvent('#endpoint', 'change'); }
  const postsBefore = syncServer.posts;
  await A.click('#sync'); // offline: no debe enviar
  await A.waitForTimeout(300);
  const postsWhileOffline = syncServer.posts - postsBefore;
  await ctxA.setOffline(false); // dispara evento 'online' → flush automático
  await A.waitForFunction(() => document.querySelectorAll('#list .sync.ok').length === 3, null, { timeout: 10000 });
  const postsAfterOnline = syncServer.posts;
  await A.click('#sync'); await A.waitForTimeout(300);
  const postsAfterResync = syncServer.posts;
  await A.reload(); await ready(A);
  const syncedPersisted = await A.locator('#list .sync.ok').count();
  await ctxB.setOffline(false); // B tiene los MISMOS 3 registros (recibidos por enlace)
  await B2.waitForFunction(() => document.querySelectorAll('#list .sync.ok').length === 3, null, { timeout: 10000 });
  log('(e) sync: nada sin red; auto-flush en evento online; reintento no reenvía; servidor sin duplicados', postsWhileOffline === 0 && postsAfterOnline === 1 && postsAfterResync === 1 && syncedPersisted === 3 && syncServer.unique.size === 3,
    { postsWhileOffline, postsAfterOnlineEvent: postsAfterOnline, postsAfterManualResync: postsAfterResync, syncedAfterReload: syncedPersisted, totalPosts: syncServer.posts, idsReceived: syncServer.received, uniqueIdsOnServer: syncServer.unique.size });

  if (!REMOTE) {
  // ---------- (f) servidor apagado: la app sigue abriendo (prueba más dura que setOffline) ----------
  stopServer(server);
  await new Promise((r) => setTimeout(r, 800));
  let serverDown = false;
  try { await fetch(BASE); } catch { serverDown = true; }
  const F = await ctxA.newPage();
  t = Date.now();
  await F.goto(BASE); await ready(F);
  log('(f) servidor de origen apagado: nueva pestaña carga desde SW y lee IndexedDB', serverDown && (await count(F)) === 3, { serverDown, loadMs: Date.now() - t, records: await count(F) });
  }
} catch (e) {
  log('ERROR', false, { error: String(e.stack || e) });
} finally {
  await browser?.close(); await camBrowser?.close();
  stopServer(server);
  fs.mkdirSync('results', { recursive: true });
  fs.writeFileSync(REMOTE ? 'results/e2e-remote.json' : 'results/e2e.json', JSON.stringify({ date: new Date().toISOString(), base: BASE, chrome: CHROME, results }, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} OK`);
  process.exit(failed ? 1 : 0);
}
