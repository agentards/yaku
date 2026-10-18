// Modo de color del Centro de monitoreo y de su pantalla de acceso: Claro / Oscuro / Sistema.
// Se guarda en este equipo (localStorage, siempre dentro de try/catch: sin almacenamiento vale para esta carga) y
// «Sistema» sigue a prefers-color-scheme en vivo. El modo resuelto queda en <html data-modo="claro|oscuro">: los
// tokens de ui/tema.css (solo .v3d.mon) y de auth/acceso.css cambian con él. Sin DOM obligatorio (tests en Node).
import './modo.css';

export type ModoPref = 'claro' | 'oscuro' | 'sistema';
export type Modo = 'claro' | 'oscuro';
export const CLAVE_MODO = 'yaku-modo';
export const MODOS: readonly { id: ModoPref; nombre: string; titulo: string }[] = [
  { id: 'claro', nombre: 'Claro', titulo: 'Modo claro' },
  { id: 'oscuro', nombre: 'Oscuro', titulo: 'Modo oscuro (también oscurece el mapa)' },
  { id: 'sistema', nombre: 'Sistema', titulo: 'Seguir el modo del sistema operativo' },
];

const ICONO: Record<ModoPref, string> = {
  claro: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  oscuro: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  sistema: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
};
const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const esModoPref = (v: unknown): v is ModoPref => v === 'claro' || v === 'oscuro' || v === 'sistema';
export const resolverModo = (p: ModoPref, sistemaOscuro: boolean): Modo => (p === 'sistema' ? (sistemaOscuro ? 'oscuro' : 'claro') : p);

export function leerModo(): ModoPref {
  try { const v = typeof localStorage !== 'undefined' ? localStorage.getItem(CLAVE_MODO) : null; return esModoPref(v) ? v : 'sistema'; } catch { return 'sistema'; }
}
export function guardarModo(p: ModoPref) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(CLAVE_MODO, p); } catch { /* sin almacenamiento: vale para esta carga */ }
}

const consulta = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);
const oyentes = new Set<(m: Modo) => void>();
let pref: ModoPref | null = null;
let ultimo: Modo | null = null;
let escuchando = false;

/** Preferencia vigente (la elegida en esta carga o la guardada). */
export const prefActual = (): ModoPref => pref ?? leerModo();
/** Modo resuelto ahora mismo (Sistema → claro u oscuro según prefers-color-scheme). */
export const modoActual = (): Modo => resolverModo(prefActual(), !!consulta()?.matches);

/** Pinta el modo en <html>, actualiza los selectores montados y avisa a quien escucha si el modo resuelto cambió. */
export function aplicarModo(p: ModoPref = prefActual()): Modo {
  pref = p;
  const m = resolverModo(p, !!consulta()?.matches);
  if (typeof document !== 'undefined') {
    const h = document.documentElement;
    h.dataset.modo = m; h.dataset.modoPref = p;
    document.querySelectorAll<HTMLElement>('[data-modo-op]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modoOp === p)));
  }
  if (!escuchando) {
    escuchando = true;
    consulta()?.addEventListener?.('change', () => { if (prefActual() === 'sistema') aplicarModo('sistema'); });
  }
  if (m !== ultimo) { ultimo = m; oyentes.forEach((cb) => cb(m)); }
  return m;
}

/** Se llama cada vez que el modo resuelto cambia (botón o sistema). Devuelve la función para desuscribirse. */
export function alCambiarModo(cb: (m: Modo) => void) { oyentes.add(cb); return () => { oyentes.delete(cb); }; }

/** Grupo de 3 botones con texto (el texto se achica a solo ícono en pantallas estrechas, pero sigue para lectores). */
export const selectorModoHtml = (p: ModoPref = prefActual()) => `<span class="y-modo" role="group" aria-label="Modo de color">${MODOS.map((o) =>
  `<button type="button" data-modo-op="${o.id}" aria-pressed="${o.id === p}" title="${o.titulo}">${svg(ICONO[o.id])}<span class="y-modo-et">${o.nombre}</span></button>`).join('')}</span>`;

/** Monta el selector en `cont` (al final) y lo conecta. */
export function montarSelectorModo(cont: HTMLElement, opc: { antes?: Element | null } = {}) {
  const t = document.createElement('template');
  t.innerHTML = selectorModoHtml();
  const el = t.content.firstElementChild as HTMLElement;
  if (opc.antes) cont.insertBefore(el, opc.antes); else cont.append(el);
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-modo-op]');
    if (!b || !esModoPref(b.dataset.modoOp)) return;
    const p = b.dataset.modoOp;
    guardarModo(p);
    // Cruce suave entre modos donde el navegador lo permite (sin animación si se pidió movimiento reducido).
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
    if (vt && !matchMedia('(prefers-reduced-motion: reduce)').matches) vt.call(document, () => aplicarModo(p));
    else aplicarModo(p);
  });
  return el;
}
