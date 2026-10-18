// Configuración de la vista 3D (aditiva: el 2D sigue siendo el predeterminado).
// DEM: teselas Terrarium (Terrain Tiles de Mapzen/Tilezen en AWS Open Data: SRTM, GMTED2010, ETOPO1),
// recortadas a Piura z5–z9 con un script de preparación de datos (fuera del repo). Vive junto al mapa base en public/basemap/
// para que en Cloudflare lo sirva la misma ruta KV (scripts/upload-basemap.mjs) y para quedar fuera del
// precache del service worker (igual que el mapa base: se guarda completo en Cache Storage con sha256).
import type { BasemapFile } from '../basemap-config';
import { REGION } from '../region';

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
/** Bbox del recorte (BBOX_PIURA del script de preparación de datos). */
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

/** Vista regional oblicua con horizonte (Piura: andes mirando al este desde la costa; Lima: Miraflores y San Isidro). */
export const VISTA_REGIONAL = REGION.vista;
/** Zoom y pitch al volar a un reporte o centro poblado (Lima más cerca: se ven los edificios). */
export const ACERCAMIENTO = REGION.acercamiento;

/**
 * Preset «Ver desde la cuenca»: cámara sobre el río Piura aguas arriba, mirando río abajo al Bajo Piura.
 * Puntos elegidos por scripts/cuenca-dem.mjs, sin red: cauce = «Río Piura» del mapa base local (OpenStreetMap
 * vía Protomaps, z11); cota = este mismo DEM (z9). «desde» = primer vértice río arriba de la ciudad cuya cota
 * (mediana móvil de 51 vértices) llega a 60 m: tramo de Tambogrande. «hacia» = vértice mediano (por latitud)
 * del tramo bajo 25 m al sur de la ciudad: entre Catacaos y La Arena. Cotas en m s. n. m. sin exagerar.
 */
export const CUENCA = {
  desde: { lon: -80.3775, lat: -4.937, m: 60 },
  hacia: { lon: -80.6251, lat: -5.4148, m: 17 },
  pitch: 76,
  duracion: 6000,
};
/** Nota fija junto al preset: qué es el relieve y qué no es. */
export const NOTA_RELIEVE = 'Relieve: Terrain Tiles z5–9 (descargado 17/10/2026), exageración vertical 1,6×. Ayuda a leer por dónde baja el agua; no es un modelo de inundación';
