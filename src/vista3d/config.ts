// Configuración de la vista 3D (aditiva: el 2D sigue siendo el predeterminado).
// DEM: teselas Terrarium (Terrain Tiles de Mapzen/Tilezen en AWS Open Data: SRTM, GMTED2010, ETOPO1),
// recortadas a Piura z5–z9 con agentards/scripts/fetch-dem.mjs. Vive junto al mapa base en public/basemap/
// para que en Cloudflare lo sirva la misma ruta KV (scripts/upload-basemap.mjs) y para quedar fuera del
// precache del service worker (igual que el mapa base: se guarda completo en Cache Storage con sha256).
import type { BasemapFile } from '../basemap-config';

export const DEM: BasemapFile = {
  key: 'dem-z9',
  file: 'basemap/piura_dem_z9.00100654.pmtiles',
  bytes: 2924589,
  sha256: '00100654d51a08f3f0a3b9000bd5df4844540000a550d2854b79d57fda00f377',
  maxzoom: 9,
  build: 'Terrain Tiles (Mapzen/AWS) z5–9, descargado 17/10/2026',
};
export const DEM_CACHE = 'yaku-dem-v1';
/** Protocolo propio de MapLibre para el DEM (src/vista3d/dem.ts): no pisa el pmtiles:// del mapa base. */
export const DEM_PROTOCOL = 'yakudem';
export const DEM_SOURCE_URL = `${DEM_PROTOCOL}://piura`;
export const DEM_ATTRIBUTION = 'Relieve: Terrain Tiles (Mapzen/AWS Open Data) · SRTM, GMTED2010, ETOPO1';
/** Bbox del recorte (agentards/scripts/lib/comun.mjs BBOX_PIURA). */
export const DEM_BOUNDS: [number, number, number, number] = [-81.36, -6.4, -79.18, -4.05];

/** Exageración vertical: 1,6× (rango pedido 1,4–1,8×). Los Andes de Piura llegan a ~3.900 m. */
export const EXAGERACION = 1.6;
export const PITCH_MAX_3D = 80;
export const PITCH_MAX_2D = 60;
/** Resolución máxima en 3D: en un celular con DPR 2,6 el terreno dibuja 3× menos píxeles y no se nota a la vista. */
export const PIXEL_RATIO_MAX_3D = 1.5;

/** Paleta cálida y desaturada (desierto costero → bosque seco → páramo), en la línea del tema crema de Yaku. */
export const RELIEVE_COLORES: [number, string][] = [
  [-50, '#d9dcd6'],
  [0, '#ece1c6'],
  [120, '#e6d6b1'],
  [400, '#d6c497'],
  [900, '#bdb282'],
  [1600, '#a4a273'],
  [2400, '#8f8a66'],
  [3100, '#9c8d76'],
  [3800, '#ddd5c8'],
];

export const CIELO = {
  'sky-color': '#bcd0dc',
  'horizon-color': '#f1e8d8',
  'fog-color': '#efe6d4',
  'sky-horizon-blend': 0.75,
  'horizon-fog-blend': 0.55,
  'fog-ground-blend': 0.4,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 1, 12, 0.3],
} as const;

/** Vista regional oblicua con horizonte (andes de Piura, mirando al este desde la costa). */
export const VISTA_REGIONAL = { center: [-80.05, -5.05] as [number, number], zoom: 8.1, pitch: 72, bearing: 62 };
