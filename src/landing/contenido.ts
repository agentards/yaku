// Todo el texto de la landing (https://yaku.lat/) vive aquí. plugin.ts lo vuelve HTML estático dentro de index.html
// al compilar, así la página se lee completa sin JS (SEO/GEO) y el copy se cambia sin tocar el maquetado.
// Reglas de verdad (plan-landing-yaku-lat.md): cifras solo con fuente; nunca «alerta», es «reporte vecinal por
// validar»; nada de precios, clientes ni testimonios; lo hecho con IA lo dice; sin enlaces al repositorio.

export type Fuente = { texto: string; url?: string };
export type Video = { archivo: string; titulo: string; descripcion: string; etiquetaIA: string };
export type Paso = { n: string; titulo: string; texto: string; detalle: string };
export type Pregunta = { p: string; r: string };
export type Captura = { archivo: string; pestana: string; alt: string; pie: string };
export type ImagenIA = { archivo: string; alt: string; ancho: number; alto: number };

/** Contacto del CTA «Solicitar un piloto». Lo usan los 4 botones del piloto y el texto del cierre.
 * TODO(Jorge): confirmar que piloto@yaku.lat recibe correo o cambiarlo por el WhatsApp (https://wa.me/51…) definitivo;
 * cambiarlo también en public/llms.txt. */
export const CONTACTO = {
  href: 'mailto:piloto@yaku.lat?subject=Piloto%20de%20Yaku%20en%20mi%20municipalidad',
  texto: 'piloto@yaku.lat',
};

export const RUTAS = { reportar: '/reportar', ingresar: '/municipalidad' } as const;

export const SEO = {
  url: 'https://yaku.lat/',
  titulo: 'Yaku: reportes vecinales sin señal para municipalidades',
  descripcion:
    'El vecino reporta sin señal, el reporte pasa de celular en celular por QR y su municipalidad lo recibe agrupado para validarlo y responder ante El Niño.',
  ogImagen: 'https://yaku.lat/landing/og-cadena.jpg',
  ogAlt: 'Esquema de Yaku: tres celulares de vecinos se pasan un reporte hasta la municipalidad y la respuesta vuelve por la misma cadena',
  actualizado: '2026-10-17',
};

export const NAV = [
  { href: '#cadena', texto: 'Cómo funciona' },
  { href: '#municipalidad', texto: 'Centro de monitoreo' },
  { href: '#regional', texto: 'Gobiernos regionales' },
  { href: '#preguntas', texto: 'Preguntas' },
];

export const HERO = {
  antetitulo: 'Para municipalidades y gobiernos regionales · Fenómeno El Niño',
  titulo: 'Cuando cae la señal, el reporte sigue viajando.',
  bajada:
    'Yaku es una cadena de apoyo vecinal: el vecino reporta sin internet, el reporte pasa de celular en celular por QR y llega a su municipalidad como reporte vecinal por validar, con foto, ubicación y cuántos vecinos lo respaldan.',
  ctaPrincipal: 'Solicitar un piloto',
  ctaVecino: 'Soy vecino: reportar un incidente',
  etiquetaIA: 'Imagen generada con IA',
};

export const PROBLEMA = {
  antetitulo: 'El problema',
  titulo: 'La lluvia tumba las antenas justo cuando más se necesita avisar.',
  cifras: [
    {
      valor: 275,
      unidad: 'antenas',
      texto:
        'cayeron en seis regiones con las lluvias de marzo de 2023, por falta de energía e instalaciones inundadas. 142 dejaron sin teléfono ni internet a más de 130 localidades.',
      fuente: { texto: 'OSIPTEL, nota de prensa 34-2023 (14-mar-2023)', url: 'https://www.osiptel.gob.pe/media/hzteo0hr/np14032023-centro-monitoreo.pdf' },
    },
    {
      valor: 445,
      unidad: 'de 928 centros poblados',
      texto:
        'con dato de cobertura, en el escenario de riesgo del Aviso 421 en Piura, no tienen cobertura móvil garantizada según lo que declaran las operadoras.',
      fuente: {
        texto: 'CENEPRED/SIGRID, escenario 23077 (Aviso SENAMHI 421, oct-2026), cruzado con la cobertura móvil por centro poblado de OSIPTEL (datos abiertos)',
        url: 'https://www.datosabiertos.gob.pe/dataset/porcentaje-de-cobertura-m%C3%B3vil-por-centro-poblado-empresa-operadora-y-tecnolog%C3%ADa',
      },
    },
  ],
  cierre:
    'Sin señal, el vecino no puede avisar y la municipalidad no sabe a dónde ir primero. El aviso existe, pero se queda atrapado en un celular.',
  etiquetaIA: 'Imagen generada con IA',
};

export const CADENA = {
  antetitulo: 'Cómo funciona',
  titulo: 'Una cadena de vecinos que lleva el reporte hasta la municipalidad.',
  pasos: [
    {
      n: '01',
      titulo: 'El vecino reporta sin señal',
      texto: 'Elige qué pasa, toma una foto y Yaku guarda la ubicación. El reporte queda en su celular, sin internet.',
      detalle: 'Personas atrapadas · Casa dañada · Agua en la calle · Huaico',
    },
    {
      n: '02',
      titulo: 'Pasa de celular en celular por QR',
      texto: 'Dos vecinos ponen sus celulares frente a frente. Cada uno lee el código del otro y los dos se llevan los reportes de ambos.',
      detalle: 'Sin datos, sin wifi, sin cuenta',
    },
    {
      n: '03',
      titulo: 'El primero que encuentra señal sube toda la cadena',
      texto: 'Basta que un celular de la cadena llegue a un lugar con señal. Sube todos los reportes que lleva y el servidor los registra una sola vez.',
      detalle: 'Sin duplicados aunque lo lleven varios',
    },
    {
      n: '04',
      titulo: 'La municipalidad lo ve agrupado y lo valida',
      texto: 'Los reportes del mismo lugar se agrupan y muestran cuántos vecinos los respaldan. El equipo de la municipalidad los valida o los descarta.',
      detalle: 'Reporte vecinal por validar → validado',
    },
    {
      n: '05',
      titulo: 'La respuesta vuelve por la misma cadena',
      texto: 'Bomberos, rescate, provisiones o maquinaria: la decisión baja al vecino por la misma cadena de celulares, aunque siga sin señal.',
      detalle: '«Bomberos asignados» en el celular del vecino',
    },
  ] satisfies Paso[],
  etiquetaFigura: 'Esquema: el reporte viaja del vecino a la municipalidad y la respuesta vuelve por la misma cadena.',
};

export const MUNICIPALIDAD = {
  antetitulo: 'Lo que ve la municipalidad',
  titulo: 'Un Centro de monitoreo que dice dónde ir primero.',
  puntos: [
    'Cada reporte con foto, ubicación y cuántos vecinos lo respaldan.',
    'Validar, descartar o unir reportes del mismo lugar, con historial de quién hizo qué.',
    'Asignar bomberos, rescate, provisiones, maquinaria o un equipo de evaluación de daños (EDAN).',
    'Capas oficiales al lado: escenario CENEPRED/SIGRID, pronóstico SENAMHI y cobertura OSIPTEL.',
    'Entrada con nombre y PIN municipal. No hay registro abierto.',
  ],
  capturas: [
    {
      archivo: '/landing/img/monitoreo-3-dos-vecinos.webp',
      pestana: 'Reporte agrupado',
      alt: 'Centro de monitoreo de Yaku: mapa de Piura con un reporte de casa dañada respaldado por dos vecinos, botones Validar y Descartar.',
      pie: 'Dos vecinos reportan la misma casa dañada: un solo incidente, por validar.',
    },
    {
      archivo: '/landing/img/monitoreo-4-bomberos.webp',
      pestana: 'Respuesta asignada',
      alt: 'Centro de monitoreo de Yaku con el incidente validado y bomberos asignados, y las acciones rescate, provisiones y maquinaria.',
      pie: 'Validado y con bomberos asignados. El estado vuelve al vecino.',
    },
    {
      archivo: '/landing/img/monitoreo-5-historico.webp',
      pestana: 'Histórico',
      alt: 'Centro de monitoreo de Yaku en modo histórico: línea de tiempo de reportes y gráfico de cobertura OSIPTEL por nivel de exposición.',
      pie: 'El histórico reproduce cómo llegaron los reportes, hora por hora.',
    },
    {
      archivo: '/landing/img/monitoreo-1-inicio.webp',
      pestana: 'Escenario regional',
      alt: 'Vista 3D de la sierra de Piura con el escenario de riesgo del Aviso 421 de CENEPRED en el Centro de monitoreo de Yaku.',
      pie: 'Escenario del Aviso 421 sobre el relieve de la sierra de Piura.',
    },
  ] satisfies Captura[],
  nota: 'Capturas reales del Centro de monitoreo con reportes de prueba.',
  cta: 'Solicitar un piloto',
};

export const VECINO = {
  antetitulo: 'Lo que ve el vecino',
  titulo: 'Reportar sin cuenta y sin datos.',
  texto:
    'Se abre en el navegador en yaku.lat/reportar y se puede instalar como app. No pide nombre ni DNI: guarda la ubicación y un código anónimo del equipo.',
  capturas: [
    { archivo: '/landing/img/vecino-inicio.webp', pestana: '', alt: 'Pantalla de inicio del modo vecino de Yaku: ¿Qué está pasando? con botones Personas atrapadas, Heridos, Casa dañada, Agua en la calle y Huaico.', pie: 'Elegir qué pasa' },
    { archivo: '/landing/img/vecino-intercambiar.webp', pestana: '', alt: 'Pantalla Intercambiar con otro vecino de Yaku: un código QR propio y la cámara lista para leer el del otro celular.', pie: 'Pasar por QR' },
    { archivo: '/landing/img/vecino-bomberos-asignados.webp', pestana: '', alt: 'Lista Mis reportes en el celular del vecino con el estado Bomberos asignados por la municipalidad.', pie: 'Ver la respuesta' },
  ] satisfies Captura[],
  cta: 'Reportar un incidente',
};

export const REGIONAL = {
  antetitulo: 'Para gobiernos regionales',
  titulo: 'Empezar por un distrito y extender la cadena a toda la región.',
  puntos: [
    { t: 'Empezar chico, sumar provincias', d: 'El piloto arranca en un distrito expuesto; cada municipalidad que se suma extiende la misma cadena.' },
    { t: 'Sobre datos oficiales', d: 'Escenarios CENEPRED/SIGRID, pronósticos SENAMHI y cobertura móvil OSIPTEL, siempre con fuente y fecha. Hoy están cargados los de Piura; cada región suma su escenario vigente.' },
    { t: 'Complementa EDAN y SINPAD', d: 'Yaku no reemplaza la evaluación oficial: le dice al equipo de evaluación de daños dónde hay vecinos pidiendo ayuda.' },
    { t: 'En su propio servidor', d: 'Yaku es un solo programa que puede instalarse en un servidor de la municipalidad o del gobierno regional. Los datos se quedan con ustedes.' },
  ],
  cta: 'Solicitar un piloto',
  etiquetaIA: 'Imagen generada con IA',
};

export const VIDEOS = {
  antetitulo: 'En un minuto',
  titulo: 'Cómo funciona sin red, en un minuto.',
  lista: [
    { archivo: 'si-se-cae-la-red-voz-grok-9x16', titulo: 'Si se cae la red', descripcion: 'Por qué el reporte tiene que poder viajar sin señal.', etiquetaIA: 'Voz e imágenes generadas con IA' },
    { archivo: 'modo-avion-qr-grok-audio-9x16', titulo: 'Modo avión y QR', descripcion: 'Un reporte que pasa de un celular a otro en modo avión.', etiquetaIA: 'Voz e imágenes generadas con IA' },
  ] satisfies Video[],
};

export const CONFIANZA = {
  antetitulo: 'Confianza y datos',
  titulo: 'Nada se publica como oficial sin que la municipalidad lo valide.',
  puntos: [
    { t: 'Reporte vecinal por validar', d: 'Así entra todo reporte. Solo el equipo municipal lo valida, lo descarta o lo une con otro.' },
    { t: 'Datos personales mínimos', d: 'Sin nombre ni DNI: ubicación y un código anónimo del equipo, con el principio de proporcionalidad de la Ley 29733 de protección de datos personales.' },
    { t: 'Fotos protegidas', d: 'Las fotos de las casas solo se ven en el Centro de monitoreo, con PIN municipal.' },
    { t: 'Avisos falsos', d: 'El vecino lo ve antes de reportar: avisar algo falso a propósito es delito (Código Penal, art. 315-A).' },
    { t: 'Fuentes a la vista', d: 'Cada capa oficial muestra su fuente y su fecha. Un escenario es un pronóstico, no un daño observado.' },
  ],
};

// Entre 4 y 6 preguntas de 40 a 60 palabras cada una. El JSON-LD FAQPage sale solo de aquí (plantilla.ts).
export const PREGUNTAS: Pregunta[] = [
  {
    p: '¿Qué es Yaku?',
    r: 'Yaku es una cadena de apoyo vecinal para municipalidades y gobiernos regionales del Perú ante el Fenómeno El Niño. El vecino reporta desde su celular aunque no haya señal, el reporte pasa de celular en celular por QR y llega al Centro de monitoreo municipal como reporte vecinal por validar, con foto y ubicación.',
  },
  {
    p: '¿El vecino necesita internet o instalar una aplicación?',
    r: 'Solo necesita internet la primera vez, para abrir yaku.lat/reportar en el navegador e instalarla en la pantalla de inicio; por eso conviene difundirla antes de las lluvias. Después funciona sin conexión: el reporte se guarda en el celular, pasa a otros por QR sin datos ni wifi y sube cuando un celular de la cadena encuentra señal.',
  },
  {
    p: '¿Reemplaza a EDAN Digital o al SINPAD?',
    r: 'No. Yaku es una capa complementaria de reporte vecinal. Cuando el equipo municipal valida un reporte en Yaku, es una validación operativa para decidir a dónde ir primero. La evaluación de daños oficial (EDAN), su registro en el SINPAD y la firma de la autoridad siguen su curso de siempre.',
  },
  {
    p: '¿Qué pasa con los reportes repetidos o falsos?',
    r: 'Cada reporte se registra una sola vez aunque lo suban varios celulares. Los reportes del mismo lugar se agrupan en un incidente que muestra cuántos vecinos lo respaldan, y el equipo municipal lo valida o lo descarta. Antes de enviar, el vecino lee que avisar algo falso a propósito es delito (Código Penal, art. 315-A).',
  },
  {
    p: '¿Qué datos del vecino guarda y quién los controla?',
    r: 'No pide nombre ni DNI: guarda la ubicación, la hora, la foto y un código anónimo del equipo, con el principio de proporcionalidad de la Ley 29733. Las fotos solo se ven en el Centro de monitoreo, con nombre y PIN municipal, y el servidor puede instalarse en la red de la municipalidad.',
  },
  {
    p: '¿Cómo empieza un piloto?',
    r: 'Escríbanos con el distrito y el área de gestión del riesgo que lo usaría. Preparamos el mapa con las capas oficiales de su zona y el acceso con PIN al Centro de monitoreo. El alcance, los plazos y el costo se acuerdan con su equipo; si aplica el Programa Presupuestal 0068, se confirma con su área de logística.',
  },
];

export const CIERRE = {
  titulo: 'Arme la cadena antes de la próxima lluvia.',
  texto: 'Cuéntenos su distrito y preparamos un piloto con las capas oficiales de su zona.',
  cta: 'Solicitar un piloto',
  vecino: '¿Es vecino? Reporte un incidente',
};

export const PIE = {
  fuentes: [
    { texto: 'OSIPTEL, nota de prensa 34-2023 (14-mar-2023)', url: 'https://www.osiptel.gob.pe/media/hzteo0hr/np14032023-centro-monitoreo.pdf' },
    { texto: 'CENEPRED/SIGRID, escenario 23077 (Aviso SENAMHI 421)' },
    {
      texto: 'OSIPTEL, cobertura móvil por centro poblado (datos abiertos)',
      url: 'https://www.datosabiertos.gob.pe/dataset/porcentaje-de-cobertura-m%C3%B3vil-por-centro-poblado-empresa-operadora-y-tecnolog%C3%ADa',
    },
  ] satisfies Fuente[],
  ia: 'Las imágenes y videos marcados fueron generados con IA. Las capturas del producto son reales, con reportes de prueba.',
};

/** Imágenes nuevas (Grok) en public/landing/img/. Vacío = la sección no se pinta. Prompts en docs/landing/imagenes.md. */
export const IMAGENES_IA: ImagenIA[] = [
  { archivo: '/landing/img/ia-vecinos-lluvia.webp', alt: 'Dos vecinos de espaldas bajo el alero de una casa de adobe, de noche y con lluvia fuerte; uno mira su celular encendido.', ancho: 864, alto: 1080 },
  { archivo: '/landing/img/ia-manos-qr.webp', alt: 'Dos pares de manos bajo la lluvia sostienen dos celulares frente a frente: uno muestra un código QR y el otro lo enfoca con la cámara.', ancho: 864, alto: 1080 },
  { archivo: '/landing/img/ia-sala-municipal.webp', alt: 'Tres personas de espaldas en una sala municipal de noche miran en una pantalla el mapa de un valle con puntos de reportes.', ancho: 864, alto: 1080 },
  { archivo: '/landing/img/ia-caserio-noche.webp', alt: 'Caserío de casas de adobe con techos de calamina junto a un camino de barro, de noche, con postes sin luz y un solo foco encendido.', ancho: 864, alto: 1080 },
  { archivo: '/landing/img/ia-rio-crecido.webp', alt: 'Río crecido de agua marrón bajo la lluvia, junto a un caserío de adobe y calamina con algarrobos inclinados por el viento.', ancho: 864, alto: 1080 },
  { archivo: '/landing/img/ia-calle-anegada.webp', alt: 'Calle de tierra inundada entre casas de adobe, de noche; una persona con poncho de lluvia camina a lo lejos con el celular encendido.', ancho: 864, alto: 1080 },
];
