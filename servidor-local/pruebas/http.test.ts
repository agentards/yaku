// Servidor HTTP real en un puerto libre: el adaptador node:http ↔ Request y el flujo sync → incidente → estado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, it } from 'node:test';
import { makeObservation } from '../../src/codec.ts';
import { iniciar } from '../servidor.ts';

const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-http-'));
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-dist-'));
fs.writeFileSync(path.join(dist, 'index.html'), '<h1>yaku</h1>');
let s: ReturnType<typeof iniciar>, base = '';
before(async () => { s = iniciar({ puerto: 0, host: '127.0.0.1', datos, dist, pin: '2468', silencioso: true }); base = `http://127.0.0.1:${await s.listo}`; });
after(async () => { await s.cerrar(); fs.rmSync(datos, { recursive: true, force: true }); fs.rmSync(dist, { recursive: true, force: true }); });

it('sync con text/plain (como src/sync.ts) → incidente → validar con PIN → acuse', async () => {
  const now = Math.floor(Date.now() / 1000);
  const recs = ['pobladora', 'pobladorb'].map((d, k) => makeObservation({ type: 'atrapados', severity: 3, lat: -5.19449 + k * 0.0002, lon: -80.63282, note: '', ts: now - 60, deviceId: d }));
  const r = await fetch(base + '/api/sync', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ records: recs }) });
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as any).inserted, 2);
  assert.equal((await fetch(base + '/api/incidentes')).status, 401);
  const { incidentes } = (await (await fetch(base + '/api/incidentes', { headers: { 'x-muni-pin': '2468' } })).json()) as any;
  assert.equal(incidentes.length, 1);
  assert.equal(incidentes[0].personas, 2);
  const e = await fetch(`${base}/api/incidentes/${incidentes[0].id}/estado`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-muni-pin': '2468' }, body: JSON.stringify({ estado: 'en_revision', quien: 'Operador' }) });
  assert.equal(e.status, 200);
  const { estados } = (await (await fetch(`${base}/api/estado?ids=${recs[0].id}`)).json()) as any;
  assert.equal(estados[0].estado, 'en_revision');
  assert.equal((await fetch(base + '/ruta/de/la/app')).status, 200);
  assert.equal((await fetch(base + '/api/nada')).status, 404);
});

it('foto binaria (image/jpeg) por POST /api/fotos?reporte=', async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const r = await fetch(base + '/api/fotos?reporte=0000000000a', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: jpeg });
  assert.equal(r.status, 200);
  const { id } = (await r.json()) as any;
  assert.deepEqual(new Uint8Array(await (await fetch(`${base}/api/fotos/${id}`, { headers: { 'x-muni-pin': '2468' } })).arrayBuffer()), jpeg);
});
