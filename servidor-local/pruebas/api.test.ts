// API local contra SQLite real en una carpeta temporal (fuera del repo; se borra al final).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { makeObservation, OBS_TYPES, type NewObservation } from '../../src/codec.ts';
import { Almacen } from '../almacen.ts';
import { crearApi } from '../api.ts';
import { REGLAS } from '../reglas.ts';

const T0 = 1792252800;
const LAT = -5.19449, LON = -80.63282;
const norte = (m: number) => LAT + m / 111195;
const obs = (o: Partial<NewObservation>) => makeObservation({ type: 'agua', severity: 2, lat: LAT, lon: LON, note: '', ts: T0, deviceId: 'dev1', ...o } as NewObservation);
// JPEG mínimo válido por su cabecera (el servidor solo mira los bytes mágicos).
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

let dir: string, A: Almacen, api: (r: Request) => Promise<Response>, reloj = (T0 + 120) * 1000;
const dirs: string[] = [];
const nuevaApi = () => {
  A?.cerrar();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-api-'));
  dirs.push(dir);
  A = new Almacen(path.join(dir, 'yaku.db'), REGLAS);
  api = crearApi({ almacen: A, pin: '4321', fotosDir: path.join(dir, 'fotos'), ahora: () => reloj });
};
const pedir = async (ruta: string, body?: unknown, h: Record<string, string> = {}) => {
  const r = await api(new Request('http://x' + ruta, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'text/plain', ...h }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { status: r.status, j: (r.headers.get('content-type') ?? '').includes('json') ? await r.json() as any : null, r };
};
const sync = (records: unknown[]) => pedir('/api/sync', { records }).then((x) => x.j);
const incidentes = () => pedir('/api/incidentes').then((x) => x.j.incidentes as any[]);
const estado = (id: string, body: unknown, pin = '4321') => pedir(`/api/incidentes/${id}/estado`, body, pin ? { 'x-muni-pin': pin } : {});

before(nuevaApi);
after(() => { A.cerrar(); for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

describe('/api/sync (mismo contrato que server/worker.ts)', () => {
  it('idempotente: el mismo lote 2 veces deja solo ids únicos', async () => {
    nuevaApi();
    const recs = [0, 1, 2, 3, 4].map((k) => obs({ deviceId: 'd' + k, lat: norte(k * 1000) }));
    assert.deepEqual(await sync(recs), { accepted: recs.map((r) => r.id), inserted: 5, duplicates: 0, rejected: [], persisted: true });
    const b = await sync([...recs, ...recs]);
    assert.equal(b.inserted, 0); assert.equal(b.duplicates, 10);
    const g = (await pedir(`/api/reports?ids=${recs.map((r) => r.id).join(',')}`)).j;
    assert.equal(g.count, 5);
    assert.equal((await pedir('/api/stats')).j.total, 5);
    assert.equal((await incidentes()).length, 5);
  });
  it('rechaza registros manipulados e inválidos con los mismos motivos', async () => {
    const r = obs({ note: 'x' });
    const res = await sync([{ ...r, note: 'otra cosa' }, { ...r, severity: 7 }, { foo: 1 }]);
    assert.equal(res.inserted, 0);
    assert.deepEqual(res.rejected.map((x: any) => x.why), ['id no coincide con contenido', 'severidad', 'tipo']);
  });
  it('acepta los tipos nuevos, que van al final de OBS_TYPES', async () => {
    assert.deepEqual(OBS_TYPES.slice(0, 5), ['agua', 'huaico', 'cauce', 'via_bloq', 'otro']);
    const recs = ['vivienda', 'atrapados', 'heridos', 'ayuda'].map((type, k) => obs({ type: type as any, lat: norte(5000 + k * 1000) }));
    assert.equal((await sync(recs)).inserted, 4);
  });
  it('413 si el cuerpo pasa de 128 KB; 400 si no es JSON', async () => {
    assert.equal((await pedir('/api/sync', 'x'.repeat(130 * 1024))).status, 413);
    assert.equal((await pedir('/api/sync', '{no')).status, 400);
  });
});

describe('/api/incidentes: la historia de la demo', () => {
  const a = obs({ type: 'vivienda', deviceId: 'pobladora', severity: 2 });
  const b = obs({ type: 'vivienda', deviceId: 'pobladorb', severity: 3, lat: norte(40), ts: T0 + 60 });
  let id = '';
  it('A y B reportan cerca (B trae lo de A por QR) → 1 incidente, 2 personas, sin duplicados', async () => {
    nuevaApi();
    await sync([a]);
    await sync([b, a]); // B sincroniza su reporte y el de A que recibió por QR
    const l = await incidentes();
    assert.equal(l.length, 1);
    assert.equal(l[0].personas, 2); assert.equal(l[0].reportes, 2);
    assert.equal(l[0].severidad, 3); assert.equal(l[0].tipo, 'vivienda');
    assert.equal(l[0].puntaje, 60); // (40 personas + 0 fotos + 20 cercanía) × 1
    id = l[0].id;
  });
  it('la foto de B sube y suma al respaldo (75 = caso B de decision-confianza.md)', async () => {
    const f = await pedir('/api/fotos', { reportId: b.id, data: 'data:image/jpeg;base64,' + JPEG.toString('base64') });
    assert.equal(f.status, 200); assert.equal(f.j.duplicate, false);
    assert.equal((await pedir('/api/fotos', { reportId: b.id, data: JPEG.toString('base64') })).j.duplicate, true);
    const [inc] = await incidentes();
    assert.deepEqual(inc.fotos, [f.j.id]); assert.equal(inc.puntaje, 75); assert.equal(inc.nivel, 'N2');
    const img = await pedir(`/api/fotos/${f.j.id}`);
    assert.equal(img.r.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await img.r.arrayBuffer()), JPEG);
  });
  it('fotos: rechaza lo que no es imagen y lo que pasa de 400 KB', async () => {
    assert.equal((await pedir('/api/fotos', { reportId: b.id, data: Buffer.from('hola mundo').toString('base64') })).status, 415);
    const grande = Buffer.concat([JPEG, Buffer.alloc(401 * 1024)]);
    assert.equal((await pedir('/api/fotos', { reportId: b.id, data: grande.toString('base64') })).status, 413);
    assert.equal((await pedir('/api/fotos/0123456789abcdef0123')).status, 404);
  });
  it('estados con MUNI_PIN: 401 sin PIN, 403 PIN malo, 409 salto no permitido, 400 sin motivo', async () => {
    assert.equal((await estado(id, { estado: 'en_revision', quien: 'Op' }, '')).status, 401);
    assert.equal((await estado(id, { estado: 'en_revision', quien: 'Op' }, '0000')).status, 403);
    assert.equal((await estado(id, { estado: 'atendido', quien: 'Op' })).status, 409);
    assert.equal((await estado(id, { estado: 'en_revision' })).status, 400);
  });
  it('validar y asignar «Bomberos» persiste con quién y cuándo; el respaldo se congela', async () => {
    reloj += 60000;
    assert.equal((await estado(id, { estado: 'en_revision', quien: 'Operador COE' })).status, 200);
    assert.equal((await estado(id, { estado: 'validado', quien: 'Operador COE' })).status, 200);
    assert.equal((await estado(id, { estado: 'accion_asignada', quien: 'Operador COE' })).status, 400);
    const r = await estado(id, { estado: 'accion_asignada', accion: 'bomberos', quien: 'Operador COE' });
    assert.equal(r.status, 200);
    reloj += 6 * 3.6e6; // 6 h después el respaldo vivo habría decaído; el congelado no
    const [inc] = await incidentes();
    assert.equal(inc.estado, 'accion_asignada'); assert.equal(inc.accion, 'bomberos');
    assert.equal(inc.puntaje, 75); assert.equal(inc.respaldo_congelado, true);
    assert.deepEqual(inc.historial.map((h: any) => h.estado), ['en_revision', 'validado', 'accion_asignada']);
    assert.ok(inc.historial.every((h: any) => h.quien === 'Operador COE' && h.cuando > 0));
  });
  it('/api/estado?ids= devuelve el acuse para el celular de B (y del desconocido, recibido:false)', async () => {
    const { estados } = (await pedir(`/api/estado?ids=${b.id},${a.id},zzzzzzzzzzz`)).j;
    assert.equal(estados[0].estado, 'accion_asignada'); assert.equal(estados[0].accion, 'bomberos');
    assert.equal(estados[1].incidente, id);
    assert.deepEqual(estados[2], { id: 'zzzzzzzzzzz', recibido: false });
  });
  it('atendido → un reporte nuevo en el mismo lugar abre otro incidente enlazado (recurrencia)', async () => {
    assert.equal((await estado(id, { estado: 'atendido', quien: 'Operador COE' })).status, 200);
    reloj = (T0 + 1800) * 1000;
    await sync([obs({ type: 'vivienda', deviceId: 'pobladorc', lat: norte(20), ts: T0 + 1700 })]);
    const l = await incidentes();
    assert.equal(l.length, 2);
    assert.equal(l[0].recurrencia_de, id); // abierto: va primero
    assert.equal(l[1].estado, 'atendido');
  });
});

describe('prioridad, unir y separar', () => {
  it('atrapados primero aunque tenga menos respaldo; luego heridos', async () => {
    nuevaApi();
    await sync([
      obs({ type: 'agua', deviceId: 'x1', lat: norte(3000) }), obs({ type: 'agua', deviceId: 'x2', lat: norte(3010) }), obs({ type: 'agua', deviceId: 'x3', lat: norte(3020) }),
      obs({ type: 'heridos', deviceId: 'y1', lat: norte(6000) }), obs({ type: 'atrapados', deviceId: 'z1', lat: norte(9000), severity: 1 }),
    ]);
    assert.deepEqual((await incidentes()).map((i) => i.tipo), ['atrapados', 'heridos', 'agua']);
  });
  it('unir dos incidentes y volver a separarlos (con PIN); los reportes crudos no se borran', async () => {
    const [atr, her] = await incidentes();
    const u = await pedir(`/api/incidentes/${her.id}/unir`, { con: atr.id, quien: 'Op' }, { 'x-muni-pin': '4321' });
    assert.equal(u.status, 200); assert.equal(u.j.incidente.reportes, 2);
    assert.equal((await incidentes()).length, 2);
    const s = await pedir(`/api/incidentes/${her.id}/separar`, { reportes: [atr.reportes_ids[0]], quien: 'Op' }, { 'x-muni-pin': '4321' });
    assert.equal(s.status, 200);
    assert.equal((await incidentes()).length, 3);
    assert.equal((await pedir('/api/stats')).j.total, 5);
    assert.equal((await pedir(`/api/incidentes/${her.id}/unir`, { con: atr.id, quien: 'Op' })).status, 401);
  });
  it('al reiniciar con la misma base, los incidentes y estados siguen ahí', async () => {
    const antes = await incidentes();
    A.cerrar();
    A = new Almacen(path.join(dir, 'yaku.db'), REGLAS);
    api = crearApi({ almacen: A, pin: '4321', fotosDir: path.join(dir, 'fotos'), ahora: () => reloj });
    assert.deepEqual((await incidentes()).map((i) => i.id), antes.map((i) => i.id));
  });
});
