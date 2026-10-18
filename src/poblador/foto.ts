// Foto del reporte: se comprime en el celular a ~150 KB (JPEG) y se guarda en IndexedDB junto al reporte.
// No viaja por QR (una foto pesa 50 a 200 veces más que 20 reportes); sube cuando ESTE celular tiene internet.

export const OBJETIVO_BYTES = 150_000;
export const LADO_MAX = 1280;
const LADO_MIN = 320;

/** Secuencia de intentos (lado mayor en px, calidad JPEG): primero baja la calidad, luego el tamaño. */
export function intentos(ladoOriginal: number): { lado: number; q: number }[] {
  const out: { lado: number; q: number }[] = [];
  let lado = Math.min(LADO_MAX, Math.max(1, Math.round(ladoOriginal)));
  while (out.length < 12) {
    for (const q of [0.82, 0.7, 0.58]) out.push({ lado, q });
    if (lado <= LADO_MIN) break;
    lado = Math.max(LADO_MIN, Math.round(lado * 0.75));
  }
  return out;
}

export interface FotoComprimida { blob: Blob; w: number; h: number; bytes: number }

async function abrir(file: Blob): Promise<ImageBitmap> {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions); }
  catch { return await createImageBitmap(file); }
}

const aBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('toBlob vacío'))), 'image/jpeg', q));

export async function comprimirFoto(file: Blob, objetivo = OBJETIVO_BYTES): Promise<FotoComprimida> {
  const bmp = await abrir(file);
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  let mejor: FotoComprimida | null = null;
  try {
    for (const { lado, q } of intentos(Math.max(bmp.width, bmp.height))) {
      const k = lado / Math.max(bmp.width, bmp.height);
      const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h); }
      const blob = await aBlob(c, q);
      mejor = { blob, w, h, bytes: blob.size };
      if (blob.size <= objetivo) break;
    }
  } finally { bmp.close?.(); }
  return mejor!;
}

export function blobABase64(b: Blob): Promise<string> {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => ko(r.error);
    r.readAsDataURL(b);
  });
}
