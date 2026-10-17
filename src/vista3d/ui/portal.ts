// PORTAL DE CAMPO: ventana flotante sobre la escena (como la cámara del dron de FireTrace) con una mini-vista
// en órbita del centro poblado elegido y un HUD con sus datos. Es una vista del MODELO 3D (relieve + capas),
// no una imagen en vivo: así lo dice el propio HUD.
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import type { CentroPoblado, EscenaYaku } from './contrato';
import type { Tienda } from './tienda';
import { fichasDe, nivelTxt } from './datos';
import { altitudTxt, coberturaTxt, dms, esc, estadoCentro, FUENTE_CENTRO, num, rumbo } from './formato';
import { clamp, fechaHora } from './tiempo';
import { IC } from './iconos';

const Z_MIN = 10, Z_MAX = 15.5, Z_INI = 12.6, PITCH = 62, GRADOS_POR_S = 6;
const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Portal { el: HTMLElement; mini: () => MLMap | null; destruir(): void }

export function montarPortal(escenaEl: HTMLElement, escena: EscenaYaku, tienda: Tienda): Portal {
  const el = document.createElement('section');
  el.className = 'v3d-portal';
  el.hidden = true;
  el.dataset.modo = 'color';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Portal de campo');
  el.innerHTML = `
    <div class="v3d-visor">
      <div class="v3d-mini" aria-hidden="true"></div>
      <span class="v3d-esq a"></span><span class="v3d-esq b"></span><span class="v3d-esq c"></span><span class="v3d-esq d"></span>
      <div class="v3d-reticula" aria-hidden="true"></div>
      <div class="v3d-rumbo" aria-hidden="true"><div class="cinta"></div><b data-h="rumbo">000°</b></div>
      <div class="v3d-hud tl" data-h="tl" aria-hidden="true"></div>
      <div class="v3d-hud tr" data-h="tr" aria-hidden="true"></div>
      <div class="v3d-hud bl" data-h="bl" aria-hidden="true"></div>
      <div class="v3d-hud br" data-h="br" aria-hidden="true"></div>
      <div class="v3d-hud bc" data-h="bc" aria-hidden="true"></div>
      <div class="v3d-estatica" aria-hidden="true"></div>
    </div>
    <div class="v3d-pbar">
      <span class="t" data-h="titulo"></span>
      <span class="modos" role="group" aria-label="Modo de la mini-vista">
        <button type="button" data-modo="color" aria-pressed="true">Color</button><button type="button" data-modo="relieve" aria-pressed="false">Relieve</button>
      </span>
      <button type="button" data-a="menos" aria-label="Alejar la mini-vista">${IC.menos}</button>
      <span class="z" data-h="zoom">z12,6</span>
      <button type="button" data-a="mas" aria-label="Acercar la mini-vista">${IC.mas}</button>
      <button type="button" data-a="volar" aria-label="Volar la escena a este centro poblado" title="Volar la escena aquí">${IC.volar}</button>
      <button type="button" data-a="tam" aria-label="Ampliar el portal" aria-pressed="false">${IC.expandir}</button>
      <button type="button" data-a="cerrar" aria-label="Cerrar el portal de campo">${IC.cerrar}</button>
    </div>
    <p class="v3d-pfuente" data-h="fuente"></p>
    <p class="sr" aria-live="polite" data-h="anuncio"></p>`;
  escenaEl.append(el);
  const $ = (k: string) => el.querySelector<HTMLElement>(`[data-h="${k}"]`)!;
  const miniEl = el.querySelector<HTMLElement>('.v3d-mini')!;

  let mini: MLMap | null = null;
  let cp: CentroPoblado | null = null;
  let alt: number | null = null;
  const cache: Record<string, string> = {};
  const poner = (k: string, html: string) => { if (cache[k] !== html) { cache[k] = html; $(k).innerHTML = html; } };

  // ---------- mini-vista (segundo MapLibre liviano: sin etiquetas ni puntos densos) ----------
  function crearMini(c: CentroPoblado) {
    try {
      mini = new maplibregl.Map({
        container: miniEl, style: escena.estiloMiniVista(), center: [c.lon, c.lat], zoom: Z_INI, pitch: PITCH,
        bearing: escena.map.getBearing(), interactive: false, attributionControl: false, fadeDuration: 0,
        maxPitch: 80, pixelRatio: Math.min(devicePixelRatio, 1.5),
      });
    } catch {
      mini = null;
      miniEl.innerHTML = '<p style="color:#e8dcc6;padding:48px 18px;font-size:12px">Mini-vista no disponible en este equipo (WebGL). El HUD sigue mostrando los datos.</p>';
      return;
    }
    mini.once('load', () => {
      const tr = escena.terrenoMiniVista();
      if (tr && mini) mini.setTerrain(tr);
      if (cp) marcar(cp);
    });
    mini.on('idle', () => { if (cp) { leerAltitud(cp); hud(); } });
  }
  function marcar(c: CentroPoblado) {
    (mini?.getSource('v3d-sel') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: {} }] });
  }
  function leerAltitud(c: CentroPoblado) {
    let a = escena.altitud(c.lon, c.lat);
    const tr = mini?.getTerrain();
    if ((a === null || a === 0) && mini && tr) {
      const e = mini.queryTerrainElevation([c.lon, c.lat]);
      if (e !== null && e !== undefined) a = e / (tr.exaggeration ?? 1);
    }
    if (a !== null) alt = a;
  }

  // ---------- órbita (30 fps bastan para un giro de 6°/s; se pausa oculta o con movimiento reducido) ----------
  let raf = 0, ultimo = 0, ultimaAlt = 0;
  const bucle = (t: number) => {
    raf = requestAnimationFrame(bucle);
    if (!mini || el.hidden || el.offsetParent === null || document.hidden) { ultimo = 0; return; }
    if (ultimo && t - ultimo < 33) return;
    // El DEM afina a medida que llegan teselas: releer la altitud cada 2 s (las dos vistas giran y nunca quedan «idle»).
    if (cp && t - ultimaAlt > 2000) { ultimaAlt = t; leerAltitud(cp); hud(); }
    const dt = ultimo ? t - ultimo : 0;
    ultimo = t;
    mini.setBearing(mini.getBearing() + (dt / 1000) * GRADOS_POR_S);
    rumboHud();
  };
  const orbitar = (on: boolean) => {
    cancelAnimationFrame(raf); raf = 0; ultimo = 0;
    if (on && !reducido()) raf = requestAnimationFrame(bucle);
  };

  // ---------- HUD ----------
  function rumboHud() {
    if (!mini) return;
    const b = mini.getBearing();
    $('rumbo').textContent = rumbo(b);
    el.querySelector<HTMLElement>('.v3d-rumbo .cinta')!.style.backgroundPositionX = `${(-b * 1.5) % 15}px`;
  }
  function hud() {
    if (!cp) return;
    const fs = fichasDe(cp.cod, tienda.fichas(), tienda.asoc, tienda.t);
    const est = estadoCentro(fs.length);
    const cob = coberturaTxt(cp);
    const z = mini?.getZoom() ?? Z_INI;
    poner('tl', `<span class="rec">Portal de campo · modelo 3D</span><br><span class="nombre">${esc(cp.n)}</span><br>`
      + `<span class="dim">${esc(cp.d)} · ${esc(cp.pr)}</span><br><span class="dim">Pob. ${num(cp.pob)} · Excel CENEPRED</span>`);
    poner('tr', `${esc(fechaHora(tienda.t))} · Lima<br><span class="dim">Escenario 17–19/10/2026</span><br>`
      + `Este equipo: <span class="${tienda.red ? 'redon' : 'redoff'}">${tienda.red ? 'EN LÍNEA' : 'SIN RED'}</span>`);
    poner('bl', `Alt ${esc(altitudTxt(alt))}${alt !== null ? ' <span class="dim">· DEM ~300 m</span>' : ' <span class="dim">· DEM cargando</span>'}<br>`
      + `${esc(dms(cp.lat, cp.lon))}<br><span class="dim">${cp.lat.toFixed(5)}, ${cp.lon.toFixed(5)}</span>`);
    poner('br', `Exposición inundación: <span class="r${cp.r}">${esc(nivelTxt(cp.r))}</span><br>`
      + `OSIPTEL: <span class="${cob.clase}">${esc(cob.corto)}</span><br>`
      + (fs.length ? `<span class="nv">${fs.length} ficha${fs.length > 1 ? 's' : ''} · NO VERIFICADO</span>${fs.some((f) => f.simulado) ? ' <span class="sf">SIMULADO</span>' : ''}` : `<span class="sf">${esc(est.txt)}</span>`));
    poner('bc', `z ${num(z, 1)} · pitch ${PITCH}° · relieve ×1,6`);
    poner('titulo', `${esc(cp.n)}<small>${esc(cp.d)}</small>`);
    $('zoom').textContent = `z${num(z, 1)}`;
    poner('fuente', `Fuente: ${esc(FUENTE_CENTRO)}. ${esc(cob.largo)}. Vista del modelo (relieve + capas), no imagen en vivo.`);
  }

  // ---------- abrir / cambiar / cerrar ----------
  function abrir(c: CentroPoblado) {
    const cambio = !!cp && !el.hidden;
    cp = c; alt = null;
    el.hidden = false;
    el.setAttribute('aria-label', `Portal de campo: ${c.n}`);
    if (!mini) crearMini(c);
    else {
      mini.jumpTo({ center: [c.lon, c.lat], zoom: Z_INI, pitch: PITCH, bearing: escena.map.getBearing() });
      marcar(c);
      requestAnimationFrame(() => mini?.resize());
    }
    if (cambio && !reducido()) { el.classList.remove('cambiando'); void el.offsetWidth; el.classList.add('cambiando'); }
    leerAltitud(c);
    hud(); rumboHud();
    orbitar(true);
    const fs = fichasDe(c.cod, tienda.fichas(), tienda.asoc, tienda.t);
    $('anuncio').textContent = `Portal de campo: ${c.n}, ${c.d}. Exposición a inundaciones ${nivelTxt(c.r)}. ${coberturaTxt(c).largo}. ${fs.length ? `${fs.length} ficha(s) NO VERIFICADO.` : estadoCentro(0).txt + '.'}`;
  }
  function cerrar() {
    el.hidden = true; cp = null;
    orbitar(false);
    el.classList.remove('cambiando');
  }

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.modo) {
      el.dataset.modo = b.dataset.modo;
      el.querySelectorAll('[data-modo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      return;
    }
    const z = mini?.getZoom() ?? Z_INI;
    switch (b.dataset.a) {
      case 'menos': mini?.easeTo({ zoom: clamp(z - 0.8, Z_MIN, Z_MAX), duration: 300 }); break;
      case 'mas': mini?.easeTo({ zoom: clamp(z + 0.8, Z_MIN, Z_MAX), duration: 300 }); break;
      case 'volar': if (cp) escena.volarA(cp); break;
      case 'tam': {
        const grande = el.dataset.tam !== 'grande';
        if (grande) el.dataset.tam = 'grande'; else delete el.dataset.tam;
        b.setAttribute('aria-pressed', String(grande));
        b.setAttribute('aria-label', grande ? 'Reducir el portal' : 'Ampliar el portal');
        b.innerHTML = grande ? IC.contraer : IC.expandir;
        requestAnimationFrame(() => mini?.resize());
        break;
      }
      case 'cerrar': tienda.seleccionar(null); break;
    }
    setTimeout(hud, 320);
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') tienda.seleccionar(null); });

  const quitar = [
    tienda.on('seleccion', (c) => (c ? abrir(c) : cerrar())),
    tienda.on('t', () => hud()),
    tienda.on('fichas', () => hud()),
    tienda.on('red', () => hud()),
  ];
  const vis = () => { if (!document.hidden && cp) orbitar(true); };
  document.addEventListener('visibilitychange', vis);

  return {
    el, mini: () => mini,
    destruir() { quitar.forEach((q) => q()); document.removeEventListener('visibilitychange', vis); orbitar(false); mini?.remove(); el.remove(); },
  };
}
