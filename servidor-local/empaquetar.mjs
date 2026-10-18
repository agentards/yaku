// Empaqueta servidor-local/servidor.ts (+ src/codec.ts + pako) en un solo archivo sin dependencias:
// servidor-local/salida/servidor.mjs. Lo usa la imagen Docker y `npm run servidor`.
import { build } from 'esbuild';

await build({
  entryPoints: ['servidor-local/servidor.ts'],
  outfile: 'servidor-local/salida/servidor.mjs',
  bundle: true, platform: 'node', format: 'esm', target: 'node22', minify: false, sourcemap: false,
  external: ['node:*'],
  logLevel: 'warning',
});
console.log('servidor-local/salida/servidor.mjs listo');
