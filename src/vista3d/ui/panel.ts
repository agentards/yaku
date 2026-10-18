// Panel derecho (cajón inferior en celular). Su contenido cambia con la pestaña:
// Escenario (capas, resumen, eventos clave) · Campo (centros poblados y detalle) · Relevo (fichas y demo).
import type { CentroPoblado, EscenaYaku } from './contrato';
import type { Pestana, Tienda } from './tienda';
import { OBS_LABELS } from '../../codec';
import { montarCapas } from './capas';
import { eventosLinea } from './linea';
import { fichasDe, fichasPorEstado, estadoEn, nivelTxt, type Ficha, type ResumenEscenario } from './datos';
import { ESCENARIO } from '../escenario';
import { altitudTxt, coberturaTxt, dms, esc, estadoCentro, FUENTE_CENTRO, num } from './formato';
import { fechaHora, ventanaSenamhi } from './tiempo';
import { IC } from './iconos';

const TITULOS: Record<Pestana, string> = { escenario: 'Escenario', campo: 'Campo · centros poblados', relevo: 'Relevo por QR', incidentes: 'Incidentes' };
const ORIGEN: Record<string, string> = { local: 'creada en este equipo', qr: 'recibida por QR', enlace: 'recibida por enlace', imagen: 'recibida por imagen de QR' };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface AccionesPanel { reproducirRelevo(): void; cerrarCajon(): void }

/** Resumen del escenario oficial (textos y cifras de ../escenario.ts; las cifras del JSON mandan si cargó). */
export function resumenEscenarioHtml(r: ResumenEscenario | null, pronostico: string) {
  const c = ESCENARIO.cifras;
  return `
      <div class="v3d-kpis">
        <div class="v3d-kpi"><b>${num(r?.total ?? c.total)}</b><span>centros poblados del escenario CENEPRED</span></div>
        <div class="v3d-kpi"><b>${num(r?.ubicados ?? c.ubicados)}</b><span>con ubicación IGN (en la escena)</span></div>
        <div class="v3d-kpi acc"><b>${num(r?.sinCoberturaGarantizada ?? c.sinCobertura)}</b><span>de ${num(r?.conDatoOsiptel ?? c.conDatoOsiptel)} sin cobertura garantizada según OSIPTEL</span></div>
      </div>
      <dl class="v3d-dl">
        <dt>Escenario</dt><dd>${esc(ESCENARIO.codigo)}</dd>
        <dt>Vigencia</dt><dd>${esc(ESCENARIO.vigenciaFirma)}</dd>
        <dt>Zona</dt><dd>${esc(ESCENARIO.zona)}</dd>
        <dt>Pronóstico</dt><dd>${esc(pronostico)}</dd>
        <dt>Sin punto IGN</dt><dd>${num(r?.sinUbicar ?? c.sinUbicar)} (${c.aproxOsiptel} aproximados con OSIPTEL, ${c.sinPunto} sin ubicar)</dd>
      </dl>
      <p class="v3d-nota">${esc(ESCENARIO.nota)}</p>`;
}

export function montarPanel(aside: HTMLElement, tienda: Tienda, escena: EscenaYaku, acc: AccionesPanel) {
  aside.innerHTML = `
    <div class="v3d-asa"><h2 data-titulo>Escenario</h2><button type="button" data-cerrar>Cerrar</button></div>
    <div class="v3d-panel-cuerpo">
      <div data-p="escenario">
        <section class="v3d-card"><h3>Capas <small>casilla y opacidad</small></h3><div data-capas><p class="v3d-mas">Cargando capas…</p></div></section>
        <section class="v3d-card"><h3>Resumen del escenario <small>CENEPRED/SIGRID</small></h3><div class="cuerpo" data-resumen></div></section>
        <section class="v3d-card"><h3>Eventos clave <small>clic: mover el cabezal</small></h3><ul class="v3d-eventos" data-eventos></ul></section>
      </div>
      <div data-p="campo" hidden>
        <section class="v3d-card v3d-det" data-det hidden></section>
        <section class="v3d-card"><h3>Centros poblados del escenario CENEPRED <small data-n></small></h3>
          <div class="v3d-buscar">
            <input type="search" data-q placeholder="Buscar centro poblado o distrito" aria-label="Buscar centro poblado o distrito" />
            <button type="button" class="v3d-filtro" data-f="sincob" aria-pressed="false">Sin cobertura garantizada (OSIPTEL)</button>
            <button type="button" class="v3d-filtro" data-f="conficha" aria-pressed="false">Con ficha</button>
          </div>
          <ul class="v3d-centros" data-lista></ul><p class="v3d-mas" data-mas></p>
        </section>
      </div>
      <div data-p="relevo" hidden>
        <section class="v3d-card"><h3>Relevo por QR <small>de teléfono a teléfono</small></h3>
          <div class="cuerpo"><div class="v3d-kpis" data-kpis></div>
            <p class="v3d-nota">Cada ficha viaja por QR entre teléfonos sin red hasta uno que tenga conexión; ahí se consolida en el servidor. Sigue siendo <b>NO VERIFICADO</b>.</p></div>
          <label class="v3d-demo"><input type="checkbox" data-demo /><span><b>Modo demo</b> <span class="badge-sim">SIMULADO</span><br><small>14 fichas de ensayo sobre centros poblados sin cobertura garantizada según OSIPTEL, con saltos entre 4 teléfonos. No se guardan ni se envían.</small></span></label>
          <div class="v3d-acciones" style="padding:0 11px 10px"><button type="button" class="v3d-b pri" data-reproducir>${IC.play}Reproducir relevo</button><button type="button" class="v3d-b" data-ir2d>Pasar o recibir fichas (vista 2D)</button></div>
        </section>
        <section class="v3d-card"><h3>Registro de relevo <small data-nf></small></h3><ul class="v3d-fichas" data-fichas></ul></section>
      </div>
    </div>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => aside.querySelector<T>(s)!;
  $<HTMLButtonElement>('[data-cerrar]').onclick = acc.cerrarCajon;

  // ---------- pestañas ----------
  function pestana(p: Pestana) {
    $('[data-titulo]').textContent = TITULOS[p];
    aside.querySelectorAll<HTMLElement>('[data-p]').forEach((d) => (d.hidden = d.dataset.p !== p));
    if (p === 'campo') { lista(); detalle(); }
    if (p === 'relevo') relevo();
  }
  tienda.on('pestana', pestana);

  // ---------- Escenario ----------
  escena.listo.then(() => { const c = $('[data-capas]'); c.innerHTML = ''; montarCapas(c, escena); });
  function resumen() {
    const r = tienda.resumen;
    const v = ventanaSenamhi(tienda.ahora());
    $('[data-resumen]').innerHTML = resumenEscenarioHtml(r, v.etiqueta);
  }
  let evs: { t: number }[] = [];
  function eventos() {
    const e = eventosLinea(tienda);
    evs = e;
    $('[data-eventos]').innerHTML = e.slice(-40).map((x, i) => `<li data-i="${i + Math.max(0, e.length - 40)}"><button type="button"><span class="ic ${x.tipo}"></span><span class="tt">${esc(x.titulo)}<small>${esc(x.detalle)}</small></span><time>${esc(fechaHora(x.t))}</time></button></li>`).join('');
    pasados();
  }
  function pasados() { aside.querySelectorAll<HTMLElement>('[data-eventos] li').forEach((li) => (li.dataset.pasado = String(evs[+li.dataset.i!].t <= tienda.t))); }
  $('[data-eventos]').addEventListener('click', (e) => { const li = (e.target as HTMLElement).closest<HTMLElement>('li'); if (li) tienda.setT(evs[+li.dataset.i!].t); });

  // ---------- Campo ----------
  const filtros = { sincob: false, conficha: false };
  const q = $<HTMLInputElement>('[data-q]');
  function lista() {
    if (tienda.pestana !== 'campo') return;
    const conFicha = new Set<string>();
    for (const f of tienda.fichas()) { const c = tienda.asoc.get(f.id); if (c && f.ts <= tienda.t) conFicha.add(c); }
    const txt = norm(q.value.trim());
    const xs = tienda.centros
      .filter((c) => (!filtros.sincob || c.cg === false) && (!filtros.conficha || conFicha.has(c.cod)) && (!txt || norm(`${c.n} ${c.d} ${c.pr}`).includes(txt)))
      .sort((a, b) => +conFicha.has(b.cod) - +conFicha.has(a.cod) || b.r - a.r || +(a.cg === false ? 0 : 1) - +(b.cg === false ? 0 : 1) || b.pob - a.pob);
    const max = 80;
    $('[data-n]').textContent = `${num(xs.length)} de ${num(tienda.centros.length)}`;
    $('[data-lista]').innerHTML = xs.slice(0, max).map((c) => {
      const n = conFicha.has(c.cod) ? fichasDe(c.cod, tienda.fichas(), tienda.asoc, tienda.t).length : 0;
      const cob = coberturaTxt(c);
      return `<li><button type="button" data-cod="${esc(c.cod)}" aria-current="${tienda.seleccion?.cod === c.cod}">
        <span class="ic">${n ? n : nivelTxt(c.r).split(' ').map((w) => w[0]).join('')}</span>
        <span class="n">${esc(c.n)}<small>${esc(c.d)} · ${esc(c.pr)} · pob. ${num(c.pob)}</small></span>
        <span class="der"><span class="v3d-niv r${c.r}">${esc(nivelTxt(c.r))}</span><span class="v3d-cob ${cob.clase}">${c.cg === false ? 'sin cob. garantizada' : c.cg === null ? 'sin dato OSIPTEL' : 'con cobertura'}</span>${n ? '<span class="badge-nv">NO VERIFICADO</span>' : ''}</span>
      </button></li>`;
    }).join('');
    $('[data-mas]').textContent = xs.length > max ? `Mostrando ${max} de ${num(xs.length)}: escriba para filtrar.` : xs.length ? '' : 'Ningún centro poblado coincide.';
  }
  let tq = 0;
  q.oninput = () => { clearTimeout(tq); tq = window.setTimeout(lista, 120); };
  aside.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.f as keyof typeof filtros;
    filtros[k] = !filtros[k]; b.setAttribute('aria-pressed', String(filtros[k])); lista();
  }));
  $('[data-lista]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cod]');
    const c = b && tienda.porCod.get(b.dataset.cod!);
    if (c) { tienda.seleccionar(c); acc.cerrarCajon(); }
  });

  let firmaDet = '';
  function detalle() {
    const det = $('[data-det]');
    const c: CentroPoblado | null = tienda.seleccion;
    det.hidden = !c;
    if (!c) { firmaDet = ''; return; }
    const fs = fichasDe(c.cod, tienda.fichas(), tienda.asoc, tienda.t);
    const firma = `${c.cod}:${fs.length}:${escena.altitud(c.lon, c.lat)}`;
    if (firma === firmaDet) return;
    firmaDet = firma;
    const est = estadoCentro(fs.length), cob = coberturaTxt(c);
    det.innerHTML = `<h3>${esc(c.n)} <span class="v3d-estado ${est.clase}">${esc(est.txt)}</span></h3>
      <div class="cuerpo">
        <div class="grid">
          <div><span>Altitud (DEM)</span><b>${esc(altitudTxt(escena.altitud(c.lon, c.lat)))}</b></div>
          <div><span>Población</span><b>${num(c.pob)}</b></div>
          <div><span>Fichas</span><b>${fs.length}</b> ${fs.length ? '<span class="badge-nv">NO VERIFICADO</span>' : ''}</div>
        </div>
        <dl class="v3d-dl">
          <dt>Distrito</dt><dd>${esc(c.d)} · ${esc(c.pr)}</dd>
          <dt>Exposición</dt><dd><span class="v3d-niv r${c.r}">${esc(nivelTxt(c.r))}</span> a inundaciones (Excel CENEPRED)</dd>
          <dt>Cobertura</dt><dd>${esc(cob.largo)}</dd>
          <dt>Posición</dt><dd class="mono">${esc(dms(c.lat, c.lon))}</dd>
          <dt>Fuente</dt><dd>${esc(FUENTE_CENTRO)}</dd>
        </dl>
        <div class="v3d-acciones">
          <button type="button" class="v3d-b pri" data-volar>${IC.volar}Volar aquí</button>
          <button type="button" class="v3d-b" data-regional>${IC.regional}Vista regional</button>
          <button type="button" class="v3d-b" data-quitar>${IC.cerrar}Cerrar portal</button>
        </div>
      </div>`;
    det.querySelector<HTMLButtonElement>('[data-volar]')!.onclick = () => { escena.volarA(c); acc.cerrarCajon(); };
    det.querySelector<HTMLButtonElement>('[data-regional]')!.onclick = () => { tienda.seleccionar(null); escena.vistaRegional(); acc.cerrarCajon(); };
    det.querySelector<HTMLButtonElement>('[data-quitar]')!.onclick = () => tienda.seleccionar(null);
  }

  // ---------- Relevo ----------
  const demo = $<HTMLInputElement>('[data-demo]');
  demo.onchange = () => tienda.setDemo(demo.checked);
  tienda.on('demo', (on) => (demo.checked = on));
  $<HTMLButtonElement>('[data-reproducir]').onclick = acc.reproducirRelevo;
  $<HTMLButtonElement>('[data-ir2d]').onclick = () => document.dispatchEvent(new CustomEvent('yaku3d:vista2d'));
  let firmaRelevo = '';
  function relevo() {
    if (tienda.pestana !== 'relevo') return;
    const fs = tienda.fichas().filter((f) => f.ts <= tienda.t).sort((a, b) => b.ts - a.ts);
    const firma = fs.map((f) => `${f.id}:${estadoEn(f, tienda.t)}`).join(',') + tienda.demo;
    if (firma === firmaRelevo) return;
    firmaRelevo = firma;
    const e = fichasPorEstado(tienda.fichas(), tienda.t);
    const recibidas = fs.filter((f) => f.source !== 'local').length;
    $('[data-kpis]').innerHTML = `
      <div class="v3d-kpi acc"><b>${e.relevo}</b><span>en relevo (sin consolidar)</span></div>
      <div class="v3d-kpi"><b>${e.consolidado}</b><span>consolidadas en el servidor</span></div>
      <div class="v3d-kpi"><b>${recibidas}</b><span>pasaron por QR, enlace o imagen</span></div>`;
    $('[data-nf]').textContent = `${fs.length} hasta el cabezal`;
    $('[data-fichas]').innerHTML = fs.slice(0, 40).map((f) => fichaHtml(f)).join('')
      || '<li class="v3d-mas">Aún no hay fichas hasta este punto de la línea de tiempo. Active el modo demo SIMULADO o registre una ficha en la vista 2D.</li>';
  }
  function fichaHtml(f: Ficha) {
    const st = estadoEn(f, tienda.t);
    const c = tienda.porCod.get(tienda.asoc.get(f.id) ?? '');
    const ruta = f.saltos?.length
      ? [f.saltos[0].de, ...f.saltos.filter((s) => s.t <= tienda.t).map((s) => s.a)].join(' → ') + (st === 'consolidado' ? ' → Servidor' : '')
      : `${ORIGEN[f.source] ?? f.source}${st === 'consolidado' ? ' → Servidor' : ''}`;
    return `<li class="v3d-ficha"><div class="tags"><span class="badge-nv">NO VERIFICADO</span><span class="st ${st === 'consolidado' ? 'ok' : ''}">${st === 'consolidado' ? 'consolidada' : 'en relevo'}</span>${f.simulado ? '<span class="badge-sim">SIMULADO</span>' : ''}</div>
      <b>${esc(OBS_LABELS[f.type] ?? f.type)}</b> · severidad ${f.severity}${c ? ` · ${esc(c.n)} (${esc(c.d)})` : ''}<br>
      <span class="ruta">${esc(ruta)}</span> · <time>${esc(fechaHora(f.ts))}</time></li>`;
  }

  tienda.on('fichas', () => { eventos(); lista(); detalle(); relevo(); });
  let tCampo = 0;
  tienda.on('t', () => {
    pasados(); relevo();
    if (tienda.pestana === 'campo') { cancelAnimationFrame(tCampo); tCampo = requestAnimationFrame(() => { detalle(); }); }
  });
  tienda.on('seleccion', () => { detalle(); aside.querySelectorAll('[data-cod]').forEach((b) => b.setAttribute('aria-current', String((b as HTMLElement).dataset.cod === tienda.seleccion?.cod))); });
  // La altitud del DEM afina mientras cargan teselas: refrescar el detalle (solo cambia si cambió la cifra).
  setInterval(() => { if (tienda.pestana === 'campo' && tienda.seleccion && !document.hidden) detalle(); }, 2000);
  resumen(); eventos();
  return { resumen, lista };
}
