// Región del mapa: Piura (escenario oficial CENEPRED/SIGRID 23077, con relieve) o Lima (prueba en sala, con
// edificios 3D de OpenStreetMap). Se elige con ?region=lima|piura y se recuerda en este equipo (localStorage), para
// que el celular que abre /reportar desde un QR sin el parámetro siga en la misma región. ?centro=lon,lat[,zoom]
// mueve la vista inicial (p. ej. al local de la demo) sin tocar código. Sin DOM obligatorio: los tests corren en Node.
export type RegionId = 'piura' | 'lima';

export interface VistaRegion { center: [number, number]; zoom: number; pitch: number; bearing: number }

export interface Region {
  id: RegionId;
  nombre: string;
  /** Clave en BASEMAPS (src/basemap-config.ts). */
  basemap: string;
  /** Encuadre de la vista 2D [[oeste, sur], [este, norte]]. */
  bounds: [[number, number], [number, number]];
  /** Vista de entrada del 3D (oblicua). */
  vista: VistaRegion;
  /** Zoom y pitch al volar a un reporte o centro poblado. */
  acercamiento: { zoom: number; pitch: number };
  /** Relieve DEM (solo existe el de Piura). */
  terreno: boolean;
  /** Edificios en 3D (capa «buildings» de Protomaps/OSM; requiere teselas z13+). */
  edificios: boolean;
  chip: string;
  chipTitulo: string;
}

export const REGIONES: Record<RegionId, Region> = {
  piura: {
    id: 'piura', nombre: 'Piura', basemap: 'z11',
    bounds: [[-80.77, -5.94], [-79.21, -4.08]],
    vista: { center: [-80.05, -5.05], zoom: 8.1, pitch: 72, bearing: 62 },
    acercamiento: { zoom: 11.6, pitch: 64 },
    terreno: true, edificios: false,
    chip: 'Piura · Aviso 421 / FEN 2027',
    chipTitulo: 'Escenario de riesgo CENEPRED/SIGRID 23077',
  },
  lima: {
    id: 'lima', nombre: 'Lima', basemap: 'lima',
    // Lima Metropolitana y Callao (bbox del recorte z15, data/basemap/LICENSE_BASEMAP.md).
    bounds: [[-77.2, -12.3], [-76.8, -11.87]],
    // Mirando al noreste desde la Costa Verde: Miraflores y San Isidro en primer plano.
    vista: { center: [-77.032, -12.112], zoom: 14.6, pitch: 66, bearing: 28 },
    acercamiento: { zoom: 16.4, pitch: 66 },
    terreno: false, edificios: true,
    chip: 'Lima · prueba en sala',
    chipTitulo: 'Prueba en sala en Lima: reportes reales de la demo sobre el mapa de OpenStreetMap. El escenario oficial CENEPRED/SIGRID 23077 es de Piura.',
  },
};

const CLAVE = 'yaku-region';

function leerGuardada(): string | null {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(CLAVE) : null; } catch { return null; }
}
function guardar(id: RegionId) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(CLAVE, id); } catch { /* sin almacenamiento: vale para esta carga */ }
}

const esRegion = (v: string | null): v is RegionId => v === 'piura' || v === 'lima';

/** ?centro=lon,lat[,zoom] → vista con ese centro; null si no viene o no es válido. */
export function centroDe(search: string, base: VistaRegion): VistaRegion | null {
  const c = new URLSearchParams(search).get('centro');
  if (!c) return null;
  const [lon, lat, z] = c.split(',').map(Number);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return { ...base, center: [lon, lat], zoom: Number.isFinite(z) ? z : base.zoom };
}

/** Región activa: ?region= (y se recuerda) → la guardada → Piura. */
export function elegirRegion(search: string, guardada: string | null = leerGuardada(), recordar = guardar): Region {
  const q = new URLSearchParams(search).get('region');
  const id: RegionId = esRegion(q) ? q : esRegion(guardada) ? guardada : 'piura';
  if (esRegion(q)) recordar(id);
  const r = REGIONES[id];
  const v = centroDe(search, r.vista);
  return v ? { ...r, vista: v } : r;
}

export const REGION: Region = elegirRegion(typeof location !== 'undefined' ? location.search : '');

/** URL de la página actual en otra región (el mapa base cambia: hace falta cargar la página de nuevo). */
export function urlRegion(id: RegionId, href: string): string {
  const u = new URL(href);
  u.searchParams.set('region', id);
  u.searchParams.delete('centro');
  u.searchParams.delete('basemap');
  return u.href;
}
