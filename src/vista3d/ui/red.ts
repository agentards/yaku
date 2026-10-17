// C1: banda ancha con el estado de red de este equipo y la cola de sincronización (fichas reales de IndexedDB
// con synced=false; las SIMULADAS no cuentan). Se ve siempre sin red, con red mientras haya pendientes y unos
// segundos después de que la cola se vacía (M4: «Sincronizado ✓»). La pastilla [data-red] de la barra superior
// sigue igual (texto exacto SIN RED / EN LÍNEA).
import type { Tienda } from './tienda';
import { bandaSinRedTxt, colaSync } from './formato';
import { IC } from './iconos';

const RECIEN_MS = 8000;

export function montarBandaRed(el: HTMLElement, raiz: HTMLElement, tienda: Tienda) {
  el.className = 'v3d-banda';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="estado">${IC.sinRed}<span><b data-b="red"></b> · <span data-b="txt"></span></span></span><span class="cola" data-cola></span>`;
  const $ = (s: string) => el.querySelector<HTMLElement>(s)!;
  const poner = (e: HTMLElement, s: string) => { if (e.textContent !== s) e.textContent = s; };
  let previo = -1, hasta = 0, tm = 0;

  function pintar() {
    const c = colaSync(tienda.reales);
    const leido = tienda.realesLeidas;
    if (leido) {
      if (tienda.red && previo > 0 && c.n === 0) hasta = Date.now() + RECIEN_MS;
      previo = c.n;
    }
    const recien = Date.now() < hasta;
    const visible = !tienda.red || (leido && c.n > 0) || recien;
    el.hidden = !visible;
    el.dataset.estado = tienda.red ? 'on' : 'off';
    raiz.dataset.banda = visible ? (tienda.red ? 'on' : 'off') : 'no';
    poner($('[data-b="red"]'), tienda.red ? 'EN LÍNEA' : 'SIN RED');
    poner($('[data-b="txt"]'), tienda.red ? (c.n ? 'este equipo tiene conexión' : 'fichas consolidadas en el servidor') : bandaSinRedTxt());
    const cola = $('[data-cola]');
    poner(cola, leido ? c.txt : 'Revisando fichas guardadas…');
    cola.dataset.n = String(leido ? c.n : -1);
    clearTimeout(tm);
    if (recien) tm = window.setTimeout(pintar, hasta - Date.now() + 50);
  }
  tienda.on('red', pintar);
  tienda.on('fichas', pintar);
  pintar();
  return { pintar };
}
