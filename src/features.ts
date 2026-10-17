// Entregas por partes (build-time): VITE_PHASE=1 mapa base z11 · 2 + escenario CENEPRED y «Sin ubicar» · 3 + OSIPTEL y ?basemap=z12.
export const PHASE = Number(import.meta.env.VITE_PHASE ?? 3);
export const FEAT = { cenepred: PHASE >= 2, osiptel: PHASE >= 3, z12: PHASE >= 3 };
