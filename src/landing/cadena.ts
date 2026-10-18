// El momento central: el reporte viaja por la cadena con el scroll. t va de 0 a 5, un tramo por paso:
//  1 el reporte nace en la vecina A · 2 pasa a B por QR · 3 pasa a C, que encuentra señal ·
//  4 sube a la municipalidad (se agrupa) · 5 la respuesta vuelve por el mismo camino (en barro).
// Solo corre con movimiento permitido; sin él, el CSS deja la figura en su estado final completo.
import type { gsap as Gsap } from 'gsap';

const NODOS: [number, number][] = [[70, 270], [205, 150], [345, 280], [560, 120]];
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Largo del camino en el punto más cercano a (x, y). */
function largoEn(path: SVGPathElement, total: number, x: number, y: number) {
  let mejor = 0, dmin = Infinity;
  for (let i = 0; i <= 400; i++) {
    const l = (total * i) / 400, p = path.getPointAtLength(l), d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < dmin) { dmin = d; mejor = l; }
  }
  return mejor;
}

export function iniciarCadena(gsap: typeof Gsap) {
  const fig = document.querySelector<HTMLElement>('.cadena-figura');
  const ida = fig?.querySelector<SVGPathElement>('.camino-ida');
  const vuelta = fig?.querySelector<SVGPathElement>('.camino-vuelta');
  if (!fig || !ida || !vuelta) return;
  const q = <T extends Element>(s: string) => fig.querySelector<T>(s)!;
  const pulsoIda = [q<SVGCircleElement>('.pulso-ida'), q<SVGCircleElement>('.pulso-ida-n')];
  const pulsoVuelta = [q<SVGCircleElement>('.pulso-vuelta'), q<SVGCircleElement>('.pulso-vuelta-n')];
  const pasos = [...document.querySelectorAll<HTMLElement>('.paso')];

  const L = ida.getTotalLength();
  const ln = NODOS.map(([x, y]) => largoEn(ida, L, x, y));
  ln[0] = 0; ln[3] = L;
  for (const p of [ida, vuelta]) p.style.strokeDasharray = `${L} ${L}`;

  const mover = (cs: SVGCircleElement[], l: number, opacidad: number) => {
    const p = ida.getPointAtLength(clamp(l, 0, L));
    for (const c of cs) { c.setAttribute('cx', p.x.toFixed(1)); c.setAttribute('cy', p.y.toFixed(1)); c.style.opacity = String(opacidad); }
  };

  const estado = { t: 0 };
  const pintar = () => {
    const t = estado.t;
    const tramo = clamp(Math.floor(t), 0, 4);
    const k = gsap.parseEase('power2.inOut')(clamp(t - tramo));
    // Ida: el tramo 0 deja el pulso en la vecina A; los tramos 1-3 lo llevan de nodo en nodo.
    const sIda = t < 1 ? 0 : t >= 4 ? L : lerp(ln[tramo - 1], ln[tramo], k);
    ida.style.strokeDashoffset = String(L - sIda);
    mover(pulsoIda, sIda, t >= 4 ? clamp(1 - (t - 4) * 4) : clamp(t * 3));
    // Vuelta: en el tramo 4 la respuesta baja de la municipalidad a la vecina A.
    const sV = t < 4 ? 0 : L * gsap.parseEase('power1.inOut')(clamp(t - 4));
    vuelta.style.strokeDashoffset = String(sV - L);
    mover(pulsoVuelta, L - sV, t < 4 ? 0 : clamp((t - 4) * 5) * (t > 4.97 ? 0.6 : 1));
    const paso = String(clamp(Math.floor(t) + 1, 1, 5));
    if (fig.dataset.paso !== paso) fig.dataset.paso = paso;
  };
  pintar();

  gsap.to(estado, {
    t: 5,
    ease: 'none',
    onUpdate: pintar,
    scrollTrigger: { trigger: '.cadena-pasos', start: 'top 62%', end: 'bottom 62%', scrub: 0.6 },
  });
  pasos.forEach((el) => {
    gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 62%', end: 'bottom 62%', toggleClass: 'activo' } });
  });
  pasos[0]?.classList.add('activo');
}
