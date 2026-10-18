// Rutas públicas (plan-landing-yaku-lat.md, «Rutas y dominio»):
//   /               → landing (index.html, src/landing/)
//   /reportar       → app.html, modo poblador (vecino); start_url de la PWA instalada
//   /municipalidad  → app.html, Centro de monitoreo (nombre + PIN)
//   /app            → app.html, app técnica 2D
// Sin DOM: lo usan src/main.ts (qué pantalla arranca) y servidor-local/estaticos.ts, server/worker.ts y el
// plugin de vite.config.ts (qué archivo se sirve y a dónde redirige un enlace viejo).
//
// Dentro de app.html, ?vista= sigue mandando (enlaces y E2E viejos):
//  - ?vista=poblador → modo poblador.
//  - ?vista=portal | municipalidad | incidentes → Centro de monitoreo; «portal» abre la pestaña Escenario.
//  - ?vista=2d, ?vista=3d, ?vista=portal-relevo (o cualquier otra) → app técnica 2D (pública).
// Sin ?vista manda la ruta. En app.html sin ruta conocida (p. ej. /app.html directo) queda lo de antes:
// celular → poblador, escritorio → Centro de monitoreo, navegador automatizado (navigator.webdriver) → app técnica.
/** Igual a Entorno de ./poblador/ruta (copiado aquí: el servidor compila este archivo con NodeNext). */
export interface Entorno { celular: boolean; automatizado: boolean }

export type Pestana = 'portal' | 'municipalidad' | 'incidentes';
export type Ruta = { vista: 'poblador' } | { vista: 'monitoreo'; pestana: Pestana } | { vista: 'tecnica' };

/** Rutas que sirven app.html (sin barra final). */
export const RUTAS_APP = ['/reportar', '/municipalidad', '/app', '/estoy-bien'] as const;
export const ARCHIVO_APP = '/app.html';

const sinBarra = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);

export function esRutaApp(pathname: string): boolean {
  return (RUTAS_APP as readonly string[]).includes(sinBarra(pathname));
}

/**
 * Enlace viejo en la raíz (/?vista=…, de cuando / era la app) → ruta nueva, con el resto de parámetros y el hash.
 * También /reportar/ → /reportar (con barra final fallan las rutas relativas de la app) y /#p=… (enlace relay
 * viejo) → /app#p=…. null = no hay que redirigir.
 */
export function redireccionRuta(pathname: string, search: string, hash = ''): string | null {
  if (pathname !== '/' && pathname !== '/index.html') return esRutaApp(pathname) && pathname.endsWith('/') ? sinBarra(pathname) + search + hash : null;
  const q = new URLSearchParams(search);
  const v = q.get('vista');
  if (v === null) return /^#?p=/.test(hash) ? '/app' + search + hash : null;
  let destino = '/app'; // 3d, portal-relevo u otra: la app técnica sigue leyendo ?vista=
  if (v === 'poblador') { destino = '/reportar'; q.delete('vista'); }
  else if (v === 'municipalidad' || v === 'incidentes') { destino = '/municipalidad'; q.delete('vista'); }
  else if (v === 'portal') destino = '/municipalidad'; // conserva ?vista=portal: abre la pestaña Escenario
  else if (v === '2d' || v === '') q.delete('vista');
  const resto = q.toString();
  return destino + (resto ? '?' + resto : '') + hash;
}

export function decidirRuta(pathname: string, search: string, env: Entorno): Ruta {
  const v = new URLSearchParams(search).get('vista');
  if (v === 'poblador') return { vista: 'poblador' };
  if (v === 'portal' || v === 'municipalidad' || v === 'incidentes') return { vista: 'monitoreo', pestana: v };
  if (v) return { vista: 'tecnica' };
  const p = sinBarra(pathname);
  if (p === '/reportar' || p === '/estoy-bien') return { vista: 'poblador' };
  if (p === '/municipalidad') return { vista: 'monitoreo', pestana: 'municipalidad' };
  if (p === '/app') return { vista: 'tecnica' };
  if (env.automatizado) return { vista: 'tecnica' };
  return env.celular ? { vista: 'poblador' } : { vista: 'monitoreo', pestana: 'portal' };
}
