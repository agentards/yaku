// Genera código para el conector Cloudflare (execute) que sube un .pmtiles a KV (namespace BASEMAP)
// en trozos de 1 MiB: claves "<ruta>#<i>" y "<ruta>#meta". Uso:
//   KV_NS=<id> node scripts/upload-basemap.mjs public/basemap/piura_basemap_z11.5e31b1dc.pmtiles
// → deploy/kv-<archivo>-<i>.js (un trozo por llamada) y deploy/kv-<archivo>-meta.js
import fs from 'node:fs';
import path from 'node:path';
const CHUNK = 1 << 20;
const ns = process.env.KV_NS; if (!ns) throw new Error('falta KV_NS');
const file = process.argv[2];
const key = 'basemap/' + path.basename(file);
const buf = fs.readFileSync(file);
fs.mkdirSync('deploy', { recursive: true });
const base = path.basename(file, '.pmtiles');
const put = (k, b64) => `async () => {
  const b64 = ${JSON.stringify(b64)};
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const r = await cloudflare.request({ method: 'PUT', path: \`/accounts/\${accountId}/storage/kv/namespaces/${ns}/values/\${encodeURIComponent(${JSON.stringify(k)})}\`, body: bin, contentType: 'application/octet-stream', rawBody: true });
  return { key: ${JSON.stringify(k)}, bytes: bin.length, success: r.success, errors: r.errors };
}`;
const n = Math.ceil(buf.length / CHUNK);
for (let i = 0; i < n; i++) fs.writeFileSync(`deploy/kv-${base}-${i}.js`, put(`${key}#${i}`, buf.subarray(i * CHUNK, (i + 1) * CHUNK).toString('base64')));
fs.writeFileSync(`deploy/kv-${base}-meta.js`, put(`${key}#meta`, Buffer.from(JSON.stringify({ bytes: buf.length, chunk: CHUNK })).toString('base64')));
console.log(key, buf.length, 'trozos', n);
