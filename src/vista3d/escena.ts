// Escena 3D real de Yaku (implementa EscenaYaku de ./ui/contrato): el estilo local de la vista 2D + relieve
// DEM de Piura (terreno 1,6×, color por altitud, sombreado, cielo con bruma) y la cámara cinematográfica.
// Reemplaza a ./escena-prueba.ts sin cambiar la UI. Todo local: PMTiles (mapa base y DEM) desde Cache Storage.
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { style as estilo2D, LAYER_GROUPS } from '../map';
import { CENEPRED_23077_BOUNDS } from '../layers';
import type { CapaId, CentroPoblado, EscenaYaku, PuntoReporte } from './ui/contrato';
import { CAPAS_RELIEVE, conRelieve, SRC_TERRENO, terreno } from './relieve';
import { prepararFuenteDem, registrarProtocoloDem } from './dem';
import { PITCH_MAX_3D, PIXEL_RATIO_MAX_3D, VISTA_REGIONAL } from './config';
import { Recorrido } from './camara';

const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Propiedades de opacidad por tipo de capa (la del panel multiplica la de diseño). */
const OPACIDAD: Record<string, string[]> = {
  fill: ['fill-opacity'], line: ['line-opacity'], circle: ['circle-opacity', 'circle-stroke-opacity'],
  symbol: ['text-opacity', 'icon-opacity'], 'fill-extrusion': ['fill-extrusion-opacity'], raster: ['raster-opacity'],
  hillshade: ['hillshade-exaggeration'], 'color-relief': ['color-relief-opacity'], background: ['background-opacity'],
};
/** Valor de opacidad = diseño × v. Las expresiones con zoom no se pueden envolver: se reemplazan por v. */
export function opacidadEscalada(base: unknown, v: number, porDefecto = 1): unknown {
  if (base === undefined) return porDefecto * v;
  if (typeof base === 'number') return +(base * v).toFixed(3);
  return JSON.stringify(base).includes('"zoom"') ? v : ['*', base, v];
}

export function estiloEscena(): StyleSpecification {
  const s = conRelieve(structuredClone(estilo2D));
  s.sources['v3d-sel'] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  const sel: LayerSpecification[] = [
    { id: 'v3d-sel-halo', type: 'circle', source: 'v3d-sel', paint: { 'circle-radius': 18, 'circle-color': '#c9541f', 'circle-opacity': 0.18, 'circle-stroke-color': '#c9541f', 'circle-stroke-width': 2, 'circle-pitch-alignment': 'map' } },
    { id: 'v3d-sel-dot', type: 'circle', source: 'v3d-sel', paint: { 'circle-radius': 5, 'circle-color': '#c9541f', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } },
  ];
  s.layers.push(...sel);
  return s;
}

export function crearEscena(cont: HTMLElement): EscenaYaku {
  registrarProtocoloDem();
  prepararFuenteDem();
  const style = estiloEscena();
  const R = VISTA_REGIONAL;
  const map = new maplibregl.Map({
    container: cont, style, center: R.center, zoom: R.zoom - 1.2, pitch: 45, bearing: R.bearing - 30,
    maxPitch: PITCH_MAX_3D, attributionControl: false, maxZoom: 16, minZoom: 5, pixelRatio: Math.min(devicePixelRatio, PIXEL_RATIO_MAX_3D),
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'MapLibre' }), 'bottom-left');
  const cam = new Recorrido(map);
  // Entrada: vuelo regional oblicuo con horizonte (desde una vista más alta y girada).
  const listo = new Promise<void>((res) => map.once('load', () => { res(); cam.vistaRegional(); }));
  const cancelar = () => { if (cam.fase !== 'inactivo') cam.detener(); };
  for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const) map.getCanvasContainer().addEventListener(ev, cancelar, { passive: true });

  const grupos: Record<CapaId, string[]> = {
    terreno: [...CAPAS_RELIEVE],
    basemap: LAYER_GROUPS.basemap, cenepred: LAYER_GROUPS.cenepred ?? [], senamhi: LAYER_GROUPS.senamhi,
    erosion: LAYER_GROUPS.erosion, limite: LAYER_GROUPS.limite, citizen: LAYER_GROUPS.citizen,
  };
  const base = new Map(style.layers.map((l) => [l.id, l]));

  const elegir = new Set<(cod: string) => void>();
  map.on('click', 'cenepred-ccpp', (e) => { const cod = e.features?.[0]?.properties?.cod; if (cod) elegir.forEach((cb) => cb(String(cod))); });
  map.on('mouseenter', 'cenepred-ccpp', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'cenepred-ccpp', () => (map.getCanvas().style.cursor = ''));

  let es2D = false, terrenoOn = true;
  const aplicarTerreno = () => map.setTerrain(terrenoOn && !es2D ? terreno() : null);
  const esc: EscenaYaku = {
    map, listo,
    tieneTerreno: () => !!map.getTerrain(),
    capas: () => (Object.keys(grupos) as CapaId[]).filter((k) => grupos[k].length),
    setCapaVisible(id, on) {
      if (id === 'terreno') { terrenoOn = on; aplicarTerreno(); }
      for (const l of grupos[id]) if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none');
    },
    setCapaOpacidad(id, v) {
      for (const l of grupos[id]) {
        const spec = base.get(l);
        if (!spec || !map.getLayer(l)) continue;
        for (const p of OPACIDAD[spec.type] ?? []) map.setPaintProperty(l, p as any,opacidadEscalada((spec as any).paint?.[p], v, p === 'hillshade-exaggeration' ? 0.5 : 1));
      }
    },
    setFiltroSinCobertura(on) { if (map.getLayer('cenepred-ccpp')) map.setFilter('cenepred-ccpp', on ? ['==', ['get', 'cg'], false] : null); },
    setReportes(p: PuntoReporte[]) {
      (map.getSource('citizen') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: p.map((x) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x.lon, x.lat] }, properties: { ...x } })) });
    },
    setSeleccion(cp: CentroPoblado | null) {
      (map.getSource('v3d-sel') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: cp ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [cp.lon, cp.lat] }, properties: {} }] : [] });
    },
    async volarA(cp) {
      if (es2D) {
        cam.detener();
        await new Promise<void>((res) => { map.once('moveend', () => res()); map.flyTo({ center: [cp.lon, cp.lat], zoom: 12.4, duration: reducido() ? 0 : 2200, essential: true }); });
        return;
      }
      await cam.iniciar([cp.lon, cp.lat], { saltarRegional: true });
    },
    async vistaRegional() {
      cam.detener();
      if (es2D) await new Promise<void>((res) => { map.once('moveend', () => res()); map.fitBounds(CENEPRED_23077_BOUNDS, { padding: 24, pitch: 0, bearing: 0, duration: reducido() ? 0 : 1800 }); });
      else await cam.vistaRegional();
    },
    altitud(lon, lat) {
      const e = map.queryTerrainElevation([lon, lat]);
      const ex = map.getTerrain()?.exaggeration ?? 1;
      return e === null || e === undefined ? null : Math.round(e / ex);
    },
    proyectar(lon, lat) {
      const p = map.project([lon, lat]);
      return Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
    },
    onElegirCentro(cb) { elegir.add(cb); return () => elegir.delete(cb); },
    estiloMiniVista() {
      // Mini-vista liviana: sin etiquetas ni capas densas; el terreno lo pone la UI con terrenoMiniVista().
      const s = estiloEscena();
      s.layers = s.layers.filter((l) => l.type !== 'symbol' && !l.id.startsWith('erosion') && !l.id.startsWith('citizen'));
      delete s.terrain;
      return s;
    },
    terrenoMiniVista: () => terreno(),
    set2D(on) {
      es2D = on; cam.detener();
      aplicarTerreno();
      map.setMaxPitch(PITCH_MAX_3D);
      map.easeTo({ pitch: on ? 0 : 60, bearing: on ? 0 : map.getBearing(), duration: reducido() ? 0 : 900 });
      if (on) map.once('moveend', () => { if (es2D) map.setMaxPitch(0); }); // 2D plano, como el FireTrace
    },
    destruir() { cam.detener(); map.remove(); },
  };
  (window as any).__yakuEscena = { map, cam, fuente: SRC_TERRENO };
  return esc;
}
