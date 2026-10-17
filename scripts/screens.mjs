// Capturas "después". Uso: node scripts/screens.mjs [url] [prefijo]
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:4173/';
const tag = process.argv[3] || 'despues';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true });
const VPS = { desktop: { viewport: { width: 1280, height: 800 } }, mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, android: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
const shot = (p, name) => p.screenshot({ path: `results/screens/${tag}-${name}.png` });
for (const [name, opts] of Object.entries(VPS)) {
  const ctx = await b.newContext({ ...opts, geolocation: { latitude: -5.1945, longitude: -80.6328, accuracy: 12 }, permissions: ['geolocation'], locale: 'es-PE', timezoneId: 'America/Lima' });
  const p = await ctx.newPage();
  await p.goto(url); await p.waitForSelector('body[data-ready="1"]');
  await p.waitForFunction(() => window.__yaku.getMap()?.loaded(), null, { timeout: 20000 }); await p.evaluate(() => window.__yaku.mapLoaded()); await p.waitForTimeout(800);
  await shot(p, `${name}-mapa`);
  await p.click('[role=tab][data-tab=registrar]');
  await p.waitForFunction(() => /GPS/.test(document.getElementById('loc-status').textContent));
  await p.waitForTimeout(900);
  await shot(p, `${name}-registrar`);
  for (const [t, s, n] of [['agua', 2, 'agua hasta el tobillo frente al mercado'], ['cauce', 3, 'acequia tapada con basura'], ['huaico', 1, '']]) {
    await p.click(`[data-type=${t}]`); await p.click(`#f-sev label:nth-child(${s + 1})`); await p.fill('#f-note', n); await p.click('#save');
    await p.waitForTimeout(250);
  }
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('body[data-ready="1"]');
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForFunction(() => window.__yaku.getMap()?.loaded(), null, { timeout: 20000 }); await p.evaluate(() => window.__yaku.mapLoaded());
  await p.waitForFunction(() => window.__yaku.getMap().queryRenderedFeatures({ layers: ['senamhi-fill'] }).length > 0);
  await p.waitForTimeout(800);
  await shot(p, `${name}-sin-red-mapa`);
  await p.click('[role=tab][data-tab=relevo]');
  await p.click('#emit'); await p.waitForSelector('#qr[data-fragment]');
  await p.locator('#emit-out').scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await shot(p, `${name}-qr-emitido`);
  await p.click('[role=tab][data-tab=sync]'); await p.waitForTimeout(300);
  await shot(p, `${name}-sync-sin-red`);
  await ctx.close();
}
await b.close();
console.log('ok');
