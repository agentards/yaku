// Vista 3D (UI): textos del HUD del portal, relevo animado, gráficos sincronizados y estado compartido.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseCentros, fichasSimuladas, type Ficha } from '../src/vista3d/ui/datos';
import { dms, num, altitudTxt, coberturaTxt, estadoCentro, rumbo } from '../src/vista3d/ui/formato';
import { posicionesTelefonos, tramosEntre, masCercanoConCobertura, control, bezier } from '../src/vista3d/ui/arcos';
import { valorEn, caminoEscalon } from '../src/vista3d/ui/graficos';
import { diferencia } from '../src/vista3d/ui/fichas-reales';
import { Tienda } from '../src/vista3d/ui/tienda';
import { ESCENARIO_INICIO, ESCENARIO_FIN } from '../src/vista3d/ui/tiempo';

const H = 3600_000;
const centros = parseCentros(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/data/cenepred-ccpp.geojson'), 'utf8')));
const ficha = (id: string, extra: Partial<Ficha> = {}): Ficha => ({ id, type: 'agua', severity: 2, lat: -5, lon: -79.8, note: '', ts: 10 * H, synced: false, source: 'qr', ...extra });

describe('HUD del portal de campo', () => {
  it('formatea cifras como el HANDOFF (1.255) y coordenadas en grados con S/O', () => {
    expect(num(1255)).toBe('1.255');
    expect(num(12.64, 1)).toBe('12,6');
    expect(dms(-4.49401, -79.77479)).toBe('4°29′38″S 79°46′29″O');
    expect(altitudTxt(2134.4)).toBe('2.134 m s.n.m.');
    expect(altitudTxt(null)).toBe('—');
    expect(rumbo(-71)).toBe('289°');
  });
  it('cobertura OSIPTEL con el lenguaje obligatorio (nunca «sin señal»)', () => {
    expect(coberturaTxt({ cg: false, g4: false }).largo).toBe('Sin cobertura garantizada según OSIPTEL (declarada por operadoras)');
    expect(coberturaTxt({ cg: null, g4: null }).corto).toBe('SIN DATO OSIPTEL');
    expect(coberturaTxt({ cg: true, g4: true }).corto).toContain('4G');
    const todo = [false, true, null].map((cg) => JSON.stringify(coberturaTxt({ cg, g4: cg }))).join(' ').toLowerCase();
    expect(todo).not.toMatch(/sin se[ñn]al/);
  });
  it('estado del centro poblado: «Sin ficha de evaluación» o «Con registro recibido, no verificado»', () => {
    expect(estadoCentro(0).txt).toBe('Sin ficha de evaluación');
    expect(estadoCentro(2).txt).toBe('Con registro recibido, no verificado');
  });
});

describe('relevo animado', () => {
  const sim = fichasSimuladas(centros, ESCENARIO_INICIO, ESCENARIO_FIN);
  it('teléfonos SIMULADOS: el primero en la ficha y el último en un centro poblado con cobertura garantizada', () => {
    const f = sim[0];
    const p = posicionesTelefonos(f, centros);
    expect(p).toHaveLength(f.saltos!.length + 1);
    expect(p[0]).toEqual({ lon: f.lon, lat: f.lat });
    const destino = masCercanoConCobertura(f, centros)!;
    expect(destino.cg).toBe(true);
    expect(p.at(-1)!.lon).toBeCloseTo(destino.lon, 6);
  });
  it('tramos entre dos instantes: cada salto por QR una sola vez y la consolidación hacia el servidor', () => {
    const pos = (f: Ficha) => posicionesTelefonos(f, centros);
    const todos = tramosEntre(sim, ESCENARIO_INICIO - H, ESCENARIO_FIN, pos);
    const saltos = sim.reduce((s, f) => s + f.saltos!.length, 0);
    const syncs = sim.filter((f) => f.syncedAt).length;
    expect(todos.filter((t) => t.tipo === 'qr')).toHaveLength(saltos);
    expect(todos.filter((t) => t.tipo === 'sync')).toHaveLength(syncs);
    expect(todos.every((t) => t.simulado)).toBe(true);
    expect(todos.filter((t) => t.tipo === 'sync').every((t) => 'pantalla' in t.a && t.a.pantalla === 'servidor')).toBe(true);
    // partir el intervalo no duplica ni pierde tramos
    const m = (ESCENARIO_INICIO + ESCENARIO_FIN) / 2;
    const partes = [...tramosEntre(sim, ESCENARIO_INICIO - H, m, pos), ...tramosEntre(sim, m, ESCENARIO_FIN, pos)];
    expect(partes.map((t) => t.id).sort()).toEqual(todos.map((t) => t.id).sort());
    expect(tramosEntre(sim, m, m, pos)).toEqual([]);
  });
  it('el arco se eleva sobre la cuerda y pasa por sus extremos', () => {
    const a = { x: 0, y: 100 }, b = { x: 200, y: 100 }, c = control(a, b);
    expect(c.y).toBeLessThan(100);
    expect(bezier(a, c, b, 0)).toEqual(a);
    expect(bezier(a, c, b, 1)).toEqual(b);
    expect(bezier(a, c, b, 0.5).y).toBeLessThan(100);
  });
  it('flujo real: detecta fichas nuevas y recién consolidadas entre dos lecturas de IndexedDB', () => {
    const previo = new Map([['a', false], ['b', false]]);
    const d = diferencia(previo, [ficha('a', { synced: true, syncedAt: 1 }), ficha('b'), ficha('c')]);
    expect(d.nuevas.map((f) => f.id)).toEqual(['c']);
    expect(d.consolidadas.map((f) => f.id)).toEqual(['a']);
  });
});

describe('gráficos sincronizados', () => {
  const pts: [number, number][] = [[0, 930], [5, 929], [8, 927], [10, 927]];
  it('valor en escalones en el cabezal', () => {
    expect(valorEn(pts, -1)).toBe(930);
    expect(valorEn(pts, 5)).toBe(929);
    expect(valorEn(pts, 7.9)).toBe(929);
    expect(valorEn(pts, 99)).toBe(927);
  });
  it('trayectoria en viewBox 0..100, con área cerrada al piso', () => {
    expect(caminoEscalon(pts, 0, 10, 925, 930)).toBe('M0,0H50V20H80V60H100V60H100');
    expect(caminoEscalon(pts, 0, 10, 925, 930, true).endsWith('V100H0Z')).toBe(true);
    expect(caminoEscalon([], 0, 10, 0, 1)).toBe('');
  });
});

describe('estado compartido de la interfaz', () => {
  it('modo demo SIMULADO: agrega fichas, amplía el rango y avisa; al apagarlo vuelven solo las reales', () => {
    const t = new Tienda(() => ESCENARIO_INICIO + 6 * H);
    t.setCentros(centros);
    const avisos: string[] = [];
    t.on('fichas', () => avisos.push('fichas'));
    t.on('demo', (on) => avisos.push(`demo:${on}`));
    t.setDemo(true);
    expect(t.fichas().length).toBe(14);
    expect(t.fichas().every((f) => f.simulado && f.ts >= ESCENARIO_INICIO)).toBe(true);
    expect(t.asoc.size).toBe(14);
    expect(avisos).toEqual(['fichas', 'demo:true']);
    t.setDemo(false);
    expect(t.fichas()).toEqual([]);
  });
  it('el cabezal queda dentro del rango y solo avisa cuando cambia', () => {
    const t = new Tienda(() => ESCENARIO_INICIO);
    let n = 0;
    t.on('t', () => n++);
    t.setT(-1e15);
    expect(t.t).toBe(t.rango[0]);
    t.setT(-1e15);
    expect(n).toBe(1);
    const quitar = t.on('seleccion', () => n++);
    t.seleccionar(centros[0]); t.seleccionar(centros[0]);
    quitar(); t.seleccionar(null);
    expect(n).toBe(2);
  });
});
