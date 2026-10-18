// Dokploy/compose pasa las variables sin valor como cadena vacía (${MUNI_CLAVE:-}). El servidor tiene que arrancar
// igual y la contraseña de «central» pasa a ser el PIN; un usuario mal escrito tampoco tumba el arranque.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, it } from 'node:test';
import { iniciar } from '../servidor.ts';

const dirs: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-arranque-')); dirs.push(d); return d; };
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const entrar = (base: string, usuario: string, clave: string) => fetch(base + '/api/sesion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario, clave }) });

async function conEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const antes = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try { return await fn(); } finally { for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

it('MUNI_CLAVE, MUNI_USUARIO y YAKU_SESION_HORAS vacías: arranca y «central» entra con el PIN por 72 h', async () => {
  await conEnv({ MUNI_CLAVE: '', MUNI_USUARIO: '', YAKU_SESION_HORAS: '', MUNI_NOMBRE: '' }, async () => {
    const s = iniciar({ puerto: 0, host: '127.0.0.1', datos: tmp(), dist: tmp(), pin: 'pin-de-arranque', silencioso: true });
    const base = `http://127.0.0.1:${await s.listo}`;
    try {
      assert.equal((await fetch(base + '/salud')).status, 200);
      assert.notEqual((await entrar(base, 'central', '')).status, 200);
      const r = await entrar(base, 'central', 'pin-de-arranque');
      assert.equal(r.status, 200);
      const j = (await r.json()) as any;
      assert.equal(j.nombre, 'Municipio central');
      assert.ok(j.expira - Date.now() > 71 * 3_600_000);
    } finally { await s.cerrar(); }
  });
});

it('MUNI_USUARIO inválido: no se cae, avisa y queda el PIN', async () => {
  await conEnv({ MUNI_USUARIO: 'Municipio Central!', MUNI_CLAVE: '' }, async () => {
    const s = iniciar({ puerto: 0, host: '127.0.0.1', datos: tmp(), dist: tmp(), pin: 'pin-de-arranque', silencioso: true });
    const base = `http://127.0.0.1:${await s.listo}`;
    try {
      assert.equal((await fetch(base + '/salud')).status, 200);
      assert.equal((await fetch(base + '/api/incidentes', { headers: { 'x-muni-pin': 'pin-de-arranque' } })).status, 200);
    } finally { await s.cerrar(); }
  });
});
