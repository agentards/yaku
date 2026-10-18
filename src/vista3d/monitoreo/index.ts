// «Yaku 3D · Centro de monitoreo»: UNA interfaz con la calidad visual del portal 3D que une el monitor en vivo
// (consulta cada 3 s, detección de nuevos, vuelo, marcador pulsante, sonido, tarjeta grande) y el panel de incidentes
// (agrupación, respaldo, galería, prioridad, estados y acciones), sobre el HISTÓRICO REAL del servidor
// (GET /api/reports y GET /api/incidentes, mismo origen, con las cabeceras de la Sesion). Sin IndexedDB del equipo,
// sin fichas simuladas ni modo demo. Plan: el plan del Centro de monitoreo.
import * as maplibregl from 'maplibre-gl';
import '../ui/tema.css';
import './monitoreo.css';
import type { EscenaYaku3D, OpcionesEscena } from '../escena';
import { alCambiarModo, aplicarModo, montarSelectorModo, type Modo } from '../ui/modo';
import type { PuntoReporte } from '../ui/contrato';
import { Tienda, type Pestana } from '../ui/tienda';
import { cargarCentros, cargarResumen } from '../ui/datos';
import { montarPortal } from '../ui/portal';
import { chipFuenteHtml, leyendaHtml, montarFuente } from '../ui/fuente';
import { IC } from '../ui/iconos';
import { esc, num } from '../ui/formato';
import { ESCENARIO, MONITOREO } from '../escenario';
import { llegoHace, type ReporteApi } from '../municipalidad/deteccion';
import { cerrado, DetectorIncidentes, hhmm, plural, porPrioridad, type Incidente } from '../municipalidad/incidentes';
import { cambiarEstado, esErrorAcceso, llevarA, traerIncidentes, traerReportes, type Fuente } from '../municipalidad/api';
import { ACCION_TXT, ACCIONES, ESTADO, MOTIVOS_DESCARTE, ROTULO_VECINAL, tipoTxt, vecinos, type Accion, type Estado } from '../municipalidad/textos';
import type { Sesion } from '../../auth/sesion';
import { REGION, REGIONES, urlRegion, type RegionId } from '../../region';
import { contadores, fichaDeReporte, grupoDe, incidenteEn, indexar, rangoHistorico, type IncHist } from './historico';
import { pieMonitoreoHtml, tarjetaHtml, tono, vida, type Ctx } from './piezas';
import { montarLineaMonitoreo } from './linea';
import { montarPanelMonitoreo } from './panel';
import { Sonido, TONOS_COINCIDE } from './sonido';
import { hidratarFotos, urlFoto } from './fotos';

export const INTERVALO_MS = 3000;
const ANIM_MS = 1800;
export type PestanaMonitoreo = 'incidentes' | 'campo' | 'escenario';

export interface OpcionesMonitoreo {
  pestana?: PestanaMonitoreo;
  crearEscena: (cont: HTMLElement, o?: OpcionesEscena) => EscenaYaku3D;
  /** Volver a la vista 2D sin recargar (la vista 2D sigue viva debajo). */
  alSalir?: () => void;
}

function webglDisponible() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

const VERBO: Record<Estado, string> = { nuevo: 'Nuevo', en_revision: 'Pasar a «en revisión»', validado: 'Validar', descartado: 'Descartar', accion_asignada: 'Asignar', atendido: 'Marcar atendido' };
/** Modo de la interfaz → tema del mapa (ver ../temas.ts). */
const temaMapa = (m: Modo) => (m === 'oscuro' ? 'noche' : 'claro');

export function montarMonitoreo(sesion: Sesion, opc: OpcionesMonitoreo) {
  document.title = MONITOREO.documento;
  const modo = aplicarModo(); // Claro / Oscuro / Sistema (guardado en este equipo): antes de pintar nada
  const raiz = document.createElement('div');
  raiz.className = 'v3d mon';
  raiz.dataset.graficos = 'no';
  raiz.innerHTML = `
    <header class="v3d-top">
      <span class="v3d-logo">${IC.logo}${esc(MONITOREO.nombre)} <small class="mon-titulo">· ${esc(MONITOREO.titulo)}</small></span>
      <span class="v3d-sep"></span>
      <span class="v3d-esc" title="${esc(ESCENARIO.chipTitulo)}">${esc(ESCENARIO.chip)}</span>
      <span class="v3d-seg mon-region" role="group" aria-label="Región del mapa">${(Object.keys(REGIONES) as RegionId[]).map((id) => `<button type="button" data-region="${id}" aria-pressed="${id === REGION.id}">${esc(REGIONES[id].nombre)}</button>`).join('')}</span>
      ${chipFuenteHtml()}
      <span class="mon-vivo" role="status" aria-live="polite" data-vivo data-estado="iniciando"><i aria-hidden="true"></i><span data-vivo-txt>Conectando…</span></span>
      <nav class="v3d-tabs" role="tablist" aria-label="Paneles del Centro de monitoreo">
        <button type="button" role="tab" data-tab="incidentes" aria-selected="false" aria-controls="v3d-panel">${IC.campo}Incidentes <span class="n" data-n="incidentes" title="Incidentes abiertos" data-cero>0</span></button>
        <button type="button" role="tab" data-tab="campo" aria-selected="false" aria-controls="v3d-panel">${IC.regional}Campo</button>
        <button type="button" role="tab" data-tab="escenario" aria-selected="false" aria-controls="v3d-panel">${IC.capas}Escenario</button>
      </nav>
      <span class="v3d-der">
        <button type="button" class="mon-sonido" data-sonido aria-pressed="false">Activar sonido</button>
        <span class="mon-usuario" data-usuario></span>
        <button type="button" class="v3d-link2d" data-salir>Vista 2D</button>
      </span>
    </header>
    <div class="mon-banda" data-banda role="alert" hidden></div>
    <div class="v3d-escena" data-escena>
      <div class="v3d-mapa" data-mapa role="region" aria-label="Escena 3D de ${esc(REGION.nombre)} con los incidentes reportados"></div>
      <div class="v3d-ctrl ai"><button type="button" class="v3d-brujula" data-norte aria-label="Orientar al norte">${IC.norte}</button></div>
      ${leyendaHtml()}
      <div class="mon-leyenda" aria-label="Leyenda de incidentes"><b>Incidentes</b>
        <span><i style="background:#e08a00"></i>Sin revisar</span><span><i style="background:#c77700"></i>En revisión</span><span><i style="background:#2f6b3a"></i>Validado o con acción</span><span><i style="background:#a59a88"></i>Cerrado</span><span><i class="vida"></i>Riesgo de vida</span>
        <small>Tamaño = vecinos que coinciden</small></div>
      <div class="v3d-ctrl ad">
        <span class="v3d-seg" role="group" aria-label="Vista"><button type="button" data-dim="2" aria-pressed="false">2D</button><button type="button" data-dim="3" aria-pressed="true">3D</button></span>
        <span class="v3d-chip" data-zoom title="Nivel de zoom">z8,1</span>
        <button type="button" class="v3d-btn-ic" data-pc aria-label="Pantalla completa">${IC.pantalla}</button>
      </div>
      <article class="mon-tarjeta" data-tarjeta hidden aria-live="assertive"></article>
      <div class="mon-avisos" data-avisos aria-live="polite"></div>
    </div>
    <div class="v3d-velo" data-velo></div>
    <aside class="v3d-panel" id="v3d-panel" aria-label="Incidentes, campo y escenario" tabindex="-1"></aside>
    <section class="v3d-linea" aria-label="Línea de tiempo del histórico" data-linea></section>
    <footer class="mon-pie-legal">${pieMonitoreoHtml()}</footer>
    <dialog class="mon-dlg" data-dlg-confirmar aria-labelledby="mon-conf-t" aria-describedby="mon-conf-d"><form method="dialog">
      <h2 id="mon-conf-t" data-conf-titulo></h2>
      <p id="mon-conf-d" data-conf-texto></p>
      <label class="mon-conf-msg" data-conf-msg hidden><span>Mensaje para los vecinos (opcional)</span>
        <input name="mensaje" maxlength="120" autocomplete="off" placeholder="Ej.: llegan al colegio de Pampa Dulce a las 3 p. m."></label>
      <div class="mon-dlg-botones"><button value="cancelar" class="v3d-b sec" formnovalidate>Cancelar</button><button value="ok" class="v3d-b pri" data-conf-ok>Confirmar</button></div>
    </form></dialog>
    <dialog class="mon-dlg" data-dlg-descartar aria-labelledby="mon-desc-t"><form method="dialog">
      <h2 id="mon-desc-t">Descartar incidente</h2>
      <p>El vecino verá «La municipalidad lo revisó y no lo validó» con este motivo.</p>
      <label>Motivo <select name="motivo">${MOTIVOS_DESCARTE.map((m) => `<option>${esc(m)}</option>`).join('')}<option value="otro">Otro (escribir)</option></select></label>
      <label>Detalle <input name="detalle" maxlength="140" placeholder="Opcional"></label>
      <div class="mon-dlg-botones"><button value="cancelar" class="v3d-b sec" formnovalidate>Cancelar</button><button value="ok" class="v3d-b peligro lleno">Descartar</button></div>
    </form></dialog>
    <div class="mon-galeria-full" data-galeria hidden role="dialog" aria-label="Foto del incidente">
      <button type="button" data-g="cerrar" aria-label="Cerrar foto">×</button>
      <button type="button" data-g="ant" aria-label="Foto anterior">‹</button>
      <figure><img alt=""><figcaption></figcaption></figure>
      <button type="button" data-g="sig" aria-label="Foto siguiente">›</button>
    </div>`;
  document.body.append(raiz);
  document.body.classList.add('vista-3d');
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => raiz.querySelector<T>(s)!;
  sesion.montarBotonUsuario($('[data-usuario]'));
  montarSelectorModo($('.v3d-der'), { antes: $('[data-sonido]') });
  const salirA2D = () => { raiz.hidden = true; document.body.classList.remove('vista-3d'); const u = new URL(location.href); u.searchParams.set('vista', '2d'); history.replaceState(null, '', u); opc.alSalir?.(); dispatchEvent(new Event('resize')); };
  $('[data-salir]').onclick = salirA2D;
  // Cambiar de región cambia el mapa base (otro .pmtiles): se carga la página de nuevo con ?region= (queda recordada).
  raiz.querySelectorAll<HTMLButtonElement>('[data-region]').forEach((b) => (b.onclick = () => { if (b.dataset.region !== REGION.id) location.assign(urlRegion(b.dataset.region as RegionId, location.href)); }));

  if (!webglDisponible()) {
    $('[data-escena]').innerHTML = '<div class="v3d-sin-webgl"><p><b>Este equipo no puede mostrar la escena 3D (WebGL no disponible).</b><br>La vista 2D tiene las mismas capas oficiales y funciona sin red.</p></div>';
    return null;
  }

  // El mapa nace con el tema del modo (sin destello claro) y lo sigue en caliente al cambiar de modo.
  const escena = opc.crearEscena($('[data-mapa]'), { tema: temaMapa(modo) });
  alCambiarModo((m) => escena.setTema(temaMapa(m)));
  const tienda = new Tienda(Date.now, navigator.onLine, rangoHistorico);
  tienda.t = tienda.rango[1];
  montarFuente($<HTMLButtonElement>('[data-fuente]'), raiz, tienda);

  // ---------- estado ----------
  const det = new DetectorIncidentes();
  const sonido = new Sonido();
  let fuente: Fuente = 'incidentes';
  let incs: Incidente[] = [], hs: IncHist[] = [];
  const reportes = new Map<string, ReporteApi>();
  let actualId: string | null = null, pendiente: string | null = null;
  const desde = new Map<string, { personas: number; fotos: number; hasta: number }>();
  const nuevosIds: string[] = [];
  let consultas = 0, errores = 0, coincidencias = 0, enCurso = false, ultimaOk = 0, firmaDatos = '', estadoRed = 'iniciando';
  let marcador: maplibregl.Marker | null = null;
  let galeria: { fotos: string[]; k: number } | null = null;
  const dlgConf = $<HTMLDialogElement>('[data-dlg-confirmar]'), dlgDesc = $<HTMLDialogElement>('[data-dlg-descartar]');
  const ocupado = () => dlgConf.open || dlgDesc.open;
  const cab = () => sesion.cabeceras();

  // ---------- en vivo / histórico ----------
  const vivo = {
    enVivo: true,
    irEnVivo() { vivo.enVivo = true; tienda.extenderRango(); tienda.setT(tienda.rango[1]); linea.pintar(); refrescar(true); },
    soltarVivo() { if (!vivo.enVivo) return; vivo.enVivo = false; linea.pintar(); refrescar(true); },
  };
  /** Incidentes tal como se veían en el cabezal (en vivo: los del servidor), por prioridad. */
  const vista = (): Incidente[] => (vivo.enVivo ? incs : hs.map((h) => incidenteEn(h, tienda.t)).filter((i): i is Incidente => !!i).sort(porPrioridad));
  const sube = (id: string) => { const d = desde.get(id); return d && d.hasta > Date.now() ? d : null; };
  const ctx = (i: Incidente): Ctx => {
    const motivoNo = fuente !== 'incidentes' ? 'Este servidor aún no tiene /api/incidentes: solo lectura.'
      : sesion.rol !== 'operador' ? 'Tu rol es «monitor»: solo mirar. Los cambios los hace un operador municipal.'
      : !vivo.enVivo ? 'Estás viendo el histórico: vuelve a «En vivo» para cambiar estados.' : '';
    const a = sube(i.id);
    return { puede: !motivoNo, motivoNo, antes: a ? { personas: a.personas, fotos: a.fotos } : null, ahora: Date.now() };
  };

  // ---------- avisos ----------
  function avisar(txt: string, tipo: 'ok' | 'error' | 'coincide' | 'nuevo' = 'ok', id?: string) {
    const el = document.createElement(id ? 'button' : 'div');
    el.className = `mon-toast mon-toast-${tipo}`;
    el.textContent = txt;
    if (id) { (el as HTMLButtonElement).type = 'button'; el.onclick = () => { enfocar(id); el.remove(); }; }
    const cont = $('[data-avisos]');
    cont.prepend(el);
    while (cont.children.length > 3) cont.lastElementChild!.remove();
    setTimeout(() => el.remove(), tipo === 'error' ? 8000 : 5500);
  }

  // ---------- sonido ----------
  const btnSonido = $<HTMLButtonElement>('[data-sonido]');
  const pintarSonido = () => { const on = sonido.activo(); btnSonido.setAttribute('aria-pressed', String(on)); btnSonido.textContent = on ? 'Sonido activado' : 'Activar sonido'; };
  btnSonido.onclick = () => { if (sonido.activo()) { sonido.silenciado = true; pintarSonido(); } else void sonido.activar().then(pintarSonido); };
  raiz.addEventListener('pointerdown', () => { if (!sonido.activo() && !sonido.silenciado) void sonido.activar().then(pintarSonido); }, { once: true });

  // ---------- cajón (celular) y pestañas ----------
  const abrirCajon = () => { raiz.dataset.cajon = 'abierto'; $('#v3d-panel').focus?.(); };
  const cerrarCajon = () => { delete raiz.dataset.cajon; };
  $('[data-velo]').onclick = cerrarCajon;
  raiz.addEventListener('keydown', (e) => { if (e.key === 'Escape' && raiz.dataset.cajon) cerrarCajon(); });
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

  // ---------- módulos del portal ----------
  const linea = montarLineaMonitoreo($('[data-linea]'), raiz, tienda, vivo, abrirCajon);
  montarPortal($('[data-escena]'), escena, tienda);
  const panel = montarPanelMonitoreo($('#v3d-panel'), tienda, escena, {
    lista: vista, actual: () => actualId, ctx, enVivo: () => vivo.enVivo,
    enfocar: (id) => enfocar(id), cerrarDetalle: () => cerrarTarjeta(),
    accionar: (id, d, a) => void accionar(id, d as Estado, a as Accion | undefined),
    abrirGaleria: (fotos, k) => { galeria = { fotos, k }; pintarGaleria(); },
    eventos: () => linea.eventos(), irA: (t) => { vivo.soltarVivo(); tienda.setT(t); }, cerrarCajon,
    hidratar: (el) => hidratarFotos(el, cab),
  });
  tienda.setPestana(opc.pestana ?? 'incidentes');

  // ---------- escena: marcadores por estado/prioridad, clic, controles ----------
  const map = escena.map;
  escena.listo.then(() => {
    const color = ['case', ['==', ['get', 'vida'], 1], '#6b3a00', ['match', ['get', 'grupo'], 'nuevo', '#e08a00', 'revision', '#c77700', 'municipal', '#2f6b3a', 'cerrado', '#a59a88', '#e08a00']];
    const radio = (base: number) => ['+', base, ['min', 7, ['*', 1.6, ['-', ['coalesce', ['get', 'personas'], 1], 1]]], ['*', 2, ['get', 'vida']], ['case', ['==', ['get', 'grupo'], 'cerrado'], -1.5, 0]];
    try {
      map.setPaintProperty('citizen-dot', 'circle-color', color as any);
      map.setPaintProperty('citizen-dot', 'circle-radius', radio(5.5) as any);
      map.setPaintProperty('citizen-dot', 'circle-stroke-color', ['case', ['==', ['get', 'vida'], 1], '#ffffff', '#1b1b1b'] as any);
      map.setPaintProperty('citizen-halo', 'circle-color', color as any);
      map.setPaintProperty('citizen-halo', 'circle-stroke-color', color as any);
      map.setPaintProperty('citizen-halo', 'circle-radius', radio(13) as any);
    } catch { /* estilo sin capas ciudadanas: quedan los colores por defecto */ }
    map.on('click', 'citizen-dot', (e) => { const id = e.features?.[0]?.properties?.id; if (id) enfocar(String(id)); });
    map.on('mouseenter', 'citizen-dot', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'citizen-dot', () => (map.getCanvas().style.cursor = ''));
    document.body.dataset.v3d = 'listo';
    pintarPuntos(true);
    map.once('idle', () => { const a = raiz.querySelector('.maplibregl-ctrl-attrib'); a?.classList.remove('maplibregl-compact-show'); a?.removeAttribute('open'); });
  });
  escena.onElegirCentro((cod) => { const c = tienda.porCod.get(cod); if (c) { tienda.seleccionar(c); tienda.setPestana('campo'); } });
  tienda.on('seleccion', (c) => { escena.setSeleccion(c); if (c) { cerrarTarjeta(); void escena.volarA(c); } });
  const brujula = $('[data-norte] svg'), zoom = $('[data-zoom]');
  let rafMov = 0;
  map.on('move', () => { rafMov ||= requestAnimationFrame(() => { rafMov = 0; brujula.style.transform = `rotate(${-map.getBearing()}deg)`; zoom.textContent = `z${num(map.getZoom(), 1)}`; }); });
  $('[data-norte]').onclick = () => map.easeTo({ bearing: 0, duration: 600 });
  raiz.querySelectorAll<HTMLButtonElement>('[data-dim]').forEach((b) => (b.onclick = () => {
    escena.set2D(b.dataset.dim === '2');
    raiz.querySelectorAll('[data-dim]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('[data-pc]').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : raiz.requestFullscreen?.())?.catch?.(() => {});

  let firmaPuntos = '';
  function pintarPuntos(forzar = false) {
    const xs = vista();
    const f = xs.map((i) => `${i.id}:${i.estado}:${i.personas}`).join(',');
    if (!forzar && f === firmaPuntos) return;
    firmaPuntos = f;
    escena.setReportes(xs.map((i): PuntoReporte & { grupo: string; vida: number; personas: number } => ({
      id: i.id, lat: i.lat, lon: i.lon, type: i.tipo, severity: i.severidad, note: `${vecinos(i.personas)} · ${plural(i.nFotos, 'foto', 'fotos')}`,
      state: ESTADO[i.estado], grupo: grupoDe(i.estado), vida: vida(i) ? 1 : 0, personas: i.personas,
    })));
  }

  // ---------- tarjeta flotante + marcador pulsante + vuelo ----------
  const tarjeta = $('[data-tarjeta]');
  let firmaTarjeta = '';
  function pintarTarjeta(forzar = false) {
    const i = vista().find((x) => x.id === actualId) ?? null;
    tarjeta.hidden = !i;
    if (!i) { firmaTarjeta = ''; return; }
    const c = ctx(i);
    const f = `${i.id}|${i.estado}|${i.accion}|${i.personas}|${i.nFotos}|${i.fotos.length}|${i.puntaje}|${c.puede}|${c.motivoNo}|${!!c.antes}`;
    if (!forzar && f === firmaTarjeta) return;
    firmaTarjeta = f;
    tarjeta.dataset.id = i.id; tarjeta.dataset.estado = i.estado; tarjeta.dataset.tono = tono(i);
    tarjeta.classList.toggle('vida', vida(i));
    tarjeta.innerHTML = tarjetaHtml(i, c);
    tarjeta.querySelectorAll<HTMLImageElement>('.muni-foto img').forEach((img) => (img.onerror = () => img.parentElement!.classList.add('rota')));
    tarjeta.querySelectorAll<HTMLImageElement>('.mon-t-vis img').forEach((img) => (img.onerror = () => img.remove())); // queda el ícono del tipo
    hidratarFotos(tarjeta, cab);
  }
  tarjeta.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, id = tarjeta.dataset.id!;
    if (t.closest('[data-cerrar-tarjeta]')) return cerrarTarjeta();
    const b = t.closest<HTMLButtonElement>('.mon-acc');
    if (b) return void accionar(id, b.dataset.destino as Estado, b.dataset.accion as Accion | undefined);
    const fo = t.closest<HTMLElement>('button.muni-foto');
    const i = vista().find((x) => x.id === id);
    if (fo && i) { galeria = { fotos: i.fotos, k: Math.min(+fo.dataset.k!, i.fotos.length - 1) }; pintarGaleria(); }
  });
  function cerrarTarjeta() { actualId = null; marcador?.remove(); marcador = null; pintarTarjeta(); panel.pintar(true); }
  function enfocar(id: string) {
    const i = vista().find((x) => x.id === id) ?? incs.find((x) => x.id === id);
    if (!i) return;
    actualId = id; pendiente = null;
    if (tienda.seleccion) tienda.seleccionar(null);
    pintarTarjeta(true); panel.pintar(true);
    tarjeta.classList.remove('entra'); void tarjeta.offsetWidth; tarjeta.classList.add('entra');
    escena.listo.then(() => {
      if (actualId !== id) return;
      marcador?.remove();
      const el = document.createElement('div');
      el.className = 'mon-pulso' + (vida(i) ? ' vida' : '');
      el.innerHTML = '<i></i><i></i><b></b>';
      marcador = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([i.lon, i.lat]).addTo(map);
      // La cámara solo necesita lon/lat del destino (escena.volarA): acercamiento + órbita lenta, cancelable.
      void escena.volarA({ lon: i.lon, lat: i.lat } as Parameters<typeof escena.volarA>[0]);
    });
  }
  const soltarPendiente = () => { if (pendiente && !ocupado()) { const p = pendiente; pendiente = null; enfocar(p); } };

  // ---------- galería a pantalla completa ----------
  const gf = $('[data-galeria]');
  function pintarGaleria() {
    gf.hidden = !galeria;
    if (!galeria) return;
    const { fotos, k } = galeria, img = gf.querySelector('img')!, pie = gf.querySelector('figcaption')!;
    img.removeAttribute('src');
    img.alt = `Foto ${k + 1} de ${fotos.length} enviada por un vecino`;
    pie.textContent = `Foto ${k + 1} de ${fotos.length} · enviada por un vecino · por validar`;
    urlFoto(fotos[k], cab).then((u) => { if (galeria?.fotos[galeria.k] === fotos[k]) img.src = u; }, () => { pie.textContent = `Foto ${k + 1} de ${fotos.length} · aún no disponible`; });
    gf.querySelectorAll<HTMLElement>('[data-g=ant],[data-g=sig]').forEach((b) => (b.hidden = fotos.length < 2));
    gf.querySelector<HTMLButtonElement>('[data-g=cerrar]')!.focus();
  }
  const moverGaleria = (d: number) => { if (galeria) { galeria.k = (galeria.k + d + galeria.fotos.length) % galeria.fotos.length; pintarGaleria(); } };
  gf.addEventListener('click', (e) => {
    const g = (e.target as HTMLElement).closest<HTMLElement>('[data-g]')?.dataset.g;
    if (g === 'cerrar' || e.target === gf) { galeria = null; pintarGaleria(); } else if (g === 'ant') moverGaleria(-1); else if (g === 'sig') moverGaleria(1);
  });
  document.addEventListener('keydown', (e) => {
    if (!galeria) return;
    if (e.key === 'Escape') { galeria = null; pintarGaleria(); } else if (e.key === 'ArrowLeft') moverGaleria(-1); else if (e.key === 'ArrowRight') moverGaleria(1);
  });

  // ---------- acciones (con confirmación) ----------
  function confirmar(titulo: string, texto: string, ok = 'Confirmar'): Promise<boolean> {
    $('[data-conf-titulo]').textContent = titulo;
    $('[data-conf-texto]').textContent = texto;
    $('[data-conf-ok]').textContent = ok;
    dlgConf.returnValue = '';
    dlgConf.showModal();
    return new Promise((res) => dlgConf.addEventListener('close', () => { res(dlgConf.returnValue === 'ok'); soltarPendiente(); }, { once: true }));
  }
  function pedirMotivo(): Promise<string | null> {
    const f = dlgDesc.querySelector('form')!;
    f.reset(); dlgDesc.returnValue = '';
    dlgDesc.showModal();
    return new Promise((res) => dlgDesc.addEventListener('close', () => {
      soltarPendiente();
      if (dlgDesc.returnValue !== 'ok') return res(null);
      const m = (f.elements.namedItem('motivo') as HTMLSelectElement).value, d = (f.elements.namedItem('detalle') as HTMLInputElement).value.trim();
      res((m === 'otro' ? d || 'Otro' : d ? `${m}: ${d}` : m).slice(0, 160));
    }, { once: true }));
  }
  async function accionar(id: string, destino: Estado, accion?: Accion) {
    const inc = incs.find((i) => i.id === id);
    if (!inc) return;
    const c = ctx(inc);
    if (!c.puede) return avisar(c.motivoNo, 'error');
    const extra: { accion?: Accion; motivo?: string; mensaje?: string } = accion ? { accion } : {};
    // Acción asignada o atendido: la municipalidad responde con un aviso firmado que llega a todos los celulares.
    const respuesta = destino === 'accion_asignada' || destino === 'atendido';
    const msg = $<HTMLElement>('[data-conf-msg]'), msgIn = msg.querySelector('input')!;
    msg.hidden = !respuesta; msgIn.value = '';
    const nombre = `${tipoTxt(inc.tipo)} (${vecinos(inc.personas)})`;
    if (destino === 'descartado') {
      const m = await pedirMotivo();
      if (!m) return;
      extra.motivo = m;
    } else {
      const que = destino === 'accion_asignada' && accion ? `Asignar «${ACCIONES[accion]}»` : VERBO[destino];
      const texto = `${nombre}. Queda en el historial a nombre de ${sesion.nombre} a las ${hhmm(Date.now())}, y el vecino lo verá en su celular.`
        + (respuesta ? ' Además se envía un aviso firmado de la municipalidad a todos los celulares conectados; los que no tienen internet lo reciben por QR de otro vecino.' : '');
      if (!(await confirmar(`${que}: ${tipoTxt(inc.tipo)}`, texto, que))) return;
      if (respuesta && msgIn.value.trim()) extra.mensaje = msgIn.value.trim().slice(0, 120);
    }
    const op = { quien: sesion.nombre, cabeceras: () => sesion.cabeceras() };
    try {
      if (destino === 'accion_asignada' && inc.estado === 'accion_asignada') await cambiarEstado(inc.id, { estado: destino, ...extra }, op);
      else await llevarA(inc, destino, extra, op);
      avisar(`${destino === 'accion_asignada' && extra.accion ? ACCION_TXT[extra.accion] : ESTADO[destino]} · ${tipoTxt(inc.tipo)}`);
    } catch (e) {
      avisar(esErrorAcceso(e) ? 'Sin permiso para cambiar estados: vuelve a iniciar sesión o pide el rol «operador».' : `No se pudo guardar: ${(e as Error).message}`, 'error');
    }
    await consultar(true);
  }

  // ---------- pintar todo lo que depende del cabezal ----------
  let rafT = 0;
  function refrescar(forzar = false) {
    const xs = vista();
    const k = contadores(xs);
    const n = $('[data-n="incidentes"]');
    if (n.textContent !== String(k.abiertos)) n.textContent = num(k.abiertos);
    n.toggleAttribute('data-cero', k.abiertos === 0);
    pintarPuntos(forzar); pintarTarjeta(forzar); panel.pintar(forzar);
  }
  tienda.on('t', () => { cancelAnimationFrame(rafT); rafT = requestAnimationFrame(() => refrescar()); });
  tienda.on('pestana', () => panel.pintar(true));

  // ---------- consulta cada 3 s (mismo origen, cabeceras de la sesión) ----------
  const vivoEl = $('[data-vivo]'), vivoTxt = $('[data-vivo-txt]'), banda = $('[data-banda]');
  function pintarEstado(e: 'ok' | 'error' | 'sin-red' | 'acceso') {
    estadoRed = e;
    vivoEl.dataset.estado = e;
    vivoTxt.textContent = e === 'ok' ? `En vivo · consulta cada 3 s · ${hhmm(ultimaOk, true)}`
      : e === 'sin-red' ? 'Sin red · reintentando cada 3 s'
      : e === 'acceso' ? 'Sin permiso · vuelve a iniciar sesión'
      : 'Sin respuesta del servidor · reintentando cada 3 s';
    banda.hidden = e === 'ok';
    banda.textContent = e === 'ok' ? '' : e === 'acceso'
      ? 'El servidor rechazó la sesión (401/403): los datos en pantalla pueden estar desactualizados. Vuelve a iniciar sesión.'
      : `${vivoTxt.textContent}. Lo que ves es la última lectura${ultimaOk ? ` (${hhmm(ultimaOk, true)})` : ''}.`;
    raiz.dataset.banda = e === 'ok' ? 'no' : 'off';
  }
  let desdeMs = 0;
  async function consultar(forzar = false) {
    if (enCurso && !forzar) return;
    enCurso = true; consultas++;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), INTERVALO_MS - 300);
    try {
      const [r, filas] = await Promise.all([traerIncidentes(ctl.signal, 'incidentes', cab), traerReportes(desdeMs, ctl.signal, cab)]);
      fuente = r.fuente;
      for (const f of filas) reportes.set(f.id, f);
      // Pide solo lo nuevo (el servidor que aún no filtra por «desde» devuelve los últimos: se fusionan por id).
      if (reportes.size) desdeMs = Math.max(...[...reportes.values()].map((x) => x.received_at)) - 60_000;
      const { nuevos, coinciden } = det.procesar(r.lista);
      incs = r.lista.sort(porPrioridad);
      const reps = [...reportes.values()].sort((a, b) => a.received_at - b.received_at);
      hs = indexar(incs, reps);
      ultimaOk = Date.now();
      pintarEstado('ok');
      const fd = reps.length + ':' + reps.at(-1)?.id + '|' + incs.map((i) => `${i.id}:${i.historial.length}:${i.reportIds.length}`).join(',');
      if (fd !== firmaDatos) { firmaDatos = fd; tienda.setReales(reps.map(fichaDeReporte)); linea.actualizar(reps, hs); }
      else tienda.extenderRango();
      const ahora = Date.now();
      for (const c of coinciden) {
        desde.set(c.inc.id, { personas: c.personasAntes, fotos: c.fotosAntes, hasta: ahora + ANIM_MS });
        coincidencias++;
        avisar(c.inc.personas > c.personasAntes ? `Otro vecino coincide: ${tipoTxt(c.inc.tipo)} · ahora ${vecinos(c.inc.personas)}` : `Nueva foto: ${tipoTxt(c.inc.tipo)} · ${plural(c.inc.nFotos, 'foto', 'fotos')}`, 'coincide', c.inc.id);
        setTimeout(() => refrescar(true), ANIM_MS + 50);
      }
      if (nuevos.length) {
        nuevosIds.push(...nuevos.map((x) => x.id));
        sonido.sonar();
        if (!vivo.enVivo) vivo.irEnVivo();
        avisar(`Incidente nuevo: ${tipoTxt(nuevos[0].tipo)} · ${ROTULO_VECINAL}`, 'nuevo', nuevos[0].id);
        if (ocupado()) pendiente = nuevos[0].id; else enfocar(nuevos[0].id); // el de mayor prioridad
      } else if (coinciden.length) sonido.sonar(TONOS_COINCIDE);
      if (vivo.enVivo) tienda.setT(tienda.rango[1]);
      refrescar();
    } catch (e) {
      errores++;
      pintarEstado(esErrorAcceso(e) ? 'acceso' : navigator.onLine ? 'error' : 'sin-red');
    } finally { clearTimeout(to); enCurso = false; }
  }

  // Reloj en vivo: el cabezal sigue el «ahora» y los «llegó hace N s» avanzan al segundo.
  setInterval(() => {
    if (raiz.hidden) return;
    if (vivo.enVivo) { tienda.extenderRango(); tienda.setT(tienda.rango[1]); }
    raiz.querySelectorAll<HTMLElement>('[data-recibido]').forEach((n) => (n.textContent = llegoHace(+n.dataset.recibido!)));
    if (estadoRed === 'ok' && ultimaOk) vivoTxt.textContent = `En vivo · consulta cada 3 s · ${hhmm(ultimaOk, true)}`;
  }, 1000);
  const ciclo = () => { (raiz.hidden ? Promise.resolve() : consultar()).finally(() => setTimeout(ciclo, INTERVALO_MS)); };
  Promise.all([cargarCentros(), cargarResumen()]).then(([cs, r]) => { tienda.setCentros(cs, r); refrescar(true); }).catch(() => avisar('No se pudieron cargar los centros poblados del escenario.', 'error'));
  addEventListener('online', () => tienda.setRed(true));
  addEventListener('offline', () => tienda.setRed(false));
  refrescar(true);
  ciclo();

  const api = {
    raiz, tienda, escena, linea,
    volver() { raiz.hidden = false; document.body.classList.add('vista-3d'); const u = new URL(location.href); u.searchParams.delete('vista'); history.replaceState(null, '', u); requestAnimationFrame(() => map.resize()); void consultar(true); },
    salir: salirA2D,
    estado: () => ({
      sembrado: det.sembrado, previos: det.previos, fuente, nuevos: [...nuevosIds], actual: actualId, consultas, errores, coincidencias,
      avisos: sonido.sonados, enVivo: vivo.enVivo, t: tienda.t, rango: tienda.rango, red: estadoRed, sesion: { modo: sesion.modo, nombre: sesion.nombre, rol: sesion.rol },
      reportes: reportes.size, eventos: linea.eventos().length, fase: (window as unknown as { __yakuEscena?: { cam?: { fase?: string } } }).__yakuEscena?.cam?.fase ?? null,
      incidentes: vista().map((i) => ({ id: i.id, tipo: i.tipo, personas: i.personas, reportes: i.reportes, nFotos: i.nFotos, puntaje: i.puntaje, estado: i.estado, accion: i.accion, abierto: !cerrado(i) })),
    }),
  };
  (window as unknown as { __yakuMonitoreo: typeof api }).__yakuMonitoreo = api;
  return api;
}
