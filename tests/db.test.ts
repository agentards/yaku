import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { putIfAbsent, all, markSynced, clearAll } from '../src/db';
import { sample } from './fixtures';

describe('IndexedDB (fake-indexeddb)', () => {
  beforeEach(() => clearAll());
  it('putIfAbsent deduplica por id entre fuentes', async () => {
    const r = sample(10);
    expect(await putIfAbsent(r, 'local')).toEqual({ added: 10, dupes: 0 });
    expect(await putIfAbsent([...r.slice(0, 4), ...sample(3, 99)], 'qr')).toEqual({ added: 3, dupes: 4 });
    const xs = await all();
    expect(xs).toHaveLength(13);
    expect(xs.every((x) => x.verified === false && x.synced === false)).toBe(true);
  });
  it('markSynced es idempotente', async () => {
    const r = sample(3);
    await putIfAbsent(r, 'local');
    await markSynced([r[0].id]);
    const t1 = (await all()).find((x) => x.id === r[0].id)!.syncedAt;
    await markSynced([r[0].id, r[0].id, 'no-existe']);
    const xs = await all();
    expect(xs.filter((x) => x.synced)).toHaveLength(1);
    expect(xs.find((x) => x.id === r[0].id)!.syncedAt).toBe(t1);
  });
});
