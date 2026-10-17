// Flujo real: lee las fichas de IndexedDB de este equipo (las mismas de la vista 2D) y avisa de las nuevas
// y de las recién consolidadas. Lo «ya visto» se recuerda en sessionStorage para que una ficha recibida por
// QR en la vista 2D dispare su arco al volver al 3D (aunque la página se haya recargado).
import { all } from '../../db';
import { desdeStored, type Ficha } from './datos';
import type { Tienda } from './tienda';

const CLAVE = 'yaku3d-vistos';
function leerVistos(): Map<string, boolean> | null {
  try { const s = sessionStorage.getItem(CLAVE); return s ? new Map(JSON.parse(s)) : null; } catch { return null; }
}
function guardarVistos(m: Map<string, boolean>) {
  try { sessionStorage.setItem(CLAVE, JSON.stringify([...m])); } catch { /* almacenamiento no disponible */ }
}

/** Diferencia entre dos lecturas: fichas nuevas y fichas que pasaron a consolidadas. */
export function diferencia(previo: Map<string, boolean>, fs: Ficha[]) {
  return {
    nuevas: fs.filter((f) => !previo.has(f.id)),
    consolidadas: fs.filter((f) => f.synced && previo.get(f.id) === false),
  };
}

export function vigilarFichas(tienda: Tienda, alCambiar: (nuevas: Ficha[], consolidadas: Ficha[]) => void, cadaMs = 2500) {
  let previo = leerVistos();
  let firma = '';
  let leyendo = false;
  async function leer() {
    if (leyendo) return;
    leyendo = true;
    try {
      const fs = (await all()).map(desdeStored);
      const f2 = fs.map((f) => `${f.id}:${+f.synced}`).join(',');
      if (f2 === firma) return;
      firma = f2;
      const d = previo ? diferencia(previo, fs) : { nuevas: [], consolidadas: [] };
      previo = new Map(fs.map((f) => [f.id, f.synced]));
      guardarVistos(previo);
      tienda.setReales(fs);
      if (d.nuevas.length || d.consolidadas.length) alCambiar(d.nuevas, d.consolidadas);
    } catch { /* IndexedDB no disponible: la vista sigue con el modo demo */ } finally { leyendo = false; }
  }
  const id = setInterval(() => { if (!document.hidden) leer(); }, cadaMs);
  addEventListener('online', leer);
  addEventListener('focus', leer);
  return { leer, detener: () => { clearInterval(id); removeEventListener('online', leer); removeEventListener('focus', leer); } };
}
