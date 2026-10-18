// Servidor local de Yaku: PWA (dist/) + API con SQLite (node:sqlite), sin Cloudflare.
//   node servidor-local/servidor.ts            (Node ≥ 23.6 ejecuta TypeScript directo)
//   node servidor-local/salida/servidor.mjs    (empaquetado con esbuild; lo usa la imagen Docker)
// Variables: PORT (8080), HOST (0.0.0.0), YAKU_DIST (dist), YAKU_DATOS (servidor-local/datos),
//            MUNI_PIN (si falta se genera uno temporal y se muestra en la consola), YAKU_REGLAS (JSON parcial).
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Almacen } from './almacen.ts';
import { CABECERA_IP, crearApi } from './api.ts';
import { servirEstatico } from './estaticos.ts';
import { conCambios, REGLAS } from './reglas.ts';

const MAX_LECTURA = 640 * 1024; // foto de 400 KB en base64 + JSON

// Cabeceras de seguridad para todo (la PWA y la API). HSTS solo cuenta cuando se sirve por HTTPS (Traefik).
const SEGURIDAD: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'strict-transport-security': 'max-age=31536000',
  'cross-origin-opener-policy': 'same-origin',
};

const PRIVADA = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:|::ffff:(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.))/i;
/** IP del cliente. Si quien conecta es una red privada (Traefik u otro proxy en Docker), se usa el último salto de
 *  X-Forwarded-For, que agrega ese proxy; si conecta directo desde internet, se ignora lo que mande el cliente. */
function ipCliente(req: http.IncomingMessage): string {
  const par = req.socket.remoteAddress ?? '';
  const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return PRIVADA.test(par) && xff.length ? xff[xff.length - 1] : par || 'desconocida';
}

export interface Opciones {
  puerto?: number; host?: string; dist?: string; datos?: string; pin?: string; reglas?: unknown; silencioso?: boolean;
}

export function iniciar(o: Opciones = {}) {
  const env = process.env;
  const dist = path.resolve(o.dist ?? env.YAKU_DIST ?? 'dist');
  const datos = path.resolve(o.datos ?? env.YAKU_DATOS ?? 'servidor-local/datos');
  fs.mkdirSync(datos, { recursive: true });
  let pin = o.pin ?? env.MUNI_PIN ?? '';
  if (!o.pin && env.NODE_ENV === 'production' && pin.length < 8) console.warn('Aviso: MUNI_PIN tiene menos de 8 caracteres. Funciona, pero conviene uno más largo.');
  const pinTemporal = !pin;
  if (pinTemporal) pin = String(randomInt(100000, 1000000));
  let cambios: unknown = o.reglas;
  if (cambios === undefined && env.YAKU_REGLAS) { try { cambios = JSON.parse(env.YAKU_REGLAS); } catch { console.warn('YAKU_REGLAS no es JSON válido: se usan las reglas por defecto'); } }
  const almacen = new Almacen(path.join(datos, 'yaku.db'), conCambios(REGLAS, cambios));
  // Bloqueo por PIN incorrecto: YAKU_PIN_INTENTOS fallos (0 = sin bloqueo) en 10 min → YAKU_PIN_BLOQUEO_MIN minutos.
  const intentos = Number(env.YAKU_PIN_INTENTOS ?? 10), bloqueoMin = Number(env.YAKU_PIN_BLOQUEO_MIN ?? 5);
  const api = crearApi({
    almacen, pin, fotosDir: path.join(datos, 'fotos'),
    intentosPin: { max: Number.isFinite(intentos) && intentos >= 0 ? intentos : 10, ventanaMs: 10 * 60_000, bloqueoMs: (Number.isFinite(bloqueoMin) && bloqueoMin > 0 ? bloqueoMin : 5) * 60_000 },
  });

  const server = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SEGURIDAD)) res.setHeader(k, v);
    const pathname = (req.url ?? '/').split('?')[0];
    if (!pathname.startsWith('/api/')) {
      if (pathname === '/salud') { res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); return; }
      return servirEstatico(dist, req, res);
    }
    try {
      const chunks: Buffer[] = [];
      let n = 0;
      for await (const c of req) {
        n += (c as Buffer).length;
        if (n > MAX_LECTURA) { res.writeHead(413, { 'content-type': 'application/json' }).end('{"error":"payload demasiado grande"}'); req.destroy(); return; }
        chunks.push(c as Buffer);
      }
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v); else if (Array.isArray(v)) headers.set(k, v.join(', '));
      headers.set(CABECERA_IP, ipCliente(req));
      const conCuerpo = req.method !== 'GET' && req.method !== 'HEAD';
      const r = await api(new Request(`http://${req.headers.host ?? 'local'}${req.url}`, { method: req.method, headers, body: conCuerpo ? Buffer.concat(chunks) : undefined }));
      const h: Record<string, string> = {};
      r.headers.forEach((v, k) => { h[k] = v; });
      res.writeHead(r.status, h);
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      console.error('error en', req.method, pathname, e);
      res.end(JSON.stringify({ error: 'error interno del servidor' }));
    }
  });

  const puerto = o.puerto ?? Number(env.PORT ?? 8080);
  const host = o.host ?? env.HOST ?? '0.0.0.0';
  const listo = new Promise<number>((ok) => server.listen(puerto, host, () => ok((server.address() as { port: number }).port)));
  if (!o.silencioso) listo.then((p) => {
    console.log(`Yaku servidor local en http://localhost:${p}  (dist: ${dist}, datos: ${datos})`);
    if (!fs.existsSync(path.join(dist, 'index.html'))) console.warn('  Ojo: no hay dist/index.html → corre «npm run build» (la API funciona igual).');
    console.log(pinTemporal ? `  MUNI_PIN no definido: PIN temporal de esta sesión = ${pin}` : '  MUNI_PIN definido por variable de entorno.');
  });
  const cerrar = () => new Promise<void>((ok) => server.close(() => { almacen.cerrar(); ok(); }));
  return { server, listo, cerrar, almacen };
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (esPrincipal) {
  const s = iniciar();
  const salir = () => { s.cerrar().then(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
}
