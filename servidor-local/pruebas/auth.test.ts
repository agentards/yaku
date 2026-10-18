// Login del Centro de monitoreo: JWT de Clerk (RS256) con llaves RSA de prueba generadas aquí, y PIN con/sin Clerk.
// Nada sale a la red: el JWKS lo sirve un fetch simulado. Carpetas temporales fuera del repo; se borran al final.
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { makeObservation } from '../../src/codec.ts';
import { Almacen } from '../almacen.ts';
import { crearApi } from '../api.ts';
import { crearVerificadorClerk, frontendApiDe, type ConfigClerk } from '../auth.ts';
import { REGLAS } from '../reglas.ts';

const HOST = 'feliz-yaku-12.clerk.accounts.dev';
const PK = 'pk_test_' + Buffer.from(HOST + '$').toString('base64');
const ISS = `https://${HOST}`;
const AZP = 'http://localhost:5173';
const KID = 'ins_prueba_1';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otra = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWKS = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' }] };
const PEM = publicKey.export({ format: 'pem', type: 'spki' }).toString();

const reloj = { t: Date.UTC(2026, 9, 17, 22, 0, 0) };
const ahora = () => reloj.t;
const seg = () => Math.floor(reloj.t / 1000);

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
function jwt(claims: Record<string, unknown>, o: { clave?: KeyObject; kid?: string; alg?: string } = {}) {
  const cab = b64u(JSON.stringify({ alg: o.alg ?? 'RS256', typ: 'JWT', kid: o.kid ?? KID }));
  const cuerpo = b64u(JSON.stringify({ iss: ISS, azp: AZP, sub: 'user_2abc', sid: 'sess_1', iat: seg() - 10, nbf: seg() - 10, exp: seg() + 60, ...claims }));
  const firma = createSign('RSA-SHA256').update(`${cab}.${cuerpo}`).sign(o.clave ?? privateKey);
  return `${cab}.${cuerpo}.${b64u(firma)}`;
}

const dirs: string[] = [];
const almacenes: Almacen[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-auth-')); dirs.push(d); return d; };
after(() => { for (const a of almacenes) a.cerrar(); for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

/** fetch simulado del Frontend API: cuenta las descargas; `red=false` simula modo avión. */
function frontendApi() {
  const f = { n: 0, red: true, fetch: (async (url: string | URL | Request) => {
    f.n++;
    if (!f.red) throw new TypeError('fetch failed (sin red)');
    assert.equal(String(url), `${ISS}/.well-known/jwks.json`);
    return new Response(JSON.stringify(JWKS), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch };
  return f;
}

/** API con 1 incidente cerca de Piura, Clerk opcional. */
async function montar(clerk?: ConfigClerk, permitirPin = false) {
  const dir = tmp();
  const A = new Almacen(path.join(dir, 'yaku.db'), REGLAS);
  almacenes.push(A);
  const ver = clerk ? crearVerificadorClerk({ ahora, datos: dir, ...clerk }) : undefined;
  const api = crearApi({ almacen: A, pin: '4321', fotosDir: path.join(dir, 'fotos'), ahora, clerk: ver, permitirPin });
  const o = makeObservation({ type: 'atrapados', severity: 3, lat: -5.19449, lon: -80.63282, note: '', ts: seg() - 60, deviceId: 'pobladora' });
  await api(new Request('http://x/api/sync', { method: 'POST', body: JSON.stringify({ records: [o] }) }));
  const pedir = async (ruta: string, h: Record<string, string> = {}, body?: unknown) => {
    const r = await api(new Request('http://x' + ruta, body === undefined ? { headers: h } : { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) }));
    return { status: r.status, j: (r.headers.get('content-type') ?? '').includes('json') ? (await r.json()) as any : null };
  };
  const id = 'inc-' + o.id;
  const estado = (h: Record<string, string>, quien = 'Ana Torres (COE)') => pedir(`/api/incidentes/${id}/estado`, h, { estado: 'en_revision', quien });
  return { A, api, pedir, estado, id, dir };
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe('publishable key → Frontend API', () => {
  it('pk_test_/pk_live_ + base64 del host terminado en «$»', () => {
    assert.equal(frontendApiDe(PK), HOST);
    assert.equal(frontendApiDe('pk_live_' + Buffer.from('clerk.yaku.pe$').toString('base64')), 'clerk.yaku.pe');
    assert.equal(frontendApiDe('pk_test_' + Buffer.from('sin-dolar.dev').toString('base64')), null);
    assert.equal(frontendApiDe('sk_test_abc'), null);
    assert.equal(frontendApiDe(undefined), null);
  });
});

describe('JWT de sesión de Clerk (JWKS)', () => {
  it('válido: lee incidentes y escribe; el historial guarda nombre + sub', async () => {
    const fa = frontendApi();
    const m = await montar({ publishableKey: PK, fetch: fa.fetch });
    const l = await m.pedir('/api/incidentes', bearer(jwt({})));
    assert.equal(l.status, 200);
    assert.equal(l.j.incidentes.length, 1);
    const e = await m.estado(bearer(jwt({ rol: 'operador' })));
    assert.equal(e.status, 200);
    assert.deepEqual(e.j.incidente.historial.map((h: any) => [h.quien, h.usuario]), [['Ana Torres (COE)', 'user_2abc']]);
    assert.equal(fa.n, 1, 'el JWKS se baja una vez y queda en memoria');
  });
  it('vencido → 403 «vencido» (con ±5 s de holgura de reloj)', async () => {
    const m = await montar({ publishableKey: PK, fetch: frontendApi().fetch });
    const r = await m.pedir('/api/incidentes', bearer(jwt({ exp: seg() - 10 })));
    assert.equal(r.status, 403); assert.equal(r.j.codigo, 'vencido'); assert.match(r.j.error, /venció/);
    assert.equal((await m.pedir('/api/incidentes', bearer(jwt({ exp: seg() - 3 })))).status, 200);
    assert.equal((await m.pedir('/api/incidentes', bearer(jwt({ nbf: seg() + 30 })))).j.codigo, 'nbf');
    assert.equal((await m.pedir('/api/incidentes', bearer(jwt({ nbf: seg() + 3 })))).status, 200);
  });
  it('firma mala → 403 (otra llave con el mismo kid, token alterado, alg ≠ RS256)', async () => {
    const m = await montar({ publishableKey: PK, fetch: frontendApi().fetch });
    const r = await m.pedir('/api/incidentes', bearer(jwt({}, { clave: otra.privateKey })));
    assert.equal(r.status, 403); assert.equal(r.j.codigo, 'firma');
    const [h, , s] = jwt({}).split('.');
    const alterado = `${h}.${b64u(JSON.stringify({ iss: ISS, azp: AZP, sub: 'user_intruso', exp: seg() + 60 }))}.${s}`;
    assert.equal((await m.pedir('/api/incidentes', bearer(alterado))).j.codigo, 'firma');
    assert.equal((await m.pedir('/api/incidentes', bearer(jwt({}, { alg: 'HS256' })))).j.codigo, 'algoritmo');
    assert.equal((await m.pedir('/api/incidentes', bearer('no.es.jwt'))).status, 403);
  });
  it('azp ajeno → 403; por defecto solo orígenes localhost; CLERK_AUTHORIZED_PARTIES los reemplaza', async () => {
    const m = await montar({ publishableKey: PK, fetch: frontendApi().fetch });
    const r = await m.pedir('/api/incidentes', bearer(jwt({ azp: 'https://sitio-ajeno.com' })));
    assert.equal(r.status, 403); assert.equal(r.j.codigo, 'azp'); assert.match(r.j.error, /sitio-ajeno\.com/);
    assert.equal((await m.pedir('/api/incidentes', bearer(jwt({ azp: 'http://127.0.0.1:4173' })))).status, 200);
    assert.equal((await m.pedir('/api/incidentes', bearer(jwt({ azp: undefined })))).j.codigo, 'azp');
    const p = await montar({ publishableKey: PK, fetch: frontendApi().fetch, partes: ['https://yaku.midominio.pe'] });
    assert.equal((await p.pedir('/api/incidentes', bearer(jwt({ azp: 'https://yaku.midominio.pe' })))).status, 200);
    assert.equal((await p.pedir('/api/incidentes', bearer(jwt({})))).j.codigo, 'azp'); // localhost ya no vale
  });
  it('iss de otra instancia → 403', async () => {
    const m = await montar({ publishableKey: PK, fetch: frontendApi().fetch });
    assert.equal((await m.pedir('/api/incidentes', bearer(jwt({ iss: 'https://otra.clerk.accounts.dev' })))).j.codigo, 'emisor');
  });
  it('rol «monitor» mira pero no escribe (403); rol desconocido tampoco escribe', async () => {
    const m = await montar({ publishableKey: PK, fetch: frontendApi().fetch });
    const t = jwt({ rol: 'monitor' });
    assert.equal((await m.pedir('/api/incidentes', bearer(t))).status, 200);
    const e = await m.estado(bearer(t));
    assert.equal(e.status, 403); assert.equal(e.j.codigo, 'rol'); assert.match(e.j.error, /monitor/);
    assert.equal((await m.estado(bearer(jwt({ rol: 'admin' })))).status, 403);
    assert.equal((await m.pedir(`/api/incidentes/${m.id}/unir`, bearer(t), { con: m.id, quien: 'x' })).status, 403);
    assert.equal((await m.estado(bearer(jwt({ rol: '' })))).status, 200); // claim vacío = sin rol = opera
  });
  it('sin credencial → 401 con mensaje claro; fotos también protegidas', async () => {
    const m = await montar({ publishableKey: PK, fetch: frontendApi().fetch });
    const r = await m.pedir('/api/incidentes');
    assert.equal(r.status, 401); assert.match(r.j.error, /inicia sesión/);
    assert.equal((await m.pedir('/api/fotos/0123456789abcdef0123')).status, 401);
    assert.equal((await m.pedir('/api/fotos/0123456789abcdef0123', bearer(jwt({})))).status, 404);
    assert.equal((await m.pedir('/api/estado?ids=0000000000a')).status, 200, 'el acuse del poblador sigue público');
    assert.equal((await m.pedir('/api/reports')).status, 200, '/api/reports sigue público');
  });
});

describe('sin red', () => {
  it('JWKS en caché de disco (YAKU_DATOS): un servidor nuevo sin red sigue validando', async () => {
    const fa = frontendApi();
    const m = await montar({ publishableKey: PK, fetch: fa.fetch });
    assert.equal((await m.pedir('/api/incidentes', bearer(jwt({})))).status, 200);
    assert.ok(fs.existsSync(path.join(m.dir, 'clerk-jwks.json')));
    const sinRed = frontendApi(); sinRed.red = false;
    const v = crearVerificadorClerk({ publishableKey: PK, fetch: sinRed.fetch, datos: m.dir, ahora });
    const r = await v.verificar(jwt({}));
    assert.equal(r.ok, true);
    assert.equal(sinRed.n, 0, 'no intentó la red: la clave salió del disco');
  });
  it('sin red y sin caché → 403 que sugiere CLERK_JWT_KEY', async () => {
    const sinRed = frontendApi(); sinRed.red = false;
    const m = await montar({ publishableKey: PK, fetch: sinRed.fetch });
    const r = await m.pedir('/api/incidentes', bearer(jwt({})));
    assert.equal(r.status, 403); assert.equal(r.j.codigo, 'sin_clave'); assert.match(r.j.error, /CLERK_JWT_KEY/);
  });
  it('CLERK_JWT_KEY (PEM, con \\n literales como en .env) verifica sin red', async () => {
    const nunca = (async () => { throw new Error('no debe llamar a la red'); }) as typeof fetch;
    const v = crearVerificadorClerk({ jwtKey: PEM.replace(/\n/g, '\\n'), emisor: ISS, fetch: nunca, ahora });
    assert.equal(v.modo, 'pem');
    assert.equal((await v.verificar(jwt({}))).ok, true);
    const mala = await v.verificar(jwt({}, { clave: otra.privateKey }));
    assert.equal(mala.ok, false);
  });
  it('kid desconocido: vuelve a bajar el JWKS como mucho 1 vez cada 30 s', async () => {
    const fa = frontendApi();
    const v = crearVerificadorClerk({ publishableKey: PK, fetch: fa.fetch, ahora });
    assert.equal((await v.verificar(jwt({}))).ok, true);
    assert.equal((await v.verificar(jwt({}, { kid: 'rotada' }))).ok, false);
    assert.equal((await v.verificar(jwt({}, { kid: 'rotada' }))).ok, false);
    assert.equal(fa.n, 1);
    reloj.t += 31_000;
    await v.verificar(jwt({}, { kid: 'rotada' }));
    assert.equal(fa.n, 2);
  });
});

describe('PIN municipal', () => {
  it('sin Clerk: el PIN funciona como hoy (401 sin PIN, 403 malo, 200 bueno; usuario «pin»)', async () => {
    const m = await montar();
    assert.equal((await m.pedir('/api/incidentes')).status, 401);
    assert.equal((await m.pedir('/api/incidentes', { 'x-muni-pin': '0000' })).status, 403);
    assert.equal((await m.pedir('/api/incidentes', bearer(jwt({})))).status, 401, 'Bearer sin Clerk configurado no vale');
    const e = await m.estado({ 'x-muni-pin': '4321' }, 'Operador PIN');
    assert.equal(e.status, 200);
    assert.deepEqual(e.j.incidente.historial.map((h: any) => [h.quien, h.usuario]), [['Operador PIN', 'pin']]);
  });
  it('con Clerk activo: PIN rechazado (403) salvo YAKU_PERMITIR_PIN=1', async () => {
    const m = await montar({ publishableKey: PK, fetch: frontendApi().fetch });
    const r = await m.pedir('/api/incidentes', { 'x-muni-pin': '4321' });
    assert.equal(r.status, 403); assert.equal(r.j.codigo, 'pin_desactivado'); assert.match(r.j.error, /YAKU_PERMITIR_PIN/);
    const p = await montar({ publishableKey: PK, fetch: frontendApi().fetch }, true);
    assert.equal((await p.pedir('/api/incidentes', { 'x-muni-pin': '4321' })).status, 200);
    assert.equal((await p.pedir('/api/incidentes', { 'x-muni-pin': '9999' })).status, 403);
    assert.equal((await p.estado({ 'x-muni-pin': '4321' })).status, 200);
    assert.equal((await p.pedir('/api/incidentes', bearer(jwt({})))).status, 200, 'Clerk sigue valiendo');
  });
});

describe('GET /api/reports?desde=&limit= (histórico)', () => {
  it('ascendente desde «desde» (ms de received_at), límite ≤ 5000; sin «desde» el contrato de siempre', async () => {
    const m = await montar();
    const t0 = reloj.t;
    for (let k = 0; k < 3; k++) {
      reloj.t = t0 + (k + 1) * 1000;
      const o = makeObservation({ type: 'agua', severity: 1, lat: -5.1 - k * 0.01, lon: -80.6, note: '', ts: seg(), deviceId: 'h' + k });
      await m.api(new Request('http://x/api/sync', { method: 'POST', body: JSON.stringify({ records: [o] }) }));
    }
    const h = (await m.pedir(`/api/reports?desde=${t0 + 1500}`)).j;
    assert.equal(h.count, 2);
    assert.deepEqual(h.reports.map((r: any) => r.received_at), [t0 + 2000, t0 + 3000]);
    assert.equal(h.hasta, t0 + 3000); assert.equal(h.truncado, false);
    const uno = (await m.pedir('/api/reports?desde=0&limit=1')).j;
    assert.equal(uno.count, 1); assert.equal(uno.truncado, true);
    assert.equal((await m.pedir('/api/reports?desde=0&limit=999999')).j.count, 4); // tope 5000, no error
    assert.equal((await m.pedir('/api/reports?desde=ayer')).status, 400);
    const viejo = (await m.pedir('/api/reports?limit=2')).j;
    assert.equal(viejo.count, 2); assert.equal(viejo.reports[0].received_at, t0 + 3000); // DESC como el Worker
    reloj.t = t0;
  });
});
