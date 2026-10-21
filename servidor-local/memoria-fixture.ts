// FIXTURE LOCAL de pruebas y demo: imita las tres rutas de Atomic Memory que usa ./memoria.ts. NO es Atomic Memory:
// guarda en la memoria del proceso, «busca» por palabras en común y se borra al cerrarlo. Nunca va en la imagen
// (empaquetar.mjs solo incluye servidor.ts). Escucha solo en 127.0.0.1.
//   node servidor-local/memoria-fixture.ts            (puerto 4604, clave «fixture-local»)
//   FIXTURE_FALLA=1 …                                 (responde 503 a todo: prueba de proveedor caído)
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface Registro { id: string; user_id: string; content: string; metadata: Record<string, unknown>; created_at: string; source_site: string }
export interface Fixture { url: string; registros: Registro[]; pedidos: { metodo: string; ruta: string; user_id: string | null }[]; falla: boolean; demoraMs: number; cerrar(): Promise<void> }

const palabras = (s: string) => new Set(s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));

export function iniciarFixture(o: { puerto?: number; clave?: string; falla?: boolean; registrar?: boolean } = {}): Promise<Fixture> {
  const clave = o.clave ?? 'fixture-local';
  const f: Omit<Fixture, 'url' | 'cerrar'> = { registros: [], pedidos: [], falla: Boolean(o.falla), demoraMs: 0 };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    let quien: string | null = null;
    const responder = (status: number, cuerpo: unknown) => {
      if (o.registrar) console.log(`[fixture] ${req.method} ${u.pathname} user_id=${quien ?? '-'} → ${status} ${JSON.stringify(cuerpo).slice(0, 160)}`);
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(cuerpo));
    };
    let texto = '';
    for await (const c of req) texto += c;
    let body: Record<string, any> = {};
    try { if (texto) body = JSON.parse(texto); } catch { return responder(400, { error: 'fixture: JSON inválido' }); }
    const userId = typeof body.user_id === 'string' ? body.user_id : u.searchParams.get('user_id');
    quien = userId;
    f.pedidos.push({ metodo: req.method ?? '', ruta: u.pathname, user_id: userId });
    if (f.demoraMs) await new Promise((ok) => setTimeout(ok, f.demoraMs));
    if (req.headers.authorization !== `Bearer ${clave}`) return responder(401, { error: 'Unauthorized' });
    if (f.falla) return responder(503, { error: 'fixture: proveedor caído', retryable: true });
    if (!userId) return responder(400, { error: 'user_id (string) is required' });
    if (req.method === 'POST' && u.pathname === '/v1/memories/ingest/quick') {
      if (!body.skip_extraction || typeof body.conversation !== 'string' || !body.source_site) return responder(400, { error: 'fixture: solo ingest verbatim' });
      const r: Registro = { id: randomUUID(), user_id: userId, content: body.conversation, metadata: body.metadata ?? {}, created_at: new Date().toISOString(), source_site: body.source_site };
      f.registros.push(r);
      return responder(200, { episode_id: randomUUID(), facts_extracted: 0, memories_stored: 1, memories_updated: 0, memories_deleted: 0, memories_skipped: 0, stored_memory_ids: [r.id], updated_memory_ids: [], links_created: 0, composites_created: 0 });
    }
    if (req.method === 'POST' && u.pathname === '/v1/memories/search/fast') {
      const q = palabras(String(body.query ?? ''));
      const xs = f.registros
        .filter((r) => r.user_id === userId && (!body.source_site || r.source_site === body.source_site))
        .map((r) => ({ r, s: [...palabras(r.content)].filter((w) => q.has(w)).length }))
        .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, Number(body.limit) || 10);
      return responder(200, { count: xs.length, memories: xs.map(({ r, s }) => ({ id: r.id, content: r.content, metadata: r.metadata, created_at: r.created_at, source_site: r.source_site, score: s })), injection_text: '', citations: [] });
    }
    const md = /^\/v1\/memories\/([^/]+)$/.exec(u.pathname);
    if (req.method === 'DELETE' && md) {
      const k = f.registros.findIndex((r) => r.id === md[1] && r.user_id === userId);
      if (k < 0) return responder(404, { error: 'Memory not found' });
      f.registros.splice(k, 1);
      return responder(200, { success: true });
    }
    responder(404, { error: 'fixture: ruta no implementada' });
  });
  return new Promise((ok) => server.listen(o.puerto ?? 0, '127.0.0.1', () => {
    const { port } = server.address() as { port: number };
    ok(Object.assign(f, { url: `http://127.0.0.1:${port}`, cerrar: () => new Promise<void>((c) => server.close(() => c())) }));
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const fx = await iniciarFixture({ puerto: Number(process.env.FIXTURE_PUERTO ?? 4604), falla: process.env.FIXTURE_FALLA === '1', registrar: true });
  console.log(`FIXTURE LOCAL de Atomic Memory (no es el servicio real) en ${fx.url} · clave «fixture-local»${fx.falla ? ' · responde 503' : ''}`);
}
