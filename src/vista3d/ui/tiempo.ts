// Modelo de la línea de tiempo (sin DOM): rango, marcas, reloj de reproducción y eventos clave.
import { OFFICIAL_LAYERS, forecastStatus } from '../../layers';

const H = 3600_000;
const senamhi = OFFICIAL_LAYERS.find((l) => l.id === 'senamhi')!;
/** Emisión del pronóstico SENAMHI usado por la capa (campo FECHA de la fuente). */
export const SENAMHI_EMISION = Date.parse(senamhi.emision!);
export const SENAMHI_VIGENCIA_H = senamhi.vigenciaH!;
/** Escenario CENEPRED/SIGRID 23077 (Aviso 421): 17–19/10/2026, hora de Lima (UTC−5, sin horario de verano). */
export const ESCENARIO_INICIO = Date.parse('2026-10-17T00:00:00-05:00');
export const ESCENARIO_FIN = Date.parse('2026-10-20T00:00:00-05:00');
/** Firmado el 16/10/2026 (la fuente no da hora: se ubica al inicio del día). */
export const ESCENARIO_FIRMA = Date.parse('2026-10-16T00:00:00-05:00');

export function ventanaSenamhi(now = Date.now()) {
  const fs = forecastStatus(senamhi.emision!, SENAMHI_VIGENCIA_H, now);
  return { desde: SENAMHI_EMISION, hasta: fs.hasta, vencido: fs.vencido, fecha: fs.fecha, etiqueta: fs.etiqueta };
}

/** Rango de la línea de tiempo: desde la emisión SENAMHI hasta el fin del escenario, ampliado para incluir ahora y cada ficha. */
export function rango(fichasTs: number[], ahora: number): [number, number] {
  const a = Math.min(SENAMHI_EMISION, ...fichasTs);
  const b = Math.max(ESCENARIO_FIN, ahora, ...fichasTs);
  return [Math.floor(a / H) * H, Math.ceil(b / H) * H];
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const fmtDia = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short' });
const fmtHora = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const dia = (t: number) => fmtDia.format(t).replace('.', '');
export const hora = (t: number) => fmtHora.format(t);
export const fechaHora = (t: number) => `${dia(t)}, ${hora(t)}`;

/** Marcas cada `pasoH` horas alineadas a la hora de Lima; `diaNuevo` marca la medianoche. */
export function marcas(a: number, b: number, pasoH = 12) {
  const off = 5 * H; // Lima = UTC−5 fijo
  const out: { t: number; dia: string; hora: string; diaNuevo: boolean }[] = [];
  let t = Math.ceil((a - off) / (pasoH * H)) * pasoH * H + off;
  for (; t <= b; t += pasoH * H) out.push({ t, dia: dia(t), hora: hora(t), diaNuevo: hora(t) === '00:00' });
  return out;
}

/** Velocidades de reproducción: horas de escenario por segundo real. */
export const VELOCIDADES = [{ id: '1×', hps: 1 }, { id: '4×', hps: 4 }, { id: '12×', hps: 12 }] as const;

/** Reloj de reproducción: avanza t según la velocidad y se detiene al final del rango. */
export class Reloj {
  t: number; hps: number = VELOCIDADES[0].hps; jugando = false;
  constructor(public a: number, public b: number, t = a) { this.t = clamp(t, a, b); }
  setRango(a: number, b: number) { this.a = a; this.b = b; this.t = clamp(this.t, a, b); }
  ir(t: number) { this.t = clamp(t, this.a, this.b); return this.t; }
  /** Avanza dtMs de tiempo real. Devuelve true si llegó al final (y se detiene). */
  avanzar(dtMs: number) {
    if (!this.jugando) return false;
    this.t = clamp(this.t + (dtMs / 1000) * this.hps * H, this.a, this.b);
    if (this.t >= this.b) { this.jugando = false; return true; }
    return false;
  }
  play() { if (this.t >= this.b) this.t = this.a; this.jugando = true; }
  pausa() { this.jugando = false; }
  /** Paso al siguiente evento (o +paso horas si no hay). */
  paso(eventos: number[], pasoH = 1) {
    const sig = eventos.filter((e) => e > this.t + 1).sort((x, y) => x - y)[0];
    return this.ir(sig ?? this.t + pasoH * H);
  }
  /** Fracción 0..1 del cabezal. */
  get frac() { return this.b > this.a ? (this.t - this.a) / (this.b - this.a) : 0; }
}

export interface EventoClave { t: number; titulo: string; detalle: string; tipo: 'oficial' | 'escenario' | 'ficha' | 'consolidada' | 'vence' | 'ahora' }
/** Eventos fijos de fuentes oficiales (sin inventar fechas). */
export function eventosOficiales(now = Date.now()): EventoClave[] {
  const v = ventanaSenamhi(now);
  return [
    { t: SENAMHI_EMISION, titulo: 'Pronóstico SENAMHI emitido', detalle: `Aviso de activación de quebradas · ${v.fecha}`, tipo: 'oficial' },
    { t: v.hasta, titulo: v.vencido ? 'Pronóstico SENAMHI vencido' : 'Vence pronóstico SENAMHI', detalle: `Vigencia ${SENAMHI_VIGENCIA_H} h`, tipo: 'vence' },
    { t: ESCENARIO_FIRMA, titulo: 'Escenario CENEPRED firmado', detalle: 'SIGRID 23077 · Aviso 421 (16/10/2026)', tipo: 'escenario' },
    { t: ESCENARIO_INICIO, titulo: 'Inicio del escenario', detalle: 'Escenario de riesgo 17–19/10/2026', tipo: 'escenario' },
    { t: ESCENARIO_FIN, titulo: 'Fin del escenario', detalle: 'Escenario de riesgo 17–19/10/2026', tipo: 'escenario' },
  ];
}
