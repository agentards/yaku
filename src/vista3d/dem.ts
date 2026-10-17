// DEM de Piura para el terreno 3D, con uso sin red real.
// Igual que el mapa base (src/basemap.ts): el .pmtiles se guarda COMPLETO en Cache Storage (verificando
// tamaño + sha256) y luego MapLibre lee los rangos con Blob.slice(). Usa un protocolo propio («yakudem://»)
// para no pisar el protocolo pmtiles:// del mapa base ni depender de peticiones Range sin red.
import * as maplibregl from 'maplibre-gl';
import { PMTiles } from 'pmtiles';
import { BlobOrFetchSource, cachedBasemap, downloadBasemap, type CacheLike } from '../basemap';
import { DEM, DEM_CACHE } from './config';

export const DEM_URL = new URL(DEM.file, location.origin + '/').href;
export const DEM_PROTOCOL = 'yakudem';
export const DEM_SOURCE_URL = `${DEM_PROTOCOL}://piura`;

export type DemEstado = 'sin-iniciar' | 'comprobando' | 'descargando' | 'guardado' | 'sin-red' | 'error' | 'no-soportado';
export const demInfo = { estado: 'sin-iniciar' as DemEstado, cargado: 0, ms: 0, desdeCache: false, msg: '' };

const fuente = new BlobOrFetchSource(DEM_URL);
const pm = new PMTiles(fuente);
let registrado = false;

/** Rutas «yakudem://piura/{z}/{x}/{y}» → tesela PNG Terrarium del PMTiles. */
export function parseDemUrl(url: string): [number, number, number] | null {
  const m = /^yakudem:\/\/piura\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

export function registrarProtocoloDem() {
  if (registrado) return;
  registrado = true;
  maplibregl.addProtocol(DEM_PROTOCOL, async (params, abort) => {
    if (params.type === 'json') {
      const h = await pm.getHeader();
      return { data: { tiles: [`${DEM_SOURCE_URL}/{z}/{x}/{y}`], minzoom: h.minZoom, maxzoom: h.maxZoom, bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat], encoding: 'terrarium', tileSize: 256 } };
    }
    const zxy = parseDemUrl(params.url);
    if (!zxy) throw new Error('URL DEM inválida: ' + params.url);
    const t = await pm.getZxy(zxy[0], zxy[1], zxy[2], abort.signal);
    return { data: t ? new Uint8Array(t.data) : null } as any;
  });
}

let guardando: Promise<boolean> | null = null;
/** Guarda el DEM completo para uso sin red (una vez). Devuelve true si queda disponible desde la copia local. */
export function guardarDem(onCambio: () => void = () => {}, cacheP: Promise<CacheLike> = 'caches' in self ? caches.open(DEM_CACHE) : Promise.reject(new Error('sin Cache Storage'))): Promise<boolean> {
  if (guardando) return guardando;
  const set = (e: Partial<typeof demInfo>) => { Object.assign(demInfo, e); onCambio(); };
  guardando = (async () => {
    set({ estado: 'comprobando' });
    let cache: CacheLike;
    try { cache = await cacheP; } catch { set({ estado: 'no-soportado' }); return false; }
    const b = await cachedBasemap(cache, DEM_URL, DEM).catch(() => null);
    if (b) { fuente.setBlob(b); set({ estado: 'guardado', desdeCache: true, cargado: b.size }); return true; }
    if (!navigator.onLine) { set({ estado: 'sin-red' }); guardando = null; return false; }
    const t0 = performance.now();
    try {
      const blob = await downloadBasemap(cache, DEM_URL, DEM, (cargado) => set({ estado: 'descargando', cargado }));
      fuente.setBlob(blob);
      set({ estado: 'guardado', ms: Math.round(performance.now() - t0), cargado: blob.size });
      return true;
    } catch (e) {
      set({ estado: 'error', msg: String((e as Error).message || e) });
      guardando = null;
      return false;
    }
  })();
  return guardando;
}

/** Antes de pedir la primera tesela se consulta la copia guardada (apertura sin red = lectura del Blob). */
export function prepararFuenteDem(cacheP?: Promise<CacheLike>) {
  fuente.ready = guardarDem(() => {}, cacheP).catch(() => false);
  return fuente.ready;
}
export const demFuente = () => ({ rangeRequests: fuente.rangeRequests, blobReads: fuente.blobReads, hasBlob: !!fuente.blob });
