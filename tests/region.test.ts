import { describe, expect, it } from 'vitest';
import { REGIONES, centroDe, elegirRegion, urlRegion } from '../src/region';
import { BASEMAPS } from '../src/basemap-config';
import { CENEPRED_23077_BOUNDS } from '../src/layers';
import type { StyleSpecification } from 'maplibre-gl';
import { CAPA_EDIFICIOS, estiloRegion } from '../src/vista3d/edificios';

const base = (): StyleSpecification => ({
  version: 8,
  sources: { protomaps: { type: 'vector', url: 'pmtiles://x', attribution: 'OSM' }, citizen: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
  layers: [
    { id: 'earth', type: 'fill', source: 'protomaps', 'source-layer': 'earth' },
    { id: 'water', type: 'fill', source: 'protomaps', 'source-layer': 'water' },
    { id: 'places', type: 'symbol', source: 'protomaps', 'source-layer': 'places' },
    { id: 'citizen-dot', type: 'circle', source: 'citizen' },
  ],
});

describe('región del mapa (Piura | Lima)', () => {
  it('por defecto Piura; ?region=lima elige Lima y la recuerda', () => {
    const guardadas: string[] = [];
    expect(elegirRegion('', null, (id) => guardadas.push(id)).id).toBe('piura');
    expect(elegirRegion('?region=lima', null, (id) => guardadas.push(id)).id).toBe('lima');
    expect(guardadas).toEqual(['lima']);
  });

  it('sin parámetro usa la guardada; un valor raro no cambia nada', () => {
    expect(elegirRegion('', 'lima', () => {}).id).toBe('lima');
    expect(elegirRegion('?region=cusco', 'lima', () => {}).id).toBe('lima');
    expect(elegirRegion('?region=cusco', 'x', () => {}).id).toBe('piura');
  });

  it('?centro=lon,lat[,zoom] mueve la vista inicial; inválido se ignora', () => {
    const v = REGIONES.lima.vista;
    expect(centroDe('?centro=-77.02,-12.09,15.5', v)).toMatchObject({ center: [-77.02, -12.09], zoom: 15.5, pitch: v.pitch });
    expect(centroDe('?centro=-77.02,-12.09', v)?.zoom).toBe(v.zoom);
    expect(centroDe('?centro=abc', v)).toBeNull();
    expect(centroDe('?centro=-277,5', v)).toBeNull();
  });

  it('cada región apunta a un mapa base que existe y Piura conserva su encuadre oficial', () => {
    for (const r of Object.values(REGIONES)) expect(BASEMAPS[r.basemap]).toBeDefined();
    expect(REGIONES.piura.bounds).toEqual(CENEPRED_23077_BOUNDS);
    expect(REGIONES.lima.terreno).toBe(false);
    expect(BASEMAPS.lima.maxzoom).toBe(15);
  });

  it('urlRegion cambia la región y limpia centro/basemap', () => {
    expect(urlRegion('lima', 'https://x/municipalidad?vista=portal&centro=1,2&basemap=z12#a')).toBe('https://x/municipalidad?vista=portal&region=lima#a');
  });
});

describe('estilo 3D según región', () => {
  it('Lima: edificios extruidos bajo las etiquetas, sin terreno DEM, con atribución de la altura supuesta', () => {
    const b = base();
    const s = estiloRegion(b, REGIONES.lima);
    expect(s.terrain).toBeUndefined();
    const i = s.layers.findIndex((l) => l.id === CAPA_EDIFICIOS);
    expect(i).toBe(2);
    expect(s.layers[i + 1].type).toBe('symbol');
    expect((s.sources.protomaps as { attribution: string }).attribution).toMatch(/sin dato = 9 m supuestos/);
    expect(b.layers).toHaveLength(4); // no toca el original
  });

  it('Piura: igual que antes (relieve, sin edificios)', () => {
    const s = estiloRegion(base(), REGIONES.piura);
    expect(s.terrain).toBeDefined();
    expect(s.layers.some((l) => l.type === 'fill-extrusion')).toBe(false);
  });
});
