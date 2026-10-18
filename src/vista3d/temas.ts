// Temas visuales de la escena 3D de Lima (edificios de OpenStreetMap), al estilo de los videos de ciudades 3D:
//  · claro: el tema crema de siempre;
//  · noche: fondo azul noche, edificios con color por altura (rampa fría: el ámbar queda reservado para los
//    reportes) y borde iluminado en la azotea (capa «techos»: una losa fina y clara sobre cada edificio);
//  · contraste: fondo blanco, vías oscuras y edificios en grises por altura, para proyector con la sala iluminada.
// Sin «satélite»: no hay imágenes satelitales de Lima guardadas en el equipo y la escena no pide nada afuera.
// Se cambia en caliente (setPaintProperty, setSky, setLight): sin recargar, sin perder reportes ni cámara.
// Lo elegido se recuerda en este equipo (localStorage); ?tema=claro|noche|contraste lo fija. Núcleo sin DOM.
import type { LayerSpecification, LightSpecification, SkySpecification, StyleSpecification } from 'maplibre-gl';
import { layers as pmLayers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import { CIELO } from './config';
import { CAPA_EDIFICIOS, alturaEdificio } from './edificios';

export type TemaId = 'claro' | 'noche' | 'contraste';
export const TEMA_IDS: readonly TemaId[] = ['claro', 'noche', 'contraste'];
export const CAPA_TECHOS = 'v3d-techos';
export const CLAVE_TEMA = 'yaku-tema-3d';

export interface Tema {
  id: TemaId;
  nombre: string;
  titulo: string;
  /** Paleta del mapa base (Protomaps). null = la del estilo original (tema claro). */
  flavor: Flavor | null;
  /** Color y opacidad de los edificios. null = los de la capa original. */
  edificios: { color: unknown; opacidad: number } | null;
  /** Borde iluminado en la azotea (losa de `grosor` m sobre el edificio). */
  techos: { color: unknown; opacidad: number; grosor: number } | null;
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
  city_label: '#a9b8d8', city_label_halo: '#060a13', subplace_label: '#7d8db0', subplace_label_halo: '#060a13', state_label: '#5d6b8a', state_label_halo: '#060a13', country_label: '#5d6b8a',
  ocean_label: '#4b6286', roads_label_major: '#7d8db0', roads_label_major_halo: '#060a13', roads_label_minor: '#5d6b8a', roads_label_minor_halo: '#060a13',
  landcover: { grassland: '#0c1718', barren: '#0e1420', urban_area: '#0b111d', farmland: '#0c1718', glacier: '#141b28', scrub: '#0b1419', forest: '#0c1718' },
};

const CONTRASTE: Flavor = {
  ...namedFlavor('white'),
  background: '#ffffff', earth: '#ffffff', water: '#9fc3e0',
  highway: '#1d232b', highway_casing_early: '#ffffff', highway_casing_late: '#ffffff', major: '#3a414b', major_casing_early: '#ffffff', major_casing_late: '#ffffff',
  minor_a: '#9aa1aa', minor_b: '#9aa1aa', minor_casing: '#ffffff', other: '#c3c8ce', link: '#3a414b', boundaries: '#6b7280', railway: '#6b7280',
  city_label: '#000000', city_label_halo: '#ffffff', subplace_label: '#1f2937', subplace_label_halo: '#ffffff', state_label: '#374151', state_label_halo: '#ffffff', country_label: '#374151',
  ocean_label: '#1e3a5f', roads_label_major: '#111827', roads_label_major_halo: '#ffffff', roads_label_minor: '#374151', roads_label_minor_halo: '#ffffff',
};

export const TEMAS: Record<TemaId, Tema> = {
  claro: {
    id: 'claro', nombre: 'Claro', titulo: 'Tema claro (crema): el de siempre',
    flavor: null, edificios: null, techos: null, cielo: { ...CIELO } as unknown as SkySpecification, luz: LUZ_POR_DEFECTO, oscuro: false,
  },
  noche: {
    id: 'noche', nombre: 'Noche', titulo: 'Tema noche: edificios con color por altura y borde iluminado',
    flavor: NOCHE,
    // Luminancia creciente con la altura (azul marino → azul → índigo → violeta → lavanda). Muros oscuros;
    // la azotea (losa) repite la rampa más clara: el canto iluminado y el color por altura se leen desde arriba.
    edificios: { color: rampaAltura([[0, '#0f1a33'], [9, '#13244a'], [15, '#183466'], [25, '#1f4b8f'], [40, '#3a46b0'], [70, '#6440c8'], [110, '#9a4fd8'], [160, '#d58cf0']]), opacidad: 0.96 },
    techos: { color: rampaAltura([[0, '#24427e'], [9, '#2a4c8f'], [15, '#2f63b0'], [25, '#3f86d6'], [40, '#6f7ef0'], [70, '#a98bff'], [110, '#e0b8ff'], [160, '#fff0ff']]), opacidad: 1, grosor: 0.8 },
    cielo: { 'sky-color': '#03050b', 'horizon-color': '#16204a', 'fog-color': '#0a1022', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.35, 'atmosphere-blend': 0 } as SkySpecification,
    luz: { anchor: 'viewport', position: [1.4, 200, 35], color: '#c9d4ff', intensity: 0.42 },
    oscuro: true,
  },
  contraste: {
    id: 'contraste', nombre: 'Contraste', titulo: 'Tema alto contraste: fondo blanco, vías oscuras y edificios en grises por altura',
    flavor: CONTRASTE,
    edificios: { color: rampaAltura([[0, '#dfe3e8'], [12, '#c3c9d1'], [25, '#9ba4b0'], [60, '#6b7685'], [120, '#3a4350'], [200, '#1c222b']]), opacidad: 0.95 },
    techos: null,
    cielo: { 'sky-color': '#dfe9f2', 'horizon-color': '#ffffff', 'fog-color': '#ffffff', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.4, 'atmosphere-blend': 0 } as SkySpecification,
    luz: { anchor: 'viewport', position: [1.15, 210, 30], color: '#ffffff', intensity: 0.55 },
    oscuro: false,
  },
};

export const esTema = (v: unknown): v is TemaId => typeof v === 'string' && (TEMA_IDS as readonly string[]).includes(v);

function leerGuardado(): string | null {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(CLAVE_TEMA) : null; } catch { return null; }
}
export function guardarTema(id: TemaId) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(CLAVE_TEMA, id); } catch { /* sin almacenamiento: vale para esta carga */ }
}

/** Tema activo: ?tema= (y se recuerda) → el guardado → claro. */
export function elegirTema(search: string, guardado: string | null = leerGuardado(), recordar = guardarTema): TemaId {
  const q = new URLSearchParams(search).get('tema');
  if (esTema(q)) { recordar(q); return q; }
  return esTema(guardado) ? guardado : 'claro';
}

let inicial: TemaId | null = null;
/** Tema con el que arranca la escena en esta carga de página. */
export const temaInicial = () => (inicial ??= elegirTema(typeof location !== 'undefined' ? location.search : ''));

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
 * Pinturas que cambian al pasar a `id`, calculadas sobre el estilo ORIGINAL de la escena (tema claro):
 * capas del mapa base (metadata.basemap) y edificios. Las capas oficiales y ciudadanas no se tocan.
 */
export function pinturasTema(id: TemaId, original: LayerSpecification[]): Op[] {
  const t = TEMAS[id];
  const pal = t.flavor ? paleta(t.flavor) : null;
  const ops: Op[] = [];
  for (const l of original) {
    if ((l.metadata as { basemap?: boolean } | undefined)?.basemap) {
      const nueva = pal ? pal.get(l.id) : l;
      const a = pinturaDe(l), b = pinturaDe(nueva);
      for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) ops.push([l.id, p, b[p]]);
    } else if (l.id === CAPA_EDIFICIOS) {
      const a = pinturaDe(l);
      ops.push([l.id, 'fill-extrusion-color', t.edificios?.color ?? a['fill-extrusion-color']]);
      ops.push([l.id, 'fill-extrusion-opacity', t.edificios?.opacidad ?? a['fill-extrusion-opacity']]);
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
    const o = pinta.get(l) ?? {};
    if (v !== undefined) o[p] = v;
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
