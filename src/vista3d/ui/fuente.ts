// C2: chip «Fuente: CENEPRED/SIGRID 23077 · 16/10/2026» en la barra superior y su ficha (diálogo modal) con
// título, firma, descarga, IGN, OSIPTEL 2025-IV y el pronóstico SENAMHI con su estado (VIGENTE/VENCIDO).
// También la leyenda de niveles en lenguaje claro, en la ficha y fija sobre la escena.
import type { Tienda } from './tienda';
import { esc, fichaFuente, FUENTE_CHIP, LEYENDA_NIVELES, NIVEL_REFERENCIAL } from './formato';
import { IC } from './iconos';

export const chipFuenteHtml = () =>
  `<button type="button" class="v3d-fuente" data-fuente aria-haspopup="dialog" aria-controls="v3d-fuente" aria-expanded="false">${IC.info}<span>${esc(FUENTE_CHIP)}</span></button>`;

/** Leyenda compacta, fija sobre la escena. */
export const leyendaHtml = () => `<div class="v3d-leyenda" role="group" aria-label="Leyenda: exposición a inundaciones según el escenario CENEPRED">
  <b>Exposición a inundaciones</b>
  <ul>${LEYENDA_NIVELES.map((l) => `<li><i style="background:${l.color}"></i>${esc(l.niv)}</li>`).join('')}</ul>
  <p>${esc(NIVEL_REFERENCIAL)}</p></div>`;

export function montarFuente(chip: HTMLButtonElement, raiz: HTMLElement, tienda: Tienda) {
  const dlg = document.createElement('dialog');
  dlg.className = 'v3d-fuente-ficha';
  dlg.id = 'v3d-fuente';
  dlg.setAttribute('aria-labelledby', 'v3d-fuente-t');
  dlg.dataset.fuenteFicha = '';
  raiz.append(dlg);

  function pintar() {
    dlg.innerHTML = `<div class="in">
      <div class="cab"><h2 id="v3d-fuente-t">Fuente del escenario</h2><button type="button" data-cerrar-fuente aria-label="Cerrar la ficha de fuente">${IC.cerrar}</button></div>
      <dl class="v3d-dl">${fichaFuente(tienda.ahora()).map((f) => `<dt>${esc(f.k)}</dt><dd${f.senamhi ? ' data-senamhi' : ''}>${esc(f.v)}</dd>`).join('')}</dl>
      <h3>Niveles de exposición a inundaciones</h3>
      <ul class="v3d-niveles">${LEYENDA_NIVELES.map((l) => `<li><i style="background:${l.color}"></i><b>${esc(l.niv)}</b><span>${esc(l.claro)}</span></li>`).join('')}</ul>
      <p class="v3d-referencial">${esc(NIVEL_REFERENCIAL)}</p>
      <p class="v3d-nota">Color = nivel de exposición a inundaciones que trae el Excel del escenario. Es un escenario hipotético basado en un pronóstico: nivel de exposición, no profundidad de agua ni daños observados.</p></div>`;
  }
  pintar();

  const cerrar = () => {
    if (!dlg.open) return;
    if (typeof dlg.close === 'function') dlg.close();
    else { dlg.removeAttribute('open'); dlg.dispatchEvent(new Event('close')); }
  };
  chip.onclick = () => {
    pintar(); // el estado VIGENTE/VENCIDO del pronóstico depende de la hora actual
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    chip.setAttribute('aria-expanded', 'true');
    dlg.querySelector<HTMLButtonElement>('[data-cerrar-fuente]')?.focus();
  };
  dlg.addEventListener('close', () => { chip.setAttribute('aria-expanded', 'false'); chip.focus(); });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || (e.target as HTMLElement).closest('[data-cerrar-fuente]')) cerrar();
  });
  return { dlg, abrir: () => chip.click(), cerrar };
}
