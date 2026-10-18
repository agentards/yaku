// Selector Claro | Noche | Contraste de la escena 3D de Lima, junto al conmutador 2D|3D (.v3d-ctrl.ad).
// Cambia el tema sin recargar (./temas.ts) y lo recuerda en este equipo. En Piura no se monta (relieve DEM).
import './selector-tema.css';
import type { Map as MLMap } from 'maplibre-gl';
import { estiloEscena } from './escena';
import { TEMAS, TEMA_IDS, aplicarTema, guardarTema, temaInicial, type TemaId } from './temas';

export function montarSelectorTema(raiz: HTMLElement, map: MLMap, listo: Promise<void>) {
  let actual: TemaId = temaInicial();
  const original = estiloEscena().layers;
  const seg = document.createElement('span');
  seg.className = 'v3d-seg v3d-tema';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Tema del mapa');
  seg.innerHTML = TEMA_IDS.map((id) => `<button type="button" data-tema="${id}" title="${TEMAS[id].titulo}">${TEMAS[id].nombre}</button>`).join('');
  (raiz.querySelector('.v3d-ctrl.ad') ?? raiz).prepend(seg);
  const pintar = () => {
    raiz.dataset.tema = actual;
    seg.querySelectorAll<HTMLButtonElement>('[data-tema]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tema === actual)));
  };
  const set = async (id: TemaId) => {
    await listo;
    if (id !== actual) aplicarTema(map, id, original);
    actual = id; guardarTema(id); pintar();
  };
  seg.querySelectorAll<HTMLButtonElement>('[data-tema]').forEach((b) => (b.onclick = () => void set(b.dataset.tema as TemaId)));
  pintar();
  const api = { actual: () => actual, set };
  (window as unknown as { __yakuTema: typeof api }).__yakuTema = api;
  return api;
}
