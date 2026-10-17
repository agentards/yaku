// «Por qué 3D»: botón del preset «Ver desde la cuenca» (src/vista3d/camara.ts presetCuenca) y nota fija del relieve.
// Lo usan las dos entradas: ?vista=3d (control de MapLibre sobre el mapa 2D) y ?vista=portal (botón en .v3d-ctrl.ad).
// No toca ui/index.ts ni ui/tema.css: se monta desde fuera sobre el DOM que ya existe.
import './cuenca.css';
import type { IControl } from 'maplibre-gl';
import { NOTA_RELIEVE } from './config';

export const TEXTO_CUENCA = 'Ver desde la cuenca';
const TITULO = 'Mira desde el río Piura aguas arriba (Tambogrande) hacia el Bajo Piura. Cualquier gesto sobre el mapa corta el vuelo.';
const ICONO = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18l5-8 4 5 3-4 6 7z"/><path d="M5 21c3-1.5 5 1 8-.5s5 .5 6-.5"/></svg>';

export function crearBotonCuenca(ir: () => unknown, clase = 'v3d-cuenca-btn'): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = clase;
  b.dataset.cuenca = '';
  b.title = TITULO;
  b.setAttribute('aria-label', TEXTO_CUENCA);
  b.innerHTML = `${ICONO}<span class="v3d-cuenca-larga">${TEXTO_CUENCA}</span><span class="v3d-cuenca-corta" aria-hidden="true">Cuenca</span>`;
  b.onclick = () => { ir(); };
  return b;
}

export function crearNotaRelieve(clase = 'v3d-nota-relieve'): HTMLElement {
  const p = document.createElement('p');
  p.className = clase;
  p.dataset.notaRelieve = '';
  p.setAttribute('role', 'note');
  p.textContent = NOTA_RELIEVE;
  return p;
}

/** ?vista=3d: control abajo a la derecha con la nota y el botón; solo se ve en 3D (body[data-vista="3d"]). */
export class ControlCuenca implements IControl {
  private el = document.createElement('div');
  constructor(private ir: () => unknown) {}
  onAdd() {
    this.el.className = 'maplibregl-ctrl v3d-cuenca';
    this.el.append(crearNotaRelieve(), crearBotonCuenca(this.ir));
    return this.el;
  }
  onRemove() { this.el.remove(); }
}

/** ?vista=portal: el botón entra en .v3d-ctrl.ad (antes del 2D|3D) y la nota queda fija sobre esos controles. */
export function montarCuencaPortal(raiz: HTMLElement, ir: () => unknown) {
  const ctrl = raiz.querySelector<HTMLElement>('.v3d-ctrl.ad');
  if (!ctrl || ctrl.querySelector('[data-cuenca]')) return null;
  const boton = crearBotonCuenca(() => {
    // En el 2D plano del portal el preset no tiene sentido: primero vuelve a 3D con el mismo conmutador de la UI.
    const b3 = raiz.querySelector<HTMLButtonElement>('[data-dim="3"]');
    if (b3 && b3.getAttribute('aria-pressed') !== 'true') b3.click();
    return ir();
  }, 'v3d-cuenca-btn v3d-cuenca-portal');
  ctrl.prepend(boton);
  const nota = crearNotaRelieve('v3d-nota-relieve v3d-nota-portal');
  ctrl.parentElement?.append(nota);
  return { boton, nota };
}
