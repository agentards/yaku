// Agrupación de reportes en incidentes (niveles 2 y 3) y respaldo 0–100. Lógica pura: sin base de datos ni red.
// Reglas: ./reglas.ts (decision-confianza.md §2.1–§3). Los reportes crudos nunca se borran: esto es una vista.
import { familiaDe, type Reglas } from './reglas.ts';

/** Fila de la tabla reports (mismas columnas que server/worker.ts). ts en s (celular); received_at en ms (servidor). */
export interface Rep {
  id: string; type: string; severity: number; lat: number; lon: number; note: string;
  ts: number; device_id: string; verified?: number; received_at: number;
}

export type Estado = 'nuevo' | 'en_revision' | 'validado' | 'descartado' | 'accion_asignada' | 'atendido';

/** Lo mínimo de un incidente para decidir a cuál va un reporte nuevo. */
export interface IncBase {
  id: string; familia: string; anclaLat: number; anclaLon: number;
  estado: Estado; miembros: Rep[];
}

export function metros(aLat: number, aLon: number, bLat: number, bLon: number) {
  const k = Math.PI / 180, dLat = (bLat - aLat) * k, dLon = (bLon - aLon) * k;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * k) * Math.cos(bLat * k) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Hora efectiva en ms: la del celular, salvo que venga más de N min en el futuro respecto a la llegada. */
export function horaMs(r: Pick<Rep, 'ts' | 'received_at'>, reglas: Reglas) {
  const t = r.ts * 1000;
  return Number.isFinite(r.received_at) && t > r.received_at + reglas.relojFuturoMaxMin * 60000 ? r.received_at : t;
}

/** Orden de proceso: por hora efectiva y luego id (determinista). */
export const porHora = (reglas: Reglas) => (a: Rep, b: Rep) => horaMs(a, reglas) - horaMs(b, reglas) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export interface Eleccion {
  /** Incidente existente al que se suma, o null = abrir uno nuevo. */
  id: string | null;
  motivo: 'nivel3' | 'auto' | 'nuevo';
  /** Si coincidía con un incidente ya atendido: se abre uno nuevo enlazado como «posible recurrencia». */
  recurrenciaDe: string | null;
}

function esNivel3(r: Rep, m: Rep, reglas: Reglas) {
  return m.device_id === r.device_id && m.type === r.type &&
    metros(r.lat, r.lon, m.lat, m.lon) <= reglas.nivel3.metros &&
    Math.abs(horaMs(r, reglas) - horaMs(m, reglas)) <= reglas.nivel3.minutos * 60000;
}

function enVentana(r: Rep, inc: IncBase, reglas: Reglas) {
  const f = reglas.familias[inc.familia];
  if (!f || !inc.miembros.length) return false;
  const t = horaMs(r, reglas), ts = inc.miembros.map((m) => horaMs(m, reglas)), v = f.ventanaH * 3.6e6;
  return t <= Math.max(...ts) + v && t >= Math.min(...ts) - v;
}

/**
 * Decide a qué incidente va un reporte (decision-confianza.md §3):
 * 1) nivel 3 (misma persona, mismo tipo, ≤ 50 m, ≤ 30 min) → ese incidente;
 * 2) incidentes no atendidos de su familia con el ancla a ≤ radio y dentro de la ventana; gana el ancla más
 *    cercana y, si empatan, el más reciente;
 * 3) si no, uno nuevo (enlazado si coincidía con uno atendido).
 */
export function elegirIncidente(r: Rep, incs: IncBase[], reglas: Reglas): Eleccion {
  const fam = familiaDe(r.type, reglas);
  let recurrenciaDe: string | null = null;
  for (const inc of incs) {
    if (!inc.miembros.some((m) => esNivel3(r, m, reglas))) continue;
    if (inc.estado === 'atendido') { recurrenciaDe ??= inc.id; continue; }
    return { id: inc.id, motivo: 'nivel3', recurrenciaDe: null };
  }
  const radio = reglas.familias[fam]?.radioM ?? null;
  if (radio !== null) {
    let mejor: IncBase | null = null, dMejor = Infinity, uMejor = -Infinity;
    for (const inc of incs) {
      if (inc.familia !== fam || !enVentana(r, inc, reglas)) continue;
      const d = metros(r.lat, r.lon, inc.anclaLat, inc.anclaLon);
      if (d > radio) continue;
      if (inc.estado === 'atendido') { recurrenciaDe ??= inc.id; continue; }
      const u = Math.max(...inc.miembros.map((m) => horaMs(m, reglas)));
      if (d < dMejor || (d === dMejor && u > uMejor)) { mejor = inc; dMejor = d; uMejor = u; }
    }
    if (mejor) return { id: mejor.id, motivo: 'auto', recurrenciaDe: null };
  }
  return { id: null, motivo: 'nuevo', recurrenciaDe };
}

/** De cada dispositivo vale su ÚLTIMO reporte (fija su severidad y su posición). */
export function ultimoPorPersona(miembros: Rep[], reglas: Reglas): Map<string, Rep> {
  const m = new Map<string, Rep>();
  for (const r of [...miembros].sort(porHora(reglas))) m.set(r.device_id, r);
  return m;
}

const tabla = (pts: number[], n: number) => (n <= 0 ? 0 : pts[Math.min(n, pts.length) - 1]);
const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

export interface Respaldo {
  total: number; nivel: 'N1' | 'N2' | 'N3';
  desglose: { personas: number; fotos: number; cercania: number; recencia: number };
  personas: number; personasConFoto: number; severidad: number; ultimo: number; medianaM: number | null;
}

/**
 * Respaldo 0–100 = round((Personas + Fotos + Cercanía) × Recencia). Tope por dispositivo: 1 persona y 1 foto.
 * La severidad NO suma (va a la prioridad). `devicesConFoto` = autores con al menos una foto RECIBIDA.
 */
export function respaldo(
  inc: { familia: string; anclaLat: number; anclaLon: number; miembros: Rep[] },
  devicesConFoto: Set<string>, ahora: number, reglas: Reglas,
): Respaldo {
  const ult = ultimoPorPersona(inc.miembros, reglas);
  const n = ult.size;
  const conFoto = [...ult.keys()].filter((d) => devicesConFoto.has(d)).length;
  const pPersonas = tabla(reglas.personasPts, n), pFotos = tabla(reglas.fotosPts, conFoto);
  const f = reglas.familias[inc.familia] ?? reglas.familias.otro;
  let pCerca = 0, med: number | null = null;
  if (n >= 2) {
    med = mediana([...ult.values()].map((r) => metros(r.lat, r.lon, inc.anclaLat, inc.anclaLon)));
    const radio = f?.radioM ?? reglas.nivel3.metros;
    for (const c of reglas.cercania) if (med <= (c.hastaM ?? radio)) { pCerca = c.pts; break; }
  }
  const ultimo = Math.max(...inc.miembros.map((m) => horaMs(m, reglas)));
  const h = Math.max(0, (ahora - ultimo) / 3.6e6);
  const rec = Math.max(reglas.recenciaPiso, 0.5 ** (h / (f?.mediaVidaH ?? 3)));
  const total = Math.max(0, Math.min(100, Math.round((pPersonas + pFotos + pCerca) * rec)));
  return {
    total, nivel: total >= reglas.niveles.n3 ? 'N3' : total >= reglas.niveles.n2 ? 'N2' : 'N1',
    desglose: { personas: pPersonas, fotos: pFotos, cercania: pCerca, recencia: Math.round(rec * 1000) / 1000 },
    personas: n, personasConFoto: conFoto,
    severidad: Math.max(1, ...[...ult.values()].map((r) => r.severity)),
    ultimo, medianaM: med === null ? null : Math.round(med),
  };
}

/** Tipo principal: el más grave según reglas.gravedad. */
export function tipoPrincipal(tipos: string[], reglas: Reglas) {
  const rango = (t: string) => { const k = reglas.gravedad.indexOf(t); return k < 0 ? reglas.gravedad.length : k; };
  return [...tipos].sort((a, b) => rango(a) - rango(b))[0] ?? 'otro';
}

/** Orden de la bandeja (§2.2): abiertos antes que cerrados; vida (atrapados > heridos); severidad; respaldo; reciente. */
export function compararPrioridad(reglas: Reglas) {
  const cerrado = (e: Estado) => (e === 'descartado' || e === 'atendido' ? 1 : 0);
  const vida = (t: string) => { const k = reglas.riesgoVida.indexOf(t); return k < 0 ? reglas.riesgoVida.length : k; };
  return (a: { id: string; estado: Estado; tipo: string; severidad: number; puntaje: number; ultimo_reporte: number },
    b: typeof a) =>
    cerrado(a.estado) - cerrado(b.estado) || vida(a.tipo) - vida(b.tipo) || b.severidad - a.severidad ||
    b.puntaje - a.puntaje || b.ultimo_reporte - a.ultimo_reporte || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
