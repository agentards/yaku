// Textos y reglas de producto de la pantalla de la municipalidad, en un solo lugar.
// Fuente: agentards/producto/decision-confianza.md (17-oct-2026) §1 rótulo y textos, §2 respaldo y prioridad, §3 agrupación.
// Rótulo, detalle por nivel, acciones y pie legal vienen de src/poblador/textos.ts (fuente única que piden la
// decisión y WP2); aquí solo lo propio del panel: chip por estado, respaldo con número, familias y fórmula.
import { OBS_LABELS } from '../../codec';
import { ACCION_TXT, DETALLE, PIE_LEGAL, ROTULO_VECINAL, type Accion, type Nivel } from '../../poblador/textos';
export { ACCION_TXT, DETALLE, PIE_LEGAL, ROTULO_VECINAL, type Accion, type Nivel };

export const NIVELES = { n2: 45, n3: 80 };
export const nivelDe = (n: number): Nivel => (n >= NIVELES.n3 ? 'N3' : n >= NIVELES.n2 ? 'N2' : 'N1');
export const vecinos = (n: number) => `${n} ${n === 1 ? 'vecino' : 'vecinos'}`;
export const respaldoTxt = (n: number, nivel: Nivel = nivelDe(n)) => `Respaldo ${Math.round(n)} · ${nivel}`;

/** Tipos actuales de codec.ts + los nuevos del plan (WP1 los agrega AL FINAL de OBS_TYPES). */
export const TIPOS: Record<string, string> = {
  ...OBS_LABELS,
  vivienda: 'Casa dañada o caída',
  atrapados: 'Personas atrapadas',
  heridos: 'Heridos',
  ayuda: 'Necesitan ayuda (agua, comida, abrigo)',
};
export const tipoTxt = (t: string) => TIPOS[t] ?? 'Otro';

/** §2.2: vida primero (atrapados > heridos > lo demás). */
export const RIESGO_VIDA = ['atrapados', 'heridos'];

export type Estado = 'nuevo' | 'en_revision' | 'validado' | 'descartado' | 'accion_asignada' | 'atendido';
export const ACCIONES: Record<Accion, string> = { rescate: 'Rescate', bomberos: 'Bomberos', provisiones: 'Provisiones', maquinaria: 'Maquinaria', edan: 'Evaluación EDAN' };
/** §1: chip de estado. Sin estado municipal, el chip es el rótulo vecinal. Solo validado/acción/atendido van en verde. */
export const ESTADO: Record<Estado, string> = {
  nuevo: ROTULO_VECINAL,
  en_revision: 'En revisión por la municipalidad',
  validado: 'Validado por la municipalidad',
  accion_asignada: 'Acción asignada por la municipalidad',
  atendido: 'Atendido por la municipalidad',
  descartado: 'Revisado por la municipalidad',
};
export const estadoChip = (e: Estado, a: Accion | null) => (e === 'accion_asignada' && a ? ACCION_TXT[a] : ESTADO[e]);
export const MUNICIPAL_VERDE: Estado[] = ['validado', 'accion_asignada', 'atendido'];

export const MOTIVOS_DESCARTE = ['Duplicado de otro incidente', 'No se encontró nada en el lugar', 'Fuera de la jurisdicción', 'Información insuficiente'];

/** §3: familias, radio al ANCLA (primer reporte), ventana desde el último reporte y vida media del respaldo. */
export interface Familia { tipos: string[]; radioM: number | null; ventanaH: number; mediaVidaH: number }
export const FAMILIAS: Record<string, Familia> = {
  agua: { tipos: ['agua', 'cauce', 'huaico', 'via_bloq'], radioM: 250, ventanaH: 3, mediaVidaH: 3 },
  danos: { tipos: ['vivienda', 'heridos'], radioM: 100, ventanaH: 12, mediaVidaH: 12 },
  atrapados: { tipos: ['atrapados'], radioM: 50, ventanaH: 12, mediaVidaH: 12 },
  ayuda: { tipos: ['ayuda'], radioM: 150, ventanaH: 24, mediaVidaH: 24 },
  otro: { tipos: ['otro'], radioM: null, ventanaH: 3, mediaVidaH: 3 }, // no agrupa entre personas
};
export const familiaDe = (tipo: string) => Object.keys(FAMILIAS).find((k) => FAMILIAS[k].tipos.includes(tipo)) ?? 'otro';
/** Tipo principal del incidente: el primero de esta lista que aparezca (heridos > vivienda). */
export const GRAVEDAD = ['atrapados', 'heridos', 'vivienda', 'huaico', 'via_bloq', 'cauce', 'agua', 'ayuda', 'otro'];

export interface Desglose { personas: number; fotos: number; cercania: number; recencia: number }
/**
 * §2.1 respaldo = round((Personas + Fotos + Cercanía) × Recencia). Solo se usa si el servidor no manda el suyo
 * (agrupado en esta pantalla). La severidad NO suma: cualquiera puede marcar «3».
 *   Personas 1→25 · 2→40 · 3→50 · ≥4→55 · Fotos (dispositivos con foto recibida) 1→15 · ≥2→25
 *   Cercanía (≥ 2 personas; mediana al ancla) ≤50 m→20 · ≤100 m→12 · ≤radio→5 · Recencia max(0,20; 0,5^(h/T½))
 */
export function respaldo(p: { personas: number; personasConFoto: number; medianaM: number | null; radioM: number | null; horas: number; mediaVidaH: number }): { total: number; desglose: Desglose } {
  const tabla = (pts: number[], n: number) => (n <= 0 ? 0 : pts[Math.min(n, pts.length) - 1]);
  const personas = tabla([25, 40, 50, 55], p.personas);
  const fotos = tabla([15, 25], Math.min(p.personasConFoto, p.personas));
  const m = p.medianaM;
  const cercania = p.personas < 2 || m === null ? 0 : m <= 50 ? 20 : m <= 100 ? 12 : m <= (p.radioM ?? Infinity) ? 5 : 0;
  const recencia = Math.max(0.2, 0.5 ** (Math.max(0, p.horas) / p.mediaVidaH));
  return { total: Math.max(0, Math.min(100, Math.round((personas + fotos + cercania) * recencia))), desglose: { personas, fotos, cercania, recencia: Math.round(recencia * 1000) / 1000 } };
}
