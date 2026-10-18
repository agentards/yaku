// Piezas HTML del Centro de monitoreo (puras, testeables): fila de la lista, tarjeta flotante y detalle del incidente
// con galería, desglose del respaldo, historial y acciones. Textos y reglas: ../municipalidad/textos.ts (fuente
// única de producto/decision-confianza.md). Lo vecinal es «por validar»; verde solo lo que pone la municipalidad.
// Diseño sobrio: superficies neutras; el estado y la prioridad se dicen con un punto de color + texto (data-tono:
// nuevo | revision | municipal | cerrado | vida), un ícono monocromo por tipo y, si hay fotos, la miniatura de la
// primera. Sin relleno: el pie legal va una sola vez, en el pie de la página (pieMonitoreoHtml).
// Las fotos van como <img data-foto> sin src: ./fotos.ts las descarga con la sesión (el servidor las protege).
import { esc } from '../ui/formato';
import { llegoHace } from '../municipalidad/deteccion';
import { cerrado, hhmm, plural, siguientes, type Incidente } from '../municipalidad/incidentes';
import { desgloseHtml, pendientesHtml, rodillo } from '../municipalidad/piezas';
import {
  ACCIONES, estadoChip, esVerde, motivoDescarteTxt, PIE_LEGAL, PIE_PANEL, respaldoTxt, RIESGO_VIDA, ROTULO_VECINAL, tipoTxt, VIDA_PANEL, vecinos, type Estado,
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

export type Tono = 'nuevo' | 'revision' | 'municipal' | 'cerrado' | 'vida';
/** Acento de la tarjeta: riesgo de vida abierto manda; si no, el grupo del estado (mismos colores que el mapa). */
export function tono(i: Pick<Incidente, 'estado' | 'tipo'>): Tono {
  if (i.estado === 'atendido' || i.estado === 'descartado') return 'cerrado';
  if (RIESGO_VIDA.includes(i.tipo)) return 'vida';
  return i.estado === 'nuevo' ? 'nuevo' : i.estado === 'en_revision' ? 'revision' : 'municipal';
}

// ---------- íconos por tipo de incidente (24×24, trazo; decorativos) ----------
const ic = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICONO_TIPO: Record<string, string> = {
  agua: ic('<path d="M12 3.5s-5.5 6-5.5 9.8a5.5 5.5 0 0 0 11 0C17.5 9.5 12 3.5 12 3.5Z"/><path d="M9.5 14.2a2.6 2.6 0 0 0 2.5 2.4"/>'),
  huaico: ic('<path d="m3 18 6-10 3.5 5L15 9.5 21 18"/><path d="M3 21c2-1.2 3.5-1.2 5.5 0s3.5 1.2 5.5 0 3.5-1.2 5.5 0"/>'),
  cauce: ic('<path d="M3 8c2-1.3 3.5-1.3 5.5 0s3.5 1.3 5.5 0 3.5-1.3 5.5 0"/><path d="M3 16c2-1.3 3.5-1.3 5.5 0s3.5 1.3 5.5 0 3.5-1.3 5.5 0"/><path d="M12 4.5v15"/><path d="M9.5 12h5"/>'),
  via_bloq: ic('<rect x="3" y="8" width="18" height="6" rx="1.5"/><path d="m7 8-3 6M12 8l-3 6M17 8l-3 6M20.5 8.5 19 14"/><path d="M6 14v6M18 14v6"/>'),
  vivienda: ic('<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="m12 9-1.5 3 2.5 2-1.5 3"/>'),
  atrapados: ic('<circle cx="12" cy="6" r="2.2"/><path d="M8 21v-5.5l-2-4M16 21v-5.5l2-4M9.5 11h5"/><path d="M3 3v18M21 3v18"/>'),
  heridos: ic('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>'),
  ayuda: ic('<path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z"/><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8"/>'),
  otro: ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.5v.5"/>'),
};
export const iconoTipo = (t: string) => ICONO_TIPO[t] ?? ICONO_TIPO.otro;

/** Ícono monocromo del tipo; si hay foto, su miniatura encima (el ícono queda si la foto no carga). */
function visualHtml(i: Incidente, cls: string) {
  const f = i.fotos[0];
  return `<span class="${cls}${f ? ' con-foto' : ''}" aria-hidden="true">${iconoTipo(i.tipo)}${f ? `<img decoding="async" alt="" data-foto="${esc(f)}">` : ''}</span>`;
}

/** «2 vecinos · 1 foto · primer reporte 21:03» con rodillo en los números que acaban de subir. */
export function contadorHtml(i: Incidente, antes: Ctx['antes']) {
  return `<b class="mon-k-personas">${rodillo(i.personas, antes?.personas, 'vecino', 'vecinos')}</b> · <b class="mon-k-fotos">${rodillo(i.nFotos, antes?.fotos, 'foto', 'fotos')}</b> · primer reporte ${esc(hhmm(i.primer))}`;
}

/** Pie de la página del monitoreo: el aviso legal va aquí, una sola vez (no se repite en tarjetas ni en el detalle). */
export const pieMonitoreoHtml = () => `<b>${esc(ROTULO_VECINAL)}</b> · ${esc(PIE_LEGAL)} ${esc(PIE_PANEL)}`;

export function filaHtml(i: Incidente, ctx: Pick<Ctx, 'antes' | 'ahora'>, actual: boolean) {
  const abiertoVida = vida(i) && !cerrado(i);
  return `<li data-id="${esc(i.id)}" data-estado="${i.estado}" data-tono="${tono(i)}" class="${vida(i) ? 'vida' : ''}${actual ? ' actual' : ''}${cerrado(i) ? ' cerrado' : ''}">
    <button type="button" class="mon-item" aria-current="${actual}">${visualHtml(i, 'mon-i-vis')}<span class="mon-i-tipo">${esc(tipoTxt(i.tipo))}</span>
      <span class="mon-i-hace" data-recibido="${i.recibido ?? i.ultimo}">${esc(hace(i, ctx.ahora))}</span>
      <span class="mon-i-cont${ctx.antes ? ' sube' : ''}">${contadorHtml(i, ctx.antes)}</span>
      <span class="mon-i-meta"><span class="${claseEstado(i)}">${esc(chipEstado(i))}</span> <span class="mon-conf mon-conf-${i.nivel}">${esc(respaldoTxt(i.puntaje, i.nivel))}</span>${abiertoVida ? ' <span class="mon-chip-vida">Riesgo de vida</span>' : ''}</span></button></li>`;
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
  if (!i.fotos.length && !faltan) return ''; // sin fotos no se muestra nada
  const extra = Math.max(0, i.fotos.length - max);
  return `<div class="mon-galeria">${i.fotos.slice(0, max).map((f, k) => `<button type="button" class="muni-foto" data-k="${k}" aria-label="Ver foto ${k + 1} de ${i.fotos.length}"><img data-foto="${esc(f)}" alt="Foto ${k + 1} enviada por un vecino"></button>`).join('')}
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
  return `<div class="mon-t-cab">${visualHtml(i, 'mon-t-vis')}
      <div class="mon-t-tit"><h2 class="mon-t-tipo">${esc(tipoTxt(i.tipo))}</h2>
        <div class="mon-t-sub">${chipCab(i)}<span class="mon-t-hace" data-recibido="${i.recibido ?? i.ultimo}">${esc(hace(i, ctx.ahora))}</span></div></div>
      <button type="button" class="mon-cerrar" data-cerrar-tarjeta aria-label="Cerrar tarjeta">×</button></div>
    ${otros.length ? `<p class="mon-t-otros">También reportan: ${esc(otros.map(tipoTxt).join(', '))}</p>` : ''}
    ${vida(i) ? `<p class="mon-vida">${esc(VIDA_PANEL).replace(/\b(116|105)\b/g, '<b>$1</b>')}</p>` : ''}
    <p class="mon-t-cont${ctx.antes ? ' sube' : ''}">${contadorHtml(i, ctx.antes)}</p>
    <p class="mon-t-resp"><span class="mon-conf mon-conf-${i.nivel}">${esc(respaldoTxt(i.puntaje, i.nivel))}</span>${i.congelado ? ' · congelado al validar' : ''}</p>
    ${galeriaHtml(i, 4)}
    ${avisosHtml(i)}
    ${accionesHtml(i, ctx)}`;
}

/** Detalle completo en la pestaña Incidentes: datos, desglose, galería, notas, historial y acciones. */
export function detalleHtml(i: Incidente, ctx: Ctx) {
  const hist = [...i.historial].reverse();
  return `<h3><span class="mon-d-tit"><span class="mon-d-ic" aria-hidden="true">${iconoTipo(i.tipo)}</span><span>${esc(tipoTxt(i.tipo))}</span></span><button type="button" class="mon-cerrar" data-cerrar-detalle aria-label="Volver a la lista">×</button></h3>
    <div class="cuerpo">
      <p class="mon-d-tags">${chipCab(i)}</p>
      ${vida(i) ? `<p class="mon-vida">${esc(VIDA_PANEL)}</p>` : ''}
      <p class="mon-t-cont${ctx.antes ? ' sube' : ''}">${contadorHtml(i, ctx.antes)}</p>
      <dl class="v3d-dl">
        <dt>Respaldo</dt><dd><span class="mon-conf mon-conf-${i.nivel}">${esc(respaldoTxt(i.puntaje, i.nivel))}</span>${i.congelado ? ' <small>congelado al validar</small>' : ''}${i.desglose ? `<small class="mon-desglose">${desgloseHtml(i.desglose, i.puntaje)}</small>` : ''}</dd>
        <dt>Reportes</dt><dd>${esc(plural(i.reportes, 'reporte', 'reportes'))} de ${esc(vecinos(i.personas))}</dd>
        ${i.porCadena ? `<dt>Por la cadena</dt><dd>${esc(plural(i.porCadena, 'reporte llegó', 'reportes llegaron'))} desde otro celular (relevo por QR)</dd>` : ''}
        <dt>Severidad</dt><dd class="mon-sev${i.severidad}">Máx. ${i.severidad} de 3 <small>la marca quien reporta</small></dd>
        <dt>Último</dt><dd>${esc(hhmm(i.ultimo))} <small>reloj del celular</small></dd>
        <dt>Ubicación</dt><dd class="mono">${i.lat.toFixed(5)}, ${i.lon.toFixed(5)}</dd>
      </dl>
      ${galeriaHtml(i)}
      ${i.notas.length ? `<ul class="mon-notas">${i.notas.slice(-4).map((n) => `<li>«${esc(n)}»</li>`).join('')}</ul>` : ''}
      ${avisosHtml(i)}
      ${accionesHtml(i, ctx)}
      <h4 class="mon-h4">Historial de estados</h4>
      <ol class="mon-hist">${hist.length ? hist.map((c) => `<li data-estado="${c.estado}"><b>${esc(estadoChip(c.estado, c.accion))}</b>${c.motivo && c.estado === 'descartado' ? ` · ${esc(c.motivo)}` : ''}<br><small>${c.quien ? esc(c.quien) + ' · ' : ''}${Number.isFinite(c.cuando) ? esc(hhmm(c.cuando, true)) : ''}</small></li>`).join('') : '<li><small>Sin cambios: aún nadie lo revisó.</small></li>'}</ol>
    </div>`;
}
