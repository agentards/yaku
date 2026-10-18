// Cuántos vecinos distintos reportan el mismo hecho, con lo que hay en ESTE celular (estimación local; el
// servidor de WP1 agrupa con todos los reportes y su número manda cuando llega). Reglas de
// agentards/producto/decision-confianza.md §3: familia de tipo, radio por familia medido al reporte de referencia,
// ventana por familia, device_id distintos del AUTOR (el relevo no suma). «otro» no agrupa entre personas.
import { deCodec, type TipoPoblador } from './tipos';

interface Familia { radioM: number | null; ventanaH: number }
export const FAMILIAS: Record<string, Familia> = {
  agua: { radioM: 250, ventanaH: 3 },
  danos: { radioM: 100, ventanaH: 12 },
  atrapados: { radioM: 50, ventanaH: 12 },
  ayuda: { radioM: 150, ventanaH: 24 },
  otro: { radioM: null, ventanaH: 3 },
};
const FAMILIA: Record<TipoPoblador, keyof typeof FAMILIAS> = {
  agua: 'agua', cauce: 'agua', huaico: 'agua', via_bloq: 'agua',
  vivienda: 'danos', heridos: 'danos',
  atrapados: 'atrapados', // nunca se agrupa con otro tipo
  ayuda: 'ayuda', otro: 'otro',
};
export const familia = (t: TipoPoblador) => FAMILIA[t];

export function distanciaM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface Rep { id: string; type: string; note: string; lat: number; lon: number; ts: number; deviceId: string }

/** Vecinos distintos (incluido el autor) y cuántos de ellos marcaron foto, alrededor de este reporte. */
export function vecinosQueCoinciden(r: Rep, todos: Rep[]): { vecinos: number; fotos: number } {
  const d0 = deCodec(r);
  const fam = FAMILIAS[familia(d0.tipo)];
  const devs = new Set([r.deviceId]);
  const conFoto = new Set(d0.conFoto ? [r.deviceId] : []);
  if (fam.radioM === null) return { vecinos: 1, fotos: conFoto.size };
  for (const o of todos) {
    if (o.id === r.id) continue;
    const d = deCodec(o);
    if (familia(d.tipo) !== familia(d0.tipo)) continue;
    if (Math.abs(o.ts - r.ts) > fam.ventanaH * 3600) continue;
    if (distanciaM(r, o) > fam.radioM) continue;
    devs.add(o.deviceId);
    if (d.conFoto) conFoto.add(o.deviceId);
  }
  return { vecinos: devs.size, fotos: conFoto.size };
}
