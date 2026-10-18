// Línea de tiempo del Centro de monitoreo con el HISTÓRICO REAL del servidor: marcas por reporte recibido (color por
// tipo) y por cambio de estado; arrastrar el cabezal muestra el mapa y los contadores en ese momento; reproducir repite
// el histórico; «En vivo» vuelve al presente y el cabezal sigue el «ahora». Debajo, tres gráficos sincronizados.
import type { Tienda } from '../ui/tienda';
import { Reloj, fechaHora, hora, marcas, ventanaSenamhi } from '../ui/tiempo';
import { caminoEscalon, valorEn } from '../ui/graficos';
import { centrosConFicha, coberturaPorNivel, type Punto } from '../ui/datos';
import { esc, num } from '../ui/formato';
import { IC } from '../ui/iconos';
import { ESTADO, tipoTxt } from '../municipalidad/textos';
import type { ReporteApi } from '../municipalidad/deteccion';
import { eventosHistorico, GRUPO_TXT, GRUPOS, H, pasoMarcas, seriesPorEstado, seriesReportes, type EventoMon, type Grupo, type IncHist } from './historico';

const DURACIONES = [{ id: '15 s', s: 15 }, { id: '30 s', s: 30 }, { id: '60 s', s: 60 }] as const;
const COLOR_GRUPO: Record<Grupo, string> = { nuevo: '#c77700', revision: '#8a5a00', municipal: '#2f6b3a', cerrado: '#8a7f6c' };
/** Color de la marca por tipo de reporte (agua y terreno en azules/tierra; vida en marrón oscuro). */
export const COLOR_TIPO: Record<string, string> = {
  agua: '#2f6fa3', cauce: '#1f5a87', huaico: '#7a4e2a', via_bloq: '#5b5146', vivienda: '#c4501b', atrapados: '#6b3a00', heridos: '#8f2410', ayuda: '#b8860b', otro: '#8a7f6c',
};

export interface ControlVivo { enVivo: boolean; irEnVivo(): void; soltarVivo(): void }

export function montarLineaMonitoreo(cont: HTMLElement, raiz: HTMLElement, tienda: Tienda, vivo: ControlVivo, abrirCajon: () => void) {
  cont.innerHTML = `
    <div class="v3d-lcab">
      <h2 id="mon-linea-t">Histórico del monitoreo</h2>
      <span class="v3d-play" role="group" aria-label="Reproducción del histórico">
        <button type="button" data-a="play" aria-pressed="false" aria-label="Reproducir el histórico">${IC.play}</button>
        <button type="button" data-a="paso" aria-label="Siguiente evento">${IC.paso}</button>
        <select data-a="dur" aria-label="Duración de la reproducción">${DURACIONES.map((d) => `<option value="${d.s}" ${d.s === 30 ? 'selected' : ''}>${d.id}</option>`).join('')}</select>
      </span>
      <button type="button" class="mon-envivo" data-a="vivo" aria-pressed="true">En vivo</button>
      <button type="button" class="v3d-ver-graf" aria-expanded="false" aria-controls="mon-graficos">Gráficos</button>
      <button type="button" class="v3d-abrir-cajon" aria-controls="v3d-panel">${IC.capas}Panel</button>
      <span class="rango" data-rango></span>
    </div>
    <div class="v3d-pista" tabindex="0" role="slider" aria-labelledby="mon-linea-t" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
      <div class="riel"></div><div class="hecho"></div>
      <div class="banda senamhi" data-b="sen" hidden></div>
      <div data-ev></div><div data-marcas></div>
      <div class="cabezal"><span data-et></span></div>
    </div>
    <p class="mon-linea-vacia" data-vacia hidden>Aún no llegó ningún reporte al servidor: la línea muestra las últimas 24 h.</p>
    <div class="v3d-graficos" id="mon-graficos">
      <figure class="v3d-graf" data-g="estado">
        <figcaption>Incidentes por estado <span data-v></span></figcaption>
        <div class="area"><span class="eje arriba" data-y1></span><span class="eje abajo">0</span>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${GRUPOS.map((g) => `<path data-s="${g}" fill="none" stroke="${COLOR_GRUPO[g]}" stroke-width="1.8"${g === 'nuevo' ? ' stroke-dasharray="4 3"' : ''} vector-effect="non-scaling-stroke" />`).join('')}</svg>
          <span class="cursor" data-cur></span></div>
        <div class="ley">${GRUPOS.map((g) => `<span><i style="border-color:${COLOR_GRUPO[g]}${g === 'nuevo' ? ';border-top-style:dashed' : ''}"></i>${esc(GRUPO_TXT[g])} <b data-n="${g}">0</b></span>`).join('')}</div>
      </figure>
      <figure class="v3d-graf" data-g="reportes">
        <figcaption>Reportes y vecinos <span><span class="badge-nv">POR VALIDAR</span></span></figcaption>
        <div class="area"><span class="eje arriba" data-y1></span><span class="eje abajo">0</span>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path data-s="reportes" fill="none" stroke="#c4501b" stroke-width="1.8" vector-effect="non-scaling-stroke" />
            <path data-s="vecinos" fill="none" stroke="#1f5a87" stroke-width="1.8" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" /></svg>
          <span class="cursor" data-cur></span></div>
        <div class="ley"><span><i style="border-color:#c4501b"></i>Reportes recibidos <b data-n="reportes">0</b></span><span><i style="border-color:#1f5a87;border-top-style:dashed"></i>Vecinos distintos <b data-n="vecinos">0</b></span></div>
      </figure>
      <figure class="v3d-graf" data-g="cob">
        <figcaption>Cobertura OSIPTEL por nivel de exposición <span data-v3></span></figcaption>
        <div class="barras" data-barras></div>
        <div class="ley"><span><i class="seg-ficha" style="border:0;height:8px"></i>Sin cob. y con reporte</span><span><i class="seg-sincob" style="border:0;height:8px"></i>Sin cob. garantizada</span><span><i class="seg-concob" style="border:0;height:8px"></i>Con cobertura</span><span><i class="seg-sindato" style="border:0;height:8px"></i>Sin dato</span></div>
      </figure>
    </div>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => cont.querySelector<T>(s)!;
  const pista = $('.v3d-pista'), cab = $('.cabezal'), hecho = $('.hecho'), et = $('[data-et]');
  const btnPlay = $<HTMLButtonElement>('[data-a=play]'), dur = $<HTMLSelectElement>('[data-a=dur]'), btnVivo = $<HTMLButtonElement>('[data-a=vivo]');
  const g = (k: string) => cont.querySelector<HTMLElement>(`[data-g="${k}"]`)!;

  let reps: ReporteApi[] = [], hs: IncHist[] = [], eventos: EventoMon[] = [];
  let sEst = {} as Record<Grupo, Punto[]>, sRep: { reportes: Punto[]; vecinos: Punto[] } = { reportes: [], vecinos: [] };
  let yEst = 1, yRep = 1, ultimoCob = -1;
  const reloj = new Reloj(...tienda.rango, tienda.t);
  const pct = (t: number) => { const [a, b] = tienda.rango; return b > a ? ((t - a) / (b - a)) * 100 : 0; };

  // ---------- estructura (al cambiar datos o rango) ----------
  function estructura() {
    const [a, b] = tienda.rango;
    reloj.setRango(a, b);
    pista.setAttribute('aria-valuemin', String(a)); pista.setAttribute('aria-valuemax', String(b));
    $('[data-rango]').textContent = `${fechaHora(a)} – ${hora(b)} · hora de Lima`;
    $('[data-vacia]').hidden = reps.length > 0;
    // SENAMHI: solo si su ventana cae dentro del rango del histórico.
    const v = ventanaSenamhi(tienda.ahora()), sen = $('[data-b=sen]');
    sen.hidden = !(v.hasta > a && v.desde < b);
    if (!sen.hidden) { const x0 = Math.max(a, v.desde), x1 = Math.min(b, v.hasta); sen.style.left = `${pct(x0)}%`; sen.style.width = `${Math.max(0, pct(x1) - pct(x0))}%`; sen.title = `Ventana del ${v.etiqueta}`; }
    $('[data-ev]').innerHTML = eventos.filter((e) => e.t >= a && e.t <= b).map((e) => e.tipo === 'reporte'
      ? `<span class="ev mon-ev-rep" style="left:${pct(e.t).toFixed(3)}%;background:${COLOR_TIPO[e.obs ?? 'otro'] ?? COLOR_TIPO.otro}" title="Reporte recibido · ${esc(tipoTxt(e.obs ?? 'otro'))} · ${esc(fechaHora(e.t))}" data-ev-rep></span>`
      : `<span class="ev mon-ev-est mon-ev-${e.estado}" style="left:${pct(e.t).toFixed(3)}%" title="${esc(ESTADO[e.estado!])} · ${esc(fechaHora(e.t))}" data-ev-est></span>`).join('')
      + `<span class="ev ahora" style="left:100%" title="Ahora"></span>`;
    const paso = pasoMarcas(a, b, (pista.clientWidth || 600) < 520 ? 5 : 10);
    $('[data-marcas]').innerHTML = marcas(a, b, paso)
      .map((m) => `<span class="marca${m.diaNuevo ? ' dia' : ''}" style="left:${pct(m.t).toFixed(3)}%">${m.diaNuevo || paso >= 24 ? `<b>${esc(m.dia)}</b>` : '<b>&nbsp;</b>'}${esc(m.hora)}</span>`).join('');
    series();
    cabezal();
  }
  function series() {
    const [a, b] = tienda.rango;
    sEst = seriesPorEstado(hs, a, b);
    yEst = Math.max(1, ...GRUPOS.flatMap((k) => sEst[k].map((p) => p[1])));
    g('estado').querySelector('[data-y1]')!.textContent = num(yEst);
    for (const k of GRUPOS) g('estado').querySelector(`[data-s="${k}"]`)!.setAttribute('d', caminoEscalon(sEst[k], a, b, 0, yEst));
    sRep = seriesReportes(reps, a, b);
    yRep = Math.max(1, sRep.reportes.at(-1)?.[1] ?? 1);
    g('reportes').querySelector('[data-y1]')!.textContent = num(yRep);
    g('reportes').querySelector('[data-s="reportes"]')!.setAttribute('d', caminoEscalon(sRep.reportes, a, b, 0, yRep));
    g('reportes').querySelector('[data-s="vecinos"]')!.setAttribute('d', caminoEscalon(sRep.vecinos, a, b, 0, yRep));
    ultimoCob = -1;
  }
  function cabezal() {
    const t = tienda.t, x = `${pct(t)}%`;
    cab.style.left = x; hecho.style.width = x;
    const f = pct(t); cab.dataset.borde = f > 88 ? 'der' : f < 8 ? 'izq' : '';
    et.textContent = vivo.enVivo ? `En vivo · ${hora(t)}` : fechaHora(t);
    pista.setAttribute('aria-valuenow', String(Math.round(t)));
    pista.setAttribute('aria-valuetext', `${fechaHora(t)}, hora de Lima${vivo.enVivo ? ', en vivo' : ''}`);
    for (const k of ['estado', 'reportes']) g(k).querySelector<HTMLElement>('[data-cur]')!.style.left = x;
    const vs = GRUPOS.map((k) => [k, valorEn(sEst[k] ?? [], t)] as const);
    for (const [k, v] of vs) g('estado').querySelector(`[data-n="${k}"]`)!.textContent = num(v);
    g('estado').querySelector('[data-v]')!.textContent = `${num(vs.reduce((s, [, v]) => s + v, 0))} en total`;
    g('estado').setAttribute('aria-label', `Incidentes por estado en el cabezal: ${vs.map(([k, v]) => `${GRUPO_TXT[k]} ${v}`).join(', ')}.`);
    const nr = valorEn(sRep.reportes, t), nv = valorEn(sRep.vecinos, t);
    g('reportes').querySelector('[data-n="reportes"]')!.textContent = num(nr);
    g('reportes').querySelector('[data-n="vecinos"]')!.textContent = num(nv);
    g('reportes').setAttribute('aria-label', `En el cabezal: ${nr} reportes recibidos de ${nv} vecinos distintos, por validar.`);
    barras();
    btnVivo.setAttribute('aria-pressed', String(vivo.enVivo));
    raiz.dataset.vivo = vivo.enVivo ? 'si' : 'no';
  }
  function barras() {
    const con = centrosConFicha(tienda.fichas(), tienda.asoc, tienda.t);
    if (con.size === ultimoCob) return;
    ultimoCob = con.size;
    const cob = coberturaPorNivel(tienda.centros, con).reverse();
    g('cob').querySelector('[data-barras]')!.innerHTML = cob.map((c) => {
      const tot = Math.max(1, c.sinCob + c.conCob + c.sinDato);
      const w = (n: number) => `${((n / tot) * 100).toFixed(2)}%`;
      return `<div class="fila" title="${c.niv}: ${c.sinCob} sin cobertura garantizada (${c.sinCobConFicha} con reporte), ${c.conCob} con cobertura, ${c.sinDato} sin dato OSIPTEL">
      <span>${c.niv}</span><span class="bar"><i class="seg-ficha" style="width:${w(c.sinCobConFicha)}"></i><i class="seg-sincob" style="width:${w(c.sinCob - c.sinCobConFicha)}"></i><i class="seg-concob" style="width:${w(c.conCob)}"></i><i class="seg-sindato" style="width:${w(c.sinDato)}"></i></span>
      <span class="num">${num(c.sinCob)} de ${num(c.sinCob + c.conCob)}</span></div>`;
    }).join('');
    const sin = cob.reduce((s, c) => s + c.sinCob, 0), conDato = cob.reduce((s, c) => s + c.sinCob + c.conCob, 0), conR = cob.reduce((s, c) => s + c.sinCobConFicha, 0);
    g('cob').querySelector('[data-v3]')!.textContent = `${num(sin)} de ${num(conDato)} · ${num(con.size)} centros con reporte`;
    g('cob').setAttribute('aria-label', `Cobertura OSIPTEL por nivel: ${sin} de ${conDato} centros poblados con dato están sin cobertura garantizada; ${con.size} centros con reportes hasta el cabezal (${conR} de ellos sin cobertura garantizada).`);
  }

  // ---------- reproducción (todo el histórico en la duración elegida) ----------
  let raf = 0, ultimo = 0;
  const hps = () => { const [a, b] = tienda.rango; return Math.max(0.001, (b - a) / H / +dur.value); };
  const bucle = (ts: number) => {
    const dt = ultimo ? ts - ultimo : 0;
    ultimo = ts;
    reloj.hps = hps();
    const fin = reloj.avanzar(Math.min(dt, 100));
    tienda.setT(reloj.t);
    if (fin) { pausar(); vivo.irEnVivo(); return; }
    if (!reloj.jugando) return pausar();
    raf = requestAnimationFrame(bucle);
  };
  function jugar() {
    vivo.soltarVivo();
    const [a, b] = tienda.rango;
    reloj.ir(tienda.t >= b - (b - a) * 0.01 ? a : tienda.t);
    reloj.play(); tienda.setT(reloj.t);
    btnPlay.setAttribute('aria-pressed', 'true'); btnPlay.setAttribute('aria-label', 'Pausar'); btnPlay.innerHTML = IC.pausa;
    ultimo = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(bucle);
  }
  function pausar() {
    reloj.pausa(); cancelAnimationFrame(raf); raf = 0;
    btnPlay.setAttribute('aria-pressed', 'false'); btnPlay.setAttribute('aria-label', 'Reproducir el histórico'); btnPlay.innerHTML = IC.play;
  }
  btnPlay.onclick = () => (reloj.jugando ? pausar() : jugar());
  $<HTMLButtonElement>('[data-a=paso]').onclick = () => { pausar(); vivo.soltarVivo(); reloj.ir(tienda.t); tienda.setT(reloj.paso(eventos.map((e) => e.t), 0.25)); };
  btnVivo.onclick = () => { pausar(); vivo.irEnVivo(); };

  // ---------- cabezal arrastrable ----------
  const tDesdeX = (clientX: number) => {
    const r = pista.getBoundingClientRect();
    const [a, b] = tienda.rango;
    return a + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (b - a);
  };
  const mover = (t: number) => { pausar(); const [, b] = tienda.rango; if (t >= b) vivo.irEnVivo(); else { vivo.soltarVivo(); tienda.setT(t); } };
  pista.addEventListener('pointerdown', (e) => {
    pista.setPointerCapture(e.pointerId);
    pista.focus({ preventScroll: true });
    mover(tDesdeX(e.clientX));
    const mv = (ev: PointerEvent) => mover(tDesdeX(ev.clientX));
    const soltar = () => { pista.removeEventListener('pointermove', mv); pista.removeEventListener('pointerup', soltar); pista.removeEventListener('pointercancel', soltar); };
    pista.addEventListener('pointermove', mv); pista.addEventListener('pointerup', soltar); pista.addEventListener('pointercancel', soltar);
  });
  pista.addEventListener('keydown', (e) => {
    const [a, b] = tienda.rango;
    const d = (b - a) / (e.shiftKey ? 10 : 50);
    const nuevo = ({ ArrowRight: tienda.t + d, ArrowUp: tienda.t + d, ArrowLeft: tienda.t - d, ArrowDown: tienda.t - d, Home: a, End: b } as Record<string, number>)[e.key];
    if (nuevo === undefined) { if (e.key === ' ') { e.preventDefault(); btnPlay.click(); } return; }
    e.preventDefault();
    mover(Math.min(b, Math.max(a, nuevo)));
  });

  const verGraf = $<HTMLButtonElement>('.v3d-ver-graf');
  verGraf.onclick = () => { const si = raiz.dataset.graficos !== 'si'; raiz.dataset.graficos = si ? 'si' : 'no'; verGraf.setAttribute('aria-expanded', String(si)); };
  $<HTMLButtonElement>('.v3d-abrir-cajon').onclick = abrirCajon;

  tienda.on('rango', estructura);
  tienda.on('fichas', estructura);
  tienda.on('t', () => { cabezal(); if (!reloj.jugando) reloj.ir(tienda.t); });
  new ResizeObserver(() => estructura()).observe(pista);
  estructura();
  return {
    actualizar(r: ReporteApi[], h: IncHist[]) { reps = r; hs = h; eventos = eventosHistorico(r, h); estructura(); },
    pintar: cabezal, jugar, pausar,
    eventos: () => eventos, jugando: () => reloj.jugando,
  };
}
