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

type Fuente = { img: CanvasImageSource; w: number; h: number; cerrar(): void };
/** createImageBitmap; si falla (memoria justa en celulares de gama baja, formatos raros), un <img> normal. */
async function abrir(file: Blob): Promise<Fuente> {
  for (const op of [{ imageOrientation: 'from-image' } as ImageBitmapOptions, undefined]) {
    try { const b = await createImageBitmap(file, op); return { img: b, w: b.width, h: b.height, cerrar: () => b.close() }; } catch { /* siguiente */ }
  }
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.decoding = 'async';
  im.src = url;
  try { await im.decode(); } catch (e) { URL.revokeObjectURL(url); throw e; }
  return { img: im, w: im.naturalWidth, h: im.naturalHeight, cerrar: () => URL.revokeObjectURL(url) };
}

const aBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('toBlob vacío'))), 'image/jpeg', q));

export async function comprimirFoto(file: Blob, objetivo = OBJETIVO_BYTES): Promise<FotoComprimida> {
  const f = await abrir(file);
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  let mejor: FotoComprimida | null = null;
  try {
    for (const { lado, q } of intentos(Math.max(f.w, f.h))) {
      const k = lado / Math.max(f.w, f.h);
      const w = Math.max(1, Math.round(f.w * k)), h = Math.max(1, Math.round(f.h * k));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(f.img, 0, 0, w, h); }
      const blob = await aBlob(c, q);
      mejor = { blob, w, h, bytes: blob.size };
      if (blob.size <= objetivo) break;
    }
  } finally { f.cerrar(); c.width = c.height = 0; }
  if (!mejor) throw new Error('foto vacía');
  return mejor;
}

export function blobABase64(b: Blob): Promise<string> {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => ko(r.error);
    r.readAsDataURL(b);
  });
}
