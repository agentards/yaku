// Notas de zona en el detalle del incidente (Centro de monitoreo). El operador guarda una nota corta sobre la zona
// («puente cerrado, entrar por…»), la ve de nuevo al abrir otro incidente de esa zona y puede corregirla o borrarla.
// Las guarda el servidor en Atomic Memory a nombre del usuario de la sesión (servidor-local/memoria.ts): el navegador
// nunca ve la clave ni elige de quién son. Es contexto del operador: no cambia el respaldo, el estado ni los avisos.
// Si el servidor no tiene Atomic Memory configurado, la sección no aparece.
import { esc } from '../ui/formato';
import type { Cabeceras } from '../municipalidad/api';
import type { Incidente } from '../municipalidad/incidentes';
import type { CentroPoblado } from '../ui/contrato';
import { centroDeIncidentes } from './historico';

export interface NotaZona { id: string; texto: string; zona: string; incidente: string | null; creada: string | null }
export const MAX_NOTA = 280;
export const AVISO_NOTAS = 'Contexto del operador: no cambia el respaldo, el estado ni los avisos.';

export type EstadoNotas =
  | { kind: 'oculto' }
  | { kind: 'cargando'; zona: string }
  | { kind: 'lista'; zona: string; notas: NotaZona[]; editando: string | null }
  | { kind: 'error'; zona: string; error: string };

type Pedir = (url: string, init: RequestInit) => Promise<Response>;
const esObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const leerNota = (x: unknown): NotaZona | null => (esObj(x) && typeof x.id === 'string' && typeof x.texto === 'string' && typeof x.zona === 'string'
  ? { id: x.id, texto: x.texto, zona: x.zona, incidente: typeof x.incidente === 'string' ? x.incidente : null, creada: typeof x.creada === 'string' ? x.creada : null }
  : null);
const errorDe = (j: unknown, status: number) => (esObj(j) && typeof j.error === 'string' ? j.error : `HTTP ${status}`);

/** GET /api/memoria/notas: null = Atomic Memory apagado en el servidor (la sección se oculta). */
export async function traerNotas(q: { zona: string; tipo: string }, cab: Cabeceras, pedir: Pedir = fetch): Promise<{ ok: true; notas: NotaZona[] | null } | { ok: false; error: string }> {
  try {
    const r = await pedir(`/api/memoria/notas?zona=${encodeURIComponent(q.zona)}&tipo=${encodeURIComponent(q.tipo)}`, { cache: 'no-store', headers: { accept: 'application/json', ...(await cab()) } });
    const j: unknown = await r.json().catch(() => null);
    if (r.ok && esObj(j) && j.activa === false) return { ok: true, notas: null };
    if (r.ok && esObj(j) && Array.isArray(j.notas)) return { ok: true, notas: j.notas.map(leerNota).filter((n): n is NotaZona => n !== null) };
    return { ok: false, error: errorDe(j, r.status) };
  } catch { return { ok: false, error: 'Sin conexión con el servidor.' }; }
}

/** POST (guardar o corregir con `reemplaza`) o DELETE. Solo dice «guardada» si el servidor lo confirmó. */
export async function escribirNota(
  p: { kind: 'guardar'; zona: string; texto: string; incidente: string; reemplaza: string | null } | { kind: 'borrar'; id: string },
  cab: Cabeceras, pedir: Pedir = fetch,
): Promise<{ ok: true; mensaje: string } | { ok: false; error: string }> {
  try {
    const r = p.kind === 'guardar'
      ? await pedir('/api/memoria/notas', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json', ...(await cab()) }, body: JSON.stringify({ zona: p.zona, texto: p.texto, incidente: p.incidente, ...(p.reemplaza ? { reemplaza: p.reemplaza } : {}) }) })
      : await pedir(`/api/memoria/notas/${encodeURIComponent(p.id)}`, { method: 'DELETE', cache: 'no-store', headers: { accept: 'application/json', ...(await cab()) } });
    const j: unknown = await r.json().catch(() => null);
    if (!r.ok || !esObj(j)) return { ok: false, error: errorDe(j, r.status) };
    if (p.kind === 'borrar') {
      if (j.borrada === true) return { ok: true, mensaje: 'Nota borrada de Atomic Memory.' };
      if (j.resultado === 'no_existe') return { ok: true, mensaje: 'La nota ya no estaba guardada.' };
      return { ok: false, error: 'El servidor no confirmó el borrado.' };
    }
    if (j.guardada !== true) return { ok: false, error: 'El servidor no confirmó el guardado.' };
    if (j.anterior === 'no_borrada') return { ok: true, mensaje: 'Corrección guardada, pero la nota anterior no se pudo borrar: bórrala a mano.' };
    return { ok: true, mensaje: p.reemplaza ? 'Corrección guardada en Atomic Memory.' : 'Nota guardada en Atomic Memory.' };
  } catch { return { ok: false, error: p.kind === 'borrar' ? 'Sin conexión con el servidor: la nota NO se borró.' : 'Sin conexión con el servidor: la nota NO se guardó.' }; }
}

/** Zona de un incidente para las notas: el centro poblado más cercano (≤ 3 km) o, si no hay, la celda de ~1 km. */
type CentroZona = Pick<CentroPoblado, 'cod' | 'n' | 'd' | 'lat' | 'lon'>;
export function zonaDe(i: Pick<Incidente, 'id' | 'lat' | 'lon'>, centros: CentroZona[], porCod: ReadonlyMap<string, CentroZona>): string | null {
  if (!centros.length) return null; // aún cargando: no se busca con una zona provisional
  const c = porCod.get(centroDeIncidentes([i], centros).get(i.id) ?? '');
  return c ? `${c.n} (${c.d})` : `Cerca de ${i.lat.toFixed(2)}, ${i.lon.toFixed(2)}`;
}

const fecha = (iso: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && Number.isFinite(d.getTime()) ? d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
};

/** Sección completa (pura). `mensaje` es la línea de resultado de la última escritura. */
export function notasHtml(e: EstadoNotas, mensaje: { ok: boolean; txt: string } | null = null) {
  if (e.kind === 'oculto') return '';
  const cab = `<h3>Notas de zona <small>${esc(e.zona)}</small></h3>`;
  const pie = `<p class="mon-mem-aviso">${esc(AVISO_NOTAS)} Las guarda Atomic Memory y solo las ve tu usuario. No escribas datos personales de vecinos.</p>`;
  const msg = mensaje ? `<p class="mon-mem-msg ${mensaje.ok ? 'ok' : 'error'}" role="status">${esc(mensaje.txt)}</p>` : '<p class="mon-mem-msg" role="status"></p>';
  if (e.kind === 'cargando') return `${cab}<div class="cuerpo"><p class="mon-mem-vacio">Buscando notas de esta zona…</p>${pie}</div>`;
  if (e.kind === 'error') return `${cab}<div class="cuerpo"><p class="mon-mem-msg error" role="status">${esc(e.error)}</p><button type="button" class="v3d-b" data-mem-reintentar>Reintentar</button>${pie}</div>`;
  const editando = e.notas.find((n) => n.id === e.editando) ?? null;
  const lista = e.notas.length
    ? `<ul class="mon-mem-lista">${e.notas.map((n) => `<li data-nota="${esc(n.id)}"${n.id === e.editando ? ' aria-current="true"' : ''}><p>${esc(n.texto)}</p>
        <small>${esc(fecha(n.creada))}</small><span class="mon-mem-acc"><button type="button" data-mem-corregir="${esc(n.id)}">Corregir</button><button type="button" data-mem-borrar="${esc(n.id)}">Borrar</button></span></li>`).join('')}</ul>`
    : '<p class="mon-mem-vacio">Aún no guardaste notas para esta zona.</p>';
  return `${cab}<div class="cuerpo">${lista}
    <form class="mon-mem-form" data-mem-form>
      <label for="mon-mem-texto">${editando ? 'Corregir nota' : 'Nueva nota de zona'}</label>
      <textarea id="mon-mem-texto" name="texto" rows="2" maxlength="${MAX_NOTA}" required minlength="3" placeholder="Ej.: Puente cerrado por maquinaria; entrar por Av. Guardia Civil.">${editando ? esc(editando.texto) : ''}</textarea>
      <div class="mon-mem-botones"><button type="submit" class="v3d-b pri">${editando ? 'Guardar corrección' : 'Guardar nota'}</button>${editando ? '<button type="button" class="v3d-b" data-mem-cancelar>Cancelar</button>' : ''}</div>
    </form>${msg}${pie}</div>`;
}

/** Monta la sección en `el` y la mantiene al día con el incidente abierto. */
export function montarNotasZona(el: HTMLElement, cab: Cabeceras) {
  let estado: EstadoNotas = { kind: 'oculto' };
  let clave = '', incidente = '', tipo = '', ocupado = false, confirmar: string | null = null;
  let mensaje: { ok: boolean; txt: string } | null = null;

  const pintar = () => {
    el.hidden = estado.kind === 'oculto';
    el.innerHTML = notasHtml(estado, mensaje);
    if (confirmar) el.querySelector<HTMLButtonElement>(`[data-mem-borrar="${CSS.escape(confirmar)}"]`)?.replaceChildren('¿Borrar? Confirmar');
  };
  async function cargar(zona: string) {
    const k = clave;
    estado = { kind: 'cargando', zona }; pintar();
    const r = await traerNotas({ zona, tipo }, cab);
    if (k !== clave) return; // el operador ya abrió otro incidente
    estado = !r.ok ? { kind: 'error', zona, error: r.error } : r.notas === null ? { kind: 'oculto' } : { kind: 'lista', zona, notas: r.notas, editando: null };
    pintar();
  }
  async function escribir(p: Parameters<typeof escribirNota>[0]) {
    if (ocupado || estado.kind !== 'lista') return;
    ocupado = true;
    el.querySelectorAll('button, textarea').forEach((b) => b.setAttribute('disabled', ''));
    const zona = estado.zona;
    const k = clave;
    const r = await escribirNota(p, cab);
    ocupado = false;
    if (k !== clave) return; // la escritura terminó después de abrir otro incidente
    confirmar = null;
    mensaje = r.ok ? { ok: true, txt: r.mensaje } : { ok: false, txt: r.error };
    if (!r.ok) {
      // Se conserva el texto escrito para reintentar: nada se dio por guardado.
      const texto = p.kind === 'guardar' ? p.texto : '';
      pintar();
      const ta = el.querySelector<HTMLTextAreaElement>('textarea');
      if (ta && texto) ta.value = texto;
      return;
    }
    const l = await traerNotas({ zona, tipo }, cab);
    if (k !== clave) return;
    estado = l.ok && l.notas ? { kind: 'lista', zona, notas: l.notas, editando: null } : { kind: 'error', zona, error: l.ok ? 'Atomic Memory se apagó en el servidor.' : l.error };
    pintar();
  }

  el.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (estado.kind !== 'lista') return;
    const texto = (el.querySelector<HTMLTextAreaElement>('textarea')?.value ?? '').replace(/\s+/g, ' ').trim();
    if (texto.length < 3) { mensaje = { ok: false, txt: 'Escribe al menos 3 caracteres.' }; return pintar(); }
    void escribir({ kind: 'guardar', zona: estado.zona, texto, incidente, reemplaza: estado.editando });
  });
  el.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest('[data-mem-reintentar]') && estado.kind === 'error') return void cargar(estado.zona);
    if (estado.kind !== 'lista' || ocupado) return;
    const corr = t.closest<HTMLElement>('[data-mem-corregir]')?.dataset.memCorregir;
    if (corr) { estado = { ...estado, editando: corr }; mensaje = null; confirmar = null; pintar(); el.querySelector<HTMLTextAreaElement>('textarea')?.focus(); return; }
    if (t.closest('[data-mem-cancelar]')) { estado = { ...estado, editando: null }; pintar(); return; }
    const bor = t.closest<HTMLElement>('[data-mem-borrar]')?.dataset.memBorrar;
    if (bor && confirmar !== bor) { confirmar = bor; pintar(); return; }
    if (bor) void escribir({ kind: 'borrar', id: bor });
  });

  return {
    /** Incidente abierto y su zona (null mientras no se conoce: centros poblados cargando). */
    mostrar(i: { id: string; tipo: string } | null, zona: string | null) {
      const k = i && zona ? `${i.id}|${zona}` : '';
      if (k === clave) return;
      clave = k; mensaje = null; confirmar = null;
      if (!i || !zona) { estado = { kind: 'oculto' }; pintar(); return; }
      incidente = i.id; tipo = i.tipo;
      void cargar(zona);
    },
  };
}
