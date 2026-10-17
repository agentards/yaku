// Genera íconos PNG simples (sin assets externos).
import { PNG } from 'pngjs';
import fs from 'node:fs';
for (const s of [192, 512]) {
  const p = new PNG({ width: s, height: s });
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4;
    const dx = x - s / 2, dy = y - s * 0.55, r = s * 0.28;
    const drop = dx * dx + dy * dy < r * r || (dy < 0 && Math.abs(dx) < (dy + s * 0.4) * 0.6 && dy > -s * 0.4);
    const [R, G, B] = drop ? [255, 255, 255] : [11, 61, 92];
    p.data[i] = R; p.data[i + 1] = G; p.data[i + 2] = B; p.data[i + 3] = 255;
  }
  fs.writeFileSync(`public/icon-${s}.png`, PNG.sync.write(p));
}
