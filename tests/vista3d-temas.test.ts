import { describe, expect, it } from 'vitest';
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { layers as pmLayers, namedFlavor } from '@protomaps/basemaps';
import { REGIONES } from '../src/region';
import { CAPA_EDIFICIOS, estiloRegion } from '../src/vista3d/edificios';
import { CAPA_TECHOS, TEMAS, TEMA_IDS, aplicarTema, conTema, elegirTema, pinturasTema, type MapaTema } from '../src/vista3d/temas';

// Estilo de escena como el real: capas del mapa base Protomaps (metadata.basemap) + capas oficiales y ciudadanas.
const estilo = (): StyleSpecification => {
  const bm = (pmLayers('protomaps', namedFlavor('light'), { lang: 'es' }) as LayerSpecification[]).filter((l) => l.id !== 'buildings' && l.id !== 'pois').map((l) => ({ ...l, metadata: { basemap: true } }));
  const s: StyleSpecification = {
    version: 8,
    sources: { protomaps: { type: 'vector', url: 'pmtiles://x' }, citizen: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
    layers: [...bm, { id: 'citizen-dot', type: 'circle', source: 'citizen', paint: { 'circle-color': '#e08a00' } }],
  };
  return estiloRegion(s, REGIONES.lima);
};

/** Doble del mapa: guarda pinturas, orden de capas, cielo y luz. */
function mapaFalso(s: StyleSpecification) {
  const capas = s.layers.map((l) => structuredClone(l)) as (LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown> })[];
  const m = { cielo: null as unknown, luz: null as unknown, pinturas: 0, capas,
    getLayer: (id: string) => capas.find((l) => l.id === id),
    setPaintProperty(id: string, p: string, v: unknown) { const l = capas.find((x) => x.id === id)!; l.paint = { ...l.paint, [p]: v }; m.pinturas++; },
    getLayoutProperty: (id: string, p: string) => capas.find((l) => l.id === id)?.layout?.[p],
    addLayer(l: LayerSpecification, antes?: string) { const i = antes ? capas.findIndex((x) => x.id === antes) : -1; capas.splice(i >= 0 ? i : capas.length, 0, l as any); },
    removeLayer(id: string) { capas.splice(capas.findIndex((x) => x.id === id), 1); },
    getLayersOrder: () => capas.map((l) => l.id),
    setSky(c: unknown) { m.cielo = c; },
    setLight(c: unknown) { m.luz = c; },
  };
  return m satisfies MapaTema;
}

describe('temas de la escena 3D de Lima', () => {
  it('?tema= elige y se recuerda; sin parámetro usa el guardado; por defecto claro', () => {
    const g: string[] = [];
    expect(elegirTema('', null, (id) => g.push(id))).toBe('claro');
    expect(elegirTema('?tema=noche', 'contraste', (id) => g.push(id))).toBe('noche');
    expect(elegirTema('', 'contraste', (id) => g.push(id))).toBe('contraste');
    expect(elegirTema('?tema=satelite', 'raro', (id) => g.push(id))).toBe('claro');
    expect(g).toEqual(['noche']);
  });

  it('noche: fondo oscuro, edificios con color por altura y losa de borde iluminado justo encima', () => {
    const s = conTema(estilo(), 'noche');
    const bg = s.layers.find((l) => l.id === 'background') as any;
    expect(bg.paint['background-color']).toBe(TEMAS.noche.flavor!.background);
    const ed = s.layers.find((l) => l.id === CAPA_EDIFICIOS) as any;
    expect(JSON.stringify(ed.paint['fill-extrusion-color'])).toContain('"height"');
    const i = s.layers.findIndex((l) => l.id === CAPA_EDIFICIOS);
    expect(s.layers[i + 1].id).toBe(CAPA_TECHOS);
    expect((s.sky as any)['sky-color']).toBe(TEMAS.noche.cielo['sky-color']);
    // Las capas ciudadanas (reportes) no cambian de color con el tema.
    expect((s.layers.find((l) => l.id === 'citizen-dot') as any).paint['circle-color']).toBe('#e08a00');
  });

  it('claro deja el estilo como estaba; contraste no agrega techos', () => {
    const e = estilo();
    expect(conTema(e, 'claro')).toBe(e);
    expect(conTema(e, 'contraste').layers.some((l) => l.id === CAPA_TECHOS)).toBe(false);
  });

  it('en caliente: noche → contraste → claro vuelve exactamente a las pinturas originales', () => {
    const e = estilo();
    const m = mapaFalso(e);
    aplicarTema(m, 'noche', e.layers);
    expect(m.getLayer(CAPA_TECHOS)).toBeDefined();
    expect(m.getLayersOrder().indexOf(CAPA_TECHOS)).toBe(m.getLayersOrder().indexOf(CAPA_EDIFICIOS) + 1);
    expect((m.luz as any).color).toBe(TEMAS.noche.luz.color);
    aplicarTema(m, 'contraste', e.layers);
    expect(m.getLayer(CAPA_TECHOS)).toBeUndefined();
    aplicarTema(m, 'claro', e.layers);
    const limpia = (p?: Record<string, unknown>) => Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined));
    for (const l of e.layers) expect(limpia((m.getLayer(l.id) as any).paint)).toEqual(limpia((l as any).paint));
  });

  it('cada tema cubre las mismas capas del mapa base (ids de Protomaps iguales entre paletas)', () => {
    const e = estilo();
    const n = TEMA_IDS.map((id) => pinturasTema(id, e.layers).length);
    expect(new Set(n).size).toBe(1);
    expect(n[0]).toBeGreaterThan(60);
  });
});
