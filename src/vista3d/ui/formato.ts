// Textos del HUD y del panel (puros, testeables). Lenguaje del HANDOFF: «sin cobertura garantizada según
// OSIPTEL», «centros poblados del escenario CENEPRED», fichas siempre NO VERIFICADO.
import type { CentroPoblado } from './contrato';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Miles con punto y decimales con coma (como en las cifras del HANDOFF: 1.255). */
export function num(n: number, dec = 0) {
  const [e, d] = Math.abs(n).toFixed(dec).split('.');
  return (n < 0 ? '−' : '') + e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : '');
}

function gms(v: number) {
  const a = Math.abs(v), g = Math.floor(a), mf = (a - g) * 60, m = Math.floor(mf), s = Math.round((mf - m) * 60);
  return s === 60 ? `${g}°${String(m + 1).padStart(2, '0')}′00″` : `${g}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″`;
}
/** 4°29′38″S 79°46′29″O */
export const dms = (lat: number, lon: number) => `${gms(lat)}${lat < 0 ? 'S' : 'N'} ${gms(lon)}${lon < 0 ? 'O' : 'E'}`;

export const altitudTxt = (m: number | null) => (m === null || !Number.isFinite(m) ? '—' : `${num(Math.round(m))} m s.n.m.`);

export function coberturaTxt(cp: Pick<CentroPoblado, 'cg' | 'g4'>) {
  if (cp.cg === null) return { corto: 'SIN DATO OSIPTEL', largo: 'Sin dato OSIPTEL (el centro poblado no figura en el registro)', clase: 'sindato' };
  if (cp.cg === false) return { corto: 'SIN COBERTURA GARANTIZADA', largo: 'Sin cobertura garantizada según OSIPTEL (declarada por operadoras)', clase: 'sincob' };
  return { corto: cp.g4 ? 'COBERTURA GARANTIZADA · 4G' : 'COBERTURA GARANTIZADA', largo: `Con cobertura garantizada según OSIPTEL (declarada por operadoras)${cp.g4 ? ', 4G sí' : ', 4G no'}`, clase: 'concob' };
}

/** Estado del centro poblado según las fichas recibidas hasta el cabezal. */
export const estadoCentro = (nFichas: number) =>
  nFichas > 0 ? { txt: 'Con registro recibido, no verificado', clase: 'conficha' } : { txt: 'Sin ficha de evaluación', clase: 'sinficha' };

export const FUENTE_CENTRO = 'CENEPRED/SIGRID 23077 (Aviso 421), firmado 16/10/2026 · ubicación IGN · cobertura OSIPTEL 2025-IV';

/** Rumbo 0..359 para el HUD. */
export const rumbo = (b: number) => String(Math.round(((b % 360) + 360) % 360)).padStart(3, '0') + '°';
