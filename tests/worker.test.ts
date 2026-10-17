// Worker de Pages (server/worker.ts) con un D1 falso en memoria que emula INSERT OR IGNORE.
import { describe, it, expect, vi } from 'vitest';
vi.mock('virtual:files', () => ({ default: { '/index.html': { t: 'text/html', b: false, d: '<h1>ok</h1>' }, '/basemap/fonts/Noto Sans Regular/0-255.pbf': { t: 'application/x-protobuf', b: true, d: 'AAEC' } } }));
import worker, { parseRange } from '../server/worker';
import { sample } from './fixtures';

function fakeD1() {
  const rows = new Map<string, any>();
  const stmt = (sql: string, args: unknown[] = []): any => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    async run() {
      if (sql.startsWith('INSERT OR IGNORE')) {
        const [id, type, severity, lat, lon, note, ts, device_id, received_at] = args as any[];
        if (rows.has(id)) return { meta: { changes: 0 } };
        rows.set(id, { id, type, severity, lat, lon, note, ts, device_id, verified: 0, received_at });
        return { meta: { changes: 1 } };
      }
      throw new Error('sql no soportado: ' + sql);
    },
    async first() { return { total: rows.size, unique_ids: new Set(rows.keys()).size, last: null }; },
    async all() { return { results: sql.includes('WHERE id IN') ? (args as string[]).filter((i) => rows.has(i)).map((i) => rows.get(i)) : sql.includes('GROUP BY') ? [] : [...rows.values()] }; },
  });
  return { rows, prepare: (sql: string) => stmt(sql), batch: (ss: any[]) => Promise.all(ss.map((s) => s.run())) };
}
const post = (env: any, body: unknown) => worker.fetch(new Request('https://x/api/sync', { method: 'POST', body: JSON.stringify(body) }), env).then((r) => r.json() as any);

describe('Worker /api/sync + D1', () => {
  it('idempotente: el mismo lote 2 veces deja solo ids únicos', async () => {
    const DB = fakeD1(); const env = { DB };
    const recs = sample(5);
    const a = await post(env, { records: recs });
    const b = await post(env, { records: [...recs, ...recs] });
    expect(a).toMatchObject({ inserted: 5, duplicates: 0, persisted: true });
    expect(b).toMatchObject({ inserted: 0, duplicates: 10 });
    expect(DB.rows.size).toBe(5);
    const g = await (await worker.fetch(new Request(`https://x/api/reports?ids=${recs.map((r) => r.id).join(',')}`), env)).json() as any;
    expect(g.count).toBe(5);
  });
  it('rechaza registros manipulados (id ≠ contenido) e inválidos', async () => {
    const env = { DB: fakeD1() };
    const [r] = sample(1);
    const res = await post(env, { records: [{ ...r, note: 'otra cosa' }, { ...r, severity: 7 }, { foo: 1 }] });
    expect(res.inserted).toBe(0);
    expect(res.rejected.map((x: any) => x.why)).toEqual(['id no coincide con contenido', 'severidad', 'tipo']);
  });
  it('503 explícito si D1 no está enlazado; sirve la app embebida', async () => {
    expect((await worker.fetch(new Request('https://x/api/stats'), {})).status).toBe(503);
    const r = await worker.fetch(new Request('https://x/cualquier/ruta'), {});
    expect(await r.text()).toContain('ok');
  });
});

describe('Worker: mapa base desde KV troceado', () => {
  const data = new Uint8Array(3 * 1024 * 1024 + 123).map((_, i) => (i * 7) % 251);
  const C = 1 << 20, key = 'basemap/x.pmtiles';
  const store = new Map<string, ArrayBuffer>();
  store.set(key + '#meta', new TextEncoder().encode(JSON.stringify({ bytes: data.length, chunk: C })).buffer as ArrayBuffer);
  for (let i = 0; i * C < data.length; i++) store.set(`${key}#${i}`, data.slice(i * C, (i + 1) * C).buffer);
  const env = { BASEMAP: { get: async (k: string) => store.get(k) ?? null } };
  it('Range que cruza trozos → 206 con los bytes exactos', async () => {
    const r = await worker.fetch(new Request('https://x/' + key, { headers: { range: `bytes=${C - 5}-${C + 4}` } }), env as any);
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes ${C - 5}-${C + 4}/${data.length}`);
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([...data.slice(C - 5, C + 5)]);
  });
  it('GET completo → 200 con todo el archivo; Range inválido → 416; sin binding → 503', async () => {
    const r = await worker.fetch(new Request('https://x/' + key), env as any);
    expect(r.status).toBe(200);
    expect(Buffer.from(await r.arrayBuffer()).equals(Buffer.from(data))).toBe(true);
    expect((await worker.fetch(new Request('https://x/' + key, { headers: { range: 'bytes=99999999-' } }), env as any)).status).toBe(416);
    expect((await worker.fetch(new Request('https://x/' + key), {} as any)).status).toBe(503);
  });
});

describe('Worker: Range para .pmtiles', () => {
  it('parseRange', () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange('bytes=0-9', 100)).toEqual([0, 9]);
    expect(parseRange('bytes=90-', 100)).toEqual([90, 99]);
    expect(parseRange('bytes=-10', 100)).toEqual([90, 99]);
    expect(parseRange('bytes=50-500', 100)).toEqual([50, 99]);
    expect(parseRange('bytes=200-300', 100)).toBe('invalid');
    expect(parseRange('items=0-1', 100)).toBe('invalid');
  });
});

describe('Worker: archivos con espacios (glyphs)', () => {
  it('sirve /basemap/fonts/Noto%20Sans%20Regular/0-255.pbf', async () => {
    const r = await worker.fetch(new Request('https://x/basemap/fonts/Noto%20Sans%20Regular/0-255.pbf'), {} as any);
    expect(r.status).toBe(200);
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([0, 1, 2]);
  });
});
