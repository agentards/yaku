// Los 7 tests mínimos de decision-confianza.md §3, ahora por el camino real: SQLite (:memory:) con INSERT OR IGNORE,
// asignación al llegar (tabla asignaciones) y la vista de GET /api/incidentes. Más foto pendiente, descarte y prioridad.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeObservation, type NewObservation } from '../../src/codec.ts';
import { compararPrioridad } from '../agrupacion.ts';
import { Almacen } from '../almacen.ts';
import { REGLAS } from '../reglas.ts';
import { armarIncidentes } from '../vista.ts';

const T0 = 1792252800; // s
const LAT = -5.19449, LON = -80.63282;
const norte = (m: number) => LAT + m / 111195;
const obs = (o: Partial<NewObservation>) => makeObservation({ type: 'agua', severity: 2, lat: LAT, lon: LON, note: '', ts: T0, deviceId: 'dev1', ...o } as NewObservation);
/** Llegada al servidor después de todos los ts de cada caso (ningún reloj «en el futuro»). */
const LLEGADA = (T0 + 5 * 3600) * 1000;

function caso(lotes: ReturnType<typeof obs>[][], llegada = LLEGADA) {
  const A = new Almacen(':memory:', REGLAS);
  const insertados = lotes.map((l) => A.insertarReportes(l, llegada));
  return { A, insertados, incs: (ahora = llegada) => armarIncidentes(A.todo(), ahora, REGLAS) };
}

describe('los 7 tests de §3 por el almacén real', () => {
  it('(a) 2 personas a 40 m, agua + cauce, en 10 min → 1 incidente, 2 personas', () => {
    const { A, incs } = caso([[obs({}), obs({ type: 'cauce', deviceId: 'dev2', lat: norte(40), ts: T0 + 600 })]]);
    const l = incs();
    assert.equal(l.length, 1);
    assert.equal(l[0].personas, 2);
    assert.deepEqual(l[0].tipos.sort(), ['agua', 'cauce']);
    A.cerrar();
  });
  it('(b) agua + vivienda a 20 m → 2 incidentes', () => {
    const { A, incs } = caso([[obs({}), obs({ type: 'vivienda', deviceId: 'dev2', lat: norte(20) })]]);
    assert.equal(incs().length, 2);
    A.cerrar();
  });
  it('(c) atrapados + heridos a 10 m → 2 incidentes (atrapados nunca se agrupa con otro tipo)', () => {
    const { A, incs } = caso([[obs({ type: 'atrapados' }), obs({ type: 'heridos', deviceId: 'dev2', lat: norte(10) })]]);
    const l = incs();
    assert.equal(l.length, 2);
    assert.deepEqual(l.map((i) => i.tipo), ['atrapados', 'heridos']);
    A.cerrar();
  });
  it('(d) un dispositivo, 6 reportes → 1 persona; vale su último reporte', () => {
    const reps = Array.from({ length: 6 }, (_, k) => obs({ ts: T0 + k * 200, lat: norte(k * 5), severity: ([3, 1, 2, 3, 2, 1] as const)[k] }));
    const { A, incs } = caso([reps]);
    const l = incs((T0 + 1000) * 1000);
    assert.equal(l.length, 1);
    assert.equal(l[0].personas, 1); assert.equal(l[0].reportes, 6);
    assert.equal(l[0].severidad, 1); // el último fija la severidad
    assert.equal(l[0].puntaje, 25); // tope: 1 persona, aunque mande 6
    A.cerrar();
  });
  it('(e) 3 reportes en línea separados 200 m (agua) → 2 incidentes, no 1', () => {
    const { A, incs } = caso([[obs({}), obs({ deviceId: 'dev2', lat: norte(200), ts: T0 + 60 }), obs({ deviceId: 'dev3', lat: norte(400), ts: T0 + 120 })]]);
    const l = incs();
    assert.equal(l.length, 2);
    assert.deepEqual(l.map((i) => i.reportes).sort(), [1, 2]);
    A.cerrar();
  });
  it('(f) agua 4 h después del último reporte → incidente nuevo', () => {
    const { A, incs } = caso([[obs({})], [obs({ deviceId: 'dev2', ts: T0 + 4 * 3600 })]]);
    assert.equal(incs().length, 2);
    A.cerrar();
  });
  it('(g) el mismo reporte relevado por 3 celulares → 1 fila y 1 persona', () => {
    const r = obs({ deviceId: 'autor' });
    // Tres celulares lo cargaron por QR y cada uno sincroniza su lote: el id es hash del contenido.
    const { A, insertados, incs } = caso([[r], [{ ...r }], [{ ...r }]]);
    assert.deepEqual(insertados, [1, 0, 0]);
    assert.equal(A.stats().total, 1);
    const l = incs();
    assert.equal(l.length, 1);
    assert.equal(l[0].personas, 1); assert.equal(l[0].reportes, 1);
    A.cerrar();
  });
});

describe('respaldo y estado en la vista (§2.1, §2.3)', () => {
  it('la foto cuenta solo al recibirla; antes se ve como pendiente (1 por dispositivo)', () => {
    const a = obs({ deviceId: 'veca', ts: T0 + 60 });
    const b1 = obs({ deviceId: 'vecb', lat: norte(40), ts: T0 + 60, note: 'sube rápido (con foto)' });
    const b2 = obs({ deviceId: 'vecb', lat: norte(42), ts: T0 + 120, note: '(con foto)' });
    const { A, incs } = caso([[a, b1, b2]], (T0 + 180) * 1000);
    let [i] = incs();
    assert.equal(i.puntaje, 60); // (40 + 0 + 20) × 1: la marca sola no suma
    assert.equal(i.fotos_pendientes, 1); assert.equal(i.personas_con_foto, 0);
    A.guardarFoto({ id: 'f'.repeat(20), report_id: b1.id, mime: 'image/jpeg', bytes: 10, received_at: (T0 + 200) * 1000 });
    [i] = incs((T0 + 180) * 1000);
    assert.equal(i.puntaje, 75); // caso B de §2.4
    assert.equal(i.fotos_pendientes, 0); assert.equal(i.personas_con_foto, 1);
    A.cerrar();
  });
  it('recencia con piso 0,20: no oculta el incidente viejo', () => {
    const { A, incs } = caso([[obs({})]]);
    const [i] = incs((T0 + 48 * 3600) * 1000);
    assert.equal(i.puntaje, 5); // 25 × 0,20
    assert.equal(i.desglose.recencia, 0.2);
    A.cerrar();
  });
  it('descartado: los reportes nuevos se agregan y se cuentan, pero no lo reabren solos', () => {
    const { A, incs } = caso([[obs({})]], (T0 + 60) * 1000);
    const id = incs()[0].id;
    A.guardarEstado({ incidente_id: id, estado: 'en_revision', accion: null, motivo: '', quien: 'Op', cuando: (T0 + 120) * 1000, respaldo: 25 });
    A.guardarEstado({ incidente_id: id, estado: 'descartado', accion: null, motivo: 'charco de riego', quien: 'Op', cuando: (T0 + 180) * 1000, respaldo: 25 });
    A.insertarReportes([obs({ deviceId: 'dev2', lat: norte(30), ts: T0 + 600 })], (T0 + 660) * 1000);
    const l = incs((T0 + 660) * 1000);
    assert.equal(l.length, 1);
    assert.equal(l[0].estado, 'descartado'); assert.equal(l[0].nuevos_tras_descarte, 1); assert.equal(l[0].personas, 2);
    A.cerrar();
  });
  it('validado: el respaldo se congela y la severidad nunca lo sube', () => {
    const { A, incs } = caso([[obs({ severity: 3 })]], (T0 + 60) * 1000);
    const [i0] = incs();
    assert.equal(i0.puntaje, 25); // severidad 3 no suma
    A.guardarEstado({ incidente_id: i0.id, estado: 'en_revision', accion: null, motivo: '', quien: 'Op', cuando: (T0 + 70) * 1000, respaldo: 25 });
    A.guardarEstado({ incidente_id: i0.id, estado: 'validado', accion: null, motivo: '', quien: 'Op', cuando: (T0 + 80) * 1000, respaldo: 25 });
    const [i] = incs((T0 + 10 * 3600) * 1000);
    assert.equal(i.puntaje, 25); assert.equal(i.respaldo_congelado, true);
    A.cerrar();
  });
});

describe('prioridad lexicográfica (§2.2)', () => {
  const cmp = compararPrioridad(REGLAS);
  const i = (id: string, o: Partial<{ tipo: string; severidad: number; puntaje: number; ultimo_reporte: number; estado: any }>) =>
    ({ id, estado: 'nuevo' as const, tipo: 'agua', severidad: 1, puntaje: 25, ultimo_reporte: 0, ...o });
  it('vida > severidad > respaldo > más reciente', () => {
    const lista = [
      i('reciente', { severidad: 2, puntaje: 40, ultimo_reporte: 9 }),
      i('respaldo', { severidad: 2, puntaje: 85, ultimo_reporte: 1 }),
      i('severo', { severidad: 3, puntaje: 25 }),
      i('viejo', { severidad: 2, puntaje: 40, ultimo_reporte: 2 }),
      i('heridos', { tipo: 'heridos', severidad: 1, puntaje: 5 }),
      i('atrapados', { tipo: 'atrapados', severidad: 1, puntaje: 5 }),
    ].sort(cmp);
    assert.deepEqual(lista.map((x) => x.id), ['atrapados', 'heridos', 'severo', 'respaldo', 'reciente', 'viejo']);
  });
  it('el estado municipal no toca el puntaje: un atendido baja al final pero conserva su respaldo', () => {
    const lista = [i('atendido', { tipo: 'atrapados', puntaje: 90, estado: 'atendido' }), i('abierto', { puntaje: 5 })].sort(cmp);
    assert.deepEqual(lista.map((x) => [x.id, x.puntaje]), [['abierto', 5], ['atendido', 90]]);
  });
});
