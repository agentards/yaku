// Incidentes para la pantalla de la municipalidad: lectura tolerante de GET /api/incidentes, orden por prioridad,
// detección de incidentes nuevos y de coincidencias (otro vecino reporta lo mismo), flujo de estados y, si el
// servidor todavía no tiene /api/incidentes (producción actual), agrupación de /api/reports en esta pantalla.
// Lógica pura: sin DOM ni red. Contrato esperado: ./CONTRATO-API.md. Reglas: producto/decision-confianza.md.
import type { ReporteApi } from './deteccion';
import { ACCIONES, FAMILIAS, familiaDe, GRAVEDAD, nivelDe, respaldo, RIESGO_VIDA, type Accion, type Desglose, type Estado, type Nivel } from './textos';

export interface Cambio { estado: Estado; accion: Accion | null; motivo: string; quien: string; cuando: number }

export interface Incidente {
  id: string;
  /** Tipo principal (el más grave del grupo) y todos los tipos reportados. */
  tipo: string; tipos: string[];
  severidad: number; lat: number; lon: number;
  /** Personas distintas (device_id del autor) y reportes crudos del grupo. */
  personas: number; reportes: number;
  /** Ids de fotos recibidas (GET /api/fotos/:id), su conteo y las marcadas «tiene foto» que aún no suben. */
  fotos: string[]; nFotos: number; fotosPendientes: number;
  /** ms: primer y último reporte (reloj del celular), y última llegada al servidor (si la manda). */
  primer: number; ultimo: number; recibido: number | null;
  /** Respaldo 0–100 (§2.1), su nivel y desglose; congelado = fijado al validar (§2.3). */
  puntaje: number; nivel: Nivel; desglose: Desglose | null; congelado: boolean; puntajeOrigen: 'servidor' | 'pantalla';
  estado: Estado; accion: Accion | null; motivo: string; historial: Cambio[];
  reportIds: string[]; notas: string[];
  /** §2.3: reportes que llegaron después de descartar, y enlace a un incidente atendido (posible recurrencia). */
  nuevosTrasDescarte: number; recurrenciaDe: string | null;
}

// ---------- lectura tolerante ----------
const num = (...v: unknown[]) => { for (const x of v) { const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x; if (typeof n === 'number' && Number.isFinite(n)) return n; } return NaN; };
/** Acepta segundos o milisegundos (el celular manda s; el servidor, ms) y también ISO 8601. */
export const aMs = (v: unknown) => {
  if (typeof v === 'string' && !/^\d+(\.\d+)?$/.test(v.trim())) { const t = Date.parse(v); return Number.isFinite(t) ? t : NaN; }
  const n = num(v);
  return Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : NaN;
};
const ESTADO_ALIAS: Record<string, Estado> = {
  nuevo: 'nuevo', new: 'nuevo', en_revision: 'en_revision', revision: 'en_revision', 'en revisión': 'en_revision', 'en revision': 'en_revision',
  validado: 'validado', descartado: 'descartado', accion: 'accion_asignada', accion_asignada: 'accion_asignada', asignado: 'accion_asignada', atendido: 'atendido',
};
export const leerEstado = (v: unknown): Estado => ESTADO_ALIAS[String(v ?? '').toLowerCase().trim()] ?? 'nuevo';
const leerAccion = (v: unknown): Accion | null => { const k = String(v ?? '').toLowerCase().trim(); return k in ACCIONES ? (k as Accion) : k === 'evaluacion_edan' ? 'edan' : null; };
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? (x as any).id : '')).filter((x): x is string => typeof x === 'string' && x.length > 0) : []);
const NIVELES_OK = ['N1', 'N2', 'N3'];

function leerCambio(c: any): Cambio | null {
  if (!c || typeof c !== 'object') return null;
  return { estado: leerEstado(c.estado), accion: leerAccion(c.accion), motivo: String(c.motivo ?? ''), quien: String(c.quien ?? c.por ?? ''), cuando: aMs(c.cuando ?? c.ts ?? c.at) };
}
function leerDesglose(d: any): Desglose | null {
  if (!d || typeof d !== 'object') return null;
  const [p, f, c, r] = [num(d.personas), num(d.fotos), num(d.cercania), num(d.recencia)];
  return [p, f, c, r].every(Number.isFinite) ? { personas: p, fotos: f, cercania: c, recencia: r } : null;
}

/** Normaliza un incidente del servidor; null si no tiene id o coordenadas válidas. */
export function leerIncidente(x: any, ahora = Date.now()): Incidente | null {
  if (!x || typeof x !== 'object') return null;
  const id = String(x.id ?? '');
  const lat = num(x.lat), lon = num(x.lon ?? x.lng);
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const tipos = Array.isArray(x.tipos) ? x.tipos.map(String) : [];
  const tipo = String(x.tipo ?? x.type ?? tipos[0] ?? 'otro');
  const fotos = ids(x.fotos ?? x.foto_ids ?? x.fotoIds);
  const reportIds = ids(x.reportes_ids ?? x.report_ids ?? x.reportIds ?? (Array.isArray(x.reportes) ? x.reportes : null));
  const personas = Math.max(1, Math.round(num(x.personas, x.personas_distintas, x.dispositivos, x.devices, 1)));
  const reportes = Math.max(personas, Math.round(num(x.n_reportes, x.reportes_n, typeof x.reportes === 'number' ? x.reportes : NaN, reportIds.length || NaN, personas)));
  const nFotos = Math.max(fotos.length, Math.round(num(x.n_fotos, x.fotos_n, typeof x.fotos === 'number' ? x.fotos : NaN, 0)));
  const primer = aMs(x.primer_reporte ?? x.primer_ts ?? x.primer ?? x.first_ts);
  const ultimo = aMs(x.ultimo_reporte ?? x.ultimo_ts ?? x.ultimo ?? x.last_ts);
  const recibido = aMs(x.recibido ?? x.received_at ?? x.ultimo_recibido);
  const severidad = Math.max(1, Math.min(3, Math.round(num(x.severidad, x.severity, x.severidad_max, 1))));
  const historial = (Array.isArray(x.historial) ? x.historial : []).map(leerCambio).filter((c: Cambio | null): c is Cambio => !!c);
  const sp = num(x.respaldo, x.puntaje, x.confianza, x.score);
  const p = Number.isFinite(primer) ? primer : Number.isFinite(ultimo) ? ultimo : ahora;
  const u = Number.isFinite(ultimo) ? ultimo : p;
  // Sin respaldo del servidor: aproximación con lo que trae (sin cercanía, que necesita las posiciones).
  const fam = FAMILIAS[familiaDe(tipo)];
  const calc = Number.isFinite(sp) ? null : respaldo({ personas, personasConFoto: Math.round(num(x.personas_con_foto, nFotos)), medianaM: num(x.mediana_m) >= 0 ? num(x.mediana_m) : null, radioM: fam.radioM, horas: (ahora - u) / 3.6e6, mediaVidaH: fam.mediaVidaH });
  const puntaje = calc ? calc.total : Math.max(0, Math.min(100, Math.round(sp)));
  return {
    id, tipo, tipos: tipos.length ? tipos : [tipo], severidad, lat, lon, personas, reportes, fotos, nFotos,
    fotosPendientes: Math.max(0, Math.round(num(x.fotos_pendientes, x.n_fotos_pendientes, 0))),
    primer: p, ultimo: u, recibido: Number.isFinite(recibido) ? recibido : null,
    puntaje, nivel: NIVELES_OK.includes(x.nivel) ? x.nivel : nivelDe(puntaje), desglose: calc ? calc.desglose : leerDesglose(x.desglose),
    congelado: x.respaldo_congelado === true, puntajeOrigen: calc ? 'pantalla' : 'servidor',
    estado: leerEstado(x.estado), accion: leerAccion(x.accion), motivo: String(x.motivo ?? ''), historial,
    reportIds, notas: (Array.isArray(x.notas) ? x.notas : []).map(String).filter((s: string) => s.trim()),
    nuevosTrasDescarte: Math.max(0, Math.round(num(x.nuevos_tras_descarte, 0))), recurrenciaDe: typeof x.recurrencia_de === 'string' && x.recurrencia_de ? x.recurrencia_de : null,
  };
}

/** Lee el cuerpo de /api/incidentes ({ incidentes: [...] } o un arreglo); null si no tiene esa forma. */
export function leerIncidentes(body: unknown, ahora = Date.now()): Incidente[] | null {
  const lista = Array.isArray(body) ? body : (body as any)?.incidentes;
  if (!Array.isArray(lista)) return null;
  return lista.map((x) => leerIncidente(x, ahora)).filter((x): x is Incidente => !!x);
}

// ---------- prioridad (§2.2: vida > severidad > respaldo > lo más reciente; cerrados al final) ----------
export const cerrado = (i: Incidente) => i.estado === 'descartado' || i.estado === 'atendido';
const rangoVida = (t: string) => { const k = RIESGO_VIDA.indexOf(t); return k < 0 ? RIESGO_VIDA.length : k; };
export const porPrioridad = (a: Incidente, b: Incidente) =>
  Number(cerrado(a)) - Number(cerrado(b)) || rangoVida(a.tipo) - rangoVida(b.tipo) || b.severidad - a.severidad ||
  b.puntaje - a.puntaje || b.ultimo - a.ultimo || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// ---------- contador ----------
/** Hora de Lima (la pantalla está en el Perú; no depende de la zona del equipo). */
export const hhmm = (ms: number, seg = false) => new Date(ms).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima', ...(seg ? { second: '2-digit' } : {}) });
export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
/** «4 vecinos · 2 fotos · primer reporte 21:03» */
export const contadorTxt = (i: Incidente) => `${plural(i.personas, 'vecino', 'vecinos')} · ${plural(i.nFotos, 'foto', 'fotos')} · primer reporte ${hhmm(i.primer)}`;

// ---------- nuevos y coincidencias ----------
export interface Coincidencia { inc: Incidente; personasAntes: number; fotosAntes: number }
export class DetectorIncidentes {
  private personas = new Map<string, number>();
  private fotos = new Map<string, number>();
  /** reporte → incidente que lo contenía: si el servidor re-agrupa (cambia el id) no es un incidente nuevo. */
  private deReporte = new Map<string, string>();
  private corte = -Infinity;
  sembrado = false;
  previos = 0;

  procesar(lista: Incidente[]): { nuevos: Incidente[]; coinciden: Coincidencia[] } {
    const nuevos: Incidente[] = [], coinciden: Coincidencia[] = [];
    const sembrando = !this.sembrado;
    for (const i of lista) {
      let antes = this.personas.get(i.id), fAntes = this.fotos.get(i.id);
      if (antes === undefined) {
        const previos = i.reportIds.map((r) => this.deReporte.get(r)).filter((x): x is string => !!x);
        if (previos.length) { antes = Math.max(...previos.map((p) => this.personas.get(p) ?? 0)); fAntes = Math.max(...previos.map((p) => this.fotos.get(p) ?? 0)); }
      }
      if (sembrando) { if (i.recibido !== null) this.corte = Math.max(this.corte, i.recibido); }
      else if (antes === undefined) { if (i.recibido === null || i.recibido >= this.corte) nuevos.push(i); }
      else if (i.personas > antes || i.nFotos > (fAntes ?? 0)) coinciden.push({ inc: i, personasAntes: antes, fotosAntes: fAntes ?? 0 });
      this.personas.set(i.id, Math.max(i.personas, antes ?? 0));
      this.fotos.set(i.id, Math.max(i.nFotos, fAntes ?? 0));
      for (const r of i.reportIds) this.deReporte.set(r, i.id);
    }
    if (sembrando) { this.sembrado = true; this.previos = lista.length; }
    return { nuevos: nuevos.sort(porPrioridad), coinciden };
  }
}

// ---------- flujo de estados (§2.3, igual que servidor-local/estados.ts) ----------
const SIGUIENTES: Record<Estado, Estado[]> = {
  nuevo: ['en_revision'],
  en_revision: ['validado', 'descartado'],
  validado: ['accion_asignada', 'descartado'],
  accion_asignada: ['accion_asignada', 'atendido'],
  descartado: ['en_revision'],
  atendido: [],
};
export const siguientes = (e: Estado) => SIGUIENTES[e];

/** Pasos para llegar a `destino` respetando el flujo (p. ej. nuevo → validado = [en_revision, validado]). */
export function pasosHasta(desde: Estado, destino: Estado): Estado[] | null {
  if (desde === destino) return SIGUIENTES[desde].includes(destino) ? [destino] : null;
  const previo = new Map<Estado, Estado>([[desde, desde]]);
  const cola: Estado[] = [desde];
  while (cola.length) {
    const e = cola.shift()!;
    for (const s of SIGUIENTES[e]) {
      if (previo.has(s)) continue;
      previo.set(s, e);
      if (s === destino) {
        const camino: Estado[] = [s];
        for (let p = e; p !== desde; p = previo.get(p)!) camino.unshift(p);
        return camino;
      }
      cola.push(s);
    }
  }
  return null;
}

// ---------- agrupación en pantalla (solo si el servidor no tiene /api/incidentes) ----------
// decision-confianza.md §3: familia + radio al ANCLA (primer reporte, sin encadenar) + ventana desde el último
// reporte; nivel 3 = misma persona. El servidor (servidor-local/) es la fuente cuando existe. Es solo una vista.
export function metros(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

type Rep = ReporteApi & { foto_id?: string; foto?: string; fotos?: unknown; tiene_foto?: boolean | number };
const fotoDe = (r: Rep) => [...ids(r.fotos), ...(typeof r.foto_id === 'string' && r.foto_id ? [r.foto_id] : typeof r.foto === 'string' && r.foto ? [r.foto] : [])];
const NIVEL3 = { metros: 50, ms: 30 * 60000 };
/** Hora del reporte: la del celular, salvo que venga > 10 min en el futuro respecto a la llegada (§2.1). */
const horaDe = (r: Rep) => { const t = Number.isFinite(r.ts) && r.ts > 0 ? aMs(r.ts) : r.received_at; return t > r.received_at + 10 * 60000 ? r.received_at : t; };
const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

export function agrupar(reportes: ReporteApi[], ahora = Date.now()): Incidente[] {
  const orden = ([...reportes] as Rep[]).sort((a, b) => horaDe(a) - horaDe(b) || (a.id < b.id ? -1 : 1));
  const grupos: { fam: string; ancla: Rep; miembros: Rep[]; ultimo: number }[] = [];
  const dev = (r: Rep, k: number) => r.device_id || 'sin-id-' + k;
  orden.forEach((r, k) => {
    const famK = familiaDe(r.type), fam = FAMILIAS[famK], t = horaDe(r);
    let mejor: (typeof grupos)[number] | null = null, dMejor = Infinity;
    for (const g of grupos) {
      if (g.fam !== famK || t - g.ultimo > fam.ventanaH * 3.6e6) continue;
      const d = metros(r.lat, r.lon, g.ancla.lat, g.ancla.lon);
      // «otro» no agrupa entre personas: solo la misma persona (nivel 3).
      const ok = fam.radioM === null
        ? g.miembros.some((m) => m.device_id && m.device_id === r.device_id && m.type === r.type && metros(r.lat, r.lon, m.lat, m.lon) <= NIVEL3.metros && t - horaDe(m) <= NIVEL3.ms)
        : d <= fam.radioM;
      if (ok && (d < dMejor || (d === dMejor && mejor && g.ultimo > mejor.ultimo))) { mejor = g; dMejor = d; }
    }
    if (mejor) { mejor.miembros.push({ ...r, device_id: dev(r, k) }); mejor.ultimo = Math.max(mejor.ultimo, t); }
    else grupos.push({ fam: famK, ancla: r, miembros: [{ ...r, device_id: dev(r, k) }], ultimo: t });
  });
  return grupos.map(({ fam: famK, ancla, miembros, ultimo }) => {
    const fam = FAMILIAS[famK];
    // De cada dispositivo vale su ÚLTIMO reporte (fija severidad y posición): tope 1 persona y 1 foto.
    const ultimoDe = new Map<string, Rep>();
    for (const m of miembros) ultimoDe.set(m.device_id!, m);
    const porDev = [...ultimoDe.values()];
    const fotos = [...new Set(miembros.flatMap(fotoDe))];
    const conFoto = new Set(miembros.filter((m) => fotoDe(m).length).map((m) => m.device_id));
    const pendientes = miembros.filter((m) => (m.tiene_foto === true || m.tiene_foto === 1) && !fotoDe(m).length).length;
    const tipos = [...new Set(miembros.map((m) => m.type))];
    const grav = (t: string) => { const g = GRAVEDAD.indexOf(t); return g < 0 ? GRAVEDAD.length : g; };
    const tipo = [...tipos].sort((a, b) => grav(a) - grav(b))[0];
    const medianaM = porDev.length >= 2 ? mediana(porDev.map((m) => metros(m.lat, m.lon, ancla.lat, ancla.lon))) : null;
    const r = respaldo({ personas: porDev.length, personasConFoto: conFoto.size, medianaM, radioM: fam.radioM, horas: (ahora - ultimo) / 3.6e6, mediaVidaH: fam.mediaVidaH });
    return {
      id: 'inc-' + ancla.id, tipo, tipos, severidad: Math.max(...porDev.map((m) => m.severity || 1)),
      lat: ancla.lat, lon: ancla.lon, personas: porDev.length, reportes: miembros.length,
      fotos, nFotos: fotos.length, fotosPendientes: pendientes,
      primer: horaDe(ancla), ultimo, recibido: Math.max(...miembros.map((m) => m.received_at)),
      puntaje: r.total, nivel: nivelDe(r.total), desglose: r.desglose, congelado: false, puntajeOrigen: 'pantalla' as const,
      estado: 'nuevo' as const, accion: null, motivo: '', historial: [],
      reportIds: miembros.map((m) => m.id), notas: miembros.map((m) => (m.note ?? '').trim()).filter(Boolean),
      nuevosTrasDescarte: 0, recurrenciaDe: null,
    };
  });
}
