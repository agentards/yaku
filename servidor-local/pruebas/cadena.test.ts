// La prueba con 2 celulares de producción (17-oct, 23:40): A sin red hace «heridos», «heridos» y «casa dañada» en el
// mismo lugar; A alcanza a subir el primero y le pasa el resto a B por QR; B (con red) los sube.
// La municipalidad tiene que ver 2 incidentes (casa dañada y heridos) y saber cuáles llegaron por la cadena.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { makeObservation, type NewObservation } from '../../src/codec.ts';
import { Almacen } from '../almacen.ts';
import { crearApi } from '../api.ts';
import { REGLAS } from '../reglas.ts';

const T0 = 1792298420; // 17-oct-2026 23:40 (Lima)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-cadena-'));
const A = new Almacen(path.join(dir, 'yaku.db'), REGLAS);
let reloj = (T0 + 60) * 1000;
const api = crearApi({ almacen: A, pin: 'pin-prueba', fotosDir: path.join(dir, 'fotos'), ahora: () => reloj });
after(() => { A.cerrar(); fs.rmSync(dir, { recursive: true, force: true }); });

const obs = (o: Partial<NewObservation>) => makeObservation({ type: 'heridos', severity: 3, lat: -12.10040, lon: -77.03213, note: '(con foto)', ts: T0, deviceId: 'celulara', ...o } as NewObservation);
const subir = async (records: unknown[], subidoPor?: string) => {
  const r = await api(new Request('http://x/api/sync', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ records, subidoPor }) }));
  return r.json() as Promise<any>;
};
const incidentes = async () => ((await (await api(new Request('http://x/api/incidentes', { headers: { 'x-muni-pin': 'pin-prueba' } }))).json()) as any).incidentes as any[];

describe('cadena QR con 2 celulares', () => {
  const h1 = obs({}), h2 = obs({ ts: T0 + 35 }), casa = obs({ type: 'vivienda', ts: T0 + 278, lon: -77.03219 });
  it('A sube el primero con su propia red', async () => {
    assert.equal((await subir([h1], 'celulara')).inserted, 1);
  });
  it('B sube lo que le pasó A por QR (y lo que A ya había subido no se duplica)', async () => {
    reloj += 200_000;
    const j = await subir([h1, h2, casa], 'celularb');
    assert.equal(j.inserted, 2); assert.equal(j.duplicates, 1);
  });
  it('la municipalidad ve 2 incidentes: casa dañada y heridos, y cuántos llegaron por la cadena', async () => {
    const l = await incidentes();
    assert.equal(l.length, 2);
    const her = l.find((i) => i.tipo === 'heridos'), viv = l.find((i) => i.tipo === 'vivienda');
    assert.ok(her && viv);
    assert.equal(her.reportes, 2); assert.equal(her.personas, 1); assert.equal(her.por_cadena, 1); // h2 lo subió B
    assert.equal(viv.reportes, 1); assert.equal(viv.por_cadena, 1);
  });
  it('si A recupera la red después, nada cambia: el primero que subió cada reporte queda registrado', async () => {
    reloj += 60_000;
    assert.equal((await subir([h1, h2, casa], 'celulara')).inserted, 0);
    const her = (await incidentes()).find((i) => i.tipo === 'heridos');
    assert.equal(her.por_cadena, 1);
  });
  it('sin «subidoPor» (versiones viejas de la app) funciona igual y no cuenta como cadena', async () => {
    const otro = obs({ type: 'ayuda', deviceId: 'celularc', lat: -12.2 });
    assert.equal((await subir([otro])).inserted, 1);
    assert.equal((await incidentes()).find((i) => i.tipo === 'ayuda').por_cadena, 0);
  });
});
