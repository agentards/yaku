// Avisos de la municipalidad en el celular: la respuesta a un incidente («Provisiones asignadas», «Atendido»…) la
// baja cualquier celular con internet (GET /api/avisos) y viaja de celular en celular dentro de «Intercambiar», un
// aviso por código «YA1:», hasta los que no tienen red. Cada aviso trae la firma ECDSA P-256 del servidor
// (servidor-local/avisos.ts) y el celular la verifica con la clave pública que guardó la última vez que tuvo red:
// nadie puede inventar un aviso «de la municipalidad» dentro de la cadena. Sin DOM: se prueba en Node.
import { deflateRaw, inflateRaw } from 'pako';
import { base45Decode, base45Encode, crc32 } from '../codec';
import { ACCION_TXT } from './textos';

export const ACCIONES_AVISO = ['rescate', 'bomberos', 'provisiones', 'maquinaria', 'edan', 'atendido'] as const;
export type AccionAviso = (typeof ACCIONES_AVISO)[number];

export interface Aviso {
  id: string; incidente: string; accion: AccionAviso; tipo: string;
  lat: number; lon: number; min: number; texto: string; firma: string;
}
export interface AvisoGuardado extends Aviso {
  /** true si la firma coincide con la clave de la municipalidad que este celular tiene guardada. */
  verificado: boolean;
  via: 'red' | 'qr';
  recibidoAt: number;
}

/** Mismo texto canónico que firma el servidor. */
export const canonico = (a: Omit<Aviso, 'firma'>) => ['YA1', a.id, a.incidente, a.accion, a.tipo, a.lat.toFixed(4), a.lon.toFixed(4), String(a.min), a.texto].join('|');

const ID = /^[0-9a-f]{12}$/, INC = /^inc-[0-9a-z]{11}(-[0-9a-z]{1,8})?$/, TIPO = /^[a-z_]{2,16}$/, FIRMA = /^[A-Za-z0-9_-]{80,100}$/;

/** Valida la forma de un aviso (del servidor o del QR). No verifica la firma. */
export function leerAviso(x: any): Aviso | null {
  if (!x || typeof x !== 'object') return null;
  const a: Aviso = {
    id: String(x.id ?? ''), incidente: String(x.incidente ?? ''), accion: x.accion, tipo: String(x.tipo ?? ''),
    lat: Number(x.lat), lon: Number(x.lon), min: Number(x.min), texto: String(x.texto ?? '').slice(0, 120), firma: String(x.firma ?? ''),
  };
  if (!ID.test(a.id) || !INC.test(a.incidente) || !(ACCIONES_AVISO as readonly string[]).includes(a.accion) || !TIPO.test(a.tipo)) return null;
  if (!(Math.abs(a.lat) <= 90 && Math.abs(a.lon) <= 180) || !Number.isInteger(a.min) || a.min <= 0 || !FIRMA.test(a.firma)) return null;
  return a;
}

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

/** true solo si la firma es de la clave de la municipalidad. Cualquier error (clave rara, firma mala) = false. */
export async function verificarAviso(a: Aviso, clave: JsonWebKey | null | undefined): Promise<boolean> {
  if (!clave || clave.kty !== 'EC' || clave.crv !== 'P-256') return false;
  try {
    const k = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: clave.x, y: clave.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, b64url(a.firma), new TextEncoder().encode(canonico(a)));
  } catch { return false; }
}

// ---- relevo por QR: "YA1:<crc36>:<base45(deflate(JSON))>", un aviso por código (~300 caracteres) ----
export const MAX_AVISOS_QR = 5;
export const VIGENCIA_QR_MS = 72 * 3_600_000;

export function codificarAvisoQR(a: Aviso): string {
  const fila = [1, a.id, a.incidente, ACCIONES_AVISO.indexOf(a.accion), a.tipo, Math.round(a.lat * 1e4), Math.round(a.lon * 1e4), a.min, a.texto, a.firma];
  const z = deflateRaw(new TextEncoder().encode(JSON.stringify(fila)), { level: 9 });
  return `YA1:${crc32(z).toString(36).toUpperCase()}:${base45Encode(z)}`;
}
export const esCodigoAviso = (s: string) => s.startsWith('YA1:');

export function decodificarAvisoQR(s: string): Aviso {
  const m = /^YA1:([0-9A-Z]+):([0-9A-Z $%*+\-./:]+)$/.exec(s.replace(/[\r\n]+$/, ''));
  if (!m) throw new Error('no es un código de aviso');
  const z = base45Decode(m[2]);
  if (crc32(z) !== parseInt(m[1], 36)) throw new Error('checksum CRC32 inválido');
  const j = JSON.parse(new TextDecoder().decode(inflateRaw(z)));
  if (!Array.isArray(j) || j[0] !== 1) throw new Error('formato desconocido');
  const [, id, incidente, ai, tipo, lat, lon, min, texto, firma] = j;
  const a = leerAviso({ id, incidente, accion: ACCIONES_AVISO[ai], tipo, lat: Number(lat) / 1e4, lon: Number(lon) / 1e4, min, texto, firma });
  if (!a) throw new Error('aviso inválido');
  return a;
}

/** Los avisos que este celular pasa por QR: verificados, de las últimas 72 h, los más recientes primero. */
export function avisosParaQR(xs: AvisoGuardado[], ahora = Date.now()): AvisoGuardado[] {
  return xs.filter((a) => a.verificado && ahora - a.min * 60000 <= VIGENCIA_QR_MS).sort((a, b) => b.min - a.min).slice(0, MAX_AVISOS_QR);
}

// Mismo texto que el estado del reporte (textos.ts): «asignado», nunca «en camino». Yaku solo sabe que la
// municipalidad asignó la acción, no si el equipo ya salió.
const TITULO: Record<AccionAviso, string> = { ...ACCION_TXT, atendido: 'Incidente atendido' };
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Lima' });

/** Lo que ve el vecino. `tipoTxt` traduce el tipo del incidente (casa dañada, agua…). */
export function textoAviso(a: AvisoGuardado, tipoTxt: (t: string) => string): { titulo: string; detalle: string; origen: string } {
  return {
    titulo: TITULO[a.accion],
    detalle: [`${tipoTxt(a.tipo)} · ${hhmm(a.min * 60000)}`, a.texto].filter(Boolean).join(' · '),
    origen: `${a.verificado ? 'Firmado por la municipalidad ✓' : 'Firma sin verificar: abre la app con internet una vez'}${a.via === 'qr' ? ' · te lo pasó otro vecino' : ''}`,
  };
}
