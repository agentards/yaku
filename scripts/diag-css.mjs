// Diagnóstico: ¿se carga y aplica el CSS? Uso: node scripts/diag-css.mjs <url> <tag>
import { chromium } from 'playwright';
const [url, tag = 'antes'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true });
const out = { url, css: [] };
for (const [name, vp] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: name === 'mobile' ? 2 : 1 });
  const p = await ctx.newPage();
  p.on('response', (r) => { if (r.url().includes('.css') || r.request().resourceType() === 'stylesheet') out.css.push({ vp: name, url: r.url(), status: r.status(), type: r.headers()['content-type'], fromSW: r.fromServiceWorker() }); });
  await p.goto(url, { waitUntil: 'networkidle' });
  if (name === 'desktop') {
    out.links = await p.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet],style')].map((l) => l.href || 'inline <style> ' + l.textContent.length + ' chars'));
    out.sheets = await p.evaluate(() => [...document.styleSheets].map((s) => ({ href: s.href, rules: (() => { try { return s.cssRules.length; } catch { return 'cors'; } })() })));
    out.computed = await p.evaluate(() => {
      const cs = (sel, props) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); return Object.fromEntries(props.map((k) => [k, c[k]])); };
      return { body: cs('body', ['fontFamily', 'backgroundColor', 'margin']), header: cs('header', ['backgroundColor', 'color', 'display']), section: cs('section', ['backgroundColor', 'borderRadius', 'boxShadow']) };
    });
  }
  await p.screenshot({ path: `results/screens/${tag}-${name}.png`, fullPage: true });
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(out, null, 2));
