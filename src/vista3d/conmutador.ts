// Conmutador 2D|3D sobre el MISMO mapa de la vista 2D (un solo contexto WebGL, mismas capas y estado).
// 2D sigue siendo el predeterminado; ?vista=3d entra directo al relieve. Si no hay WebGL 2, si se pierde el
// contexto o si el DEM no está guardado y no hay red, se queda (o vuelve) en 2D con un aviso.
import './vista3d.css';
import type { IControl, Map as MLMap, MapMouseEvent } from 'maplibre-gl';
import { Recorrido, type LngLat } from './camara';
import { activarRelieve, quitarRelieve } from './relieve';
import { demInfo, guardarDem, onDemCambio, prepararFuenteDem, registrarProtocoloDem } from './dem';
import { DEM, PITCH_MAX_2D, PITCH_MAX_3D, PIXEL_RATIO_MAX_3D } from './config';
import { medirFps } from './rendimiento';
import { ControlCuenca } from './cuenca';
import { basemapInfo } from '../map';

export type Modo = '2d' | '3d';
export const modoInicial = (search: string): Modo => (new URLSearchParams(search).get('vista') === '3d' ? '3d' : '2d');

export function soportaWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}
const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mb = (b: number) => (b / 1e6).toFixed(1).replace('.', ',') + ' MB';

/** Texto corto del estado del DEM para el conmutador (sin red = copia local). */
export function textoDem(e: typeof demInfo): string {
  switch (e.estado) {
    case 'guardado': return `Relieve guardado en este equipo (${mb(DEM.bytes)}): funciona sin red`;
    case 'descargando': return `Guardando relieve… ${Math.floor((100 * e.cargado) / DEM.bytes)} % de ${mb(DEM.bytes)}`;
    case 'comprobando': return 'Comprobando relieve guardado…';
    case 'sin-red': return `Relieve no guardado: conéctese una vez para guardarlo (${mb(DEM.bytes)})`;
    case 'error': return 'No se pudo guardar el relieve: ' + e.msg;
    case 'no-soportado': return 'Este navegador no permite guardar el relieve sin red';
    default: return `Relieve 3D (${mb(DEM.bytes)})`;
  }
}

export class Vista3D implements IControl {
  modo: Modo = '2d';
  readonly recorrido: Recorrido;
  private el = document.createElement('div');
  private b2 = document.createElement('button');
  private b3 = document.createElement('button');
  private aviso = document.createElement('div');
  private ocupado = false;

  constructor(private map: MLMap) {
    this.recorrido = new Recorrido(map);
    this.recorrido.onFase = (f) => { this.el.dataset.fase = f; };
  }

  onAdd() {
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-group v3d-conmutador';
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', 'Vista del mapa');
    for (const [b, m] of [[this.b2, '2d'], [this.b3, '3d']] as const) {
      b.type = 'button'; b.textContent = m.toUpperCase(); b.dataset.modo = m;
      b.onclick = () => this.set(m);
    }
    this.aviso.className = 'v3d-aviso'; this.aviso.hidden = true; this.aviso.setAttribute('role', 'status');
    this.el.append(this.b2, this.b3, this.aviso);
    this.pintar();
    onDemCambio(() => this.pintar());

    // Cualquier gesto del usuario cancela vuelo u órbita.
    const cancelar = () => { if (this.recorrido.fase !== 'inactivo') this.recorrido.detener(); };
    const cont = this.map.getCanvasContainer();
    for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const) cont.addEventListener(ev, cancelar, { passive: true });
    // En 3D, elegir un centro poblado del escenario CENEPRED dispara el acercamiento + órbita.
    this.map.on('click', 'cenepred-ccpp', (e: MapMouseEvent & { features?: any[] }) => {
      if (this.modo !== '3d') return;
      const c = e.features?.[0]?.geometry?.coordinates as LngLat | undefined;
      if (c) this.recorrido.iniciar([c[0], c[1]], { saltarRegional: true });
    });
    // Contexto WebGL perdido (memoria del celular): la UI vuelve a 2D en el acto; el estilo se limpia sin animación.
    this.map.on('webglcontextlost', () => {
      if (this.modo !== '3d') return;
      this.recorrido.detener(false);
      this.modo = '2d'; this.pintar(); this.avisar('Se perdió el contexto gráfico: vuelta al mapa 2D.');
      this.restaurar2D();
    });
    return this.el;
  }

  onRemove() { this.recorrido.detener(); this.el.remove(); }

  private pintar() {
    this.b2.setAttribute('aria-pressed', String(this.modo === '2d'));
    this.b3.setAttribute('aria-pressed', String(this.modo === '3d'));
    this.b3.title = textoDem(demInfo);
    this.el.dataset.modo = this.modo;
    this.el.dataset.dem = demInfo.estado;
    document.body.dataset.vista = this.modo;
  }

  private avisar(t: string | null) {
    this.aviso.textContent = t ?? '';
    this.aviso.hidden = !t;
    if (t) setTimeout(() => { if (this.aviso.textContent === t) this.aviso.hidden = true; }, 6000);
  }

  /** Cambia de vista con transición. Devuelve el modo resultante. */
  async set(modo: Modo, { cinematica = true, aviso = null as string | null } = {}): Promise<Modo> {
    if (this.ocupado || modo === this.modo) return this.modo;
    this.ocupado = true;
    try {
      const m = this.map;
      if (modo === '3d') {
        if (!soportaWebGL2()) { this.avisar('Este equipo no tiene WebGL 2: se mantiene el mapa 2D.'); return this.modo; }
        registrarProtocoloDem();
        this.el.dataset.cargando = '1';
        const guardado = await prepararFuenteDem();
        delete this.el.dataset.cargando;
        if (!guardado && !navigator.onLine) { this.avisar(textoDem(demInfo)); return this.modo; }
        activarRelieve(m);
        m.dragRotate.enable(); m.touchZoomRotate.enableRotation(); m.keyboard.enable();
        m.setMaxPitch(PITCH_MAX_3D);
        this.pr2D = m.getPixelRatio();
        if (this.pr2D > PIXEL_RATIO_MAX_3D) m.setPixelRatio(PIXEL_RATIO_MAX_3D);
        this.modo = '3d'; this.pintar(); this.avisar(aviso);
        if (cinematica) this.recorrido.vistaRegional();
        else m.easeTo({ pitch: 60, duration: reducido() ? 0 : 900 });
      } else {
        this.recorrido.detener();
        quitarRelieve(m);
        m.setPixelRatio(this.pr2D);
        this.modo = '2d'; this.pintar(); this.avisar(aviso);
        await new Promise<void>((res) => {
          const t = setTimeout(res, 1600);
          m.once('moveend', () => { clearTimeout(t); res(); });
          m.easeTo({ pitch: 0, bearing: 0, duration: reducido() ? 0 : 900 });
        });
        this.restaurar2D();
      }
      return this.modo;
    } finally { this.ocupado = false; }
  }

  private pr2D = 1;
  /** Deja el mapa como lo crea la vista 2D (plano, sin rotación). Tolerante a un contexto WebGL perdido. */
  private restaurar2D() {
    const m = this.map;
    try { quitarRelieve(m); } catch { /* contexto perdido: el estilo se limpia al restaurarse */ }
    try { m.setPixelRatio(this.pr2D); m.jumpTo({ pitch: 0, bearing: 0 }); } catch { /* ídem */ }
    m.setMaxPitch(PITCH_MAX_2D);
    m.dragRotate.disable(); m.touchZoomRotate.disableRotation();
  }

  /** Preset «Ver desde la cuenca» (río Piura aguas arriba → Bajo Piura), solo en 3D. */
  verCuenca() { return this.modo === '3d' ? this.recorrido.verCuenca() : Promise.resolve(false); }

  /** Vuelo de cámara a un punto (acercamiento + órbita), solo en 3D. */
  volarA(lon: number, lat: number) { return this.modo === '3d' ? this.recorrido.iniciar([lon, lat], { saltarRegional: true }) : Promise.resolve(false); }
}

/** Guarda el DEM en segundo plano cuando el mapa base ya quedó guardado (no compite con él) y hay red. */
function guardarDemEnReposo(listoBase: () => boolean) {
  const con = (navigator as any).connection;
  if (con?.saveData) return;
  let intentos = 0;
  const probar = () => {
    if (!navigator.onLine || intentos++ > 40) return;
    if (!listoBase()) { setTimeout(probar, 3000); return; }
    const ric = (self as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 500));
    ric(() => guardarDem());
  };
  setTimeout(probar, 4000);
}

/** Monta el conmutador 2D|3D en el mapa de la vista 2D. Único punto de entrada desde main.ts. */
export function montarVista3D(map: MLMap, { listoBase = () => basemapInfo().state === 'saved' }: { listoBase?: () => boolean } = {}) {
  const v = new Vista3D(map);
  map.addControl(v, 'top-right');
  map.addControl(new ControlCuenca(() => v.verCuenca()), 'bottom-right');
  (window as any).__yaku3d = { vista: v, dem: () => ({ ...demInfo }), fps: (ms?: number) => medirFps(map, ms) };
  const inicio = modoInicial(location.search);
  const alCargar = () => {
    if (inicio === '3d') v.set('3d');
    guardarDemEnReposo(listoBase);
  };
  if (map.loaded()) alCargar(); else map.once('load', alCargar);
  return v;
}
