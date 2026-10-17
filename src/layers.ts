// Metadatos de capas oficiales reales (fuente y fecha visibles en la leyenda).
export interface LayerMeta { id: string; titulo: string; tipo: string; fuente: string; fecha: string; nota: string; archivo: string }
export const OFFICIAL_LAYERS: LayerMeta[] = [
  {
    id: 'senamhi',
    titulo: 'Pronóstico SENAMHI · aviso de activación de quebradas (24 h)',
    tipo: 'Pronóstico oficial',
    fuente: 'SENAMHI, vía geoservicio INDECI (SDE.SENAMHI_AvisoActQuebrada24H)',
    fecha: 'Aviso del 15/10/2026 · descargado 17/10/2026',
    nota: 'NIVEL = nivel de aviso (2 o 3). No es profundidad de agua ni área inundada.',
    archivo: 'data/senamhi-quebradas.geojson',
  },
  {
    id: 'erosion',
    titulo: 'SIGRID · áreas expuestas a erosión',
    tipo: 'Registro oficial',
    fuente: 'CENEPRED/SIGRID (informes INGEMMET y otros), vía geoservicio INDECI',
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
