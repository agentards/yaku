// «Estoy bien»: un mensaje corto de un vecino a su familia («Hola, soy Rosa. Si leen esto: estoy bien»). Viaja igual
// que los reportes: se guarda en el celular sin red, pasa de celular en celular por QR («Intercambiar», códigos YB1:)
// y sube al servidor cuando cualquier celular de la cadena tiene internet; ahí la familia lo busca por nombre
// (yaku.lat/estoy-bien). Sin GPS ni teléfono: solo nombre, para quién, mensaje y una zona aproximada que escribe la
// persona. El id es un hash del contenido (el servidor lo recalcula): el mismo mensaje por varios caminos se guarda
// una vez y nadie puede cambiar el texto sin que cambie el id. Sin DOM: se prueba en Node.
import { deflateRaw, inflateRaw } from 'pako';
import { base45Decode, base45Encode, crc32 } from '../codec';

export interface CartaNueva { nombre: string; para: string; mensaje: string; zona: string; ts: number; deviceId: string }
export interface Carta extends CartaNueva { id: string }
export interface CartaGuardada extends Carta {
  /** local = la escribí yo; qr = me la pasó otro vecino; red = la encontré en el servidor. */
  via: 'local' | 'qr' | 'red';
  synced: boolean;
  recibidoAt: number;
}

export const LIMITES = { nombre: 40, para: 40, mensaje: 200, zona: 40 } as const;
/** Sin saltos de línea, sin «|» (separador del texto canónico) y sin espacios de sobra. */
export const limpiar = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const canonico = (c: CartaNueva) => ['YB1', c.nombre, c.para, c.mensaje, c.zona, String(c.ts), c.deviceId].join('|');

export async function idCarta(c: CartaNueva): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonico(c))));
  return [...h.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const DISPOSITIVO = /^[0-9a-z]{1,16}$/;
/** Arma una carta nueva desde el formulario. Error en español si falta algo. */
export async function crearCarta(x: { nombre: unknown; para?: unknown; mensaje: unknown; zona?: unknown; ts: number; deviceId: string }): Promise<Carta> {
  const c: CartaNueva = {
    nombre: limpiar(x.nombre, LIMITES.nombre), para: limpiar(x.para, LIMITES.para), mensaje: limpiar(x.mensaje, LIMITES.mensaje),
    zona: limpiar(x.zona, LIMITES.zona), ts: Math.floor(x.ts), deviceId: x.deviceId,
  };
  if (c.nombre.length < 2) throw new Error('Escribe tu nombre: así te encuentra tu familia.');
  if (!c.mensaje) throw new Error('Escribe un mensaje corto para tu familia.');
  if (!DISPOSITIVO.test(c.deviceId)) throw new Error('código de celular inválido');
  return { ...c, id: await idCarta(c) };
}

/** Valida la forma (del servidor o del QR). No recalcula el id: eso es verificarId. */
export function leerCarta(x: any): Carta | null {
  if (!x || typeof x !== 'object') return null;
  const c: Carta = { id: String(x.id ?? ''), nombre: String(x.nombre ?? ''), para: String(x.para ?? ''), mensaje: String(x.mensaje ?? ''), zona: String(x.zona ?? ''), ts: Number(x.ts), deviceId: String(x.deviceId ?? x.device_id ?? '') };
  if (!/^[0-9a-f]{12}$/.test(c.id) || !DISPOSITIVO.test(c.deviceId) || !Number.isInteger(c.ts) || c.ts < 1.5e9 || c.ts > 4e9) return null;
  for (const k of ['nombre', 'para', 'mensaje', 'zona'] as const) if (limpiar(c[k], LIMITES[k]) !== c[k]) return null;
  if (c.nombre.length < 2 || !c.mensaje) return null;
  return c;
}
export const verificarId = async (c: Carta) => (await idCarta(c)) === c.id;

// ---- relevo por QR: "YB1:<crc36>:<base45(deflate(JSON))>", varias cartas por código hasta ~600 caracteres ----
export const MAX_CARTAS_QR = 8;
const MAX_CARACTERES = 600;
const VIGENCIA_S = 7 * 86_400;
type FilaQR = [string, string, string, string, string, number, string];
const fila = (c: Carta): FilaQR => [c.id, c.nombre, c.para, c.mensaje, c.zona, c.ts, c.deviceId];
const codificar = (cs: Carta[]) => {
  const z = deflateRaw(new TextEncoder().encode(JSON.stringify([1, cs.map(fila)])), { level: 9 });
  return `YB1:${crc32(z).toString(36).toUpperCase()}:${base45Encode(z)}`;
};
export function codificarCartasQR(cs: Carta[]): string[] {
  const out: string[] = [];
  let grupo: Carta[] = [];
  for (const c of cs) {
    if (grupo.length && codificar([...grupo, c]).length > MAX_CARACTERES) { out.push(codificar(grupo)); grupo = []; }
    grupo.push(c);
  }
  if (grupo.length) out.push(codificar(grupo));
  return out;
}
export const esCodigoCartas = (s: string) => s.startsWith('YB1:');
export function decodificarCartasQR(s: string): Carta[] {
  const m = /^YB1:([0-9A-Z]+):([0-9A-Z $%*+\-./:]+)$/.exec(s.replace(/[\r\n]+$/, ''));
  if (!m) throw new Error('no es un código de «Estoy bien»');
  const z = base45Decode(m[2]);
  if (crc32(z) !== parseInt(m[1], 36)) throw new Error('checksum CRC32 inválido');
  const j = JSON.parse(new TextDecoder().decode(inflateRaw(z)));
  if (!Array.isArray(j) || j[0] !== 1 || !Array.isArray(j[1])) throw new Error('formato desconocido');
  return (j[1] as FilaQR[]).map(([id, nombre, para, mensaje, zona, ts, deviceId]) => leerCarta({ id, nombre, para, mensaje, zona, ts, deviceId })).filter((c): c is Carta => !!c);
}

/** Las que este celular pasa por QR: primero las suyas, luego las más recientes; de la última semana; máximo 8. */
export function cartasParaQR(cs: CartaGuardada[], ahoraS = Date.now() / 1000): Carta[] {
  return cs.filter((c) => ahoraS - c.ts <= VIGENCIA_S)
    .sort((a, b) => Number(b.via === 'local') - Number(a.via === 'local') || b.ts - a.ts)
    .slice(0, MAX_CARTAS_QR)
    .map(({ id, nombre, para, mensaje, zona, ts, deviceId }) => ({ id, nombre, para, mensaje, zona, ts, deviceId }));
}

/** Búsqueda por nombre (de quien escribe o de para quién es), sin tildes ni mayúsculas. Mínimo 3 letras. */
export function buscarCartas<T extends Carta>(cs: T[], q: string): T[] {
  const k = sinTildes(limpiar(q, 40));
  if (k.length < 3) return [];
  return cs.filter((c) => sinTildes(`${c.nombre} ${c.para}`).includes(k)).sort((a, b) => b.ts - a.ts);
}

const cuando = (s: number) => new Date(s * 1000).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Lima' });
/** Lo que ve quien la encuentra. */
export function textoCarta(c: CartaGuardada): { titulo: string; detalle: string; origen: string } {
  return {
    titulo: `💚 ${c.nombre} está bien`,
    detalle: [c.para ? `Para ${c.para}` : '', c.zona, cuando(c.ts)].filter(Boolean).join(' · '),
    origen: `Lo escribió quien firma; la municipalidad no lo verifica${c.via === 'qr' ? ' · te lo pasó otro vecino' : c.via === 'red' ? ' · encontrado en internet' : ''}`,
  };
}
