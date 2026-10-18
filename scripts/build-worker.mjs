// Empaqueta dist/ dentro de un _worker.js (Pages "advanced mode") para desplegar con
// una sola llamada a la API de Pages (sin subir assets por separado). Genera:
//   deploy/_worker.js        — worker con todos los archivos embebidos
//   deploy/deploy-code.js    — función async para el conector Cloudflare (execute)
import fs from 'node:fs';
import path from 'node:path';
const dist = 'dist';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.json': 'application/json', '.geojson': 'application/geo+json', '.pbf': 'application/x-protobuf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const TEXTO = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.geojson', '.webmanifest', '.txt', '.xml']);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = {};
// Los .pmtiles no se embeben (pesan MB): van a KV con scripts/upload-basemap.mjs. Los videos de la landing (.mp4/.webm)
// tampoco: pasan el límite de tamaño del Worker; en Cloudflare la landing muestra sus pósters.
const PHASE = Number(process.env.VITE_PHASE ?? 3);
for (const f of walk(dist).filter((f) => !/\.(pmtiles|mp4|webm)$/.test(f) && !(PHASE < 2 && /cenepred-/.test(f)))) {
  const rel = '/' + path.relative(dist, f).split(path.sep).join('/');
  const ext = path.extname(f);
  const bin = !TEXTO.has(ext); // todo lo que no es texto va en base64 (imágenes, fuentes, teselas)
  files[rel] = { t: TYPES[ext] || 'application/octet-stream', b: bin, d: bin ? fs.readFileSync(f).toString('base64') : fs.readFileSync(f, 'utf8') };
}
fs.mkdirSync('deploy', { recursive: true });
const esbuild = await import('esbuild');
const r = await esbuild.build({
  entryPoints: ['server/worker.ts'], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', write: false, minify: true,
  plugins: [{ name: 'files', setup(b) {
    b.onResolve({ filter: /^virtual:files$/ }, () => ({ path: 'files', namespace: 'v' }));
    b.onLoad({ filter: /.*/, namespace: 'v' }, () => ({ contents: 'export default ' + JSON.stringify(files), loader: 'js' }));
  } }],
});
const worker = r.outputFiles[0].text;
fs.writeFileSync('deploy/_worker.js', worker);
const project = process.env.CF_PAGES_PROJECT || 'yaku-relay-proto';
const branch = process.env.CF_BRANCH || 'main';
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
  const body = [part('manifest', '{}', 'application/json'), part('branch', ${JSON.stringify(branch)}), part('commit_message', 'proto offline-qr'), part('_worker.js', worker, 'application/javascript+module', '_worker.js'), \`--\${b}--\`, ''].join('\\r\\n');
  const d = await cloudflare.request({ method: 'POST', path: \`/accounts/\${accountId}/pages/projects/\${project}/deployments\`, body, contentType: \`multipart/form-data; boundary=\${b}\`, rawBody: true });
  out.deploy = { success: d.success, status: d.status, errors: d.errors, id: d.result && d.result.id, url: d.result && d.result.url, aliases: d.result && d.result.aliases, stage: d.result && d.result.latest_stage };
  return out;
}`;
fs.writeFileSync('deploy/deploy-code.js', deployCode);
console.log('worker bytes', Buffer.byteLength(worker), 'files', Object.keys(files).length);
