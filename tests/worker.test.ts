// Worker de Pages (server/worker.ts) con un D1 falso en memoria que emula INSERT OR IGNORE.
import { describe, it, expect, vi } from 'vitest';
vi.mock('virtual:files', () => ({ default: { '/index.html': { t: 'text/html', b: false, d: '<h1>ok</h1>' } } }));
import worker from '../server/worker';
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
