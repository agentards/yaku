// Piezas HTML del Centro de monitoreo (puras, testeables): fila de la lista, tarjeta flotante y detalle del incidente
// con galería, desglose del respaldo, historial y acciones. Textos y reglas: ../municipalidad/textos.ts (fuente
// única de producto/decision-confianza.md). Lo vecinal es ámbar y «por validar»; verde solo lo que pone la municipalidad.
import { esc } from '../ui/formato';
import { llegoHace } from '../municipalidad/deteccion';
import { cerrado, hhmm, plural, siguientes, type Incidente } from '../municipalidad/incidentes';
import { fotoUrl } from '../municipalidad/api';
import { desgloseHtml, pendientesHtml, rodillo } from '../municipalidad/piezas';
import {
  ACCIONES, DETALLE, estadoChip, esVerde, motivoDescarteTxt, PIE_LEGAL, respaldoTxt, RIESGO_VIDA, ROTULO_VECINAL, tipoTxt, VIDA_PANEL, vecinos, type Estado,
} from '../municipalidad/textos';

export interface Ctx {
  /** Puede cambiar estados (rol operador, servidor con /api/incidentes, en vivo). */
  puede: boolean;
  /** Por qué no puede (se muestra en lugar de los botones). */
  motivoNo: string;
  /** Valores anteriores del contador si acaba de subir (rodillo). */
  antes: { personas: number; fotos: number } | null;
  ahora: number;
}

export const vida = (i: Incidente) => RIESGO_VIDA.includes(i.tipo);
export const claseEstado = (i: Pick<Incidente, 'estado'>) => `mon-est mon-est-${i.estado}${esVerde(i.estado) ? ' municipal' : ''}`;
export const chipEstado = (i: Pick<Incidente, 'estado' | 'accion'>) => estadoChip(i.estado, i.accion);
const hace = (i: Incidente, ahora: number) => llegoHace(i.recibido ?? i.ultimo, ahora);
/** Rótulo vecinal mientras nadie lo revisó; con estado municipal, solo ese estado (como lo ve el poblador). */
const chipCab = (i: Incidente) => (i.estado === 'nuevo'
  ? `<span class="mon-rotulo">${esc(ROTULO_VECINAL)}</span>`
  : `<span class="${claseEstado(i)}">${esc(chipEstado(i))}</span>`);

/** «2 vecinos · 1 foto · primer reporte 21:03» con rodillo en los números que acaban de subir. */
export function contadorHtml(i: Incidente, antes: Ctx['antes']) {
  return `<b class="mon-k-personas">${rodillo(i.personas, antes?.personas, 'vecino', 'vecinos')}</b> · <b class="mon-k-fotos">${rodillo(i.nFotos, antes?.fotos, 'foto', 'fotos')}</b> · primer reporte ${esc(hhmm(i.primer))}`;
}

export function filaHtml(i: Incidente, ctx: Pick<Ctx, 'antes' | 'ahora'>, actual: boolean) {
  return `<li data-id="${esc(i.id)}" data-estado="${i.estado}" class="${vida(i) ? 'vida' : ''}${actual ? ' actual' : ''}${cerrado(i) ? ' cerrado' : ''}">
    <button type="button" class="mon-item" aria-current="${actual}"><span class="mon-i-tipo">${esc(tipoTxt(i.tipo))}</span>
      <span class="mon-i-cont${ctx.antes ? ' sube' : ''}">${contadorHtml(i, ctx.antes)}</span>
      <span class="mon-i-meta"><span class="${claseEstado(i)}">${esc(chipEstado(i))}</span> <span class="mon-conf mon-conf-${i.nivel}">${esc(respaldoTxt(i.puntaje, i.nivel))}</span></span>
      <span class="mon-i-hace" data-recibido="${i.recibido ?? i.ultimo}">${esc(hace(i, ctx.ahora))}</span></button></li>`;
}

/** Botones del flujo de estados (§2.3). Cada uno pide confirmación antes de escribir. */
export function accionesHtml(i: Incidente, ctx: Pick<Ctx, 'puede' | 'motivoNo'>) {
  if (!ctx.puede) return `<p class="mon-sinacc">${esc(ctx.motivoNo)}</p>`;
  const b = (destino: Estado, txt: string, cls = '', accion = '') => `<button type="button" class="v3d-b mon-acc ${cls}" data-destino="${destino}"${accion ? ` data-accion="${accion}"` : ''}>${esc(txt)}</button>`;
  const p: string[] = [];
  if (i.estado === 'nuevo') p.push(b('en_revision', 'En revisión'), b('validado', 'Validar', 'pri'), b('descartado', 'Descartar', 'peligro'));
  else if (i.estado === 'en_revision') p.push(b('validado', 'Validar', 'pri'), b('descartado', 'Descartar', 'peligro'));
  else if (i.estado === 'validado' || i.estado === 'accion_asignada') {
    p.push(`<span class="mon-acc-tit">${i.estado === 'validado' ? 'Asignar acción' : 'Cambiar acción'}:</span>`);
    for (const [k, v] of Object.entries(ACCIONES)) if (k !== i.accion) p.push(b('accion_asignada', v, 'tipo', k));
    if (siguientes(i.estado).includes('atendido')) p.push(b('atendido', 'Atendido', 'pri'));
    if (siguientes(i.estado).includes('descartado')) p.push(b('descartado', 'Descartar', 'peligro'));
  } else if (i.estado === 'descartado') p.push(b('en_revision', 'Reabrir (en revisión)'));
  return p.length ? `<div class="mon-acciones">${p.join('')}</div>` : '';
}

export function galeriaHtml(i: Incidente, max = 6) {
  const faltan = Math.max(0, i.nFotos - i.fotos.length) + i.fotosPendientes;
  if (!i.fotos.length && !faltan) return '<p class="mon-sinfoto">Sin fotos todavía.</p>';
  const extra = Math.max(0, i.fotos.length - max);
  return `<div class="mon-galeria">${i.fotos.slice(0, max).map((f, k) => `<button type="button" class="muni-foto" data-k="${k}" aria-label="Ver foto ${k + 1} de ${i.fotos.length}"><img loading="lazy" src="${esc(fotoUrl(f))}" alt="Foto ${k + 1} enviada por un vecino"></button>`).join('')}
    ${extra ? `<button type="button" class="muni-foto mon-foto-mas" data-k="${max}">+${extra}</button>` : ''}${pendientesHtml(faltan)}</div>`;
}

const avisosHtml = (i: Incidente) => [
  i.estado === 'descartado' && i.motivo ? `<p class="mon-motivo">${esc(motivoDescarteTxt(i.motivo))}</p>` : '',
  i.estado === 'descartado' && i.nuevosTrasDescarte ? `<p class="mon-aviso">${esc(plural(i.nuevosTrasDescarte, 'reporte nuevo', 'reportes nuevos'))} después de descartar</p>` : '',
  i.recurrenciaDe ? '<p class="mon-aviso">Posible recurrencia de un incidente ya atendido</p>' : '',
].join('');

/** Tarjeta flotante grande sobre la escena (incidente nuevo o elegido). */
export function tarjetaHtml(i: Incidente, ctx: Ctx) {
  const otros = i.tipos.filter((t) => t !== i.tipo);
  return `<div class="mon-t-cab">${chipCab(i)}
      <span class="mon-t-hace" data-recibido="${i.recibido ?? i.ultimo}">${esc(hace(i, ctx.ahora))}</span>
      <button type="button" class="mon-cerrar" data-cerrar-tarjeta aria-label="Cerrar tarjeta">×</button></div>
    <h2 class="mon-t-tipo">${esc(tipoTxt(i.tipo))}</h2>
    ${otros.length ? `<p class="mon-t-otros">También reportan: ${esc(otros.map(tipoTxt).join(', '))}</p>` : ''}
    ${vida(i) ? `<p class="mon-vida">${esc(VIDA_PANEL).replace(/\b(116|105)\b/g, '<b>$1</b>')}</p>` : ''}
    <p class="mon-t-cont${ctx.antes ? ' sube' : ''}">${contadorHtml(i, ctx.antes)}</p>
    <p class="mon-t-resp"><span class="mon-conf mon-conf-${i.nivel}">${esc(respaldoTxt(i.puntaje, i.nivel))}</span> ${esc(DETALLE[i.nivel](i.personas, i.nFotos))}${i.congelado ? ' <small>congelado al validar</small>' : ''}</p>
    ${galeriaHtml(i, 4)}
    ${avisosHtml(i)}
    ${accionesHtml(i, ctx)}
    <p class="mon-pie">${esc(PIE_LEGAL)}</p>`;
}

/** Detalle completo en la pestaña Incidentes: datos, desglose, galería, notas, historial y acciones. */
export function detalleHtml(i: Incidente, ctx: Ctx) {
  const hist = [...i.historial].reverse();
  return `<h3><span>${esc(tipoTxt(i.tipo))}</span><button type="button" class="mon-cerrar" data-cerrar-detalle aria-label="Volver a la lista">×</button></h3>
    <div class="cuerpo">
      <p class="mon-d-tags">${chipCab(i)}</p>
      ${vida(i) ? `<p class="mon-vida">${esc(VIDA_PANEL)}</p>` : ''}
      <p class="mon-t-cont${ctx.antes ? ' sube' : ''}">${contadorHtml(i, ctx.antes)}</p>
      <dl class="v3d-dl">
        <dt>Respaldo</dt><dd><span class="mon-conf mon-conf-${i.nivel}">${esc(respaldoTxt(i.puntaje, i.nivel))}</span>${i.congelado ? ' <small>congelado al validar</small>' : ''}<br><small>${esc(DETALLE[i.nivel](i.personas, i.nFotos))}</small>${i.desglose ? `<small class="mon-desglose">${desgloseHtml(i.desglose, i.puntaje)}</small>` : ''}</dd>
        <dt>Reportes</dt><dd>${esc(plural(i.reportes, 'reporte', 'reportes'))} de ${esc(vecinos(i.personas))}</dd>
        <dt>Severidad</dt><dd class="mon-sev${i.severidad}">Máx. ${i.severidad} de 3 <small>la marca quien reporta</small></dd>
        <dt>Último</dt><dd>${esc(hhmm(i.ultimo))} <small>reloj del celular</small></dd>
        <dt>Ubicación</dt><dd class="mono">${i.lat.toFixed(5)}, ${i.lon.toFixed(5)}</dd>
      </dl>
      ${galeriaHtml(i)}
      ${i.notas.length ? `<ul class="mon-notas">${i.notas.slice(-4).map((n) => `<li>«${esc(n)}»</li>`).join('')}</ul>` : ''}
      ${avisosHtml(i)}
      ${accionesHtml(i, ctx)}
      <h4 class="mon-h4">Historial de estados</h4>
      <ol class="mon-hist">${hist.length ? hist.map((c) => `<li><b>${esc(estadoChip(c.estado, c.accion))}</b>${c.motivo && c.estado === 'descartado' ? ` · ${esc(c.motivo)}` : ''}<br><small>${c.quien ? esc(c.quien) + ' · ' : ''}${Number.isFinite(c.cuando) ? esc(hhmm(c.cuando, true)) : ''}</small></li>`).join('') : '<li><small>Sin cambios: aún nadie lo revisó.</small></li>'}</ol>
      <p class="mon-pie">${esc(PIE_LEGAL)}</p>
    </div>`;
}
