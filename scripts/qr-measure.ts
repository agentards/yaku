// Mide round-trip real: registros → payload → PNG QR → jsQR → reensamblado.
// Uso: npm run measure:qr  (escribe results/qr-measure.json y .md)
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import { encodeForQR, Reassembler, serialize, pack, b64urlEncode, encodeLinkHash, DEFAULT_CHUNK } from '../src/codec';
import { sample } from '../tests/fixtures';

type Mode = 'alphanumeric' | 'byte';
function version(data: string, mode: Mode): number | null {
  try { return QRCode.create([{ data, mode } as any], { errorCorrectionLevel: 'M' }).version; } catch { return null; }
}
async function roundTrip(data: string, scale: number): Promise<{ ok: boolean; ms: number; px: number }> {
  const buf = await QRCode.toBuffer([{ data, mode: 'alphanumeric' }], { errorCorrectionLevel: 'M', scale, margin: 4 });
  const png = PNG.sync.read(buf);
  const t = performance.now();
  const r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return { ok: r?.data === data, ms: performance.now() - t, px: png.width };
}

const rows: any[] = [];
for (const N of [1, 5, 10, 20, 50]) {
  const recs = sample(N, 42);
  const json = new TextDecoder().decode(serialize(recs));
  const verbose = JSON.stringify(recs);
  const z = pack(recs);
  const single = encodeForQR(recs, 1e9).fragments[0];
  const frag = encodeForQR(recs, DEFAULT_CHUNK);
  const vers = frag.fragments.map((f) => version(f, 'alphanumeric')!);
  // round-trip de todos los fragmentos (scale 4 = 4 px/módulo) y reensamblado
  const reasm = new Reassembler();
  let complete: any = null, decodeMs = 0, allOk = true, px = 0;
  for (const f of [...frag.fragments].reverse()) {
    const rt = await roundTrip(f, 4);
    decodeMs += rt.ms; allOk &&= rt.ok; px = Math.max(px, rt.px);
    const out = reasm.add(f);
    if (out.status === 'complete') complete = out;
  }
  const rt2 = await Promise.all(frag.fragments.map((f) => roundTrip(f, 2)));
  rows.push({
    N,
    verboseJsonBytes: new TextEncoder().encode(verbose).length,
    positionalJsonBytes: frag.jsonBytes,
    deflateBytes: z.length,
    base45Chars: frag.base45Chars,
    linkHashChars: encodeLinkHash(recs).length,
    singleQR_base45_alnum: version(single, 'alphanumeric'),
    singleQR_b64url_byte: version(b64urlEncode(z), 'byte'),
    singleQR_rawJson_byte: version(json, 'byte'),
    fragments: frag.fragments.length,
    fragVersionMax: Math.max(...vers),
    fragChars: frag.fragments.map((f) => f.length),
    decodeOK_scale4: allOk,
    decodeOK_scale2: rt2.every((r) => r.ok),
    reassembledOK: !!complete && complete.records.length === recs.length && complete.records.every((r: any, i: number) => (Object.keys(r) as (keyof typeof r)[]).every((k) => r[k] === (recs[i] as any)[k])),
    jsqrMsTotal: +decodeMs.toFixed(1),
    pngPx: px,
  });
}
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/qr-measure.json', JSON.stringify({ date: new Date().toISOString(), chunk: DEFAULT_CHUNK, ecc: 'M', rows }, null, 2));
const md = [
  `Chunk ${DEFAULT_CHUNK} chars/QR, ECC M. "v—" = no cabe en un QR (máx. v40).`,
  '',
  '| N | JSON verboso B | JSON posicional B | deflate B | base45 chars | 1 QR base45/alnum | 1 QR b64url/byte | 1 QR JSON/byte | fragmentos (450) | versión máx frag | decode jsQR 4px | decode 2px | reensamblado | ms jsQR total |',
  '|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|:-:|:-:|--:|',
  ...rows.map((r) => `| ${r.N} | ${r.verboseJsonBytes} | ${r.positionalJsonBytes} | ${r.deflateBytes} | ${r.base45Chars} | v${r.singleQR_base45_alnum ?? '—'} | v${r.singleQR_b64url_byte ?? '—'} | v${r.singleQR_rawJson_byte ?? '—'} | ${r.fragments} | v${r.fragVersionMax} | ${r.decodeOK_scale4 ? '✅' : '❌'} | ${r.decodeOK_scale2 ? '✅' : '❌'} | ${r.reassembledOK ? '✅' : '❌'} | ${r.jsqrMsTotal} |`),
].join('\n');
fs.writeFileSync('results/qr-measure.md', md + '\n');
console.log(md);
