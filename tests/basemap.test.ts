// Mapa base PMTiles: configuración, lectura desde Blob (sin red), descarga verificada y guardado.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PMTiles, zxyToTileId } from 'pmtiles';
import { BASEMAPS, DEFAULT_BASEMAP, selectBasemap } from '../src/basemap-config';
import { BlobOrFetchSource, cachedBasemap, downloadBasemap, pruneBasemaps, sha256Hex, fmtMB, type CacheLike } from '../src/basemap';

const pub = path.resolve(__dirname, '../public');
const fileBlob = (f: string) => new Blob([fs.readFileSync(path.join(pub, f))]);
const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };

function memCache(): CacheLike & { m: Map<string, Blob> } {
  const m = new Map<string, Blob>();
  return {
    m,
    async match(u) { const b = m.get(u); return b ? new Response(b) : undefined; },
    async put(u, r) { m.set(u, await r.blob()); },
    async keys() { return [...m.keys()].map((url) => ({ url })); },
    async delete(k) { return m.delete(typeof k === 'string' ? k : k.url); },
  };
}

describe('configuración del mapa base', () => {
  it('z11 por defecto y ≤ 5 MB; z12 seleccionable con ?basemap=z12; clave desconocida → por defecto', () => {
    expect(DEFAULT_BASEMAP).toBe('z11');
    expect(selectBasemap('').key).toBe('z11');
    expect(selectBasemap('?basemap=z12').key).toBe('z12');
    expect(selectBasemap('?basemap=__proto__').key).toBe('z11');
    expect(BASEMAPS.z11.bytes).toBeLessThanOrEqual(5_000_000);
  });
  it.each(Object.values(BASEMAPS))('$key: el archivo existe y coincide en tamaño y sha256', async (b) => {
    const buf = fs.readFileSync(path.join(pub, b.file));
    expect(buf.length).toBe(b.bytes);
    expect(await sha256Hex(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))).toBe(b.sha256);
    expect(b.file).toContain(b.sha256.slice(0, 8));
  });
});

describe('BlobOrFetchSource (lectura sin red)', () => {
  it('con Blob lee cabecera y teselas de Piura sin ninguna petición Range', async () => {
    const b = BASEMAPS.z11;
    const src = new BlobOrFetchSource('https://x/' + b.file);
    src.setBlob(fileBlob(b.file));
    const pm = new PMTiles(src);
    const h = await pm.getHeader();
    expect(h.maxZoom).toBe(11);
    expect(h.minLon).toBeCloseTo(-81.43, 2);
    const z = 11, x = lon2x(-80.6328, z), y = lat2y(-5.1945, z); // Piura ciudad
    const t = await pm.getZxy(z, x, y);
    expect(t?.data.byteLength).toBeGreaterThan(1000);
    expect(await pm.getZxy(12, lon2x(-80.6328, 12), lat2y(-5.1945, 12))).toBeUndefined();
    expect(src.rangeRequests).toBe(0);
    expect(src.blobReads).toBeGreaterThan(0);
    expect(zxyToTileId(z, x, y)).toBeGreaterThan(0);
  });
});

describe('descarga y guardado', () => {
  const b = BASEMAPS.z11, url = 'https://x/' + b.file;
  const okFetch = (async () => new Response(fs.readFileSync(path.join(pub, b.file)))) as unknown as typeof fetch;
  it('descarga completa con progreso, verifica sha256 y la segunda vez sale de la caché', async () => {
    const c = memCache(); const prog: number[] = [];
    const blob = await downloadBasemap(c, url, b, (l) => prog.push(l), okFetch);
    expect(blob.size).toBe(b.bytes);
    expect(prog[0]).toBe(0); expect(prog.at(-1)).toBe(b.bytes);
    expect((await cachedBasemap(c, url, b))?.size).toBe(b.bytes);
  });
  it('rechaza un archivo truncado o alterado y no lo guarda', async () => {
    const c = memCache();
    const bad = (async () => new Response(fs.readFileSync(path.join(pub, b.file)).subarray(0, 1000))) as unknown as typeof fetch;
    await expect(downloadBasemap(c, url, b, () => {}, bad)).rejects.toThrow(/tamaño/);
    const flip = (async () => { const x = Buffer.from(fs.readFileSync(path.join(pub, b.file))); x[500] ^= 1; return new Response(x); }) as unknown as typeof fetch;
    await expect(downloadBasemap(c, url, b, () => {}, flip)).rejects.toThrow(/sha256/);
    expect(c.m.size).toBe(0);
  });
  it('pruneBasemaps borra builds viejos y conserva los configurados', async () => {
    const c = memCache();
    await c.put('https://x/basemap/viejo.pmtiles', new Response('a'));
    await c.put(url, new Response('b'));
    expect(await pruneBasemaps(c, [url])).toBe(1);
    expect([...c.m.keys()]).toEqual([url]);
  });
  it('fmtMB con coma decimal', () => expect(fmtMB(2594101)).toBe('2,6 MB'));
});

