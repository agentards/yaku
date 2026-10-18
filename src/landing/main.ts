// Landing de Yaku: la página ya llega completa en el HTML (plugin.ts). Aquí solo se añade, si conviene:
// scroll suave (Lenis), la cadena por scroll y los revelados (GSAP + ScrollTrigger), videos de fondo diferidos
// y las pestañas de capturas. Con prefers-reduced-motion no hay Lenis, ni scrub, ni videos de fondo, ni conteos.
import './estilos.css';
import 'lenis/dist/lenis.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { iniciarCadena } from './cadena';

document.body.dataset.landing = '1';
const conMovimiento = !matchMedia('(prefers-reduced-motion: reduce)').matches;

iniciarPestanas();
if (conMovimiento) iniciarMovimiento();
iniciarFondos();

function iniciarMovimiento() {
  document.documentElement.classList.add('mov');
  gsap.registerPlugin(ScrollTrigger);

  const lenis = new Lenis({ lerp: 0.12, anchors: { offset: -64 } });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  // Entrada del hero: solo desplazamiento (el titular no parte invisible: no retrasa el LCP).
  gsap.from('.hero-cuerpo > *', { y: 28, duration: 0.9, ease: 'expo.out', stagger: 0.08 });

  ScrollTrigger.batch('.revelar', {
    start: 'top 88%',
    once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out', stagger: 0.08, overwrite: true }),
  });

  document.querySelectorAll<HTMLElement>('[data-contar]').forEach((el) => {
    const fin = Number(el.dataset.contar), o = { v: 0 };
    el.textContent = '0';
    gsap.to(o, {
      v: fin, duration: 1.4, ease: 'expo.out',
      onUpdate: () => { el.textContent = String(Math.round(o.v)); },
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  iniciarCadena(gsap);
  addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}

/** Videos de fondo: después del load, solo cerca de la pantalla, nunca con reduced-motion ni con datos ahorrados. */
function iniciarFondos() {
  const con = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!conMovimiento || con?.saveData || /(^|-)2g$/.test(con?.effectiveType ?? '')) return;
  const vertical = matchMedia('(max-aspect-ratio: 1/1)').matches;
  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        const f = e.target as HTMLElement;
        let v = f.querySelector('video');
        if (e.isIntersecting) {
          if (!v) {
            v = document.createElement('video');
            Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'auto' });
            v.setAttribute('aria-hidden', 'true');
            v.setAttribute('tabindex', '-1');
            v.addEventListener('playing', () => v!.classList.add('listo'), { once: true });
            v.src = `/landing/video/${f.dataset.video}-${vertical ? '9x16' : '16x9'}.mp4`;
            f.querySelector('picture')!.after(v);
          }
          v.play().catch(() => {});
        } else v?.pause();
      }
    },
    { rootMargin: '200px 0px' },
  );
  const arrancar = () => setTimeout(() => document.querySelectorAll('.fondo[data-video]').forEach((f) => io.observe(f)), 400);
  if (document.readyState === 'complete') arrancar();
  else addEventListener('load', arrancar, { once: true });
}

/** Pestañas accesibles de las capturas del Centro de monitoreo (clic y flechas). */
function iniciarPestanas() {
  const barra = document.querySelector<HTMLElement>('.pantalla-barra');
  if (!barra) return;
  const tabs = [...barra.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const elegir = (i: number, foco = false) => {
    tabs.forEach((t, j) => {
      const si = i === j;
      t.setAttribute('aria-selected', String(si));
      t.tabIndex = si ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')!)!.hidden = !si;
    });
    if (foco) tabs[i].focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => elegir(i));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); elegir((i + d + tabs.length) % tabs.length, true); }
      if (e.key === 'Home') { e.preventDefault(); elegir(0, true); }
      if (e.key === 'End') { e.preventDefault(); elegir(tabs.length - 1, true); }
    });
  });
}
