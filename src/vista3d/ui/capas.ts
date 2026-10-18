// Panel de capas: casilla + deslizador de opacidad por capa real de la escena (solo las que la escena maneja).
import type { CapaId, EscenaYaku } from './contrato';
import { OFFICIAL_LAYERS, forecastStatus } from '../../layers';
import { esc } from './formato';

interface MetaCapa { titulo: string; meta: string; op: number; badge?: string }
const senamhi = OFFICIAL_LAYERS.find((l) => l.id === 'senamhi');
const fs = senamhi?.emision && senamhi.vigenciaH ? forecastStatus(senamhi.emision, senamhi.vigenciaH) : null;

export const META_CAPAS: Record<CapaId, MetaCapa> = {
  terreno: { titulo: 'Relieve 3D (DEM)', meta: 'Terrain Tiles (Mapzen/AWS): SRTM, GMTED2010 · ×1,6', op: 100 },
  basemap: { titulo: 'Mapa base de referencia', meta: '© OpenStreetMap contributors (ODbL) · Protomaps', op: 100 },
  cenepred: { titulo: 'Centros poblados del escenario CENEPRED', meta: 'CENEPRED/SIGRID 23077 (Aviso 421) · IGN · 17–19/10/2026', op: 100 },
  senamhi: { titulo: 'Aviso de activación de quebradas', meta: fs ? fs.etiqueta : 'SENAMHI vía INDECI', op: 90 },
  erosion: { titulo: 'SIGRID · áreas expuestas a erosión', meta: 'SIGRID/CENEPRED vía INDECI · documentos 2019–2024', op: 80 },
  limite: { titulo: 'Límite departamental de Piura', meta: 'INDECI · no expresa riesgo', op: 100 },
  citizen: { titulo: 'Fichas y reportes ciudadanos', meta: 'De este equipo y recibidos por relevo. No son alertas oficiales.', op: 100, badge: 'POR VALIDAR' },
};
const ORDEN: CapaId[] = ['terreno', 'cenepred', 'citizen', 'senamhi', 'erosion', 'limite', 'basemap'];

export function montarCapas(cont: HTMLElement, escena: EscenaYaku) {
  const disponibles = new Set(escena.capas());
  const ids = ORDEN.filter((id) => disponibles.has(id));
  const ul = document.createElement('ul');
  ul.className = 'v3d-capas';
  ul.innerHTML = ids.map((id) => {
    const m = META_CAPAS[id];
    return `<li class="v3d-capa" data-capa="${id}">
      <input type="checkbox" id="v3d-c-${id}" checked aria-describedby="v3d-cm-${id}" />
      <span class="v3d-sw sws-${id}" aria-hidden="true"></span>
      <label for="v3d-c-${id}">${esc(m.titulo)}${m.badge ? ` <span class="badge-nv">${esc(m.badge)}</span>` : ''}</label>
      <span class="meta" id="v3d-cm-${id}">${esc(m.meta)}</span>
      <span class="op"><input type="range" min="0" max="100" step="5" value="${m.op}" aria-label="Opacidad: ${esc(m.titulo)}" /><output>${m.op}%</output></span>
      ${id === 'cenepred' ? `<label class="sub"><input type="checkbox" data-sincob /> <span>Solo sin cobertura garantizada según OSIPTEL<br><small>445 de 928 con dato OSIPTEL; cobertura declarada por operadoras</small></span></label>` : ''}
    </li>`;
  }).join('');
  cont.append(ul);

  // La opacidad toca decenas de capas del mapa base: un cambio por cuadro como máximo.
  const pend = new Map<CapaId, number>();
  let raf = 0;
  const aplicar = () => { raf = 0; pend.forEach((v, id) => escena.setCapaOpacidad(id, v)); pend.clear(); };

  for (const li of ul.querySelectorAll<HTMLLIElement>('.v3d-capa')) {
    const id = li.dataset.capa as CapaId;
    const cb = li.querySelector<HTMLInputElement>('input[type=checkbox]:not([data-sincob])')!;
    const rg = li.querySelector<HTMLInputElement>('input[type=range]')!;
    const out = li.querySelector('output')!;
    cb.onchange = () => { escena.setCapaVisible(id, cb.checked); li.toggleAttribute('data-off', !cb.checked); rg.disabled = !cb.checked; };
    rg.oninput = () => {
      out.textContent = `${rg.value}%`;
      pend.set(id, +rg.value / 100);
      raf ||= requestAnimationFrame(aplicar);
    };
    const sc = li.querySelector<HTMLInputElement>('[data-sincob]');
    if (sc) sc.onchange = () => escena.setFiltroSinCobertura(sc.checked);
    if (META_CAPAS[id].op !== 100) escena.setCapaOpacidad(id, META_CAPAS[id].op / 100);
  }
  return ul;
}
