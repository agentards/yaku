// Modo estricto de la API local (YAKU_MODO_ESTRICTO=1): bloqueo por intentos de PIN, histórico solo con PIN, límites de escritura pública,
// cuotas de fotos y sin CORS abierto. SQLite real en una carpeta temporal (se borra al final).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { makeObservation, type NewObservation } from '../../src/codec.ts';
import { Almacen } from '../almacen.ts';
import { CABECERA_IP, crearApi, type OpcionesApi } from '../api.ts';
import { REGLAS } from '../reglas.ts';

const T0 = 1792252800;
const obs = (o: Partial<NewObservation>) => makeObservation({ type: 'agua', severity: 2, lat: -5.19449, lon: -80.63282, note: '', ts: T0, deviceId: 'dev1', ...o } as NewObservation);
const JPEG = (n: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, n, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

let A: Almacen, api: (r: Request) => Promise<Response>, reloj = T0 * 1000;
const dirs: string[] = [];
const nuevaApi = (extra: Partial<OpcionesApi> = {}) => {
  A?.cerrar();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-seg-'));
  dirs.push(dir);
  A = new Almacen(path.join(dir, 'yaku.db'), REGLAS);
  api = crearApi({ almacen: A, pin: 'pin-largo-123', fotosDir: path.join(dir, 'fotos'), ahora: () => reloj, estricto: true, intentosPin: { max: 5, ventanaMs: 15 * 60_000, bloqueoMs: 15 * 60_000 }, ...extra });
};
const pedir = (ruta: string, { body, h = {}, ip = '203.0.113.7' }: { body?: unknown; h?: Record<string, string>; ip?: string } = {}) =>
  api(new Request('http://x' + ruta, body === undefined
    ? { headers: { [CABECERA_IP]: ip, ...h } }
    : { method: 'POST', headers: { 'content-type': 'text/plain', [CABECERA_IP]: ip, ...h }, body: JSON.stringify(body) }));

beforeEach(() => { reloj = T0 * 1000; nuevaApi(); });
after(() => { A.cerrar(); for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

describe('modo MVP (por defecto): solo el PIN', () => {
  it('sin bloqueo por intentos, histórico público, CORS abierto y sin cuotas de fotos', async () => {
    nuevaApi({ estricto: false, intentosPin: undefined });
    for (let i = 0; i < 30; i++) assert.equal((await pedir('/api/incidentes', { h: { 'x-muni-pin': 'malo' } })).status, 403);
    assert.equal((await pedir('/api/incidentes', { h: { 'x-muni-pin': 'pin-largo-123' } })).status, 200);
    assert.equal((await pedir('/api/reports?desde=0')).status, 200);
    assert.equal((await pedir('/api/stats')).headers.get('access-control-allow-origin'), '*');
    const o = obs({});
    for (let i = 1; i <= 5; i++) assert.equal((await pedir('/api/fotos', { body: { reportId: o.id, data: JPEG(10 + i).toString('base64') } })).status, 200);
    assert.equal((await pedir('/api/incidentes')).status, 401); // el PIN sigue siendo obligatorio
  });
});

describe('PIN municipal (estricto)', () => {
  it('5 intentos fallidos desde una IP la bloquean 15 min (429), sin afectar a otra IP', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await pedir('/api/incidentes', { h: { 'x-muni-pin': 'malo' + i } })).status, 403);
    const r = await pedir('/api/incidentes', { h: { 'x-muni-pin': 'pin-largo-123' } });
    assert.equal(r.status, 429); // ni el PIN correcto entra mientras dura el bloqueo
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.equal((await pedir('/api/incidentes', { h: { 'x-muni-pin': 'pin-largo-123' }, ip: '198.51.100.9' })).status, 200);
    reloj += 15 * 60_000 + 1;
    assert.equal((await pedir('/api/incidentes', { h: { 'x-muni-pin': 'pin-largo-123' } })).status, 200);
  });
  it('con max 0 no hay bloqueo (para eventos), pero el PIN malo sigue sin entrar', async () => {
    nuevaApi({ intentosPin: { max: 0, ventanaMs: 60_000, bloqueoMs: 60_000 } });
    for (let i = 0; i < 20; i++) assert.equal((await pedir('/api/incidentes', { h: { 'x-muni-pin': 'malo' } })).status, 403);
    assert.equal((await pedir('/api/incidentes', { h: { 'x-muni-pin': 'pin-largo-123' } })).status, 200);
  });
  it('modo estricto por defecto: tolera 9 fallos seguidos y bloquea 5 min al 10.º', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-seg-'));
    dirs.push(dir);
    const B = new Almacen(path.join(dir, 'yaku.db'), REGLAS);
    const api2 = crearApi({ almacen: B, pin: 'pin-largo-123', fotosDir: path.join(dir, 'fotos'), ahora: () => reloj, estricto: true });
    const p2 = (pin: string) => api2(new Request('http://x/api/incidentes', { headers: { [CABECERA_IP]: '203.0.113.50', 'x-muni-pin': pin } })).then((r) => r.status);
    for (let i = 0; i < 9; i++) assert.equal(await p2('malo'), 403);
    assert.equal(await p2('pin-largo-123'), 200); // el operador conectado (consulta cada 3 s) reinicia el contador
    for (let i = 0; i < 10; i++) await p2('malo');
    assert.equal(await p2('pin-largo-123'), 429);
    reloj += 5 * 60_000 + 1;
    assert.equal(await p2('pin-largo-123'), 200);
    B.cerrar();
  });
  it('un acierto reinicia el contador de fallos', async () => {
    for (let i = 0; i < 4; i++) await pedir('/api/incidentes', { h: { 'x-muni-pin': 'x' } });
    assert.equal((await pedir('/api/incidentes', { h: { 'x-muni-pin': 'pin-largo-123' } })).status, 200);
    for (let i = 0; i < 4; i++) assert.equal((await pedir('/api/incidentes', { h: { 'x-muni-pin': 'x' } })).status, 403);
  });
});

describe('datos de los vecinos', () => {
  it('el histórico y el listado de reportes piden PIN; ?ids= sigue público para el acuse', async () => {
    const o = obs({});
    await pedir('/api/sync', { body: { records: [o] } });
    assert.equal((await pedir('/api/reports')).status, 401);
    assert.equal((await pedir('/api/reports?desde=0')).status, 401);
    assert.equal((await pedir('/api/reports?desde=0', { h: { 'x-muni-pin': 'pin-largo-123' } })).status, 200);
    const porId = await pedir(`/api/reports?ids=${o.id}`);
    assert.equal(porId.status, 200);
    assert.equal(((await porId.json()) as any).count, 1);
  });
  it('sin CORS abierto ni en la API ni en el preflight', async () => {
    assert.equal((await pedir('/api/stats')).headers.get('access-control-allow-origin'), null);
    const pre = await api(new Request('http://x/api/incidentes', { method: 'OPTIONS' }));
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), null);
  });
  it('máximo 3 fotos por reporte (409) y cuota total de fotos (507)', async () => {
    const o = obs({});
    for (let i = 1; i <= 3; i++) assert.equal((await pedir('/api/fotos', { body: { reportId: o.id, data: JPEG(i).toString('base64') } })).status, 200);
    assert.equal((await pedir('/api/fotos', { body: { reportId: o.id, data: JPEG(1).toString('base64') } })).status, 200); // repetida: no cuenta
    assert.equal((await pedir('/api/fotos', { body: { reportId: o.id, data: JPEG(4).toString('base64') } })).status, 409);
    nuevaApi({ fotosMaxBytes: 30 });
    assert.equal((await pedir('/api/fotos', { body: { reportId: o.id, data: JPEG(5).toString('base64') } })).status, 200);
    assert.equal((await pedir('/api/fotos', { body: { reportId: obs({ note: 'otra' }).id, data: JPEG(6).toString('base64') } })).status, 507);
  });
  it('escrituras públicas limitadas por IP y minuto (429)', async () => {
    nuevaApi({ postsPorMinuto: 3 });
    for (let i = 0; i < 3; i++) assert.equal((await pedir('/api/sync', { body: { records: [] } })).status, 200);
    assert.equal((await pedir('/api/sync', { body: { records: [] } })).status, 429);
    assert.equal((await pedir('/api/sync', { body: { records: [] }, ip: '198.51.100.9' })).status, 200);
    reloj += 60_001;
    assert.equal((await pedir('/api/sync', { body: { records: [] } })).status, 200);
  });
});
