// Bench de lectura QR con cuadros de cámara SIMULADOS (tests/qr-camara-sim.ts) a 1280×720 y 1920×1080.
// Compara la estrategia anterior (cuadro entero reducido a 800 px) con la nueva (recortes de src/scanner.ts).
// Uso: npx vite-node scripts/qr-camara-bench.ts [n=10]   → results/qr-camara.md y .json
import fs from 'node:fs';
import jsQR from 'jsqr';
import { encodeForQR, DEFAULT_CHUNK } from '../src/codec';
import { decodeFrame, planRegions, decodeRegion } from '../src/scanner';
import { sample } from '../tests/fixtures';
import { simFrame, jsSampler } from '../tests/qr-camara-sim';

const N = +(process.argv[2] ?? 10), OFFSET = +(process.argv[3] ?? 0); // OFFSET cambia las semillas (control de sobreajuste)
const payloads = {
  '1 registro (v7)': encodeForQR(sample(1, 7), DEFAULT_CHUNK).fragments[0],
  '20 registros, fragmento chunk 450 (v13)': encodeForQR(sample(20, 42), DEFAULT_CHUNK).fragments[0],
  '20 registros, fragmento chunk 300 (v11)': encodeForQR(sample(20, 42), 300).fragments[0],
};
const old = (s: ReturnType<typeof jsSampler>, w: number, h: number) => {
  const k = Math.min(1, 800 / Math.max(w, h));
  const px = s({ name: 'old', sx: 0, sy: 0, sw: w, sh: h, dw: Math.round(w * k), dh: Math.round(h * k) });
  return jsQR(px.data, px.width, px.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
};

const rows: any[] = [], fails: any[] = [];
for (const [W, H] of [[1280, 720], [1920, 1080]]) {
  for (const [name, text] of Object.entries(payloads)) {
    let okOld = 0, okNew = 0, ms = 0, region: Record<string, number> = {};
    const msRegion: Record<string, number[]> = {};
    for (let i = 0; i < N; i++) {
      const seed = W * 1000 + i * 17 + text.length + OFFSET;
      const { px, info } = simFrame(text, W, H, seed);
      const s = jsSampler(px);
      if (old(s, W, H) === text) okOld++;
      const t = performance.now();
      const r = decodeFrame(s, W, H);
      ms += performance.now() - t;
      if (r?.data === text) { okNew++; region[r.region] = (region[r.region] ?? 0) + 1; } else fails.push({ W, H, name, ...info });
      for (const reg of planRegions(W, H)) { const t0 = performance.now(); decodeRegion(s, reg); (msRegion[reg.name] ??= []).push(performance.now() - t0); }
    }
    const avg = Object.fromEntries(Object.entries(msRegion).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b) / v.length)]));
    rows.push({ res: `${W}×${H}`, payload: name, n: N, antes: okOld, ahora: okNew, regionQueLeyo: region, msPorRecorteNode: avg });
    console.log(`${W}×${H} ${name}: antes ${okOld}/${N} · ahora ${okNew}/${N}`, region, avg);
  }
}
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/qr-camara.json', JSON.stringify({ fecha: new Date().toISOString(), simulado: true, rows, fails }, null, 2));
const md = [
  '# Lectura QR con cuadros de cámara SIMULADOS',
  '',
  `Generado por \`npx vite-node scripts/qr-camara-bench.ts\` el ${new Date().toISOString().slice(0, 16)}Z. **SIMULADO**: perspectiva, giro ±17°, QR al 30–60 % del lado corto, desenfoque, reflejo, moiré, viñeta y ruido (tests/qr-camara-sim.ts). No reemplaza la prueba con 2 celulares.`,
  '',
  '| Cuadro | Payload | Antes (cuadro entero a 800 px) | Ahora (recortes) | Recorte que leyó | ms por recorte (Node) |',
  '|---|---|--:|--:|---|---|',
  ...rows.map((r) => `| ${r.res} | ${r.payload} | ${r.antes}/${r.n} | **${r.ahora}/${r.n}** | ${Object.entries(r.regionQueLeyo).map(([k, v]) => `${k}:${v}`).join(' ')} | ${Object.entries(r.msPorRecorteNode).map(([k, v]) => `${k} ${v}`).join(' · ')} |`),
  '',
  fails.length ? `Fallos (semilla y condiciones): ${fails.map((f) => `${f.W}×${f.H} ${f.name} seed ${f.seed} (QR ${f.frac} del lado, ${f.pxPerModule} px/módulo, giro ${f.rotDeg}°, blur ${f.blur}, reflejo ${f.glare})`).join('; ')}` : 'Sin fallos.',
].join('\n');
fs.writeFileSync('results/qr-camara.md', md + '\n');
console.log(md);
