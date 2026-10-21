// Panel derecho del Centro de monitoreo (cajón en celular): Incidentes (lista por prioridad + detalle con galería,
// respaldo, historial y acciones) · Campo (centros poblados del escenario e incidentes cercanos) · Escenario (capas
// oficiales, resumen de escenario.ts y eventos del histórico real). Sin «Modo demo SIMULADO».
import type { CentroPoblado, EscenaYaku } from '../ui/contrato';
import type { Pestana, Tienda } from '../ui/tienda';
import { montarCapas } from '../ui/capas';
import { resumenEscenarioHtml } from '../ui/panel';
import { nivelTxt } from '../ui/datos';
import { altitudTxt, coberturaTxt, dms, esc, FUENTE_CENTRO, num } from '../ui/formato';
import { eventosOficiales, fechaHora, ventanaSenamhi } from '../ui/tiempo';
import { IC } from '../ui/iconos';
import { cerrado, type Incidente } from '../municipalidad/incidentes';
import { ESTADO, ORDEN_TXT, tipoTxt } from '../municipalidad/textos';
import { centroDeIncidentes, incidentesCerca, type EventoMon } from './historico';
import { chipEstado, claseEstado, detalleHtml, filaHtml, tono, type Ctx } from './piezas';
import { montarNotasZona, zonaDe } from './memoria';
import type { Cabeceras } from '../municipalidad/api';

const TITULOS: Partial<Record<Pestana, string>> = { incidentes: 'Incidentes', campo: 'Campo · centros poblados', escenario: 'Escenario oficial' };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface Enlace {
  lista(): Incidente[];
  actual(): string | null;
  ctx(i: Incidente): Ctx;
  enVivo(): boolean;
  enfocar(id: string): void;
  cerrarDetalle(): void;
  accionar(id: string, destino: string, accion?: string): void;
  abrirGaleria(fotos: string[], k: number): void;
  eventos(): EventoMon[];
  irA(t: number): void;
  cerrarCajon(): void;
  /** Descarga con la sesión las fotos (<img data-foto>) recién pintadas en `el` (./fotos.ts). */
  hidratar(el: ParentNode): void;
  /** Cabeceras de la sesión (notas de zona, ./memoria.ts). */
  cabeceras: Cabeceras;
}

export function montarPanelMonitoreo(aside: HTMLElement, tienda: Tienda, escena: EscenaYaku, en: Enlace) {
  aside.innerHTML = `
    <div class="v3d-asa"><h2 data-titulo>Incidentes</h2><button type="button" data-cerrar>Cerrar</button></div>
    <div class="v3d-panel-cuerpo">
      <div data-p="incidentes">
        <div class="v3d-kpis mon-kpis" data-kpis></div>
        <p class="mon-orden">${esc(ORDEN_TXT)} <span data-momento></span></p>
        <section class="v3d-card mon-det" data-det hidden></section>
        <section class="v3d-card mon-memoria" data-memoria hidden aria-label="Notas de zona"></section>
        <ol class="mon-lista" data-lista aria-live="polite"></ol>
        <p class="v3d-mas" data-vacia></p>
      </div>
      <div data-p="campo" hidden>
        <section class="v3d-card v3d-det" data-cdet hidden></section>
        <section class="v3d-card"><h3>Centros poblados del escenario CENEPRED <small data-n></small></h3>
          <div class="v3d-buscar">
            <input type="search" data-q placeholder="Buscar centro poblado o distrito" aria-label="Buscar centro poblado o distrito" />
            <button type="button" class="v3d-filtro" data-f="sincob" aria-pressed="false">Sin cobertura garantizada (OSIPTEL)</button>
            <button type="button" class="v3d-filtro" data-f="coninc" aria-pressed="false">Con incidentes cerca</button>
          </div>
          <ul class="v3d-centros" data-centros></ul><p class="v3d-mas" data-mas></p>
        </section>
      </div>
      <div data-p="escenario" hidden>
        <section class="v3d-card"><h3>Capas oficiales <small>casilla y opacidad</small></h3><div data-capas><p class="v3d-mas">Cargando capas…</p></div></section>
        <section class="v3d-card"><h3>Resumen del escenario <small>CENEPRED/SIGRID</small></h3><div class="cuerpo" data-resumen></div></section>
        <section class="v3d-card"><h3>Eventos del histórico <small>clic: mover el cabezal</small></h3><ul class="v3d-eventos" data-eventos></ul></section>
      </div>
    </div>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => aside.querySelector<T>(s)!;
  $<HTMLButtonElement>('[data-cerrar]').onclick = en.cerrarCajon;
  const notas = montarNotasZona($('[data-memoria]'), en.cabeceras);

  function pestana(p: Pestana) {
    $('[data-titulo]').textContent = TITULOS[p] ?? '';
    aside.querySelectorAll<HTMLElement>('[data-p]').forEach((d) => (d.hidden = d.dataset.p !== p));
    if (p === 'incidentes') incidentes(true);
    if (p === 'campo') { centros(); detalleCentro(); }
    if (p === 'escenario') eventos();
  }
  tienda.on('pestana', pestana);

  // ---------- Incidentes ----------
  let firmaLista = '', firmaDet = '';
  function incidentes(forzar = false) {
    const xs = en.lista();
    const ab = xs.filter((i) => !cerrado(i));
    $('[data-kpis]').innerHTML = `
      <div class="v3d-kpi acc"><b data-k="abiertos">${ab.length}</b><span>incidentes abiertos</span></div>
      <div class="v3d-kpi"><b data-k="vecinos">${ab.reduce((s, i) => s + i.personas, 0)}</b><span>vecinos reportan</span></div>
      <div class="v3d-kpi"><b data-k="sinrevisar">${ab.filter((i) => i.estado === 'nuevo').length}</b><span>sin revisar</span></div>`;
    $('[data-momento]').textContent = en.enVivo() ? '' : `· viendo el ${fechaHora(tienda.t)}`;
    const actual = en.actual();
    const f = xs.map((i) => `${i.id}:${i.estado}:${i.accion}:${i.personas}:${i.nFotos}:${i.puntaje}:${!!en.ctx(i).antes}`).join(';') + '|' + actual;
    if (forzar || f !== firmaLista) {
      firmaLista = f;
      let sep = false;
      $('[data-lista]').innerHTML = xs.map((i) => {
        const s = cerrado(i) && !sep ? ((sep = true), '<li class="mon-sep">Cerrados</li>') : '';
        return s + filaHtml(i, en.ctx(i), actual === i.id);
      }).join('');
      // Miniatura que no carga (foto aún subiendo): se quita y queda el ícono del tipo.
      $('[data-lista]').querySelectorAll<HTMLImageElement>('.mon-i-vis img').forEach((img) => (img.onerror = () => img.remove()));
      en.hidratar($('[data-lista]'));
      $('[data-vacia]').textContent = xs.length ? '' : en.enVivo() ? 'Esperando reportes de vecinos…' : 'Ningún incidente hasta este punto de la línea de tiempo.';
    }
    const i = xs.find((x) => x.id === actual) ?? null;
    const det = $('[data-det]');
    det.hidden = !i;
    notas.mostrar(i, i && zonaDe(i, tienda.centros, tienda.porCod));
    if (!i) { firmaDet = ''; return; }
    const c = en.ctx(i);
    const fd = `${i.id}|${i.estado}|${i.accion}|${i.personas}|${i.fotos.join(',')}|${i.historial.length}|${i.puntaje}|${c.puede}|${c.motivoNo}|${!!c.antes}`;
    if (!forzar && fd === firmaDet) return;
    firmaDet = fd;
    det.dataset.id = i.id; det.dataset.tono = tono(i);
    det.classList.toggle('vida', i.tipo === 'atrapados' || i.tipo === 'heridos');
    det.innerHTML = detalleHtml(i, c);
    det.querySelectorAll<HTMLImageElement>('.muni-foto img').forEach((img) => (img.onerror = () => img.parentElement!.classList.add('rota')));
    en.hidratar(det);
  }
  $('[data-lista]').addEventListener('click', (e) => { const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-id]'); if (li) { en.enfocar(li.dataset.id!); } });
  $('[data-det]').addEventListener('click', (e) => {
    const t = e.target as HTMLElement, id = $('[data-det]').dataset.id!;
    if (t.closest('[data-cerrar-detalle]')) return en.cerrarDetalle();
    const b = t.closest<HTMLButtonElement>('.mon-acc');
    if (b) return en.accionar(id, b.dataset.destino!, b.dataset.accion);
    const fo = t.closest<HTMLElement>('button.muni-foto');
    const inc = en.lista().find((x) => x.id === id);
    if (fo && inc) en.abrirGaleria(inc.fotos, Math.min(+fo.dataset.k!, inc.fotos.length - 1));
  });

  // ---------- Campo ----------
  const filtros = { sincob: false, coninc: false };
  const q = $<HTMLInputElement>('[data-q]');
  function centros() {
    if (tienda.pestana !== 'campo') return;
    const porCentro = new Map<string, number>();
    for (const cod of centroDeIncidentes(en.lista().filter((i) => !cerrado(i)), tienda.centros).values()) porCentro.set(cod, (porCentro.get(cod) ?? 0) + 1);
    const txt = norm(q.value.trim());
    const xs = tienda.centros
      .filter((c) => (!filtros.sincob || c.cg === false) && (!filtros.coninc || porCentro.has(c.cod)) && (!txt || norm(`${c.n} ${c.d} ${c.pr}`).includes(txt)))
      .sort((a, b) => (porCentro.get(b.cod) ?? 0) - (porCentro.get(a.cod) ?? 0) || b.r - a.r || +(a.cg === false ? 0 : 1) - +(b.cg === false ? 0 : 1) || b.pob - a.pob);
    const max = 80;
    $('[data-n]').textContent = `${num(xs.length)} de ${num(tienda.centros.length)}`;
    $('[data-centros]').innerHTML = xs.slice(0, max).map((c) => {
      const n = porCentro.get(c.cod) ?? 0, cob = coberturaTxt(c);
      return `<li><button type="button" data-cod="${esc(c.cod)}" aria-current="${tienda.seleccion?.cod === c.cod}">
        <span class="ic${n ? ' mon-ic-inc' : ''}" title="${n ? `${n} incidente(s) abierto(s) a ≤ 3 km` : 'Nivel de exposición'}">${n ? n : nivelTxt(c.r).split(' ').map((w) => w[0]).join('')}</span>
        <span class="n">${esc(c.n)}<small>${esc(c.d)} · ${esc(c.pr)} · pob. ${num(c.pob)}</small></span>
        <span class="der"><span class="v3d-niv r${c.r}">${esc(nivelTxt(c.r))}</span><span class="v3d-cob ${cob.clase}">${c.cg === false ? 'sin cob. garantizada' : c.cg === null ? 'sin dato OSIPTEL' : 'con cobertura'}</span>${n ? `<span class="mon-cerca">${n} incidente${n > 1 ? 's' : ''} cerca</span>` : ''}</span>
      </button></li>`;
    }).join('');
    $('[data-mas]').textContent = xs.length > max ? `Mostrando ${max} de ${num(xs.length)}: escriba para filtrar.` : xs.length ? '' : 'Ningún centro poblado coincide.';
  }
  let tq = 0;
  q.oninput = () => { clearTimeout(tq); tq = window.setTimeout(centros, 120); };
  aside.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.f as keyof typeof filtros;
    filtros[k] = !filtros[k]; b.setAttribute('aria-pressed', String(filtros[k])); centros();
  }));
  $('[data-centros]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cod]');
    const c = b && tienda.porCod.get(b.dataset.cod!);
    if (c) { tienda.seleccionar(c); en.cerrarCajon(); }
  });
  let firmaC = '';
  function detalleCentro() {
    const det = $('[data-cdet]');
    const c: CentroPoblado | null = tienda.seleccion;
    det.hidden = !c;
    if (!c) { firmaC = ''; return; }
    const cerca = incidentesCerca(c, en.lista());
    const alt = escena.altitud(c.lon, c.lat);
    const f = `${c.cod}:${alt}:${cerca.map((x) => x.i.id + x.i.estado + x.i.personas).join(',')}`;
    if (f === firmaC) return;
    firmaC = f;
    const cob = coberturaTxt(c);
    det.innerHTML = `<h3>${esc(c.n)} <small>${esc(c.d)} · ${esc(c.pr)}</small></h3>
      <div class="cuerpo">
        <div class="grid"><div><span>Altitud (DEM)</span><b>${esc(altitudTxt(alt))}</b></div><div><span>Población</span><b>${num(c.pob)}</b></div><div><span>Incidentes ≤ 3 km</span><b>${cerca.length}</b></div></div>
        <dl class="v3d-dl">
          <dt>Exposición</dt><dd><span class="v3d-niv r${c.r}">${esc(nivelTxt(c.r))}</span> a inundaciones (Excel CENEPRED)</dd>
          <dt>Cobertura</dt><dd>${esc(cob.largo)}</dd>
          <dt>Posición</dt><dd class="mono">${esc(dms(c.lat, c.lon))}</dd>
          <dt>Fuente</dt><dd>${esc(FUENTE_CENTRO)}</dd>
        </dl>
        ${cerca.length ? `<h4 class="mon-h4">Incidentes cercanos</h4><ul class="mon-cercanos">${cerca.slice(0, 8).map(({ i, d }) => `<li><button type="button" data-inc="${esc(i.id)}"><b>${esc(tipoTxt(i.tipo))}</b> <span class="${claseEstado(i)}">${esc(chipEstado(i))}</span><small>${i.personas} vecino${i.personas > 1 ? 's' : ''} · a ${num(d, 1)} km</small></button></li>`).join('')}</ul>` : '<p class="v3d-nota">Ningún reporte vecinal a ≤ 3 km hasta este momento.</p>'}
        <div class="v3d-acciones">
          <button type="button" class="v3d-b pri" data-volar>${IC.volar}Volar aquí</button>
          <button type="button" class="v3d-b" data-regional>${IC.regional}Vista regional</button>
          <button type="button" class="v3d-b" data-quitar>${IC.cerrar}Cerrar portal</button>
        </div>
      </div>`;
    det.querySelector<HTMLButtonElement>('[data-volar]')!.onclick = () => { void escena.volarA(c); en.cerrarCajon(); };
    det.querySelector<HTMLButtonElement>('[data-regional]')!.onclick = () => { tienda.seleccionar(null); void escena.vistaRegional(); en.cerrarCajon(); };
    det.querySelector<HTMLButtonElement>('[data-quitar]')!.onclick = () => tienda.seleccionar(null);
    det.querySelectorAll<HTMLButtonElement>('[data-inc]').forEach((b) => (b.onclick = () => { tienda.setPestana('incidentes'); en.enfocar(b.dataset.inc!); }));
  }
  tienda.on('seleccion', () => { detalleCentro(); aside.querySelectorAll('[data-cod]').forEach((b) => b.setAttribute('aria-current', String((b as HTMLElement).dataset.cod === tienda.seleccion?.cod))); });
  setInterval(() => { if (tienda.pestana === 'campo' && tienda.seleccion && !document.hidden) detalleCentro(); }, 2000);

  // ---------- Escenario ----------
  escena.listo.then(() => { const c = $('[data-capas]'); c.innerHTML = ''; montarCapas(c, escena); });
  const resumen = () => { $('[data-resumen]').innerHTML = resumenEscenarioHtml(tienda.resumen, ventanaSenamhi(tienda.ahora()).etiqueta); };
  let evs: { t: number }[] = [];
  function eventos() {
    if (tienda.pestana !== 'escenario') return;
    const [a, b] = tienda.rango;
    const ofi = eventosOficiales(tienda.ahora()).filter((e) => e.t >= a && e.t <= b).map((e) => ({ t: e.t, ic: e.tipo, titulo: e.titulo, detalle: e.detalle }));
    const his = en.eventos().map((e) => e.tipo === 'reporte'
      ? { t: e.t, ic: 'ficha', titulo: `Reporte recibido · ${tipoTxt(e.obs ?? 'otro')}`, detalle: 'Reporte vecinal · por validar' }
      : { t: e.t, ic: 'consolidada', titulo: ESTADO[e.estado!], detalle: 'Cambio de estado (municipalidad)' });
    const xs = [...ofi, ...his].sort((x, y) => x.t - y.t).slice(-40);
    evs = xs;
    $('[data-eventos]').innerHTML = xs.length ? xs.map((x, k) => `<li data-i="${k}" data-pasado="${x.t <= tienda.t}"><button type="button"><span class="ic ${x.ic}"></span><span class="tt">${esc(x.titulo)}<small>${esc(x.detalle)}</small></span><time>${esc(fechaHora(x.t))}</time></button></li>`).join('')
      : '<li class="v3d-mas">Sin eventos todavía en el histórico.</li>';
  }
  $('[data-eventos]').addEventListener('click', (e) => { const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]'); if (li) en.irA(evs[+li.dataset.i!].t); });
  tienda.on('fichas', () => { resumen(); });
  resumen();
  return {
    pintar(forzar = false) { if (tienda.pestana === 'incidentes') incidentes(forzar); else if (tienda.pestana === 'campo') { centros(); detalleCentro(); } else eventos(); },
    pintarIncidentes: incidentes,
  };
}
