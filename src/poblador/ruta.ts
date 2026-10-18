// ¿Arranca el modo poblador? Con ?vista=poblador siempre; sin ?vista, por defecto en celular.
// Cualquier otra ?vista= (2d, 3d, portal, municipalidad…) deja la app técnica. En navegadores automatizados
// (navigator.webdriver) el valor por defecto no aplica, para que las E2E de la vista técnica sigan iguales:
// esas pruebas fuerzan el modo con ?vista=poblador.

export interface Entorno { celular: boolean; automatizado: boolean }

export function esVistaPoblador(search: string, env: Entorno): boolean {
  const v = new URLSearchParams(search).get('vista');
  if (v === 'poblador') return true;
  if (v) return false;
  return env.celular && !env.automatizado;
}

export function entornoActual(): Entorno {
  const mm = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  return {
    celular: mm('(pointer: coarse)') && mm('(max-width: 760px)'),
    automatizado: typeof navigator !== 'undefined' && navigator.webdriver === true,
  };
}

/** Oculta la app técnica al instante (antes de que cargue el módulo del poblador) para que no parpadee. */
export function prepararVistaPoblador() {
  document.documentElement.classList.add('vista-poblador');
  const s = document.createElement('style');
  s.textContent = 'html.vista-poblador body>.top,html.vista-poblador #app{display:none!important}html.vista-poblador body{background:#f3eee4}';
  document.head.append(s);
}
