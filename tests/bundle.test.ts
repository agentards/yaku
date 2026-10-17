// Verifica el bundle construido (dist/): textos prohibidos y etiquetado de reportes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(__dirname, '../dist');
function files(d: string): string[] {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]));
}

describe('bundle dist/', () => {
  it('existe (ejecutar vite build antes)', () => expect(fs.existsSync(path.join(dist, 'index.html'))).toBe(true));
  const text = () => files(dist).filter((f) => /\.(js|mjs|html|css|webmanifest|json|geojson)$/.test(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  it('nunca contiene afirmaciones de seguridad de rutas', () => {
    // Construido por partes para no depender de la literal; cubre tildes, unicode-escape y mayúsculas.
    const t = text().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\\u00ed/gi, 'i').replace(/\\xed/gi, 'i').toLowerCase();
    const banned = [['v', 'ia', ' segura'], ['ruta', ' segura'], ['camino', ' seguro'], ['safe', ' route'], ['transi', 'table'], ['afec', 'tado'], ['con da', 'nos'], ['sin se', 'nal'], ['pronostico de ', 'inundacion'], ['expuesto en ', 'escenario'], ['centros poblados ', 'expuestos']].map((p) => p.join(''));
    for (const b of banned) expect(t.includes(b), `texto prohibido: "${b}"`).toBe(false);
  });
  it('incluye la etiqueta NO VERIFICADO, estilo discontinuo para reportes ciudadanos y sin plantilla FUENTE OFICIAL', () => {
    const t = text();
    expect(t).toContain('NO VERIFICADO');
    expect(t).toMatch(/\.citizen\{[^}]*dashed/);
    expect(t).not.toContain('FUENTE OFICIAL');
    expect(t).not.toContain('official-template');
  });
  it('capas oficiales empaquetadas y precacheadas (funcionan sin red)', () => {
    const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
    for (const f of ['senamhi-quebradas', 'sigrid-erosion', 'sigrid-erosion-pts', 'piura-limite']) {
      expect(fs.existsSync(path.join(dist, 'data', `${f}.geojson`))).toBe(true);
      expect(sw).toContain(`data/${f}.geojson`);
    }
  });
  it('mapa base: sin teselas raster de tile.openstreetmap.org; .pmtiles fuera del precache; glyphs y sprites locales precacheados', () => {
    expect(text()).not.toContain('tile.openstreetmap.org');
    const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
    expect(sw).not.toMatch(/\.pmtiles/);
    expect(sw).toContain('basemap/fonts/Noto Sans Regular/0-255.pbf');
    expect(sw).toContain('basemap/sprites/light.json');
    expect(text()).not.toContain('protomaps.github.io');
    expect(text()).toContain('© OpenStreetMap contributors');
  });
  it('no referencia CDNs externos (todo empaquetado para offline)', () => {
    expect(text()).not.toMatch(/(unpkg|jsdelivr|cdnjs|googleapis)\.(com|net)/);
  });
});
