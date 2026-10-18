// Temas del mapa 3D (claro | noche) que siguen al modo Claro / Oscuro / Sistema del Centro de monitoreo.
// Basado en las pruebas del tema «Noche» de feat/demo-lima (e4ce77e), más el relieve de Piura.
import { describe, expect, it } from 'vitest';
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { layers as pmLayers, namedFlavor } from '@protomaps/basemaps';
import { REGIONES } from '../src/region';
import { CAPA_EDIFICIOS, estiloRegion } from '../src/vista3d/edificios';
import { CAPA_COLOR, CAPA_SOMBRA } from '../src/vista3d/relieve';
import { CAPA_TECHOS, TEMAS, TEMA_IDS, aplicarTema, conTema, pinturasTema, type MapaTema } from '../src/vista3d/temas';

// Estilo de escena como el real: capas del mapa base Protomaps (metadata.basemap) + capas oficiales y ciudadanas.
const estilo = (region: 'lima' | 'piura'): StyleSpecification => {
  const bm = (pmLayers('protomaps', namedFlavor('light'), { lang: 'es' }) as LayerSpecification[]).filter((l) => l.id !== 'buildings' && l.id !== 'pois').map((l) => ({ ...l, metadata: { basemap: true } }));
  const s: StyleSpecification = {
    version: 8,
    sources: { protomaps: { type: 'vector', url: 'pmtiles://x' }, citizen: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }, limite: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
    layers: [...bm, { id: 'limite-line', type: 'line', source: 'limite', paint: { 'line-color': '#1d2b36', 'line-width': 2 } }, { id: 'citizen-dot', type: 'circle', source: 'citizen', paint: { 'circle-color': '#e08a00' } }],
  };
  return estiloRegion(s, REGIONES[region]);
};

/** Doble del mapa: guarda pinturas, orden de capas, cielo y luz. */
function mapaFalso(s: StyleSpecification) {
  const capas = s.layers.map((l) => structuredClone(l)) as (LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown> })[];
  const m = { cielo: null as unknown, luz: null as unknown, capas,
    getLayer: (id: string) => capas.find((l) => l.id === id),
    setPaintProperty(id: string, p: string, v: unknown) { const l = capas.find((x) => x.id === id)!; l.paint = { ...l.paint, [p]: v }; },
    getLayoutProperty: (id: string, p: string) => capas.find((l) => l.id === id)?.layout?.[p],
    addLayer(l: LayerSpecification, antes?: string) { const i = antes ? capas.findIndex((x) => x.id === antes) : -1; capas.splice(i >= 0 ? i : capas.length, 0, l as any); },
    removeLayer(id: string) { capas.splice(capas.findIndex((x) => x.id === id), 1); },
    getLayersOrder: () => capas.map((l) => l.id),
    setSky(c: unknown) { m.cielo = c; },
    setLight(c: unknown) { m.luz = c; },
  };
  return m satisfies MapaTema;
}
const pintura = (s: StyleSpecification, id: string) => (s.layers.find((l) => l.id === id) as any)?.paint ?? {};

describe('tema noche del mapa 3D', () => {
  it('Lima: fondo oscuro, edificios con color por altura (sin perder la altura) y losa iluminada justo encima', () => {
    const s = conTema(estilo('lima'), 'noche');
    expect(pintura(s, 'background')['background-color']).toBe(TEMAS.noche.flavor!.background);
    const ed = pintura(s, CAPA_EDIFICIOS);
    expect(JSON.stringify(ed['fill-extrusion-color'])).toContain('"height"');
    expect(ed['fill-extrusion-height']).toBeDefined(); // al nacer en noche los edificios siguen en 3D
    const i = s.layers.findIndex((l) => l.id === CAPA_EDIFICIOS);
    expect(s.layers[i + 1].id).toBe(CAPA_TECHOS);
    expect((s.sky as any)['sky-color']).toBe(TEMAS.noche.cielo['sky-color']);
    // Los reportes no cambian de color con el tema; el límite casi negro se aclara para verse.
    expect(pintura(s, 'citizen-dot')['circle-color']).toBe('#e08a00');
    expect(pintura(s, 'limite-line')['line-color']).toBe('#9fb3d6');
    expect(pintura(s, 'limite-line')['line-width']).toBe(2);
  });

  it('Piura: el relieve pasa a azules de noche, con su sombreado, y sin techos (no hay edificios)', () => {
    const e = estilo('piura');
    const s = conTema(e, 'noche');
    expect(JSON.stringify(pintura(s, CAPA_COLOR)['color-relief-color'])).toContain(TEMAS.noche.relieve!.colores[1][1]);
    expect(pintura(s, CAPA_SOMBRA)['hillshade-highlight-color']).toBe(TEMAS.noche.relieve!.luz);
    expect(pintura(s, CAPA_SOMBRA)['hillshade-exaggeration']).toBe(pintura(e, CAPA_SOMBRA)['hillshade-exaggeration']);
    expect(s.layers.some((l) => l.id === CAPA_TECHOS)).toBe(false);
    expect(s.terrain).toEqual(e.terrain);
  });

  it('claro deja el estilo como estaba', () => {
    const e = estilo('lima');
    expect(conTema(e, 'claro')).toBe(e);
  });

  it('en caliente: claro → noche → claro vuelve exactamente a las pinturas originales (Lima y Piura)', () => {
    for (const r of ['lima', 'piura'] as const) {
      const e = estilo(r);
      const m = mapaFalso(e);
      aplicarTema(m, 'noche', e.layers);
      expect(!!m.getLayer(CAPA_TECHOS)).toBe(r === 'lima');
      expect((m.luz as any).color).toBe(TEMAS.noche.luz.color);
      aplicarTema(m, 'claro', e.layers);
      expect(m.getLayer(CAPA_TECHOS)).toBeUndefined();
      const limpia = (p?: Record<string, unknown>) => Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined));
      for (const l of e.layers) expect(limpia((m.getLayer(l.id) as any).paint), `${r} ${l.id}`).toEqual(limpia((l as any).paint));
    }
  });

  it('cada tema cubre las mismas capas (ids de Protomaps iguales entre paletas)', () => {
    const e = estilo('piura');
    const n = TEMA_IDS.map((id) => pinturasTema(id, e.layers).length);
    expect(new Set(n).size).toBe(1);
    expect(n[0]).toBeGreaterThan(60);
  });
});
