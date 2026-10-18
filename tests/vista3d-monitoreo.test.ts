// Centro de monitoreo: histórico real (rango, estado en el tiempo, series, eventos) y piezas HTML de la tarjeta.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { contadores, estadoEn, eventosHistorico, fichaDeReporte, incidenteEn, incidentesCerca, indexar, pasoMarcas, rangoHistorico, seriesPorEstado, seriesReportes, H } from '../src/vista3d/monitoreo/historico';
import { accionesHtml, detalleHtml, filaHtml, galeriaHtml, pieMonitoreoHtml, tarjetaHtml, tono } from '../src/vista3d/monitoreo/piezas';
import { PIE_LEGAL } from '../src/vista3d/municipalidad/textos';
import { leerIncidente, type Incidente } from '../src/vista3d/municipalidad/incidentes';
import type { ReporteApi } from '../src/vista3d/municipalidad/deteccion';
import { ESCENARIO } from '../src/vista3d/escenario';
import { ESCENARIO_FIN, ESCENARIO_INICIO, ESCENARIO_FIRMA } from '../src/vista3d/ui/tiempo';

const T0 = Date.parse('2026-10-17T21:00:00-05:00');
const rep = (id: string, dev: string, dtMin: number, type = 'vivienda'): ReporteApi => ({ id, type, severity: 2, lat: -5.188, lon: -80.61, note: '', ts: (T0 + dtMin * 60000) / 1000 - 30, device_id: dev, received_at: T0 + dtMin * 60000 });
const R1 = rep('aaaaaaaaaa1', 'pobla001', 0), R2 = rep('aaaaaaaaaa2', 'poblb002', 10);
const inc = (x: Record<string, unknown> = {}): Incidente => leerIncidente({
  id: 'inc-aaaaaaaaaa1', tipo: 'vivienda', lat: -5.188, lon: -80.61, personas: 2, n_reportes: 2, reportes_ids: [R1.id, R2.id], fotos: [],
  primer_reporte: R1.ts, ultimo_reporte: R2.ts, recibido: R2.received_at, puntaje: 52, nivel: 'N2', estado: 'accion_asignada', accion: 'bomberos',
  historial: [
    { estado: 'en_revision', quien: 'Ana', cuando: T0 + 20 * 60000 },
    { estado: 'validado', quien: 'Ana', cuando: T0 + 20 * 60000 + 500 },
    { estado: 'accion_asignada', accion: 'bomberos', quien: 'Ana', cuando: T0 + 25 * 60000 },
  ], ...x,
}, T0 + 30 * 60000)!;

describe('rango del histórico real', () => {
  it('sin reportes: ahora−24 h a ahora (no se ata al escenario 17–19/10)', () => {
    const ahora = Date.parse('2026-11-02T10:00:00-05:00');
    expect(rangoHistorico([], ahora)).toEqual([ahora - 24 * H, ahora]);
  });
  it('con reportes: desde el primer recibido (con margen) hasta ahora; mínimo 10 min', () => {
    const ahora = T0 + 60 * 60000;
    const [a, b] = rangoHistorico([R1.received_at, R2.received_at], ahora);
    expect(b).toBe(ahora);
    expect(a).toBeLessThan(R1.received_at);
    expect(R1.received_at - a).toBeLessThan(5 * 60000);
    const [a2, b2] = rangoHistorico([ahora - 1000], ahora);
    expect(b2 - a2).toBeGreaterThanOrEqual(10 * 60000);
  });
  it('ficha del reporte: instante = llegada al servidor', () => {
    const f = fichaDeReporte(R2);
    expect(f.ts).toBe(R2.received_at);
    expect(f.simulado).toBeUndefined();
  });
});

describe('incidente en el tiempo', () => {
  const [h] = indexar([inc()], [R1, R2]);
  it('aparece con la primera llegada y cuenta vecinos que habían llegado', () => {
    expect(h.aparece).toBe(R1.received_at);
    expect(incidenteEn(h, R1.received_at - 1)).toBeNull();
    expect(incidenteEn(h, R1.received_at + 1)!.personas).toBe(1);
    expect(incidenteEn(h, R2.received_at)!.personas).toBe(2);
  });
  it('estado según el historial (quién/cuándo) y en vivo devuelve el del servidor', () => {
    expect(estadoEn(h, T0 + 15 * 60000).estado).toBe('nuevo');
    expect(estadoEn(h, T0 + 21 * 60000).estado).toBe('validado');
    expect(estadoEn(h, T0 + 26 * 60000)).toEqual({ estado: 'accion_asignada', accion: 'bomberos' });
    expect(incidenteEn(h, T0, true)).toBe(h.inc);
  });
  it('series por estado, reportes y vecinos acumulados, eventos', () => {
    const a = T0 - 60000, b = T0 + 30 * 60000;
    const s = seriesPorEstado([h], a, b);
    const ult = (k: keyof typeof s) => s[k].at(-1)![1];
    expect(ult('municipal')).toBe(1);
    expect(s.nuevo.find((p) => p[0] === R1.received_at)![1]).toBe(1);
    const r = seriesReportes([R1, R2], a, b);
    expect(r.reportes.at(-1)![1]).toBe(2);
    expect(r.vecinos.at(-1)![1]).toBe(2);
    const ev = eventosHistorico([R1, R2], [h]);
    expect(ev.filter((e) => e.tipo === 'reporte')).toHaveLength(2);
    expect(ev.filter((e) => e.tipo === 'estado').map((e) => e.estado)).toEqual(['en_revision', 'validado', 'accion_asignada']);
    expect(ev[0].incId).toBe('inc-aaaaaaaaaa1');
  });
  it('contadores, paso de marcas y cercanía', () => {
    expect(contadores([inc(), inc({ id: 'inc-bbbbbbbbbb1', estado: 'atendido' })])).toMatchObject({ abiertos: 1, personas: 2, total: 2 });
    expect(pasoMarcas(T0, T0 + 30 * 60000)).toBeLessThanOrEqual(5 / 60);
    expect(pasoMarcas(T0, T0 + 24 * H)).toBe(3);
    expect(incidentesCerca({ lat: -5.19, lon: -80.61 }, [inc()])).toHaveLength(1);
    expect(incidentesCerca({ lat: -5.5, lon: -80.61 }, [inc()])).toHaveLength(0);
  });
});

describe('piezas de la tarjeta', () => {
  const ctx = { puede: true, motivoNo: '', antes: null, ahora: T0 + 30 * 60000 };
  it('tarjeta: rótulo vecinal, contador y respaldo, sin relleno ni pie legal repetido; sin SIMULADO', () => {
    const t = tarjetaHtml(inc({ estado: 'nuevo', historial: [], accion: null }), ctx);
    expect(t).toContain('Reporte vecinal · por validar');
    expect(t).toMatch(/2 vecinos<\/b> · <b class="mon-k-fotos">0 fotos<\/b> · primer reporte \d\d:\d\d/);
    expect(t).toContain('Respaldo 52 · N2');
    // Decisión de Jorge (18/10): el aviso legal va una sola vez, en el pie de la página; la tarjeta no lo repite,
    // ni «2 vecinos lo reportan» (repite el contador), ni la barra del respaldo, ni «Sin fotos todavía».
    expect(t).not.toContain('no una alerta oficial');
    expect(t).not.toContain('lo reportan');
    expect(t).not.toContain('mon-barra');
    expect(t).not.toContain('Sin fotos todavía');
    expect(t).not.toMatch(/SIMULADO|vía segura|transitable/i);
    expect(t).not.toMatch(/\balerta\b(?! oficial)/i); // un reporte vecinal nunca se llama «alerta»
  });
  it('el pie del monitoreo muestra el aviso legal una sola vez, con el rótulo vecinal', () => {
    const pie = pieMonitoreoHtml();
    expect(pie.split('no una alerta oficial')).toHaveLength(2);
    expect(pie).toContain(PIE_LEGAL);
    expect(pie).toContain('Reporte vecinal · por validar');
    expect(detalleHtml(inc(), ctx)).not.toContain('no una alerta oficial');
  });
  it('fotos: miniatura de la primera (descargada con la sesión: data-foto sin src) y nada si no hay fotos', () => {
    const conFoto = inc({ fotos: [{ id: 'f0123456789abcdef012' }, { id: 'f0123456789abcdef013' }], n_fotos: 2 });
    const fila = filaHtml(conFoto, ctx, false);
    expect(fila).toContain('data-foto="f0123456789abcdef012"');
    expect(fila).not.toMatch(/<img[^>]*\ssrc=/);
    expect(galeriaHtml(inc({ fotos: [], n_fotos: 0 }))).toBe('');
    expect(galeriaHtml(conFoto)).toContain('data-k="1"');
  });
  it('tono (punto de estado): vida manda mientras está abierto; cerrados en gris', () => {
    expect(tono({ estado: 'nuevo', tipo: 'vivienda' })).toBe('nuevo');
    expect(tono({ estado: 'nuevo', tipo: 'atrapados' })).toBe('vida');
    expect(tono({ estado: 'atendido', tipo: 'atrapados' })).toBe('cerrado');
    expect(tono({ estado: 'accion_asignada', tipo: 'vivienda' })).toBe('municipal');
    expect(filaHtml(inc({ tipo: 'heridos', estado: 'nuevo', historial: [], accion: null }), ctx, false)).toContain('Riesgo de vida');
  });
  it('acciones según estado y rol', () => {
    const n = accionesHtml(inc({ estado: 'nuevo', historial: [], accion: null }), ctx);
    expect(n).toContain('data-destino="en_revision"'); expect(n).toContain('data-destino="validado"'); expect(n).toContain('data-destino="descartado"');
    const v = accionesHtml(inc({ estado: 'validado', accion: null }), ctx);
    for (const a of ['rescate', 'bomberos', 'provisiones', 'maquinaria', 'edan']) expect(v).toContain(`data-accion="${a}"`);
    expect(accionesHtml(inc(), ctx)).not.toContain('data-accion="bomberos"');
    expect(accionesHtml(inc(), ctx)).toContain('data-destino="atendido"');
    expect(accionesHtml(inc(), { puede: false, motivoNo: 'Tu rol es «monitor»' })).not.toContain('<button');
  });
  it('detalle con historial y fila de la lista', () => {
    const d = detalleHtml(inc(), ctx);
    expect(d).toContain('Historial de estados');
    expect(d).toContain('Ana');
    expect(d).toContain('Bomberos asignados');
    expect(filaHtml(inc(), ctx, true)).toContain('aria-current="true"');
  });
});

describe('escenario.ts es la fuente única de los textos oficiales', () => {
  it('tiempo.ts deriva sus fechas de escenario.ts', () => {
    expect(ESCENARIO_INICIO).toBe(ESCENARIO.inicio);
    expect(ESCENARIO_FIN).toBe(ESCENARIO.fin);
    expect(ESCENARIO_FIRMA).toBe(ESCENARIO.firma);
  });
  it('la interfaz del monitoreo no usa IndexedDB, fichas simuladas ni el modo demo', () => {
    const dir = 'src/vista3d/monitoreo/';
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const s = fs.readFileSync(dir + f, 'utf8');
      expect(s, f).not.toMatch(/fichasSimuladas|setDemo|from '\.\.\/\.\.\/db'|fichas-reales|indexedDB/);
      expect(s, f).not.toMatch(/17–19\/10|Aviso 421|23077/);
    }
  });
});
