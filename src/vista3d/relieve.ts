// Relieve de Piura sobre un estilo de MapLibre: terreno DEM exagerado, color por altitud, sombreado y cielo
// con bruma. Funciones puras sobre StyleSpecification (testeables en Node) + activar/quitar sobre un mapa vivo.
// Las capas reales (SENAMHI, SIGRID, CENEPRED, límite, reportes) no se tocan: con terreno activo MapLibre las
// drapea sobre la malla del relieve (fill/line se proyectan; los círculos se acuestan con pitch-alignment map).
import type { LayerSpecification, Map as MLMap, SourceSpecification, StyleSpecification } from 'maplibre-gl';
import { CIELO, DEM_ATTRIBUTION, DEM_SOURCE_URL, EXAGERACION, RELIEVE_COLORES } from './config';

/** Dos fuentes del mismo DEM: MapLibre recomienda no compartir la del terreno con el sombreado. */
export const SRC_TERRENO = 'v3d-dem';
export const SRC_RELIEVE = 'v3d-dem-relieve';
export const CAPA_COLOR = 'v3d-relieve-color';
export const CAPA_SOMBRA = 'v3d-relieve-sombra';
export const CAPAS_RELIEVE = [CAPA_COLOR, CAPA_SOMBRA];
/** Capas de puntos que se acuestan sobre el relieve en 3D (en 2D da igual). */
const CIRCULOS_DRAPEADOS = ['cenepred-ccpp', 'erosion-pts', 'citizen-halo'];

export function fuentesRelieve(url = DEM_SOURCE_URL): Record<string, SourceSpecification> {
  const dem = { type: 'raster-dem', url, encoding: 'terrarium', tileSize: 256 } as const;
  return { [SRC_TERRENO]: { ...dem, attribution: DEM_ATTRIBUTION }, [SRC_RELIEVE]: { ...dem } };
}

export function capasRelieve(): LayerSpecification[] {
  return [
    {
      id: CAPA_COLOR, type: 'color-relief', source: SRC_RELIEVE,
      paint: { 'color-relief-color': ['interpolate', ['linear'], ['elevation'], ...RELIEVE_COLORES.flat()] as any, 'color-relief-opacity': 0.9 },
    },
    {
      id: CAPA_SOMBRA, type: 'hillshade', source: SRC_RELIEVE,
      paint: {
        // «standard»: más barato que multidireccional en celulares y con sombras más cálidas y suaves.
        'hillshade-method': 'standard', 'hillshade-exaggeration': 0.5, 'hillshade-illumination-direction': 315,
        'hillshade-shadow-color': '#6e5a43', 'hillshade-highlight-color': '#fffaf0', 'hillshade-accent-color': '#8c7051',
      },
    },
  ];
}

/** Dónde insertar el relieve: sobre la tierra y los usos de suelo del mapa base, bajo el agua, vías y capas reales. */
export function indiceRelieve(layers: { id: string }[]) {
  const i = layers.findIndex((l) => l.id === 'water' || l.id.startsWith('water'));
  if (i >= 0) return i;
  const e = layers.findIndex((l) => l.id === 'earth');
  return e >= 0 ? e + 1 : Math.min(1, layers.length);
}

export const terreno = (exaggeration = EXAGERACION) => ({ source: SRC_TERRENO, exaggeration });

/** Copia del estilo con relieve (fuentes, capas, terreno y cielo). No modifica el original. */
export function conRelieve(s: StyleSpecification, { exageracion = EXAGERACION, url = DEM_SOURCE_URL, conTerreno = true } = {}): StyleSpecification {
  const out: StyleSpecification = { ...s, sources: { ...s.sources, ...fuentesRelieve(url) }, layers: [...s.layers] };
  out.layers.splice(indiceRelieve(out.layers), 0, ...capasRelieve());
  out.layers = out.layers.map((l) => (l.type === 'circle' && CIRCULOS_DRAPEADOS.includes(l.id) ? { ...l, paint: { ...l.paint, 'circle-pitch-alignment': 'map' } } : l));
  if (conTerreno) out.terrain = terreno(exageracion);
  out.sky = { ...CIELO } as any;
  return out;
}

/** Enciende el relieve en un mapa ya cargado (el mismo mapa del 2D: sin segundo contexto WebGL). */
export function activarRelieve(map: MLMap, exageracion = EXAGERACION) {
  for (const [id, src] of Object.entries(fuentesRelieve())) if (!map.getSource(id)) map.addSource(id, src);
  const capas = map.getStyle().layers;
  const antes = capas[indiceRelieve(capas)]?.id;
  for (const l of capasRelieve()) if (!map.getLayer(l.id)) map.addLayer(l, antes);
  for (const id of CIRCULOS_DRAPEADOS) if (map.getLayer(id)) map.setPaintProperty(id, 'circle-pitch-alignment', 'map');
  map.setTerrain(terreno(exageracion));
  map.setSky({ ...CIELO } as any);
}

/** Vuelve al estilo plano: quita terreno, cielo, capas y fuentes del relieve. */
export function quitarRelieve(map: MLMap) {
  map.setTerrain(null);
  map.setSky(undefined as any);
  for (const id of CAPAS_RELIEVE) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of [SRC_TERRENO, SRC_RELIEVE]) if (map.getSource(id)) map.removeSource(id);
  for (const id of CIRCULOS_DRAPEADOS) if (map.getLayer(id)) map.setPaintProperty(id, 'circle-pitch-alignment', 'viewport');
}
