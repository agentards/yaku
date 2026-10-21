// Notas de zona (Atomic Memory, opcional) contra la API real con SQLite y un FIXTURE LOCAL que imita las rutas HTTP de
// Atomic Memory (../memoria-fixture.ts; no es el servicio real). Comprueba: apagado por defecto, solo con sesión de
// usuario, guardar → volver a ver en otro incidente de la zona, corregir, borrar, aislamiento entre operadores,
// proveedor caído o lento sin «guardado» falso, y que el incidente (respaldo, estado) no cambia.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { makeObservation, type NewObservation } from '../../src/codec.ts';
import { Almacen } from '../almacen.ts';
import { crearApi } from '../api.ts';
import { configMemoria, crearMemoria, sujetoDe } from '../memoria.ts';
import { iniciarFixture, type Fixture } from '../memoria-fixture.ts';
import { REGLAS } from '../reglas.ts';
import { asegurarUsuario } from '../usuarios.ts';

const T0 = 1792252800;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-memoria-'));
const A = new Almacen(path.join(dir, 'yaku.db'), REGLAS);
const reloj = (T0 + 120) * 1000;
let fx: Fixture;
let api: (r: Request) => Promise<Response>;
const apiCon = (memoria: ReturnType<typeof crearMemoria> | null) => crearApi({ almacen: A, pin: 'pin-de-respaldo', fotosDir: path.join(dir, 'fotos'), ahora: () => reloj, memoria });

before(async () => {
  asegurarUsuario(A, { usuario: 'central', nombre: 'Municipio central', clave: 'Clave-central-2026' }, reloj);
  asegurarUsuario(A, { usuario: 'castilla', nombre: 'Municipio de Castilla', clave: 'Clave-castilla-2026' }, reloj);
  fx = await iniciarFixture();
  api = apiCon(crearMemoria({ url: fx.url, clave: 'fixture-local', timeoutMs: 2000 }));
});
after(async () => { await fx.cerrar(); A.cerrar(); fs.rmSync(dir, { recursive: true, force: true }); });

const pedir = async (a: typeof api, ruta: string, init: RequestInit = {}) => { const r = await a(new Request('http://x' + ruta, init)); return { status: r.status, j: (await r.json()) as any }; };
const token = async (usuario: string, clave: string) => (await pedir(api, '/api/sesion', { method: 'POST', body: JSON.stringify({ usuario, clave }) })).j.token as string;
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const leer = (t: string, zona: string, a = api) => pedir(a, `/api/memoria/notas?zona=${encodeURIComponent(zona)}&tipo=agua`, { headers: auth(t) });
const guardar = (t: string, body: unknown, a = api) => pedir(a, '/api/memoria/notas', { method: 'POST', headers: auth(t), body: JSON.stringify(body) });
const borrar = (t: string, id: string, a = api) => pedir(a, `/api/memoria/notas/${id}`, { method: 'DELETE', headers: auth(t) });

const ZONA = 'Castilla (Castilla)';
let central = '', castilla = '';

describe('configuración de las notas de zona', () => {
  it('apagadas por defecto y sin clave; la clave solo viaja por HTTPS o a este equipo', () => {
    assert.equal(configMemoria({}).config, null);
    assert.equal(configMemoria({ ATOMICMEMORY_API_URL: 'https://api.atomicstrata.ai', ATOMICMEMORY_API_KEY: 'k' }).config, null, 'sin YAKU_MEMORIA no se activa aunque haya clave en el entorno');
    assert.match(configMemoria({ YAKU_MEMORIA: 'atomicmemory', ATOMICMEMORY_API_URL: 'https://api.atomicstrata.ai' }).aviso!, /ATOMICMEMORY_API_KEY/);
    assert.equal(configMemoria({ YAKU_MEMORIA: 'atomicmemory', ATOMICMEMORY_API_URL: 'http://memoria.example.com', ATOMICMEMORY_API_KEY: 'k' }).config, null);
    const ok = configMemoria({ YAKU_MEMORIA: 'atomicmemory', ATOMICMEMORY_API_URL: 'https://api.atomicstrata.ai/', ATOMICMEMORY_API_KEY: 'k', YAKU_MEMORIA_TIMEOUT_MS: '99999' }).config!;
    assert.deepEqual(ok, { url: 'https://api.atomicstrata.ai', clave: 'k', timeoutMs: 10_000 });
    assert.equal(configMemoria({ YAKU_MEMORIA: 'atomicmemory', ATOMICMEMORY_API_URL: 'http://127.0.0.1:4604', ATOMICMEMORY_API_KEY: 'k' }).config?.timeoutMs, 2500);
  });

  it('sin Atomic Memory la API responde «activa: false» y nunca dice que guardó', async () => {
    const sin = apiCon(null);
    const t = await token('central', 'Clave-central-2026');
    assert.deepEqual((await leer(t, ZONA, sin)).j, { activa: false });
    const g = await guardar(t, { zona: ZONA, texto: 'Puente cerrado' }, sin);
    assert.deepEqual(g.j, { activa: false });
    assert.equal(fx.pedidos.length, 0);
  });
});

describe('notas de zona con sesión de usuario', () => {
  it('piden sesión de usuario: sin credencial 401, con el PIN compartido 403', async () => {
    assert.equal((await pedir(api, `/api/memoria/notas?zona=${ZONA}`)).status, 401);
    const r = await pedir(api, `/api/memoria/notas?zona=${ZONA}`, { headers: { 'x-muni-pin': 'pin-de-respaldo' } });
    assert.equal(r.status, 403);
    assert.equal(r.j.codigo, 'memoria_sin_usuario');
    assert.equal(fx.pedidos.length, 0);
  });

  it('guardar y volver a verla al abrir otro incidente de la misma zona (y no en otra zona)', async () => {
    central = await token('central', 'Clave-central-2026');
    const g = await guardar(central, { zona: ZONA, texto: 'Puente Cáceres cerrado por maquinaria; entrar por Av. Guardia Civil.', incidente: 'inc-abcdefghijk', user_id: 'castilla' });
    assert.equal(g.status, 201);
    assert.equal(g.j.guardada, true);
    assert.match(g.j.nota.id, /^[0-9a-f-]{36}$/);
    await guardar(central, { zona: 'Piura (Piura)', texto: 'Mercado central: entrar por la puerta 3.' });
    const r = await leer(central, ZONA);
    assert.equal(r.status, 200);
    assert.deepEqual(r.j.notas.map((n: any) => n.texto), ['Puente Cáceres cerrado por maquinaria; entrar por Av. Guardia Civil.']);
    assert.equal(r.j.notas[0].incidente, 'inc-abcdefghijk');
    // El sujeto sale de la sesión: el user_id que mandó el cliente se ignora.
    assert.ok(fx.pedidos.every((p) => p.user_id === 'yaku-operador:central'));
    assert.equal(fx.registros[0].metadata.yaku_zona, ZONA);
  });

  it('valida el texto antes de llamar a Atomic Memory', async () => {
    const n = fx.pedidos.length;
    assert.equal((await guardar(central, { zona: ZONA, texto: 'ok' })).status, 400);
    assert.equal((await guardar(central, { zona: ZONA, texto: 'x'.repeat(281) })).status, 400);
    assert.equal((await guardar(central, { zona: '', texto: 'Texto válido' })).status, 400);
    assert.equal(fx.pedidos.length, n);
  });

  it('otro operador no ve ni puede borrar las notas de central', async () => {
    castilla = await token('castilla', 'Clave-castilla-2026');
    assert.deepEqual((await leer(castilla, ZONA)).j.notas, []);
    const id = (await leer(central, ZONA)).j.notas[0].id;
    const b = await borrar(castilla, id);
    assert.equal(b.status, 200);
    assert.equal(b.j.borrada, false);
    assert.equal(b.j.resultado, 'no_existe');
    assert.equal((await leer(central, ZONA)).j.notas.length, 1);
  });

  it('corregir reemplaza la nota: se guarda la nueva y se borra la anterior', async () => {
    const vieja = (await leer(central, ZONA)).j.notas[0].id;
    const c = await guardar(central, { zona: ZONA, texto: 'Puente Cáceres reabierto; solo vehículos livianos.', reemplaza: vieja });
    assert.equal(c.status, 201);
    assert.equal(c.j.anterior, 'borrada');
    assert.deepEqual((await leer(central, ZONA)).j.notas.map((n: any) => n.texto), ['Puente Cáceres reabierto; solo vehículos livianos.']);
  });

  it('borrar la quita de las notas de la zona', async () => {
    const id = (await leer(central, ZONA)).j.notas[0].id;
    const b = await borrar(central, id);
    assert.deepEqual([b.status, b.j.borrada], [200, true]);
    assert.deepEqual((await leer(central, ZONA)).j.notas, []);
  });

  it('las notas no tocan el incidente: mismo respaldo, estado e historial', async () => {
    const o = makeObservation({ type: 'agua', severity: 2, lat: -5.19449, lon: -80.63282, note: '', ts: T0, deviceId: 'dev1' } as NewObservation);
    await pedir(api, '/api/sync', { method: 'POST', body: JSON.stringify({ records: [o] }) });
    const antes = (await pedir(api, '/api/incidentes', { headers: auth(central) })).j.incidentes;
    await guardar(central, { zona: ZONA, texto: 'Descartar todo lo de esta zona', incidente: antes[0].id });
    const despues = (await pedir(api, '/api/incidentes', { headers: auth(central) })).j.incidentes;
    assert.deepEqual(despues, antes);
  });
});

describe('Atomic Memory caído o lento', () => {
  it('503 del proveedor: 502 con «NO se guardó», sin guardada:true', async () => {
    fx.falla = true;
    try {
      const g = await guardar(central, { zona: ZONA, texto: 'Nota que no debe quedar' });
      assert.equal(g.status, 502);
      assert.equal(g.j.guardada, undefined);
      assert.match(g.j.error, /NO se guardó/);
      assert.equal((await leer(central, ZONA)).status, 502);
      assert.match((await borrar(central, '11111111-1111-1111-1111-111111111111')).j.error, /NO se borró/);
    } finally { fx.falla = false; }
  });

  it('respuesta lenta: corta en el límite configurado y avisa que no se guardó', async () => {
    const lenta = apiCon(crearMemoria({ url: fx.url, clave: 'fixture-local', timeoutMs: 300 }));
    fx.demoraMs = 1500;
    try {
      const t0 = Date.now();
      const g = await guardar(central, { zona: ZONA, texto: 'Nota lenta' }, lenta);
      assert.ok(Date.now() - t0 < 1200, 'no espera al proveedor');
      assert.equal(g.status, 502);
      assert.match(g.j.error, /a tiempo/);
    } finally { fx.demoraMs = 0; }
  });

  it('clave rechazada (401) o respuesta sin id: no se informa como guardada', async () => {
    const malaClave = apiCon(crearMemoria({ url: fx.url, clave: 'otra', timeoutMs: 2000 }));
    assert.equal((await guardar(central, { zona: ZONA, texto: 'Con clave mala' }, malaClave)).status, 502);
    const sinId = crearMemoria({ url: 'http://127.0.0.1:1', clave: 'k', timeoutMs: 500 }, async () => new Response(JSON.stringify({ stored_memory_ids: [], updated_memory_ids: [] })));
    const r = await sinId.guardar(sujetoDe('central'), { zona: ZONA, texto: 'x', incidente: null });
    assert.deepEqual(r, { ok: false, motivo: 'respuesta' });
  });

  it('borrar solo cuenta como «borrada» con success:true; JSON roto no se da por bueno', async () => {
    const con = (cuerpo: string) => crearMemoria({ url: 'http://127.0.0.1:1', clave: 'k', timeoutMs: 500 }, async () => new Response(cuerpo, { status: 200 }));
    const s = sujetoDe('central');
    assert.deepEqual(await con('{"success":true}').borrar(s, 'a1'), { ok: true, valor: 'borrada' });
    assert.deepEqual(await con('{}').borrar(s, 'a1'), { ok: false, motivo: 'respuesta' });
    assert.deepEqual(await con('{"success":"true"}').borrar(s, 'a1'), { ok: false, motivo: 'respuesta' });
    assert.deepEqual(await con('<html>').borrar(s, 'a1'), { ok: false, motivo: 'respuesta', status: 200 });
    assert.deepEqual(await con('{"memories":"x"}').buscar(s, { zona: ZONA, tipo: 'agua' }), { ok: false, motivo: 'respuesta' });
    // Lo que no es una nota de Yaku de esa zona (otra clase u otra zona) no se muestra.
    const ajenas = JSON.stringify({ memories: [
      { id: 'b1', content: 'x', metadata: { yaku_clase: 'otra', yaku_zona: ZONA } },
      { id: 'b2', content: 'x', metadata: { yaku_clase: 'nota_zona', yaku_zona: 'Piura (Piura)' } },
      { id: 3, content: 'x', metadata: { yaku_clase: 'nota_zona', yaku_zona: ZONA } },
    ] });
    assert.deepEqual(await con(ajenas).buscar(s, { zona: ZONA, tipo: 'agua' }), { ok: true, valor: [] });
  });

  it('borrado vía API con proveedor que no confirma: 502 «NO se borró», nunca borrada:true', async () => {
    const sinConfirmar = apiCon(crearMemoria({ url: 'http://127.0.0.1:1', clave: 'k', timeoutMs: 500 }, async () => new Response('{}', { status: 200 })));
    const b = await borrar(central, '11111111-1111-1111-1111-111111111111', sinConfirmar);
    assert.equal(b.status, 502);
    assert.equal(b.j.borrada, undefined);
    assert.match(b.j.error, /NO se borró/);
  });
});
