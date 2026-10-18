// Escenario oficial que acompaña al Centro de monitoreo: UN solo lugar para sus textos, cifras y fechas
// (CENEPRED/SIGRID 23077, Aviso SENAMHI 421, IGN, OSIPTEL 2025-IV). Son datos oficiales con fuente y fecha, no
// datos de monitoreo: la línea de tiempo NO se ata a estas fechas (su rango sale del histórico real del servidor).
// Leen de aquí la cabecera, el panel «Escenario», el portal de campo y ui/tiempo.ts.
import { REGION } from '../region';

/** Hora de Lima: UTC−5 fijo, sin horario de verano. */
const lima = (iso: string) => Date.parse(`${iso}T00:00:00-05:00`);

export const ESCENARIO = {
  /** Escenario de riesgo CENEPRED/SIGRID 23077 (Aviso 421): 17–19/10/2026. */
  inicio: lima('2026-10-17'),
  fin: lima('2026-10-20'),
  /** Firmado el 16/10/2026 (la fuente no da hora: se ubica al inicio del día). */
  firma: lima('2026-10-16'),
  /** Chip de la cabecera: depende de la región (Piura = escenario oficial; Lima = prueba en sala). */
  chip: REGION.chip,
  chipTitulo: REGION.chipTitulo,
  lugar: '23 distritos andinos · CENEPRED/SIGRID',
  codigo: 'CENEPRED/SIGRID 23077 · Aviso SENAMHI 421',
  vigencia: '17–19/10/2026',
  vigenciaFirma: '17–19/10/2026 · firmado 16/10/2026',
  zona: '23 distritos andinos de Ayabaca, Huancabamba, Morropón y Sullana',
  /** Cifras verificadas del Excel CENEPRED cruzado con IGN y OSIPTEL (HANDOFF). Solo de respaldo si el JSON no carga. */
  cifras: { total: 1255, ubicados: 930, sinUbicar: 325, aproxOsiptel: 317, sinPunto: 8, conDatoOsiptel: 928, sinCobertura: 445 },
  nota: 'Escenario hipotético basado en un pronóstico: nivel de exposición, no profundidad de agua ni daños observados. Cobertura móvil declarada por operadoras (OSIPTEL, datos abiertos, 2025-IV).',
} as const;

export const MONITOREO = {
  nombre: 'Yaku 3D',
  titulo: 'Centro de monitoreo',
  /** Título de la pestaña del navegador. */
  documento: 'Yaku 3D · Centro de monitoreo',
} as const;
