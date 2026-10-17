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

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

function jsqrFrom(src: CanvasImageSource, w: number, h: number, maxSide = 800): string | null {
  const k = Math.min(1, maxSide / Math.max(w, h));
  canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  const ds = await navigator.mediaDevices.enumerateDevices();
  return ds.filter((d) => d.kind === 'videoinput');
}

export async function startCamera(video: HTMLVideoElement, deviceId?: string): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();
  return stream;
}

export interface ScanStats { frames: number; engine: 'BarcodeDetector' | 'jsQR' }

/** Bucle de decodificación; llama onData por cada lectura (puede repetirse). */
export async function scanLoop(video: HTMLVideoElement, onData: (s: string) => void, stats: ScanStats, isRunning: () => boolean) {
  const det = await getDetector();
  stats.engine = det ? 'BarcodeDetector' : 'jsQR';
  const tick = async () => {
    if (!isRunning()) return;
    if (video.readyState >= 2 && video.videoWidth) {
      stats.frames++;
      try {
        if (det) {
          for (const c of await det.detect(video)) onData(c.rawValue);
        } else {
          const s = jsqrFrom(video, video.videoWidth, video.videoHeight);
          if (s) onData(s);
        }
      } catch { /* frame inválido */ }
    }
    setTimeout(tick, 60);
  };
  tick();
}

/** Decodifica un QR desde una imagen/captura (siempre jsQR: determinista, offline). */
export async function decodeImageFile(file: Blob): Promise<string | null> {
  const bmp = await createImageBitmap(file);
  return jsqrFrom(bmp, bmp.width, bmp.height, 1600);
}
