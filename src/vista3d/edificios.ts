// Estilo 3D por región, sin DOM (testeable en Node): Piura = relieve DEM (./relieve.ts); Lima = edificios extruidos
// desde la capa «buildings» del mapa base (Protomaps/OpenStreetMap, teselas z13+ del recorte de Lima).
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { Region } from '../region';
import { CIELO } from './config';
import { conRelieve } from './relieve';

/** Altura supuesta de un edificio sin «height» en OSM (~3 pisos): se dice en la atribución, no se presenta como dato. */
export const ALTURA_SIN_DATO = 9;
export const CAPA_EDIFICIOS = 'v3d-edificios';
export const ATRIB_EDIFICIOS = `Edificios: OpenStreetMap vía Protomaps (altura OSM; sin dato = ${ALTURA_SIN_DATO} m supuestos)`;

export function capaEdificios(): LayerSpecification {
  const alto = ['coalesce', ['get', 'height'], ALTURA_SIN_DATO];
  return {
    id: CAPA_EDIFICIOS, type: 'fill-extrusion', source: 'protomaps', 'source-layer': 'buildings', minzoom: 13.5,
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], alto, 0, '#ebe5da', 25, '#d9cfbf', 60, '#c4b6a1', 120, '#a99a84'] as any,
      // Crecen al acercarse (z13,5 → z14,6): sin «estallido» al entrar en zoom.
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14.6, alto] as any,
      'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0] as any,
      'fill-extrusion-opacity': 0.9,
      'fill-extrusion-vertical-gradient': true,
    },
  };
}

/** Copia del estilo 2D con lo 3D de la región. No modifica el original. */
export function estiloRegion(s: StyleSpecification, region: Pick<Region, 'terreno' | 'edificios'>): StyleSpecification {
  const out: StyleSpecification = region.terreno ? conRelieve(s) : { ...s, layers: [...s.layers], sky: { ...CIELO } as any };
  if (region.edificios) {
    // Bajo las etiquetas del mapa base y las capas reales (CENEPRED, reportes): los puntos quedan legibles.
    const i = out.layers.findIndex((l) => l.type === 'symbol');
    out.layers.splice(i >= 0 ? i : out.layers.length, 0, capaEdificios());
    const pm = out.sources.protomaps as { attribution?: string } | undefined;
    if (pm) out.sources = { ...out.sources, protomaps: { ...pm, attribution: `${pm.attribution ?? ''} · ${ATRIB_EDIFICIOS}` } as any };
  }
  return out;
}
