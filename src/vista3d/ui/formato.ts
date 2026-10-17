// Textos del HUD y del panel (puros, testeables). Lenguaje del HANDOFF: «sin cobertura garantizada según
// OSIPTEL», «centros poblados del escenario CENEPRED», fichas siempre NO VERIFICADO.
import type { CentroPoblado } from './contrato';
import type { Ficha } from './datos';
import { OFFICIAL_LAYERS } from '../../layers';
import { ESCENARIO_FIRMA, fechaCorta, ventanaSenamhi } from './tiempo';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Miles con punto y decimales con coma (como en las cifras del HANDOFF: 1.255). */
export function num(n: number, dec = 0) {
  const [e, d] = Math.abs(n).toFixed(dec).split('.');
  return (n < 0 ? '−' : '') + e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : '');
}

function gms(v: number) {
  const a = Math.abs(v), g = Math.floor(a), mf = (a - g) * 60, m = Math.floor(mf), s = Math.round((mf - m) * 60);
  return s === 60 ? `${g}°${String(m + 1).padStart(2, '0')}′00″` : `${g}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″`;
}
/** 4°29′38″S 79°46′29″O */
export const dms = (lat: number, lon: number) => `${gms(lat)}${lat < 0 ? 'S' : 'N'} ${gms(lon)}${lon < 0 ? 'O' : 'E'}`;

export const altitudTxt = (m: number | null) => (m === null || !Number.isFinite(m) ? '—' : `${num(Math.round(m))} m s.n.m.`);

export function coberturaTxt(cp: Pick<CentroPoblado, 'cg' | 'g4'>) {
  if (cp.cg === null) return { corto: 'SIN DATO OSIPTEL', largo: 'Sin dato OSIPTEL (el centro poblado no figura en el registro)', clase: 'sindato' };
  if (cp.cg === false) return { corto: 'SIN COBERTURA GARANTIZADA', largo: 'Sin cobertura garantizada según OSIPTEL (declarada por operadoras)', clase: 'sincob' };
  return { corto: cp.g4 ? 'COBERTURA GARANTIZADA · 4G' : 'COBERTURA GARANTIZADA', largo: `Con cobertura garantizada según OSIPTEL (declarada por operadoras)${cp.g4 ? ', 4G sí' : ', 4G no'}`, clase: 'concob' };
}

/** Estado del centro poblado según las fichas recibidas hasta el cabezal. */
export const estadoCentro = (nFichas: number) =>
  nFichas > 0 ? { txt: 'Con registro recibido, no verificado', clase: 'conficha' } : { txt: 'Sin ficha de evaluación', clase: 'sinficha' };

export const FUENTE_CENTRO = 'CENEPRED/SIGRID 23077 (Aviso 421), firmado 16/10/2026 · ubicación IGN · cobertura OSIPTEL 2025-IV';

// ---------- C1: estado de red y cola de sincronización ----------
/** Cola de sync de ESTE equipo: fichas reales de IndexedDB con synced=false. Las SIMULADAS nunca cuentan. */
export function colaSync(fichas: Pick<Ficha, 'synced' | 'simulado'>[]) {
  const n = fichas.filter((f) => !f.synced && !f.simulado).length;
  return { n, txt: n === 0 ? 'Sincronizado ✓' : `${num(n)} ficha${n > 1 ? 's' : ''} pendiente${n > 1 ? 's' : ''} de sincronizar` };
}
/** Banda de red: «SIN RED · trabajando con datos guardados en este equipo (escenario CENEPRED del 16/10/2026)». */
export const bandaSinRedTxt = () => `trabajando con datos guardados en este equipo (escenario CENEPRED del ${fechaCorta(ESCENARIO_FIRMA)})`;

// ---------- C2: fuente del escenario y lectura del nivel ----------
const cenepred = OFFICIAL_LAYERS.find((l) => l.id === 'cenepred');
const senamhiCapa = OFFICIAL_LAYERS.find((l) => l.id === 'senamhi')!;
/** Fecha de descarga de los geoservicios, tal como la declara layers.ts («Descargado 17/10/2026»). */
const DESCARGA = senamhiCapa.fecha.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? '';
export const FUENTE_CHIP = `Fuente: CENEPRED/SIGRID 23077 · ${fechaCorta(ESCENARIO_FIRMA)}`;
export const NIVEL_REFERENCIAL = 'Nivel referencial del escenario: no es pronóstico ni alerta';
/** Niveles de exposición a inundaciones del Excel CENEPRED, con los colores de la capa cenepred-ccpp (src/map.ts). */
export const LEYENDA_NIVELES = [
  { r: 5, niv: 'Muy alto', color: '#0b2f4e', claro: 'la exposición más alta que da el escenario' },
  { r: 4, niv: 'Alto', color: '#1f5a87', claro: 'exposición alta' },
  { r: 3, niv: 'Medio', color: '#4f86b0', claro: 'exposición media' },
  { r: 2, niv: 'Bajo', color: '#86afcc', claro: 'exposición baja' },
  { r: 1, niv: 'Muy bajo', color: '#b4cbdc', claro: 'la exposición más baja' },
] as const;
/** Filas de la ficha de fuente. Solo textos y fechas que ya están en layers.ts, tiempo.ts y este archivo. */
export function fichaFuente(now = Date.now()) {
  const v = ventanaSenamhi(now);
  return [
    { k: 'Título', v: cenepred?.titulo ?? 'Escenario de riesgo CENEPRED/SIGRID 23077 (Aviso 421)' },
    { k: 'Origen', v: cenepred?.fuente ?? 'CENEPRED/SIGRID' },
    { k: 'Firmado', v: `${fechaCorta(ESCENARIO_FIRMA)} · vigencia 17–19/10/2026` },
    { k: 'Descargado', v: `Geoservicios SENAMHI e INDECI: ${DESCARGA}. Anexo Excel CENEPRED: descargado a mano desde Perú e incorporado el ${DESCARGA}` },
    { k: 'Ubicación', v: 'IGN, Dataset Centros Poblados: 930 de 1.255 con punto IGN (317 aproximados con OSIPTEL, 8 sin ubicar)' },
    { k: 'Cobertura', v: 'OSIPTEL, cobertura móvil por centro poblado, datos abiertos, información 2025-IV (ODC-By). Declarada por operadoras, no medida en campo' },
    { k: 'Pronóstico', v: `${v.etiqueta}. ${senamhiCapa.fecha}`, senamhi: true },
  ];
}

/** Rumbo 0..359 para el HUD. */
export const rumbo = (b: number) => String(Math.round(((b % 360) + 360) % 360)).padStart(3, '0') + '°';
