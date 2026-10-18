// Piezas sin DOM de yaku.lat/estamos-bien (las prueba tests/estamos-bien.test.ts).
export const MIN_LETRAS = 3;
export interface Mensaje { id: string; nombre: string; para: string; mensaje: string; zona: string; ts: number }

export const buscarUrl = (nombre: string) => '/api/estamos-bien?nombre=' + encodeURIComponent(nombre.trim().slice(0, 40));

/** Fecha y hora de Perú (ts en segundos), para quien busca desde otro huso horario. */
export const fechaLima = (ts: number) =>
  new Date(ts * 1000).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Lima' }) + ' (hora de Perú)';
