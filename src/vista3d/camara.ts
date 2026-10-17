// Cámara cinematográfica: vuelo regional oblicuo → acercamiento al centro poblado → órbita lenta.
// Lógica pura (testeable sin WebGL) + un controlador que habla con una interfaz mínima del mapa.
// Cualquier gesto del usuario (puntero, rueda, teclado) cancela el recorrido.
import { CUENCA, EXAGERACION, VISTA_REGIONAL } from './config';

export type LngLat = [number, number];
export interface Vista { center: LngLat; zoom: number; pitch: number; bearing: number }
export type Fase = 'inactivo' | 'regional' | 'acercamiento' | 'orbita' | 'cuenca';

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Lleva un rumbo a (-180, 180]. */
export function normalizarRumbo(b: number) {
  const r = ((((b + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}

/** Distancia ortodrómica en km. */
export function distanciaKm([lon1, lat1]: LngLat, [lon2, lat2]: LngLat) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Duración del acercamiento según la distancia: ni un salto brusco ni un vuelo eterno. */
export const duracionVuelo = (km: number) => Math.round(Math.min(7000, Math.max(3200, 2600 + km * 22)));

export interface Plan { regional: Vista & { duration: number }; acercamiento: Vista & { duration: number }; orbita: { gradosPorS: number; rampaS: number } }

/** Plan del recorrido hacia un objetivo. El acercamiento gira ~35° respecto del rumbo de partida (giro suave). */
export function planRecorrido(objetivo: LngLat, desde: LngLat = VISTA_REGIONAL.center, rumboDesde = VISTA_REGIONAL.bearing): Plan {
  const regional = { ...VISTA_REGIONAL, duration: 4200 };
  const km = distanciaKm(desde, objetivo);
  return {
    regional,
    acercamiento: { center: objetivo, zoom: 11.6, pitch: 64, bearing: normalizarRumbo(rumboDesde + 35), duration: duracionVuelo(km) },
    orbita: { gradosPorS: 5, rampaS: 2 },
  };
}

/** Rumbo de la órbita a los t segundos: la velocidad sube linealmente durante la rampa (sin tirón) y luego es constante. */
export function rumboOrbita(t: number, b0: number, gradosPorS: number, rampaS: number) {
  if (t <= 0) return normalizarRumbo(b0);
  const giro = t < rampaS ? (gradosPorS * t * t) / (2 * rampaS) : gradosPorS * (t - rampaS / 2);
  return normalizarRumbo(b0 + giro);
}

// ---------- preset «Ver desde la cuenca» ----------
// Misma geometría que MapLibre (Transform.calculateCameraOptionsFromTo): coordenadas Mercator en [0, 1], la
// altura dividida por la circunferencia a esa latitud, y zoom = log2(distancia cámara-centro en px / distancia 3D / 512).
const CIRCUNFERENCIA = 2 * Math.PI * 6371008.8;
/** Campo de visión vertical por defecto de MapLibre (0,6435 rad ≈ 36,87°): distancia cámara-centro = 1,5 × alto. */
const FOV_MAPLIBRE = 0.6435011087932844;
const mercX = (lon: number) => (180 + lon) / 360;
const mercY = (lat: number) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;
const mercZ = (alt: number, lat: number) => alt / (CIRCUNFERENCIA * Math.cos((lat * Math.PI) / 180));

export interface PuntoCota { lon: number; lat: number; m: number }
export interface PresetCuenca { vuelo: Vista & { duration: number }; camara: { lon: number; lat: number; alt: number } }

/**
 * Cámara sobre `desde` (río arriba) mirando a `hacia` (Bajo Piura), con la inclinación pedida. La altura de la
 * cámara sale de la geometría: alt = cota exagerada del destino + distancia horizontal / tan(pitch). Pura: el alto
 * del lienzo (px) entra como parámetro porque el zoom de MapLibre depende de él.
 */
export function presetCuenca(desde: PuntoCota = CUENCA.desde, hacia: PuntoCota = CUENCA.hacia, { altoPx = 800, pitch = CUENCA.pitch, exageracion = EXAGERACION, duracion = CUENCA.duracion } = {}): PresetCuenca {
  const suelo = distanciaKm([desde.lon, desde.lat], [hacia.lon, hacia.lat]) * 1000;
  const altHacia = hacia.m * exageracion;
  const alt = altHacia + suelo / Math.tan((pitch * Math.PI) / 180);
  const dx = mercX(hacia.lon) - mercX(desde.lon), dy = mercY(hacia.lat) - mercY(desde.lat);
  const dz = mercZ(altHacia, hacia.lat) - mercZ(alt, desde.lat);
  const d3 = Math.hypot(dx, dy, dz), dSuelo = Math.hypot(dx, dy);
  const camaraCentroPx = (0.5 / Math.tan(FOV_MAPLIBRE / 2)) * altoPx;
  const deg = 180 / Math.PI;
  return {
    vuelo: {
      center: [hacia.lon, hacia.lat],
      zoom: +Math.log2(camaraCentroPx / d3 / 512).toFixed(3),
      pitch: +(90 - Math.acos(dSuelo / d3) * deg).toFixed(2),
      bearing: +normalizarRumbo(Math.atan2(dx, -dy) * deg).toFixed(2),
      duration: duracion,
    },
    camara: { lon: desde.lon, lat: desde.lat, alt: Math.round(alt) },
  };
}

/** Lo mínimo que el controlador necesita del mapa (MapLibre lo cumple; los tests usan un doble). */
export interface MapaCamara {
  flyTo(o: Vista & { duration: number; easing?: (t: number) => number; essential?: boolean; curve?: number }): unknown;
  once(ev: 'moveend', cb: () => void): unknown;
  jumpTo(o: { bearing: number }): unknown;
  getBearing(): number;
  getCenter(): { lng: number; lat: number };
  stop(): unknown;
  /** Para el zoom del preset de la cuenca (opcional: sin lienzo se asume 800 px). */
  getCanvas?(): { clientHeight: number };
}

export interface Reloj { raf(cb: (t: number) => void): number; caf(id: number): void; ahora(): number }
const relojNavegador: Reloj = {
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
  ahora: () => performance.now(),
};
const movimientoReducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Recorrido {
  fase: Fase = 'inactivo';
  private token = 0;
  private rafId = 0;
  onFase: (f: Fase) => void = () => {};
  constructor(private m: MapaCamara, private reloj: Reloj = relojNavegador, private reducido: () => boolean = movimientoReducido) {}

  private setFase(f: Fase) { this.fase = f; this.onFase(f); }

  /** Vuela y resuelve al terminar (true) o al ser interrumpido (false). Red de seguridad por si moveend no llega. */
  private volar(v: Vista & { duration: number }, tok: number) {
    const duration = this.reducido() ? 0 : v.duration;
    return new Promise<boolean>((res) => {
      let hecho = false;
      const fin = () => { if (!hecho) { hecho = true; clearTimeout(t); res(tok === this.token); } };
      // Cortar antes cualquier vuelo en curso: su moveend no debe confundirse con el fin de este.
      this.m.stop();
      const t = setTimeout(fin, duration + 1500);
      this.m.once('moveend', fin);
      this.m.flyTo({ ...v, duration, easing: easeInOutCubic, curve: 1.25, essential: true });
    });
  }

  /** Solo el vuelo regional oblicuo con horizonte (entrada al 3D). */
  async vistaRegional(): Promise<boolean> {
    this.detener(false);
    const tok = ++this.token;
    this.setFase('regional');
    const ok = await this.volar(planRecorrido(VISTA_REGIONAL.center).regional, tok);
    if (ok) this.setFase('inactivo');
    return ok;
  }

  /** Preset «Ver desde la cuenca»: un vuelo hasta la vista río abajo, sin órbita (la vista queda quieta para leerla). */
  async verCuenca(): Promise<boolean> {
    this.detener(false);
    const tok = ++this.token;
    this.setFase('cuenca');
    const altoPx = this.m.getCanvas?.().clientHeight || 800;
    const ok = await this.volar(presetCuenca(CUENCA.desde, CUENCA.hacia, { altoPx }).vuelo, tok);
    if (ok) this.setFase('inactivo');
    return ok;
  }

  /** Recorrido completo. Resuelve false si el usuario lo interrumpió. */
  async iniciar(objetivo: LngLat, { saltarRegional = false } = {}): Promise<boolean> {
    this.detener(false);
    const tok = ++this.token;
    const c = this.m.getCenter();
    const plan = saltarRegional ? planRecorrido(objetivo, [c.lng, c.lat], this.m.getBearing()) : planRecorrido(objetivo);
    if (!saltarRegional) {
      this.setFase('regional');
      if (!(await this.volar(plan.regional, tok))) return false;
    }
    this.setFase('acercamiento');
    if (!(await this.volar(plan.acercamiento, tok))) return false;
    if (this.reducido()) { this.setFase('inactivo'); return true; }
    this.orbitar(plan.orbita.gradosPorS, plan.orbita.rampaS, tok);
    return true;
  }

  /** Órbita lenta alrededor del centro actual hasta que algo la cancele. */
  orbitar(gradosPorS = 5, rampaS = 2, tok = ++this.token) {
    this.setFase('orbita');
    const b0 = this.m.getBearing(), t0 = this.reloj.ahora();
    const paso = () => {
      if (tok !== this.token) return;
      this.m.jumpTo({ bearing: rumboOrbita((this.reloj.ahora() - t0) / 1000, b0, gradosPorS, rampaS) });
      this.rafId = this.reloj.raf(paso);
    };
    this.rafId = this.reloj.raf(paso);
  }

  /** Cancela cualquier fase (gesto del usuario, salida del 3D). */
  detener(pararMapa = true) {
    this.token++;
    if (this.rafId) this.reloj.caf(this.rafId);
    this.rafId = 0;
    if (pararMapa && this.fase !== 'inactivo') this.m.stop();
    if (this.fase !== 'inactivo') this.setFase('inactivo');
  }
}
