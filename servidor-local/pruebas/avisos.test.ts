// Avisos de la municipalidad: al asignar una acción o cerrar un incidente, el servidor crea un aviso firmado que
// cualquier celular con red baja de /api/avisos y que el celular verifica con la clave pública (mismo código que
// usa la app; el relevo por QR de un aviso firmado aquí se prueba en tests/avisos.test.ts).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { makeObservation, type NewObservation } from '../../src/codec.ts';
import { Almacen } from '../almacen.ts';
import { crearApi } from '../api.ts';
import { canonico, cargarFirmante, type Aviso } from '../avisos.ts';
import { REGLAS } from '../reglas.ts';

const T0 = 1792298420;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-avisos-'));
const A = new Almacen(path.join(dir, 'yaku.db'), REGLAS);
let reloj = (T0 + 60) * 1000;
const firmante = cargarFirmante(dir);
const api = crearApi({ almacen: A, pin: 'pin-prueba', fotosDir: path.join(dir, 'fotos'), ahora: () => reloj, firmante });
after(() => { A.cerrar(); fs.rmSync(dir, { recursive: true, force: true }); });

/** Lo mismo que hace el celular (src/poblador/avisos.ts › verificarAviso), con WebCrypto. */
async function verificarAviso(a: Aviso, jwk: JsonWebKey): Promise<boolean> {
  try {
    const k = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, Buffer.from(a.firma, 'base64url'), new TextEncoder().encode(canonico(a)));
  } catch { return false; }
}
const PIN = { 'x-muni-pin': 'pin-prueba', 'content-type': 'application/json' };
const pedir = async (ruta: string, body?: unknown, h: Record<string, string> = {}) => {
  const r = await api(new Request('http://x' + ruta, body === undefined ? { headers: h } : { method: 'POST', headers: h, body: JSON.stringify(body) }));
  return { status: r.status, j: (await r.json()) as any };
};
const estado = (id: string, body: unknown) => pedir(`/api/incidentes/${id}/estado`, { quien: 'Operadora', ...body as object }, PIN);

describe('avisos firmados de la municipalidad', () => {
  let inc = '';
  it('un incidente nuevo todavía no tiene avisos', async () => {
    const o = makeObservation({ type: 'vivienda', severity: 3, lat: -5.19449, lon: -80.63282, note: '', ts: T0, deviceId: 'celulara' } as NewObservation);
    await pedir('/api/sync', { records: [o] }, { 'content-type': 'text/plain' });
    inc = (await pedir('/api/incidentes', undefined, PIN)).j.incidentes[0].id;
    assert.equal((await pedir('/api/avisos')).j.count, 0);
  });
  it('revisar y validar no crean avisos; asignar «provisiones» sí, con el mensaje del operador', async () => {
    reloj += 60_000; assert.equal((await estado(inc, { estado: 'en_revision' })).status, 200);
    reloj += 60_000; assert.equal((await estado(inc, { estado: 'validado' })).status, 200);
    assert.equal((await pedir('/api/avisos')).j.count, 0);
    reloj += 60_000;
    const r = await estado(inc, { estado: 'accion_asignada', accion: 'provisiones', mensaje: 'Llegan al colegio a las 3 p. m.|<b>' });
    assert.equal(r.status, 200);
    assert.equal(r.j.aviso.accion, 'provisiones');
    const l = (await pedir('/api/avisos')).j;
    assert.equal(l.count, 1);
    assert.equal(l.avisos[0].texto, 'Llegan al colegio a las 3 p. m. <b>'); // sin «|» ni saltos (texto canónico)
    assert.deepEqual(l.clave, firmante.jwkPublica);
    assert.equal(l.clave.d, undefined); // nunca la clave privada
  });
  it('el celular verifica la firma; un aviso alterado o con otra clave no pasa', async () => {
    const { avisos, clave } = (await pedir('/api/avisos')).j;
    const a = avisos[0] as Aviso;
    assert.equal(await verificarAviso(a, clave), true);
    assert.equal(await verificarAviso({ ...a, texto: 'Evacúen ya' }, clave), false);
    assert.equal(await verificarAviso({ ...a, accion: 'rescate' }, clave), false);
    const otra = cargarFirmante(fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-otra-')));
    assert.equal(await verificarAviso(a, otra.jwkPublica), false);
  });
  it('«atendido» crea un segundo aviso; la clave sobrevive a un reinicio', async () => {
    reloj += 60_000;
    assert.equal((await estado(inc, { estado: 'atendido' })).status, 200);
    const l = (await pedir('/api/avisos')).j;
    assert.equal(l.count, 2);
    assert.equal(l.avisos[0].accion, 'atendido');
    assert.deepEqual(cargarFirmante(dir).jwkPublica, firmante.jwkPublica);
  });
});
