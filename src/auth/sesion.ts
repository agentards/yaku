// Acceso al Centro de monitoreo: usuario + contraseña de la municipalidad (en la base SQLite del servidor). El
// servidor devuelve un token de sesión que este equipo guarda (localStorage): recargar o cambiar de región (Piura ↔
// Lima) no vuelve a pedir la contraseña hasta que la sesión venza (72 h por defecto) o alguien toque «Salir».
// Si el servidor no tiene /api/sesion (p. ej. la versión de Cloudflare), se entra como antes con el PIN.
// Solo se piden usuario y contraseña: el nombre del chip y del historial («quien») es el que devuelve el servidor para
// ese usuario (MUNI_NOMBRE, por defecto «Municipio central»). Con el PIN de respaldo, el usuario escrito o «Municipio».
// Contrato fijo del plan del Centro de monitoreo: Sesion + exigirSesion. Se carga con import dinámico desde main.ts.
import './acceso.css';
import { IC } from '../vista3d/ui/iconos';
import { aplicarModo, montarSelectorModo } from '../vista3d/ui/modo';
import { ROTULO_VECINAL } from '../poblador/textos';

export interface Sesion {
  modo: 'usuario' | 'pin';
  nombre: string;            // para mostrar y para el historial
  usuarioId: string;         // usuario de la municipalidad o 'pin'
  rol: 'operador';
  cabeceras(): Promise<Record<string, string>>; // { authorization: 'Bearer …' } o { 'x-muni-pin': pin }
  montarBotonUsuario(el: HTMLElement): void;     // chip «nombre · Salir»
  salir(): Promise<void>;
}

export const TITULO = 'Yaku 3D · Centro de monitoreo';
export const ROTULO_PIN = 'Acceso del personal municipal';
// CLAVE_NOMBRE: nombre de operador que pasa una integración a entrar(); el de antes («yaku-muni-nombre», escrito en el
// formulario viejo) ya no se usa y se borra al restaurar, para que el chip muestre el nombre que da el servidor.
const CLAVE_SESION = 'yaku-muni-sesion', CLAVE_NOMBRE = 'yaku-muni-operador', CLAVE_USUARIO = 'yaku-muni-usuario', CLAVE_NOMBRE_VIEJA = 'yaku-muni-nombre';

export interface SesionGuardada { token: string; usuario: string; nombre: string; expira: number }
export type Respuesta = { status: number; json?: () => Promise<any> };
export type Pedir = (url: string, init: RequestInit) => Promise<Respuesta>;
export type ResultadoPin = { ok: true; sesion: Sesion } | { ok: false; error: string };

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: dura esta pestaña */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* nada */ } },
};
export function sesionGuardada(ahora = Date.now()): SesionGuardada | null {
  try {
    const g = JSON.parse(ls.get(CLAVE_SESION) ?? 'null') as SesionGuardada | null;
    return g && typeof g.token === 'string' && g.expira > ahora ? g : null;
  } catch { return null; }
}
const porDefecto: Pedir = (u, i) => fetch(u, i);

/** Sesión con token (usuario de la municipalidad). `operador` = el nombre que se ve y queda en el historial. */
export function sesionToken(g: SesionGuardada, operador: string, opc: { pedir?: Pedir; alSalir?: () => void } = {}): Sesion {
  let vigente: string | null = g.token;
  const nombre = operador.trim() || g.nombre;
  const s: Sesion = {
    modo: 'usuario', nombre, usuarioId: g.usuario, rol: 'operador',
    async cabeceras() {
      if (vigente === null) throw new Error('sesión cerrada');
      return { authorization: `Bearer ${vigente}` };
    },
    montarBotonUsuario(el) { chip(el, nombre, () => void s.salir()); },
    async salir() {
      const t = vigente; vigente = null;
      ls.del(CLAVE_SESION);
      try { if (t) await (opc.pedir ?? porDefecto)('/api/sesion', { method: 'DELETE', headers: { authorization: `Bearer ${t}` } }); } catch { /* sin red: vence sola */ }
      (opc.alSalir ?? recargar)();
    },
  };
  return s;
}

/**
 * Usuario + contraseña → token guardado en este equipo. Sin /api/sesion (404) se entra con el PIN como antes.
 * `nombre` (opcional) solo lo usan integraciones: la pantalla de acceso ya no lo pide.
 */
export async function entrar(datos: { usuario: string; clave: string; nombre?: string }, opc: { pedir?: Pedir; alSalir?: () => void; esperaMs?: number } = {}): Promise<ResultadoPin> {
  const usuario = datos.usuario.trim().toLowerCase(), clave = datos.clave, operador = (datos.nombre ?? '').trim().slice(0, 60);
  if (!usuario) return { ok: false, error: 'Escribe tu usuario (por ejemplo «central»).' };
  if (!clave) return { ok: false, error: 'Escribe la contraseña.' };
  const pedir = opc.pedir ?? porDefecto;
  let r: Respuesta;
  try {
    r = await pedir('/api/sesion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario, clave }), cache: 'no-store' });
  } catch { return { ok: false, error: 'No hay conexión con el servidor. Revisa el internet y vuelve a intentar.' }; }
  if (r.status === 404) return entrarConPin({ nombre: operador || (usuario === 'central' ? 'Municipio' : usuario), pin: clave }, opc); // servidor sin usuarios
  if (r.status === 429) return { ok: false, error: 'Demasiados intentos desde esta conexión. Espera unos minutos y vuelve a intentar.' };
  if (r.status === 401 || r.status === 403) return { ok: false, error: 'Usuario o contraseña incorrectos.' };
  if (r.status !== 200 || !r.json) return { ok: false, error: `El servidor respondió ${r.status}. Vuelve a intentar.` };
  const j = await r.json();
  const g: SesionGuardada = { token: String(j.token), usuario: String(j.usuario), nombre: String(j.nombre ?? usuario), expira: Number(j.expira) };
  ls.set(CLAVE_SESION, JSON.stringify(g)); ls.set(CLAVE_USUARIO, g.usuario);
  if (operador) ls.set(CLAVE_NOMBRE, operador); else ls.del(CLAVE_NOMBRE);
  return { ok: true, sesion: sesionToken(g, operador, opc) };
}

/** La sesión guardada en este equipo, si el servidor la reconoce. Sin red, se confía en la guardada hasta que venza. */
export async function restaurarSesion(opc: { pedir?: Pedir; alSalir?: () => void; ahora?: number } = {}): Promise<Sesion | null> {
  ls.del(CLAVE_NOMBRE_VIEJA);
  const g = sesionGuardada(opc.ahora);
  if (!g) return null;
  try {
    const r = await (opc.pedir ?? porDefecto)('/api/sesion', { headers: { authorization: `Bearer ${g.token}` }, cache: 'no-store' });
    if (r.status === 401) { ls.del(CLAVE_SESION); return null; }
  } catch { /* sin red: el servidor la validará en cada consulta */ }
  return sesionToken(g, ls.get(CLAVE_NOMBRE) ?? '', opc);
}

// ---------- PIN (compatibilidad: servidor sin usuarios, p. ej. la versión de Cloudflare) ----------
/**
 * Comprueba el PIN con una lectura protegida (GET /api/incidentes con X-Muni-Pin): 401/403 = PIN incorrecto. Si el
 * servidor no responde, la sesión se abre igual y el servidor rechazará cada acción con PIN malo.
 */
export async function entrarConPin(datos: { nombre: string; pin: string }, opc: { pedir?: Pedir; alSalir?: () => void; esperaMs?: number } = {}): Promise<ResultadoPin> {
  const nombre = datos.nombre.trim().slice(0, 60), pin = datos.pin;
  if (!nombre) return { ok: false, error: 'Escribe tu nombre: queda en el historial de cada cambio.' };
  if (!pin) return { ok: false, error: 'Escribe el PIN municipal.' };
  if (pin.length > 64) return { ok: false, error: 'PIN demasiado largo.' };
  const pedir: Pedir = opc.pedir ?? porDefecto;
  const corte = new AbortController();
  const t = setTimeout(() => corte.abort(), opc.esperaMs ?? 5000);
  try {
    const r = await Promise.race([
      pedir('/api/incidentes', { headers: { accept: 'application/json', 'x-muni-pin': pin }, cache: 'no-store', signal: corte.signal }),
      new Promise<never>((_, mal) => corte.signal.addEventListener('abort', () => mal(new Error('tiempo agotado')))),
    ]);
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'PIN incorrecto. Pídelo al responsable del centro de monitoreo.' };
    if (r.status === 429) return { ok: false, error: 'Demasiados intentos con PIN incorrecto desde esta conexión. Espera unos minutos y vuelve a intentar.' };
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
    montarBotonUsuario(el) { chip(el, `PIN · ${nombre}`, () => void s.salir()); },
    async salir() { vigente = null; alSalir(); },
  };
  return s;
}

function chip(el: HTMLElement, texto: string, salir: () => void) {
  el.replaceChildren();
  const c = document.createElement('span');
  c.className = 'ycm-acc-chip';
  const t = document.createElement('span');
  t.textContent = texto;
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = 'Salir';
  b.onclick = salir;
  c.append(t, b);
  el.append(c);
}

function recargar() { location.assign(location.pathname + location.search); }

// ---------- pantalla de acceso ----------
let actual: Sesion | null = null;
/** Sesión abierta por exigirSesion en esta pestaña (null antes del acceso): para pantallas que no la reciben. */
export const sesionActual = () => actual;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Si este equipo ya tiene una sesión válida, entra directo; si no, muestra la pantalla de acceso (estilo portal). */
export async function exigirSesion(cont: HTMLElement): Promise<Sesion> {
  aplicarModo(); // Claro / Oscuro / Sistema, el mismo que guarda el Centro de monitoreo
  const previa = await restaurarSesion();
  if (previa) { actual = previa; return previa; }
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
        <p class="ycm-acc-sub">Acceso para personal municipal. Los reportes de los vecinos llegan como <b class="ycm-acc-nv">${esc(ROTULO_VECINAL)}</b> hasta que alguien de la municipalidad los valida.</p>
        <div class="ycm-acc-slot" aria-live="polite"></div>
      </section>
    </main>`;
  cont.append(raiz);
  montarSelectorModo(raiz.querySelector<HTMLElement>('.ycm-acc-top')!);
  const slot = raiz.querySelector<HTMLElement>('.ycm-acc-slot')!;
  const s = await formulario(slot);
  raiz.remove(); actual = s;
  return s;
}

function formulario(slot: HTMLElement): Promise<Sesion> {
  const f = document.createElement('form');
  f.className = 'ycm-acc-pin';
  f.noValidate = true;
  f.innerHTML = `
    <h2>${esc(ROTULO_PIN)}</h2>
    <p class="ycm-acc-nota">La sesión queda guardada en este equipo (también al cambiar de región). Toca «Salir» si es un equipo compartido.</p>
    <label>Usuario <input name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="32" required></label>
    <label>Contraseña <input name="clave" type="password" autocomplete="current-password" maxlength="64" required></label>
    <p class="ycm-acc-error" role="alert" hidden></p>
    <button type="submit" class="ycm-acc-entrar">Entrar</button>`;
  slot.append(f);
  const err = f.querySelector<HTMLElement>('.ycm-acc-error')!, btn = f.querySelector<HTMLButtonElement>('button')!;
  const campo = (n: string) => f.elements.namedItem(n) as HTMLInputElement;
  campo('usuario').value = ls.get(CLAVE_USUARIO) ?? 'central';
  queueMicrotask(() => campo('clave').focus());
  return new Promise((ok) => {
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      btn.disabled = true; btn.textContent = 'Comprobando…'; err.hidden = true;
      const r = await entrar({ usuario: campo('usuario').value, clave: campo('clave').value });
      btn.disabled = false; btn.textContent = 'Entrar';
      if (r.ok) return ok(r.sesion);
      err.textContent = r.error; err.hidden = false;
      campo('clave').value = '';
      campo('clave').focus();
    };
  });
}
