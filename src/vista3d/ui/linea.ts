// Línea de tiempo inferior: play/pausa/paso/velocidad, cabezal arrastrable (puntero y teclado),
// bandas de la ventana SENAMHI y del escenario, marcadores de eventos y gráficos sincronizados.
import type { Tienda } from './tienda';
import { OBS_LABELS } from '../../codec';
import {
  ESCENARIO_FIN, ESCENARIO_INICIO, Reloj, VELOCIDADES, eventosOficiales, fechaHora, marcas, ventanaSenamhi, type EventoClave,
} from './tiempo';
import { montarGraficos } from './graficos';
import { IC } from './iconos';
import { esc } from './formato';

const H = 3600_000;

/** Eventos clave: oficiales (sin inventar fechas) + fichas recibidas y consolidadas + «ahora». */
export function eventosLinea(tienda: Tienda, ahora = tienda.ahora()): EventoClave[] {
  const ev: EventoClave[] = [...eventosOficiales(ahora)];
  for (const f of tienda.fichas()) {
    const tipo = OBS_LABELS[f.type] ?? f.type;
    const sim = f.simulado ? ' · SIMULADO' : '';
    ev.push({ t: f.ts, titulo: `Ficha registrada · ${tipo}`, detalle: `NO VERIFICADO${sim}`, tipo: 'ficha' });
    if (f.syncedAt) ev.push({ t: f.syncedAt, titulo: 'Ficha consolidada en el servidor', detalle: `${tipo} · NO VERIFICADO${sim}`, tipo: 'consolidada' });
  }
  ev.push({ t: ahora, titulo: 'Ahora', detalle: 'Hora de este equipo', tipo: 'ahora' });
  return ev.sort((x, y) => x.t - y.t);
}

export function montarLinea(cont: HTMLElement, raiz: HTMLElement, tienda: Tienda, abrirCajon: () => void) {
  cont.innerHTML = `
    <div class="v3d-lcab">
      <h2 id="v3d-linea-t">Línea de tiempo</h2>
      <span class="v3d-play" role="group" aria-label="Reproducción">
        <button type="button" data-a="play" aria-pressed="false" aria-label="Reproducir">${IC.play}</button>
        <button type="button" data-a="paso" aria-label="Siguiente evento">${IC.paso}</button>
        <select data-a="vel" aria-label="Velocidad (horas del escenario por segundo)">${VELOCIDADES.map((v) => `<option value="${v.hps}" ${v.hps === 4 ? 'selected' : ''}>${v.id}</option>`).join('')}</select>
      </span>
      <button type="button" class="v3d-ver-graf" aria-expanded="false" aria-controls="v3d-graficos">Gráficos</button>
      <button type="button" class="v3d-abrir-cajon" aria-controls="v3d-panel">${IC.capas}Capas y datos</button>
      <span class="rango" data-rango></span>
    </div>
    <div class="v3d-pista" tabindex="0" role="slider" aria-labelledby="v3d-linea-t" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
      <div class="riel"></div><div class="hecho"></div>
      <div class="banda escenario" data-b="esc" title="Escenario de riesgo CENEPRED 17–19/10/2026"></div>
      <div class="banda senamhi" data-b="sen" title="Ventana del pronóstico SENAMHI (24 h)"></div>
      <div data-ev></div><div data-marcas></div>
      <div class="cabezal"><span data-et></span></div>
    </div>
    <div class="v3d-graficos" id="v3d-graficos"></div>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => cont.querySelector<T>(s)!;
  const pista = $('.v3d-pista'), cab = $('.cabezal'), hecho = $('.hecho'), et = $('[data-et]');
  const btnPlay = $<HTMLButtonElement>('[data-a=play]'), vel = $<HTMLSelectElement>('[data-a=vel]');

  const reloj = new Reloj(...tienda.rango, tienda.t);
  reloj.hps = +vel.value;
  const pct = (t: number) => { const [a, b] = tienda.rango; return b > a ? ((t - a) / (b - a)) * 100 : 0; };
  let eventos: EventoClave[] = [];

  function estructura() {
    const [a, b] = tienda.rango;
    reloj.setRango(a, b);
    pista.setAttribute('aria-valuemin', String(a));
    pista.setAttribute('aria-valuemax', String(b));
    $('[data-rango]').textContent = `${fechaHora(a)} – ${fechaHora(b)} · hora de Lima`;
    const v = ventanaSenamhi(tienda.ahora());
    const banda = (el: HTMLElement, x0: number, x1: number) => { el.style.left = `${pct(x0)}%`; el.style.width = `${Math.max(0, pct(x1) - pct(x0))}%`; };
    banda($('[data-b=sen]'), v.desde, v.hasta);
    banda($('[data-b=esc]'), ESCENARIO_INICIO, ESCENARIO_FIN);
    eventos = eventosLinea(tienda);
    $('[data-ev]').innerHTML = eventos.map((e) => `<span class="ev ${e.tipo}" style="left:${pct(e.t).toFixed(3)}%" title="${esc(e.titulo)} · ${esc(fechaHora(e.t))}"></span>`).join('');
    const ancho = pista.clientWidth || 600;
    const paso = ancho < 520 ? 24 : 12;
    $('[data-marcas]').innerHTML = marcas(a, b, paso)
      .map((m) => `<span class="marca${m.diaNuevo ? ' dia' : ''}" style="left:${pct(m.t).toFixed(3)}%">${m.diaNuevo ? `<b>${esc(m.dia)}</b>` : '<b>&nbsp;</b>'}${esc(m.hora)}</span>`).join('');
    cabezal();
  }
  function cabezal() {
    const x = `${pct(tienda.t)}%`;
    cab.style.left = x; hecho.style.width = x;
    et.textContent = fechaHora(tienda.t);
    pista.setAttribute('aria-valuenow', String(Math.round(tienda.t)));
    pista.setAttribute('aria-valuetext', `${fechaHora(tienda.t)}, hora de Lima`);
  }

  // ---------- reproducción ----------
  let raf = 0, ultimo = 0;
  const bucle = (ts: number) => {
    const dt = ultimo ? ts - ultimo : 0;
    ultimo = ts;
    const fin = reloj.avanzar(Math.min(dt, 100));
    tienda.setT(reloj.t);
    if (fin || !reloj.jugando) return pausar();
    raf = requestAnimationFrame(bucle);
  };
  function jugar() {
    reloj.ir(tienda.t);
    reloj.play(); tienda.setT(reloj.t);
    btnPlay.setAttribute('aria-pressed', 'true'); btnPlay.setAttribute('aria-label', 'Pausar'); btnPlay.innerHTML = IC.pausa;
    ultimo = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(bucle);
  }
  function pausar() {
    reloj.pausa(); cancelAnimationFrame(raf); raf = 0;
    btnPlay.setAttribute('aria-pressed', 'false'); btnPlay.setAttribute('aria-label', 'Reproducir'); btnPlay.innerHTML = IC.play;
  }
  btnPlay.onclick = () => (reloj.jugando ? pausar() : jugar());
  $<HTMLButtonElement>('[data-a=paso]').onclick = () => { reloj.ir(tienda.t); tienda.setT(reloj.paso(eventos.map((e) => e.t))); };
  vel.onchange = () => { reloj.hps = +vel.value; };

  // ---------- cabezal arrastrable ----------
  const tDesdeX = (clientX: number) => {
    const r = pista.getBoundingClientRect();
    const [a, b] = tienda.rango;
    return a + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (b - a);
  };
  pista.addEventListener('pointerdown', (e) => {
    pista.setPointerCapture(e.pointerId);
    pista.focus({ preventScroll: true });
    tienda.setT(tDesdeX(e.clientX));
    const mover = (ev: PointerEvent) => tienda.setT(tDesdeX(ev.clientX));
    const soltar = () => { pista.removeEventListener('pointermove', mover); pista.removeEventListener('pointerup', soltar); pista.removeEventListener('pointercancel', soltar); };
    pista.addEventListener('pointermove', mover);
    pista.addEventListener('pointerup', soltar);
    pista.addEventListener('pointercancel', soltar);
  });
  pista.addEventListener('keydown', (e) => {
    const [a, b] = tienda.rango;
    const d = e.shiftKey ? 6 * H : H;
    const nuevo = ({ ArrowRight: tienda.t + d, ArrowUp: tienda.t + d, ArrowLeft: tienda.t - d, ArrowDown: tienda.t - d, PageUp: tienda.t + 12 * H, PageDown: tienda.t - 12 * H, Home: a, End: b } as Record<string, number>)[e.key];
    if (nuevo === undefined) { if (e.key === ' ') { e.preventDefault(); btnPlay.click(); } return; }
    e.preventDefault();
    tienda.setT(nuevo);
  });

  // ---------- celular: gráficos plegables y cajón ----------
  const verGraf = $<HTMLButtonElement>('.v3d-ver-graf');
  verGraf.onclick = () => {
    const si = raiz.dataset.graficos !== 'si';
    raiz.dataset.graficos = si ? 'si' : 'no';
    verGraf.setAttribute('aria-expanded', String(si));
  };
  $<HTMLButtonElement>('.v3d-abrir-cajon').onclick = abrirCajon;

  montarGraficos($('#v3d-graficos'), tienda);
  tienda.on('fichas', estructura);
  tienda.on('t', () => { cabezal(); if (!reloj.jugando) reloj.ir(tienda.t); });
  new ResizeObserver(() => estructura()).observe(pista);
  estructura();
  return { jugar, pausar, eventos: () => eventos, jugando: () => reloj.jugando };
}
