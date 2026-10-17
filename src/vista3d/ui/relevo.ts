// Relevo animado: arcos que viajan de teléfono a teléfono cuando una ficha pasa por QR y del último
// teléfono al servidor cuando vuelve la red. Dos orígenes:
//  · real: fichas nuevas en IndexedDB de este equipo (recibidas por QR/enlace/imagen, creadas aquí, consolidadas);
//  · demo SIMULADO: los saltos de fichasSimuladas() al pasar el cabezal (etiquetado SIMULADO en el arco).
import type { EscenaYaku } from './contrato';
import type { Tienda } from './tienda';
import type { Ficha } from './datos';
import { bezier, control, posicionesTelefonos, tramosEntre, type Ancla, type LonLat, type Tramo, type XY } from './arcos';
import { IC } from './iconos';

const H = 3600_000, DUR = 1700, FADE = 700, MAX_ARCOS = 14;
const COLOR: Record<Tramo['tipo'], string> = { qr: '#c77700', sync: '#2f6b3a', local: '#c4501b' };
const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function montarRelevo(escenaEl: HTMLElement, escena: EscenaYaku, tienda: Tienda, aviso: (msg: string) => void) {
  const cv = document.createElement('canvas');
  cv.className = 'v3d-arcos';
  cv.setAttribute('aria-hidden', 'true');
  const anclas = document.createElement('div');
  anclas.className = 'v3d-anclas';
  anclas.hidden = true;
  anclas.innerHTML = `<span class="v3d-ancla" data-a="servidor">${IC.servidor}Servidor (al volver la red)</span><span class="v3d-ancla" data-a="telefono">${IC.telefono}Este teléfono</span>`;
  escenaEl.append(cv, anclas);
  const ctx = cv.getContext('2d')!;
  let dpr = 1;
  const medir = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(escenaEl.clientWidth * dpr); cv.height = Math.round(escenaEl.clientHeight * dpr);
    cv.style.width = `${escenaEl.clientWidth}px`; cv.style.height = `${escenaEl.clientHeight}px`;
  };
  new ResizeObserver(medir).observe(escenaEl);
  medir();

  const anclaEl = (k: 'telefono' | 'servidor') => anclas.querySelector<HTMLElement>(`[data-a="${k}"]`)!;
  function xy(a: Ancla): XY | null {
    if ('pantalla' in a) {
      const r = anclaEl(a.pantalla).getBoundingClientRect(), b = escenaEl.getBoundingClientRect();
      return { x: r.left - b.left + 12, y: r.top - b.top + r.height / 2 };
    }
    return escena.proyectar(a.lon, a.lat);
  }

  const activos: { tr: Tramo; t0: number; llegado: boolean }[] = [];
  let raf = 0;
  function lanzar(trs: Tramo[]) {
    if (!trs.length) return;
    anclas.hidden = false;
    const ahora = performance.now();
    trs.forEach((tr, i) => activos.push({ tr, t0: ahora + i * 160, llegado: false }));
    activos.splice(0, Math.max(0, activos.length - MAX_ARCOS));
    if (reducido()) { activos.forEach((a) => (a.t0 = ahora - DUR)); }
    raf ||= requestAnimationFrame(dibujar);
  }

  function etiqueta(p: XY, txt: string, color: string, sim: boolean) {
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.lineWidth = 3.5; ctx.strokeStyle = '#fffdf9'; ctx.fillStyle = '#2b2620';
    ctx.strokeText(txt, p.x + 10, p.y - 8); ctx.fillText(txt, p.x + 10, p.y - 8);
    if (sim) { ctx.font = '800 9px ui-monospace, monospace'; ctx.fillStyle = '#a3400f'; ctx.strokeText('SIMULADO', p.x + 10, p.y + 4); ctx.fillText('SIMULADO', p.x + 10, p.y + 4); }
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fffdf9'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.stroke();
  }

  function dibujar(now: number) {
    raf = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let i = activos.length - 1; i >= 0; i--) {
      const a = activos[i];
      const u = (now - a.t0) / DUR;
      if (u < 0) continue;
      if (u > 1 + FADE / DUR) { activos.splice(i, 1); continue; }
      const p0 = xy(a.tr.de), p1 = xy(a.tr.a);
      if (!p0 || !p1) continue;
      const c = control(p0, p1), col = COLOR[a.tr.tipo];
      const alfa = u <= 1 ? 1 : Math.max(0, 1 - (u - 1) / (FADE / DUR));
      const k = Math.min(1, u);
      ctx.globalAlpha = alfa;
      // trazo completo tenue (discontinuo: el contenido viaja NO VERIFICADO) y tramo recorrido sólido
      ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = col + '88';
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(c.x, c.y, p1.x, p1.y); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 3; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
      for (let s = 1; s <= 24; s++) { const q = bezier(p0, c, p1, (s / 24) * k); ctx.lineTo(q.x, q.y); }
      ctx.stroke();
      const cab = bezier(p0, c, p1, k);
      const g = ctx.createRadialGradient(cab.x, cab.y, 0, cab.x, cab.y, 14);
      g.addColorStop(0, col); g.addColorStop(1, col + '00');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cab.x, cab.y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fffdf9'; ctx.beginPath(); ctx.arc(cab.x, cab.y, 3.2, 0, Math.PI * 2); ctx.fill();
      if (!('pantalla' in a.tr.de)) etiqueta(p0, a.tr.etDe, col, a.tr.simulado);
      if (!('pantalla' in a.tr.a)) etiqueta(p1, a.tr.etA, col, a.tr.simulado);
      ctx.globalAlpha = 1;
      if (u >= 1 && !a.llegado) {
        a.llegado = true;
        if ('pantalla' in a.tr.a) { const el = anclaEl(a.tr.a.pantalla); el.classList.add('pulso'); setTimeout(() => el.classList.remove('pulso'), 650); }
      }
    }
    if (activos.length) raf = requestAnimationFrame(dibujar);
    else { ctx.clearRect(0, 0, cv.width, cv.height); anclas.hidden = tienda.pestana !== 'relevo'; }
  }
  // La cámara se mueve (órbita, vuelo): reproyectar mientras haya arcos.
  escena.map.on('move', () => { if (activos.length) raf ||= requestAnimationFrame(dibujar); });

  // ---------- demo SIMULADO: saltos al pasar el cabezal hacia adelante ----------
  const posCache = new Map<string, LonLat[]>();
  const pos = (f: Ficha) => { let p = posCache.get(f.id); if (!p) posCache.set(f.id, (p = posicionesTelefonos(f, tienda.centros))); return p; };
  let tPrev = tienda.t, ultimoAviso = 0;
  tienda.on('t', (t) => {
    const t0 = tPrev; tPrev = t;
    if (!tienda.demo || !(t > t0) || t - t0 > 12 * H) return;
    const trs = tramosEntre(tienda.simuladas, t0, t, pos);
    lanzar(trs);
    if (trs.length && performance.now() - ultimoAviso > 4000) {
      ultimoAviso = performance.now();
      const q = trs.find((x) => x.tipo === 'qr');
      aviso(q ? `SIMULADO · ficha pasó por QR de ${q.etDe} a ${q.etA} (NO VERIFICADO)` : 'SIMULADO · ficha consolidada en el servidor al volver la red');
    }
  });
  tienda.on('demo', () => posCache.clear());
  tienda.on('pestana', (p) => { anclas.hidden = p !== 'relevo' && !activos.length; });

  // ---------- flujo real: lo llama la vigilancia de IndexedDB ----------
  function real(nuevas: Ficha[], consolidadas: Ficha[]) {
    const trs: Tramo[] = [];
    for (const f of nuevas) {
      const recibida = f.source !== 'local';
      trs.push({ id: `${f.id}#rx`, de: { lon: f.lon, lat: f.lat }, a: { pantalla: 'telefono' }, etDe: recibida ? 'Ficha recibida por QR' : 'Ficha creada aquí', etA: 'Este teléfono', tipo: recibida ? 'qr' : 'local', simulado: false });
    }
    for (const f of consolidadas) trs.push({ id: `${f.id}#sync`, de: { pantalla: 'telefono' }, a: { pantalla: 'servidor' }, etDe: 'Este teléfono', etA: 'Servidor', tipo: 'sync', simulado: false });
    lanzar(trs);
    if (nuevas.length) aviso(`${nuevas.length} ficha(s) ${nuevas.some((f) => f.source !== 'local') ? 'recibida(s) por relevo' : 'registrada(s) en este equipo'} · NO VERIFICADO`);
    else if (consolidadas.length) aviso(`${consolidadas.length} ficha(s) consolidada(s) en el servidor · siguen NO VERIFICADO`);
  }

  return { lanzar, real };
}
