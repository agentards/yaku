// Contraste WCAG de los tokens --yaku-* de la landing (src/landing/estilos.css). Escribe docs/landing/contraste.md
// y sale con código 1 si algún par queda bajo su mínimo (texto 4,5:1; texto grande, foco y bordes 3:1).
//   node scripts/contraste-landing.mjs
import fs from 'node:fs';

const css = fs.readFileSync('src/landing/estilos.css', 'utf8');
const T = Object.fromEntries([...css.matchAll(/--yaku-([a-z]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// [texto, fondo, uso, mínimo]
const P = [
  ['niebla', 'noche', 'Texto principal sobre la página', 4.5],
  ['bruma', 'noche', 'Texto secundario, fuentes y pies', 4.5],
  ['niebla', 'pizarra', 'Texto sobre tarjetas y la sección Confianza', 4.5],
  ['bruma', 'pizarra', 'Texto secundario sobre tarjetas', 4.5],
  ['agua', 'noche', 'Antetítulos, cifras, números de paso', 4.5],
  ['agua', 'pizarra', 'Íconos y etiquetas sobre tarjetas', 4.5],
  ['noche', 'barro', 'Texto del botón «Solicitar un piloto»', 4.5],
  ['noche', 'agua', 'Texto del botón del vecino y «Saltar al contenido»', 4.5],
  ['barro', 'noche', 'Camino de vuelta e insignia de respuesta (no texto)', 3],
  ['agua', 'noche', 'Anillo de foco (no texto)', 3],
];
let md = '# Contraste de la landing (WCAG 2.1 AA)\n\nGenerado por `node scripts/contraste-landing.mjs` desde los tokens de `src/landing/estilos.css`.\n\n| Texto | Fondo | Uso | Ratio | Mínimo | |\n|---|---|---|---|---|---|\n';
let fallas = 0, min = Infinity;
for (const [a, b, uso, m] of P) {
  const r = cr(T[a], T[b]); const ok = r >= m; if (!ok) { fallas++; console.log(`FALLA ${a} sobre ${b}: ${r.toFixed(2)} < ${m}`); }
  if (m === 4.5) min = Math.min(min, r);
  md += `| ${a} \`${T[a]}\` | ${b} \`${T[b]}\` | ${uso} | ${r.toFixed(2)} | ${m} | ${ok ? '✅' : '❌'} |\n`;
}
fs.mkdirSync('docs/landing', { recursive: true });
fs.writeFileSync('docs/landing/contraste.md', md);
console.log(`${P.length - fallas}/${P.length} ok; mínimo de texto ${min.toFixed(2)}`);
process.exit(fallas ? 1 : 0);
