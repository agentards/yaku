// SIMULADO: cuadros de cámara que imitan la foto de la pantalla de otro celular mostrando un QR de Yaku.
// No son fotos reales: perspectiva, giro, desenfoque, brillo de pantalla (negros grises, blancos apagados),
// reflejo, moiré, viñeta y ruido de sensor, con semilla fija para que el test sea reproducible.
// La validación con cámaras reales queda en docs/demo-3min.md (prueba con 2 celulares).
import QRCode from 'qrcode';
import type { Pixels, Region, Sampler } from '../src/scanner';

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Homografía que lleva 4 puntos src a 4 puntos dst (resuelve el sistema 8×8). */
function homography(src: number[][], dst: number[][]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

export interface SimInfo { seed: number; frac: number; pxPerModule: number; rotDeg: number; blur: number; glare: number; version: number }

/** Cuadro W×H (RGBA, gris) con el QR de `text` en la pantalla de un celular. */
export function simFrame(text: string, W: number, H: number, seed: number): { px: Pixels; info: SimInfo } {
  const r = rng(seed);
  const qr = QRCode.create([{ data: text, mode: 'alphanumeric' }], { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, q = 4, N = n + 2 * q;
  // Tamaño del QR (con zona silenciosa) respecto del lado corto: 30–60 % (celular a ~20–35 cm).
  const frac = 0.3 + r() * 0.3, side = frac * Math.min(W, H);
  const rot = (r() - 0.5) * 0.6; // ±17°
  const cx = W / 2 + (r() - 0.5) * 0.16 * W, cy = H / 2 + (r() - 0.5) * 0.16 * H;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const x = (a * side) / 2 + (r() - 0.5) * 0.14 * side, y = (b * side) / 2 + (r() - 0.5) * 0.14 * side; // perspectiva
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
  });
  const Hm = homography(corners, [[0, 0], [N, 0], [N, N], [0, N]]); // imagen → plano del QR (en módulos)
  const black = 20 + r() * 45, white = 165 + r() * 75; // pantalla: negro gris, blanco apagado
  const bezel = 15 + r() * 20, table = 70 + r() * 90;
  const glare = r() < 0.6 ? r() * 70 : 0, gx = cx + (r() - 0.5) * side, gy = cy + (r() - 0.5) * side, gr = side * (0.15 + r() * 0.3);
  const moire = r() * 0.1, mp = 5 + r() * 15, ma = r() * Math.PI;
  const noise = 3 + r() * 7;
  const pxm = side / N;
  const blur = Math.min(3, Math.round(r() * 0.45 * pxm)); // desenfoque proporcional al tamaño del módulo
  const lum = (u: number, v: number): number => {
    if (u >= q && v >= q && u < q + n && v < q + n) return qr.modules.get(Math.floor(v - q), Math.floor(u - q)) ? black : white;
    if (u > -3 && u < N + 3 && v > -14 && v < N + 10) {
      // resto de la pantalla de la app: fondo blanco con renglones de texto arriba y abajo
      if ((v < -2 && v > -12 && Math.floor(v) % 3 === 0 && u > 0 && u < N * 0.8) || (v > N + 2 && v < N + 4 && u > 2 && u < N * 0.6)) return black + 40;
      return white;
    }
    if (u > -6 && u < N + 6 && v > -18 && v < N + 14) return bezel; // marco del celular
    return table + 25 * Math.sin(u * 0.05 + v * 0.03); // mesa / mano
  };
  const img = new Float32Array(W * H);
  const ss = [0.25, 0.75];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let acc = 0;
    for (const dy of ss) for (const dx of ss) {
      const X = x + dx, Y = y + dy, w = Hm[6] * X + Hm[7] * Y + Hm[8];
      acc += lum((Hm[0] * X + Hm[1] * Y + Hm[2]) / w, (Hm[3] * X + Hm[4] * Y + Hm[5]) / w);
    }
    img[y * W + x] = acc / 4;
  }
  boxBlur(img, W, H, blur);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = img[y * W + x];
    v *= 1 - moire * (0.5 + 0.5 * Math.sin((2 * Math.PI * (x * Math.cos(ma) + y * Math.sin(ma))) / mp));
    v += glare * Math.exp(-((x - gx) ** 2 + (y - gy) ** 2) / (2 * gr * gr));
    v *= 1 - 0.25 * (((x - W / 2) / W) ** 2 + ((y - H / 2) / H) ** 2) * 2; // viñeta
    v += (r() + r() + r() - 1.5) * noise * 1.4;
    const i = (y * W + x) * 4;
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
  }
  return { px: { data: out, width: W, height: H }, info: { seed, frac: +frac.toFixed(2), pxPerModule: +pxm.toFixed(1), rotDeg: Math.round((rot * 180) / Math.PI), blur, glare: Math.round(glare), version: qr.version } };
}

function boxBlur(a: Float32Array, W: number, H: number, rad: number) {
  if (rad < 1) return;
  const t = new Float32Array(a.length), k = 2 * rad + 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let d = -rad; d <= rad; d++) s += a[y * W + Math.min(W - 1, Math.max(0, x + d))];
    t[y * W + x] = s / k;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let d = -rad; d <= rad; d++) s += t[Math.min(H - 1, Math.max(0, y + d)) * W + x];
    a[y * W + x] = s / k;
  }
}

/** Equivalente en JS de canvas.drawImage con suavizado: promedio de área al reducir, bilineal al ampliar. */
export function jsSampler(src: Pixels): Sampler {
  return (r: Region) => {
    const out = new Uint8ClampedArray(r.dw * r.dh * 4), fx = r.sw / r.dw, fy = r.sh / r.dh, W = src.width;
    const at = (x: number, y: number) => src.data[(Math.min(src.height - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4];
    for (let y = 0; y < r.dh; y++) for (let x = 0; x < r.dw; x++) {
      let v: number;
      if (fx > 1) {
        const x0 = Math.floor(r.sx + x * fx), x1 = Math.max(x0 + 1, Math.floor(r.sx + (x + 1) * fx));
        const y0 = Math.floor(r.sy + y * fy), y1 = Math.max(y0 + 1, Math.floor(r.sy + (y + 1) * fy));
        let s = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += at(xx, yy);
        v = s / ((x1 - x0) * (y1 - y0));
      } else {
        const X = r.sx + (x + 0.5) * fx - 0.5, Y = r.sy + (y + 0.5) * fy - 0.5, xi = Math.floor(X), yi = Math.floor(Y), ax = X - xi, ay = Y - yi;
        v = (at(xi, yi) * (1 - ax) + at(xi + 1, yi) * ax) * (1 - ay) + (at(xi, yi + 1) * (1 - ax) + at(xi + 1, yi + 1) * ax) * ay;
      }
      const i = (y * r.dw + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
    }
    return { data: out, width: r.dw, height: r.dh };
  };
}
