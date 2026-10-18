// og:image de yaku.lat (1200×630): la figura de la cadena de src/landing/svg.ts en su estado final, la marca y el
// dominio, con los tokens y las fuentes de la landing. Hecha con SVG propio, sin imágenes generadas con IA.
//   node scripts/og-landing.mjs   → public/landing/og-cadena.jpg
// Usa el Chrome instalado (no descarga navegadores) y no levanta servidor: la página va inline con fuentes en data:.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { figuraCadena, marca } from '../src/landing/svg.ts';

const SALIDA = 'public/landing/og-cadena.jpg';
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const css = fs.readFileSync('src/landing/estilos.css', 'utf8').replace(/url\('\/landing\/fuentes\/([^']+)'\)/g, (_, f) =>
  `url(data:font/woff2;base64,${fs.readFileSync(`public/landing/fuentes/${f}`).toString('base64')})`);

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${css}
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  .og { position: relative; width: 1200px; height: 630px; background: radial-gradient(80% 90% at 12% 0%, #10202c 0%, var(--yaku-noche) 62%); }
  .og-marca { position: absolute; left: 72px; top: 64px; display: flex; align-items: center; gap: 16px; font: 500 64px/1 var(--f-display); letter-spacing: -0.03em; }
  .og-marca .marca { width: 60px; height: 60px; }
  .og-dominio { position: absolute; left: 76px; top: 148px; font: 500 22px/1 var(--f-mono); color: var(--yaku-bruma); letter-spacing: .02em; }
  .og-figura { position: absolute; right: 48px; bottom: 58px; width: 860px; }
  .og-figura .cadena-svg { max-height: none; }
  .og-borde { position: absolute; inset: auto 0 0; height: 6px; background: linear-gradient(90deg, var(--yaku-agua) 0 72%, var(--yaku-barro) 72% 100%); }
</style></head><body><div class="og">
  <div class="og-marca">${marca()}<span>Yaku</span></div>
  <div class="og-dominio">yaku.lat</div>
  <div class="og-figura cadena-figura" data-paso="5">${figuraCadena('Cadena de Yaku')}</div>
  <div class="og-borde"></div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: SALIDA, type: 'jpeg', quality: 88 });
} finally {
  await browser.close();
}
console.log(`${SALIDA}: ${(fs.statSync(SALIDA).size / 1024).toFixed(0)} KB`);
