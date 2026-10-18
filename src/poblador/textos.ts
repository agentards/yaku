// Textos del modo poblador (?vista=poblador). Constantes únicas del rótulo vecinal y de los estados, según
// la decisión de producto «confianza» §1 (17-oct-2026). WP3 (pantalla de la municipalidad) usa los mismos
// nombres: ROTULO_VECINAL, DETALLE, ESTADO, PIE_LEGAL. Reglas: un reporte vecinal nunca es una alerta oficial y
// lo valida la municipalidad (CP art. 315-A); al vecino se le muestra el nivel en palabras, nunca el número
// 0–100; nunca rojo para un reporte vecinal; «coinciden», no «confirman».
// Desviaciones escritas (las tres vienen de producto/descubrimiento/voz-poblador-rotulo.md, revisión B2C de §1):
// 1. La acción dice «asignados», no «en camino» (§1 tabla ACCION): Yaku solo sabe que la municipalidad ASIGNÓ la
//    acción, no si el equipo salió; prometer «en camino» a alguien atrapado y que no llegue es peor que decir menos.
// 2. DESCARTADO dice «Revisado · no validado», no «Revisado por la municipalidad»: B2C lo marcó como corrección
//    obligatoria antes de la demo, porque «Revisado» a secas suena a «ya lo vieron, está bien» y no se distingue de
//    ATENDIDO. Cierra la serie por validar → validado / no validado sin acusar a nadie de mentir.
// 3. PIE_LEGAL usa la versión de las reglas de §1 («…y tienes señal…»), no la constante corta: §1 tenía las dos y
//    Yaku está hecho para cuando no hay red.
// N1 usa n (no «1 vecino» fijo): un incidente viejo de 4 personas cae a N1 por antigüedad (§2.4 caso F).

/** Chip que reemplaza «NO VERIFICADO». El mismo en N1, N2 y N3. */
export const ROTULO_VECINAL = 'Reporte vecinal · por validar';
export const PIE_LEGAL = 'Es un reporte de vecinos, no una alerta oficial. Para alertas, sigue a SENAMHI e INDECI. Si hay personas atrapadas o heridas y tienes señal: 116 (bomberos) o 105 (policía).';

export type Nivel = 'N1' | 'N2' | 'N3';
const fotosTxt = (f: number) => `${f} foto${f === 1 ? '' : 's'}`;
/** Detalle del respaldo en palabras. n = vecinos distintos, f = fotos. */
export const DETALLE: Record<Nivel, (n: number, f: number) => string> = {
  N1: (n, f) => (n > 1 ? `${n} vecinos lo reportan` + (f ? ` · ${fotosTxt(f)}` : '') : f ? `1 vecino · ${fotosTxt(f)}` : '1 vecino lo reporta'),
  N2: (n, f) => `${n} ${n === 1 ? 'vecino lo reporta' : 'vecinos lo reportan'}` + (f ? ` · ${fotosTxt(f)}` : ''),
  N3: (n, f) => `${n} vecinos coinciden · ${fotosTxt(f)} · cerca uno del otro`,
};
/** Nivel aproximado en el celular (sin el respaldo del servidor): 1 vecino → N1, 2 → N2, ≥ 3 → N3 (ejemplos A, B y D de §2.4). */
export const nivelLocal = (vecinos: number): Nivel => (vecinos >= 3 ? 'N3' : vecinos === 2 ? 'N2' : 'N1');

export const ACCIONES = ['rescate', 'bomberos', 'provisiones', 'maquinaria', 'edan'] as const;
export type Accion = (typeof ACCIONES)[number];
export const ACCION_TXT: Record<Accion, string> = {
  rescate: 'Rescate asignado', bomberos: 'Bomberos asignados', provisiones: 'Provisiones asignadas', maquinaria: 'Maquinaria asignada', edan: 'Evaluación EDAN asignada',
};
/** Chip de estado municipal: cuando existe, el vecino ve SOLO esto (no el rótulo vecinal). */
export const ESTADO = {
  en_revision: 'En revisión por la municipalidad',
  validado: 'Validado por la municipalidad',
  accion: (a: Accion | undefined) => (a ? ACCION_TXT[a] : 'Acción asignada por la municipalidad'),
  atendido: 'Atendido por la municipalidad',
  descartado: 'Revisado · no validado',
};
/** Detalle de cada estado (hh:mm de Lima). */
export const ESTADO_DETALLE = {
  en_revision: (h: string) => `La municipalidad lo está revisando${h}`,
  validado: (h: string) => `Validado${h}`,
  accion: (h: string) => `Asignado por la municipalidad${h}`,
  atendido: (h: string) => `Atendido${h}`,
  descartado: (motivo: string, h: string) => `La municipalidad lo revisó y no lo validó${motivo ? `: ${motivo}` : ''}${h}`,
  nuevo: (h: string) => `Llegó al servidor · la municipalidad aún no lo revisa${h}`,
  enviado: 'Enviado · espera revisión de la municipalidad',
  local: 'Guardado en tu celular · se envía solo cuando haya internet',
};

/** §2.1: la marca «tiene foto» sin imagen recibida se ve así y suma 0 al respaldo hasta que la foto llega. */
export const FOTOS_PENDIENTES = (n: number) => (n === 1 ? '1 foto pendiente de subir' : `${n} fotos pendientes de subir`);
export const FOTOS_PENDIENTES_AYUDA = 'sube cuando el celular que la tomó tenga internet';

export const T = {
  marca: 'Yaku',
  modo: 'Modo vecino',
  enLinea: 'EN LÍNEA',
  sinRed: 'SIN RED',
  porEnviar: (n: number) => (n === 1 ? '1 por enviar' : `${n} por enviar`),
  navReportar: 'Reportar',
  navIntercambiar: 'Intercambiar',
  navLista: 'Mis reportes',

  consentimiento: 'Tus reportes guardan la ubicación del celular y un código anónimo del equipo. No pedimos nombre ni DNI. Avisar algo falso a propósito es delito (Código Penal, art. 315-A).',
  entendido: 'Entendido',

  queVes: '¿Qué está pasando?',
  queVesAyuda: 'Toca lo que ves. Funciona sin internet: se guarda en tu celular.',

  avisoTitulo: '¿Hay peligro de vida?',
  avisoTexto: 'Si tienes señal, llama primero al 116 (Bomberos) o al 105 (Policía). Yaku no reemplaza esas líneas: tu reporte se guarda igual.',
  llamar116: 'Llamar al 116 · Bomberos',
  llamar105: 'Llamar al 105 · Policía',
  seguirReporte: 'Seguir con el reporte',

  ubicacionBuscando: 'Buscando tu ubicación (GPS)…',
  ubicacionGps: (m: number) => `Ubicación del GPS · ±${Math.round(m)} m`,
  ubicacionUltima: (min: number) => `Sin GPS ahora: se usa tu última ubicación (hace ${min} min)`,
  ubicacionSin: 'Sin GPS: activa la ubicación. Si guardas igual, el punto será aproximado (centro de Piura).',
  reintentarGps: 'Reintentar GPS',
  foto: 'Tomar foto',
  fotoOtra: 'Cambiar foto',
  fotoQuitar: 'Quitar foto',
  fotoLista: (kb: number) => `Foto lista · ${kb} KB · queda en tu celular y sube cuando tengas internet`,
  fotoComprimiendo: 'Preparando la foto…',
  fotoError: 'No se pudo leer la foto. Prueba otra vez.',
  gravedad: '¿Qué tan grave?',
  grav: { 1: 'Leve', 2: 'Grave', 3: 'Muy grave' } as Record<1 | 2 | 3, string>,
  nota: 'Detalle (opcional)',
  notaAyuda: 'Ej.: «agua hasta la rodilla», «2 adultos en el techo»',
  guardar: 'Guardar reporte',
  cancelar: 'Cancelar',
  guardado: 'Guardado en tu celular',
  guardadoEnviando: 'Guardado. Enviando…',
  yaExistia: 'Ya tenías ese mismo reporte.',

  intercambiarTitulo: 'Intercambiar con otro vecino',
  intercambiarAyuda: 'Pongan los celulares frente a frente: cada uno lee el código del otro. Así los dos llevan los reportes de ambos.',
  miCodigo: 'Mi código',
  miCodigoInfo: (n: number, i: number, k: number) => `${n === 1 ? '1 reporte' : `${n} reportes`}${k > 1 ? ` · código ${i} de ${k}` : ''}`,
  camaraOtro: 'Apunta al código del otro celular',
  camaraIniciando: 'Abriendo la cámara…',
  camaraLista: 'Cámara lista: apunta al código del otro celular.',
  camaraNo: (why: string) => `No se pudo abrir la cámara (${why}). Puedes leer el código desde una foto.`,
  leerFoto: 'Leer código desde una foto',
  recibiendo: (a: number, b: number) => `Recibiendo… ${a} de ${b}`,
  listo: (nuevos: number) => (nuevos ? `Listo: recibiste ${nuevos === 1 ? '1 reporte nuevo' : `${nuevos} reportes nuevos`}` : 'Listo: ya tenías todo lo del otro celular'),
  estadosRecibidos: (n: number) => `${n === 1 ? '1 respuesta' : `${n} respuestas`} de la municipalidad recibidas`,
  noEsYaku: 'Ese código no es de Yaku.',
  codigoDanado: 'El código llegó dañado. Sigue apuntando.',
  terminar: 'Terminar',
  sinFotoEnQr: 'Las fotos no viajan por código: suben cuando el celular que las tomó tenga internet.',

  misReportes: 'Mis reportes',
  avisosTitulo: 'Avisos de la municipalidad',
  avisosVacio: 'Cuando la municipalidad responda a un incidente (rescate, provisiones, bomberos…), el aviso aparece aquí y lo puedes pasar por QR a quien no tenga internet.',
  avisosNuevos: (n: number) => (n === 1 ? '1 aviso nuevo de la municipalidad.' : `${n} avisos nuevos de la municipalidad.`),
  avisoRecibidoQr: 'Aviso de la municipalidad recibido por QR',
  avisoSinFirma: 'Recibiste un aviso que no se pudo verificar: no se muestra como de la municipalidad.',
  queLlevo: 'Los que llevo de otros vecinos',
  vacioMios: 'Aún no hiciste reportes.',
  vacioLlevo: 'Cuando intercambies con otro vecino, sus reportes aparecen aquí y viajan contigo.',
  actualizar: 'Actualizar estado',
  actualizando: 'Consultando…',
  sinInternetEstado: 'Sin internet: el estado se actualiza cuando vuelva la señal o cuando otro vecino te lo pase.',
  conFoto: 'con foto',
  llegoPorQr: 'te lo pasó otro vecino',
  vistaTecnica: 'Vista técnica (equipo EDAN)',
};
