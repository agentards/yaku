// Pantalla de la municipalidad (src/vista3d/municipalidad/incidentes.ts y textos.ts): lectura de /api/incidentes,
// prioridad (vida > severidad > respaldo), contador, nuevos y coincidencias, flujo de estados y la agrupación en
// pantalla de /api/reports cuando el servidor aún no tiene /api/incidentes. Reglas: producto/decision-confianza.md.
import { describe, it, expect } from 'vitest';
import { agrupar, aMs, contadorTxt, DetectorIncidentes, leerIncidente, leerIncidentes, pasosHasta, porPrioridad, siguientes, type Incidente } from '../src/vista3d/municipalidad/incidentes';
import { DETALLE, estadoChip, nivelDe, respaldo, respaldoTxt, ROTULO_VECINAL, tipoTxt } from '../src/vista3d/municipalidad/textos';
import type { ReporteApi } from '../src/vista3d/municipalidad/deteccion';

const T0 = Date.UTC(2026, 9, 18, 2, 3); // 21:03 en Lima
const S0 = Math.floor(T0 / 1000);
const inc = (id: string, extra: Record<string, unknown> = {}): Incidente =>
  leerIncidente({ id, tipo: 'agua', lat: -5.19, lon: -80.63, personas: 1, fotos: [], primer_reporte: T0, ultimo_reporte: T0, estado: 'nuevo', puntaje: 30, ...extra }, T0)!;
const rep = (id: string, extra: Partial<ReporteApi> & Record<string, unknown> = {}): ReporteApi =>
  ({ id, type: 'agua', severity: 2, lat: -5.0, lon: -80.3, note: '', ts: S0, device_id: 'dev-' + id, received_at: T0 + 60000, ...extra }) as ReporteApi;
const M = 1 / 111_320; // 1 m en grados de latitud

describe('municipalidad: lectura de /api/incidentes', () => {
  it('acepta { incidentes: [...] } o un arreglo; rechaza otra forma', () => {
    expect(leerIncidentes({ incidentes: [{ id: 'a', lat: -5, lon: -80 }] })?.map((i) => i.id)).toEqual(['a']);
    expect(leerIncidentes([{ id: 'b', lat: -5, lon: -80 }])?.map((i) => i.id)).toEqual(['b']);
    expect(leerIncidentes({ error: 'x' })).toBeNull();
    expect(leerIncidentes('<html>')).toBeNull();
  });

  it('descarta sin id o con coordenadas inválidas', () => {
    expect(leerIncidentes([{ lat: -5, lon: -80 }, { id: 'x', lat: 95, lon: -80 }, { id: 'y', lat: -5, lon: 'n' }])).toEqual([]);
  });

  it('lee la forma de servidor-local (vista.ts): respaldo, nivel, desglose, congelado, descarte y recurrencia', () => {
    const i = leerIncidente({ id: 'z', tipo: 'vivienda', tipos: ['vivienda', 'heridos'], lat: '-5.1', lon: -80.2, personas: 4, fotos: ['f1', 'f2'], n_fotos: 2,
      reportes: 5, reportes_ids: ['r1', 'r2'], primer_reporte: T0, ultimo_reporte: T0 + 60000, recibido: T0 + 90000,
      puntaje: 73, respaldo: 73, nivel: 'N2', desglose: { personas: 55, fotos: 25, cercania: 12, recencia: 0.794 }, respaldo_congelado: true,
      estado: 'accion_asignada', accion: 'bomberos', historial: [{ estado: 'validado', accion: null, motivo: '', quien: 'Ana', cuando: T0 }],
      nuevos_tras_descarte: 0, recurrencia_de: 'inc-viejo', riesgo_vida: false }, T0)!;
    expect(i).toMatchObject({ tipo: 'vivienda', lat: -5.1, personas: 4, reportes: 5, fotos: ['f1', 'f2'], nFotos: 2, primer: T0, recibido: T0 + 90000,
      puntaje: 73, nivel: 'N2', congelado: true, puntajeOrigen: 'servidor', estado: 'accion_asignada', accion: 'bomberos', recurrenciaDe: 'inc-viejo' });
    expect(i.desglose).toEqual({ personas: 55, fotos: 25, cercania: 12, recencia: 0.794 });
    expect(i.historial[0]).toMatchObject({ estado: 'validado', quien: 'Ana', cuando: T0 });
  });

  it('normaliza nombres alternativos, segundos o ms e ISO 8601', () => {
    const i = leerIncidente({ id: 'y', type: 'agua', lat: -5, lng: -80, personas_distintas: 2, foto_ids: [{ id: 'f' }], primer_ts: S0, estado: 'accion', accion: 'EDAN', score: 40.4, fotos_pendientes: 1 }, T0)!;
    expect(i).toMatchObject({ lon: -80, personas: 2, fotos: ['f'], primer: T0, estado: 'accion_asignada', accion: 'edan', puntaje: 40, fotosPendientes: 1 });
    expect(aMs('2026-10-18T02:03:00Z')).toBe(T0);
  });

  it('sin respaldo del servidor lo calcula la pantalla con la fórmula de §2.1', () => {
    const i = leerIncidente({ id: 'p', tipo: 'agua', lat: -5, lon: -80, personas: 2, personas_con_foto: 1, mediana_m: 40, ultimo_reporte: T0 }, T0)!;
    expect(i).toMatchObject({ puntajeOrigen: 'pantalla', puntaje: 75, nivel: 'N2' });
    expect(i.desglose).toEqual({ personas: 40, fotos: 15, cercania: 20, recencia: 1 });
  });

  it('contador «4 vecinos · 2 fotos · primer reporte 21:03» (y singulares)', () => {
    expect(contadorTxt(inc('a', { personas: 4, fotos: ['1', '2'] }))).toBe('4 vecinos · 2 fotos · primer reporte 21:03');
    expect(contadorTxt(inc('b'))).toBe('1 vecino · 0 fotos · primer reporte 21:03');
  });
});

describe('municipalidad: textos de decision-confianza.md §1', () => {
  it('rótulo vecinal, chips de estado (asignado, no «en camino») y detalle por nivel', () => {
    expect(ROTULO_VECINAL).toBe('Reporte vecinal · por validar');
    expect(estadoChip('nuevo', null)).toBe(ROTULO_VECINAL);
    expect(estadoChip('validado', null)).toBe('Validado por la municipalidad');
    expect(estadoChip('accion_asignada', 'bomberos')).toBe('Bomberos asignados');
    expect(estadoChip('descartado', null)).toBe('Revisado por la municipalidad');
    expect(DETALLE.N1(1, 0)).toBe('1 vecino lo reporta');
    expect(DETALLE.N1(1, 1)).toBe('1 vecino · 1 foto');
    expect(DETALLE.N2(2, 1)).toBe('2 vecinos lo reportan · 1 foto');
    expect(DETALLE.N3(3, 1)).toBe('3 vecinos coinciden · 1 foto · cerca uno del otro');
    expect(respaldoTxt(75)).toBe('Respaldo 75 · N2');
    expect(tipoTxt('atrapados')).toBe('Personas atrapadas');
    expect(tipoTxt('desconocido')).toBe('Otro');
  });
  it('ningún texto usa alerta/oficial/verificado/confirmado/emergencia como rótulo', () => {
    for (const t of [ROTULO_VECINAL, estadoChip('validado', null), estadoChip('en_revision', null), DETALLE.N3(3, 2)]) expect(t).not.toMatch(/alerta|oficial|verificad|confirmad|emergencia/i);
  });
});

describe('municipalidad: respaldo (§2.1) con los ejemplos de §2.4', () => {
  const r = (personas: number, personasConFoto: number, medianaM: number | null, horas = 0, mediaVidaH = 3, radioM: number | null = 250) => respaldo({ personas, personasConFoto, medianaM, radioM, horas, mediaVidaH }).total;
  it('A un vecino 25 · B demo 75 · C el mismo que insiste 40 · D tres vecinos 85 · E decae 73 · F viejo 23 · G atrapados 25', () => {
    expect(r(1, 0, null)).toBe(25);
    expect(r(2, 1, 40)).toBe(75);
    expect(r(1, 1, null)).toBe(40);
    expect(r(3, 1, 30)).toBe(85);
    expect(r(4, 2, 80, 1)).toBe(73);
    expect(r(4, 2, 80, 6)).toBe(23);
    expect(r(1, 0, null, 0, 12, 50)).toBe(25);
  });
  it('tope por dispositivo, piso de recencia 0,20 y niveles N1 < 45 ≤ N2 < 80 ≤ N3', () => {
    expect(r(1, 5, null)).toBe(40); // fotos de una sola persona cuentan 1
    expect(r(4, 2, 80, 100)).toBe(Math.round(92 * 0.2));
    expect([nivelDe(44), nivelDe(45), nivelDe(79), nivelDe(80)]).toEqual(['N1', 'N2', 'N2', 'N3']);
  });
});

describe('municipalidad: prioridad (§2.2)', () => {
  it('vida primero (atrapados > heridos), luego severidad, luego respaldo; cerrados al final', () => {
    const l = [inc('agua-s3-bajo', { severidad: 3, puntaje: 25 }), inc('agua-s1-alto', { severidad: 1, puntaje: 95 }), inc('cerrado', { tipo: 'atrapados', estado: 'atendido' }),
      inc('heridos', { tipo: 'heridos', puntaje: 20 }), inc('atrapados', { tipo: 'atrapados', puntaje: 10 }), inc('agua-s3-alto', { severidad: 3, puntaje: 80 })].sort(porPrioridad);
    expect(l.map((i) => i.id)).toEqual(['atrapados', 'heridos', 'agua-s3-alto', 'agua-s3-bajo', 'agua-s1-alto', 'cerrado']);
  });
});

describe('municipalidad: incidentes nuevos y coincidencias', () => {
  it('la primera respuesta siembra; luego un id nuevo es nuevo una sola vez', () => {
    const d = new DetectorIncidentes();
    expect(d.procesar([inc('a')])).toEqual({ nuevos: [], coinciden: [] });
    expect(d.previos).toBe(1);
    expect(d.procesar([inc('a'), inc('b')]).nuevos.map((i) => i.id)).toEqual(['b']);
    expect(d.procesar([inc('a'), inc('b')]).nuevos).toEqual([]);
  });

  it('otro vecino coincide: personas sube → coincidencia 1→2 (no incidente nuevo); una foto nueva también anima', () => {
    const d = new DetectorIncidentes();
    d.procesar([inc('a')]);
    const r = d.procesar([inc('a', { personas: 2 })]);
    expect(r.nuevos).toEqual([]);
    expect(r.coinciden.map((c) => [c.inc.id, c.personasAntes, c.inc.personas])).toEqual([['a', 1, 2]]);
    expect(d.procesar([inc('a', { personas: 2 })]).coinciden).toEqual([]);
    expect(d.procesar([inc('a', { personas: 2, fotos: ['f'] })]).coinciden.map((c) => c.fotosAntes)).toEqual([0]);
  });

  it('si el servidor re-agrupa con otro id pero con reportes ya vistos, no es nuevo', () => {
    const d = new DetectorIncidentes();
    d.procesar([inc('a', { reportes_ids: ['r1'] })]);
    const r = d.procesar([inc('a2', { reportes_ids: ['r1', 'r2'], personas: 2 })]);
    expect(r.nuevos).toEqual([]);
    expect(r.coinciden.map((c) => c.inc.id)).toEqual(['a2']);
  });

  it('con recibido del servidor, un id desconocido anterior a la siembra no es nuevo', () => {
    const d = new DetectorIncidentes();
    d.procesar([inc('a', { recibido: T0 })]);
    expect(d.procesar([inc('viejo', { recibido: T0 - 1000 }), inc('a', { recibido: T0 })]).nuevos).toEqual([]);
    expect(d.procesar([inc('n', { recibido: T0 + 1000 })]).nuevos.map((i) => i.id)).toEqual(['n']);
  });

  it('varios nuevos: el de mayor prioridad primero (ese es al que vuela la cámara)', () => {
    const d = new DetectorIncidentes();
    d.procesar([]);
    expect(d.procesar([inc('agua', { puntaje: 90 }), inc('atr', { tipo: 'atrapados' })]).nuevos.map((i) => i.id)).toEqual(['atr', 'agua']);
  });
});

describe('municipalidad: flujo de estados (§2.3)', () => {
  it('Nuevo → En revisión → Validado | Descartado → Acción asignada → Atendido', () => {
    expect(siguientes('nuevo')).toEqual(['en_revision']);
    expect(pasosHasta('nuevo', 'validado')).toEqual(['en_revision', 'validado']);
    expect(pasosHasta('nuevo', 'accion_asignada')).toEqual(['en_revision', 'validado', 'accion_asignada']);
    expect(pasosHasta('validado', 'atendido')).toEqual(['accion_asignada', 'atendido']);
    expect(pasosHasta('accion_asignada', 'accion_asignada')).toEqual(['accion_asignada']); // cambiar la acción
    expect(pasosHasta('descartado', 'validado')).toEqual(['en_revision', 'validado']); // reabrir
    expect(pasosHasta('atendido', 'nuevo')).toBeNull();
    expect(pasosHasta('nuevo', 'nuevo')).toBeNull();
  });
});

describe('municipalidad: agrupación en pantalla (§3, sin /api/incidentes)', () => {
  it('(a) 2 personas a 40 m, agua + cauce, en 10 min → 1 incidente con contador 2 y respaldo 60', () => {
    const l = agrupar([rep('a'), rep('b', { type: 'cauce', lat: -5.0 - 40 * M, ts: S0 + 600 })], T0 + 600_000);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ id: 'inc-a', personas: 2, reportes: 2, reportIds: ['a', 'b'], puntaje: 60, nivel: 'N2' });
  });
  it('(b) agua + vivienda a 20 m → 2 · (c) atrapados + heridos a 10 m → 2 · heridos + vivienda → tipo heridos', () => {
    expect(agrupar([rep('a'), rep('b', { type: 'vivienda', lat: -5.0 - 20 * M })])).toHaveLength(2);
    expect(agrupar([rep('a', { type: 'atrapados' }), rep('b', { type: 'heridos', lat: -5.0 - 10 * M })])).toHaveLength(2);
    expect(agrupar([rep('a', { type: 'vivienda' }), rep('b', { type: 'heridos', lat: -5.0 - 10 * M })])[0].tipo).toBe('heridos');
  });
  it('(d) un dispositivo, 6 reportes → 1 persona, severidad del último', () => {
    const seis = Array.from({ length: 6 }, (_, k) => rep('r' + k, { device_id: 'uno', ts: S0 + k * 120, severity: k === 5 ? 1 : 3 }));
    expect(agrupar(seis)[0]).toMatchObject({ personas: 1, reportes: 6, severidad: 1 });
  });
  it('(e) 3 reportes en línea cada 200 m (agua) → 2 incidentes: se mide al ancla, sin encadenar', () => {
    expect(agrupar([rep('a'), rep('b', { lat: -5.0 - 200 * M, ts: S0 + 60 }), rep('c', { lat: -5.0 - 400 * M, ts: S0 + 120 })])).toHaveLength(2);
  });
  it('(f) agua 4 h después del último reporte → incidente nuevo; daños tienen ventana de 12 h', () => {
    const tarde = { ts: S0 + 4 * 3600, received_at: T0 + 4 * 3.6e6 + 60000 };
    expect(agrupar([rep('a'), rep('b', tarde)])).toHaveLength(2);
    expect(agrupar([rep('a', { type: 'vivienda' }), rep('b', { type: 'vivienda', ...tarde })])).toHaveLength(1);
  });
  it('«otro» no agrupa entre personas, solo la misma persona (nivel 3)', () => {
    expect(agrupar([rep('a', { type: 'otro' }), rep('b', { type: 'otro' })])).toHaveLength(2);
    expect(agrupar([rep('a', { type: 'otro', device_id: 'x' }), rep('b', { type: 'otro', device_id: 'x', ts: S0 + 300 })])).toHaveLength(1);
  });
  it('un reloj del celular > 10 min en el futuro usa la hora de llegada', () => {
    const l = agrupar([rep('a', { ts: S0 + 5 * 3600, received_at: T0 })], T0);
    expect(l[0].primer).toBe(T0);
  });
  it('fotos: cuentan las recibidas; «tiene foto» sin imagen queda pendiente', () => {
    const l = agrupar([rep('a', { foto_id: 'foto-a' }), rep('b', { tiene_foto: true, lat: -5.0 - 30 * M })], T0);
    expect(l[0]).toMatchObject({ fotos: ['foto-a'], nFotos: 1, fotosPendientes: 1 });
  });
});
