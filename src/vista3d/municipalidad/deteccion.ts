// Detección de reportes nuevos para la pantalla de la municipalidad (?vista=municipalidad).
// Lógica pura (sin DOM ni red): la pantalla le pasa cada respuesta de GET /api/reports y recibe solo
// los reportes que llegaron después de abrirla. La primera respuesta válida solo «siembra»: lo que ya
// existía no se anima.

/** Fila de GET /api/reports (server/worker.ts). received_at en ms (reloj del servidor); ts en s (del celular). */
export interface ReporteApi {
  id: string; type: string; severity: number; lat: number; lon: number; note: string;
  ts: number; device_id?: string; verified?: number; received_at: number;
}

const valido = (r: any): r is ReporteApi =>
  !!r && typeof r.id === 'string' && r.id.length > 0 &&
  Number.isFinite(r.lat) && Number.isFinite(r.lon) && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180 &&
  Number.isFinite(r.received_at);

/** Más nuevo primero (received_at; a igual hora, por id para que el orden sea estable). */
export const masNuevoPrimero = (a: ReporteApi, b: ReporteApi) => b.received_at - a.received_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Lee el cuerpo de /api/reports; devuelve null si no tiene la forma esperada (no se siembra con basura). */
export function leerRespuesta(body: unknown): ReporteApi[] | null {
  const lista = (body as any)?.reports;
  return Array.isArray(lista) ? lista.filter(valido) : null;
}

export class DetectorNuevos {
  private vistos = new Set<string>();
  /** received_at más alto al sembrar: un id desconocido pero más viejo que esto no es «nuevo». */
  private corte = -Infinity;
  sembrado = false;
  /** Cuántos reportes había al abrir la pantalla (se ignoran). */
  previos = 0;

  /** Procesa una respuesta. Devuelve los reportes nuevos (más nuevo primero); la primera llamada devuelve []. */
  procesar(lista: ReporteApi[]): ReporteApi[] {
    const ok = lista.filter(valido);
    if (!this.sembrado) {
      this.sembrado = true;
      this.previos = ok.length;
      for (const r of ok) { this.vistos.add(r.id); this.corte = Math.max(this.corte, r.received_at); }
      return [];
    }
    const nuevos: ReporteApi[] = [];
    for (const r of ok) {
      if (this.vistos.has(r.id)) continue;
      this.vistos.add(r.id);
      if (r.received_at >= this.corte) nuevos.push(r);
    }
    return nuevos.sort(masNuevoPrimero);
  }
}

/** «llegó hace N s» / «hace N min» desde received_at. Un reloj del servidor adelantado no da negativos. */
export function llegoHace(receivedAt: number, ahora = Date.now()) {
  const s = Math.max(0, Math.round((ahora - receivedAt) / 1000));
  if (s < 60) return `llegó hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `llegó hace ${m} min`;
  return `llegó hace ${Math.floor(m / 60)} h ${m % 60} min`;
}
