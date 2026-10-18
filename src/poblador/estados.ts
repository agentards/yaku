// Estado de vuelta de cada reporte («Recibido por la municipalidad», «Atendido»…): lo baja GET /api/estado?ids=
// (servidor local de WP1) y viaja de celular a celular en un código «YE1:» dentro de «Intercambiar», así quien
// reportó se entera aunque siga sin red. Sin DOM: se prueba en Node.
import { deflateRaw, inflateRaw } from 'pako';
import { base45Decode, base45Encode, crc32 } from '../codec';
import { ACCIONES, ESTADO, ESTADO_DETALLE, type Accion } from './textos';

export const ESTADOS = ['nuevo', 'en_revision', 'validado', 'descartado', 'accion', 'atendido'] as const;
export type Estado = (typeof ESTADOS)[number];

export interface EstadoReporte {
  id: string;        // id del reporte (hash del contenido)
  estado: Estado;
  accion?: Accion;
  motivo?: string;   // solo descartado; no viaja por QR
  at: number;        // ms del último cambio (0 si el servidor no lo dio)
  personas?: number; // personas distintas del incidente, si el servidor lo da
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (s: unknown) => sinTildes(String(s ?? '')).trim().toLowerCase().replace(/[\s-]+/g, '_');

function normEstado(s: unknown, accion?: Accion): Estado | null {
  const k = clave(s);
  if (!k) return accion ? 'accion' : null;
  if ((ESTADOS as readonly string[]).includes(k)) return k === 'validado' && accion ? 'accion' : (k as Estado);
  if (k.startsWith('accion') || k === 'asignado' || k === 'accion_asignada') return 'accion';
  if (k.includes('revision') || k === 'recibido') return 'en_revision';
  if (k.startsWith('descart')) return 'descartado';
  if (k.startsWith('atendid') || k === 'cerrado') return 'atendido';
  if (k.startsWith('valid')) return accion ? 'accion' : 'validado';
  return null;
}
function normAccion(s: unknown): Accion | undefined {
  const k = clave(s);
  if (!k) return undefined;
  if (k.includes('edan') || k.startsWith('evaluacion')) return 'edan';
  return (ACCIONES as readonly string[]).find((a) => k.startsWith(a)) as Accion | undefined;
}
function normHora(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string' && v) { const t = Date.parse(v); return Number.isFinite(t) ? t : 0; }
  return 0;
}

/** Lee una fila suelta del servidor (nombres tolerantes: el contrato exacto lo fija WP1). */
export function leerEstado(id: string, x: any): EstadoReporte | null {
  if (!x || typeof x !== 'object') return typeof x === 'string' ? leerEstado(id, { estado: x }) : null;
  const accion = normAccion(x.accion ?? x.action ?? x.accion_asignada);
  const estado = normEstado(x.estado ?? x.state ?? x.status, accion);
  if (!estado) return null;
  if (x.recibido === false) return null; // el servidor aún no tiene el reporte
  const at = normHora(x.at ?? x.actualizado ?? x.updated_at ?? x.cambiado_en ?? x.cuando ?? x.ts ?? x.recibido_at);
  const personas = Number(x.personas ?? x.dispositivos ?? x.devices);
  const motivo = estado === 'descartado' && x.motivo ? String(x.motivo).slice(0, 120) : undefined;
  return { id, estado, ...(accion && estado === 'accion' ? { accion } : {}), ...(motivo ? { motivo } : {}), at, ...(personas > 0 ? { personas } : {}) };
}

/** Acepta {estados:{id:{…}}}, {estados:[{id,…}]}, [{id,…}] o {id:{…}}. Ignora lo que no entiende. */
export function leerRespuestaEstados(j: any): EstadoReporte[] {
  const raiz = j && typeof j === 'object' && !Array.isArray(j) && (j.estados ?? j.reportes ?? j.reports ?? j.items) !== undefined
    ? (j.estados ?? j.reportes ?? j.reports ?? j.items) : j;
  const filas: [string, any][] = Array.isArray(raiz)
    ? raiz.filter((x) => x && typeof x.id === 'string').map((x) => [x.id, x])
    : raiz && typeof raiz === 'object' ? Object.entries(raiz) : [];
  return filas.map(([id, x]) => leerEstado(id, x)).filter((e): e is EstadoReporte => !!e);
}

/** El más reciente gana; a igual hora, el más avanzado en el flujo. */
export function masReciente(a: EstadoReporte | undefined, b: EstadoReporte): EstadoReporte {
  if (!a) return b;
  if (b.at !== a.at) return b.at > a.at ? b : a;
  return ESTADOS.indexOf(b.estado) >= ESTADOS.indexOf(a.estado) ? b : a;
}

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Lima' });

export type NivelEstado = 'local' | 'enviado' | 'revision' | 'validado' | 'accion' | 'atendido' | 'descartado';
/**
 * Qué ve el vecino. chip = estado municipal (si existe, reemplaza al rótulo vecinal); detalle = una línea más.
 * synced = el reporte ya llegó al servidor (desde este u otro celular).
 */
export function textoEstado(e: EstadoReporte | undefined, synced: boolean): { chip: string | null; detalle: string; nivel: NivelEstado } {
  const h = e?.at ? ` · ${hhmm(e.at)}` : '';
  if (!e) return synced ? { chip: null, detalle: ESTADO_DETALLE.enviado, nivel: 'enviado' } : { chip: null, detalle: ESTADO_DETALLE.local, nivel: 'local' };
  switch (e.estado) {
    case 'nuevo': return { chip: null, detalle: ESTADO_DETALLE.nuevo(h), nivel: 'enviado' };
    case 'en_revision': return { chip: ESTADO.en_revision, detalle: ESTADO_DETALLE.en_revision(h), nivel: 'revision' };
    case 'validado': return { chip: ESTADO.validado, detalle: ESTADO_DETALLE.validado(h), nivel: 'validado' };
    case 'accion': return { chip: ESTADO.accion(e.accion), detalle: ESTADO_DETALLE.accion(h), nivel: 'accion' };
    case 'atendido': return { chip: ESTADO.atendido, detalle: ESTADO_DETALLE.atendido(h), nivel: 'atendido' };
    case 'descartado': return { chip: ESTADO.descartado, detalle: ESTADO_DETALLE.descartado(e.motivo ?? '', h), nivel: 'descartado' };
  }
}

// ---- relevo del estado por QR: "YE1:<crc36>:<base45(deflate(JSON))>" (todo en el alfabeto alfanumérico del QR) ----
// Fila: [id, índice de estado, índice de acción o -1, minutos epoch]. 25 filas ≈ 400 caracteres: un solo QR.
export const MAX_ESTADOS_QR = 25;
type FilaQR = [string, number, number, number];

export function codificarEstadosQR(xs: EstadoReporte[]): string | null {
  const filas: FilaQR[] = [...xs].sort((a, b) => b.at - a.at).slice(0, MAX_ESTADOS_QR)
    .map((e) => [e.id, ESTADOS.indexOf(e.estado), e.accion ? ACCIONES.indexOf(e.accion) : -1, Math.round(e.at / 60000)]);
  if (!filas.length) return null;
  const z = deflateRaw(new TextEncoder().encode(JSON.stringify([1, filas])), { level: 9 });
  return `YE1:${crc32(z).toString(36).toUpperCase()}:${base45Encode(z)}`;
}

export const esCodigoEstados = (s: string) => s.startsWith('YE1:');

export function decodificarEstadosQR(s: string): EstadoReporte[] {
  const m = /^YE1:([0-9A-Z]+):([0-9A-Z $%*+\-./:]+)$/.exec(s.replace(/[\r\n]+$/, ''));
  if (!m) throw new Error('no es un código de estados');
  const z = base45Decode(m[2]);
  if (crc32(z) !== parseInt(m[1], 36)) throw new Error('checksum CRC32 inválido');
  const j = JSON.parse(new TextDecoder().decode(inflateRaw(z)));
  if (!Array.isArray(j) || j[0] !== 1 || !Array.isArray(j[1])) throw new Error('formato desconocido');
  return (j[1] as FilaQR[]).flatMap(([id, ei, ai, min]) => {
    const estado = ESTADOS[ei];
    if (typeof id !== 'string' || !/^[0-9a-z]{6,16}$/.test(id) || !estado) return [];
    const accion = ai >= 0 ? ACCIONES[ai] : undefined;
    return [{ id, estado, ...(accion ? { accion } : {}), at: (Number(min) || 0) * 60000 } as EstadoReporte];
  });
}
