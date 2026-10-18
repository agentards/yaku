// Sirve dist/ (la PWA ya compilada) con las mismas cabeceras que server/worker.ts, fallback SPA y Range para .pmtiles.
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.geojson': 'application/geo+json',
  '.pbf': 'application/x-protobuf', '.pmtiles': 'application/vnd.pmtiles', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

export function parseRange(h: string | undefined, size: number): [number, number] | null | 'invalid' {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let a: number, b: number;
  if (m[1] === '') { a = Math.max(0, size - +m[2]); b = size - 1; } else { a = +m[1]; b = m[2] === '' ? size - 1 : Math.min(+m[2], size - 1); }
  if (a > b || a >= size) return 'invalid';
  return [a, b];
}

/** Ruta del archivo dentro de raiz, o null si se sale (../) o no existe. */
function resolver(raiz: string, pathname: string): string | null {
  let p = pathname;
  try { p = decodeURIComponent(pathname); } catch { /* ruta mal codificada: se usa tal cual */ }
  const f = path.resolve(raiz, '.' + path.posix.normalize('/' + p));
  if (f !== raiz && !f.startsWith(raiz + path.sep)) return null;
  try { return fs.statSync(f).isFile() ? f : null; } catch { return null; }
}

export function servirEstatico(raiz: string, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://local');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }).end(); return; }
  let f = url.pathname === '/' ? resolver(raiz, '/index.html') : resolver(raiz, url.pathname);
  if (!f && !url.pathname.includes('.')) f = resolver(raiz, '/index.html');
  if (!f) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('no encontrado'); return; }
  const ext = path.extname(f).toLowerCase();
  const size = fs.statSync(f).size;
  const base: Record<string, string> = {
    'content-type': TIPOS[ext] ?? 'application/octet-stream',
    'cache-control': url.pathname.startsWith('/assets/') || ext === '.pmtiles' ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'permissions-policy': 'camera=(self), geolocation=(self)',
    'accept-ranges': 'bytes',
  };
  const r = parseRange(req.headers.range, size);
  if (r === 'invalid') { res.writeHead(416, { ...base, 'content-range': `bytes */${size}` }).end(); return; }
  const [a, b] = r ?? [0, size - 1];
  res.writeHead(r ? 206 : 200, { ...base, 'content-length': String(size ? b - a + 1 : 0), ...(r ? { 'content-range': `bytes ${a}-${b}/${size}` } : {}) });
  if (req.method === 'HEAD' || size === 0) { res.end(); return; }
  fs.createReadStream(f, { start: a, end: b }).pipe(res);
}
