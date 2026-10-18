// «Estoy bien» en el servidor: valida la carta como lo hace el celular (src/poblador/cartas.ts) y recalcula su id,
// que es un hash del contenido: si alguien cambia el texto en la cadena, el id ya no coincide y se rechaza.
import { createHash } from 'node:crypto';

export interface Carta { id: string; nombre: string; para: string; mensaje: string; zona: string; ts: number; deviceId: string }
export const LIMITES = { nombre: 40, para: 40, mensaje: 200, zona: 40 } as const;
export const limpiar = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const canonico = (c: Omit<Carta, 'id'>) => ['YB1', c.nombre, c.para, c.mensaje, c.zona, String(c.ts), c.deviceId].join('|');
export const idCarta = (c: Omit<Carta, 'id'>) => createHash('sha256').update(canonico(c)).digest('hex').slice(0, 12);

/** La carta tal como llegó, o el motivo del rechazo. */
export function validarCarta(x: any, ahoraMs: number): { ok: true; c: Carta } | { ok: false; why: string } {
  if (!x || typeof x !== 'object') return { ok: false, why: 'no es objeto' };
  const c: Carta = { id: String(x.id ?? ''), nombre: String(x.nombre ?? ''), para: String(x.para ?? ''), mensaje: String(x.mensaje ?? ''), zona: String(x.zona ?? ''), ts: Number(x.ts), deviceId: String(x.deviceId ?? '') };
  for (const k of ['nombre', 'para', 'mensaje', 'zona'] as const) if (limpiar(c[k], LIMITES[k]) !== c[k]) return { ok: false, why: `${k} con formato inválido o muy largo` };
  if (c.nombre.length < 2 || !c.mensaje) return { ok: false, why: 'falta nombre o mensaje' };
  if (!/^[0-9a-z]{1,16}$/.test(c.deviceId)) return { ok: false, why: 'deviceId' };
  if (!Number.isInteger(c.ts) || c.ts < 1.5e9 || c.ts * 1000 > ahoraMs + 3_600_000) return { ok: false, why: 'ts' };
  if (idCarta(c) !== c.id) return { ok: false, why: 'id no coincide con contenido' };
  return { ok: true, c };
}
