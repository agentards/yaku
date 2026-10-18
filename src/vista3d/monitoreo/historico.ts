// Histórico REAL del Centro de monitoreo (lógica pura, sin DOM ni red): a partir de GET /api/reports (cada reporte con
// su received_at del servidor) y GET /api/incidentes (agrupados, con historial de estados quién/cuándo) arma el rango de
// la línea de tiempo, el estado de cada incidente en cualquier instante, las series de los gráficos y los eventos.
// Nada simulado: si el servidor no tiene datos, la línea va de ahora−24 h a ahora y queda vacía.
import type { ReporteApi } from '../municipalidad/deteccion';
import { cerrado, type Cambio, type Incidente } from '../municipalidad/incidentes';
import type { Accion, Estado } from '../municipalidad/textos';
import { distKm, type Ficha, type Punto } from '../ui/datos';

export const H = 3600_000;
const MIN = 60_000;

/** Rango: del primer reporte recibido (con un margen) —o ahora−24 h si no hay— hasta ahora. Mínimo 10 min. */
export function rangoHistorico(instantes: number[], ahora: number): [number, number] {
  const xs = instantes.filter(Number.isFinite);
  const b = Math.max(ahora, ...xs);
  if (!xs.length) return [b - 24 * H, b];
  const p = Math.min(...xs);
  const margen = Math.max(MIN, (b - p) * 0.04);
  const a = Math.floor((p - margen) / MIN) * MIN;
  return [Math.min(a, b - 10 * MIN), b];
}

/** Reporte del servidor → Ficha de la UI 3D. ts = llegada al servidor (lo que el monitoreo supo y cuándo). */
export const fichaDeReporte = (r: ReporteApi): Ficha => ({
  id: r.id, type: r.type as Ficha['type'], severity: r.severity, lat: r.lat, lon: r.lon, note: r.note ?? '',
  ts: r.received_at, synced: true, syncedAt: r.received_at, source: 'servidor',
});

// ---------- incidentes en el tiempo ----------
export interface IncHist {
  inc: Incidente;
  /** Primera llegada al servidor de uno de sus reportes (o, si el reporte no vino en /api/reports, su primer reporte). */
  aparece: number;
  llegadas: { t: number; dev: string }[];
  historial: Cambio[];
}

export function indexar(incs: Incidente[], reps: ReporteApi[]): IncHist[] {
  const porId = new Map(reps.map((r) => [r.id, r]));
  return incs.map((inc) => {
    const llegadas = inc.reportIds.map((id) => porId.get(id)).filter((r): r is ReporteApi => !!r)
      .map((r) => ({ t: r.received_at, dev: r.device_id || r.id })).sort((x, y) => x.t - y.t);
    const aparece = llegadas[0]?.t ?? inc.recibido ?? inc.primer;
    const historial = inc.historial.filter((c) => Number.isFinite(c.cuando)).sort((x, y) => x.cuando - y.cuando);
    return { inc, aparece: Math.min(aparece, historial[0]?.cuando ?? Infinity), llegadas, historial };
  });
}

/** Estado (y acción) vigente en t según el historial; 'nuevo' antes del primer cambio. */
export function estadoEn(h: Pick<IncHist, 'historial'>, t: number): { estado: Estado; accion: Accion | null } {
  let estado: Estado = 'nuevo', accion: Accion | null = null;
  for (const c of h.historial) {
    if (c.cuando > t) break;
    estado = c.estado;
    if (c.estado === 'accion_asignada') accion = c.accion; else if (c.estado !== 'atendido') accion = null;
  }
  return { estado, accion };
}

/** El incidente tal como se veía en t (null si aún no existía). En vivo devuelve el del servidor sin tocar. */
export function incidenteEn(h: IncHist, t: number, enVivo = false): Incidente | null {
  if (enVivo) return h.inc;
  if (h.aparece > t) return null;
  const { estado, accion } = estadoEn(h, t);
  const lleg = h.llegadas.filter((l) => l.t <= t);
  const personas = h.llegadas.length ? Math.max(1, new Set(lleg.map((l) => l.dev)).size) : h.inc.personas;
  const congelado = h.inc.congelado && (estado === 'validado' || estado === 'accion_asignada' || estado === 'atendido');
  return { ...h.inc, estado, accion, congelado, personas, reportes: h.llegadas.length ? Math.max(1, lleg.length) : h.inc.reportes, historial: h.historial.filter((c) => c.cuando <= t) };
}

export function contadores(lista: Incidente[]) {
  const abiertos = lista.filter((i) => !cerrado(i));
  return { abiertos: abiertos.length, personas: abiertos.reduce((s, i) => s + i.personas, 0), sinRevisar: abiertos.filter((i) => i.estado === 'nuevo').length, total: lista.length };
}

// ---------- series de los gráficos ----------
export const GRUPOS = ['nuevo', 'revision', 'municipal', 'cerrado'] as const;
export type Grupo = (typeof GRUPOS)[number];
export const GRUPO_TXT: Record<Grupo, string> = { nuevo: 'Sin revisar', revision: 'En revisión', municipal: 'Validado o con acción', cerrado: 'Atendido o descartado' };
export const grupoDe = (e: Estado): Grupo => (e === 'nuevo' ? 'nuevo' : e === 'en_revision' ? 'revision' : e === 'descartado' || e === 'atendido' ? 'cerrado' : 'municipal');

/** Escalones «incidentes por estado» entre a y b (cambian al aparecer un incidente y en cada cambio de estado). */
export function seriesPorEstado(hs: IncHist[], a: number, b: number): Record<Grupo, Punto[]> {
  const ts = new Set<number>([a, b]);
  for (const h of hs) { if (h.aparece > a && h.aparece < b) ts.add(h.aparece); for (const c of h.historial) if (c.cuando > a && c.cuando < b) ts.add(c.cuando); }
  const out = Object.fromEntries(GRUPOS.map((g) => [g, [] as Punto[]])) as Record<Grupo, Punto[]>;
  for (const t of [...ts].sort((x, y) => x - y)) {
    const n: Record<Grupo, number> = { nuevo: 0, revision: 0, municipal: 0, cerrado: 0 };
    for (const h of hs) if (h.aparece <= t) n[grupoDe(estadoEn(h, t).estado)]++;
    for (const g of GRUPOS) out[g].push([t, n[g]]);
  }
  return out;
}

/** Reportes recibidos y vecinos distintos (device_id), acumulados entre a y b. */
export function seriesReportes(reps: ReporteApi[], a: number, b: number) {
  const orden = [...reps].sort((x, y) => x.received_at - y.received_at);
  const devs = new Set<string>();
  let n = 0;
  const reportes: Punto[] = [], vecinos: Punto[] = [];
  for (const r of orden) { if (r.received_at > a) break; n++; devs.add(r.device_id || r.id); }
  reportes.push([a, n]); vecinos.push([a, devs.size]);
  for (const r of orden) {
    if (r.received_at <= a || r.received_at > b) continue;
    n++; devs.add(r.device_id || r.id);
    reportes.push([r.received_at, n]); vecinos.push([r.received_at, devs.size]);
  }
  reportes.push([b, n]); vecinos.push([b, devs.size]);
  return { reportes, vecinos };
}

// ---------- eventos de la línea de tiempo ----------
export interface EventoMon { t: number; tipo: 'reporte' | 'estado'; obs?: string; estado?: Estado; incId?: string; repId?: string }
export function eventosHistorico(reps: ReporteApi[], hs: IncHist[]): EventoMon[] {
  const deRep = new Map<string, string>();
  for (const h of hs) for (const id of h.inc.reportIds) deRep.set(id, h.inc.id);
  const ev: EventoMon[] = reps.map((r) => ({ t: r.received_at, tipo: 'reporte' as const, obs: r.type, repId: r.id, incId: deRep.get(r.id) }));
  for (const h of hs) for (const c of h.historial) ev.push({ t: c.cuando, tipo: 'estado', estado: c.estado, incId: h.inc.id });
  return ev.sort((x, y) => x.t - y.t);
}

/** Paso de las marcas de la línea (en horas) para que entren ~10. */
export function pasoMarcas(a: number, b: number, max = 10) {
  const span = (b - a) / H;
  for (const p of [5 / 60, 10 / 60, 0.25, 0.5, 1, 2, 3, 6, 12, 24, 48]) if (span / p <= max) return p;
  return 24 * 7;
}

/** Incidentes a ≤ km de un punto (centro poblado), más cercano primero. */
export function incidentesCerca(p: { lat: number; lon: number }, lista: Incidente[], km = 3) {
  return lista.map((i) => ({ i, d: distKm(p, i) })).filter((x) => x.d <= km).sort((x, y) => x.d - y.d);
}

/** Centro poblado más cercano (≤ km) para cada incidente: id → cod. */
export function centroDeIncidentes(lista: Incidente[], centros: { cod: string; lat: number; lon: number }[], km = 3) {
  const out = new Map<string, string>();
  for (const i of lista) {
    let best = '', bd = Infinity;
    for (const c of centros) {
      if (Math.abs(c.lat - i.lat) > 0.06 || Math.abs(c.lon - i.lon) > 0.06) continue;
      const d = distKm(i, c);
      if (d < bd) { bd = d; best = c.cod; }
    }
    if (best && bd <= km) out.set(i.id, best);
  }
  return out;
}
