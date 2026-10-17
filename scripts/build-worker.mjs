// Empaqueta dist/ dentro de un _worker.js (Pages "advanced mode") para desplegar con
// una sola llamada a la API de Pages (sin subir assets por separado). Genera:
//   deploy/_worker.js        — worker con todos los archivos embebidos
//   deploy/deploy-code.js    — función async para el conector Cloudflare (execute)
import fs from 'node:fs';
import path from 'node:path';
const dist = 'dist';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.json': 'application/json' };
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = {};
for (const f of walk(dist)) {
  const rel = '/' + path.relative(dist, f).split(path.sep).join('/');
  const ext = path.extname(f);
  const bin = ext === '.png';
  files[rel] = { t: TYPES[ext] || 'application/octet-stream', b: bin, d: bin ? fs.readFileSync(f).toString('base64') : fs.readFileSync(f, 'utf8') };
}
const worker = `const FILES = ${JSON.stringify(files)};
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function cacheFor(p) {
  if (p.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  return 'no-cache';
}
export default {
  async fetch(req) {
    const url = new URL(req.url);
    // Endpoint mock de sincronización: eco sin persistencia (acepta ids recibidos).
    if (url.pathname === '/api/sync') {
      const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
      if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' } });
      if (req.method !== 'POST') return new Response(JSON.stringify({ ok: true, info: 'POST {records:[...]}' }), { headers: cors });
      try {
        const body = JSON.parse(await req.text());
        const ids = (body.records || []).map((r) => String(r.id)).filter((id) => /^[0-9a-z]{11}$/.test(id)).slice(0, 500);
        return new Response(JSON.stringify({ accepted: ids, persisted: false }), { headers: cors });
      } catch { return new Response(JSON.stringify({ error: 'json inválido' }), { status: 400, headers: cors }); }
    }
    let f = FILES[url.pathname] || (url.pathname === '/' ? FILES['/index.html'] : null);
    if (!f && req.method === 'GET' && !url.pathname.includes('.')) f = FILES['/index.html']; // SPA fallback
    if (!f) return new Response('no encontrado', { status: 404 });
    const h = { 'content-type': f.t, 'cache-control': cacheFor(url.pathname), 'x-content-type-options': 'nosniff', 'permissions-policy': 'camera=(self), geolocation=(self)' };
    return new Response(f.b ? b64(f.d) : f.d, { headers: h });
  },
};
`;
fs.mkdirSync('deploy', { recursive: true });
fs.writeFileSync('deploy/_worker.js', worker);
const project = process.env.CF_PAGES_PROJECT || 'yaku-relay-proto';
const deployCode = `async () => {
  const project = ${JSON.stringify(project)};
  const out = {};
  let exists = false;
  try { exists = (await cloudflare.request({ method: 'GET', path: \`/accounts/\${accountId}/pages/projects/\${project}\` })).success; } catch (e) { out.lookup = String(e.message || e).slice(0, 200); }
  if (!exists) {
    const c = await cloudflare.request({ method: 'POST', path: \`/accounts/\${accountId}/pages/projects\`, body: { name: project, production_branch: 'main' } });
    out.create = { success: c.success, errors: c.errors, subdomain: c.result && c.result.subdomain };
    if (!c.success) return out;
  }
  const worker = ${JSON.stringify(worker)};
  const b = 'YAKU' + Date.now();
  const part = (name, content, type, filename) => [\`--\${b}\`, \`Content-Disposition: form-data; name="\${name}"\` + (filename ? \`; filename="\${filename}"\` : ''), ...(type ? [\`Content-Type: \${type}\`] : []), '', content].join('\\r\\n');
  const body = [part('manifest', '{}', 'application/json'), part('branch', 'main'), part('commit_message', 'proto offline-qr'), part('_worker.js', worker, 'application/javascript+module', '_worker.js'), \`--\${b}--\`, ''].join('\\r\\n');
  const d = await cloudflare.request({ method: 'POST', path: \`/accounts/\${accountId}/pages/projects/\${project}/deployments\`, body, contentType: \`multipart/form-data; boundary=\${b}\`, rawBody: true });
  out.deploy = { success: d.success, status: d.status, errors: d.errors, id: d.result && d.result.id, url: d.result && d.result.url, aliases: d.result && d.result.aliases, stage: d.result && d.result.latest_stage };
  return out;
}`;
fs.writeFileSync('deploy/deploy-code.js', deployCode);
console.log('worker bytes', Buffer.byteLength(worker), 'files', Object.keys(files).length);
