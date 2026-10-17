import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap, GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 carga su Web Worker desde un archivo aparte: lo empaquetamos localmente (precache, sin CDN).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
maplibregl.setWorkerUrl(workerUrl);
import { PIURA_BOUNDS } from './layers';
import { OBS_LABELS, type ObsType } from './codec';

const C = {
  n2: '#b8860b', n3: '#a63d1f', erosion: '#5b3f8c', limite: '#1d2b36', citizen: '#e08a00', bg: '#e7eaed', water: '#d7dde2',
};

// Estilo 100 % local: fondo liso, sin tiles ni glyphs remotos (sin capas de texto).
const style: StyleSpecification = {
  version: 8,
  sources: {
    osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© colaboradores de OpenStreetMap' },
    limite: { type: 'geojson', data: 'data/piura-limite.geojson', attribution: 'Límite: INDECI' },
    senamhi: { type: 'geojson', data: 'data/senamhi-quebradas.geojson', attribution: 'Pronóstico: SENAMHI vía INDECI (15/10/2026)' },
    erosion: { type: 'geojson', data: 'data/sigrid-erosion.geojson', attribution: 'Erosión: CENEPRED/SIGRID vía INDECI' },
    erosionPts: { type: 'geojson', data: 'data/sigrid-erosion-pts.geojson' },
    citizen: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': C.water } },
    { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.6, 'raster-opacity': 0.85 } },
    { id: 'limite-fill', type: 'fill', source: 'limite', paint: { 'fill-color': C.bg, 'fill-opacity': 1 } },
    { id: 'senamhi-fill', type: 'fill', source: 'senamhi', paint: { 'fill-color': ['match', ['get', 'nivel'], 3, C.n3, C.n2], 'fill-opacity': 0.32 } },
    { id: 'senamhi-line', type: 'line', source: 'senamhi', paint: { 'line-color': ['match', ['get', 'nivel'], 3, C.n3, C.n2], 'line-width': 1 } },
    { id: 'erosion-fill', type: 'fill', source: 'erosion', minzoom: 11, paint: { 'fill-color': C.erosion, 'fill-opacity': 0.35 } },
    { id: 'erosion-line', type: 'line', source: 'erosion', minzoom: 11, paint: { 'line-color': C.erosion, 'line-width': 1.5 } },
    { id: 'erosion-pts', type: 'circle', source: 'erosionPts', maxzoom: 11, paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': C.erosion, 'circle-stroke-width': 2.5 } },
    { id: 'limite-line', type: 'line', source: 'limite', paint: { 'line-color': C.limite, 'line-width': 2 } },
    // Reportes ciudadanos: halo + punto ámbar con borde oscuro (distinto de cualquier capa oficial)
    { id: 'citizen-halo', type: 'circle', source: 'citizen', paint: { 'circle-radius': 13, 'circle-color': C.citizen, 'circle-opacity': 0.18, 'circle-stroke-color': C.citizen, 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.9 } },
    { id: 'citizen-dot', type: 'circle', source: 'citizen', paint: { 'circle-radius': 5.5, 'circle-color': C.citizen, 'circle-stroke-color': '#1b1b1b', 'circle-stroke-width': 2 } },
  ],
};

export const LAYER_GROUPS: Record<string, string[]> = {
  senamhi: ['senamhi-fill', 'senamhi-line'],
  erosion: ['erosion-fill', 'erosion-line', 'erosion-pts'],
  limite: ['limite-line'],
  citizen: ['citizen-halo', 'citizen-dot'],
  osm: ['osm'],
};

let map: MLMap | null = null;
let draft: maplibregl.Marker | null = null;
let loaded: Promise<void>;
export const getMap = () => map;
export const mapLoaded = () => loaded;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function initMap(container: HTMLElement) {
  map = new maplibregl.Map({
    container, style, bounds: PIURA_BOUNDS, fitBoundsOptions: { padding: 16 },
    attributionControl: false, maxZoom: 17, minZoom: 5, dragRotate: false, pitchWithRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'MapLibre' }), 'bottom-right');
  loaded = new Promise((res) => map!.once('idle', () => {
    // Atribución compacta plegada (en móvil ocupaba media pantalla)
    const a = container.querySelector('.maplibregl-ctrl-attrib');
    a?.classList.remove('maplibregl-compact-show'); a?.removeAttribute('open');
    res();
  }));
  const popup = (lngLat: maplibregl.LngLatLike, html: string) => new maplibregl.Popup({ maxWidth: '280px' }).setLngLat(lngLat).setHTML(html).addTo(map!);
  map.on('click', (e) => {
    const f = map!.queryRenderedFeatures(e.point, { layers: ['citizen-dot', 'citizen-halo', 'erosion-pts', 'erosion-fill', 'senamhi-fill'] })[0];
    if (!f) return;
    const p = f.properties as any;
    if (f.layer.id.startsWith('citizen')) {
      popup(e.lngLat, `<div class="pop pop-citizen"><span class="badge-unverified">NO VERIFICADO</span><b>${esc(OBS_LABELS[p.type as ObsType] ?? p.type)}</b> · severidad ${esc(p.severity)}<br>${esc(p.note)}<br><small>Reporte ciudadano · ${esc(p.state)}</small></div>`);
    } else if (f.layer.id.startsWith('erosion')) {
      popup(e.lngLat, `<div class="pop pop-official"><span class="badge-source">Fuente: CENEPRED/SIGRID</span><b>${esc(p.peligro)}</b><br>${esc(p.lugar)} · ${esc(p.dist)}, ${esc(p.prov)}<br><small>Documento ${esc(p.anio ?? 's/f')}${p.ficha ? ` · <a href="${esc(p.ficha)}" target="_blank" rel="noopener">ficha SIGRID</a>` : ''}</small></div>`);
    } else {
      popup(e.lngLat, `<div class="pop pop-official"><span class="badge-source">Fuente: SENAMHI</span><b>Pronóstico · aviso nivel ${esc(p.nivel)}</b><br>${esc(p.dist)}, ${esc(p.prov)}<br><small>Activación de quebradas 24 h · ${esc(p.fecha)}. Nivel de aviso, no profundidad.</small></div>`);
    }
  });
  for (const l of ['citizen-dot', 'erosion-pts', 'senamhi-fill']) {
    map.on('mouseenter', l, () => (map!.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', l, () => (map!.getCanvas().style.cursor = ''));
  }
  return map;
}

export function setVisible(group: string, on: boolean) {
  for (const id of LAYER_GROUPS[group] ?? []) map?.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  if (group === 'osm') map?.setPaintProperty('limite-fill', 'fill-opacity', on ? 0 : 1);
}

export function setCitizen(points: { id: string; lat: number; lon: number; type: string; severity: number; note: string; state: string }[]) {
  const src = map?.getSource('citizen') as GeoJSONSource | undefined;
  src?.setData({ type: 'FeatureCollection', features: points.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { ...p } })) });
}

/** Marcador arrastrable del borrador de observación. */
export function placeDraft(lat: number, lon: number, onMove: (lat: number, lon: number) => void, fly = true) {
  if (!map) return;
  if (!draft) {
    const el = document.createElement('div');
    el.className = 'draft-marker';
    el.setAttribute('aria-label', 'Ubicación de la observación (arrastrar para ajustar)');
    draft = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' }).setLngLat([lon, lat]).addTo(map);
    draft.on('dragend', () => { const ll = draft!.getLngLat(); onMove(ll.lat, ll.lng); });
  } else draft.setLngLat([lon, lat]);
  if (fly) map.easeTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 11), duration: 600 });
}
export const draftPos = () => (draft ? draft.getLngLat() : null);
export function centerOf() { const c = map!.getCenter(); return { lat: c.lat, lon: c.lng }; }
