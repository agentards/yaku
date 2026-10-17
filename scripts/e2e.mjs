// E2E con Playwright + Chrome headless del sistema.
//   npm run e2e                         → local (vite preview), viewport Android 412x915
//   VIEWPORT=desktop node scripts/e2e.mjs
//   BASE_URL=https://… node scripts/e2e.mjs   → remoto, sync contra Worker + D1 real
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { PNG } from 'pngjs';

const PORT = 4173, REMOTE = process.env.BASE_URL, BASE = REMOTE || `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const VP_NAME = process.env.VIEWPORT || 'android';
const VPS = {
  android: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 } },
};
const CTX = { ...VPS[VP_NAME], locale: 'es-PE', timezoneId: 'America/Lima' };
const results = [];
const log = (name, ok, detail = {}) => { results.push({ name, ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };

function startServer() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  return new Promise((res, rej) => {
    p.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) res(p); });
    p.on('exit', (c) => rej(new Error('preview salió ' + c)));
  });
}
const stopServer = (p) => { if (!p) return; try { process.kill(-p.pid, 'SIGTERM'); } catch {} };

const ready = (page) => page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
const count = async (page) => +(await page.textContent('#count'));
const tab = (page, t) => page.click(`[role=tab][data-tab=${t}]`);
async function openFold(page, sel) { if (!(await page.locator(sel).evaluate((d) => d.open))) await page.click(`${sel} > summary`); }
async function firstVisit(ctx) {
  const page = await ctx.newPage();
  const t = Date.now();
  await page.goto(BASE); await ready(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  return { page, ms: Date.now() - t };
}
async function addObs(page, i) {
  await tab(page, 'registrar');
  await page.click(`[data-type=${['agua', 'huaico', 'cauce'][i % 3]}]`);
  await page.click(`#f-sev label:nth-of-type(${1 + (i % 3)})`);
  await openFold(page, '#manual');
  await page.fill('#f-lat', (-5.19449 + i * 0.001).toFixed(5)); await page.dispatchEvent('#f-lat', 'change');
  await page.fill('#f-lon', (-80.63282 - i * 0.001).toFixed(5)); await page.dispatchEvent('#f-lon', 'change');
  await page.fill('#f-note', `prueba e2e ${i}`);
  await page.click('#save');
  await page.waitForFunction((n) => +document.getElementById('count').textContent >= n, i + 1);
}
async function noForbidden(page) {
  const t = (await page.evaluate(() => document.body.innerText)).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return !['via segura', 'ruta segura', 'camino seguro', 'transitable'].some((b) => t.includes(b));
}
async function setChunk(page, chunk) {
  await tab(page, 'sync'); await openFold(page, '#diag');
  await page.fill('#chunk', String(chunk));
}
async function captureFragments(page, chunk) {
  await setChunk(page, chunk);
  await tab(page, 'relevo');
  await page.click('#emit');
  await page.waitForSelector('#qr[data-fragment]');
  const idx = await page.textContent('#qr-idx');
  const n = /de (\d+)/.test(idx) ? +idx.match(/de (\d+)/)[1] : 1;
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
async function mapState(page) {
  await page.waitForFunction(() => window.__yaku.getMap()?.loaded(), null, { timeout: 20000 });
  await page.evaluate(() => window.__yaku.mapLoaded());
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const m = window.__yaku.getMap();
    const n = (l) => m.queryRenderedFeatures({ layers: [l] }).length;
    return { loaded: m.loaded(), sources: ['senamhi', 'erosion', 'erosionPts', 'limite'].every((s) => m.isSourceLoaded(s)),
      senamhi: n('senamhi-fill'), erosionPts: n('erosion-pts'), limite: n('limite-line'), citizen: n('citizen-dot'), osmVisible: m.getLayoutProperty('osm', 'visibility') };
  });
}
async function canvasColors(page) {
  const buf = await page.locator('#map').screenshot();
  const p = PNG.sync.read(buf);
  const set = new Set();
  for (let i = 0; i < p.data.length; i += 4 * 7) set.add((p.data[i] >> 3) << 10 | (p.data[i + 1] >> 3) << 5 | (p.data[i + 2] >> 3));
  return set.size;
}

const server = REMOTE ? null : await startServer();
let browser, camBrowser;
const mock = { posts: 0, unique: new Set(), received: 0 };
const mockRoute = async (route) => {
  const req = route.request();
  if (req.url().includes('/api/stats')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: mock.unique.size, unique_ids: mock.unique.size }) });
  const ids = (JSON.parse(req.postData() || '{}').records || []).map((r) => r.id);
  mock.posts++; mock.received += ids.length;
  const before = mock.unique.size; ids.forEach((id) => mock.unique.add(id));
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accepted: ids, inserted: mock.unique.size - before, duplicates: ids.length - (mock.unique.size - before) }) });
};
try {
  browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // ---------- (a) offline: primera visita → sin red → recarga y nueva pestaña ----------
  const ctxA = await browser.newContext(CTX);
  if (!REMOTE) await ctxA.route('**/api/**', mockRoute);
  const remoteReqs = [];
  ctxA.on('request', (r) => { const u = new URL(r.url()); if (!u.href.startsWith(BASE) && !u.protocol.startsWith('data') && !u.protocol.startsWith('blob')) remoteReqs.push(u.host); });
  const { page: A, ms: firstMs } = await firstVisit(ctxA);
  const ui0 = await A.evaluate(() => ({ camHidden: document.getElementById('cam-box').hidden, qrHidden: document.getElementById('emit-out').hidden, endpointVisible: !!document.getElementById('endpoint').offsetParent }));
  const swCached = await A.evaluate(async () => (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).length))).reduce((a, b) => a + b, 0));
  await ctxA.setOffline(true);
  await A.waitForFunction(() => !navigator.onLine);
  for (let i = 0; i < 3; i++) await addObs(A, i);
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
  const pendingPill = await A2.textContent('#pending-count');
  await A2.close();
  log('(a) offline: recarga y nueva pestaña cargan y leen IndexedDB', afterReload === 3 && newTabCount === 3 && netLabel === 'SIN RED' && pending === 3 && pendingPill === '3',
    { viewport: VP_NAME, firstVisitMs: firstMs, precachedEntries: swCached, offlineReloadMs: reloadMs, offlineNewTabMs: newTabMs, recordsAfterReload: afterReload, recordsNewTab: newTabCount, net: netLabel, pendingSync: pending, pendingPill });
  log('UI: cámara y QR ocultos hasta usarlos; ajustes técnicos plegados', ui0.camHidden && ui0.qrHidden && !ui0.endpointVisible, ui0);

  // ---------- (m) mapa y capas reales SIN RED ----------
  await tab(A, 'mapa');
  const ms1 = await mapState(A);
  const colors = await canvasColors(A);
  await A.screenshot({ path: `results/screens/e2e-${VP_NAME}-mapa-sin-red.png` });
  log('(m) mapa MapLibre + capas SENAMHI/SIGRID/límite + puntos ciudadanos se ven sin red', ms1.loaded && ms1.sources && ms1.senamhi > 0 && ms1.erosionPts > 0 && ms1.limite > 0 && ms1.citizen === 3 && colors > 8 && ms1.osmVisible === 'none',
    { ...ms1, distinctColorsInMap: colors, remoteHostsRequested: [...new Set(remoteReqs)] });

  // ---------- estilos ----------
  await tab(A, 'relevo');
  const style = await A.evaluate(() => {
    const li = document.querySelector('#list li'); const cs = getComputedStyle(li);
    const txt = document.body.innerText;
    return {
      badges: [...document.querySelectorAll('#list li')].map((l) => l.querySelector('.badge-unverified')?.textContent),
      citizenBorder: `${cs.borderTopStyle} ${cs.borderTopColor}`,
      officialTemplate: !!document.getElementById('official-template'),
      fuenteOficialText: /FUENTE OFICIAL/.test(txt),
      sourceBadgesOutsideLegend: [...document.querySelectorAll('.badge-source')].filter((b) => !b.closest('.official-layer')).length,
      sourceBadgesInCitizen: document.querySelectorAll('.citizen .badge-source, .citizen-legend .badge-source').length,
      senamhiLegend: document.querySelector('.official-layer[data-layer=senamhi] .forecast-status')?.textContent,
      erosionSource: document.querySelector('.official-layer[data-layer=erosion] .badge-source')?.textContent,
      legendWithSourceAndDate: [...document.querySelectorAll('.official-layer')].map((l) => /fuente|SENAMHI|INDECI|CENEPRED/i.test(l.textContent) && /20\d\d/.test(l.textContent)),
    };
  });
  log('estilo: reportes NO VERIFICADO (discontinuo); sin plantilla FUENTE OFICIAL; fuente solo junto a capas reales; sin textos prohibidos',
    style.badges.length === 3 && style.badges.every((b) => b === 'NO VERIFICADO') && style.citizenBorder.startsWith('dashed') && !style.officialTemplate && !style.fuenteOficialText
    && style.sourceBadgesOutsideLegend === 0 && style.sourceBadgesInCitizen === 0 && style.legendWithSourceAndDate.every(Boolean) && style.senamhiLegend === `Pronóstico SENAMHI del 15/10/2026 · vigencia 24 h · ${Date.now() > Date.parse('2026-10-16T00:00:00Z') ? 'VENCIDO, se muestra como ejemplo' : 'VIGENTE'}` && /SIGRID\/CENEPRED, obtenida vía geoservicio de INDECI/.test(style.erosionSource) && (await noForbidden(A)), style);

  // ---------- (g) GPS automático + marcador arrastrable ----------
  const ctxG = await browser.newContext({ ...CTX, geolocation: { latitude: -5.17, longitude: -80.65, accuracy: 15 }, permissions: ['geolocation'] });
  const { page: G } = await firstVisit(ctxG);
  await ctxG.setOffline(true); // GPS no depende de la red
  await tab(G, 'registrar');
  await G.waitForFunction(() => /GPS ±/.test(document.getElementById('loc-status').textContent), null, { timeout: 10000 });
  await G.click('#save');
  await G.waitForFunction(() => +document.getElementById('count').textContent === 1);
  const gpsRec = (await G.evaluate(() => window.__yaku.all()))[0];
  await G.waitForFunction(() => window.__yaku.getMap()?.loaded(), null, { timeout: 20000 });
  await G.waitForTimeout(800); // easeTo
  await G.evaluate(() => window.scrollTo(0, 0)); await G.waitForTimeout(200);
  const box = await G.locator('.draft-marker').boundingBox();
  const x0 = box.x + box.width / 2, y0 = box.y + box.height / 2;
  if (CTX.hasTouch) {
    // Arrastre táctil real (eventos de entrada confiables vía CDP), como con el dedo
    const cdp = await ctxG.newCDPSession(G);
    const tp = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x0, y0) });
    for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x0 + 7 * k, y0 + 5 * k) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await G.mouse.move(x0, y0); await G.mouse.down(); await G.mouse.move(x0 + 60, y0 + 40, { steps: 8 }); await G.mouse.up();
  }
  await G.waitForFunction(() => /ajustada/.test(document.getElementById('loc-status').textContent), null, { timeout: 5000 });
  await G.fill('#f-note', 'ajustado'); await G.click('#save');
  await G.waitForFunction(() => +document.getElementById('count').textContent === 2);
  const adj = (await G.evaluate(() => window.__yaku.all())).find((r) => r.note === 'ajustado');
  log('(g) GPS automático al registrar (sin red) y ajuste arrastrando el marcador', Math.abs(gpsRec.lat + 5.17) < 1e-4 && Math.abs(gpsRec.lon + 80.65) < 1e-4 && (Math.abs(adj.lat - gpsRec.lat) > 1e-4 || Math.abs(adj.lon - gpsRec.lon) > 1e-4),
    { gps: [gpsRec.lat, gpsRec.lon], ajustado: [adj.lat, adj.lon] });
  await ctxG.close();

  // ---------- (b) enlace relay entre dos contextos (B sin red) ----------
  const multi = await captureFragments(A, 150);
  const single = await captureFragments(A, 2000);
  await A.screenshot({ path: `results/screens/e2e-${VP_NAME}-qr.png` });
  const ctxB = await browser.newContext(CTX);
  if (!REMOTE) await ctxB.route('**/api/**', mockRoute);
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
  log('(b) enlace relay #p= entre contextos, sin red, con dedup', bCount === 3 && /3 nuevos/.test(s1) && /0 nuevos · 3 duplicados/.test(s2) && hashCleared,
    { linkChars: single.link.length, first: s1, second: s2, recordsB: bCount, hashCleared });

  // ---------- (c) subir imágenes de QR fragmentado + barra de progreso ----------
  const ctxC = await browser.newContext(CTX);
  const { page: C0 } = await firstVisit(ctxC);
  await ctxC.setOffline(true);
  await C0.reload(); await ready(C0);
  await tab(C0, 'relevo');
  fs.mkdirSync('results/qr-png', { recursive: true });
  const files = multi.pngs.map((b, i) => { const f = `results/qr-png/frag-${i + 1}-of-${multi.n}.png`; fs.writeFileSync(f, b); return f; }).reverse();
  // primero 1 fragmento → barra parcial; luego el resto
  await C0.setInputFiles('#file', files.slice(0, 1));
  await C0.waitForFunction(() => document.getElementById('recv-progress').dataset.have === '1');
  const partial = await C0.evaluate(() => ({ visible: !document.getElementById('recv-progress').hidden, label: document.getElementById('recv-progress-label').textContent, width: document.getElementById('recv-bar').style.width }));
  await C0.setInputFiles('#file', files.slice(1));
  await C0.waitForFunction(() => /completo/.test(document.getElementById('recv-status').textContent), null, { timeout: 15000 });
  const full = await C0.evaluate(() => ({ label: document.getElementById('recv-progress-label').textContent, complete: document.getElementById('recv-progress').classList.contains('complete') }));
  log('(c) subir imágenes de QR fragmentado sin red; barra de progreso parcial → completa', (await count(C0)) === 3 && multi.n > 1 && partial.visible && full.complete,
    { fragments: multi.n, emitInfo: multi.info, partial, full, status: await C0.textContent('#recv-status') });

  // ---------- (d) cámara simulada (Chrome fake device, video Y4M de QR animado) ----------
  makeY4M(multi.pngs, '/tmp/yaku-qr.y4m');
  camBrowser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=/tmp/yaku-qr.y4m'] });
  const ctxD = await camBrowser.newContext({ ...CTX, permissions: ['camera'] });
  const { page: D } = await firstVisit(ctxD);
  await ctxD.setOffline(true);
  await D.reload(); await ready(D);
  await tab(D, 'relevo');
  const camHiddenBefore = await D.evaluate(() => document.getElementById('cam-box').hidden);
  t = Date.now();
  await D.click('#cam-start');
  let dOk = true;
  try { await D.waitForFunction(() => /completo/.test(document.getElementById('recv-status').textContent), null, { timeout: 30000 }); } catch { dOk = false; }
  log('(d) cámara simulada: QR animado leído y reensamblado sin red', dOk && camHiddenBefore && (await count(D)) === 3,
    { fragments: multi.n, msToComplete: Date.now() - t, engine: await D.getAttribute('#recv-status', 'data-engine'), cameraOptions: await D.locator('#cams option').count(), camHiddenBefore, progress: await D.textContent('#recv-progress-label') });

  // ---------- (e) sync diferida: en relevo → consolidado; idempotente ----------
  await tab(A, 'sync');
  const label0 = await A.locator('#list .sync').first().textContent();
  await ctxA.setOffline(false); // evento 'online' → consolidación automática
  await A.waitForFunction(() => document.querySelectorAll('#list .sync.ok').length === 3, null, { timeout: 15000 });
  const label1 = await A.locator('#list .sync').first().textContent();
  const statusA = await A.textContent('#sync-status');
  await A.click('#sync'); await A.waitForTimeout(400);
  await A.reload(); await ready(A);
  const syncedPersisted = await A.locator('#list .sync.ok').count();
  const pill = await A.textContent('#pending-count');
  await ctxB.setOffline(false); // B tiene los MISMOS 3 registros (recibidos por enlace)
  await B2.waitForFunction(() => document.querySelectorAll('#list .sync.ok').length === 3, null, { timeout: 15000 });
  const statusB = await B2.textContent('#sync-status');
  let srv;
  const ids = (await A.evaluate(() => window.__yaku.all())).map((r) => r.id);
  if (REMOTE) {
    // Mismo lote enviado 2 veces más directo al Worker; luego verificar en GET que quedan solo ids únicos.
    srv = await A.evaluate(async (ids) => {
      const recs = (await window.__yaku.all()).map(({ source, receivedAt, synced, syncedAt, ...r }) => r);
      const post = () => fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ records: recs }) }).then((r) => r.json());
      const p1 = await post(), p2 = await post();
      const g = await fetch(`/api/reports?ids=${ids.join(',')}`, { cache: 'no-store' }).then((r) => r.json());
      const st = await fetch('/api/stats', { cache: 'no-store' }).then((r) => r.json());
      const tampered = await fetch('/api/sync', { method: 'POST', body: JSON.stringify({ records: [{ ...recs[0], severity: recs[0].severity === 3 ? 1 : 3 }] }) }).then((r) => r.json());
      return { post1: { inserted: p1.inserted, duplicates: p1.duplicates }, post2: { inserted: p2.inserted, duplicates: p2.duplicates }, getCount: g.count, getUniqueIds: new Set(g.reports.map((r) => r.id)).size, allVerified0: g.reports.every((r) => r.verified === 0), stats: st, tamperedRejected: tampered.rejected?.length === 1 && tampered.inserted === 0 };
    }, ids);
  }
  const ok = label0 === 'en relevo' && label1 === 'consolidado' && syncedPersisted === 3 && pill === '0' &&
    (REMOTE ? srv.post1.inserted === 0 && srv.post2.inserted === 0 && srv.getCount === 3 && srv.getUniqueIds === 3 && srv.stats.total === srv.stats.unique_ids && srv.allVerified0 && srv.tamperedRejected && /3 nuevos en servidor/.test(statusA) && /0 nuevos en servidor, 3 ya estaban/.test(statusB)
      : mock.unique.size === 3 && mock.received >= 6); // 2 pestañas de B envían el mismo lote: el servidor no duplica
  log(`(e) sync ${REMOTE ? 'contra Worker + D1 real' : 'contra mock interceptado'}: en relevo → consolidado; reenvíos no duplican`, ok,
    { before: label0, after: label1, statusA, statusB, syncedAfterReload: syncedPersisted, pendingPill: pill, ...(REMOTE ? { server: srv } : { mockPosts: mock.posts, mockReceived: mock.received, mockUnique: mock.unique.size }) });

  if (!REMOTE) {
    // ---------- (f) servidor de origen apagado ----------
    stopServer(server);
    await new Promise((r) => setTimeout(r, 800));
    let serverDown = false;
    try { await fetch(BASE); } catch { serverDown = true; }
    const F = await ctxA.newPage();
    t = Date.now();
    await F.goto(BASE); await ready(F);
    const mf = await mapState(F);
    log('(f) servidor apagado: nueva pestaña carga desde SW, lee IndexedDB y dibuja el mapa', serverDown && (await count(F)) === 3 && mf.senamhi > 0 && mf.erosionPts > 0, { serverDown, loadMs: Date.now() - t, records: await count(F), map: mf });
  }
} catch (e) {
  log('ERROR', false, { error: String(e.stack || e) });
} finally {
  await browser?.close(); await camBrowser?.close();
  stopServer(server);
  fs.mkdirSync('results', { recursive: true });
  const out = REMOTE ? `results/e2e-remote-${VP_NAME}.json` : `results/e2e-${VP_NAME}.json`;
  fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), base: BASE, viewport: VP_NAME, chrome: CHROME, results }, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} OK → ${out}`);
  process.exit(failed ? 1 : 0);
}
