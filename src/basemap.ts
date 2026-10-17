// Mapa base PMTiles con uso sin red real.
// - El archivo .pmtiles NO va en el precache del service worker (ver README): se guarda completo en
//   Cache Storage ('yaku-basemap-v1') la primera vez que hay red, con progreso visible y verificación
//   de tamaño + sha256.
// - MapLibre lee el archivo con el protocolo pmtiles:// a través de BlobOrFetchSource: si ya hay copia
//   guardada, los rangos se sirven con Blob.slice() (sin red); si todavía no, usa peticiones Range
//   al propio sitio mientras se completa la descarga.
import { FetchSource, type RangeResponse, type Source } from 'pmtiles';
import type { BasemapFile } from './basemap-config';

export const BASEMAP_CACHE = 'yaku-basemap-v1';

export interface CacheLike {
  match(req: string): Promise<Response | undefined>;
  put(req: string, res: Response): Promise<void>;
  keys(): Promise<readonly { url: string }[]>;
  delete(req: any): Promise<boolean>;
}

export class BlobOrFetchSource implements Source {
  blob: Blob | null = null;
  rangeRequests = 0;
  blobReads = 0;
  private fetchSrc: FetchSource | null = null;
  ready: Promise<unknown> = Promise.resolve();
  constructor(private url: string) {}
  getKey() { return this.url; }
  setBlob(b: Blob) { this.blob = b; }
  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    await this.ready.catch(() => undefined);
    if (this.blob) {
      this.blobReads++;
      return { data: await this.blob.slice(offset, offset + length).arrayBuffer() };
    }
    this.rangeRequests++;
    this.fetchSrc ??= new FetchSource(this.url);
    return this.fetchSrc.getBytes(offset, length, signal, etag);
  }
}

export async function sha256Hex(b: Blob | ArrayBuffer): Promise<string> {
  const buf = b instanceof Blob ? await b.arrayBuffer() : b;
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Copia guardada válida (tamaño correcto) o null. */
export async function cachedBasemap(cache: CacheLike, url: string, cfg: BasemapFile): Promise<Blob | null> {
  const r = await cache.match(url);
  if (!r) return null;
  const b = await r.blob();
  if (b.size !== cfg.bytes) { await cache.delete(url); return null; }
  return b;
}

export type Progress = (loaded: number, total: number) => void;

/** Descarga el archivo completo (una sola petición GET sin Range), verifica y lo guarda. */
export async function downloadBasemap(cache: CacheLike, url: string, cfg: BasemapFile, onProgress: Progress = () => {}, fetchImpl: typeof fetch = fetch): Promise<Blob> {
  const res = await fetchImpl(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = cfg.bytes;
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress(0, total);
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); loaded += value.byteLength; onProgress(loaded, total);
    }
  } else {
    const ab = new Uint8Array(await res.arrayBuffer()); chunks.push(ab); loaded = ab.byteLength; onProgress(loaded, total);
  }
  const blob = new Blob(chunks as BlobPart[], { type: 'application/vnd.pmtiles' });
  if (blob.size !== cfg.bytes) throw new Error(`tamaño ${blob.size} ≠ ${cfg.bytes}`);
  const sha = await sha256Hex(blob);
  if (sha !== cfg.sha256) throw new Error('sha256 no coincide');
  await cache.put(url, new Response(blob, { headers: { 'content-type': 'application/vnd.pmtiles', 'content-length': String(blob.size), 'x-sha256': sha } }));
  return blob;
}

/** Borra copias de archivos que ya no están en la configuración (builds anteriores). */
export async function pruneBasemaps(cache: CacheLike, keepUrls: string[]): Promise<number> {
  let n = 0;
  for (const k of await cache.keys()) if (!keepUrls.includes(k.url)) { await cache.delete(k); n++; }
  return n;
}

export const fmtMB = (b: number) => (b / 1e6).toFixed(1).replace('.', ',') + ' MB';
