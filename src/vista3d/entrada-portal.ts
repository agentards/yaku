// Entradas de la interfaz 3D completa. Se cargan con import dinámico desde main.ts: la vista 2D no paga nada si no se usan.
//  · arrancarMonitoreo(sesion, { pestana }): «Yaku 3D · Centro de monitoreo» (?vista=portal|municipalidad|incidentes),
//    histórico real del servidor + monitor en vivo + incidentes, con la Sesion (PIN municipal).
//  · arrancar(): el portal de relevo de campo anterior (IndexedDB de este equipo y demo SIMULADO), en ?vista=portal-relevo.
import { crearEscena, type EscenaYaku3D } from './escena';
import { getMap } from '../map';
import { montarInterfaz3D } from './ui/index';
import { montarCuencaPortal } from './cuenca';
import { montarMonitoreo, type PestanaMonitoreo } from './monitoreo/index';
import type { Sesion } from '../auth/sesion';
import { REGION } from '../region';

export const esVistaPortal = (search: string) => new URLSearchParams(search).get('vista') === 'portal';

/** Botón «Volver a …» sobre la vista 2D: solo quien ya entró a la vista 3D lo ve. */
function botonVolver(texto: string, volver: () => void) {
  let b: HTMLButtonElement | null = null;
  return () => {
    requestAnimationFrame(() => getMap()?.resize());
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'v3d-volver';
      b.textContent = texto;
      b.onclick = () => { b!.hidden = true; volver(); };
      document.getElementById('mapwrap')?.append(b);
    }
    b.hidden = false;
  };
}

export function arrancarMonitoreo(sesion: Sesion, o: { pestana?: PestanaMonitoreo } = {}) {
  let api: ReturnType<typeof montarMonitoreo> = null;
  api = montarMonitoreo(sesion, {
    pestana: o.pestana,
    crearEscena: (cont) => crearEscena(cont),
    alSalir: botonVolver('Volver al Centro de monitoreo', () => api?.volver()),
  });
  // «Ver desde la cuenca» es del río Piura (DEM de Piura): en Lima no se monta.
  if (api && REGION.terreno) { const e = api.escena; montarCuencaPortal(api.raiz, () => e.verCuenca()); }
  return api;
}

export function arrancar() {
  let escena: EscenaYaku3D | null = null;
  let api: ReturnType<typeof montarInterfaz3D> = null;
  api = montarInterfaz3D({
    crearEscena: (cont) => (escena = crearEscena(cont)),
    alSalir: botonVolver('Volver a Yaku 3D', () => api?.volver()),
  });
  // «Ver desde la cuenca»: botón en .v3d-ctrl.ad + nota fija del relieve.
  if (api && REGION.terreno) montarCuencaPortal(api.raiz, () => escena?.verCuenca());
  return api;
}
