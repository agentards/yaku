// Qué pantalla arranca según ?vista y el equipo (plan-centro-monitoreo.md):
//  - ?vista=poblador, o celular sin ?vista → modo poblador (público).
//  - ?vista=portal | municipalidad | incidentes, o escritorio sin ?vista → Centro de monitoreo (con acceso);
//    «incidentes» abre la pestaña Incidentes, «municipalidad» el monitor en vivo.
//  - ?vista=2d, ?vista=3d (o cualquier otra) → app técnica 2D (pública).
// En navegadores automatizados (navigator.webdriver) sin ?vista sigue la app técnica, como ya hace el poblador:
// las E2E de la vista técnica no cambian y las del centro de monitoreo lo piden con ?vista=.
import type { Entorno } from './poblador/ruta';

export type Pestana = 'portal' | 'municipalidad' | 'incidentes';
export type Ruta = { vista: 'poblador' } | { vista: 'monitoreo'; pestana: Pestana } | { vista: 'tecnica' };

export function decidirRuta(search: string, env: Entorno): Ruta {
  const v = new URLSearchParams(search).get('vista');
  if (v === 'poblador') return { vista: 'poblador' };
  if (v === 'portal' || v === 'municipalidad' || v === 'incidentes') return { vista: 'monitoreo', pestana: v };
  if (v) return { vista: 'tecnica' };
  if (env.automatizado) return { vista: 'tecnica' };
  return env.celular ? { vista: 'poblador' } : { vista: 'monitoreo', pestana: 'portal' };
}
