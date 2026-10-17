// Entrada de la interfaz 3D completa (?vista=portal): shell estilo FireTrace + portal de campo sobre la escena
// real (./escena.ts). Se carga con import dinámico desde main.ts: la vista 2D no paga nada si no se usa.
import { crearEscena, type EscenaYaku3D } from './escena';
import { getMap } from '../map';
import { montarInterfaz3D } from './ui/index';
import { montarCuencaPortal } from './cuenca';

export const esVistaPortal = (search: string) => new URLSearchParams(search).get('vista') === 'portal';

export function arrancar() {
  let volverBtn: HTMLButtonElement | null = null;
  let escena: EscenaYaku3D | null = null;
  const api = montarInterfaz3D({
    crearEscena: (cont) => (escena = crearEscena(cont)),
    alSalir() {
      requestAnimationFrame(() => getMap()?.resize());
      // Solo quien ya entró al portal ve el botón de vuelta: la vista 2D predeterminada no cambia.
      if (!api || volverBtn) { if (volverBtn) volverBtn.hidden = false; return; }
      volverBtn = document.createElement('button');
      volverBtn.type = 'button';
      volverBtn.className = 'v3d-volver';
      volverBtn.textContent = 'Volver a Yaku 3D';
      volverBtn.onclick = () => { volverBtn!.hidden = true; api.volver(); };
      document.getElementById('mapwrap')?.append(volverBtn);
    },
  });
  // «Ver desde la cuenca»: botón en .v3d-ctrl.ad + nota fija del relieve.
  if (api) montarCuencaPortal(api.raiz, () => escena?.verCuenca());
  return api;
}
