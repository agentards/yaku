// Capturas del mapa base: node scripts/screens-basemap.mjs [url]
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:4173/';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true });
const VPS = { desktop: { viewport: { width: 1280, height: 800 } }, movil: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
for (const [name, o] of Object.entries(VPS)) {
  const ctx = await b.newContext({ ...o, locale: 'es-PE', timezoneId: 'America/Lima' });
  const p = await ctx.newPage();
  await p.goto(url); await p.waitForSelector('body[data-ready="1"]');
  await p.waitForFunction(() => window.__yaku.basemap().state === 'saved' && !!navigator.serviceWorker.controller, null, { timeout: 120000 });
  await p.evaluate(() => window.__yaku.mapLoaded()); await p.waitForTimeout(800);
  await p.screenshot({ path: `results/screens/basemap-${name}.png` });
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('body[data-ready="1"]');
  await p.waitForFunction(() => window.__yaku.getMap()?.loaded() && window.__yaku.getMap().isSourceLoaded('protomaps'));
  await p.evaluate(() => window.__yaku.mapLoaded()); await p.waitForTimeout(800);
  await p.screenshot({ path: `results/screens/basemap-${name}-sin-red.png` });
  await p.evaluate(() => window.__yaku.getMap().jumpTo({ center: [-80.6328, -5.1945], zoom: 12 }));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `results/screens/basemap-${name}-sin-red-piura-z12.png` });
  await ctx.close();
}
await b.close(); console.log('ok');
