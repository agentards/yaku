// Acceso al Centro de monitoreo: Clerk si hay clave pública (VITE_CLERK_PUBLISHABLE_KEY), si no PIN municipal (plan B
// sin internet). Contrato fijo del plan (agentards/producto/plan-centro-monitoreo.md): Sesion + exigirSesion.
// Este módulo se carga con import dinámico desde main.ts y Clerk (./clerk.ts) con otro import dinámico solo si hay
// clave: el poblador y la vista 2D no pagan ese peso. El servidor es quien valida de verdad (JWT o X-Muni-Pin);
// esta pantalla solo ordena la entrada. El PIN vive solo en memoria de esta pestaña (como en la pantalla de incidentes).
import './acceso.css';
import { IC } from '../vista3d/ui/iconos';

export interface Sesion {
  modo: 'clerk' | 'pin';
  nombre: string;            // para mostrar y para el historial
  usuarioId: string;         // sub de Clerk o 'pin'
  rol: 'operador' | 'monitor';
  cabeceras(): Promise<Record<string, string>>; // { authorization: 'Bearer <jwt fresco>' } o { 'x-muni-pin': pin }
  montarBotonUsuario(el: HTMLElement): void;     // UserButton de Clerk o chip «PIN · Salir»
  salir(): Promise<void>;
}

export const TITULO = 'Yaku 3D · Centro de monitoreo';
export const ROTULO_PIN = 'Acceso con PIN (sin Clerk)';

/** Clave pública de Clerk válida (pk_test_… / pk_live_…) o null si no hay: entonces se usa el PIN. */
export function claveClerk(env: Record<string, unknown> = import.meta.env): string | null {
  const k = String(env.VITE_CLERK_PUBLISHABLE_KEY ?? '').trim();
  return /^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(k) ? k : null;
}

/** Host del Frontend API de Clerk codificado en la clave pública (base64 de «host$»). */
export function frontendApiDe(clave: string): string | null {
  const b64 = clave.split('_')[2];
  if (!b64) return null;
  let host: string;
  try { host = atob(b64.replace(/-/g, '+').replace(/_/g, '/')); } catch { return null; }
  if (!host.endsWith('$')) return null;
  host = host.slice(0, -1);
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? host : null;
}

/** Rol a partir de los claims del token de sesión: sin claim «rol», toda sesión válida opera. */
export function rolDeClaims(claims: Record<string, unknown> | null | undefined): Sesion['rol'] {
  return String(claims?.rol ?? '').trim().toLowerCase() === 'monitor' ? 'monitor' : 'operador';
}

// ---------- modo PIN ----------
export type Pedir = (url: string, init: RequestInit) => Promise<{ status: number }>;
export type ResultadoPin = { ok: true; sesion: Sesion } | { ok: false; error: string };

/**
 * Comprueba el PIN contra el servidor con una lectura protegida (GET /api/incidentes con X-Muni-Pin): 401/403 = PIN
 * incorrecto. Si el servidor no responde (o tarda más de `esperaMs`), la sesión se abre igual y el servidor rechazará
 * cada acción con PIN malo.
 */
export async function entrarConPin(datos: { nombre: string; pin: string }, opc: { pedir?: Pedir; alSalir?: () => void; esperaMs?: number } = {}): Promise<ResultadoPin> {
  const nombre = datos.nombre.trim().slice(0, 60), pin = datos.pin;
  if (!nombre) return { ok: false, error: 'Escribe tu nombre: queda en el historial de cada cambio.' };
  if (!pin) return { ok: false, error: 'Escribe el PIN municipal.' };
  if (pin.length > 32) return { ok: false, error: 'PIN demasiado largo.' };
  const pedir: Pedir = opc.pedir ?? ((u, i) => fetch(u, i));
  const corte = new AbortController();
  const t = setTimeout(() => corte.abort(), opc.esperaMs ?? 5000);
  try {
    const r = await Promise.race([
      pedir('/api/incidentes', { headers: { accept: 'application/json', 'x-muni-pin': pin }, cache: 'no-store', signal: corte.signal }),
      new Promise<never>((_, mal) => corte.signal.addEventListener('abort', () => mal(new Error('tiempo agotado')))),
    ]);
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'PIN incorrecto. Pídelo al responsable del centro de monitoreo.' };
  } catch { /* sin servidor: el servidor valida en cada acción */ } finally { clearTimeout(t); }
  return { ok: true, sesion: sesionPin(nombre, pin, opc.alSalir) };
}

export function sesionPin(nombre: string, pin: string, alSalir: () => void = recargar): Sesion {
  let vigente: string | null = pin;
  const s: Sesion = {
    modo: 'pin', nombre, usuarioId: 'pin', rol: 'operador',
    async cabeceras() {
      if (vigente === null) throw new Error('sesión cerrada');
      return { 'x-muni-pin': vigente };
    },
    montarBotonUsuario(el) {
      el.replaceChildren();
      const chip = document.createElement('span');
      chip.className = 'ycm-acc-chip';
      const t = document.createElement('span');
      t.textContent = `PIN · ${nombre}`;
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Salir';
      b.onclick = () => { void s.salir(); };
      chip.append(t, b);
      el.append(chip);
    },
    async salir() { vigente = null; alSalir(); },
  };
  return s;
}

function recargar() { location.assign(location.pathname + location.search); }

// ---------- pantalla de acceso ----------
let actual: Sesion | null = null;
/** Sesión abierta por exigirSesion en esta pestaña (null antes del acceso): para pantallas que no la reciben. */
export const sesionActual = () => actual;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Muestra la pantalla de acceso (estilo portal) dentro de `cont` hasta que haya sesión. */
export function exigirSesion(cont: HTMLElement): Promise<Sesion> {
  const raiz = document.createElement('div');
  raiz.className = 'ycm-acc';
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-labelledby', 'ycm-acc-titulo');
  raiz.innerHTML = `
    <header class="ycm-acc-top"><span class="ycm-acc-logo">${IC.logo}Yaku 3D <small>· Centro de monitoreo</small></span></header>
    <main class="ycm-acc-cuerpo">
      <section class="ycm-acc-tarjeta">
        <h1 id="ycm-acc-titulo">${esc(TITULO)}</h1>
        <p class="ycm-acc-sub">Acceso para personal municipal. Los reportes vecinales llegan como <b class="ycm-acc-nv">NO VERIFICADO</b> hasta que alguien del centro los valida.</p>
        <div class="ycm-acc-slot" aria-live="polite"></div>
      </section>
    </main>`;
  cont.append(raiz);
  const slot = raiz.querySelector<HTMLElement>('.ycm-acc-slot')!;
  const cerrar = (s: Sesion) => { raiz.remove(); actual = s; return s; };
  const clave = claveClerk();
  if (!clave) return formularioPin(slot, false).then(cerrar);
  return accesoClerk(slot, clave).then(cerrar);
}

async function accesoClerk(slot: HTMLElement, clave: string): Promise<Sesion> {
  slot.innerHTML = '<p class="ycm-acc-estado">Conectando con Clerk…</p>';
  try {
    const { iniciarClerk } = await import('./clerk');
    return await iniciarClerk(slot, clave);
  } catch (e) {
    // Sin internet o Frontend API caído: el PIN sigue disponible (el servidor lo acepta solo con YAKU_PERMITIR_PIN=1).
    slot.innerHTML = `<p class="ycm-acc-error" role="alert">No se pudo conectar con Clerk (${esc((e as Error)?.message || 'sin red')}). Revisa la conexión y recarga.</p>`;
    return formularioPin(slot, true);
  }
}

function formularioPin(slot: HTMLElement, alternativo: boolean): Promise<Sesion> {
  const f = document.createElement('form');
  f.className = 'ycm-acc-pin';
  f.noValidate = true;
  f.innerHTML = `
    <h2>${esc(ROTULO_PIN)}</h2>
    <p class="ycm-acc-nota">${alternativo ? 'Plan B: el servidor solo lo acepta si está habilitado el PIN.' : 'Plan B sin internet: este equipo no tiene configurado Clerk.'} El PIN se queda solo en esta pestaña.</p>
    <label>Tu nombre <input name="nombre" autocomplete="name" maxlength="60" required></label>
    <label>PIN municipal <input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="32" required></label>
    <p class="ycm-acc-error" role="alert" hidden></p>
    <button type="submit" class="ycm-acc-entrar">Entrar</button>`;
  slot.append(f);
  const err = f.querySelector<HTMLElement>('.ycm-acc-error')!, btn = f.querySelector<HTMLButtonElement>('button')!;
  const campo = (n: string) => f.elements.namedItem(n) as HTMLInputElement;
  queueMicrotask(() => campo('nombre').focus());
  return new Promise((ok) => {
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      btn.disabled = true; btn.textContent = 'Comprobando…'; err.hidden = true;
      const r = await entrarConPin({ nombre: campo('nombre').value, pin: campo('pin').value });
      btn.disabled = false; btn.textContent = 'Entrar';
      if (r.ok) return ok(r.sesion);
      err.textContent = r.error; err.hidden = false;
      campo('pin').value = '';
      (campo('nombre').value.trim() ? campo('pin') : campo('nombre')).focus();
    };
  });
}
