// Modo poblador (src/poblador/): tipos ↔ codec, estado de vuelta (servidor y QR «YE1»), vecinos que coinciden,
// ruta por defecto en celular, plan de compresión de la foto y textos de decision-confianza.md.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OBS_TYPES, makeObservation, encodeForQR, Reassembler } from '../src/codec';
import { aCodec, deCodec, BOTONES, MARCA_FOTO } from '../src/poblador/tipos';
import { leerRespuestaEstados, codificarEstadosQR, decodificarEstadosQR, esCodigoEstados, textoEstado, masReciente, MAX_ESTADOS_QR, type EstadoReporte } from '../src/poblador/estados';
import { vecinosQueCoinciden, distanciaM } from '../src/poblador/confianza';
import { esVistaPoblador } from '../src/poblador/ruta';
import { intentos, LADO_MAX } from '../src/poblador/foto';
import { ROTULO_VECINAL, DETALLE, ESTADO, PIE_LEGAL, nivelLocal, T } from '../src/poblador/textos';

const VIEJOS = ['agua', 'huaico', 'cauce', 'via_bloq', 'otro'];
const T0 = 1_760_750_000;
const norte = (m: number) => -5.19449 + m / 111_320;
const rep = (deviceId: string, type: string, note = '', lat = -5.19449, ts = T0) =>
  makeObservation({ type: type as any, severity: 2, lat, lon: -80.63282, note, ts, deviceId });

describe('poblador: tipos ↔ codec', () => {
  it('hay botón para cada tipo nuevo y los de riesgo de vida van primero con aviso 116/105', () => {
    const ids = BOTONES.map((b) => b.id);
    for (const t of ['vivienda', 'atrapados', 'heridos', 'ayuda']) expect(ids).toContain(t);
    expect(BOTONES.slice(0, 2).map((b) => [b.id, b.riesgoVida])).toEqual([['atrapados', true], ['heridos', true]]);
    expect(BOTONES.filter((b) => b.riesgoVida).map((b) => b.id).sort()).toEqual(['atrapados', 'heridos']);
  });

  it('con el codec nuevo usa el tipo real', () => {
    const tipos = [...VIEJOS, 'vivienda', 'atrapados', 'heridos', 'ayuda'];
    expect(aCodec('vivienda', '  grieta  ', false, tipos)).toEqual({ type: 'vivienda', note: 'grieta' });
    expect(aCodec('atrapados', '', true, tipos)).toEqual({ type: 'atrapados', note: MARCA_FOTO });
  });

  it('con el codec viejo guarda «otro» + nombre del tipo y lo recupera igual', () => {
    const c = aCodec('vivienda', 'techo caído', true, VIEJOS);
    expect(c.type).toBe('otro');
    expect(c.note).toBe(`Casa dañada o caída: techo caído ${MARCA_FOTO}`);
    expect(deCodec(c)).toEqual({ tipo: 'vivienda', nota: 'techo caído', conFoto: true });
    expect(deCodec(aCodec('heridos', '', false, VIEJOS))).toEqual({ tipo: 'heridos', nota: '', conFoto: false });
    expect(deCodec({ type: 'otro', note: 'un árbol caído' })).toEqual({ tipo: 'otro', nota: 'un árbol caído', conFoto: false });
  });

  it('la nota nunca pasa de 140 caracteres y la marca de foto sobrevive', () => {
    const c = aCodec('ayuda', 'x'.repeat(300), true, VIEJOS);
    expect(c.note.length).toBeLessThanOrEqual(140);
    expect(c.note.endsWith(MARCA_FOTO)).toBe(true);
  });

  it('el reporte con el tipo del codec actual viaja por QR y vuelve idéntico', () => {
    const { type, note } = aCodec('vivienda', 'pared rajada', true);
    const o = makeObservation({ type, severity: 2, lat: -5.19, lon: -80.63, note, ts: T0, deviceId: 'pobl0001' });
    const r = new Reassembler();
    let fin: any;
    for (const f of encodeForQR([o]).fragments) fin = r.add(f);
    expect(fin.status).toBe('complete');
    expect(fin.records[0]).toEqual(o);
    expect(deCodec(fin.records[0]).tipo).toBe('vivienda');
    expect(OBS_TYPES.includes(type)).toBe(true);
  });
});

describe('poblador: estado de vuelta', () => {
  it('lee la respuesta de GET /api/estado del servidor local (WP1)', () => {
    const xs = leerRespuestaEstados({ estados: [
      { id: 'aaaaaaaaaaa', recibido: false },
      { id: 'bbbbbbbbbbb', recibido: true, recibido_at: 1_760_750_000_000, estado: 'nuevo', accion: null, motivo: '', cuando: null, personas: 2 },
      { id: 'ccccccccccc', recibido: true, estado: 'accion_asignada', accion: 'bomberos', cuando: 1_760_751_000_000, personas: 3 },
      { id: 'ddddddddddd', recibido: true, estado: 'descartado', motivo: 'Duplicado', cuando: '2026-10-17T21:40:00-05:00' },
      { id: 'eeeeeeeeeee', recibido: true, estado: 'En revisión' },
    ] });
    expect(xs.map((e) => [e.id[0], e.estado, e.accion ?? null])).toEqual([['b', 'nuevo', null], ['c', 'accion', 'bomberos'], ['d', 'descartado', null], ['e', 'en_revision', null]]);
    expect(xs[0]).toMatchObject({ at: 1_760_750_000_000, personas: 2 });
    expect(xs[2]).toMatchObject({ motivo: 'Duplicado', at: Date.parse('2026-10-17T21:40:00-05:00') });
  });

  it('también acepta un mapa {id: estado} y un arreglo plano; ignora basura', () => {
    expect(leerRespuestaEstados({ a1b2c3d4e5f: 'atendido' }).map((e) => e.estado)).toEqual(['atendido']);
    expect(leerRespuestaEstados([{ id: 'x1', state: 'validado', action: 'rescate' }])[0]).toMatchObject({ estado: 'accion', accion: 'rescate' });
    expect(leerRespuestaEstados(null)).toEqual([]);
    expect(leerRespuestaEstados({ estados: [{ id: 'z', estado: 'inventado' }] })).toEqual([]);
  });

  it('con estado municipal el vecino ve solo el estado; sin él, el rótulo vecinal', () => {
    const e = (estado: any, extra = {}): EstadoReporte => ({ id: 'a', estado, at: 0, ...extra });
    expect(textoEstado(undefined, false)).toMatchObject({ chip: null, nivel: 'local' });
    expect(textoEstado(undefined, true)).toMatchObject({ chip: null, nivel: 'enviado' });
    expect(textoEstado(e('nuevo'), true).chip).toBeNull();
    expect(textoEstado(e('en_revision'), true).chip).toBe(ESTADO.en_revision);
    expect(textoEstado(e('accion', { accion: 'bomberos' }), true).chip).toBe('Bomberos asignados');
    expect(textoEstado(e('descartado', { motivo: 'Duplicado' }), true).detalle).toContain('no lo validó: Duplicado');
    expect(textoEstado(e('atendido'), true).chip).toBe('Atendido por la municipalidad');
  });

  it('gana el estado más reciente; a igual hora, el más avanzado', () => {
    const a: EstadoReporte = { id: 'a', estado: 'en_revision', at: 100 };
    expect(masReciente(a, { id: 'a', estado: 'nuevo', at: 50 })).toBe(a);
    expect(masReciente(a, { id: 'a', estado: 'atendido', at: 100 }).estado).toBe('atendido');
    expect(masReciente(undefined, a)).toBe(a);
  });

  it('el código YE1 viaja en el alfabeto alfanumérico del QR, cabe en uno y rechaza alteraciones', () => {
    const xs: EstadoReporte[] = Array.from({ length: 40 }, (_, i) => ({
      id: rep('d' + i, 'agua', '', -5.19, T0 + i).id, estado: 'accion', accion: 'bomberos', at: (T0 + i * 60) * 1000,
    }));
    const s = codificarEstadosQR(xs)!;
    expect(esCodigoEstados(s)).toBe(true);
    expect(/^[0-9A-Z $%*+\-./:]+$/.test(s)).toBe(true);
    expect(s.length).toBeLessThan(900);
    const back = decodificarEstadosQR(s);
    expect(back).toHaveLength(MAX_ESTADOS_QR);
    expect(back[0]).toMatchObject({ estado: 'accion', accion: 'bomberos', id: xs[39].id }); // los más recientes primero
    const malo = s.slice(0, -3) + (s.at(-3) === 'A' ? 'B' : 'A') + s.slice(-2);
    expect(() => decodificarEstadosQR(malo)).toThrow();
    expect(codificarEstadosQR([])).toBeNull();
    expect(new Reassembler().add(s).status).toBe('ignored'); // la app técnica lo ignora sin romperse
  });
});

describe('poblador: vecinos que coinciden (estimación local, decision-confianza §3)', () => {
  it('2 vecinos a 40 m, casa dañada → 2; el mismo vecino no suma', () => {
    const a = rep('pobladora', 'vivienda');
    const b = rep('pobladorb', 'vivienda', MARCA_FOTO, norte(40), T0 + 60);
    const a2 = rep('pobladora', 'vivienda', 'otra vez', norte(10), T0 + 120);
    expect(vecinosQueCoinciden(a, [a, b, a2])).toEqual({ vecinos: 2, fotos: 1 });
    expect(Math.round(distanciaM(a, b))).toBe(40);
  });

  it('respeta familia, radio y ventana; atrapados no se mezcla y «otro» no agrupa', () => {
    const a = rep('d1', 'agua');
    expect(vecinosQueCoinciden(a, [a, rep('d2', 'cauce', '', norte(200))]).vecinos).toBe(2);       // agua 250 m
    expect(vecinosQueCoinciden(a, [a, rep('d2', 'agua', '', norte(300))]).vecinos).toBe(1);        // fuera de radio
    expect(vecinosQueCoinciden(a, [a, rep('d2', 'agua', '', -5.19449, T0 + 4 * 3600)]).vecinos).toBe(1); // fuera de 3 h
    expect(vecinosQueCoinciden(a, [a, rep('d2', 'vivienda', '', norte(20))]).vecinos).toBe(1);     // otra familia
    const t = rep('d1', 'atrapados');
    expect(vecinosQueCoinciden(t, [t, rep('d2', 'heridos', '', norte(10))]).vecinos).toBe(1);
    const o = rep('d1', 'otro', 'x');
    expect(vecinosQueCoinciden(o, [o, rep('d2', 'otro', 'y')]).vecinos).toBe(1);
  });

  it('reconoce los tipos guardados con prefijo en el codec viejo', () => {
    const a = makeObservation({ ...aCodec('vivienda', '', false, VIEJOS), severity: 2, lat: -5.19449, lon: -80.63282, ts: T0, deviceId: 'd1' });
    const b = makeObservation({ ...aCodec('vivienda', '', false, VIEJOS), severity: 3, lat: norte(30), lon: -80.63282, ts: T0, deviceId: 'd2' });
    expect(vecinosQueCoinciden(a, [a, b]).vecinos).toBe(2);
  });
});

describe('poblador: ruta y foto', () => {
  const cel = { celular: true, automatizado: false };
  it('?vista=poblador siempre; por defecto en celular; otra ?vista= o escritorio dejan la app técnica', () => {
    expect(esVistaPoblador('?vista=poblador', { celular: false, automatizado: true })).toBe(true);
    expect(esVistaPoblador('', cel)).toBe(true);
    expect(esVistaPoblador('?basemap=z12', cel)).toBe(true);
    expect(esVistaPoblador('?vista=2d', cel)).toBe(false);
    expect(esVistaPoblador('?vista=municipalidad', cel)).toBe(false);
    expect(esVistaPoblador('', { celular: false, automatizado: false })).toBe(false);
    expect(esVistaPoblador('', { celular: true, automatizado: true })).toBe(false); // E2E de la vista técnica
  });

  it('la compresión baja primero la calidad y luego el tamaño, sin pasar de 1280 px', () => {
    const xs = intentos(4000);
    expect(xs[0]).toEqual({ lado: LADO_MAX, q: 0.82 });
    expect(xs.every((x, i) => i === 0 || x.lado < xs[i - 1].lado || (x.lado === xs[i - 1].lado && x.q < xs[i - 1].q))).toBe(true);
    expect(Math.min(...xs.map((x) => x.lado))).toBeGreaterThanOrEqual(320);
    expect(intentos(800)[0].lado).toBe(800);
  });
});

describe('poblador: textos de decision-confianza.md', () => {
  it('rótulo vecinal corto, sin palabras de alerta ni números 0–100', () => {
    expect(ROTULO_VECINAL).toBe('Reporte vecinal · por validar');
    expect(ROTULO_VECINAL.length).toBeLessThanOrEqual(30);
    expect(/alerta|aviso|oficial|verificad|confirmad|emergencia/i.test(ROTULO_VECINAL)).toBe(false);
    for (const n of [1, 2, 3, 5]) expect(/confirm/i.test(DETALLE[nivelLocal(n)](n, 1))).toBe(false);
    expect(DETALLE.N1(1, 0)).toBe('1 vecino lo reporta');
    expect(DETALLE.N2(2, 1)).toBe('2 vecinos lo reportan · 1 foto');
    expect(PIE_LEGAL).toContain('116');
    expect(PIE_LEGAL).toContain('105');
    expect(T.avisoTexto).toMatch(/116.*105/);
  });
  it('estados: «no validado» distingue el descarte; pie con «si tienes señal» (§1 reglas)', () => {
    expect(ESTADO.descartado).toBe('Revisado · no validado');
    expect(ESTADO.descartado).not.toBe(ESTADO.atendido);
    expect(PIE_LEGAL).toMatch(/no una alerta oficial/);
    expect(PIE_LEGAL).toMatch(/tienes señal: 116/);
    expect(DETALLE.N1(4, 2)).toBe('4 vecinos lo reportan · 2 fotos'); // §2.4 caso F: N1 por antigüedad, no «1 vecino»
  });
  it('al vecino nunca el número 0–100: la app del poblador no pinta respaldo ni puntaje', () => {
    const src = ['app.ts', 'estados.ts', 'textos.ts'].map((f) => fs.readFileSync(path.resolve(__dirname, '../src/poblador', f), 'utf8')).join('\n');
    expect(src).not.toMatch(/vista3d\/municipalidad|respaldoTxt|\.puntaje|\.respaldo\b|\.score\b|`Respaldo/);
    for (const n of [1, 2, 3, 7]) expect(DETALLE[nivelLocal(n)](n, 1)).not.toMatch(/respaldo|%|\/ ?100|\bN[123]\b/i);
  });
  it('nunca rojo en la pantalla del poblador (el rojo es de las alertas oficiales)', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../src/poblador/poblador.css'), 'utf8');
    const rojos: string[] = [];
    for (const [hex] of css.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
      const h = hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1);
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
      if (d === 0) continue;
      const s = d / (1 - Math.abs(2 * l - 1));
      const hue = max === r ? (60 * ((g - b) / d) + 360) % 360 : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
      if (s > 0.35 && (hue < 12 || hue > 340)) rojos.push(hex);
    }
    expect(css).not.toMatch(/\b(red|crimson|firebrick|tomato)\b\s*[;)}]/i);
    expect(rojos).toEqual([]);
  });
  it('nunca «vía segura» ni «transitable»', () => {
    const todo = JSON.stringify({ T, ESTADO, PIE_LEGAL, B: BOTONES.map((b) => b.texto) }) + Object.values(DETALLE).map((f) => f(2, 1)).join();
    expect(/v[ií]a segura|transitable/i.test(todo)).toBe(false);
  });
});
