// Interfaz de la vista 3D de Yaku: envuelve una EscenaYaku con el shell estilo FireTrace
// (barra superior, panel de capas, línea de tiempo, portal de campo y relevo animado).
import './tema.css';
import type { EscenaYaku, PuntoReporte } from './contrato';
import { Tienda, type Pestana } from './tienda';
import { cargarCentros, cargarResumen, estadoEn, fichasPorEstado, centrosConFicha } from './datos';
import { montarLinea } from './linea';
import { montarPortal } from './portal';
import { montarPanel } from './panel';
import { montarRelevo } from './relevo';
import { vigilarFichas } from './fichas-reales';
import { montarBandaRed } from './red';
import { chipFuenteHtml, leyendaHtml, montarFuente } from './fuente';
import { IC } from './iconos';
import { num } from './formato';

export interface OpcionesVista3D {
  crearEscena: (cont: HTMLElement) => EscenaYaku;
  /** Volver a la vista 2D sin recargar (la vista 2D sigue viva debajo). */
  alSalir?: () => void;
}

export function webglDisponible() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export function montarInterfaz3D(opc: OpcionesVista3D) {
  const raiz = document.createElement('div');
  raiz.className = 'v3d';
  raiz.dataset.graficos = 'no';
  raiz.innerHTML = `
    <header class="v3d-top">
      <span class="v3d-logo">${IC.logo}Yaku 3D <small>relevo de campo</small></span>
      <span class="v3d-sep"></span>
      <span class="v3d-esc" title="Escenario de riesgo CENEPRED/SIGRID 23077">Piura · Aviso 421 / FEN 2027</span>
      <span class="v3d-lugar">23 distritos andinos · CENEPRED/SIGRID</span>
      ${chipFuenteHtml()}
      <nav class="v3d-tabs" role="tablist" aria-label="Modo de la vista 3D">
        <button type="button" role="tab" data-tab="escenario" aria-selected="true" aria-controls="v3d-panel">${IC.capas}Escenario</button>
        <button type="button" role="tab" data-tab="campo" aria-selected="false" aria-controls="v3d-panel">${IC.campo}Campo <span class="n" data-n="campo" title="Centros poblados con ficha hasta el cabezal">0</span></button>
        <button type="button" role="tab" data-tab="relevo" aria-selected="false" aria-controls="v3d-panel">${IC.relevo}Relevo <span class="n" data-n="relevo" title="Fichas en relevo hasta el cabezal">0</span></button>
      </nav>
      <span class="v3d-der">
        <span class="v3d-red" role="status" aria-live="polite" data-red></span>
        <button type="button" class="v3d-link2d" data-salir>Vista 2D</button>
      </span>
    </header>
    <div data-banda-red hidden></div>
    <div class="v3d-escena" data-escena>
      <div class="v3d-mapa" data-mapa role="region" aria-label="Escena 3D de Piura"></div>
      <div class="v3d-ctrl ai"><button type="button" class="v3d-brujula" data-norte aria-label="Orientar al norte">${IC.norte}</button></div>
      ${leyendaHtml()}
      <div class="v3d-ctrl ad">
        <span class="v3d-seg" role="group" aria-label="Vista"><button type="button" data-dim="2" aria-pressed="false">2D</button><button type="button" data-dim="3" aria-pressed="true">3D</button></span>
        <span class="v3d-chip" data-zoom title="Nivel de zoom">z8,1</span>
        <button type="button" class="v3d-btn-ic" data-pc aria-label="Pantalla completa">${IC.pantalla}</button>
      </div>
      <div class="v3d-toast" role="status" aria-live="polite" data-aviso hidden></div>
    </div>
    <div class="v3d-velo" data-velo></div>
    <aside class="v3d-panel" id="v3d-panel" aria-label="Capas y datos" tabindex="-1"></aside>
    <section class="v3d-linea" aria-label="Línea de tiempo" data-linea></section>`;
  document.body.append(raiz);
  document.body.classList.add('vista-3d');
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => raiz.querySelector<T>(s)!;
  const escenaEl = $('[data-escena]');

  if (!webglDisponible()) {
    // Degradación: sin WebGL no hay escena; se ofrece la vista 2D (que tampoco necesita red).
    escenaEl.innerHTML = '<div class="v3d-sin-webgl"><p><b>Este equipo no puede mostrar la escena 3D (WebGL no disponible).</b><br>La vista 2D tiene las mismas capas y funciona sin red.</p></div>';
    $('[data-salir]').onclick = () => { raiz.remove(); document.body.classList.remove('vista-3d'); opc.alSalir?.(); };
    return null;
  }

  const escena = opc.crearEscena($('[data-mapa]'));
  const tienda = new Tienda(Date.now, navigator.onLine);
  montarBandaRed($('[data-banda-red]'), raiz, tienda);
  montarFuente($<HTMLButtonElement>('[data-fuente]'), raiz, tienda);

  // ---------- aviso breve (también para lectores de pantalla) ----------
  let tAviso = 0;
  const aviso = (msg: string) => {
    const a = $('[data-aviso]');
    a.textContent = msg; a.hidden = false;
    clearTimeout(tAviso); tAviso = window.setTimeout(() => (a.hidden = true), 3800);
  };

  // ---------- cajón (celular) ----------
  const abrirCajon = () => { raiz.dataset.cajon = 'abierto'; $('#v3d-panel').focus?.(); };
  const cerrarCajon = () => { delete raiz.dataset.cajon; };
  $('[data-velo]').onclick = cerrarCajon;
  raiz.addEventListener('keydown', (e) => { if (e.key === 'Escape' && raiz.dataset.cajon) cerrarCajon(); });

  // ---------- módulos ----------
  const linea = montarLinea($('[data-linea]'), raiz, tienda, abrirCajon);
  const portal = montarPortal(escenaEl, escena, tienda);
  const relevo = montarRelevo(escenaEl, escena, tienda, aviso);
  montarPanel($('#v3d-panel'), tienda, escena, {
    cerrarCajon,
    reproducirRelevo() {
      tienda.setDemo(true);
      const ts = tienda.simuladas.map((f) => f.ts);
      if (ts.length) tienda.setT(Math.min(...ts) - 3600_000);
      cerrarCajon();
      linea.jugar();
    },
  });

  // ---------- pestañas ----------
  const tabs = [...raiz.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  tabs.forEach((b) => (b.onclick = () => { tienda.setPestana(b.dataset.tab as Pestana); if (matchMedia('(max-width: 899px)').matches) abrirCajon(); }));
  raiz.querySelector('[role=tablist]')!.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
    const i = tabs.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    const n = tabs[(i + (k === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    n.focus(); tienda.setPestana(n.dataset.tab as Pestana);
  });
  tienda.on('pestana', (p) => tabs.forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.tab === p)); b.tabIndex = b.dataset.tab === p ? 0 : -1; }));
  tabs.forEach((b, i) => (b.tabIndex = i === 0 ? 0 : -1));

  // ---------- contadores y red ----------
  function contadores() {
    const nC = centrosConFicha(tienda.fichas(), tienda.asoc, tienda.t).size;
    const nR = fichasPorEstado(tienda.fichas(), tienda.t).relevo;
    for (const [k, n] of [['campo', nC], ['relevo', nR]] as const) {
      const el = $(`[data-n="${k}"]`);
      if (el.textContent !== String(n)) { el.textContent = num(n); el.toggleAttribute('data-cero', n === 0); }
    }
  }
  const red = () => { const e = $('[data-red]'); e.textContent = tienda.red ? 'EN LÍNEA' : 'SIN RED'; e.className = `v3d-red ${tienda.red ? 'on' : 'off'}`; };
  addEventListener('online', () => tienda.setRed(true));
  addEventListener('offline', () => tienda.setRed(false));
  tienda.on('red', red); red();

  // ---------- fichas en la escena (solo cuando cambia lo visible en el cabezal) ----------
  let firmaPuntos = '';
  function puntos() {
    const fs = tienda.fichas().filter((f) => f.ts <= tienda.t);
    const firma = fs.map((f) => `${f.id}:${estadoEn(f, tienda.t)}`).join(',');
    if (firma === firmaPuntos) return;
    firmaPuntos = firma;
    escena.setReportes(fs.map<PuntoReporte>((f) => ({
      id: f.id, lat: f.lat, lon: f.lon, type: f.type, severity: f.severity,
      note: f.note, state: `${estadoEn(f, tienda.t) === 'consolidado' ? 'consolidado' : 'en relevo'}${f.simulado ? ' · SIMULADO' : ''}`,
    })));
  }
  tienda.on('t', () => { contadores(); puntos(); });
  tienda.on('fichas', () => { firmaPuntos = ''; contadores(); puntos(); });

  // ---------- selección ⇄ escena ----------
  escena.onElegirCentro((cod) => { const c = tienda.porCod.get(cod); if (c) { tienda.seleccionar(c); tienda.setPestana('campo'); } });
  tienda.on('seleccion', (c) => { escena.setSeleccion(c); if (c) escena.volarA(c); });

  // ---------- controles de la escena ----------
  const map = escena.map;
  const brujula = $('[data-norte] svg');
  const zoom = $('[data-zoom]');
  let rafMov = 0;
  map.on('move', () => {
    rafMov ||= requestAnimationFrame(() => {
      rafMov = 0;
      brujula.style.transform = `rotate(${-map.getBearing()}deg)`;
      zoom.textContent = `z${num(map.getZoom(), 1)}`;
    });
  });
  $('[data-norte]').onclick = () => map.easeTo({ bearing: 0, duration: 600 });
  raiz.querySelectorAll<HTMLButtonElement>('[data-dim]').forEach((b) => (b.onclick = () => {
    const dos = b.dataset.dim === '2';
    escena.set2D(dos);
    raiz.querySelectorAll('[data-dim]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('[data-pc]').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : raiz.requestFullscreen?.())?.catch?.(() => {});

  // ---------- salir a 2D (sin recargar) ----------
  function salir() {
    linea.pausar();
    raiz.hidden = true;
    document.body.classList.remove('vista-3d');
    const u = new URL(location.href); u.searchParams.delete('vista'); history.replaceState(null, '', u);
    opc.alSalir?.();
    dispatchEvent(new Event('resize'));
  }
  $('[data-salir]').onclick = salir;
  document.addEventListener('yaku3d:vista2d', salir);
  function volver() {
    raiz.hidden = false;
    document.body.classList.add('vista-3d');
    const u = new URL(location.href); u.searchParams.set('vista', '3d'); history.replaceState(null, '', u);
    requestAnimationFrame(() => map.resize());
    fichas.leer();
  }

  // ---------- datos ----------
  const fichas = vigilarFichas(tienda, (nuevas, consolidadas) => relevo.real(nuevas, consolidadas));
  Promise.all([cargarCentros(), cargarResumen()]).then(([cs, r]) => {
    tienda.setCentros(cs, r);
    return escena.listo.then(() => fichas.leer());
  }).catch(() => aviso('No se pudieron cargar los centros poblados del escenario.'));
  escena.listo.then(() => {
    document.body.dataset.v3d = 'listo';
    puntos();
    // Atribución compacta plegada (abierta tapa la escena); sigue a un toque en el ícono «i».
    map.once('idle', () => { const a = raiz.querySelector('.maplibregl-ctrl-attrib'); a?.classList.remove('maplibregl-compact-show'); a?.removeAttribute('open'); });
  });

  const api = { tienda, escena, linea, relevo, portal, volver, salir, raiz };
  (window as unknown as { __yaku3dUI: typeof api }).__yaku3dUI = api;
  return api;
}
