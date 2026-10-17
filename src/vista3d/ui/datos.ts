// Datos de la vista 3D: centros poblados del escenario CENEPRED, fichas (registros NO VERIFICADOS) y
// las series que alimentan la línea de tiempo. Funciones puras (testeables en Node) salvo los cargadores.
import type { CentroPoblado } from './contrato';
import { OBS_TYPES, type ObsType } from '../../codec';

export const NIVELES = ['Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto'] as const;
export const nivelTxt = (r: number) => NIVELES[r - 1] ?? 's/d';

export interface ResumenEscenario { total: number; ubicados: number; sinUbicar: number; conDatoOsiptel: number; sinCoberturaGarantizada: number; sinDatoOsiptel: number }

/** Ficha tal como la usa la vista 3D (deriva de StoredObs o del modo demo SIMULADO). */
export interface Ficha {
  id: string; type: ObsType; severity: number; lat: number; lon: number; note: string;
  /** Creación en el teléfono (ms). */
  ts: number;
  synced: boolean;
  /** Consolidación en el servidor (ms), si ocurrió. */
  syncedAt?: number;
  source: string;
  simulado?: boolean;
  /** Relevo: cada salto de teléfono a teléfono (ms y etiqueta del teléfono). Solo en modo demo. */
  saltos?: { t: number; de: string; a: string }[];
}

type CcppProps = Omit<CentroPoblado, 'lon' | 'lat'>;
export function parseCentros(fc: { features: { geometry: { coordinates: number[] }; properties: CcppProps }[] }): CentroPoblado[] {
  return fc.features.map((f) => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
}
export async function cargarCentros(url = 'data/cenepred-ccpp.geojson') {
  return parseCentros(await (await fetch(url)).json());
}
export async function cargarResumen(url = 'data/cenepred-sin-ubicar.json'): Promise<ResumenEscenario | null> {
  try { const { filas: _f, ...r } = await (await fetch(url)).json(); return r as ResumenEscenario; } catch { return null; }
}

/** Convierte un registro de IndexedDB (ts en segundos) a Ficha. */
export function desdeStored(r: { id: string; type: ObsType; severity: number; lat: number; lon: number; note: string; ts: number; synced: boolean; syncedAt?: number; source: string }): Ficha {
  return { id: r.id, type: r.type, severity: r.severity, lat: r.lat, lon: r.lon, note: r.note, ts: r.ts * 1000, synced: r.synced, syncedAt: r.syncedAt, source: r.source };
}

// ---------- asociación ficha → centro poblado ----------
const R_TIERRA = 6371;
export function distKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TIERRA * Math.asin(Math.sqrt(h));
}
/** Radio de asociación por cercanía: la ficha aún no lleva el código del centro poblado (llega con er1). */
export const RADIO_ASOCIACION_KM = 1.5;
/** ficha.id → cod del centro poblado más cercano dentro del radio (o ausente). */
export function asociar(fichas: Ficha[], centros: CentroPoblado[], radioKm = RADIO_ASOCIACION_KM): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of fichas) {
    let best: CentroPoblado | null = null, bd = Infinity;
    for (const c of centros) {
      if (Math.abs(c.lat - f.lat) > 0.05 || Math.abs(c.lon - f.lon) > 0.05) continue; // ~5,5 km: descarte rápido
      const d = distKm(f, c);
      if (d < bd) { bd = d; best = c; }
    }
    if (best && bd <= radioKm) out.set(f.id, best.cod);
  }
  return out;
}
/** Centros poblados con al menos una ficha creada hasta el instante t. */
export function centrosConFicha(fichas: Ficha[], asoc: Map<string, string>, t: number): Set<string> {
  const s = new Set<string>();
  for (const f of fichas) if (f.ts <= t && asoc.has(f.id)) s.add(asoc.get(f.id)!);
  return s;
}
export function fichasDe(cod: string, fichas: Ficha[], asoc: Map<string, string>, t = Infinity) {
  return fichas.filter((f) => f.ts <= t && asoc.get(f.id) === cod);
}

// ---------- series para la línea de tiempo ----------
export type Punto = [t: number, v: number];
/** Escalones de «centros poblados sin ficha de evaluación» (sobre los ubicados) entre a y b. */
export function serieSinFicha(fichas: Ficha[], asoc: Map<string, string>, ubicados: number, a: number, b: number): Punto[] {
  const primeras = new Map<string, number>();
  for (const f of fichas) {
    const cod = asoc.get(f.id);
    if (cod !== undefined && (primeras.get(cod) ?? Infinity) > f.ts) primeras.set(cod, f.ts);
  }
  const ts = [...primeras.values()].sort((x, y) => x - y);
  const out: Punto[] = [[a, ubicados - ts.filter((t) => t <= a).length]];
  let n = out[0][1];
  for (const t of ts) if (t > a && t <= b) out.push([t, --n]);
  out.push([b, n]);
  return out;
}
export function estadoEn(f: Ficha, t: number): 'relevo' | 'consolidado' | null {
  if (f.ts > t) return null;
  return f.synced && f.syncedAt !== undefined && f.syncedAt <= t ? 'consolidado' : 'relevo';
}
export function fichasPorEstado(fichas: Ficha[], t: number) {
  let relevo = 0, consolidado = 0;
  for (const f of fichas) { const e = estadoEn(f, t); if (e === 'relevo') relevo++; else if (e === 'consolidado') consolidado++; }
  return { relevo, consolidado };
}
/** Escalones de fichas en relevo y consolidadas entre a y b (cambian en cada creación y cada consolidación). */
export function seriesEstado(fichas: Ficha[], a: number, b: number) {
  const ts = new Set<number>([a, b]);
  for (const f of fichas) { if (f.ts > a && f.ts < b) ts.add(f.ts); if (f.syncedAt && f.syncedAt > a && f.syncedAt < b) ts.add(f.syncedAt); }
  const xs = [...ts].sort((x, y) => x - y);
  const relevo: Punto[] = [], consolidado: Punto[] = [];
  for (const t of xs) { const e = fichasPorEstado(fichas, t); relevo.push([t, e.relevo]); consolidado.push([t, e.consolidado]); }
  return { relevo, consolidado };
}
/** Cobertura OSIPTEL por nivel de exposición, separando los que ya tienen ficha en t. */
export function coberturaPorNivel(centros: CentroPoblado[], conFicha: Set<string>) {
  return NIVELES.map((niv, i) => {
    const r = i + 1;
    const del = centros.filter((c) => c.r === r);
    return {
      r, niv,
      sinCob: del.filter((c) => c.cg === false).length,
      sinCobConFicha: del.filter((c) => c.cg === false && conFicha.has(c.cod)).length,
      conCob: del.filter((c) => c.cg === true).length,
      sinDato: del.filter((c) => c.cg === null).length,
    };
  });
}

// ---------- modo demo SIMULADO ----------
/** PRNG determinista (mulberry32): el demo se ve igual en cada ensayo. */
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const TELEFONOS = ['Tel. A', 'Tel. B', 'Tel. C', 'Tel. D'];
/** Fichas SIMULADAS sobre centros poblados sin cobertura garantizada, con saltos de relevo por QR.
 * Nunca se guardan en IndexedDB ni se envían al servidor. */
export function fichasSimuladas(centros: CentroPoblado[], a: number, b: number, n = 14, seed = 421): Ficha[] {
  const rnd = rng(seed);
  const cand = centros.filter((c) => c.cg === false).sort((x, y) => y.r - x.r || y.pob - x.pob).slice(0, Math.max(n * 3, 40));
  const out: Ficha[] = [];
  const span = b - a;
  for (let i = 0; i < n && cand.length; i++) {
    const c = cand.splice(Math.floor(rnd() * Math.min(cand.length, 12)), 1)[0];
    const ts = a + span * (0.08 + 0.6 * (i / n) + 0.05 * rnd());
    const nSaltos = 1 + Math.floor(rnd() * 3);
    let t = ts, de = TELEFONOS[0];
    const saltos: Ficha['saltos'] = [];
    for (let k = 0; k < nSaltos; k++) { t += 3600_000 * (0.5 + 2.5 * rnd()); const a2 = TELEFONOS[k + 1]; saltos.push({ t, de, a: a2 }); de = a2; }
    const consolidada = rnd() < 0.6;
    const syncedAt = consolidada ? t + 3600_000 * (0.5 + 2 * rnd()) : undefined;
    out.push({
      id: `sim-${seed}-${i}`, type: OBS_TYPES[Math.floor(rnd() * 4)], severity: 1 + Math.floor(rnd() * 3),
      lat: +(c.lat + (rnd() - 0.5) * 0.004).toFixed(5), lon: +(c.lon + (rnd() - 0.5) * 0.004).toFixed(5),
      note: 'SIMULADO · ficha de ensayo', ts, synced: syncedAt !== undefined && syncedAt <= b, syncedAt: syncedAt !== undefined && syncedAt <= b ? syncedAt : undefined,
      source: 'qr', simulado: true, saltos,
    });
  }
  return out.sort((x, y) => x.ts - y.ts);
}
