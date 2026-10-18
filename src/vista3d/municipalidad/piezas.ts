// Piezas HTML puras del panel de la municipalidad (sin DOM, testeables): contador con rodillo 1 → 2 vecinos,
// desglose del respaldo (personas · fotos · cercanía · recencia) y fotos pendientes de subir.
// Reglas: producto/decision-confianza.md §2.1 y §2.4 (demo: «el contador sube de 1 vecino a 2 vecinos»).
import { esc } from '../ui/formato';
import { FOTOS_PENDIENTES, FOTOS_PENDIENTES_AYUDA } from '../../poblador/textos';
import type { Desglose } from './textos';

const coma = (x: number, d = 2) => x.toFixed(d).replace('.', ',');

/**
 * «2 vecinos» con el número en rodillo: el anterior («1») sale hacia arriba y entra el nuevo. El número viejo va en
 * un atributo y lo pinta CSS (::before), así innerText/lectores de pantalla solo leen el valor actual. Sin cambio
 * (o sin valor anterior) devuelve el texto plano.
 */
export function rodillo(n: number, antes: number | null | undefined, uno: string, varios: string) {
  const palabra = esc(n === 1 ? uno : varios);
  if (antes == null || antes === n) return `${n} ${palabra}`;
  const dir = n > antes ? 'sube' : 'baja';
  return `<span class="muni-rod-w muni-rod-${dir}" data-mas="${n > antes ? `+${n - antes}` : ''}"><span class="muni-rod"><span class="muni-rod-c" data-de="${antes}">${n}</span></span></span> ${palabra}`;
}

/** Tramos del respaldo (en puntos ya multiplicados por la recencia) para la barra apilada; suman ≈ el total. */
export function tramos(d: Desglose) {
  const k = d.recencia;
  return { personas: d.personas * k, fotos: d.fotos * k, cercania: d.cercania * k, perdido: (d.personas + d.fotos + d.cercania) * (1 - k) };
}

/** «Personas 40 · Fotos 15 · Cercanía 20 · Recencia ×1,00 = 75» + barra apilada (0–100). */
export function desgloseHtml(d: Desglose, total: number) {
  const t = tramos(d);
  const seg = (cls: string, v: number, tit: string) => (v > 0.05 ? `<i class="muni-dg-${cls}" style="width:${Math.min(100, v).toFixed(1)}%" title="${esc(tit)}"></i>` : '');
  return `<span class="muni-dg-txt">Personas <b>${d.personas}</b> · Fotos <b>${d.fotos}</b> · Cercanía <b>${d.cercania}</b> · Recencia <b>×${coma(d.recencia)}</b> = <b>${Math.round(total)}</b></span>`
    + `<span class="muni-dg-barra" role="img" aria-label="${esc(`Respaldo ${Math.round(total)} de 100`)}">`
    + seg('personas', t.personas, 'Personas distintas') + seg('fotos', t.fotos, 'Fotos recibidas') + seg('cercania', t.cercania, 'Cercanía al primer reporte')
    + seg('perdido', t.perdido, `Pierde por antigüedad (×${coma(d.recencia)})`) + '</span>';
}

/** Casilla de la galería: «N fotos pendientes de subir» (no suman al respaldo hasta llegar al servidor). */
export function pendientesHtml(n: number) {
  if (n <= 0) return '';
  return `<span class="muni-foto muni-foto-falta">${esc(FOTOS_PENDIENTES(n))}<small>${esc(FOTOS_PENDIENTES_AYUDA)}</small></span>`;
}
