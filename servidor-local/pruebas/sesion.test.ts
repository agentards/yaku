// Acceso del Centro de monitoreo con usuario + contraseña y token de sesión (SQLite), y el PIN de siempre como
// respaldo. Cambiar de región o recargar no vuelve a pedir la contraseña: el token dura hasta que vence o se sale.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { Almacen } from '../almacen.ts';
import { crearApi } from '../api.ts';
import { REGLAS } from '../reglas.ts';
import { asegurarUsuario } from '../usuarios.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-sesion-'));
const A = new Almacen(path.join(dir, 'yaku.db'), REGLAS);
let reloj = Date.parse('2026-10-18T07:00:00Z');
const api = crearApi({ almacen: A, pin: 'pin-de-respaldo', fotosDir: path.join(dir, 'fotos'), ahora: () => reloj, sesionHoras: 72 });
after(() => { A.cerrar(); fs.rmSync(dir, { recursive: true, force: true }); });

const pedir = async (ruta: string, init: RequestInit = {}) => { const r = await api(new Request('http://x' + ruta, init)); return { status: r.status, j: (await r.json()) as any }; };
const entrar = (usuario: string, clave: string) => pedir('/api/sesion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario, clave }) });
const conToken = (t: string, ruta = '/api/incidentes', method = 'GET') => pedir(ruta, { method, headers: { authorization: `Bearer ${t}` } });

describe('usuario de la municipalidad y sesiones', () => {
  it('se crea con su contraseña (guardada con scrypt, nunca en claro)', () => {
    assert.equal(asegurarUsuario(A, { usuario: 'central', nombre: 'Municipio central', clave: 'Clave-larga-de-prueba-2026' }, reloj), 'creado');
    const u = A.usuario('central')!;
    assert.notEqual(u.hash, 'Clave-larga-de-prueba-2026');
    assert.equal(asegurarUsuario(A, { usuario: 'central', nombre: 'Municipio central', clave: 'Clave-larga-de-prueba-2026' }, reloj), 'igual');
  });
  let token = '';
  it('usuario + contraseña → token; con el token se leen los incidentes sin PIN', async () => {
    assert.equal((await entrar('central', 'mala')).status, 403);
    assert.equal((await entrar('nadie', 'Clave-larga-de-prueba-2026')).status, 403);
    const r = await entrar('CENTRAL', 'Clave-larga-de-prueba-2026'); // el usuario no distingue mayúsculas
    assert.equal(r.status, 200);
    assert.equal(r.j.nombre, 'Municipio central');
    token = r.j.token;
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await conToken(token)).status, 200);
    assert.equal((await conToken(token, '/api/sesion')).j.usuario, 'central');
    assert.equal((await conToken('x'.repeat(43))).status, 401);
  });
  it('sigue valiendo después de «recargar» (otra petición, horas después) y vence a las 72 h', async () => {
    reloj += 71 * 3_600_000;
    assert.equal((await conToken(token)).status, 200);
    reloj += 2 * 3_600_000;
    assert.equal((await conToken(token)).status, 401);
  });
  it('«Salir» cierra la sesión en el servidor', async () => {
    const t = (await entrar('central', 'Clave-larga-de-prueba-2026')).j.token;
    assert.equal((await conToken(t, '/api/sesion', 'DELETE')).status, 200);
    assert.equal((await conToken(t)).status, 401);
  });
  it('si cambia la contraseña (variable de entorno), las sesiones abiertas se cierran', async () => {
    const t = (await entrar('central', 'Clave-larga-de-prueba-2026')).j.token;
    assert.equal(asegurarUsuario(A, { usuario: 'central', nombre: 'Municipio central', clave: 'Otra-clave-2026' }, reloj), 'actualizado');
    assert.equal((await conToken(t)).status, 401);
    assert.equal((await entrar('central', 'Otra-clave-2026')).status, 200);
  });
  it('el PIN de siempre sigue funcionando como respaldo', async () => {
    assert.equal((await pedir('/api/incidentes', { headers: { 'x-muni-pin': 'pin-de-respaldo' } })).status, 200);
  });
});
