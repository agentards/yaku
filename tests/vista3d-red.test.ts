// Vista 3D (UI), cambios C1 y C2: cola de sincronización, banda SIN RED y ficha de fuente.
import { describe, it, expect } from 'vitest';
import { bandaSinRedTxt, colaSync, fichaFuente, FUENTE_CHIP, LEYENDA_NIVELES, NIVEL_REFERENCIAL } from '../src/vista3d/ui/formato';
import { Tienda } from '../src/vista3d/ui/tienda';
import { SENAMHI_EMISION, fechaCorta, ESCENARIO_FIRMA } from '../src/vista3d/ui/tiempo';
import type { Ficha } from '../src/vista3d/ui/datos';

const H = 3600_000;
const ficha = (id: string, synced: boolean, extra: Partial<Ficha> = {}): Ficha =>
  ({ id, type: 'agua', severity: 2, lat: -5, lon: -79.8, note: '', ts: 10 * H, synced, source: 'local', ...extra });

describe('C1 · cola de sincronización (fichas reales con synced=false)', () => {
  it('0 pendientes → «Sincronizado ✓» (también sin fichas)', () => {
    expect(colaSync([])).toEqual({ n: 0, txt: 'Sincronizado ✓' });
    expect(colaSync([ficha('a', true), ficha('b', true)])).toEqual({ n: 0, txt: 'Sincronizado ✓' });
  });
  it('1 pendiente → singular', () => {
    expect(colaSync([ficha('a', false), ficha('b', true)])).toEqual({ n: 1, txt: '1 ficha pendiente de sincronizar' });
  });
  it('n pendientes → plural con miles como el HANDOFF', () => {
    expect(colaSync([ficha('a', false), ficha('b', false, { source: 'qr' }), ficha('c', false)]).txt).toBe('3 fichas pendientes de sincronizar');
    expect(colaSync(Array.from({ length: 1255 }, (_, i) => ficha(`f${i}`, false))).txt).toBe('1.255 fichas pendientes de sincronizar');
  });
  it('ignora las SIMULADAS aunque tengan synced=false', () => {
    const sims = [ficha('s1', false, { simulado: true }), ficha('s2', false, { simulado: true })];
    expect(colaSync(sims)).toEqual({ n: 0, txt: 'Sincronizado ✓' });
    expect(colaSync([...sims, ficha('r', false)]).n).toBe(1);
  });
  it('la tienda cuenta solo las reales: el modo demo no cambia la cola', () => {
    const t = new Tienda(() => SENAMHI_EMISION + 40 * H);
    expect(t.realesLeidas).toBe(false);
    t.setReales([ficha('r1', false), ficha('r2', true)]);
    expect(t.realesLeidas).toBe(true);
    t.setDemo(true);
    expect(colaSync(t.reales).n).toBe(1);
  });
  it('banda sin red con la fecha del escenario CENEPRED (de tiempo.ts, no fija en el texto)', () => {
    expect(fechaCorta(ESCENARIO_FIRMA)).toBe('16/10/2026');
    expect(`SIN RED · ${bandaSinRedTxt()}`).toBe('SIN RED · trabajando con datos guardados en este equipo (escenario CENEPRED del 16/10/2026)');
  });
});

describe('C2 · fuente y lectura del nivel', () => {
  it('chip de fuente y texto referencial exactos', () => {
    expect(FUENTE_CHIP).toBe('Fuente: CENEPRED/SIGRID 23077 · 16/10/2026');
    expect(NIVEL_REFERENCIAL).toBe('Nivel referencial del escenario: no es pronóstico ni alerta');
  });
  it('la ficha trae título, firma, descarga, IGN, OSIPTEL 2025-IV y el estado del pronóstico SENAMHI', () => {
    const f = fichaFuente(SENAMHI_EMISION + 30 * H);
    const txt = f.map((x) => `${x.k}: ${x.v}`).join('\n');
    expect(f.map((x) => x.k)).toEqual(['Título', 'Origen', 'Firmado', 'Descargado', 'Ubicación', 'Cobertura', 'Pronóstico']);
    expect(txt).toMatch(/SIGRID 23077 \(Aviso 421\)/);
    expect(txt).toMatch(/Firmado: 16\/10\/2026/);
    expect(txt).toMatch(/Descargado: .*17\/10\/2026/);
    expect(txt).toMatch(/IGN/);
    expect(txt).toMatch(/OSIPTEL.*2025-IV/);
    expect(f.find((x) => x.senamhi)!.v).toMatch(/SENAMHI.*VENCIDO/);
    expect(fichaFuente(SENAMHI_EMISION + 2 * H).find((x) => x.senamhi)!.v).toMatch(/VIGENTE/);
  });
  it('leyenda: los 5 niveles del Excel con los colores de la capa, sin la palabra alerta salvo en la negación', () => {
    expect(LEYENDA_NIVELES.map((l) => l.niv)).toEqual(['Muy alto', 'Alto', 'Medio', 'Bajo', 'Muy bajo']);
    expect(LEYENDA_NIVELES[0].color).toBe('#0b2f4e');
    expect(LEYENDA_NIVELES.some((l) => /alerta|pron[oó]stico/i.test(l.claro))).toBe(false);
  });
});
