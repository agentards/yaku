// Configuración ÚNICA del mapa base vectorial (PMTiles, Protomaps, © OpenStreetMap contributors, ODbL).
// Para cambiar de archivo: editar DEFAULT_BASEMAP o agregar una entrada a BASEMAPS
// (los archivos viven en public/basemap/; el nombre lleva los 8 primeros hex del sha256
// para que un nuevo build invalide la copia guardada sin red).
// En tiempo de ejecución se puede elegir otra entrada con ?basemap=<clave>, p. ej. ?basemap=z12.
export interface BasemapFile {
  key: string;
  file: string;   // ruta relativa al sitio
  bytes: number;
  sha256: string;
  maxzoom: number;
  build: string;  // build de Protomaps del que se extrajo
}

import { FEAT } from './features';

export const BASEMAPS: Record<string, BasemapFile> = {
  z11: { key: 'z11', file: 'basemap/piura_basemap_z11.5e31b1dc.pmtiles', bytes: 2594101, sha256: '5e31b1dc9c92ac4348740bf23e79641f040aab044274335f9321a200cdf58e04', maxzoom: 11, build: 'Protomaps 20261017 (OSM hasta 2026-10-17T04:00Z)' },
  // Lima Metropolitana y Callao hasta z15, con edificios (alturas OSM) para la prueba en sala (?region=lima).
  lima: { key: 'lima', file: 'basemap/lima_basemap_z15.c2041e0d.pmtiles', bytes: 21181493, sha256: 'c2041e0d16206c690ddb7b9611b351bddf0bea28e980a57e151b8ee4f06982f9', maxzoom: 15, build: 'Protomaps 20261017 (OSM hasta 2026-10-17T04:00Z)' },
  ...(FEAT.z12 ? { z12: { key: 'z12', file: 'basemap/piura_basemap_z12.cc6d9219.pmtiles', bytes: 5740095, sha256: 'cc6d9219ed04d853371cae00fc59f2b631ba37f82884df33dbaf5d1eaef9e1cd', maxzoom: 12, build: 'Protomaps 20261017 (OSM hasta 2026-10-17T04:00Z)' } } : {}),
};

export const DEFAULT_BASEMAP = 'z11';

/** Elige el mapa base: ?basemap=<clave> si existe en BASEMAPS; si no, el predeterminado. */
export function selectBasemap(search: string, table = BASEMAPS, def = DEFAULT_BASEMAP): BasemapFile {
  const k = new URLSearchParams(search).get('basemap');
  return (k && Object.prototype.hasOwnProperty.call(table, k) ? table[k] : table[def]);
}

export const BASEMAP_ATTRIBUTION =
  '<a href="https://github.com/protomaps/basemaps" target="_blank" rel="noopener">Protomaps</a> · ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> (ODbL)';
