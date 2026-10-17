// Tres gráficos pequeños sincronizados con el cabezal (SVG sin librerías):
// 1) centros poblados sin ficha de evaluación · 2) fichas por estado · 3) cobertura OSIPTEL por nivel.
import type { Tienda } from './tienda';
import { centrosConFicha, coberturaPorNivel, serieSinFicha, seriesEstado, type Punto } from './datos';
import { num } from './formato';

/** Valor de una serie en escalones en el instante t (último punto con ti ≤ t). */
export function valorEn(pts: Punto[], t: number) {
  let v = pts[0]?.[1] ?? 0;
  for (const [ti, vi] of pts) { if (ti <= t) v = vi; else break; }
  return v;
}
/** Trayectoria en escalones en un viewBox 0..100 (y hacia arriba = mayor valor). */
export function caminoEscalon(pts: Punto[], a: number, b: number, y0: number, y1: number, area = false) {
  if (!pts.length || b <= a) return '';
  const X = (t: number) => +(((t - a) / (b - a)) * 100).toFixed(3);
  const Y = (v: number) => +(100 - ((v - y0) / (y1 - y0 || 1)) * 100).toFixed(3);
  let d = `M${X(pts[0][0])},${Y(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `H${X(pts[i][0])}V${Y(pts[i][1])}`;
  d += `H${X(b)}`;
  return area ? `${d}V100H${X(pts[0][0])}Z` : d;
}

export function montarGraficos(cont: HTMLElement, tienda: Tienda) {
  cont.innerHTML = `
    <figure class="v3d-graf" data-g="1">
      <figcaption>Centros poblados sin ficha de evaluación <span data-v></span></figcaption>
      <div class="area">
        <span class="eje arriba" data-y1></span><span class="eje abajo" data-y0></span>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><clipPath id="v3d-clip-1"><rect x="0" y="-5" width="0" height="110" data-clip /></clipPath></defs>
          <path data-a fill="#c4501b" fill-opacity=".08" />
          <path data-a2 fill="#c4501b" fill-opacity=".22" clip-path="url(#v3d-clip-1)" />
          <path data-l fill="none" stroke="#a3400f" stroke-width="1.6" vector-effect="non-scaling-stroke" />
        </svg>
        <span class="cursor" data-cur></span><span class="punto" data-p></span>
      </div>
    </figure>
    <figure class="v3d-graf" data-g="2">
      <figcaption>Fichas por estado <span><span class="badge-nv">NO VERIFICADO</span></span></figcaption>
      <div class="area">
        <span class="eje arriba" data-y1></span><span class="eje abajo">0</span>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path data-r fill="none" stroke="#c77700" stroke-width="1.8" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
          <path data-c fill="none" stroke="#2f6b3a" stroke-width="1.8" vector-effect="non-scaling-stroke" />
        </svg>
        <span class="cursor" data-cur></span><span class="punto" data-pr></span><span class="punto ok" data-pc></span>
      </div>
      <div class="ley"><span><i style="border-top-style:dashed;border-color:#c77700"></i>En relevo <b data-vr>0</b></span><span><i style="border-color:#2f6b3a"></i>Consolidadas <b data-vc>0</b></span></div>
    </figure>
    <figure class="v3d-graf" data-g="3">
      <figcaption>Cobertura OSIPTEL por nivel de exposición <span data-v3></span></figcaption>
      <div class="barras" data-barras></div>
      <div class="ley"><span><i class="seg-ficha" style="border:0;height:8px"></i>Sin cob. y con ficha</span><span><i class="seg-sincob" style="border:0;height:8px"></i>Sin cob. garantizada</span><span><i class="seg-concob" style="border:0;height:8px"></i>Con cobertura</span><span><i class="seg-sindato" style="border:0;height:8px"></i>Sin dato</span></div>
    </figure>`;
  const g = (n: number) => cont.querySelector<HTMLElement>(`[data-g="${n}"]`)!;
  const q = <T extends Element = HTMLElement>(n: number, s: string) => g(n).querySelector<T>(s)!;

  let s1: Punto[] = [], y1lo = 0, y1hi = 1;
  let sR: Punto[] = [], sC: Punto[] = [], y2hi = 1;
  let ultimoConFicha = -1;
  const pct = (t: number) => { const [a, b] = tienda.rango; return b > a ? ((t - a) / (b - a)) * 100 : 0; };
  const yPct = (v: number, lo: number, hi: number) => 100 - ((v - lo) / (hi - lo || 1)) * 100;

  function series() {
    const [a, b] = tienda.rango;
    const fs = tienda.fichas();
    const ubicados = tienda.centros.length;
    s1 = serieSinFicha(fs, tienda.asoc, ubicados, a, b);
    const minV = Math.min(...s1.map((p) => p[1]));
    y1hi = ubicados; y1lo = Math.max(0, Math.min(minV - 2, ubicados - 6));
    q(1, '[data-y1]').textContent = num(y1hi); q(1, '[data-y0]').textContent = num(y1lo);
    q(1, '[data-l]').setAttribute('d', caminoEscalon(s1, a, b, y1lo, y1hi));
    q(1, '[data-a]').setAttribute('d', caminoEscalon(s1, a, b, y1lo, y1hi, true));
    q(1, '[data-a2]').setAttribute('d', caminoEscalon(s1, a, b, y1lo, y1hi, true));
    const se = seriesEstado(fs, a, b);
    sR = se.relevo; sC = se.consolidado;
    y2hi = Math.max(1, fs.length);
    q(2, '[data-y1]').textContent = num(y2hi);
    q(2, '[data-r]').setAttribute('d', caminoEscalon(sR, a, b, 0, y2hi));
    q(2, '[data-c]').setAttribute('d', caminoEscalon(sC, a, b, 0, y2hi));
    ultimoConFicha = -1;
    cursor();
  }

  function barras() {
    const con = centrosConFicha(tienda.fichas(), tienda.asoc, tienda.t);
    if (con.size === ultimoConFicha) return;
    ultimoConFicha = con.size;
    const cob = coberturaPorNivel(tienda.centros, con).reverse();
    // Cada barra es el 100 % de su nivel (los niveles van de 3 a 723 centros: con escala común «Muy alto» no se vería).
    q(3, '[data-barras]').innerHTML = cob.map((c) => {
      const tot = Math.max(1, c.sinCob + c.conCob + c.sinDato);
      const w = (n: number) => `${((n / tot) * 100).toFixed(2)}%`;
      return `<div class="fila" title="${c.niv}: ${c.sinCob} sin cobertura garantizada (${c.sinCobConFicha} con ficha), ${c.conCob} con cobertura, ${c.sinDato} sin dato OSIPTEL">
      <span>${c.niv}</span>
      <span class="bar"><i class="seg-ficha" style="width:${w(c.sinCobConFicha)}"></i><i class="seg-sincob" style="width:${w(c.sinCob - c.sinCobConFicha)}"></i><i class="seg-concob" style="width:${w(c.conCob)}"></i><i class="seg-sindato" style="width:${w(c.sinDato)}"></i></span>
      <span class="num">${num(c.sinCob)} de ${num(c.sinCob + c.conCob)}</span></div>`;
    }).join('');
    const sin = cob.reduce((s, c) => s + c.sinCob, 0), conDato = cob.reduce((s, c) => s + c.sinCob + c.conCob, 0);
    const conF = cob.reduce((s, c) => s + c.sinCobConFicha, 0);
    q(3, '[data-v3]').textContent = `${num(sin)} de ${num(conDato)}${conF ? ` · ${num(conF)} con ficha` : ''}`;
    g(3).setAttribute('aria-label', `Cobertura OSIPTEL por nivel: ${sin} de ${conDato} centros poblados con dato están sin cobertura garantizada; ${conF} de ellos con ficha hasta el cabezal.`);
  }

  function cursor() {
    const t = tienda.t, x = `${pct(t)}%`;
    const v1 = valorEn(s1, t);
    q(1, '[data-v]').textContent = `${num(v1)} de ${num(tienda.centros.length)}`;
    q(1, '[data-clip]').setAttribute('width', String(pct(t)));
    for (const n of [1, 2]) q(n, '[data-cur]').style.left = x;
    Object.assign(q(1, '[data-p]').style, { left: x, top: `${yPct(v1, y1lo, y1hi)}%` });
    const vr = valorEn(sR, t), vc = valorEn(sC, t);
    Object.assign(q(2, '[data-pr]').style, { left: x, top: `${yPct(vr, 0, y2hi)}%` });
    Object.assign(q(2, '[data-pc]').style, { left: x, top: `${yPct(vc, 0, y2hi)}%` });
    q(2, '[data-vr]').textContent = num(vr); q(2, '[data-vc]').textContent = num(vc);
    g(1).setAttribute('aria-label', `Centros poblados sin ficha de evaluación: ${v1} de ${tienda.centros.length} ubicados en el cabezal.`);
    g(2).setAttribute('aria-label', `Fichas NO VERIFICADO en el cabezal: ${vr} en relevo y ${vc} consolidadas.`);
    barras();
  }

  tienda.on('fichas', series);
  tienda.on('t', cursor);
  series();
}
