import jsQR from 'jsqr';

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
let detector: Detector | null | undefined;

export async function getDetector(): Promise<Detector | null> {
  if (detector !== undefined) return detector;
  detector = null;
  const BD = (globalThis as any).BarcodeDetector;
  if (BD) {
    try {
      const fmts: string[] = await BD.getSupportedFormats();
      if (fmts.includes('qr_code')) detector = new BD({ formats: ['qr_code'] });
    } catch { /* sin soporte real */ }
  }
  return detector ?? null;
}

// ---------- núcleo puro (sin DOM, se prueba en Node) ----------

/** Recorte (sx, sy, sw, sh) del cuadro llevado a dw × dh px antes de pasarlo a jsQR. */
export interface Region { name: string; sx: number; sy: number; sw: number; sh: number; dw: number; dh: number }
export interface Pixels { data: Uint8ClampedArray; width: number; height: number }
/** Entrega los píxeles RGBA de una región ya escalada (canvas en el navegador, JS puro en los tests). */
export type Sampler = (r: Region) => Pixels;

/** Cuadrado central de lado f × lado corto, escalado a `zoom` × su tamaño (o a `px` fijos si zoom = 0). */
function center(name: string, w: number, h: number, f: number, zoom: number, cap: number, px = 0): Region {
  const side = Math.round(Math.min(w, h) * f);
  const d = Math.min(cap, zoom ? Math.round(side * zoom) : px);
  return { name, sx: Math.round((w - side) / 2), sy: Math.round((h - side) / 2), sw: side, sh: side, dw: d, dh: d };
}

/**
 * Recortes a probar en un cuadro w × h.
 * El QR de otro celular suele quedar cerca del centro y ocupar 30–60 % del lado corto. Reducir el cuadro
 * entero (lo que se hacía antes) deja módulos de 2–3 px y jsQR falla; medido con cuadros simulados
 * (scripts/qr-camara-bench.ts), jsQR lee mucho mejor si el recorte central se AMPLÍA ×1,5–2 (más px por
 * módulo para ubicar los patrones y muestrear la grilla). Aun así, jsQR acierta o falla según la escala casi
 * al azar; por eso hay varias escalas y la cámara las rota cuadro a cuadro. `cap` limita el lado del recorte
 * escalado para que cada intento cueste poco; el cuadro completo cubre un QR descentrado.
 */
export function planRegions(w: number, h: number, cap = 960): Region[] {
  const k = Math.min(1, cap / Math.max(w, h));
  return [
    center('c60x2', w, h, 0.6, 2, cap),
    center('c85x1.5', w, h, 0.85, 1.5, cap),
    center('c85@480', w, h, 0.85, 0, cap, 480), // reducir ayuda con desenfoque o módulos grandes
    center('c100@640', w, h, 1, 0, cap, 640),
    center('c50@960', w, h, 0.5, 0, cap, 960),
    center('c70@800', w, h, 0.7, 0, cap, 800),
    { name: 'todo', sx: 0, sy: 0, sw: w, sh: h, dw: Math.round(w * k), dh: Math.round(h * k) },
  ];
}

export function decodeRegion(sample: Sampler, r: Region, invert = false): string | null {
  const px = sample(r);
  return jsQR(px.data, px.width, px.height, { inversionAttempts: invert ? 'attemptBoth' : 'dontInvert' })?.data ?? null;
}

/** Prueba todos los recortes de una vez (imágenes subidas y tests); la cámara usa uno por cuadro. */
export function decodeFrame(sample: Sampler, w: number, h: number, cap = 960, invert = false): { data: string; region: string } | null {
  for (const r of planRegions(w, h, cap)) {
    const data = decodeRegion(sample, r, invert);
    if (data) return { data, region: r.name };
  }
  return null;
}

// ---------- navegador ----------

let canvas: HTMLCanvasElement | undefined;
let ctx: CanvasRenderingContext2D | undefined;

function canvasSampler(src: CanvasImageSource): Sampler {
  return (r) => {
    if (!canvas) {
      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    }
    if (canvas.width !== r.dw) canvas.width = r.dw;
    if (canvas.height !== r.dh) canvas.height = r.dh;
    ctx!.imageSmoothingEnabled = true;
    ctx!.imageSmoothingQuality = 'high';
    ctx!.drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, r.dw, r.dh);
    return ctx!.getImageData(0, 0, r.dw, r.dh);
  };
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  const ds = await navigator.mediaDevices.enumerateDevices();
  return ds.filter((d) => d.kind === 'videoinput');
}

export async function startCamera(video: HTMLVideoElement, deviceId?: string): Promise<MediaStream> {
  // 1280×720 basta para un QR v13 a 20–30 cm y mantiene cada intento de jsQR bajo ~40 ms.
  const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
  const stream = await navigator.mediaDevices.getUserMedia({
    video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: 'environment' }, ...size },
    audio: false,
  });
  const track = stream.getVideoTracks()[0];
  try { await track?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }); } catch { /* sin autofoco configurable */ }
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  return stream;
}

export interface ScanStats { frames: number; engine: 'BarcodeDetector' | 'jsQR'; reads?: number; region?: string }

/**
 * Bucle de decodificación; llama onData por cada lectura (puede repetirse).
 * Con BarcodeDetector lee el cuadro entero y, cada 3 cuadros, prueba además un recorte con jsQR por si el
 * detector nativo falla en ese equipo; si el detector lanza error 5 veces seguidas, queda solo jsQR.
 * Con jsQR prueba un recorte por cuadro en rotación (los 2 primeros, que leen la mayoría de las veces,
 * se intercalan con cada uno de los demás) y se queda en el que acaba de leer (el QR animado cambia cada
 * 500 ms y casi siempre está en el mismo lugar).
 */
export async function scanLoop(video: HTMLVideoElement, onData: (s: string) => void, stats: ScanStats, isRunning: () => boolean) {
  const det = await getDetector();
  stats.engine = det ? 'BarcodeDetector' : 'jsQR';
  stats.reads ??= 0;
  const sample = canvasSampler(video);
  let k = 0, detErrors = 0, order: number[] = [];
  const tick = async () => {
    if (!isRunning()) return;
    const w = video.videoWidth, h = video.videoHeight;
    if (video.readyState >= 2 && w) {
      stats.frames++;
      let got = false;
      if (det && detErrors < 5) {
        try {
          for (const c of await det.detect(video)) { onData(c.rawValue); got = true; }
          detErrors = 0;
        } catch { if (++detErrors >= 5) stats.engine = 'jsQR'; }
      }
      if (!got && (!det || detErrors >= 5 || stats.frames % 3 === 0)) {
        const regs = planRegions(w, h);
        if (!order.length) for (let j = 2; j < regs.length; j++) order.push(0, 1, j);
        const r = regs[order[k % order.length]];
        try {
          const s = decodeRegion(sample, r);
          if (s) { got = true; stats.region = r.name; onData(s); } else k++;
        } catch { k++; /* cuadro inválido */ }
      }
      if (got) stats.reads!++;
    }
    setTimeout(tick, det ? 60 : 20);
  };
  tick();
}

/** Decodifica un QR desde una imagen/captura (siempre jsQR: determinista, offline). */
export async function decodeImageFile(file: Blob): Promise<string | null> {
  const bmp = await createImageBitmap(file);
  try {
    return decodeFrame(canvasSampler(bmp), bmp.width, bmp.height, 1200, true)?.data ?? null;
  } finally { bmp.close?.(); }
}
