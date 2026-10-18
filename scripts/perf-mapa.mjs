// Medición de carga y memoria del Centro de monitoreo en Lima (prueba en sala del pitch, San Isidro) contra el
// SERVIDOR LOCAL REAL (SQLite temporal fuera del repo). Mide, con la red WiFi de la sala simulada (CDP):
//  · ms hasta la escena lista, hasta las primeras teselas y hasta el mapa completo (sin teselas pendientes);
//  · peticiones Range al .pmtiles y MB transferidos antes de quedar completo;
//  · memoria privada de TODOS los procesos del navegador (CDP SystemInfo → PIDs → Windows), contextos WebGL y heap JS;
//  · lo mismo tras un reporte en la ubicación real de este equipo (Windows Location Service, ±m) y tras 30 s de órbita.
// La ubicación se usa redondeada a 3 decimales (~100 m) y no se guarda exacta. Reporte etiquetado SIMULADO.
//   npm run build && node scripts/perf-mapa.mjs [--dist dist] [--etiqueta base] [--ubicacion lat,lon]
// Resultado: results/perf-mapa-<etiqueta>.json. Windows: una sola prueba pesada a la vez.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accederConPin } from './acceso-pin.mjs';
import { iniciar } from '../servidor-local/servidor.ts';
import { makeObservation } from '../src/codec.ts';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DIST = path.resolve(arg('dist', 'dist'));
const ETIQUETA = arg('etiqueta', 'actual');
const PORT = Number(process.env.PORT_E2E ?? 8097), BASE = `http://localhost:${PORT}/`;
const OUT = path.resolve('results');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-perf-'));
const PIN = 'perf-' + Math.random().toString(36).slice(2, 8);
// WiFi de evento cargada: 6 Mbps de bajada, 60 ms de latencia.
const RED = { offline: false, latency: 60, downloadThroughput: (6 * 1e6) / 8, uploadThroughput: (2 * 1e6) / 8 };
fs.mkdirSync(OUT, { recursive: true });

/** Ubicación real del equipo (Windows Location Service), redondeada a ~100 m. */
function ubicacionReal() {
  const fija = arg('ubicacion');
  if (fija) { const [lat, lon] = fija.split(',').map(Number); return { lat, lon, acc: null, fuente: 'argumento' }; }
  if (process.platform !== 'win32') return null;
  const ps = `Add-Type -AssemblyName System.Device; $w = New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::High); [void]$w.TryStart($false, [TimeSpan]::FromSeconds(15)); for($i=0;$i -lt 30 -and $w.Position.Location.IsUnknown;$i++){ Start-Sleep -Milliseconds 500 }; $l=$w.Position.Location; "$($l.Latitude);$($l.Longitude);$($l.HorizontalAccuracy)"; $w.Stop()`;
  try {
    const [lat, lon, acc] = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(';').map((x) => Number(x.replace(',', '.')));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat: +lat.toFixed(3), lon: +lon.toFixed(3), acc: Math.round(acc), fuente: 'Windows Location Service (redondeada a 3 decimales)' };
  } catch { return null; }
}

/** Memoria privada (MB) de los procesos del navegador según Windows. */
function memoriaPids(pids) {
  if (process.platform !== 'win32' || !pids.length) return null;
  const ps = `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id);$($_.PrivateMemorySize64);$($_.WorkingSet64)" }`;
  const filas = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean).map((l) => l.split(';').map(Number));
  const mb = (b) => Math.round(b / 1048576);
  return { privadaMB: mb(filas.reduce((s, f) => s + f[1], 0)), wsMB: mb(filas.reduce((s, f) => s + f[2], 0)), procesos: filas.length };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = iniciar({ puerto: PORT, host: '127.0.0.1', datos: DATOS, pin: PIN, dist: DIST, silencioso: true });
await srv.listo;
const ubic = ubicacionReal() ?? { lat: -12.098, lon: -77.035, acc: null, fuente: 'San Isidro (respaldo: sin ubicación del equipo)' };
const res = { fecha: new Date().toISOString(), etiqueta: ETIQUETA, dist: path.basename(DIST), red: '6 Mbps / 60 ms (CDP)', ubicacion: ubic, fases: {} };

const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADLESS !== '0', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const bcdp = await browser.newBrowserCDPSession();
const memoria = async () => {
  const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo');
  return memoriaPids(processInfo.map((p) => p.id));
};
try {
  for (const pasada of ['fria', 'tibia']) {
    // «fria»: primer ingreso del día (sin copia guardada). «tibia»: segundo ingreso (mapa base ya en Cache Storage).
    const ctx = pasada === 'fria' || !res._ctx ? await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'es-PE', timezoneId: 'America/Lima', serviceWorkers: 'block' }) : res._ctx;
    res._ctx = ctx;
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', RED);
    const errores = [];
    let rangos = 0, bytesRango = 0, completos = 0;
    page.on('pageerror', (e) => errores.push(String(e.message).slice(0, 200)));
    page.on('requestfinished', async (r) => {
      if (!new URL(r.url()).pathname.endsWith('.pmtiles')) return;
      const h = await r.allHeaders(), s = await r.sizes().catch(() => ({ responseBodySize: 0 }));
      if (h.range) { rangos++; bytesRango += s.responseBodySize; } else completos++;
    });
    const f = {};
    const t0 = Date.now();
    await page.goto(BASE + 'municipalidad?region=lima');
    // Con la sesión guardada en el equipo el 2.º ingreso ya no pide acceso: entonces se mide desde que se abre la página.
    const pide = await Promise.race([
      page.waitForSelector('.ycm-acc-pin', { timeout: 30000 }).then(() => true),
      page.waitForFunction(() => document.body.dataset.v3d === 'listo', null, { timeout: 30000 }).then(() => false),
    ]);
    if (pide) await accederConPin(page, { nombre: 'Operador SIMULADO', pin: PIN });
    const tLogin = pide ? Date.now() : t0;
    f.pidioAcceso = pide;
    await page.waitForFunction(() => document.body.dataset.v3d === 'listo', null, { timeout: 60000 });
    f.msEscenaLista = Date.now() - tLogin;
    await page.waitForFunction(() => window.__yakuMonitoreo?.escena.map.isSourceLoaded('protomaps'), null, { timeout: 60000, polling: 100 }).catch(() => null);
    f.msPrimerasTeselas = Date.now() - tLogin;
    // Mapa completo: vuelo de entrada terminado y sin teselas pendientes 1 s seguido.
    const tCompleto = await page.evaluate(() => new Promise((ok) => {
      const map = window.__yakuMonitoreo.escena.map, t = performance.now();
      let quieto = 0;
      const iv = setInterval(() => {
        const listo = !map.isMoving() && map.areTilesLoaded() && map.loaded();
        quieto = listo ? quieto || performance.now() : 0;
        if ((quieto && performance.now() - quieto > 1000) || performance.now() - t > 90000) { clearInterval(iv); ok(Math.round((quieto || performance.now()) - t)); }
      }, 100);
    }));
    f.msMapaCompleto = f.msEscenaLista + tCompleto;
    f.rangosHastaCompleto = rangos; f.mbRangoHastaCompleto = +(bytesRango / 1e6).toFixed(2);
    const vista = () => page.evaluate(() => {
      const map = window.__yakuMonitoreo.escena.map, c = map.getCenter();
      return { canvasWebGL: document.querySelectorAll('canvas.maplibregl-canvas').length, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
        z: +map.getZoom().toFixed(2), centro: [+c.lng.toFixed(4), +c.lat.toFixed(4)], pitch: Math.round(map.getPitch()),
        edificios: map.getLayer('v3d-edificios') ? map.queryRenderedFeatures({ layers: ['v3d-edificios'] }).length : 0 };
    });
    f.alCompletar = { ...(await vista()), memoria: await memoria() };
    await page.screenshot({ path: path.join(OUT, `perf-mapa-${ETIQUETA}-${pasada}-1.jpg`), type: 'jpeg', quality: 70 });
    if (pasada === 'fria') {
      // Reporte en la ubicación real (lo que haría el 2.º celular): ¿aparece y vuela allí?
      const obs = makeObservation({ type: 'agua', severity: 2, lat: ubic.lat, lon: ubic.lon, note: 'SIMULADO perf: acumulación de agua en la sala', ts: Math.floor(Date.now() / 1000) - 5, deviceId: 'perf0001' });
      const tR = Date.now();
      await fetch(`http://127.0.0.1:${PORT}/api/sync`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ records: [obs] }) });
      await page.waitForFunction(() => window.__yakuMonitoreo.estado().incidentes.length > 0, null, { timeout: 20000 });
      f.msReporteVisible = Date.now() - tR;
      await espera(9000); // acercamiento + inicio de órbita
      const v = await vista();
      const enPunto = await page.evaluate(({ lat, lon }) => {
        const map = window.__yakuMonitoreo.escena.map, p = map.project([lon, lat]), cv = map.getCanvas();
        const dentro = p.x >= 0 && p.y >= 0 && p.x <= cv.clientWidth && p.y <= cv.clientHeight;
        return { dentro, punto: map.queryRenderedFeatures({ layers: ['citizen-dot'] }).length, tarjeta: !document.querySelector('[data-tarjeta]').hidden };
      }, ubic);
      f.trasReporte = { ...v, ...enPunto, memoria: await memoria() };
      await page.screenshot({ path: path.join(OUT, `perf-mapa-${ETIQUETA}-reporte.jpg`), type: 'jpeg', quality: 70 });
      await espera(30000);
      f.tras30sOrbita = { ...(await vista()), memoria: await memoria(), fase: await page.evaluate(() => window.__yakuMonitoreo.estado().fase) };
    } else await espera(1500);
    f.erroresPagina = errores;
    f.mapaBaseCompleto = completos;
    res.fases[pasada] = f;
    console.log(pasada, JSON.stringify(f));
    await page.close();
  }
} finally {
  delete res._ctx;
  await browser.close();
  await srv.cerrar?.();
  fs.rmSync(DATOS, { recursive: true, force: true });
  fs.writeFileSync(path.join(OUT, `perf-mapa-${ETIQUETA}.json`), JSON.stringify(res, null, 2));
  console.log(`\nresults/perf-mapa-${ETIQUETA}.json`);
}
