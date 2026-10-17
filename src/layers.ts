// Metadatos de capas oficiales reales (fuente y fecha visibles en la leyenda).
export interface LayerMeta { id: string; titulo: string; tipo: string; fuente: string; fecha: string; nota: string; archivo: string; emision?: string; vigenciaH?: number }

/** Estado de un pronóstico según su emisión + vigencia, comparado con la hora actual (no fijo). */
export function forecastStatus(emisionISO: string, vigenciaH: number, now = Date.now()) {
  const emit = Date.parse(emisionISO);
  const hasta = emit + vigenciaH * 3600_000;
  // La fecha de emisión se muestra en UTC, igual que el campo FECHA de la fuente (epoch 1792022400000).
  const fecha = new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(emit);
  const vencido = now > hasta;
  return { vencido, fecha, hasta, etiqueta: `Pronóstico SENAMHI del ${fecha} · vigencia ${vigenciaH} h · ${vencido ? 'VENCIDO, se muestra como ejemplo' : 'VIGENTE'}` };
}
export const OFFICIAL_LAYERS: LayerMeta[] = [
  {
    id: 'senamhi',
    titulo: 'Aviso de activación de quebradas',
    tipo: 'Pronóstico oficial',
    fuente: 'SENAMHI, vía geoservicio INDECI (SDE.SENAMHI_AvisoActQuebrada24H)',
    fecha: 'Descargado 17/10/2026',
    emision: '2026-10-15T00:00:00Z', // campo FECHA = 1792022400000 ms
    vigenciaH: 24,
    nota: 'NIVEL = nivel de aviso (2 o 3). No es profundidad de agua ni área inundada.',
    archivo: 'data/senamhi-quebradas.geojson',
  },
  {
    id: 'erosion',
    titulo: 'SIGRID · áreas expuestas a erosión',
    tipo: 'Registro oficial',
    fuente: 'SIGRID/CENEPRED, obtenida vía geoservicio de INDECI',
    fecha: 'Documentos 2019–2024 · descargado 17/10/2026',
    nota: '69 zonas evaluadas en Piura. Muchas son pequeñas: a escala regional se muestran como puntos.',
    archivo: 'data/sigrid-erosion.geojson',
  },
  {
    id: 'limite',
    titulo: 'Límite departamental de Piura',
    tipo: 'Cartografía base',
    fuente: 'INDECI, servicio LimitesAdministrativos',
    fecha: 'Descargado 17/10/2026',
    nota: 'Límite administrativo; no expresa riesgo.',
    archivo: 'data/piura-limite.geojson',
  },
];
export const PIURA_BOUNDS: [[number, number], [number, number]] = [[-81.45, -6.4], [-79.1, -4.0]];
