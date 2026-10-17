// Relevo animado (lógica pura): qué tramos de teléfono a teléfono ocurren entre dos instantes del cabezal
// y la geometría del arco en pantalla. El dibujo vive en relevo.ts.
import type { CentroPoblado } from './contrato';
import { distKm, type Ficha } from './datos';

export type LonLat = { lon: number; lat: number };
/** Extremo de un tramo: un punto del terreno o un ancla fija de la pantalla («este teléfono», «servidor»). */
export type Ancla = LonLat | { pantalla: 'telefono' | 'servidor' };
export interface Tramo { id: string; de: Ancla; a: Ancla; etDe: string; etA: string; tipo: 'qr' | 'sync' | 'local'; simulado: boolean }
export interface XY { x: number; y: number }

/** Centro poblado con cobertura garantizada según OSIPTEL más cercano (hacia donde se mueve el relevo SIMULADO). */
export function masCercanoConCobertura(p: LonLat, centros: CentroPoblado[]): CentroPoblado | null {
  let best: CentroPoblado | null = null, bd = Infinity;
  for (const c of centros) {
    if (c.cg !== true) continue;
    const d = distKm(p, c);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

/** Posiciones SIMULADAS de los teléfonos: el primero en la ficha y los siguientes acercándose a un centro
 * poblado con cobertura garantizada. Devuelve saltos + 1 posiciones. */
export function posicionesTelefonos(f: Ficha, centros: CentroPoblado[]): LonLat[] {
  const n = f.saltos?.length ?? 0;
  const o = { lon: f.lon, lat: f.lat };
  const d = masCercanoConCobertura(o, centros) ?? o;
  return Array.from({ length: n + 1 }, (_, k) => {
    const u = n ? k / n : 0;
    return { lon: o.lon + (d.lon - o.lon) * u, lat: o.lat + (d.lat - o.lat) * u };
  });
}

/** Tramos cuyo instante cae en (t0, t1]: saltos por QR y la consolidación al volver la red. */
export function tramosEntre(fichas: Ficha[], t0: number, t1: number, posiciones: (f: Ficha) => LonLat[]): Tramo[] {
  if (!(t1 > t0)) return [];
  const out: Tramo[] = [];
  for (const f of fichas) {
    const saltos = f.saltos ?? [];
    let pos: LonLat[] | null = null;
    saltos.forEach((s, k) => {
      if (s.t > t0 && s.t <= t1) {
        pos ??= posiciones(f);
        out.push({ id: `${f.id}#${k}`, de: pos[k], a: pos[k + 1] ?? pos[k], etDe: s.de, etA: s.a, tipo: 'qr', simulado: !!f.simulado });
      }
    });
    if (f.syncedAt !== undefined && f.syncedAt > t0 && f.syncedAt <= t1) {
      pos ??= posiciones(f);
      const ult = saltos.length ? saltos[saltos.length - 1].a : 'Este teléfono';
      out.push({ id: `${f.id}#sync`, de: pos[pos.length - 1], a: { pantalla: 'servidor' }, etDe: ult, etA: 'Servidor', tipo: 'sync', simulado: !!f.simulado });
    }
  }
  return out;
}

/** Punto de control de la curva: el arco se eleva sobre el terreno, más alto cuanto más largo el tramo. */
export function control(p0: XY, p1: XY, alza = 0.38): XY {
  const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
  const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  return { x: mx, y: my - Math.max(28, d * alza) };
}
export function bezier(p0: XY, c: XY, p1: XY, u: number): XY {
  const v = 1 - u;
  return { x: v * v * p0.x + 2 * v * u * c.x + u * u * p1.x, y: v * v * p0.y + 2 * v * u * c.y + u * u * p1.y };
}
