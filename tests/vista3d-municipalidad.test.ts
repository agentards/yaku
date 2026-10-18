// Pantalla de la municipalidad (src/vista3d/municipalidad/deteccion.ts): detección de reportes nuevos por id y
// received_at, siembra inicial (lo que ya existía no se anima), «llegó hace N s» y el proxy local solo lectura.
import { describe, it, expect } from 'vitest';
import { DetectorNuevos, leerRespuesta, llegoHace, masNuevoPrimero, type ReporteApi } from '../src/vista3d/municipalidad/deteccion';
import viteConfig from '../vite.config';

const rep = (id: string, received_at: number, extra: Partial<ReporteApi> = {}): ReporteApi =>
  ({ id, type: 'agua', severity: 2, lat: -5.19, lon: -80.63, note: '', ts: Math.floor(received_at / 1000), received_at, ...extra });

describe('municipalidad: detección de reportes nuevos', () => {
  it('la primera respuesta solo siembra: los reportes existentes no se animan', () => {
    const d = new DetectorNuevos();
    expect(d.procesar([rep('a', 1000), rep('b', 2000)])).toEqual([]);
    expect(d.sembrado).toBe(true);
    expect(d.previos).toBe(2);
    expect(d.procesar([rep('a', 1000), rep('b', 2000)])).toEqual([]);
  });

  it('un id que aparece después es nuevo una sola vez', () => {
    const d = new DetectorNuevos();
    d.procesar([rep('a', 1000)]);
    const n = d.procesar([rep('c', 3000), rep('a', 1000)]);
    expect(n.map((r) => r.id)).toEqual(['c']);
    expect(d.procesar([rep('c', 3000), rep('a', 1000)])).toEqual([]);
  });

  it('varios nuevos en la misma consulta salen del más nuevo al más viejo', () => {
    const d = new DetectorNuevos();
    d.procesar([rep('a', 1000)]);
    const n = d.procesar([rep('x', 5000), rep('y', 7000), rep('z', 6000), rep('a', 1000)]);
    expect(n.map((r) => r.id)).toEqual(['y', 'z', 'x']);
  });

  it('un id desconocido pero más viejo que la siembra no es nuevo (p. ej. reaparece por el límite de 50)', () => {
    const d = new DetectorNuevos();
    d.procesar([rep('b', 5000), rep('a', 4000)]);
    expect(d.procesar([rep('viejo', 3000), rep('b', 5000)])).toEqual([]);
    // a igual received_at que el corte sí cuenta (lote sincronizado en el mismo milisegundo)
    expect(d.procesar([rep('mismo-ms', 5000)]).map((r) => r.id)).toEqual(['mismo-ms']);
  });

  it('si al abrir no había reportes, el primero que llega es nuevo', () => {
    const d = new DetectorNuevos();
    expect(d.procesar([])).toEqual([]);
    expect(d.previos).toBe(0);
    expect(d.procesar([rep('p', 10)]).map((r) => r.id)).toEqual(['p']);
  });

  it('descarta filas sin id, sin coordenadas válidas o sin received_at', () => {
    const d = new DetectorNuevos();
    d.procesar([]);
    const malas = [{ ...rep('', 9000) }, rep('s', 9000, { lat: NaN }), rep('t', 9000, { lon: 200 }), { ...rep('u', 9000), received_at: undefined as any }];
    expect(d.procesar(malas)).toEqual([]);
  });

  it('leerRespuesta: acepta la forma de /api/reports y rechaza otra cosa (no siembra con basura)', () => {
    expect(leerRespuesta({ count: 1, reports: [rep('a', 1)], note: 'Reportes ciudadanos NO VERIFICADOS' })?.map((r) => r.id)).toEqual(['a']);
    expect(leerRespuesta({ error: 'no encontrado' })).toBeNull();
    expect(leerRespuesta('<html>')).toBeNull();
    expect(leerRespuesta(null)).toBeNull();
  });

  it('orden estable: más nuevo primero y, a igual hora, por id', () => {
    expect([rep('b', 1), rep('a', 1), rep('c', 2)].sort(masNuevoPrimero).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('municipalidad: «llegó hace N s»', () => {
  it('segundos, minutos y horas; nunca negativo', () => {
    expect(llegoHace(10_000, 15_400)).toBe('llegó hace 5 s');
    expect(llegoHace(0, 59_000)).toBe('llegó hace 59 s');
    expect(llegoHace(0, 125_000)).toBe('llegó hace 2 min');
    expect(llegoHace(0, 3_900_000)).toBe('llegó hace 1 h 5 min');
    expect(llegoHace(20_000, 10_000)).toBe('llegó hace 0 s');
  });
});

describe('proxy local de /api: solo lectura hacia producción', () => {
  for (const modo of ['server', 'preview'] as const) {
    it(`${modo}.proxy deja pasar GET/HEAD y corta POST/PUT/DELETE con 404`, () => {
      const p = (viteConfig as any)[modo].proxy['/api'];
      expect(p.target).toBe('https://yaku-relay-proto.pages.dev');
      expect(p.bypass({ method: 'GET' })).toBeUndefined();
      expect(p.bypass({ method: 'HEAD' })).toBeUndefined();
      for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(p.bypass({ method: m })).toBe(false);
    });
  }
});
