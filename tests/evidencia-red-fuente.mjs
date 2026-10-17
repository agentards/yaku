// Evidencia de C1 + C2 (ronda 3) a 360 y 1280 px, SIN RED: banda «SIN RED · …», cola «1 ficha pendiente de
// sincronizar» → «Sincronizado ✓», chip de fuente y su ficha abierta, leyenda de niveles y HUD del portal.
// Mide además el alto de la banda y busca texto cortado o solapado (HUD, cabecera, banda) a cada ancho.
//   npm run build && node tests/evidencia-red-fuente.mjs
// La ficha de prueba solo vive en IndexedDB del navegador de Playwright: el preview local no tiene /api.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 4176, BASE = `http://localhost:${PORT}/`;
const OUT = path.resolve('docs/evidencia-3d');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const VPS = {
  360: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  1280: { viewport: { width: 1280, height: 800 } },
};
const res = { fecha: new Date().toISOString(), anchos: {} };
let malos = 0;
const check = (r, name, ok, detail = {}) => { r.checks.push({ name, ok, ...detail }); if (!ok) malos++; console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };

function startServer() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32', detached: process.platform !== 'win32' });
  return new Promise((ok, ko) => { p.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) ok(p); }); p.on('exit', (c) => ko(new Error('preview salió ' + c))); });
}
const stopServer = (p) => { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']) : process.kill(-p.pid, 'SIGTERM'); } catch {} };

const entrar = async (page) => {
  await page.goto(BASE + '?vista=portal');
  await page.waitForSelector('body[data-v3d="listo"]', { timeout: 30000 });
  await page.waitForFunction(() => window.__yaku3dUI?.tienda.centros.length > 0 && window.__yaku3dUI.tienda.realesLeidas, null, { timeout: 15000 });
};
const idb = (page, op, obj) => page.evaluate(async ([op, obj]) => {
  const db = await new Promise((r) => { const q = indexedDB.open('yaku-relay-proto', 1); q.onsuccess = () => r(q.result); });
  await new Promise((r) => { const tx = db.transaction('obs', 'readwrite'); const s = tx.objectStore('obs'); op === 'put' ? s.put(obj) : s.delete(obj); tx.oncomplete = r; });
}, [op, obj]);
const FICHA = { id: 'evidencia-c1-1', type: 'agua', severity: 2, lat: -4.7135, lon: -79.6458, note: 'prueba e2e evidencia C1', ts: Math.floor(Date.now() / 1000), deviceId: 'e2e00000', verified: false, source: 'local', receivedAt: Date.now(), synced: false };

/** Texto cortado (ellipsis o desborde) y cajas que se tapan dentro de la banda, la cabecera y el HUD. */
const medir = (page) => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const cortados = [];
  for (const e of document.querySelectorAll('.v3d-banda *, .v3d-banda, .v3d-top *, .v3d-hud, .v3d-hud *, .v3d-leyenda, .v3d-leyenda *, .v3d-pbar .t')) {
    if (!vis(e) || !e.textContent.trim()) continue;
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') cortados.push(`${e.className || e.tagName}: ${e.textContent.trim().slice(0, 50)}`);
    const r = e.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.left < -1) cortados.push(`fuera de pantalla ${e.className || e.tagName}: ${e.textContent.trim().slice(0, 40)}`);
  }
  // HUD: las cuatro esquinas no deben taparse entre sí
  const hud = [...document.querySelectorAll('.v3d-portal:not([hidden]) .v3d-hud')].filter(vis).map((e) => ({ k: e.dataset.h, r: e.getBoundingClientRect() }));
  const solapes = [];
  for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) {
    const a = hud[i].r, b = hud[j].r;
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) solapes.push(`${hud[i].k}×${hud[j].k}`);
  }
  // El portal no debe quedar tapado por el borde inferior de la escena (la banda SIN RED le quita alto).
  const pf = document.querySelector('.v3d-portal:not([hidden]) .v3d-pfuente');
  if (pf && pf.getBoundingClientRect().bottom > document.querySelector('.v3d-escena').getBoundingClientRect().bottom + 1) cortados.push('portal tapado: fuente del portal bajo el borde de la escena');
  const b = document.querySelector('.v3d-banda');
  return { cortados, solapes, bandaAlto: Math.round(b.getBoundingClientRect().height), banda: b.hidden ? '' : b.innerText.replace(/\s+/g, ' ').trim(),
    red: document.querySelector('[data-red]').textContent, chip: document.querySelector('[data-fuente]').textContent.trim(),
    leyenda: document.querySelector('.v3d-leyenda')?.innerText.replace(/\s+/g, ' ').trim() };
});

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
try {
  for (const [ancho, vp] of Object.entries(VPS)) {
    const r = (res.anchos[ancho] = { checks: [] });
    const ctx = await browser.newContext({ ...vp, locale: 'es-PE', timezoneId: 'America/Lima' });
    const page = await ctx.newPage();
    const shot = (n) => page.screenshot({ path: path.join(OUT, `c1c2-${ancho}-${n}.jpg`), type: 'jpeg', quality: 78 });
    // Con red: service worker + DEM guardados, y una ficha real sin sincronizar en IndexedDB.
    await page.goto(BASE); await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await entrar(page);
    await page.waitForFunction(() => window.__yaku3d?.dem?.().estado === 'guardado', null, { timeout: 30000 }).catch(() => {});
    await idb(page, 'put', FICHA);
    // Sin red: recarga desde el service worker.
    await ctx.setOffline(true);
    await entrar(page);
    await page.waitForFunction(() => /pendiente/.test(document.querySelector('.v3d-banda [data-cola]')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4000);
    let m = await medir(page);
    check(r, `${ancho}: SIN RED + «1 ficha pendiente de sincronizar», banda ≥ 32 px`, m.red === 'SIN RED' && m.bandaAlto >= 32 && m.banda.includes('SIN RED · trabajando con datos guardados en este equipo (escenario CENEPRED del 16/10/2026)') && m.banda.includes('1 ficha pendiente de sincronizar'), m);
    check(r, `${ancho}: chip de fuente y leyenda con «no es pronóstico ni alerta»`, m.chip === 'Fuente: CENEPRED/SIGRID 23077 · 16/10/2026' && /Muy alto.*Alto.*Medio.*Bajo.*Muy bajo/.test(m.leyenda) && m.leyenda.includes('Nivel referencial del escenario: no es pronóstico ni alerta'), { leyenda: m.leyenda });
    check(r, `${ancho}: nada cortado en banda, cabecera y leyenda`, !m.cortados.length, { cortados: m.cortados });
    await shot('1-sin-red-1-pendiente');
    // Portal abierto sin red: HUD sin solapes ni texto cortado.
    await page.evaluate(() => { const t = window.__yaku3dUI.tienda; t.seleccionar(t.centros.filter((c) => c.cg === false && c.r >= 4).sort((a, b) => b.n.length - a.n.length)[0]); });
    await page.waitForTimeout(5000);
    m = await medir(page);
    check(r, `${ancho}: portal sin red, HUD sin texto cortado ni esquinas solapadas`, !m.cortados.length && !m.solapes.length, { cortados: m.cortados, solapes: m.solapes });
    await shot('2-portal-sin-red');
    await page.evaluate(() => window.__yaku3dUI.tienda.seleccionar(null));
    // La ficha ya se había sincronizado en otra pasada: synced=true → «Sincronizado ✓» (sigue sin red).
    await idb(page, 'put', { ...FICHA, synced: true, syncedAt: Date.now() });
    await page.waitForFunction(() => /Sincronizado ✓/.test(document.querySelector('.v3d-banda [data-cola]')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // El aviso «consolidada(s) en el servidor» es transitorio: se espera a que se vaya para que la captura se lea.
    await page.waitForFunction(() => { const a = document.querySelector('[data-aviso]'); return !a || a.hidden; }, null, { timeout: 8000 }).catch(() => {});
    m = await medir(page);
    check(r, `${ancho}: SIN RED + «Sincronizado ✓»`, m.red === 'SIN RED' && m.bandaAlto >= 32 && m.banda.includes('Sincronizado ✓') && !m.cortados.length, m);
    await shot('3-sin-red-sincronizado');
    // Ficha de fuente abierta.
    await page.click('.v3d-top [data-fuente]');
    await page.waitForTimeout(300);
    const f = await page.evaluate(() => { const d = document.querySelector('[data-fuente-ficha]'); const b = d.getBoundingClientRect(); return { abierta: d.open, txt: d.innerText, dentro: b.left >= 0 && b.right <= innerWidth + 1 }; });
    check(r, `${ancho}: ficha de fuente abierta con título, firma, descarga, IGN, OSIPTEL 2025-IV y SENAMHI VENCIDO`, f.abierta && f.dentro && /SIGRID 23077/.test(f.txt) && /Firmado\s+16\/10\/2026/.test(f.txt) && /Descargado/.test(f.txt) && /IGN/.test(f.txt) && /2025-IV/.test(f.txt) && /SENAMHI.*VENCIDO/.test(f.txt), { dentro: f.dentro });
    await shot('4-ficha-fuente');
    await page.keyboard.press('Escape');
    await idb(page, 'del', FICHA.id);
    await ctx.close();
  }
} finally {
  await browser.close();
  stopServer(server);
}
fs.writeFileSync(path.join(OUT, 'c1c2-medidas.json'), JSON.stringify(res, null, 2));
console.log(malos ? `\n${malos} comprobación(es) fallaron` : '\nTodo OK');
process.exit(malos ? 1 : 0);
