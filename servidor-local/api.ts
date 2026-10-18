// API local (Request → Response, igual que server/worker.ts). /api/sync, /api/reports y /api/stats mantienen el
// contrato del Worker; lo demás es nuevo (plan-implementacion-local.md, WP1).
import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { OBS_TYPES, makeObservation, type NewObservation } from '../src/codec.ts';
import type { Almacen } from './almacen.ts';
import { idAviso, limpiarTexto, redondear, type AccionAviso, type Firmante } from './avisos.ts';
import { validarCambio } from './estados.ts';
import { limpiar, sinTildes, validarCarta } from './cartas.ts';
import { claveOk, hashToken, nuevoToken, TOKEN } from './usuarios.ts';
import { armarIncidentes, estadoDeReportes } from './vista.ts';

// CORS abierto como en el Worker (modo MVP); en modo estricto se quita (la API y la PWA comparten origen).
const JSONH = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (o: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(o), { status, headers: { ...JSONH, ...extra } });
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

export interface OpcionesApi {
  almacen: Almacen; pin: string; fotosDir: string; ahora?: () => number;
  /** false (por defecto, MVP): solo el PIN protege lo de la municipalidad. true: además bloqueo por intentos de PIN,
   *  histórico privado, límites de escritura, cuotas de fotos y sin CORS. Cada límite se puede fijar aparte abajo. */
  estricto?: boolean;
  /** Horas que dura una sesión del Centro de monitoreo (por defecto 72). */
  sesionHoras?: number;
  /** Firma los avisos de la municipalidad (sin firmante no se crean avisos). */
  firmante?: Firmante;
  /** Bloqueo por PIN incorrecto: tras `max` fallos dentro de `ventanaMs`, esa IP espera `bloqueoMs` (429). max 0 = sin bloqueo. */
  intentosPin?: { max: number; ventanaMs: number; bloqueoMs: number };
  /** Escrituras públicas (POST /api/sync y /api/fotos) por IP y minuto. */
  postsPorMinuto?: number;
  /** Cuotas de fotos: por reporte y en total (bytes). */
  fotosPorReporte?: number; fotosMaxBytes?: number;
}
/** IP del cliente: la pone servidor.ts en esta cabecera (pisa cualquier valor que mande el cliente). */
export const CABECERA_IP = 'x-yaku-ip';
const ipDe = (req: Request) => req.headers.get(CABECERA_IP) || 'desconocida';
/** Quién hizo la petición protegida: un usuario con sesión (token) o el PIN municipal (compatibilidad). */
export interface Acceso { modo: 'usuario' | 'pin'; usuario: string; rol: 'operador' }
export const MAX_HISTORICO = 5000;

export function crearApi(op: OpcionesApi) {
  const { almacen: A } = op;
  const ahora = op.ahora ?? Date.now;
  const pinHash = createHash('sha256').update(op.pin).digest();
  fs.mkdirSync(op.fotosDir, { recursive: true });

  const pinOk = (p: string) => timingSafeEqual(createHash('sha256').update(p).digest(), pinHash);

  // ---- límites por IP (en memoria: se reinician con el proceso) ----
  const estricto = Boolean(op.estricto);
  const LIM = { max: estricto ? 10 : 0, ventanaMs: 10 * 60_000, bloqueoMs: 5 * 60_000, ...op.intentosPin };
  const fallos = new Map<string, { n: number; desde: number; hasta: number }>();
  const POSTS_MIN = op.postsPorMinuto ?? (estricto ? 120 : 0); // 0 = sin límite
  const posts = new Map<string, { n: number; desde: number }>();
  const podar = <V>(m: Map<string, V>, vencido: (v: V) => boolean) => { if (m.size > 5000) for (const [k, v] of m) if (vencido(v)) m.delete(k); };
  const esperar = (ms: number, error: string) => json({ error, codigo: 'limite' }, 429, { 'retry-after': String(Math.ceil(ms / 1000)) });

  /** Bloqueo por credencial incorrecta (solo en modo estricto): null si la IP puede intentar. */
  const bloqueada = (ip: string, t: number) => { const f = fallos.get(ip); return f && f.hasta > t ? esperar(f.hasta - t, 'demasiados intentos con PIN o contraseña incorrectos: espera unos minutos') : null; };
  const fallo = (ip: string, t: number) => {
    if (LIM.max <= 0) return;
    const f = fallos.get(ip);
    const g = f && t - f.desde <= LIM.ventanaMs ? f : { n: 0, desde: t, hasta: 0 };
    g.n++;
    if (g.n >= LIM.max) { g.hasta = t + LIM.bloqueoMs; console.warn(`credencial incorrecta ${g.n} veces desde ${ip}: bloqueada ${Math.round(LIM.bloqueoMs / 60_000)} min`); }
    fallos.set(ip, g);
    podar(fallos, (v) => v.hasta <= t && t - v.desde > LIM.ventanaMs);
  };
  const tokenDe = (req: Request) => /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;

  /** Acceso con sesión (Authorization: Bearer <token>) o con el PIN municipal (X-Muni-Pin). 401 falta o venció,
   *  403 incorrecto, 429 demasiados intentos desde esa IP (modo estricto). */
  const autenticar = async (req: Request): Promise<Acceso | Response> => {
    const ip = ipDe(req), t = ahora();
    const token = tokenDe(req);
    if (token) {
      const s = TOKEN.test(token) ? A.sesion(hashToken(token), t) : null;
      return s ? { modo: 'usuario', usuario: s.usuario, rol: 'operador' } : json({ error: 'la sesión venció o se cerró: vuelve a entrar', codigo: 'sesion' }, 401);
    }
    const b = bloqueada(ip, t);
    if (b) return b;
    const p = req.headers.get('x-muni-pin');
    if (!p) return json({ error: 'falta iniciar sesión (o el PIN municipal)', codigo: 'sin_credencial' }, 401);
    if (pinOk(p)) { fallos.delete(ip); return { modo: 'pin', usuario: 'pin', rol: 'operador' }; }
    fallo(ip, t);
    return json({ error: 'PIN incorrecto', codigo: 'pin' }, 403);
  };
  const HORAS = Math.max(1, op.sesionHoras ?? 72);
  /** null si la IP aún puede escribir en lo público; si no, 429. */
  const limitePost = (req: Request): Response | null => {
    if (POSTS_MIN <= 0) return null;
    const ip = ipDe(req), t = ahora();
    const c = posts.get(ip);
    const v = c && t - c.desde < 60_000 ? c : { n: 0, desde: t };
    v.n++;
    posts.set(ip, v);
    podar(posts, (x) => t - x.desde >= 60_000);
    return v.n > POSTS_MIN ? esperar(60_000 - (t - v.desde), 'demasiadas peticiones: espera un minuto') : null;
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
    // Celular que sube (opcional): si no es el autor del reporte, el reporte llegó por la cadena QR.
    const subidoPor = typeof body?.subidoPor === 'string' && /^[0-9a-z]{1,16}$/.test(body.subidoPor) ? body.subidoPor : null;
    const inserted = valid.length ? A.insertarReportes(valid, ahora(), subidoPor) : 0;
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
    const porReporte = op.fotosPorReporte ?? (estricto ? 3 : 0), maxBytes = op.fotosMaxBytes ?? (estricto ? 2 * 1024 ** 3 : 0); // 0 = sin cuota
    if (!A.foto(id)) {
      if (porReporte > 0 && A.fotosDeReporte(reportId) >= porReporte) return json({ error: 'ese reporte ya tiene el máximo de fotos' }, 409);
      if (maxBytes > 0 && A.totalFotos().bytes + bytes.length > maxBytes) return json({ error: 'el servidor alcanzó su cuota de fotos' }, 507);
    }
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
    return new Response(fs.readFileSync(archivo), { headers: { 'content-type': f.mime, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
  }

  async function cambiarEstado(req: Request, id: string) {
    const acc = await autenticar(req);
    if (acc instanceof Response) return acc;
    const body = await leerJson(req, 4096);
    if (body instanceof Response) return body;
    const { lista } = incidentes();
    const inc = lista.find((i) => i.id === id);
    if (!inc) return json({ error: 'incidente no encontrado' }, 404);
    const v = validarCambio(inc.estado, body);
    if (!v.ok) return json({ error: v.error, estado: inc.estado }, v.status);
    const cuando = ahora();
    A.guardarEstado({ incidente_id: id, estado: v.p.estado, accion: v.p.accion, motivo: v.p.motivo, quien: v.p.quien, usuario: acc.usuario, cuando, respaldo: inc.respaldo });
    // Respuesta de la municipalidad (acción asignada o atendido): aviso firmado para todos los celulares y la cadena QR.
    let aviso = null;
    const accionAviso: AccionAviso | null = v.p.estado === 'atendido' ? 'atendido' : v.p.estado === 'accion_asignada' ? v.p.accion : null;
    if (op.firmante && accionAviso) {
      const min = Math.round(cuando / 60000);
      aviso = op.firmante.firmar({ id: idAviso(id, accionAviso, min), incidente: id, accion: accionAviso, tipo: inc.tipo, lat: redondear(inc.lat), lon: redondear(inc.lon), min, texto: limpiarTexto(body?.mensaje) });
      A.guardarAviso(aviso, cuando);
    }
    return json({ ok: true, incidente: incidentes().lista.find((i) => i.id === id), aviso });
  }

  async function unir(req: Request, id: string) {
    const acc = await autenticar(req);
    if (acc instanceof Response) return acc;
    const body = await leerJson(req, 4096);
    if (body instanceof Response) return body;
    const otro = String(body?.con ?? ''), quien = String(body?.quien ?? '').trim();
    if (!quien || quien.length > 60) return json({ error: 'falta «quien»' }, 400);
    const { lista } = incidentes();
    if (otro === id || !lista.some((i) => i.id === id) || !lista.some((i) => i.id === otro)) return json({ error: 'incidentes no encontrados' }, 404);
    A.unir(id, otro, quien, ahora(), acc.usuario);
    return json({ ok: true, incidente: incidentes().lista.find((i) => i.id === id) });
  }

  async function separar(req: Request, id: string) {
    const acc = await autenticar(req);
    if (acc instanceof Response) return acc;
    const body = await leerJson(req, 8192);
    if (body instanceof Response) return body;
    const ids = (Array.isArray(body?.reportes) ? body.reportes : []).map(String).filter((x: string) => ID_REP.test(x)).slice(0, 200);
    const quien = String(body?.quien ?? '').trim();
    if (!quien || quien.length > 60) return json({ error: 'falta «quien»' }, 400);
    if (!ids.length || !A.incidente(id)) return json({ error: 'faltan reportes o el incidente no existe' }, 400);
    try {
      const nuevo = A.separar(id, ids, quien, ahora(), acc.usuario);
      return json({ ok: true, nuevo });
    } catch (e) { return json({ error: String((e as Error).message) }, 400); }
  }

  return async function api(req: Request): Promise<Response> {
    const r = await responder(req);
    if (estricto) r.headers.delete('access-control-allow-origin');
    return r;
  };

  async function responder(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: estricto ? {} : { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, DELETE', 'access-control-allow-headers': 'content-type, x-muni-pin, authorization' } });
    try {
      if (req.method === 'POST' && (p === '/api/sync' || p === '/api/fotos' || p === '/api/cartas')) { const lim = limitePost(req); if (lim) return lim; }
      // «Estoy bien»: los celulares suben las cartas que llevan; la familia busca por nombre (nunca hay listado completo).
      if (p === '/api/cartas' && req.method === 'POST') {
        const body = await leerJson(req, MAX_BODY);
        if (body instanceof Response) return body;
        const subidoPor = typeof body?.subidoPor === 'string' && /^[0-9a-z]{1,16}$/.test(body.subidoPor) ? body.subidoPor : null;
        const validas = [], rechazadas: { id: unknown; why: string }[] = [];
        for (const x of (Array.isArray(body?.cartas) ? body.cartas.slice(0, 100) : [])) {
          const v = validarCarta(x, ahora());
          if (v.ok) validas.push({ ...v.c, busqueda: sinTildes(`${v.c.nombre} ${v.c.para}`) }); else rechazadas.push({ id: x?.id, why: v.why });
        }
        const inserted = validas.length ? A.insertarCartas(validas, ahora(), subidoPor) : 0;
        return json({ accepted: validas.map((c) => c.id), inserted, duplicates: validas.length - inserted, rejected: rechazadas });
      }
      // /api/estamos-bien?nombre= es la misma búsqueda para la página de la familia (yaku.lat/estamos-bien), sin el
      // código del celular que la escribió (solo lo necesita la app para verificar la carta).
      if ((p === '/api/cartas' || p === '/api/estamos-bien') && req.method === 'GET') {
        const q = sinTildes(limpiar(url.searchParams.get('q') ?? url.searchParams.get('nombre'), 40));
        if (q.length < 3) return json({ error: 'escribe al menos 3 letras del nombre' }, 400);
        const cartas = A.buscarCartas(q, 50);
        return json({ count: cartas.length, cartas: p === '/api/cartas' ? cartas : cartas.map(({ deviceId: _d, ...c }) => c), nota: 'Lo escribió quien firma; la municipalidad no lo verifica' });
      }
      if (p === '/api/sync' && req.method === 'POST') return await sync(req);
      // Sesión del Centro de monitoreo: usuario + contraseña → token (dura HORAS); el navegador lo guarda.
      if (p === '/api/sesion' && req.method === 'POST') {
        const ip = ipDe(req), t = ahora();
        const b = bloqueada(ip, t);
        if (b) return b;
        const body = await leerJson(req, 2048);
        if (body instanceof Response) return body;
        const usuario = String(body?.usuario ?? '').trim().toLowerCase(), clave = String(body?.clave ?? '');
        const u = usuario && clave ? A.usuario(usuario) : null;
        if (!u || !claveOk(clave, u.sal, u.hash)) { fallo(ip, t); return json({ error: 'usuario o contraseña incorrectos', codigo: 'credencial' }, 403); }
        fallos.delete(ip);
        const token = nuevoToken(), expira = t + HORAS * 3_600_000;
        A.crearSesion({ token_hash: hashToken(token), usuario: u.usuario, nombre: u.nombre, creada_at: t, expira_at: expira });
        return json({ token, usuario: u.usuario, nombre: u.nombre, expira });
      }
      if (p === '/api/sesion' && (req.method === 'GET' || req.method === 'DELETE')) {
        const token = tokenDe(req);
        const s = token && TOKEN.test(token) ? A.sesion(hashToken(token), ahora()) : null;
        if (!s) return json({ error: 'sin sesión', codigo: 'sesion' }, 401);
        if (req.method === 'DELETE') { A.cerrarSesion(hashToken(token!)); return json({ ok: true }); }
        return json({ usuario: s.usuario, nombre: s.nombre, expira: s.expira_at });
      }
      if (p === '/api/stats' && req.method === 'GET') {
        const { lista } = incidentes();
        return json({ ...A.stats(), verified: false, incidentes: lista.length, cartas: A.totalCartas(), servidor: 'local' });
      }
      if (p === '/api/reports' && req.method === 'GET') {
        const ids = url.searchParams.get('ids');
        if (ids) {
          const list = ids.split(',').filter((x) => ID_REP.test(x)).slice(0, 200);
          const rows = A.reportesPorId(list);
          return json({ count: rows.length, reports: rows });
        }
        // El histórico tiene ubicación exacta y nota de cada vecino: en modo estricto, solo con PIN.
        if (estricto) { const acc = await autenticar(req); if (acc instanceof Response) return acc; }
        const desde = url.searchParams.get('desde');
        if (desde !== null) {
          // Histórico para la línea de tiempo: received_at ≥ desde (ms), del más antiguo al más nuevo.
          const d = Number(desde);
          if (desde === '' || !Number.isFinite(d) || d < 0) return json({ error: 'desde: milisegundos desde 1970 (número ≥ 0)' }, 400);
          const lim = Math.min(MAX_HISTORICO, Math.max(1, Math.floor(Number(url.searchParams.get('limit') || 1000)) || 1000));
          const rows = A.reportesDesde(d, lim);
          return json({ count: rows.length, reports: rows, desde: d, hasta: rows.at(-1)?.received_at ?? null, truncado: rows.length === lim, note: 'Reportes vecinales por validar' });
        }
        const limit = Math.min(200, Math.max(1, +(url.searchParams.get('limit') || 50)));
        const rows = A.ultimosReportes(limit);
        return json({ count: rows.length, reports: rows, note: 'Reportes vecinales por validar' });
      }
      if (p === '/api/incidentes' && req.method === 'GET') {
        const acc = await autenticar(req);
        if (acc instanceof Response) return acc;
        const { lista } = incidentes();
        return json({ count: lista.length, incidentes: lista, generado: ahora(), reglas: 'la decisión de producto «confianza» (17-oct-2026)', nota: 'Reporte vecinal · por validar: lo valida la municipalidad' });
      }
      // Avisos de la municipalidad: públicos (son para todos los vecinos) y firmados.
      if (p === '/api/avisos/clave' && req.method === 'GET') return op.firmante ? json(op.firmante.jwkPublica) : json({ error: 'sin avisos' }, 404);
      if (p === '/api/avisos' && req.method === 'GET') {
        if (!op.firmante) return json({ error: 'sin avisos' }, 404);
        const d = Number(url.searchParams.get('desde') ?? 0);
        const desde = Number.isFinite(d) && d > 0 ? d : ahora() - 7 * 86_400_000;
        const avisos = A.avisosDesde(desde, 50).map(({ creado_at: _c, ...a }) => a);
        return json({ count: avisos.length, avisos, clave: op.firmante.jwkPublica });
      }
      if (p === '/api/estado' && req.method === 'GET') {
        const ids = (url.searchParams.get('ids') ?? '').split(',').filter((x) => ID_REP.test(x)).slice(0, 200);
        const { t, lista } = incidentes();
        return json({ estados: estadoDeReportes(ids, lista, t), generado: ahora() });
      }
      if (p === '/api/fotos' && req.method === 'POST') return await subirFoto(req, url);
      const mf = /^\/api\/fotos\/([^/]+)$/.exec(p);
      if (mf && (req.method === 'GET' || req.method === 'HEAD')) {
        const acc = await autenticar(req);
        return acc instanceof Response ? acc : verFoto(mf[1]);
      }
      const mi = /^\/api\/incidentes\/([^/]+)\/(estado|unir|separar)$/.exec(p);
      if (mi && req.method === 'POST') {
        const id = decodeURIComponent(mi[1]);
        if (!ID_INC.test(id)) return json({ error: 'id de incidente inválido' }, 400);
        return await (mi[2] === 'estado' ? cambiarEstado : mi[2] === 'unir' ? unir : separar)(req, id);
      }
      return json({ error: 'no encontrado' }, 404);
    } catch (e) {
      console.error('error en', req.method, p, e);
      return json({ error: 'error interno del servidor' }, 500);
    }
  }
}
