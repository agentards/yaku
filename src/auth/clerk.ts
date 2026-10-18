// Clerk (solo se carga si hay VITE_CLERK_PUBLISHABLE_KEY; import dinámico desde ./sesion.ts).
// @clerk/clerk-js 6 trae la lógica; los componentes visuales (SignIn, UserButton) los sirve el Frontend API de la
// propia instancia de Clerk (host codificado en la clave pública, el único origen externo permitido por el plan).
// Si esa carga falla, ./sesion.ts ofrece el acceso con PIN.
import { Clerk } from '@clerk/clerk-js';
import { esMX } from '@clerk/localizations/es-MX';
import { frontendApiDe, rolDeClaims, type Sesion } from './sesion';

type CtorUI = NonNullable<NonNullable<Parameters<Clerk['load']>[0]>['ui']>['ClerkUI'];
const ESPERA_MS = 15000;

function cargarUI(host: string): Promise<CtorUI> {
  const w = window as unknown as { __internal_ClerkUICtor?: CtorUI };
  if (w.__internal_ClerkUICtor) return Promise.resolve(w.__internal_ClerkUICtor);
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = `https://${host}/npm/@clerk/ui@1/dist/ui.browser.js`;
    s.async = true; s.crossOrigin = 'anonymous';
    s.dataset.clerkUiScript = '';
    const t = setTimeout(() => mal(new Error('tiempo agotado')), ESPERA_MS);
    s.onload = () => { clearTimeout(t); w.__internal_ClerkUICtor ? ok(w.__internal_ClerkUICtor) : mal(new Error('interfaz de Clerk incompleta')); };
    s.onerror = () => { clearTimeout(t); mal(new Error('sin red')); };
    document.head.append(s);
  });
}

/** Claims del JWT (sin verificar: la verificación la hace el servidor; aquí solo se lee el rol para la interfaz). */
function claims(jwt: string | null): Record<string, unknown> | null {
  try {
    const p = jwt!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(p))));
  } catch { return null; }
}

const APARIENCIA = {
  variables: { colorPrimary: '#c4501b', colorBackground: '#fffdf9', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif', borderRadius: '10px' },
};

export async function iniciarClerk(slot: HTMLElement, clave: string): Promise<Sesion> {
  const host = frontendApiDe(clave);
  if (!host) throw new Error('clave pública de Clerk inválida');
  const ui = await cargarUI(host);
  const clerk = new Clerk(clave);
  const aqui = () => location.pathname + location.search;
  await clerk.load({
    ui: { ClerkUI: ui }, localization: esMX, appearance: APARIENCIA,
    // Navegación dentro de la app (sin recargar): tras entrar se queda en la misma ?vista.
    routerPush: (to: string) => history.pushState(null, '', to),
    routerReplace: (to: string) => history.replaceState(null, '', to),
    signInForceRedirectUrl: aqui(), afterSignOutUrl: aqui(),
  });
  if (!clerk.user || !clerk.session) {
    slot.replaceChildren();
    const caja = document.createElement('div');
    caja.className = 'ycm-acc-clerk';
    slot.append(caja);
    clerk.mountSignIn(caja, { routing: 'hash', withSignUp: false, forceRedirectUrl: aqui() });
    await new Promise<void>((ok) => {
      const quitar = clerk.addListener((r) => { if (r.user && r.session) { quitar(); ok(); } });
    });
    clerk.unmountSignIn(caja);
    if (location.hash.startsWith('#/')) history.replaceState(null, '', aqui());
  }
  const u = clerk.user!;
  const rol = rolDeClaims(claims(await clerk.session!.getToken()));
  return {
    modo: 'clerk',
    nombre: u.fullName || u.username || u.primaryEmailAddress?.emailAddress || 'Usuario municipal',
    usuarioId: u.id,
    rol,
    async cabeceras() {
      // getToken() devuelve un JWT vigente (Clerk lo renueva antes de vencer); sin sesión, error explícito.
      const jwt = await clerk.session?.getToken();
      if (!jwt) throw new Error('sesión de Clerk cerrada');
      return { authorization: `Bearer ${jwt}` };
    },
    montarBotonUsuario(el) {
      const div = document.createElement('div');
      div.className = 'ycm-acc-usuario';
      el.replaceChildren(div);
      clerk.mountUserButton(div);
    },
    async salir() { await clerk.signOut({ redirectUrl: aqui() }); },
  };
}
