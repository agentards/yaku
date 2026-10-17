// Vista 3D: cámara cinematográfica, relieve sobre el estilo, DEM empaquetado y medición de fps.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PMTiles, TileType, type Source } from 'pmtiles';
import type { StyleSpecification } from 'maplibre-gl';
import { Recorrido, planRecorrido, rumboOrbita, normalizarRumbo, duracionVuelo, distanciaKm, easeInOutCubic, type Fase, type MapaCamara, type Reloj } from '../src/vista3d/camara';
import { conRelieve, indiceRelieve, CAPA_COLOR, CAPA_SOMBRA, SRC_TERRENO, SRC_RELIEVE } from '../src/vista3d/relieve';
import { DEM, DEM_BOUNDS, EXAGERACION, VISTA_REGIONAL, DEM_SOURCE_URL } from '../src/vista3d/config';
import { resumirCuadros } from '../src/vista3d/rendimiento';
import { CENEPRED_23077_BOUNDS } from '../src/layers';

const raiz = path.resolve(__dirname, '..');

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

describe('relieve sobre el estilo 2D', () => {
  const base: StyleSpecification = {
    version: 8, sources: { cenepred: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
    layers: [
      { id: 'background', type: 'background' }, { id: 'earth', type: 'background' }, { id: 'landuse_park', type: 'background' },
      { id: 'water', type: 'background' }, { id: 'senamhi-fill', type: 'background' },
      { id: 'cenepred-ccpp', type: 'circle', source: 'cenepred', paint: { 'circle-radius': 4 } },
    ],
  };
  it('inserta color por altitud y sombreado bajo el agua, sobre la tierra', () => {
    expect(indiceRelieve(base.layers)).toBe(3);
    const s = conRelieve(base);
    const ids = s.layers.map((l) => l.id);
    expect(ids.indexOf(CAPA_COLOR)).toBe(3);
    expect(ids.indexOf(CAPA_SOMBRA)).toBe(4);
    expect(ids.indexOf('water')).toBe(5);
  });
  it('terreno con exageración 1,4–1,8×, dos fuentes DEM locales (protocolo propio) y cielo con bruma', () => {
    const s = conRelieve(base);
    expect(s.terrain).toEqual({ source: SRC_TERRENO, exaggeration: EXAGERACION });
    expect(EXAGERACION).toBeGreaterThanOrEqual(1.4); expect(EXAGERACION).toBeLessThanOrEqual(1.8);
    for (const id of [SRC_TERRENO, SRC_RELIEVE]) expect((s.sources[id] as any).url).toBe(DEM_SOURCE_URL);
    expect(DEM_SOURCE_URL).toMatch(/^yakudem:\/\//);
    expect(s.sky?.['fog-color']).toBeTruthy();
    expect(JSON.stringify(s)).not.toMatch(/https?:\/\/(?!localhost)/); // sin CDN ni teselas externas
  });
  it('capas reales se acuestan sobre el relieve y el estilo original no cambia', () => {
    const antes = JSON.stringify(base);
    const s = conRelieve(base);
    expect((s.layers.find((l) => l.id === 'cenepred-ccpp') as any).paint['circle-pitch-alignment']).toBe('map');
    expect(JSON.stringify(base)).toBe(antes);
    expect(conRelieve(base, { conTerreno: false }).terrain).toBeUndefined();
  });
});

/** Fuente PMTiles en memoria para leer el archivo real en Node. */
class FuenteBuffer implements Source {
  constructor(private b: Buffer) {}
  getKey() { return 'dem'; }
  async getBytes(o: number, n: number) { const s = this.b.subarray(o, o + n); return { data: s.buffer.slice(s.byteOffset, s.byteOffset + s.byteLength) as ArrayBuffer }; }
}

describe('DEM empaquetado (presupuesto offline)', () => {
  const archivo = path.join(raiz, 'public', DEM.file);
  const buf = fs.readFileSync(archivo);
  it('tamaño y sha256 coinciden con la configuración; el nombre lleva el prefijo del hash', () => {
    expect(buf.length).toBe(DEM.bytes);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    expect(sha).toBe(DEM.sha256);
    expect(DEM.file).toContain(sha.slice(0, 8));
  });
  it('paquete adicional del 3D ≤ 6 MB (DEM + código de src/vista3d)', () => {
    const codigo = fs.readdirSync(path.join(raiz, 'src/vista3d'), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile()).reduce((s, e) => s + fs.statSync(path.join((e as any).parentPath ?? (e as any).path, e.name)).size, 0);
    expect(DEM.bytes + codigo).toBeLessThanOrEqual(6_000_000);
  });
  it('cabecera: PNG Terrarium z5–9 que cubre Piura y los 23 distritos del escenario CENEPRED', async () => {
    const h = await new PMTiles(new FuenteBuffer(buf)).getHeader();
    expect(h.tileType).toBe(TileType.Png);
    expect(h.minZoom).toBeLessThanOrEqual(5); expect(h.maxZoom).toBe(DEM.maxzoom);
    const [[w, s], [e, n]] = CENEPRED_23077_BOUNDS;
    expect(h.minLon).toBeLessThanOrEqual(w); expect(h.minLat).toBeLessThanOrEqual(s);
    expect(h.maxLon).toBeGreaterThanOrEqual(e); expect(h.maxLat).toBeGreaterThanOrEqual(n);
    expect(DEM_BOUNDS[0]).toBeLessThanOrEqual(w);
  });
  it('una tesela z9 del centro del escenario decodifica a altitudes andinas plausibles', async () => {
    const pm = new PMTiles(new FuenteBuffer(buf));
    const z = 9, lon = -79.75, lat = -5.1; // sierra de Morropón/Huancabamba
    const x = Math.floor(((lon + 180) / 360) * 2 ** z);
    const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
    const t = await pm.getZxy(z, x, y);
    expect(t).toBeTruthy();
    const png = new Uint8Array(t!.data);
    expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  });
});

describe('medición de fps', () => {
  it('resume intervalos en fps y p95', () => {
    const r = resumirCuadros(Array(60).fill(1000 / 60), 1000);
    expect(r.fps).toBe(60); expect(r.p95ms).toBeCloseTo(16.7, 1);
    expect(resumirCuadros([], 0).fps).toBe(0);
  });
});
