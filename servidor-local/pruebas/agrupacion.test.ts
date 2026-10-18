// Agrupación y respaldo: los 7 tests mínimos de decision-confianza.md §3 y los ejemplos de §2.4.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { elegirIncidente, metros, respaldo, type IncBase, type Rep } from '../agrupacion.ts';
import { familiaDe, REGLAS } from '../reglas.ts';

const T0 = 1792252800; // s
const LAT = -5.19449, LON = -80.63282;
/** Desplaza `m` metros al norte. */
const norte = (m: number) => LAT + m / 111195;
let seq = 0;
const rep = (o: Partial<Rep>): Rep => ({
  id: (seq++).toString(36).padStart(11, '0'), type: 'agua', severity: 2, lat: LAT, lon: LON, note: '',
  ts: T0, device_id: 'dev1', received_at: (o.ts ?? T0) * 1000 + 60000, ...o,
});

/** Agrupa una lista como lo hace el almacén: en orden de hora, cada reporte elige o abre un incidente. */
function agrupar(reps: Rep[], estados: Record<string, IncBase['estado']> = {}) {
  const incs: IncBase[] = [];
  const recurrencias: Record<string, string> = {};
  for (const r of [...reps].sort((a, b) => a.ts - b.ts)) {
    const e = elegirIncidente(r, incs.map((i) => ({ ...i, estado: estados[i.id] ?? 'nuevo' })), REGLAS);
    if (e.id) incs.find((i) => i.id === e.id)!.miembros.push(r);
    else {
      const id = 'inc-' + r.id;
      if (e.recurrenciaDe) recurrencias[id] = e.recurrenciaDe;
      incs.push({ id, familia: familiaDe(r.type, REGLAS), anclaLat: r.lat, anclaLon: r.lon, estado: 'nuevo', miembros: [r] });
    }
  }
  return { incs, recurrencias };
}
const personas = (i: IncBase) => new Set(i.miembros.map((m) => m.device_id)).size;

describe('agrupación (decision-confianza.md §3)', () => {
  it('(a) 2 personas a 40 m, agua + cauce, en 10 min → 1 incidente, 2 personas', () => {
    const { incs } = agrupar([rep({ type: 'agua' }), rep({ type: 'cauce', device_id: 'dev2', lat: norte(40), ts: T0 + 600 })]);
    assert.equal(incs.length, 1);
    assert.equal(personas(incs[0]), 2);
  });
  it('(b) agua + vivienda a 20 m → 2 incidentes', () => {
    assert.equal(agrupar([rep({ type: 'agua' }), rep({ type: 'vivienda', device_id: 'dev2', lat: norte(20) })]).incs.length, 2);
  });
  it('(c) atrapados + heridos a 10 m → 2 incidentes', () => {
    assert.equal(agrupar([rep({ type: 'atrapados' }), rep({ type: 'heridos', device_id: 'dev2', lat: norte(10) })]).incs.length, 2);
  });
  it('(d) un dispositivo, 6 reportes → 1 persona', () => {
    const reps = Array.from({ length: 6 }, (_, k) => rep({ ts: T0 + k * 200, lat: norte(k * 5), severity: (1 + (k % 3)) as 1 | 2 | 3 }));
    const { incs } = agrupar(reps);
    assert.equal(incs.length, 1);
    assert.equal(personas(incs[0]), 1);
  });
  it('(e) 3 reportes en línea separados 200 m (agua) → 2 incidentes: se mide al ancla, sin encadenar', () => {
    const { incs } = agrupar([rep({}), rep({ device_id: 'dev2', lat: norte(200), ts: T0 + 60 }), rep({ device_id: 'dev3', lat: norte(400), ts: T0 + 120 })]);
    assert.equal(incs.length, 2);
    assert.deepEqual(incs.map((i) => i.miembros.length), [2, 1]);
  });
  it('(f) agua 4 h después del último reporte → incidente nuevo', () => {
    assert.equal(agrupar([rep({}), rep({ device_id: 'dev2', ts: T0 + 4 * 3600 })]).incs.length, 2);
  });
  it('(g) el mismo reporte relevado por 3 celulares → 1 fila y 1 persona', () => {
    const r = rep({});
    const unicos = new Map([r, { ...r }, { ...r }].map((x) => [x.id, x]));
    const { incs } = agrupar([...unicos.values()]);
    assert.equal(unicos.size, 1);
    assert.equal(personas(incs[0]), 1);
  });
  it('nivel 3: misma persona y tipo a ≤ 50 m y ≤ 30 min es actualización aunque «otro» no agrupe', () => {
    const { incs } = agrupar([rep({ type: 'otro' }), rep({ type: 'otro', lat: norte(30), ts: T0 + 900 }), rep({ type: 'otro', device_id: 'dev2', lat: norte(5) })]);
    assert.deepEqual(incs.map((i) => i.miembros.length), [2, 1]);
  });
  it('si coincide con un incidente atendido, abre uno nuevo enlazado como posible recurrencia', () => {
    const a = rep({});
    const { incs, recurrencias } = agrupar([a, rep({ device_id: 'dev2', lat: norte(30), ts: T0 + 300 })], { ['inc-' + a.id]: 'atendido' });
    assert.equal(incs.length, 2);
    assert.equal(recurrencias[incs[1].id], incs[0].id);
  });
  it('reloj adelantado > 10 min: se usa la hora de llegada', () => {
    const { incs } = agrupar([rep({}), rep({ device_id: 'dev2', ts: T0 + 10 * 3600, received_at: T0 * 1000 + 120000 })]);
    assert.equal(incs.length, 1);
  });
});

describe('respaldo (decision-confianza.md §2.4)', () => {
  const ahora = (T0 + 60) * 1000;
  const inc = (miembros: Rep[]) => ({ familia: familiaDe(miembros[0].type, REGLAS), anclaLat: miembros[0].lat, anclaLon: miembros[0].lon, miembros });
  it('A · un vecino → 25 N1', () => {
    const r = respaldo(inc([rep({ ts: T0 + 60 })]), new Set(), ahora, REGLAS);
    assert.equal(r.total, 25); assert.equal(r.nivel, 'N1');
  });
  it('B · demo: A y B, foto de B, a 40 m → 75 N2', () => {
    const r = respaldo(inc([rep({ ts: T0 + 60 }), rep({ device_id: 'devB', lat: norte(40), ts: T0 + 60 })]), new Set(['devB']), ahora, REGLAS);
    assert.equal(r.total, 75); assert.equal(r.nivel, 'N2');
    assert.deepEqual(r.desglose, { personas: 40, fotos: 15, cercania: 20, recencia: 1 });
  });
  it('C · el mismo que insiste: 6 reportes y 1 foto → 40 N1', () => {
    const reps = Array.from({ length: 6 }, (_, k) => rep({ ts: T0 + 60 - k * 100 }));
    const r = respaldo(inc(reps), new Set(['dev1']), ahora, REGLAS);
    assert.equal(r.total, 40); assert.equal(r.personas, 1);
  });
  it('D · tres vecinos, 1 foto, mediana 30 m → 85 N3', () => {
    const r = respaldo(inc([rep({ ts: T0 + 60 }), rep({ device_id: 'd2', lat: norte(30), ts: T0 + 60 }), rep({ device_id: 'd3', lat: norte(30), ts: T0 + 60 })]), new Set(['d3']), ahora, REGLAS);
    assert.equal(r.total, 85); assert.equal(r.nivel, 'N3');
  });
  it('E y F · decae: 4 personas, 2 fotos, mediana 80 m → 73 a 1 h y 23 a 6 h', () => {
    const reps = [rep({}), rep({ device_id: 'd2', lat: norte(80) }), rep({ device_id: 'd3', lat: norte(80) }), rep({ device_id: 'd4', lat: norte(90) })];
    const fotos = new Set(['d2', 'd3']);
    assert.equal(respaldo(inc(reps), fotos, T0 * 1000 + 3.6e6, REGLAS).total, 73);
    assert.equal(respaldo(inc(reps), fotos, T0 * 1000 + 6 * 3.6e6, REGLAS).total, 23);
  });
  it('vale el último reporte de cada persona (severidad y posición)', () => {
    const r = respaldo(inc([rep({ severity: 3 }), rep({ severity: 1, ts: T0 + 300 })]), new Set(), ahora, REGLAS);
    assert.equal(r.severidad, 1);
  });
  it('metros: 40 m al norte ≈ 40 m', () => assert.ok(Math.abs(metros(LAT, LON, norte(40), LON) - 40) < 0.5));
});
