import { all, markSynced, type StoredObs } from './db';

export const MOCK_ENDPOINT = 'mock:local';
export const DEFAULT_ENDPOINT = '/api/sync'; // Worker + D1 en el mismo origen

/**
 * Mock de servidor en el propio navegador (localStorage), idempotente por id.
 * Sirve para demo sin backend. Un endpoint real recibe POST text/plain JSON
 * {records:[...]} y debe responder {accepted:[ids]} (ids ya vistos también se aceptan).
 */
function mockServer(records: StoredObs[]): { accepted: string[]; newCount: number } {
  const key = 'yaku-mock-server';
  const seen: Record<string, number> = JSON.parse(localStorage.getItem(key) || '{}');
  let newCount = 0;
  for (const r of records) if (!seen[r.id]) { seen[r.id] = Date.now(); newCount++; }
  localStorage.setItem(key, JSON.stringify(seen));
  return { accepted: records.map((r) => r.id), newCount };
}

let inflight: Promise<SyncResult> | null = null;
export interface SyncResult { attempted: number; accepted: number; inserted?: number; duplicates?: number; error?: string }

export function flushQueue(endpoint: string): Promise<SyncResult> {
  // Evita envíos concurrentes (online + click al mismo tiempo).
  inflight ??= doFlush(endpoint).finally(() => { inflight = null; });
  return inflight;
}

async function doFlush(endpoint: string): Promise<SyncResult> {
  if (!navigator.onLine) return { attempted: 0, accepted: 0, error: 'sin conexión' };
  const pending = (await all()).filter((r) => !r.synced);
  if (!pending.length) return { attempted: 0, accepted: 0 };
  try {
    let accepted: string[];
    let inserted: number | undefined, duplicates: number | undefined;
    if (endpoint === MOCK_ENDPOINT) {
      await new Promise((r) => setTimeout(r, 150));
      accepted = mockServer(pending).accepted;
    } else {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' }, // evita preflight CORS
        body: JSON.stringify({ records: pending.map(({ source, receivedAt, synced, ...r }) => r) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      accepted = j.accepted ?? [];
      inserted = j.inserted; duplicates = j.duplicates;
    }
    const ok = accepted.filter((id) => pending.some((p) => p.id === id));
    await markSynced(ok);
    return { attempted: pending.length, accepted: ok.length, inserted, duplicates };
  } catch (e) {
    return { attempted: pending.length, accepted: 0, error: String((e as Error).message) };
  }
}

/** Estadísticas del servidor (GET /api/stats). null si no hay backend o no hay red. */
export async function serverStats(endpoint: string): Promise<{ total: number; unique_ids: number } | null> {
  if (endpoint === MOCK_ENDPOINT || !navigator.onLine) return null;
  try {
    const r = await fetch(endpoint.replace(/\/sync\/?$/, '/stats'), { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
