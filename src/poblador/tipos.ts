// Botones del modo poblador y su correspondencia con los tipos del codec (src/codec.ts, de WP1).
// Los tipos nuevos (vivienda, atrapados, heridos, ayuda) los agrega WP1 AL FINAL de OBS_TYPES. Mientras el
// codec no los tenga, el reporte se guarda como «otro» con el nombre del tipo al inicio de la nota: viaja por
// QR, el servidor actual lo acepta y no se pierde qué vio el vecino. Con el codec nuevo se usa el tipo real.
import { OBS_TYPES, type ObsType } from '../codec';

export type TipoPoblador = 'atrapados' | 'heridos' | 'vivienda' | 'agua' | 'huaico' | 'cauce' | 'via_bloq' | 'ayuda' | 'otro';

export interface BotonTipo {
  id: TipoPoblador;
  texto: string;
  /** Severidad propuesta al elegirlo (el vecino puede cambiarla). */
  sev: 1 | 2 | 3;
  /** Muestra antes el aviso 116 / 105. */
  riesgoVida: boolean;
  icono: string; // contenido SVG (viewBox 0 0 48 48)
}

// Orden: primero lo que pone en riesgo la vida.
export const BOTONES: BotonTipo[] = [
  { id: 'atrapados', texto: 'Personas atrapadas', sev: 3, riesgoVida: true,
    icono: '<circle cx="24" cy="12" r="5"/><path d="M15 40V27a9 9 0 0 1 18 0v13"/><path d="M6 6v36M42 6v36M6 20h36M6 34h36" stroke-dasharray="3 3"/>' },
  { id: 'heridos', texto: 'Heridos', sev: 3, riesgoVida: true,
    icono: '<rect x="8" y="8" width="32" height="32" rx="6"/><path d="M24 15v18M15 24h18" stroke-width="5"/>' },
  { id: 'vivienda', texto: 'Casa dañada o caída', sev: 2, riesgoVida: false,
    icono: '<path d="M6 22 24 7l18 15"/><path d="M11 19v21h26V19"/><path d="m22 20-4 8 6 3-3 9"/>' },
  { id: 'agua', texto: 'Agua en la calle', sev: 2, riesgoVida: false,
    icono: '<path d="M4 30c4 0 4-3 8-3s4 3 8 3 4-3 8-3 4 3 8 3 4-3 8-3M4 39c4 0 4-3 8-3s4 3 8 3 4-3 8-3 4 3 8 3 4-3 8-3"/><path d="M24 6s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/>' },
  { id: 'huaico', texto: 'Huaico o lodo', sev: 3, riesgoVida: false,
    icono: '<path d="M4 38 18 12l8 12 5-6 13 20Z"/><circle cx="16" cy="33" r="2.5"/><circle cx="27" cy="35" r="2"/>' },
  { id: 'cauce', texto: 'Río o quebrada tapada', sev: 2, riesgoVida: false,
    icono: '<path d="M6 10c8 4 4 12 12 16s4 12 12 14"/><path d="M18 10c8 4 4 12 12 16s4 12 12 14"/><path d="M14 24h18" stroke-width="5"/>' },
  { id: 'via_bloq', texto: 'Camino bloqueado', sev: 2, riesgoVida: false,
    icono: '<path d="M14 42 20 6M34 42 28 6"/><rect x="8" y="20" width="32" height="9" rx="2"/><path d="m13 29 6-9M22 29l6-9M31 29l6-9"/>' },
  { id: 'ayuda', texto: 'Necesito agua, comida o abrigo', sev: 2, riesgoVida: false,
    icono: '<path d="M10 20h28l-3 20H13Z"/><path d="M17 20c0-6 3-10 7-10s7 4 7 10"/><path d="M24 26v9M19.5 30.5h9"/>' },
  { id: 'otro', texto: 'Otro peligro', sev: 1, riesgoVida: false,
    icono: '<path d="M24 6 43 40H5Z"/><path d="M24 18v10" stroke-width="4"/><circle cx="24" cy="34" r="1.5"/>' },
];

export const BOTON: Record<TipoPoblador, BotonTipo> = Object.fromEntries(BOTONES.map((b) => [b.id, b])) as Record<TipoPoblador, BotonTipo>;

export const soportaTipo = (t: string, tipos: readonly string[] = OBS_TYPES) => tipos.includes(t);

const prefijo = (t: TipoPoblador) => `${BOTON[t].texto}: `;

/** Tipo del codec y nota a guardar. Si el codec aún no tiene el tipo, «otro» + prefijo en la nota. */
export function aCodec(t: TipoPoblador, nota: string, conFoto = false, tipos: readonly string[] = OBS_TYPES): { type: ObsType; note: string } {
  const marca = conFoto ? ` ${MARCA_FOTO}` : '';
  const base = soportaTipo(t, tipos) ? '' : prefijo(t);
  const cuerpo = nota.trim().replace(/\s+/g, ' ').slice(0, MAX_NOTA - base.length - marca.length);
  return { type: (base ? 'otro' : t) as ObsType, note: ((base + cuerpo).trim() + marca).trim() };
}

/** Marca «tiene foto» al final de la nota: la foto no viaja por QR, pero quien recibe sabe que existe. */
export const MARCA_FOTO = '(con foto)';
const MAX_NOTA = 140;

/** Lo inverso: qué botón corresponde a un reporte guardado (incluye los guardados con prefijo). */
export function deCodec(o: { type: string; note: string }): { tipo: TipoPoblador; nota: string; conFoto: boolean } {
  let note = o.note.trim();
  const conFoto = note.endsWith(MARCA_FOTO);
  if (conFoto) note = note.slice(0, -MARCA_FOTO.length).trim();
  if (o.type !== 'otro' && o.type in BOTON) return { tipo: o.type as TipoPoblador, nota: note, conFoto };
  for (const b of BOTONES) {
    const p = prefijo(b.id); // «Casa dañada o caída: »; sin detalle queda «Casa dañada o caída:»
    if (b.id !== 'otro' && (note.startsWith(p) || note === p.trim())) return { tipo: b.id, nota: note.slice(p.length).trim(), conFoto };
  }
  return { tipo: 'otro', nota: note, conFoto };
}
