// Cámara cinematográfica (src/vista3d/camara.ts): plan del recorrido, rumbo de la órbita y cancelación del
// Recorrido con un MapaCamara doble (sin WebGL) y un reloj de cuadros manual.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Recorrido, planRecorrido, rumboOrbita, normalizarRumbo, duracionVuelo, distanciaKm, easeInOutCubic, type Fase, type MapaCamara, type Reloj } from '../src/vista3d/camara';
import { VISTA_REGIONAL } from '../src/vista3d/config';

describe('cámara: lógica pura', () => {
  it('normaliza rumbos a (-180, 180]', () => {
    expect(normalizarRumbo(190)).toBe(-170);
    expect(normalizarRumbo(-180)).toBe(180);
    expect(normalizarRumbo(720 + 35)).toBe(35);
  });
  it('easing sin saltos: 0→0, 0,5→0,5, 1→1 y monótono', () => {
    expect(easeInOutCubic(0)).toBe(0); expect(easeInOutCubic(0.5)).toBe(0.5); expect(easeInOutCubic(1)).toBe(1);
    for (let t = 0; t < 1; t += 0.05) expect(easeInOutCubic(t + 0.05)).toBeGreaterThanOrEqual(easeInOutCubic(t));
  });
  it('duración del acercamiento acotada entre 3,2 s y 7 s según la distancia', () => {
    expect(duracionVuelo(0)).toBe(3200);
    expect(duracionVuelo(10_000)).toBe(7000);
    const km = distanciaKm(VISTA_REGIONAL.center, [-79.45, -4.64]); // Ayabaca aprox.
    expect(km).toBeGreaterThan(50); expect(km).toBeLessThan(120);
  });
  it('plan: regional oblicuo con horizonte → acercamiento con giro de 35° y pitch ≥ 60', () => {
    const p = planRecorrido([-79.7, -4.9]);
    expect(p.regional.pitch).toBeGreaterThanOrEqual(65); expect(p.regional.pitch).toBeLessThanOrEqual(80);
    expect(p.acercamiento.center).toEqual([-79.7, -4.9]);
    expect(p.acercamiento.pitch).toBeGreaterThanOrEqual(60);
    expect(normalizarRumbo(p.acercamiento.bearing - p.regional.bearing)).toBe(35);
    expect(p.acercamiento.zoom).toBeGreaterThan(p.regional.zoom);
  });
  it('órbita con rampa: arranca sin tirón y luego gira a velocidad constante', () => {
    const v = (t: number) => (rumboOrbita(t + 0.01, 0, 5, 2) - rumboOrbita(t, 0, 5, 2)) / 0.01;
    expect(v(0)).toBeLessThan(0.1);
    expect(v(1)).toBeCloseTo(2.5, 1);
    expect(v(5)).toBeCloseTo(5, 1);
    expect(rumboOrbita(2, 0, 5, 2)).toBeCloseTo(5, 5); // continuidad al final de la rampa
  });
});

/** Doble del mapa: registra vuelos y deja disparar moveend a mano. */
function mapaDoble() {
  const vuelos: any[] = []; let fin: (() => void) | null = null; let rumbo = 0; let paradas = 0;
  const m: MapaCamara = {
    flyTo: (o) => { vuelos.push(o); rumbo = o.bearing; },
    once: (_e, cb) => { fin = cb; },
    jumpTo: (o) => { rumbo = o.bearing; },
    getBearing: () => rumbo,
    getCenter: () => ({ lng: -80, lat: -5 }),
    stop: () => { paradas++; const f = fin; fin = null; f?.(); },
  };
  return { m, vuelos, llegar: () => { const f = fin; fin = null; f?.(); }, rumbo: () => rumbo, paradas: () => paradas };
}
function relojDoble() {
  let t = 0; const cola = new Map<number, (t: number) => void>(); let id = 0;
  const r: Reloj = { raf: (cb) => { cola.set(++id, cb); return id; }, caf: (i) => cola.delete(i), ahora: () => t };
  return { r, avanzar(ms: number) { t += ms; const cbs = [...cola.values()]; cola.clear(); cbs.forEach((cb) => cb(t)); }, pendientes: () => cola.size };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('cámara: recorrido cancelable', () => {
  it('regional → acercamiento → órbita, en ese orden', async () => {
    const d = mapaDoble(), c = relojDoble();
    const rec = new Recorrido(d.m, c.r, () => false);
    const fases: Fase[] = []; rec.onFase = (f) => fases.push(f);
    const p = rec.iniciar([-79.7, -4.9]);
    expect(d.vuelos[0].pitch).toBe(VISTA_REGIONAL.pitch);
    d.llegar(); await tick();
    expect(d.vuelos[1].center).toEqual([-79.7, -4.9]);
    d.llegar();
    expect(await p).toBe(true);
    expect(fases).toEqual(['regional', 'acercamiento', 'orbita']);
    const b0 = d.rumbo(); c.avanzar(5000); c.avanzar(1000);
    expect(normalizarRumbo(d.rumbo() - b0)).toBeGreaterThan(10);
  });
  it('un gesto del usuario (detener) corta el vuelo y la órbita, y para el mapa', async () => {
    const d = mapaDoble(), c = relojDoble();
    const rec = new Recorrido(d.m, c.r, () => false);
    const p = rec.iniciar([-79.7, -4.9]);
    const paradasAntes = d.paradas();
    rec.detener();
    expect(await p).toBe(false);
    expect(d.paradas()).toBeGreaterThan(paradasAntes);
    expect(rec.fase).toBe('inactivo');
    expect(d.vuelos).toHaveLength(1); // no siguió al acercamiento
    // órbita cancelada: no quedan cuadros pendientes
    rec.orbitar(); expect(c.pendientes()).toBe(1);
    rec.detener(); c.avanzar(16); expect(c.pendientes()).toBe(0);
  });
  it('movimiento reducido: vuelos instantáneos y sin órbita', async () => {
    const d = mapaDoble(), c = relojDoble();
    const rec = new Recorrido(d.m, c.r, () => true);
    const p = rec.iniciar([-79.7, -4.9], { saltarRegional: true });
    expect(d.vuelos[0].duration).toBe(0);
    d.llegar();
    expect(await p).toBe(true);
    expect(rec.fase).toBe('inactivo'); expect(c.pendientes()).toBe(0);
  });
});

describe('cámara: más casos de cancelación', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('detener durante el acercamiento: resuelve false, no orbita y no deja cuadros', async () => {
    const d = mapaDoble(), c = relojDoble();
    const rec = new Recorrido(d.m, c.r, () => false);
    const p = rec.iniciar([-79.7, -4.9]);
    d.llegar(); await tick();
    expect(rec.fase).toBe('acercamiento');
    rec.detener();
    expect(await p).toBe(false);
    expect(rec.fase).toBe('inactivo');
    expect(c.pendientes()).toBe(0);
  });

  it('un recorrido nuevo cancela el anterior (elegir otro centro poblado a mitad de vuelo)', async () => {
    const d = mapaDoble(), c = relojDoble();
    const rec = new Recorrido(d.m, c.r, () => false);
    const p1 = rec.iniciar([-79.7, -4.9]);
    const p2 = rec.iniciar([-80.3, -5.2], { saltarRegional: true });
    expect(await p1).toBe(false);
    expect(d.vuelos.at(-1).center).toEqual([-80.3, -5.2]);
    d.llegar();
    expect(await p2).toBe(true);
    expect(rec.fase).toBe('orbita');
  });

  it('la órbita queda quieta tras el gesto del usuario', async () => {
    const d = mapaDoble(), c = relojDoble();
    const rec = new Recorrido(d.m, c.r, () => false);
    rec.orbitar(5, 2);
    c.avanzar(3000);
    const b = d.rumbo();
    rec.detener();
    c.avanzar(3000);
    expect(d.rumbo()).toBe(b);
    expect(rec.fase).toBe('inactivo');
  });

  it('saltarRegional parte del centro y rumbo actuales (giro de 35° desde ahí)', async () => {
    const d = mapaDoble(), c = relojDoble();
    d.m.jumpTo({ bearing: 170 });
    const rec = new Recorrido(d.m, c.r, () => false);
    void rec.iniciar([-79.7, -4.9], { saltarRegional: true });
    expect(d.vuelos).toHaveLength(1);
    expect(d.vuelos[0].bearing).toBe(normalizarRumbo(170 + 35));
    rec.detener();
  });

  it('si moveend nunca llega, la red de seguridad resuelve el vuelo igual', async () => {
    vi.useFakeTimers();
    const vuelos: any[] = [];
    const m: MapaCamara = { flyTo: (o) => { vuelos.push(o); }, once: () => {}, jumpTo: () => {}, getBearing: () => 0, getCenter: () => ({ lng: -80, lat: -5 }), stop: () => {} };
    const rec = new Recorrido(m, relojDoble().r, () => false);
    const p = rec.vistaRegional();
    await vi.advanceTimersByTimeAsync(planRecorrido(VISTA_REGIONAL.center).regional.duration + 1600);
    expect(await p).toBe(true);
    expect(rec.fase).toBe('inactivo');
  });

  it('planRecorrido: duración del acercamiento crece con la distancia', () => {
    const cerca = planRecorrido([-80.06, -5.06]).acercamiento.duration;
    const lejos = planRecorrido([-79.45, -4.64]).acercamiento.duration;
    expect(lejos).toBeGreaterThan(cerca);
  });

  it('rumboOrbita: t ≤ 0 devuelve el rumbo inicial normalizado y nunca sale de (-180, 180]', () => {
    expect(rumboOrbita(-1, 370, 5, 2)).toBe(10);
    for (let t = 0; t < 200; t += 7.3) { const b = rumboOrbita(t, 175, 5, 2); expect(b).toBeGreaterThan(-180); expect(b).toBeLessThanOrEqual(180); }
  });
});
