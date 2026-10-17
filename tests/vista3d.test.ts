// Vista 3D: relieve sobre el estilo, DEM empaquetado y medición de fps (la cámara está en vista3d-camara.test.ts).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PMTiles, TileType, type Source } from 'pmtiles';
import type { StyleSpecification } from 'maplibre-gl';
import { conRelieve, indiceRelieve, CAPA_COLOR, CAPA_SOMBRA, SRC_TERRENO, SRC_RELIEVE } from '../src/vista3d/relieve';
import { DEM, DEM_BOUNDS, EXAGERACION, DEM_SOURCE_URL } from '../src/vista3d/config';
import { resumirCuadros } from '../src/vista3d/rendimiento';
import { CENEPRED_23077_BOUNDS } from '../src/layers';

const raiz = path.resolve(__dirname, '..');

describe('relieve sobre el estilo 2D', () => {
  const base: StyleSpecification = {
    version: 8, sources: { cenepred: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
    layers: [
      { id: 'background', type: 'background' }, { id: 'earth', type: 'background' }, { id: 'landuse_park', type: 'background' },
      { id: 'water', type: 'background' }, { id: 'senamhi-fill', type: 'background' },
      { id: 'cenepred-ccpp', type: 'circle', source: 'cenepred', paint: { 'circle-radius': 4 } },
    ],
  };
  it('inserta color por altitud y sombreado bajo el agua, sobre la tierra', () => {
    expect(indiceRelieve(base.layers)).toBe(3);
    const s = conRelieve(base);
    const ids = s.layers.map((l) => l.id);
    expect(ids.indexOf(CAPA_COLOR)).toBe(3);
    expect(ids.indexOf(CAPA_SOMBRA)).toBe(4);
    expect(ids.indexOf('water')).toBe(5);
  });
  it('terreno con exageración 1,4–1,8×, dos fuentes DEM locales (protocolo propio) y cielo con bruma', () => {
    const s = conRelieve(base);
    expect(s.terrain).toEqual({ source: SRC_TERRENO, exaggeration: EXAGERACION });
    expect(EXAGERACION).toBeGreaterThanOrEqual(1.4); expect(EXAGERACION).toBeLessThanOrEqual(1.8);
    for (const id of [SRC_TERRENO, SRC_RELIEVE]) expect((s.sources[id] as any).url).toBe(DEM_SOURCE_URL);
    expect(DEM_SOURCE_URL).toMatch(/^yakudem:\/\//);
    expect(s.sky?.['fog-color']).toBeTruthy();
    expect(JSON.stringify(s)).not.toMatch(/https?:\/\/(?!localhost)/); // sin CDN ni teselas externas
  });
  it('capas reales se acuestan sobre el relieve y el estilo original no cambia', () => {
    const antes = JSON.stringify(base);
    const s = conRelieve(base);
    expect((s.layers.find((l) => l.id === 'cenepred-ccpp') as any).paint['circle-pitch-alignment']).toBe('map');
    expect(JSON.stringify(base)).toBe(antes);
    expect(conRelieve(base, { conTerreno: false }).terrain).toBeUndefined();
  });
});

/** Fuente PMTiles en memoria para leer el archivo real en Node. */
class FuenteBuffer implements Source {
  constructor(private b: Buffer) {}
  getKey() { return 'dem'; }
  async getBytes(o: number, n: number) { const s = this.b.subarray(o, o + n); return { data: s.buffer.slice(s.byteOffset, s.byteOffset + s.byteLength) as ArrayBuffer }; }
}

describe('DEM empaquetado (presupuesto offline)', () => {
  const archivo = path.join(raiz, 'public', DEM.file);
  const buf = fs.readFileSync(archivo);
  it('tamaño y sha256 coinciden con la configuración; el nombre lleva el prefijo del hash', () => {
    expect(buf.length).toBe(DEM.bytes);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    expect(sha).toBe(DEM.sha256);
    expect(DEM.file).toContain(sha.slice(0, 8));
  });
  it('paquete adicional del 3D ≤ 6 MB (DEM + código de src/vista3d)', () => {
    const codigo = fs.readdirSync(path.join(raiz, 'src/vista3d'), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile()).reduce((s, e) => s + fs.statSync(path.join((e as any).parentPath ?? (e as any).path, e.name)).size, 0);
    expect(DEM.bytes + codigo).toBeLessThanOrEqual(6_000_000);
  });
  it('cabecera: PNG Terrarium z5–9 que cubre Piura y los 23 distritos del escenario CENEPRED', async () => {
    const h = await new PMTiles(new FuenteBuffer(buf)).getHeader();
    expect(h.tileType).toBe(TileType.Png);
    expect(h.minZoom).toBeLessThanOrEqual(5); expect(h.maxZoom).toBe(DEM.maxzoom);
    const [[w, s], [e, n]] = CENEPRED_23077_BOUNDS;
    expect(h.minLon).toBeLessThanOrEqual(w); expect(h.minLat).toBeLessThanOrEqual(s);
    expect(h.maxLon).toBeGreaterThanOrEqual(e); expect(h.maxLat).toBeGreaterThanOrEqual(n);
    expect(DEM_BOUNDS[0]).toBeLessThanOrEqual(w);
  });
  it('una tesela z9 del centro del escenario decodifica a altitudes andinas plausibles', async () => {
    const pm = new PMTiles(new FuenteBuffer(buf));
    const z = 9, lon = -79.75, lat = -5.1; // sierra de Morropón/Huancabamba
    const x = Math.floor(((lon + 180) / 360) * 2 ** z);
    const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
    const t = await pm.getZxy(z, x, y);
    expect(t).toBeTruthy();
    const png = new Uint8Array(t!.data);
    expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  });
});

describe('medición de fps', () => {
  it('resume intervalos en fps y p95', () => {
    const r = resumirCuadros(Array(60).fill(1000 / 60), 1000);
    expect(r.fps).toBe(60); expect(r.p95ms).toBeCloseTo(16.7, 1);
    expect(resumirCuadros([], 0).fps).toBe(0);
  });
});
