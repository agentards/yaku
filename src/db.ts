import { openDB, type IDBPDatabase } from 'idb';
import type { Observation } from './codec';

export type Source = 'local' | 'qr' | 'enlace' | 'imagen';
export interface StoredObs extends Observation {
  source: Source;
  receivedAt: number;
  synced: boolean;
  syncedAt?: number;
}

let dbp: Promise<IDBPDatabase> | null = null;
export function db() {
  dbp ??= openDB('yaku-relay-proto', 1, {
    upgrade(d) {
      const s = d.createObjectStore('obs', { keyPath: 'id' });
      s.createIndex('synced', 'synced');
    },
  });
  return dbp;
}

/** Inserta solo si el id no existe (dedup). Devuelve cuántos eran nuevos. */
export async function putIfAbsent(records: Observation[], source: Source): Promise<{ added: number; dupes: number }> {
  const d = await db();
  const tx = d.transaction('obs', 'readwrite');
  let added = 0, dupes = 0;
  for (const r of records) {
    if (await tx.store.getKey(r.id)) { dupes++; continue; }
    await tx.store.add({ ...r, verified: false, source, receivedAt: Date.now(), synced: false } satisfies StoredObs);
    added++;
  }
  await tx.done;
  return { added, dupes };
}

export async function all(): Promise<StoredObs[]> {
  const xs = (await (await db()).getAll('obs')) as StoredObs[];
  return xs.sort((a, b) => b.ts - a.ts);
}

export async function markSynced(ids: string[]) {
  const d = await db();
  const tx = d.transaction('obs', 'readwrite');
  for (const id of ids) {
    const r = (await tx.store.get(id)) as StoredObs | undefined;
    if (r && !r.synced) await tx.store.put({ ...r, synced: true, syncedAt: Date.now() });
  }
  await tx.done;
}

export async function clearAll() {
  await (await db()).clear('obs');
}
