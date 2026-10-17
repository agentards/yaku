// Mide el guardado sin red del mapa base y en qué zoom aparecen calles en Piura y Sullana.
//   BASE_URL=https://… KEY=z11 node scripts/basemap-measure.mjs   (KEY=z12 añade ?basemap=z12)
// Perfiles CDP: sin límite, «4G» (9 Mbps / 1,5 Mbps / 60 ms) y «Fast 3G» de DevTools (1,6 Mbps / 750 kbps / 562,5 ms).
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const KEY = process.env.KEY || 'z11';
const URL_ = BASE + (KEY === 'z11' ? '' : `?basemap=${KEY}`);
const PROFILES = { sinLimite: null, '4G': { latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 }, 'Fast 3G': { latency: 562.5, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 } };
const only = process.env.PROFILES ? process.env.PROFILES.split(',') : Object.keys(PROFILES);
const PLACES = { Piura: [-80.6328, -5.1945], Sullana: [-80.6853, -4.9039] };
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true });
const out = { date: new Date().toISOString(), base: URL_, key: KEY, runs: [], streets: null };
for (const name of only) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  if (PROFILES[name]) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...PROFILES[name] });
  const t0 = Date.now();
  await p.goto(URL_);
  await p.waitForFunction(() => window.__yaku?.basemap().state === 'saved', null, { timeout: 600000, polling: 200 });
  const wall = Date.now() - t0;
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 600000 });
  const swMs = Date.now() - t0;
  const info = await p.evaluate(() => window.__yaku.basemap());
  const savedAt = info.log.find((e) => e.state === 'saved').t, dlStart = info.log.find((e) => e.state === 'downloading')?.t;
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await ctx.setOffline(true);
  const t1 = Date.now();
  await p.reload(); await p.waitForSelector('body[data-ready="1"]');
  await p.waitForFunction(() => window.__yaku.getMap()?.loaded() && window.__yaku.getMap().isSourceLoaded('protomaps'), null, { timeout: 30000 });
  const off = await p.evaluate(() => { const m = window.__yaku.getMap(); return { earth: m.queryRenderedFeatures({ layers: ['earth'] }).length, water: m.queryRenderedFeatures({ layers: ['water'] }).length, ...window.__yaku.basemap() }; });
  out.runs.push({ profile: name, bytes: info.total, msNavegacionAGuardado: savedAt, msDescargaYVerificacion: info.ms, msInicioDescarga: dlStart, msWallHastaGuardado: wall, msHastaSWControla: swMs, offlineReloadMs: Date.now() - t1, offlineEarth: off.earth, offlineWater: off.water, offlineRange: off.rangeRequests, offlineBlobReads: off.blobReads });
  console.log(JSON.stringify(out.runs.at(-1)));
  if (name === only[0]) {
    // zoom en que aparecen calles (sin red, desde la copia guardada)
    out.streets = {};
    for (const [city, c] of Object.entries(PLACES)) {
      out.streets[city] = [];
      for (let z = 8; z <= 16; z++) {
        await p.evaluate(([c, z]) => window.__yaku.getMap().jumpTo({ center: c, zoom: z }), [c, z]);
        await p.evaluate(() => new Promise((r) => { const m = window.__yaku.getMap(); if (m.loaded() && m.areTilesLoaded()) setTimeout(r, 150); else m.once('idle', r); }));
        const k = await p.evaluate(() => {
          const m = window.__yaku.getMap();
          const ids = m.getStyle().layers.filter((l) => l.id.startsWith('roads_') && l.type === 'line').map((l) => l.id);
          const fs = m.queryRenderedFeatures({ layers: ids });
          const by = {}; for (const f of fs) by[f.properties.kind] = (by[f.properties.kind] || 0) + 1;
          return by;
        });
        out.streets[city].push({ z, ...k });
        if (z === 13) await p.screenshot({ path: `results/screens/basemap-${KEY}-${city.toLowerCase()}-z13.png` });
      }
      const first = (kind) => out.streets[city].find((r) => r[kind] > 0)?.z ?? null;
      out.streets[city + '_resumen'] = { highway: first('highway'), major_road: first('major_road'), minor_road: first('minor_road'), other: first('other'), path: first('path') };
      console.log(city, JSON.stringify(out.streets[city + '_resumen']));
    }
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync(`results/basemap-measure-${KEY}-${new URL(BASE).hostname.split('.')[0]}.json`, JSON.stringify(out, null, 2));
