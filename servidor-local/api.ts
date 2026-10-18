// API local (Request → Response, igual que server/worker.ts). /api/sync, /api/reports y /api/stats mantienen el
// contrato del Worker; lo demás es nuevo (plan-implementacion-local.md, WP1).
import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { OBS_TYPES, makeObservation, type NewObservation } from '../src/codec.ts';
import type { Almacen } from './almacen.ts';
import { validarCambio } from './estados.ts';
import { armarIncidentes, estadoDeReportes } from './vista.ts';

const JSONH = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: JSONH });
export const MAX_BODY = 128 * 1024, MAX_RECORDS = 200;
export const MAX_FOTO = 400 * 1024;
const ID_REP = /^[0-9a-z]{11}$/, ID_FOTO = /^[0-9a-f]{20}$/, ID_INC = /^inc-[0-9a-z]{11}(-[0-9a-z]{1,8})?$/;

/** Igual que validate() de server/worker.ts: el id se recalcula y debe coincidir con el contenido. */
export function validar(r: any): { ok: true; o: ReturnType<typeof makeObservation> } | { ok: false; why: string } {
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

/** Tipo real de la imagen por sus primeros bytes (no se confía en lo que diga el cliente). */
export function tipoImagen(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export interface OpcionesApi { almacen: Almacen; pin: string; fotosDir: string; ahora?: () => number }

export function crearApi(op: OpcionesApi) {
  const { almacen: A } = op;
  const ahora = op.ahora ?? Date.now;
  const pinHash = createHash('sha256').update(op.pin).digest();
  fs.mkdirSync(op.fotosDir, { recursive: true });

  /** null si el PIN es correcto; si no, la respuesta 401 (falta) o 403 (incorrecto). */
  const exigirPin = (req: Request): Response | null => {
    const p = req.headers.get('x-muni-pin');
    if (!p) return json({ error: 'falta el PIN municipal (cabecera X-Muni-Pin)' }, 401);
    return timingSafeEqual(createHash('sha256').update(p).digest(), pinHash) ? null : json({ error: 'PIN incorrecto' }, 403);
  };
  const leerJson = async (req: Request, max: number): Promise<any | Response> => {
    const text = await req.text();
    if (text.length > max) return json({ error: 'payload demasiado grande' }, 413);
    try { return JSON.parse(text); } catch { return json({ error: 'json inválido' }, 400); }
  };
  const incidentes = () => { const t = A.todo(); return { t, lista: armarIncidentes(t, ahora(), A.reglas) }; };

  async function sync(req: Request) {
    const body = await leerJson(req, MAX_BODY);
    if (body instanceof Response) return body;
    const recs: unknown[] = Array.isArray(body?.records) ? body.records.slice(0, MAX_RECORDS) : [];
    const valid = [], rejected: { id: unknown; why: string }[] = [];
    for (const r of recs) { const v = validar(r); v.ok ? valid.push(v.o) : rejected.push({ id: (r as any)?.id, why: v.why }); }
    const inserted = valid.length ? A.insertarReportes(valid, ahora()) : 0;
    // accepted = ids válidos (nuevos o ya existentes): el cliente puede marcarlos consolidados.
    return json({ accepted: valid.map((o) => o.id), inserted, duplicates: valid.length - inserted, rejected, persisted: true });
  }

  async function subirFoto(req: Request, url: URL) {
    let reportId: string, bytes: Uint8Array;
    const ct = req.headers.get('content-type') ?? '';
    if (ct.startsWith('image/')) {
      reportId = url.searchParams.get('reporte') ?? url.searchParams.get('reportId') ?? '';
      const buf = new Uint8Array(await req.arrayBuffer());
      if (buf.length > MAX_FOTO) return json({ error: 'foto > 400 KB' }, 413);
      bytes = buf;
    } else {
      const body = await leerJson(req, Math.ceil(MAX_FOTO * 4 / 3) + 4096);
      if (body instanceof Response) return body;
      reportId = String(body?.reportId ?? body?.report_id ?? body?.reporte ?? '');
      const data = String(body?.data ?? body?.foto ?? '').replace(/^data:[^,]*,/, '');
      if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(data)) return json({ error: 'foto: base64 inválido' }, 400);
      bytes = Buffer.from(data, 'base64');
      if (bytes.length > MAX_FOTO) return json({ error: 'foto > 400 KB' }, 413);
    }
    if (!ID_REP.test(reportId)) return json({ error: 'reportId inválido (11 caracteres base36)' }, 400);
    const tipo = tipoImagen(bytes);
    if (!tipo) return json({ error: 'solo JPEG, PNG o WebP' }, 415);
    // id = hash del contenido: subir la misma foto dos veces no la duplica.
    const id = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
    const archivo = path.join(op.fotosDir, `${id}.${tipo.ext}`);
    if (!fs.existsSync(archivo)) fs.writeFileSync(archivo, bytes);
    const nueva = A.guardarFoto({ id, report_id: reportId, mime: tipo.mime, bytes: bytes.length, received_at: ahora() });
    return json({ id, url: `/api/fotos/${id}`, bytes: bytes.length, duplicate: !nueva, reporte_en_servidor: A.reportesPorId([reportId]).length > 0 });
  }

  function verFoto(id: string) {
    const f = ID_FOTO.test(id) ? A.foto(id) : null;
    if (!f) return json({ error: 'foto no encontrada' }, 404);
    const ext = f.mime === 'image/png' ? 'png' : f.mime === 'image/webp' ? 'webp' : 'jpg';
    const archivo = path.join(op.fotosDir, `${f.id}.${ext}`);
    if (!fs.existsSync(archivo)) return json({ error: 'archivo de foto ausente en el volumen' }, 410);
    return new Response(fs.readFileSync(archivo), { headers: { 'content-type': f.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' } });
  }

  async function cambiarEstado(req: Request, id: string) {
    const sinPin = exigirPin(req);
    if (sinPin) return sinPin;
    const body = await leerJson(req, 4096);
    if (body instanceof Response) return body;
    const { lista } = incidentes();
    const inc = lista.find((i) => i.id === id);
    if (!inc) return json({ error: 'incidente no encontrado' }, 404);
    const v = validarCambio(inc.estado, body);
    if (!v.ok) return json({ error: v.error, estado: inc.estado }, v.status);
    const cuando = ahora();
    A.guardarEstado({ incidente_id: id, estado: v.p.estado, accion: v.p.accion, motivo: v.p.motivo, quien: v.p.quien, cuando, respaldo: inc.respaldo });
    return json({ ok: true, incidente: incidentes().lista.find((i) => i.id === id) });
  }

  async function unir(req: Request, id: string) {
    const sinPin = exigirPin(req);
    if (sinPin) return sinPin;
    const body = await leerJson(req, 4096);
    if (body instanceof Response) return body;
    const otro = String(body?.con ?? ''), quien = String(body?.quien ?? '').trim();
    if (!quien || quien.length > 60) return json({ error: 'falta «quien»' }, 400);
    const { lista } = incidentes();
    if (otro === id || !lista.some((i) => i.id === id) || !lista.some((i) => i.id === otro)) return json({ error: 'incidentes no encontrados' }, 404);
    A.unir(id, otro, quien, ahora());
    return json({ ok: true, incidente: incidentes().lista.find((i) => i.id === id) });
  }

  async function separar(req: Request, id: string) {
    const sinPin = exigirPin(req);
    if (sinPin) return sinPin;
    const body = await leerJson(req, 8192);
    if (body instanceof Response) return body;
    const ids = (Array.isArray(body?.reportes) ? body.reportes : []).map(String).filter((x: string) => ID_REP.test(x)).slice(0, 200);
    const quien = String(body?.quien ?? '').trim();
    if (!quien || quien.length > 60) return json({ error: 'falta «quien»' }, 400);
    if (!ids.length || !A.incidente(id)) return json({ error: 'faltan reportes o el incidente no existe' }, 400);
    try {
      const nuevo = A.separar(id, ids, quien, ahora());
      return json({ ok: true, nuevo });
    } catch (e) { return json({ error: String((e as Error).message) }, 400); }
  }

  return async function api(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...JSONH, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type, x-muni-pin' } });
    try {
      if (p === '/api/sync' && req.method === 'POST') return await sync(req);
      if (p === '/api/stats' && req.method === 'GET') {
        const { lista } = incidentes();
        return json({ ...A.stats(), verified: false, incidentes: lista.length, servidor: 'local' });
      }
      if (p === '/api/reports' && req.method === 'GET') {
        const ids = url.searchParams.get('ids');
        if (ids) {
          const list = ids.split(',').filter((x) => ID_REP.test(x)).slice(0, 200);
          const rows = A.reportesPorId(list);
          return json({ count: rows.length, reports: rows });
        }
        const limit = Math.min(200, Math.max(1, +(url.searchParams.get('limit') || 50)));
        const rows = A.ultimosReportes(limit);
        return json({ count: rows.length, reports: rows, note: 'Reportes ciudadanos NO VERIFICADOS' });
      }
      if (p === '/api/incidentes' && req.method === 'GET') {
        const { lista } = incidentes();
        return json({ count: lista.length, incidentes: lista, generado: ahora(), reglas: 'agentards/producto/decision-confianza.md (17-oct-2026)', nota: 'Reporte vecinal · por validar: lo valida la municipalidad' });
      }
      if (p === '/api/estado' && req.method === 'GET') {
        const ids = (url.searchParams.get('ids') ?? '').split(',').filter((x) => ID_REP.test(x)).slice(0, 200);
        const { t, lista } = incidentes();
        return json({ estados: estadoDeReportes(ids, lista, t), generado: ahora() });
      }
      if (p === '/api/fotos' && req.method === 'POST') return await subirFoto(req, url);
      const mf = /^\/api\/fotos\/([^/]+)$/.exec(p);
      if (mf && (req.method === 'GET' || req.method === 'HEAD')) return verFoto(mf[1]);
      const mi = /^\/api\/incidentes\/([^/]+)\/(estado|unir|separar)$/.exec(p);
      if (mi && req.method === 'POST') {
        const id = decodeURIComponent(mi[1]);
        if (!ID_INC.test(id)) return json({ error: 'id de incidente inválido' }, 400);
        return await (mi[2] === 'estado' ? cambiarEstado : mi[2] === 'unir' ? unir : separar)(req, id);
      }
      return json({ error: 'no encontrado' }, 404);
    } catch (e) {
      return json({ error: String((e as Error).message) }, 500);
    }
  };
}
