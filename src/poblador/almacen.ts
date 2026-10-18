// Base propia del modo poblador (no toca la de src/db.ts): fotos de los reportes y estado de vuelta.
import { openDB, type IDBPDatabase } from 'idb';
import { masReciente, type EstadoReporte } from './estados';

export interface FotoGuardada { id: string; blob: Blob; bytes: number; w: number; h: number; subida: boolean; subidaAt?: number }

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB('yaku-poblador', 1, {
    upgrade(d) {
      d.createObjectStore('fotos', { keyPath: 'id' });
      d.createObjectStore('estados', { keyPath: 'id' });
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
