// «Estoy bien» en el servidor: los celulares suben cartas (idempotente por id = hash del contenido) y la familia
// busca por nombre, sin tildes, nunca con un listado completo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { Almacen } from '../almacen.ts';
import { crearApi } from '../api.ts';
import { idCarta, type Carta } from '../cartas.ts';
import { REGLAS } from '../reglas.ts';

const T = 1792310000;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-cartas-'));
const A = new Almacen(path.join(dir, 'yaku.db'), REGLAS);
const api = crearApi({ almacen: A, pin: 'pin-prueba', fotosDir: path.join(dir, 'fotos'), ahora: () => (T + 600) * 1000 });
after(() => { A.cerrar(); fs.rmSync(dir, { recursive: true, force: true }); });

const carta = (nombre: string, extra: Partial<Carta> = {}): Carta => {
  const c = { nombre, para: 'mi mamá, Rosa', mensaje: `Hola, soy ${nombre}. Estoy bien.`, zona: 'Castilla', ts: T, deviceId: 'celulara', ...extra };
  return { ...c, id: idCarta(c) };
};
const subir = async (cartas: unknown[], subidoPor?: string) => (await api(new Request('http://x/api/cartas', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ cartas, subidoPor }) }))).json() as Promise<any>;
const buscar = async (q: string) => { const r = await api(new Request('http://x/api/cartas?q=' + encodeURIComponent(q))); return { status: r.status, j: (await r.json()) as any }; };

describe('/api/cartas («Estoy bien»)', () => {
  it('sube cartas válidas, una sola vez, y rechaza las alteradas', async () => {
    const luis = carta('Luis Chunga'), jose = carta('José Ñique', { deviceId: 'celularb' });
    const r = await subir([luis, jose, { ...carta('Ana Ruiz'), mensaje: 'Deposítenme a esta cuenta' }], 'celularb');
    assert.equal(r.inserted, 2);
    assert.deepEqual(r.rejected.map((x: any) => x.why), ['id no coincide con contenido']);
    assert.equal((await subir([luis], 'celulara')).duplicates, 1);
  });
  it('busca por nombre o para quién, sin tildes; con menos de 3 letras no responde', async () => {
    assert.equal((await buscar('jo')).status, 400);
    assert.deepEqual((await buscar('jose')).j.cartas.map((c: any) => c.nombre), ['José Ñique']);
    assert.equal((await buscar('CHUNGA')).j.count, 1);
    assert.equal((await buscar('rosa')).j.count, 2); // las dos son «para mi mamá, Rosa»
    assert.equal((await buscar('%%%')).j.count, 0); // los comodines no listan todo
    const c = (await buscar('luis')).j.cartas[0];
    assert.equal(idCarta(c), c.id); // lo que baja el celular se puede verificar igual
  });
  it('/api/stats cuenta las cartas sin mostrarlas', async () => {
    const s = (await (await api(new Request('http://x/api/stats'))).json()) as any;
    assert.equal(s.cartas, 2);
  });
});
