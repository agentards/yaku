// Flujo del municipio (requisitos §3, decision-confianza.md §2.3). Mismo flujo que src/vista3d/municipalidad/incidentes.ts.
import type { Estado } from './agrupacion.ts';

export const ESTADOS: Estado[] = ['nuevo', 'en_revision', 'validado', 'descartado', 'accion_asignada', 'atendido'];
export const ACCIONES = ['rescate', 'bomberos', 'provisiones', 'maquinaria', 'edan'] as const;
export type Accion = (typeof ACCIONES)[number];

export const SIGUIENTES: Record<Estado, Estado[]> = {
  nuevo: ['en_revision'],
  en_revision: ['validado', 'descartado'],
  validado: ['accion_asignada', 'descartado'],
  accion_asignada: ['accion_asignada', 'atendido'],
  descartado: ['en_revision'],
  atendido: [],
};

/** Estados en los que el respaldo se congela (lo validó la municipalidad). */
export const CONGELA: Estado[] = ['validado', 'accion_asignada', 'atendido'];

export interface Pedido { estado: Estado; accion: Accion | null; motivo: string; quien: string }

/** Valida el cuerpo de POST /api/incidentes/:id/estado contra el estado actual. */
export function validarCambio(actual: Estado, body: any): { ok: true; p: Pedido } | { ok: false; status: number; error: string } {
  const estado = String(body?.estado ?? '') as Estado;
  if (!ESTADOS.includes(estado)) return { ok: false, status: 400, error: 'estado desconocido' };
  const quien = String(body?.quien ?? body?.por ?? '').trim();
  if (!quien || quien.length > 60) return { ok: false, status: 400, error: 'falta «quien» (1–60 caracteres)' };
  const motivo = String(body?.motivo ?? '').trim();
  if (motivo.length > 200) return { ok: false, status: 400, error: 'motivo demasiado largo' };
  let accion: Accion | null = null;
  if (body?.accion != null && body.accion !== '') {
    const a = String(body.accion) === 'evaluacion_edan' ? 'edan' : String(body.accion);
    if (!(ACCIONES as readonly string[]).includes(a)) return { ok: false, status: 400, error: 'acción desconocida' };
    accion = a as Accion;
  }
  if (!SIGUIENTES[actual].includes(estado)) return { ok: false, status: 409, error: `no se puede pasar de ${actual} a ${estado}` };
  if (estado === 'descartado' && !motivo) return { ok: false, status: 400, error: 'descartar exige motivo' };
  if (estado === 'accion_asignada' && !accion) return { ok: false, status: 400, error: 'falta la acción (rescate, bomberos, provisiones, maquinaria, edan)' };
  if (estado !== 'accion_asignada') accion = null;
  return { ok: true, p: { estado, accion, motivo, quien } };
}
