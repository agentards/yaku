// Base propia del modo poblador (no toca la de src/db.ts): fotos de los reportes y estado de vuelta.
import { openDB, type IDBPDatabase } from 'idb';
import { masReciente, type EstadoReporte } from './estados';
import type { AvisoGuardado } from './avisos';

export interface FotoGuardada { id: string; blob: Blob; bytes: number; w: number; h: number; subida: boolean; subidaAt?: number }

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB('yaku-poblador', 2, {
    upgrade(d, viejo) {
      if (viejo < 1) { d.createObjectStore('fotos', { keyPath: 'id' }); d.createObjectStore('estados', { keyPath: 'id' }); }
      if (viejo < 2) d.createObjectStore('avisos', { keyPath: 'id' });
    },
  });
  return dbp;
}

export async function guardarFoto(f: Omit<FotoGuardada, 'subida'>) {
  await (await db()).put('fotos', { ...f, subida: false } satisfies FotoGuardada);
}
export async function fotos(): Promise<FotoGuardada[]> { return (await db()).getAll('fotos'); }
export async function marcarFotoSubida(id: string) {
  const d = await db();
  const f = (await d.get('fotos', id)) as FotoGuardada | undefined;
  if (f && !f.subida) await d.put('fotos', { ...f, subida: true, subidaAt: Date.now() });
}

export async function avisos(): Promise<AvisoGuardado[]> {
  return ((await (await db()).getAll('avisos')) as AvisoGuardado[]).sort((a, b) => b.min - a.min);
}
/** Guarda los avisos nuevos (o los que ahora sí se pudieron verificar). Devuelve los que son nuevos para este celular. */
export async function guardarAvisos(xs: AvisoGuardado[]): Promise<AvisoGuardado[]> {
  const d = await db();
  const tx = d.transaction('avisos', 'readwrite');
  const nuevos: AvisoGuardado[] = [];
  for (const a of xs) {
    const prev = (await tx.store.get(a.id)) as AvisoGuardado | undefined;
    if (!prev) { await tx.store.put(a); nuevos.push(a); }
    else if (!prev.verificado && a.verificado) await tx.store.put({ ...a, via: prev.via, recibidoAt: prev.recibidoAt });
  }
  await tx.done;
  return nuevos;
}

export async function estados(): Promise<Map<string, EstadoReporte>> {
  const xs = (await (await db()).getAll('estados')) as EstadoReporte[];
  return new Map(xs.map((e) => [e.id, e]));
}
/** Guarda los que son más recientes que lo que ya hay. Devuelve cuántos cambiaron. */
export async function fusionarEstados(xs: EstadoReporte[]): Promise<number> {
  const d = await db();
  const tx = d.transaction('estados', 'readwrite');
  let cambios = 0;
  for (const e of xs) {
    const prev = (await tx.store.get(e.id)) as EstadoReporte | undefined;
    const gana = masReciente(prev, e);
    if (gana !== prev && (!prev || prev.estado !== gana.estado || prev.accion !== gana.accion || prev.at !== gana.at)) {
      await tx.store.put({ ...prev, ...gana, motivo: gana.motivo ?? (prev?.estado === gana.estado ? prev?.motivo : undefined) });
      cambios++;
    }
  }
  await tx.done;
  return cambios;
}
