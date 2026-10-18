// Red de la pantalla de la municipalidad: SIEMPRE el mismo origen (/api del servidor local, servidor-local/).
// En `vite dev`/`preview` el proxy de vite.config.ts decide a dónde va /api (local por defecto; producción solo
// con YAKU_API=produccion y en solo lectura). Contrato: ./CONTRATO-API.md.
import { leerRespuesta } from './deteccion';
import { agrupar, leerIncidentes, pasosHasta, type Incidente } from './incidentes';
import type { Accion, Estado } from './textos';

export type Fuente = 'incidentes' | 'agrupado-en-pantalla';
export class ErrorApi extends Error { constructor(readonly status: number, msg: string) { super(msg); } }

const json = async (res: Response) => { if (!res.ok) throw new ErrorApi(res.status, 'HTTP ' + res.status); return res.json(); };
const GET = (url: string, signal?: AbortSignal) => fetch(url, { method: 'GET', cache: 'no-store', headers: { accept: 'application/json' }, signal });

export const fotoUrl = (id: string) => `/api/fotos/${encodeURIComponent(id)}`;

/**
 * GET /api/incidentes. Si el servidor no lo tiene (404: servidor de producción actual), agrupa /api/reports en esta
 * pantalla (solo lectura, sin acciones). Devuelve null en el cuerpo si la respuesta no tiene la forma esperada.
 */
export async function traerIncidentes(signal?: AbortSignal, fuente: Fuente = 'incidentes'): Promise<{ fuente: Fuente; lista: Incidente[] }> {
  if (fuente === 'incidentes') {
    const res = await GET('/api/incidentes', signal);
    if (res.status !== 404) {
      const lista = leerIncidentes(await json(res));
      if (!lista) throw new ErrorApi(0, 'respuesta inesperada de /api/incidentes');
      return { fuente, lista };
    }
  }
  const filas = leerRespuesta(await json(await GET('/api/reports?limit=200', signal)));
  if (!filas) throw new ErrorApi(0, 'respuesta inesperada de /api/reports');
  return { fuente: 'agrupado-en-pantalla', lista: agrupar(filas) };
}

export interface Operador { quien: string; pin: string }
export interface CambioPedido { estado: Estado; accion?: Accion; motivo?: string }

/** POST /api/incidentes/:id/estado con el PIN en la cabecera X-Muni-Pin. 401/403 = PIN incorrecto. */
export async function cambiarEstado(id: string, c: CambioPedido, op: Operador) {
  const res = await fetch(`/api/incidentes/${encodeURIComponent(id)}/estado`, {
    method: 'POST', cache: 'no-store',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-muni-pin': op.pin },
    body: JSON.stringify({ estado: c.estado, ...(c.accion ? { accion: c.accion } : {}), ...(c.motivo ? { motivo: c.motivo } : {}), quien: op.quien }),
  });
  if (res.status === 401 || res.status === 403) throw new ErrorApi(res.status, 'PIN incorrecto');
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    let msg = t;
    try { msg = String(JSON.parse(t)?.error ?? t); } catch { /* texto plano */ }
    throw new ErrorApi(res.status, msg.slice(0, 160) || 'HTTP ' + res.status);
  }
}

/** Lleva el incidente hasta `destino` recorriendo el flujo (cada paso queda en el historial con quién y cuándo). */
export async function llevarA(inc: Pick<Incidente, 'id' | 'estado'>, destino: Estado, extra: Omit<CambioPedido, 'estado'>, op: Operador) {
  const pasos = pasosHasta(inc.estado, destino);
  if (!pasos) throw new ErrorApi(409, 'Ese cambio no está permitido desde el estado actual');
  for (const e of pasos) await cambiarEstado(inc.id, e === destino ? { estado: e, ...extra } : { estado: e }, op);
  return pasos;
}
