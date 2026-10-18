// E2E de la landing (https://yaku.lat/ → index.html) en escritorio 1440×900 y celular 390×844.
// Comprueba: CTAs a la ruta correcta (Ingresar → /municipalidad, vecino → /reportar, piloto → contacto), sin errores
// de JS, sin peticiones fuera del origen (sin CDN), imágenes con alt, sin enlaces al repositorio ni «alerta»,
// etiquetas «generada con IA», JSON-LD válido, la cadena por scroll y prefers-reduced-motion (sin Lenis, sin scrub,
// sin videos de fondo, todo visible). Mide LCP y CLS. Capturas en docs/evidencia-landing/, medidas en
// results/e2e-landing.json.
//   node scripts/e2e-landing.mjs            → sirve dist/ ya compilado (vite preview :4191)
//   node scripts/e2e-landing.mjs --build    → compila antes (vite build)
// Puerto propio (4191): 4173 y 8787 son de otras pruebas.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 4191), BASE = `http://localhost:${PORT}`;
const OUT = path.resolve('results'), EVID = path.resolve('docs/evidencia-landing');
const CHROME = process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(EVID, { recursive: true });
const res = { fecha: new Date().toISOString(), checks: [], medidas: {} };
const check = (name, ok, detail = {}) => { res.checks.push({ name, ok: !!ok, ...detail }); console.log(`${ok ? '✅' : '❌'} ${name}`, JSON.stringify(detail)); };
const shot = (p, nombre, opts = {}) => p.screenshot({ path: path.join(EVID, nombre), type: 'jpeg', quality: 80, ...opts });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.argv.includes('--build')) {
  const b = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (b.status !== 0) throw new Error('vite build falló');
}
if (!fs.existsSync('dist/index.html') || !fs.readFileSync('dist/index.html', 'utf8').includes('cadena-svg')) throw new Error('dist/ no tiene la landing: corre con --build');

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
await new Promise((ok, ko) => { server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) ok(); }); server.on('exit', (c) => ko(new Error('preview salió ' + c))); });
const stop = () => { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F']) : server.kill('SIGTERM'); } catch {} };

const contactoEsperado = fs.readFileSync('src/landing/contenido.ts', 'utf8').match(/href:\s*'([^']+)'/)[1];
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

const PERFILES = [
  { id: 'escritorio', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { id: 'celular', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];

async function abrir(perfil, extra = {}) {
  const ctx = await browser.newContext({ viewport: perfil.viewport, deviceScaleFactor: perfil.deviceScaleFactor, isMobile: perfil.isMobile, hasTouch: perfil.hasTouch, serviceWorkers: 'block', ...extra });
  const page = await ctx.newPage();
  const errores = [], externas = [], fallidas = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('request', (r) => { const u = new URL(r.url()); if (!/^(localhost|127\.0\.0\.1)$/.test(u.hostname) && !/^(data|blob):/.test(r.url())) externas.push(r.url()); });
  page.on('requestfailed', (r) => { if (!/\.mp4$/.test(new URL(r.url()).pathname)) fallidas.push(r.url()); });
  await page.addInitScript(() => {
    window.__lcp = 0; window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  return { ctx, page, errores, externas, fallidas };
}

async function bajarHasta(page, sel, bloque = 'center') {
  await page.evaluate(([s, b]) => document.querySelector(s)?.scrollIntoView({ block: b, behavior: 'instant' }), [sel, bloque]);
  await esperar(900);
}

try {
  for (const perfil of PERFILES) {
    const P = perfil.id;
    const { ctx, page, errores, externas, fallidas } = await abrir(perfil);
    const t0 = Date.now();
    await page.goto(BASE + '/', { waitUntil: 'load' });
    res.medidas[`${P}.loadMs`] = Date.now() - t0;
    await esperar(1200);
    const lcp = await page.evaluate(() => window.__lcp);
    res.medidas[`${P}.lcpMs`] = Math.round(lcp);
    check(`${P}: LCP < 2500 ms (local)`, lcp > 0 && lcp < 2500, { lcp: Math.round(lcp) });
    await shot(page, `${P}-1-hero.jpg`);

    // Contenido estático y reglas de verdad
    const info = await page.evaluate(() => {
      const enlaces = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '');
      const imgs = [...document.querySelectorAll('img')];
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent);
      return {
        h1: document.querySelector('h1')?.textContent,
        titulo: document.title,
        mov: document.documentElement.classList.contains('mov'),
        repo: enlaces.filter((h) => /github|gitlab|bitbucket/i.test(h)),
        textoRepo: /github|clerk/i.test(document.body.innerText),
        alerta: (document.body.innerText.match(/\balertas?\b/gi) || []).length,
        sinAlt: imgs.filter((i) => !(i.getAttribute('alt') || '').trim()).map((i) => i.src),
        nImgs: imgs.length,
        etiquetasIA: document.querySelectorAll('.etiqueta-ia').length,
        fondos: document.querySelectorAll('.fondo').length,
        ingresar: [...document.querySelectorAll('[data-cta="ingresar"]')].map((a) => a.getAttribute('href')),
        reportar: [...document.querySelectorAll('[data-cta="reportar"]')].map((a) => a.getAttribute('href')),
        piloto: [...document.querySelectorAll('[data-cta="piloto"]')].map((a) => a.getAttribute('href')),
        ld,
        faqVisibles: document.querySelectorAll('.preguntas-lista details').length,
        precios: /S\/\s?\d|US\$|\bprecio/i.test(document.body.innerText),
        anchoDoc: document.documentElement.scrollWidth,
        scrollX: (scrollTo(80, scrollY), scrollX),
        nav: (({ responseStart, responseEnd, domContentLoadedEventEnd }) => ({ responseStart, responseEnd, domContentLoadedEventEnd }))(performance.getEntriesByType('navigation')[0]),
        lentos: performance.getEntriesByType('resource').sort((a, b) => b.responseEnd - a.responseEnd).slice(0, 4).map((r) => `${r.name.split('/').pop()} ${Math.round(r.startTime)}→${Math.round(r.responseEnd)}`),
        desbordan: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5 && !e.closest('.celulares, .pantalla-barra')).slice(0, 6).map((e) => `${e.tagName}.${e.getAttribute('class') || ''} ${Math.round(e.getBoundingClientRect().right)}`),
        videosVoz: [...document.querySelectorAll('.videos video')].map((v) => ({ preload: v.getAttribute('preload'), poster: !!v.getAttribute('poster') })),
      };
    });
    check(`${P}: h1 y título`, /señal/.test(info.h1 || '') && info.titulo.length <= 70, { h1: info.h1, titulo: info.titulo });
    check(`${P}: sin enlaces ni texto de repositorio/Clerk`, !info.repo.length && !info.textoRepo, { repo: info.repo });
    check(`${P}: nunca «alerta» en el texto visible`, info.alerta === 0, { n: info.alerta });
    check(`${P}: todas las imágenes con alt`, info.nImgs > 0 && !info.sinAlt.length, { nImgs: info.nImgs, sinAlt: info.sinAlt });
    check(`${P}: cada fondo IA lleva su etiqueta`, info.etiquetasIA >= info.fondos + 2, { etiquetas: info.etiquetasIA, fondos: info.fondos });
    check(`${P}: Ingresar → /municipalidad`, info.ingresar.length >= 1 && info.ingresar.every((h) => h === '/municipalidad'), { hrefs: info.ingresar });
    check(`${P}: CTA vecino → /reportar`, info.reportar.length >= 2 && info.reportar.every((h) => h === '/reportar'), { n: info.reportar.length });
    check(`${P}: CTA piloto → contacto de contenido.ts`, info.piloto.length >= 3 && info.piloto.every((h) => h === contactoEsperado), { n: info.piloto.length });
    check(`${P}: sin precios`, !info.precios);
    check(`${P}: sin scroll horizontal (scrollTo(80) deja scrollX = 0)`, info.scrollX === 0 && !info.desbordan.length, { scrollX: info.scrollX, anchoDoc: info.anchoDoc, desbordan: info.desbordan });
    res.medidas[`${P}.recursosMasLentos`] = info.lentos; res.medidas[`${P}.navegacion`] = info.nav;
    check(`${P}: videos con voz con póster y preload=none`, info.videosVoz.length === 2 && info.videosVoz.every((v) => v.preload === 'none' && v.poster));
    let ldOk = false, nFaq = 0;
    try { const g = JSON.parse(info.ld[0])['@graph']; const f = g.find((x) => x['@type'] === 'FAQPage'); nFaq = f.mainEntity.length; ldOk = g.some((x) => x['@type'] === 'SoftwareApplication') && !JSON.stringify(g).includes('offers'); } catch {}
    check(`${P}: JSON-LD válido, FAQPage = preguntas visibles, sin offers`, ldOk && nFaq === info.faqVisibles, { nFaq, visibles: info.faqVisibles });
    check(`${P}: movimiento activo (Lenis + GSAP)`, info.mov);

    // La cadena por scroll
    const pasos = {};
    for (const n of [1, 2, 3, 5]) {
      await bajarHasta(page, `.paso[data-paso="${n}"]`, perfil.isMobile ? 'end' : 'center');
      await esperar(500);
      pasos[n] = await page.evaluate(() => ({ paso: document.querySelector('.cadena-figura')?.dataset.paso, activo: document.querySelector('.paso.activo')?.dataset.paso }));
      if (n === 2 || n === 5) await shot(page, `${P}-2-cadena-paso${n}.jpg`);
    }
    check(`${P}: la cadena avanza con el scroll (figura y texto)`, pasos[1].paso === '1' && pasos[3].paso === '3' && pasos[5].paso === '5' && pasos[2].activo === '2', pasos);

    await bajarHasta(page, '#municipalidad', 'start');
    await esperar(400);
    await shot(page, `${P}-3-municipalidad.jpg`);
    await page.click('#tab-m1');
    const tab = await page.evaluate(() => ({ visible: !document.getElementById('panel-m1').hidden, oculto: document.getElementById('panel-m0').hidden }));
    check(`${P}: pestañas de capturas`, tab.visible && tab.oculto);
    await bajarHasta(page, '#regional', 'start'); await shot(page, `${P}-4-regional.jpg`);
    await bajarHasta(page, '#videos', 'start'); await shot(page, `${P}-5-videos.jpg`);
    await bajarHasta(page, '#piloto', 'start'); await shot(page, `${P}-6-cierre.jpg`);
    const videos = await page.evaluate(() => [...document.querySelectorAll('.fondo video')].map((v) => v.currentSrc.split('/').pop()));
    check(`${P}: videos de fondo diferidos y del formato correcto`, videos.length >= 1 && videos.every((v) => v.includes(perfil.isMobile ? '9x16' : '16x9')), { videos });
    const cls = await page.evaluate(() => window.__cls);
    res.medidas[`${P}.cls`] = Number(cls.toFixed(4));
    check(`${P}: CLS < 0.1`, cls < 0.1, { cls: Number(cls.toFixed(4)) });

    const pesos = await page.evaluate(() => performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize || 0));
    res.medidas[`${P}.bytesTrasRecorrer`] = pesos;

    check(`${P}: sin errores de JS`, errores.length === 0, { errores });
    check(`${P}: sin peticiones a CDN ni a otros orígenes`, externas.length === 0, { externas });
    check(`${P}: sin peticiones fallidas`, fallidas.length === 0, { fallidas });

    // CTAs navegan a la ruta correcta
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await Promise.all([page.waitForURL('**/municipalidad'), page.click('.nav [data-cta="ingresar"]')]);
    const muni = await page.evaluate(() => ({ path: location.pathname, landing: !!document.querySelector('.cadena-svg') }));
    check(`${P}: clic en Ingresar abre /municipalidad (la app, no la landing)`, muni.path === '/municipalidad' && !muni.landing, muni);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await Promise.all([page.waitForURL('**/reportar'), page.click('.hero [data-cta="reportar"]')]);
    const rep = await page.evaluate(() => ({ path: location.pathname, landing: !!document.querySelector('.cadena-svg') }));
    check(`${P}: clic en el CTA del vecino abre /reportar`, rep.path === '/reportar' && !rep.landing, rep);
    await ctx.close();

    // prefers-reduced-motion
    const rm = await abrir(perfil, { reducedMotion: 'reduce' });
    await rm.page.goto(BASE + '/', { waitUntil: 'load' });
    await esperar(1000);
    await bajarHasta(rm.page, '#cadena', 'start');
    await bajarHasta(rm.page, '#piloto', 'start');
    const r = await rm.page.evaluate(() => ({
      mov: document.documentElement.classList.contains('mov'),
      lenis: document.documentElement.classList.contains('lenis'),
      videosFondo: document.querySelectorAll('.fondo video').length,
      paso: document.querySelector('.cadena-figura')?.dataset.paso,
      ocultos: [...document.querySelectorAll('.revelar, .paso')].filter((e) => Number(getComputedStyle(e).opacity) < 0.99).length,
      cifra: document.querySelector('[data-contar]')?.textContent,
    }));
    check(`${P}: reduced-motion sin Lenis, sin scrub, sin videos de fondo, todo visible`, !r.mov && !r.lenis && r.videosFondo === 0 && r.paso === '5' && r.ocultos === 0 && r.cifra === '275', r);
    await rm.page.evaluate(() => scrollTo(0, 0));
    await esperar(300);
    if (perfil.isMobile) { await bajarHasta(rm.page, '#cadena', 'start'); await shot(rm.page, `${P}-7-reduced-motion-cadena.jpg`); }
    else await shot(rm.page, `${P}-7-reduced-motion-completa.jpg`, { fullPage: true, quality: 60 });
    check(`${P}: reduced-motion sin errores de JS`, rm.errores.length === 0, { errores: rm.errores });
    await rm.ctx.close();
  }
} finally {
  await browser.close();
  stop();
}

const ok = res.checks.filter((c) => c.ok).length;
res.resumen = `${ok}/${res.checks.length}`;
fs.writeFileSync(path.join(OUT, 'e2e-landing.json'), JSON.stringify(res, null, 2));
console.log(`\nE2E landing: ${res.resumen} · medidas ${JSON.stringify(res.medidas)}`);
process.exit(ok === res.checks.length ? 0 : 1);
