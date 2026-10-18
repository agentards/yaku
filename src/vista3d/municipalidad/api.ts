// Red del Centro de monitoreo: SIEMPRE el mismo origen (/api del servidor local, servidor-local/).
// En `vite dev`/`preview` el proxy de vite.config.ts decide a dónde va /api (local por defecto; producción solo
// con YAKU_API=produccion y en solo lectura). Contrato: ./CONTRATO-API.md. Lecturas y escrituras protegidas llevan
// las cabeceras de la Sesion (Bearer de Clerk o X-Muni-Pin).
import { leerRespuesta, type ReporteApi } from './deteccion';
import { agrupar, leerIncidentes, pasosHasta, type Incidente } from './incidentes';
import type { Accion, Estado } from './textos';

export type Fuente = 'incidentes' | 'agrupado-en-pantalla';
export type Cabeceras = () => Promise<Record<string, string>>;
export class ErrorApi extends Error { constructor(readonly status: number, msg: string) { super(msg); } }
export const esErrorAcceso = (e: unknown) => e instanceof ErrorApi && (e.status === 401 || e.status === 403);

const sinCabeceras: Cabeceras = async () => ({});
const json = async (res: Response) => { if (!res.ok) throw new ErrorApi(res.status, 'HTTP ' + res.status); return res.json(); };
const GET = async (url: string, signal?: AbortSignal, cab: Cabeceras = sinCabeceras) =>
  fetch(url, { method: 'GET', cache: 'no-store', headers: { accept: 'application/json', ...(await cab()) }, signal });

export const fotoUrl = (id: string) => `/api/fotos/${encodeURIComponent(id)}`;

/**
 * GET /api/incidentes. Si el servidor no lo tiene (404: servidor de producción actual), agrupa /api/reports en esta
 * pantalla (solo lectura, sin acciones). Devuelve null en el cuerpo si la respuesta no tiene la forma esperada.
 */
export async function traerIncidentes(signal?: AbortSignal, fuente: Fuente = 'incidentes', cab: Cabeceras = sinCabeceras): Promise<{ fuente: Fuente; lista: Incidente[] }> {
  if (fuente === 'incidentes') {
    const res = await GET('/api/incidentes', signal, cab);
    if (res.status !== 404) {
      const lista = leerIncidentes(await json(res));
      if (!lista) throw new ErrorApi(0, 'respuesta inesperada de /api/incidentes');
      return { fuente, lista };
    }
  }
  const filas = leerRespuesta(await json(await GET('/api/reports?limit=200', signal, cab)));
  if (!filas) throw new ErrorApi(0, 'respuesta inesperada de /api/reports');
  return { fuente: 'agrupado-en-pantalla', lista: agrupar(filas) };
}

/** Histórico real: GET /api/reports?desde=<ms>&limit=<≤5000> (el servidor puede devolver menos). */
export async function traerReportes(desde: number, signal?: AbortSignal, cab: Cabeceras = sinCabeceras, limite = 5000): Promise<ReporteApi[]> {
  const filas = leerRespuesta(await json(await GET(`/api/reports?desde=${Math.max(0, Math.floor(desde))}&limit=${limite}`, signal, cab)));
  if (!filas) throw new ErrorApi(0, 'respuesta inesperada de /api/reports');
  return filas;
}

/** Quién opera: con PIN (pantalla vieja) o con las cabeceras de la Sesion. */
export interface Operador { quien: string; pin?: string; cabeceras?: Cabeceras }
export interface CambioPedido { estado: Estado; accion?: Accion; motivo?: string }

/** POST /api/incidentes/:id/estado. 401 = sin credencial, 403 = credencial inválida o rol insuficiente. */
export async function cambiarEstado(id: string, c: CambioPedido, op: Operador) {
  const auth = op.cabeceras ? await op.cabeceras() : op.pin ? { 'x-muni-pin': op.pin } : {};
  const res = await fetch(`/api/incidentes/${encodeURIComponent(id)}/estado`, {
    method: 'POST', cache: 'no-store',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...auth },
    body: JSON.stringify({ estado: c.estado, ...(c.accion ? { accion: c.accion } : {}), ...(c.motivo ? { motivo: c.motivo } : {}), quien: op.quien }),
  });
  if (res.status === 401 || res.status === 403) throw new ErrorApi(res.status, op.cabeceras ? 'Sin permiso para cambiar estados' : 'PIN incorrecto');
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
