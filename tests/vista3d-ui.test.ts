// Vista 3D (UI): modelo de la línea de tiempo y series de datos sincronizadas con el cabezal.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Reloj, rango, marcas, eventosOficiales, SENAMHI_EMISION, ESCENARIO_FIN, ventanaSenamhi } from '../src/vista3d/ui/tiempo';
import { parseCentros, asociar, centrosConFicha, serieSinFicha, fichasPorEstado, seriesEstado, coberturaPorNivel, fichasSimuladas, type Ficha } from '../src/vista3d/ui/datos';

const H = 3600_000;
const centros = parseCentros(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/data/cenepred-ccpp.geojson'), 'utf8')));
const ficha = (id: string, lat: number, lon: number, ts: number, syncedAt?: number): Ficha =>
  ({ id, type: 'agua', severity: 2, lat, lon, note: '', ts, synced: syncedAt !== undefined, syncedAt, source: 'qr' });

describe('línea de tiempo', () => {
  it('rango cubre desde la emisión SENAMHI hasta el fin del escenario, y se amplía con ahora y las fichas', () => {
    const [a, b] = rango([], SENAMHI_EMISION + 10 * H);
    expect(a).toBe(SENAMHI_EMISION);
    expect(b).toBe(ESCENARIO_FIN);
    const tarde = ESCENARIO_FIN + 30 * H;
    expect(rango([tarde], 0)[1]).toBeGreaterThanOrEqual(tarde);
  });
  it('marcas cada 12 h alineadas a la medianoche de Lima', () => {
    const m = marcas(SENAMHI_EMISION, ESCENARIO_FIN);
    expect(m.length).toBeGreaterThan(5);
    expect(m.every((x) => x.hora === '00:00' || x.hora === '12:00')).toBe(true);
    expect(m.filter((x) => x.diaNuevo).map((x) => x.dia)).toContain('17 oct');
  });
  it('reloj: play avanza según velocidad, se detiene al final y paso salta al siguiente evento', () => {
    const r = new Reloj(0, 10 * H);
    r.avanzar(1000); expect(r.t).toBe(0); // en pausa no avanza
    r.play(); r.hps = 4; r.avanzar(500); expect(r.t).toBe(2 * H);
    expect(r.avanzar(10_000)).toBe(true); expect(r.t).toBe(10 * H); expect(r.jugando).toBe(false);
    r.ir(H); expect(r.paso([3 * H, 7 * H])).toBe(3 * H);
    expect(r.ir(-5)).toBe(0); expect(r.ir(99 * H)).toBe(10 * H);
  });
  it('eventos oficiales: emisión SENAMHI y vencimiento a 24 h; etiqueta VENCIDO tras la vigencia', () => {
    const ev = eventosOficiales(SENAMHI_EMISION + 30 * H);
    expect(ev.find((e) => e.tipo === 'vence')!.t - SENAMHI_EMISION).toBe(24 * H);
    expect(ventanaSenamhi(SENAMHI_EMISION + 30 * H).vencido).toBe(true);
    expect(ventanaSenamhi(SENAMHI_EMISION + 2 * H).vencido).toBe(false);
  });
});

describe('datos sincronizados con el cabezal', () => {
  const c0 = centros[0], c1 = centros[1];
  const fs1 = [
    ficha('f1', c0.lat + 0.001, c0.lon, 10 * H, 14 * H),
    ficha('f2', c0.lat, c0.lon + 0.001, 12 * H), // mismo centro poblado
    ficha('f3', c1.lat, c1.lon, 20 * H),
    ficha('lejos', -12.05, -77.04, 11 * H), // Lima: fuera del radio de asociación
  ];
  const asoc = asociar(fs1, centros);
  it('asocia por cercanía (≤ 1,5 km) y deja fuera lo lejano', () => {
    expect(asoc.get('f1')).toBe(c0.cod);
    expect(asoc.get('f3')).toBe(c1.cod);
    expect(asoc.has('lejos')).toBe(false);
  });
  it('centros con ficha y serie «sin ficha» descienden solo con la primera ficha de cada centro', () => {
    expect(centrosConFicha(fs1, asoc, 11 * H).size).toBe(1);
    const s = serieSinFicha(fs1, asoc, 930, 0, 30 * H);
    expect(s[0]).toEqual([0, 930]);
    expect(s.map((p) => p[1])).toEqual([930, 929, 928, 928]);
  });
  it('fichas por estado: en relevo hasta su consolidación', () => {
    expect(fichasPorEstado(fs1, 13 * H)).toEqual({ relevo: 3, consolidado: 0 });
    expect(fichasPorEstado(fs1, 15 * H)).toEqual({ relevo: 2, consolidado: 1 });
    const se = seriesEstado(fs1, 0, 30 * H);
    expect(se.consolidado.at(-1)![1]).toBe(1);
    expect(se.relevo.at(-1)![1]).toBe(3);
  });
  it('cobertura OSIPTEL por nivel suma las cifras verificadas (445 sin cobertura garantizada de 928 con dato)', () => {
    const cob = coberturaPorNivel(centros, new Set());
    expect(cob.reduce((s, x) => s + x.sinCob, 0)).toBe(445);
    expect(cob.reduce((s, x) => s + x.sinCob + x.conCob, 0)).toBe(928);
    expect(cob.reduce((s, x) => s + x.sinCob + x.conCob + x.sinDato, 0)).toBe(centros.length);
  });
  it('demo SIMULADO: determinista, marcado, sobre centros sin cobertura garantizada', () => {
    const a = fichasSimuladas(centros, 0, 48 * H), b = fichasSimuladas(centros, 0, 48 * H);
    expect(a).toEqual(b);
    expect(a.length).toBe(14);
    expect(a.every((f) => f.simulado && f.note.includes('SIMULADO') && f.saltos!.length >= 1)).toBe(true);
    const asocS = asociar(a, centros);
    expect(a.every((f) => centros.find((c) => c.cod === asocS.get(f.id))?.cg === false)).toBe(true);
  });
});
