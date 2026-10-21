// Notas de zona del Centro de monitoreo en Atomic Memory (opcional). El operador guarda, corrige o borra una nota
// corta sobre una zona («el puente X está cerrado, entrar por Y») y la vuelve a ver cuando abre otro incidente en esa
// zona. Es contexto para el operador: no entra al respaldo, al estado ni a los avisos, y no reemplaza a SQLite.
//
// Contrato HTTP (https://docs.atomicstrata.ai/atomicmemory-core-openapi.yaml):
//   POST   /v1/memories/ingest/quick   { user_id, conversation, source_site, skip_extraction, content_class, metadata }
//   POST   /v1/memories/search/fast    { user_id, query, limit, source_site } → { memories: [{ id, content, metadata, created_at }] }
//   DELETE /v1/memories/:id?user_id=   → { success: true }
// El sujeto (user_id) sale SIEMPRE de la sesión del servidor; nunca de la petición ni de un hilo compartido.

export interface ConfigMemoria { url: string; clave: string; timeoutMs: number }

/** Lee la configuración. Apagada por defecto: hace falta YAKU_MEMORIA=atomicmemory más URL y clave. */
export function configMemoria(env: Record<string, string | undefined>): { config: ConfigMemoria | null; aviso: string | null } {
  if ((env.YAKU_MEMORIA ?? '').trim() !== 'atomicmemory') return { config: null, aviso: null };
  const url = (env.ATOMICMEMORY_API_URL ?? '').trim().replace(/\/+$/, ''), clave = (env.ATOMICMEMORY_API_KEY ?? '').trim();
  if (!url || !clave) return { config: null, aviso: 'YAKU_MEMORIA=atomicmemory sin ATOMICMEMORY_API_URL o ATOMICMEMORY_API_KEY: notas de zona apagadas.' };
  let u: URL;
  try { u = new URL(url); } catch { return { config: null, aviso: 'ATOMICMEMORY_API_URL no es una URL: notas de zona apagadas.' }; }
  // La clave viaja en la cabecera: solo por HTTPS, salvo un servicio en este mismo equipo (Core local o fixture).
  const local = u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return { config: null, aviso: 'ATOMICMEMORY_API_URL debe ser https:// (o http:// en 127.0.0.1): notas de zona apagadas.' };
  const t = Number(env.YAKU_MEMORIA_TIMEOUT_MS);
  return { config: { url, clave, timeoutMs: Number.isFinite(t) && t > 0 ? Math.min(10_000, Math.max(500, t)) : 2500 }, aviso: null };
}

export const LIMITES_NOTA = { texto: 280, zona: 80, minTexto: 3, verMax: 5, buscar: 20 } as const;
const ORIGEN = 'yaku';
const CLASE = 'nota_zona';

export interface NotaZona { id: string; texto: string; zona: string; incidente: string | null; creada: string | null }
export type Fallo = { ok: false; motivo: 'tiempo' | 'http' | 'respuesta'; status?: number };
export type Resultado<T> = { ok: true; valor: T } | Fallo;

/** Sujeto de memoria: un usuario con sesión del Centro de monitoreo (nunca el PIN compartido). */
export type Sujeto = string & { readonly __marca: 'SujetoMemoria' };
export const sujetoDe = (usuario: string): Sujeto => `yaku-operador:${usuario}` as Sujeto;

export interface Memoria {
  guardar(s: Sujeto, n: { zona: string; texto: string; incidente: string | null }): Promise<Resultado<NotaZona>>;
  buscar(s: Sujeto, q: { zona: string; tipo: string }): Promise<Resultado<NotaZona[]>>;
  borrar(s: Sujeto, id: string): Promise<Resultado<'borrada' | 'no_existe'>>;
}

const contenido = (zona: string, texto: string) => `Nota de zona del Centro de monitoreo · ${zona}: ${texto}`;
const textoDe = (zona: string, c: string) => { const p = `Nota de zona del Centro de monitoreo · ${zona}: `; return c.startsWith(p) ? c.slice(p.length) : c; };
const esObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Una nota de la respuesta de búsqueda, solo si es nuestra (clase y zona en metadata). */
function leerNota(m: unknown, zona: string): NotaZona | null {
  if (!esObj(m) || typeof m.id !== 'string' || typeof m.content !== 'string' || !esObj(m.metadata)) return null;
  const md = m.metadata;
  if (md.yaku_clase !== CLASE || md.yaku_zona !== zona) return null;
  return {
    id: m.id, zona, texto: textoDe(zona, m.content).slice(0, LIMITES_NOTA.texto),
    incidente: typeof md.yaku_incidente === 'string' ? md.yaku_incidente : null,
    creada: typeof m.created_at === 'string' ? m.created_at : null,
  };
}

export function crearMemoria(cfg: ConfigMemoria, pedir: typeof fetch = fetch): Memoria {
  async function llamar(ruta: string, init: RequestInit): Promise<Resultado<unknown>> {
    let r: Response;
    try {
      r = await pedir(cfg.url + ruta, {
        ...init, signal: AbortSignal.timeout(cfg.timeoutMs),
        headers: { authorization: `Bearer ${cfg.clave}`, accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
      });
    } catch (e) {
      const n = (e as Error)?.name;
      return { ok: false, motivo: n === 'TimeoutError' || n === 'AbortError' ? 'tiempo' : 'http' };
    }
    if (!r.ok) { await r.body?.cancel(); return { ok: false, motivo: 'http', status: r.status }; }
    try { return { ok: true, valor: await r.json() }; } catch { return { ok: false, motivo: 'respuesta', status: r.status }; }
  }

  return {
    async guardar(s, n) {
      const r = await llamar('/v1/memories/ingest/quick', {
        method: 'POST',
        body: JSON.stringify({
          user_id: s, conversation: contenido(n.zona, n.texto), source_site: ORIGEN, skip_extraction: true, content_class: 'summary',
          metadata: { yaku_clase: CLASE, yaku_zona: n.zona, ...(n.incidente ? { yaku_incidente: n.incidente } : {}) },
        }),
      });
      if (!r.ok) return r;
      // Guardada solo si Atomic Memory devuelve el id del registro: sin id no se puede corregir ni borrar.
      const v = r.valor, ids = esObj(v) ? [v.stored_memory_ids, v.updated_memory_ids].flatMap((x) => (Array.isArray(x) ? x : [])) : [];
      const id = ids.find((x): x is string => typeof x === 'string' && x.length > 0);
      if (!id) return { ok: false, motivo: 'respuesta' };
      return { ok: true, valor: { id, zona: n.zona, texto: n.texto, incidente: n.incidente, creada: new Date().toISOString() } };
    },
    async buscar(s, q) {
      const r = await llamar('/v1/memories/search/fast', {
        method: 'POST',
        body: JSON.stringify({ user_id: s, query: `Notas de zona sobre ${q.zona}. Incidente: ${q.tipo}`, limit: LIMITES_NOTA.buscar, source_site: ORIGEN }),
      });
      if (!r.ok) return r;
      const ms = esObj(r.valor) && Array.isArray(r.valor.memories) ? r.valor.memories : null;
      if (!ms) return { ok: false, motivo: 'respuesta' };
      return { ok: true, valor: ms.map((m) => leerNota(m, q.zona)).filter((x): x is NotaZona => x !== null).slice(0, LIMITES_NOTA.verMax) };
    },
    async borrar(s, id) {
      const r = await llamar(`/v1/memories/${encodeURIComponent(id)}?user_id=${encodeURIComponent(s)}`, { method: 'DELETE' });
      if (!r.ok) return r.status === 404 ? { ok: true, valor: 'no_existe' } : r;
      return esObj(r.valor) && r.valor.success === true ? { ok: true, valor: 'borrada' } : { ok: false, motivo: 'respuesta' };
    },
  };
}
