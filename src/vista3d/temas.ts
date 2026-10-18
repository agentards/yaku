// Temas del mapa de la escena 3D (Piura y Lima), que siguen al modo de la interfaz del Centro de monitoreo:
//  · claro: el tema crema de siempre;
//  · noche: fondo azul noche; en Lima, edificios con color por altura (rampa fría: el ámbar queda reservado para
//    los reportes) y borde iluminado en la azotea (capa «techos»); en Piura, relieve en azules de noche.
// Basado en el tema «Noche» de feat/demo-lima (e4ce77e), sin el selector propio del mapa: aquí lo elige el modo
// Claro / Oscuro / Sistema de la cabecera (./ui/modo.ts). Se cambia en caliente (setPaintProperty, setSky, setLight):
// sin recargar, sin perder reportes ni cámara. Las capas oficiales y ciudadanas no cambian de color, salvo el límite
// regional (casi negro) que en noche se aclara para seguir viéndose. Núcleo sin DOM (testeable en Node).
import type { LayerSpecification, LightSpecification, SkySpecification, StyleSpecification } from 'maplibre-gl';
import { layers as pmLayers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import { CIELO } from './config';
import { CAPA_EDIFICIOS, alturaEdificio } from './edificios';
import { CAPA_COLOR, CAPA_SOMBRA } from './relieve';

export type TemaId = 'claro' | 'noche';
export const TEMA_IDS: readonly TemaId[] = ['claro', 'noche'];
export const CAPA_TECHOS = 'v3d-techos';

export interface Tema {
  id: TemaId;
  /** Paleta del mapa base (Protomaps). null = la del estilo original (tema claro). */
  flavor: Flavor | null;
  /** Color y opacidad de los edificios (Lima). null = los de la capa original. */
  edificios: { color: unknown; opacidad: number } | null;
  /** Borde iluminado en la azotea (losa de `grosor` m sobre el edificio). */
  techos: { color: unknown; opacidad: number; grosor: number } | null;
  /** Relieve de Piura: rampa de color por altitud y sombreado. null = los originales. */
  relieve: { colores: [number, string][]; sombra: string; luz: string; acento: string; opacidad: number } | null;
  /** Pinturas puntuales de capas oficiales que con el fondo oscuro dejarían de verse. */
  extra: Record<string, Record<string, unknown>>;
  cielo: SkySpecification;
  luz: LightSpecification;
  oscuro: boolean;
}

/** Luz por defecto de MapLibre (la del tema claro, que nunca la cambió). */
export const LUZ_POR_DEFECTO: LightSpecification = { anchor: 'viewport', position: [1.15, 210, 30], color: '#ffffff', intensity: 0.5 };

/** Color por altura del edificio (m): interpolación lineal entre los pares [altura, color]. */
export const rampaAltura = (pares: [number, string][]) => ['interpolate', ['linear'], alturaEdificio(), ...pares.flat()];

const NOCHE: Flavor = {
  ...namedFlavor('dark'),
  background: '#060a13', earth: '#0a101c', water: '#03060b',
  park_a: '#0c1718', park_b: '#0d1a1a', wood_a: '#0c1718', wood_b: '#0d1a1a', scrub_a: '#0b1419', scrub_b: '#0b1419',
  sand: '#0e1420', beach: '#101724', industrial: '#0b111d', hospital: '#0c121e', school: '#0c121e', aerodrome: '#0b111d', zoo: '#0c1718', military: '#0b111d', pedestrian: '#0e1522',
  highway: '#3a4c74', highway_casing_early: '#0a101c', highway_casing_late: '#0a101c', major: '#2a3858', major_casing_early: '#0a101c', major_casing_late: '#0a101c',
  minor_a: '#1a2338', minor_b: '#1a2338', minor_casing: '#0a101c', other: '#161e30', link: '#2a3858', boundaries: '#3a4660', railway: '#2a3448',
  city_label: '#c3cfe6', city_label_halo: '#060a13', subplace_label: '#8e9dbd', subplace_label_halo: '#060a13', state_label: '#6d7b99', state_label_halo: '#060a13', country_label: '#6d7b99',
  ocean_label: '#5b7296', roads_label_major: '#8e9dbd', roads_label_major_halo: '#060a13', roads_label_minor: '#6d7b99', roads_label_minor_halo: '#060a13',
  landcover: { grassland: '#0c1718', barren: '#0e1420', urban_area: '#0b111d', farmland: '#0c1718', glacier: '#141b28', scrub: '#0b1419', forest: '#0c1718' },
};

export const TEMAS: Record<TemaId, Tema> = {
  claro: {
    id: 'claro', flavor: null, edificios: null, techos: null, relieve: null, extra: {},
    cielo: { ...CIELO } as unknown as SkySpecification, luz: LUZ_POR_DEFECTO, oscuro: false,
  },
  noche: {
    id: 'noche',
    flavor: NOCHE,
    // Luminancia creciente con la altura (azul marino → azul → índigo → violeta → lavanda). Muros oscuros;
    // la azotea (losa) repite la rampa más clara: el canto iluminado y el color por altura se leen desde arriba.
    edificios: { color: rampaAltura([[0, '#0f1a33'], [9, '#13244a'], [15, '#183466'], [25, '#1f4b8f'], [40, '#3a46b0'], [70, '#6440c8'], [110, '#9a4fd8'], [160, '#d58cf0']]), opacidad: 0.96 },
    techos: { color: rampaAltura([[0, '#24427e'], [9, '#2a4c8f'], [15, '#2f63b0'], [25, '#3f86d6'], [40, '#6f7ef0'], [70, '#a98bff'], [110, '#e0b8ff'], [160, '#fff0ff']]), opacidad: 1, grosor: 0.8 },
    // Piura: desierto costero → Andes en azules de noche; las cumbres un poco más claras para leer el relieve.
    relieve: {
      colores: [[-50, '#05080f'], [0, '#0a101c'], [120, '#0d1424'], [400, '#111a2d'], [900, '#162238'], [1600, '#1b2a44'], [2400, '#223352'], [3100, '#2a3c5e'], [3800, '#3a4c70']],
      sombra: '#000000', luz: '#4a5d86', acento: '#0d1526', opacidad: 0.95,
    },
    extra: { 'limite-line': { 'line-color': '#9fb3d6' } },
    cielo: { 'sky-color': '#03050b', 'horizon-color': '#16204a', 'fog-color': '#0a1022', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.35, 'atmosphere-blend': 0 } as SkySpecification,
    luz: { anchor: 'viewport', position: [1.4, 200, 35], color: '#c9d4ff', intensity: 0.42 },
    oscuro: true,
  },
};

export const esTema = (v: unknown): v is TemaId => typeof v === 'string' && (TEMA_IDS as readonly string[]).includes(v);

/** Losa fina sobre cada edificio (mismo crecimiento con el zoom que la capa de edificios). */
export function capaTechos(t: Tema, visible = true): LayerSpecification {
  const alto = alturaEdificio();
  const crece = (v: unknown) => ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14.6, v];
  return {
    id: CAPA_TECHOS, type: 'fill-extrusion', source: 'protomaps', 'source-layer': 'buildings', minzoom: 13.5,
    layout: { visibility: visible ? 'visible' : 'none' },
    paint: {
      'fill-extrusion-color': t.techos!.color as any,
      'fill-extrusion-base': crece(alto) as any,
      'fill-extrusion-height': crece(['+', alto, t.techos!.grosor]) as any,
      'fill-extrusion-opacity': t.techos!.opacidad,
      'fill-extrusion-vertical-gradient': false,
    },
  };
}

export type Op = [capa: string, prop: string, valor: unknown];
const cachePaleta = new Map<Flavor, Map<string, LayerSpecification>>();
const paleta = (f: Flavor) => {
  let m = cachePaleta.get(f);
  if (!m) cachePaleta.set(f, (m = new Map((pmLayers('protomaps', f, { lang: 'es' }) as LayerSpecification[]).map((l) => [l.id, l]))));
  return m;
};
const pinturaDe = (l: LayerSpecification | undefined) => ((l as { paint?: Record<string, unknown> } | undefined)?.paint ?? {});

/**
 * Pinturas que cambian al pasar a `id`, calculadas sobre el estilo ORIGINAL de la escena (tema claro): capas del mapa
 * base (metadata.basemap), edificios, relieve y los ajustes puntuales del tema. Reportes y capas oficiales no se tocan.
 */
export function pinturasTema(id: TemaId, original: LayerSpecification[]): Op[] {
  const t = TEMAS[id];
  const pal = t.flavor ? paleta(t.flavor) : null;
  const extras = new Set([...TEMA_IDS.flatMap((k) => Object.keys(TEMAS[k].extra))]);
  const ops: Op[] = [];
  for (const l of original) {
    const a = pinturaDe(l);
    if ((l.metadata as { basemap?: boolean } | undefined)?.basemap) {
      const b = pinturaDe(pal ? pal.get(l.id) : l);
      for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) ops.push([l.id, p, b[p]]);
    } else if (l.id === CAPA_EDIFICIOS) {
      ops.push([l.id, 'fill-extrusion-color', t.edificios?.color ?? a['fill-extrusion-color']]);
      ops.push([l.id, 'fill-extrusion-opacity', t.edificios?.opacidad ?? a['fill-extrusion-opacity']]);
    } else if (l.id === CAPA_COLOR) {
      ops.push([l.id, 'color-relief-color', t.relieve ? ['interpolate', ['linear'], ['elevation'], ...t.relieve.colores.flat()] : a['color-relief-color']]);
      ops.push([l.id, 'color-relief-opacity', t.relieve?.opacidad ?? a['color-relief-opacity']]);
    } else if (l.id === CAPA_SOMBRA) {
      ops.push([l.id, 'hillshade-shadow-color', t.relieve?.sombra ?? a['hillshade-shadow-color']]);
      ops.push([l.id, 'hillshade-highlight-color', t.relieve?.luz ?? a['hillshade-highlight-color']]);
      ops.push([l.id, 'hillshade-accent-color', t.relieve?.acento ?? a['hillshade-accent-color']]);
    } else if (extras.has(l.id)) {
      const props = new Set(TEMA_IDS.flatMap((k) => Object.keys(TEMAS[k].extra[l.id] ?? {})));
      for (const p of props) ops.push([l.id, p, t.extra[l.id]?.[p] ?? a[p]]);
    }
  }
  return ops;
}

/** Copia del estilo de la escena (tema claro) con el tema `id` aplicado: para crear el mapa ya con el tema. */
export function conTema(s: StyleSpecification, id: TemaId): StyleSpecification {
  if (id === 'claro') return s;
  const t = TEMAS[id];
  const pinta = new Map<string, Record<string, unknown>>();
  for (const [l, p, v] of pinturasTema(id, s.layers)) {
    const o = pinta.get(l) ?? { ...pinturaDe(s.layers.find((x) => x.id === l)) };
    if (v !== undefined) o[p] = v; else delete o[p];
    pinta.set(l, o);
  }
  const layers = s.layers.map((l) => (pinta.has(l.id) ? ({ ...l, paint: pinta.get(l.id) } as LayerSpecification) : l));
  const i = layers.findIndex((l) => l.id === CAPA_EDIFICIOS);
  if (t.techos && i >= 0) layers.splice(i + 1, 0, capaTechos(t));
  return { ...s, layers, sky: { ...t.cielo }, light: { ...t.luz } };
}

/** Lo que usa aplicarTema del mapa (MapLibre o un doble de prueba). */
export interface MapaTema {
  getLayer(id: string): unknown;
  setPaintProperty(capa: string, prop: string, v: unknown): unknown;
  getLayoutProperty(capa: string, prop: string): unknown;
  addLayer(l: LayerSpecification, antes?: string): unknown;
  removeLayer(id: string): unknown;
  getLayersOrder(): string[];
  setSky(s: SkySpecification): unknown;
  setLight(l: LightSpecification): unknown;
}

/** Cambia el tema del mapa en caliente. `original` = capas de la escena en tema claro (estiloEscena().layers). */
export function aplicarTema(map: MapaTema, id: TemaId, original: LayerSpecification[]) {
  const t = TEMAS[id];
  for (const [l, p, v] of pinturasTema(id, original)) if (map.getLayer(l)) map.setPaintProperty(l, p, v);
  if (map.getLayer(CAPA_TECHOS)) map.removeLayer(CAPA_TECHOS);
  if (t.techos && map.getLayer(CAPA_EDIFICIOS)) {
    const orden = map.getLayersOrder();
    const despues = orden[orden.indexOf(CAPA_EDIFICIOS) + 1];
    map.addLayer(capaTechos(t, map.getLayoutProperty(CAPA_EDIFICIOS, 'visibility') !== 'none'), despues);
  }
  map.setSky({ ...t.cielo });
  map.setLight({ ...t.luz });
}
