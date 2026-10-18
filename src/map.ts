import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap, GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 carga su Web Worker desde un archivo aparte: lo empaquetamos localmente (precache, sin CDN).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
maplibregl.setWorkerUrl(workerUrl);
import { CENEPRED_23077_BOUNDS, CENEPRED_FIT_PADDING, OFFICIAL_LAYERS, forecastStatus } from './layers';
import { OBS_LABELS, type ObsType } from './codec';
import type { LayerSpecification } from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import { layers as pmLayers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import { selectBasemap, BASEMAP_ATTRIBUTION } from './basemap-config';
import { BlobOrFetchSource, BASEMAP_CACHE, cachedBasemap, downloadBasemap, pruneBasemaps } from './basemap';
import { BASEMAPS } from './basemap-config';
import { FEAT } from './features';
import { REGION } from './region';

const C = {
  n2: '#b8860b', n3: '#a63d1f', erosion: '#5b3f8c', limite: '#1d2b36', citizen: '#e08a00', water: '#d7dde2',
};

// ---------- Mapa base vectorial (PMTiles de Piura o de Lima según REGION, Protomaps, © OpenStreetMap contributors, ODbL) ----------
export const BASEMAP = selectBasemap(location.search, BASEMAPS, REGION.basemap);
export const BASEMAP_URL = new URL(BASEMAP.file, location.origin + '/').href;
export const basemapSource = new BlobOrFetchSource(BASEMAP_URL);
// Antes de pedir la primera tesela se consulta la copia guardada: así una apertura sin red lee del Blob.
const cacheP: Promise<Cache> = 'caches' in self ? caches.open(BASEMAP_CACHE) : Promise.reject(new Error('Cache Storage no disponible'));
cacheP.catch(() => undefined);
const initialBlob = cacheP.then((c) => cachedBasemap(c, BASEMAP_URL, BASEMAP)).then((b) => { if (b) basemapSource.setBlob(b); return b; }).catch(() => null);
basemapSource.ready = initialBlob;
const pmProtocol = new Protocol();
pmProtocol.add(new PMTiles(basemapSource));
maplibregl.addProtocol('pmtiles', pmProtocol.tile);

/** Variante sobria del flavor «light»: colores tenues para que las capas oficiales y ciudadanas destaquen. */
export const BASEMAP_FLAVOR: Flavor = {
  ...namedFlavor('light'),
  background: '#dde4e8', earth: '#efede9', water: '#cfdce4',
  park_a: '#e6ebe4', park_b: '#dfe7dc', wood_a: '#e5eae3', wood_b: '#dde6da', scrub_a: '#e8ebe3', scrub_b: '#e1e7dc',
  sand: '#eeebe3', beach: '#efebe0', industrial: '#e8e9ea', hospital: '#ece8e6', school: '#ece9e4', aerodrome: '#e6e7e9', zoo: '#e5ebe8', military: '#e8e8e8', pedestrian: '#eceae4',
  highway: '#ffffff', highway_casing_early: '#cfccc6', highway_casing_late: '#cfccc6', major: '#fbfbfa', major_casing_early: '#d9d6d0', major_casing_late: '#d9d6d0',
  minor_a: '#f3f2ef', minor_b: '#fbfbfa', minor_casing: '#e2e0db', boundaries: '#b9b9b9', railway: '#c2c7c9',
  city_label: '#55606a', city_label_halo: '#f4f4f2', subplace_label: '#8b9298', subplace_label_halo: '#f1f1ef', state_label: '#a9b0b5', state_label_halo: '#f1f1ef', country_label: '#9aa2a8',
  ocean_label: '#7d98ad', roads_label_major: '#8a8f93', roads_label_minor: '#9a9ea1',
  landcover: { grassland: '#e9eee6', barren: '#f1eee6', urban_area: '#e7e6e3', farmland: '#e8ede4', glacier: '#f7f7f7', scrub: '#ebede4', forest: '#e1e9e1' },
};
// Se omiten capas que agregan ruido y no sirven a la tarea: POI, edificios, números de casa, sentido de vía.
const DROP = new Set(['pois', 'buildings', 'address_label', 'roads_oneway']);
export function basemapLayers(): LayerSpecification[] {
  return (pmLayers('protomaps', BASEMAP_FLAVOR, { lang: 'es' }) as LayerSpecification[]).filter((l) => !DROP.has(l.id)).map((l) => ({ ...l, metadata: { basemap: true } }));
}
const bm = basemapLayers();
const bmBase = bm.filter((l) => l.type !== 'symbol');
const bmLabels = bm.filter((l) => l.type === 'symbol');

// Estilo 100 % local: teselas, glyphs y sprites se sirven desde el propio sitio (sin CDN ni tile.openstreetmap.org).
export const style: StyleSpecification = {
  version: 8,
  glyphs: location.origin + '/basemap/fonts/{fontstack}/{range}.pbf',
  sprite: location.origin + '/basemap/sprites/light',
  sources: {
    protomaps: { type: 'vector', url: 'pmtiles://' + BASEMAP_URL, attribution: BASEMAP_ATTRIBUTION },
    limite: { type: 'geojson', data: 'data/piura-limite.geojson', attribution: 'Límite: INDECI' },
    senamhi: { type: 'geojson', data: 'data/senamhi-quebradas.geojson', attribution: 'Pronóstico: SENAMHI vía INDECI (15/10/2026)' },
    erosion: { type: 'geojson', data: 'data/sigrid-erosion.geojson', attribution: 'Erosión: SIGRID/CENEPRED vía geoservicio de INDECI' },
    erosionPts: { type: 'geojson', data: 'data/sigrid-erosion-pts.geojson' },
    ...(FEAT.cenepred ? { cenepred: { type: 'geojson', data: 'data/cenepred-ccpp.geojson', attribution: 'Escenario de riesgo: CENEPRED/SIGRID 23077 · CCPP: IGN' + (FEAT.osiptel ? ' · Cobertura móvil: OSIPTEL (ODC-By)' : '') } as const } : {}),
    citizen: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    ...bmBase,
    { id: 'senamhi-fill', type: 'fill', source: 'senamhi', paint: { 'fill-color': ['match', ['get', 'nivel'], 3, C.n3, C.n2], 'fill-opacity': 0.32 } },
    { id: 'senamhi-line', type: 'line', source: 'senamhi', paint: { 'line-color': ['match', ['get', 'nivel'], 3, C.n3, C.n2], 'line-width': 1 } },
    { id: 'erosion-fill', type: 'fill', source: 'erosion', minzoom: 11, paint: { 'fill-color': C.erosion, 'fill-opacity': 0.35 } },
    { id: 'erosion-line', type: 'line', source: 'erosion', minzoom: 11, paint: { 'line-color': C.erosion, 'line-width': 1.5 } },
    ...bmLabels,
    { id: 'erosion-pts', type: 'circle', source: 'erosionPts', maxzoom: 11, paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': C.erosion, 'circle-stroke-width': 2.5 } },
    // Escenario de riesgo CENEPRED: azul pizarra por nivel de exposición (distinto de avisos SENAMHI, erosión y reportes ciudadanos)
    ...(!FEAT.cenepred ? [] : [{ id: 'cenepred-ccpp', type: 'circle' as const, source: 'cenepred', layout: { 'circle-sort-key': ['get', 'r'] }, paint: {
      'circle-color': ['match', ['get', 'r'], 5, '#0b2f4e', 4, '#1f5a87', 3, '#4f86b0', 2, '#86afcc', '#b4cbdc'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, ['match', ['get', 'r'], 5, 5, 4, 4.5, 3, 3.5, 2.2], 12, ['match', ['get', 'r'], 5, 9, 4, 8, 3, 6.5, 4.5]],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } } as LayerSpecification]),
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
  ...(FEAT.cenepred ? { cenepred: ['cenepred-ccpp'] } : {}),
  citizen: ['citizen-halo', 'citizen-dot'],
  basemap: bm.map((l) => l.id),
};

let map: MLMap | null = null;
let draft: maplibregl.Marker | null = null;
let loaded: Promise<void>;
export const getMap = () => map;
export const mapLoaded = () => loaded;

const senamhiStatus = () => { const l = OFFICIAL_LAYERS.find((x) => x.id === 'senamhi')!; return forecastStatus(l.emision!, l.vigenciaH!).etiqueta; };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function initMap(container: HTMLElement) {
  map = new maplibregl.Map({
    container, style, bounds: REGION.id === 'piura' ? CENEPRED_23077_BOUNDS : REGION.bounds, fitBoundsOptions: { padding: CENEPRED_FIT_PADDING },
    attributionControl: false, maxZoom: 17, minZoom: 5, dragRotate: false, pitchWithRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'MapLibre' }), 'bottom-right');
  // Crédito ODbL siempre visible (también sin red y con la atribución compacta plegada)
  map.addControl({
    onAdd: () => { const d = document.createElement('div'); d.className = 'maplibregl-ctrl osm-credit'; d.innerHTML = BASEMAP_ATTRIBUTION; return d; },
    onRemove: () => {},
  }, 'bottom-left');
  loaded = new Promise((res) => map!.once('idle', () => {
    // Atribución compacta plegada (en móvil ocupaba media pantalla)
    const a = container.querySelector('.maplibregl-ctrl-attrib');
    a?.classList.remove('maplibregl-compact-show'); a?.removeAttribute('open');
    res();
  }));
  const popup = (lngLat: maplibregl.LngLatLike, html: string) => new maplibregl.Popup({ maxWidth: '280px' }).setLngLat(lngLat).setHTML(html).addTo(map!);
  map.on('click', (e) => {
    const f = map!.queryRenderedFeatures(e.point, { layers: ['citizen-dot', 'citizen-halo', ...(FEAT.cenepred ? ['cenepred-ccpp'] : []), 'erosion-pts', 'erosion-fill', 'senamhi-fill'] })[0];
    if (!f) return;
    const p = f.properties as any;
    if (f.layer.id.startsWith('citizen')) {
      popup(e.lngLat, `<div class="pop pop-citizen"><span class="badge-unverified">POR VALIDAR</span><b>${esc(OBS_LABELS[p.type as ObsType] ?? p.type)}</b> · severidad ${esc(p.severity)}<br>${esc(p.note)}<br><small>Reporte vecinal · ${esc(p.state)}</small></div>`);
    } else if (f.layer.id === 'cenepred-ccpp') {
      popup(e.lngLat, cenepredPopup(p));
    } else if (f.layer.id.startsWith('erosion')) {
      popup(e.lngLat, `<div class="pop pop-official"><span class="badge-source">Fuente: CENEPRED/SIGRID</span><b>${esc(p.peligro)}</b><br>${esc(p.lugar)} · ${esc(p.dist)}, ${esc(p.prov)}<br><small>Documento ${esc(p.anio ?? 's/f')}${p.ficha ? ` · <a href="${esc(p.ficha)}" target="_blank" rel="noopener">ficha SIGRID</a>` : ''}</small></div>`);
    } else {
      popup(e.lngLat, `<div class="pop pop-official"><span class="badge-source">Fuente: SENAMHI</span><b>Aviso nivel ${esc(p.nivel)}</b> · ${esc(p.dist)}, ${esc(p.prov)}<br><small>${esc(senamhiStatus())}. Activación de quebradas; nivel de aviso, no profundidad.</small></div>`);
    }
  });
  for (const l of ['citizen-dot', ...(FEAT.cenepred ? ['cenepred-ccpp'] : []), 'erosion-pts', 'senamhi-fill']) {
    map.on('mouseenter', l, () => (map!.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', l, () => (map!.getCanvas().style.cursor = ''));
  }
  return map;
}

const siNo = (v: unknown) => (v === true ? 'sí' : v === false ? 'no' : 'sin dato');
/** Popup de un centro poblado del escenario CENEPRED (nunca «afectado», «con daños» ni «expuesto»). */
export function cenepredPopup(p: any) {
  const cg = p.cg === null || p.cg === undefined || p.cg === 'null' ? null : p.cg === true || p.cg === 'true';
  const g4 = p.g4 === null || p.g4 === undefined || p.g4 === 'null' ? null : p.g4 === true || p.g4 === 'true';
  const cob = cg === null
    ? 'Cobertura móvil garantizada (declarada por operadoras, OSIPTEL): sin dato OSIPTEL (el centro poblado no figura en el registro)'
    : `Cobertura móvil garantizada (declarada por operadoras, OSIPTEL): ${siNo(cg)}, 4G ${siNo(g4)}`;
  return `<div class="pop pop-official pop-cenepred"><span class="badge-source">Escenario de riesgo · CENEPRED/SIGRID 23077</span>`
    + `<b>Centro poblado del escenario CENEPRED</b><br>${esc(p.n)} · ${esc(p.d)}, ${esc(p.pr)}<br>`
    + `Nivel de exposición a inundaciones: <b>${esc(p.niv)}</b> · población ${esc(p.pob)} (Excel CENEPRED)<br>`
    + `<small>Escenario 17–19/10/2026 basado en el Aviso SENAMHI 421; nivel de exposición, no profundidad de agua.</small><br>`
    + (FEAT.osiptel ? `<small class="cob">${esc(cob)}. Fuente: OSIPTEL, datos abiertos (ODC-By), 2025-IV.</small>` : '') + '</div>';
}

/** Filtro «Solo sin cobertura garantizada según OSIPTEL»: solo cg === false (445 de 928 con dato);
 * los 2 «sin dato OSIPTEL» quedan fuera del filtro. */
export function setCenepredSinCobertura(on: boolean) {
  map?.setFilter('cenepred-ccpp', on ? ['==', ['get', 'cg'], false] : null);
}

export function setVisible(group: string, on: boolean) {
  for (const id of LAYER_GROUPS[group] ?? []) map?.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
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

export type BasemapStatus = { state: 'checking' | 'downloading' | 'saved' | 'offline-missing' | 'error' | 'unsupported'; loaded?: number; total: number; ms?: number; fromCache?: boolean; msg?: string };
let bmStatus: BasemapStatus = { state: 'checking', total: BASEMAP.bytes };
const bmLog: { state: string; pct: number; t: number }[] = [];
export const basemapInfo = () => ({ ...bmStatus, log: bmLog, key: BASEMAP.key, file: BASEMAP.file, maxzoom: BASEMAP.maxzoom, rangeRequests: basemapSource.rangeRequests, blobReads: basemapSource.blobReads, hasBlob: !!basemapSource.blob });

/** Guarda el mapa base completo para uso sin red (una vez), informando el progreso. */
export async function startBasemapOffline(onStatus: (s: BasemapStatus) => void) {
  const emit = (s: BasemapStatus) => {
    const pct = s.state === 'saved' ? 100 : Math.floor((100 * (s.loaded ?? 0)) / s.total);
    const prev = bmLog[bmLog.length - 1];
    if (!prev || prev.state !== s.state || pct - prev.pct >= 10) bmLog.push({ state: s.state, pct, t: Math.round(performance.now()) });
    bmStatus = s; onStatus(s);
  };
  const total = BASEMAP.bytes;
  emit({ state: 'checking', total });
  let cache: Cache;
  try { cache = await cacheP; } catch { emit({ state: 'unsupported', total }); return; }
  const keep = Object.values(BASEMAPS).map((b) => new URL(b.file, location.origin + '/').href);
  pruneBasemaps(cache, keep).catch(() => undefined);
  const b = await initialBlob;
  if (b) { emit({ state: 'saved', total: b.size, fromCache: true }); return; }
  navigator.storage?.persist?.().catch(() => undefined);
  let tileErrors = 0;
  map?.on('error', (e: any) => { if (e.sourceId === 'protomaps') tileErrors++; });
  let busy = false;
  const attempt = async (): Promise<boolean> => {
    if (busy) return false;
    if (!navigator.onLine) { emit({ state: 'offline-missing', total }); return false; }
    busy = true;
    const t0 = performance.now();
    try {
      const blob = await downloadBasemap(cache, BASEMAP_URL, BASEMAP, (loaded, t) => emit({ state: 'downloading', loaded, total: t }));
      basemapSource.setBlob(blob);
      emit({ state: 'saved', total: blob.size, ms: Math.round(performance.now() - t0) });
      if (tileErrors && map) (map.getSource('protomaps') as maplibregl.VectorTileSource | undefined)?.setUrl('pmtiles://' + BASEMAP_URL);
      return true;
    } catch (e) {
      emit({ state: 'error', total, msg: String((e as Error).message || e) });
      return false;
    } finally { busy = false; }
  };
  if (!(await attempt())) {
    const h = () => attempt().then((ok) => ok && removeEventListener('online', h));
    addEventListener('online', h);
  }
}
