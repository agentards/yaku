// Worker de Cloudflare Pages ("advanced mode"): sirve la PWA embebida y la API de sync con D1.
// Se empaqueta con esbuild en scripts/build-worker.mjs.
import FILES from 'virtual:files';
import { OBS_TYPES, makeObservation, type NewObservation } from '../src/codec';

interface D1Stmt { bind(...v: unknown[]): D1Stmt; run(): Promise<{ meta: { changes: number } }>; all<T>(): Promise<{ results: T[] }>; first<T>(): Promise<T | null> }
interface KVLike { get(key: string, opts: { type: 'arrayBuffer'; cacheTtl?: number }): Promise<ArrayBuffer | null> }
interface Env { BASEMAP?: KVLike; DB?: { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<{ meta: { changes: number } }[]> } }

const JSONH = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: JSONH });
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const MAX_BODY = 128 * 1024, MAX_RECORDS = 200;

/** Valida y recalcula el id: un registro cuyo id no coincide con su contenido se rechaza. */
function validate(r: any): { ok: true; o: ReturnType<typeof makeObservation> } | { ok: false; why: string } {
  if (!r || typeof r !== 'object') return { ok: false, why: 'no es objeto' };
  if (!OBS_TYPES.includes(r.type)) return { ok: false, why: 'tipo' };
  if (![1, 2, 3].includes(r.severity)) return { ok: false, why: 'severidad' };
  if (!(Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180)) return { ok: false, why: 'coordenadas' };
  if (typeof r.note !== 'string' || r.note.length > 140) return { ok: false, why: 'nota' };
  if (!Number.isFinite(r.ts) || typeof r.deviceId !== 'string' || !/^[0-9a-z]{1,16}$/.test(r.deviceId)) return { ok: false, why: 'ts/deviceId' };
  const o = makeObservation({ type: r.type, severity: r.severity, lat: r.lat, lon: r.lon, note: r.note, ts: r.ts, deviceId: r.deviceId } as NewObservation);
  if (o.id !== r.id) return { ok: false, why: 'id no coincide con contenido' };
  return { ok: true, o };
}

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { ...JSONH, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type' } });
  if (!env.DB) return json({ error: 'D1 no enlazado (binding DB)' }, 503);
  const DB = env.DB;
  if (url.pathname === '/api/sync' && req.method === 'POST') {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: 'payload demasiado grande' }, 413);
    let body: any;
    try { body = JSON.parse(text); } catch { return json({ error: 'json inválido' }, 400); }
    const recs: unknown[] = Array.isArray(body?.records) ? body.records.slice(0, MAX_RECORDS) : [];
    const valid = [], rejected: { id: unknown; why: string }[] = [];
    for (const r of recs) { const v = validate(r); v.ok ? valid.push(v.o) : rejected.push({ id: (r as any)?.id, why: v.why }); }
    const now = Date.now();
    const stmt = DB.prepare('INSERT OR IGNORE INTO reports (id,type,severity,lat,lon,note,ts,device_id,verified,received_at) VALUES (?,?,?,?,?,?,?,?,0,?)');
    const res = valid.length ? await DB.batch(valid.map((o) => stmt.bind(o.id, o.type, o.severity, o.lat, o.lon, o.note, o.ts, o.deviceId, now))) : [];
    const inserted = res.reduce((a, r) => a + (r.meta?.changes ?? 0), 0);
    // accepted = ids válidos (nuevos o ya existentes): el cliente puede marcarlos consolidados.
    return json({ accepted: valid.map((o) => o.id), inserted, duplicates: valid.length - inserted, rejected, persisted: true });
  }
  if (url.pathname === '/api/stats' && req.method === 'GET') {
    const t = await DB.prepare('SELECT COUNT(*) AS total, COUNT(DISTINCT id) AS unique_ids, MAX(received_at) AS last FROM reports').first<any>();
    const byType = (await DB.prepare('SELECT type, COUNT(*) AS n FROM reports GROUP BY type').all<any>()).results;
    return json({ ...t, byType, verified: false });
  }
  if (url.pathname === '/api/reports' && req.method === 'GET') {
    const ids = url.searchParams.get('ids');
    if (ids) {
      const list = ids.split(',').filter((x) => /^[0-9a-z]{11}$/.test(x)).slice(0, 200);
      const rows = list.length ? (await DB.prepare(`SELECT * FROM reports WHERE id IN (${list.map(() => '?').join(',')})`).bind(...list).all<any>()).results : [];
      return json({ count: rows.length, reports: rows });
    }
    const limit = Math.min(200, Math.max(1, +(url.searchParams.get('limit') || 50)));
    const rows = (await DB.prepare('SELECT * FROM reports ORDER BY received_at DESC LIMIT ?').bind(limit).all<any>()).results;
    return json({ count: rows.length, reports: rows, note: 'Reportes ciudadanos NO VERIFICADOS' });
  }
  return json({ error: 'no encontrado' }, 404);
}

// ---------- mapa base .pmtiles (demasiado grande para embeberlo en el worker) ----------
// Se guarda en KV (binding BASEMAP) partido en trozos de BASEMAP_CHUNK bytes con claves
// "<ruta>#<i>" y "<ruta>#meta" = {"bytes":N,"chunk":C}. Responde GET completo (200) y Range (206).
export const BASEMAP_CHUNK = 1 << 20;
export function parseRange(h: string | null, size: number): [number, number] | null | 'invalid' {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let a: number, b: number;
  if (m[1] === '') { const n = +m[2]; a = Math.max(0, size - n); b = size - 1; } else { a = +m[1]; b = m[2] === '' ? size - 1 : Math.min(+m[2], size - 1); }
  if (a > b || a >= size) return 'invalid';
  return [a, b];
}
async function serveBasemap(req: Request, env: Env, path: string): Promise<Response> {
  const kv = env.BASEMAP;
  if (!kv) return new Response('mapa base no disponible (sin binding BASEMAP)', { status: 503 });
  const metaBuf = await kv.get(path + '#meta', { type: 'arrayBuffer', cacheTtl: 3600 });
  if (!metaBuf) return new Response('no encontrado', { status: 404 });
  const { bytes, chunk } = JSON.parse(new TextDecoder().decode(metaBuf)) as { bytes: number; chunk: number };
  const base = { 'content-type': 'application/vnd.pmtiles', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' };
  const r = parseRange(req.headers.get('range'), bytes);
  if (r === 'invalid') return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${bytes}` } });
  const [a, b] = r ?? [0, bytes - 1];
  const first = Math.floor(a / chunk), last = Math.floor(b / chunk);
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      for (let i = first; i <= last; i++) {
        const buf = await kv.get(`${path}#${i}`, { type: 'arrayBuffer', cacheTtl: 86400 });
        if (!buf) { ctrl.error(new Error('trozo faltante ' + i)); return; }
        const s0 = i === first ? a - i * chunk : 0, s1 = i === last ? b - i * chunk + 1 : buf.byteLength;
        ctrl.enqueue(new Uint8Array(buf, s0, s1 - s0));
      }
      ctrl.close();
    },
  });
  const headers = { ...base, 'content-length': String(b - a + 1), ...(r ? { 'content-range': `bytes ${a}-${b}/${bytes}` } : {}) };
  return new Response(req.method === 'HEAD' ? null : body, { status: r ? 206 : 200, headers });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url); } catch (e) { return json({ error: String((e as Error).message) }, 500); }
    }
    if (url.pathname.startsWith('/basemap/') && url.pathname.endsWith('.pmtiles')) return serveBasemap(req, env, url.pathname.slice(1));
    let pathname = url.pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { /* ruta mal codificada: se usa tal cual */ }
    // p. ej. glyphs «/basemap/fonts/Noto%20Sans%20Regular/0-255.pbf» → clave con espacios
    let f = (FILES as any)[pathname] || (url.pathname === '/' ? (FILES as any)['/index.html'] : null);
    if (!f && req.method === 'GET' && !url.pathname.includes('.')) f = (FILES as any)['/index.html'];
    if (!f) return new Response('no encontrado', { status: 404 });
    return new Response(f.b ? b64(f.d) : f.d, {
      headers: {
        'content-type': f.t,
        'cache-control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'x-content-type-options': 'nosniff',
        'permissions-policy': 'camera=(self), geolocation=(self)',
      },
    });
  },
};
