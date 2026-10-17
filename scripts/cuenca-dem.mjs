// Elige con datos (no a ojo) los dos puntos del preset de cámara «Ver desde la cuenca» (src/vista3d/camara.ts):
//  - el curso del río Piura sale del mapa base local (Protomaps/OpenStreetMap, capa «water», name «Río Piura»);
//  - la altura de cada vértice sale del DEM local (Terrain Tiles z9, Terrarium) que usa la vista 3D.
// Criterios (documentados en config.ts CUENCA): «hacia» = mediana de los vértices del río por debajo de BAJO_M
// (llanura del Bajo Piura); «desde» = primer vértice río arriba, contado desde la ciudad de Piura, cuya cota
// supera DESDE_M (valle medio, aguas arriba). Solo lee archivos de public/basemap: no usa red.
// Uso: node scripts/cuenca-dem.mjs   → imprime JSON con puntos, cotas y el perfil resumido.
import fs from 'node:fs';
import { PMTiles } from 'pmtiles';
import { PNG } from 'pngjs';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader as Pbf } from 'pbf';
import { gunzipSync } from 'node:zlib';

const BASE = 'public/basemap/piura_basemap_z11.5e31b1dc.pmtiles';
const DEM = 'public/basemap/piura_dem_z9.00100654.pmtiles';
const Z_RIO = 11, Z_DEM = 9;
const BAJO_M = 25, DESDE_M = 60, VENTANA = 51;
const PIURA_CIUDAD = [-80.63, -5.19]; // solo para ordenar el río (referencia de orientación, no un dato que se muestre)

class Archivo {
  constructor(p) { this.fd = fs.openSync(p, 'r'); this.p = p; }
  getKey() { return this.p; }
  async getBytes(offset, length) {
    const b = Buffer.alloc(length);
    fs.readSync(this.fd, b, 0, length, offset);
    return { data: b.buffer.slice(b.byteOffset, b.byteOffset + length) };
  }
}
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; };

async function rio() {
  const pm = new PMTiles(new Archivo(BASE));
  const segs = [];
  const [x0, x1] = [Math.floor(lon2x(-80.95, Z_RIO)), Math.floor(lon2x(-79.6, Z_RIO))];
  const [y0, y1] = [Math.floor(lat2y(-4.75, Z_RIO)), Math.floor(lat2y(-5.95, Z_RIO))];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const t = await pm.getZxy(Z_RIO, x, y);
    if (!t) continue;
    let buf = Buffer.from(t.data);
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
    const vt = new VectorTile(new Pbf(buf));
    const capa = vt.layers.water;
    if (!capa) continue;
    for (let i = 0; i < capa.length; i++) {
      const f = capa.feature(i);
      const nombre = String(f.properties.name ?? f.properties['name:es'] ?? '');
      if (f.type !== 2 || !/^r[ií]o piura$/i.test(nombre.trim())) continue;
      const g = f.toGeoJSON(x, y, Z_RIO).geometry;
      const lineas = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      for (const l of lineas) segs.push(l);
    }
  }
  return segs;
}

const demCache = new Map();
async function cota(pm, lon, lat) {
  const fx = lon2x(lon, Z_DEM), fy = lat2y(lat, Z_DEM);
  const x = Math.floor(fx), y = Math.floor(fy), k = `${x}/${y}`;
  if (!demCache.has(k)) {
    const t = await pm.getZxy(Z_DEM, x, y);
    demCache.set(k, t ? PNG.sync.read(Buffer.from(t.data)) : null);
  }
  const png = demCache.get(k);
  if (!png) return null;
  const px = Math.min(255, Math.floor((fx - x) * 256)), py = Math.min(255, Math.floor((fy - y) * 256));
  const i = (py * png.width + px) * 4;
  return Math.round(png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768);
}

const segs = await rio();
const pts = [...new Map(segs.flat().map((p) => [p.map((v) => v.toFixed(4)).join(','), p])).values()];
if (!pts.length) { console.error('No se encontró «Río Piura» en el mapa base'); process.exit(1); }
const pmDem = new PMTiles(new Archivo(DEM));
const conCota = [];
for (const [lon, lat] of pts) conCota.push({ lon: +lon.toFixed(4), lat: +lat.toFixed(4), m: await cota(pmDem, lon, lat) });

// Tramo alto = al este de la ciudad: el río llega desde Morropón/Chulucanas/Tambogrande con la longitud siempre
// en aumento río arriba, así que ordenar por longitud es ordenar a lo largo del cauce. Bajo Piura = al sur de la ciudad.
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const bajo = conCota.filter((p) => p.m !== null && p.m <= BAJO_M && p.lat < PIURA_CIUDAD[1]).sort((a, b) => a.lat - b.lat);
const arriba = conCota.filter((p) => p.m !== null && p.lon > PIURA_CIUDAD[0] + 0.05).sort((a, b) => a.lon - b.lon);
// Cota suavizada (mediana móvil): el SRTM sobre el cauce tiene ruido de vegetación y orillas.
const suave = arriba.map((p, i) => ({ ...p, mSuave: med(arriba.slice(Math.max(0, i - (VENTANA >> 1)), i + (VENTANA >> 1) + 1).map((q) => q.m)) }));
const desde = suave.find((p) => p.mSuave >= DESDE_M);
const hacia = bajo[Math.floor(bajo.length / 2)] ?? null; // mediana por latitud del tramo bajo

const resumen = (xs, n = 14) => xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / n)) === 0).map((p) => `${p.lon},${p.lat}:${p.m}m`);
console.log(JSON.stringify({
  fuentes: { rio: BASE + ` z${Z_RIO} capa water name=Río Piura`, cota: DEM + ` z${Z_DEM} Terrarium` },
  criterios: { BAJO_M, DESDE_M, VENTANA },
  vertices: conCota.length,
  bajo: { n: bajo.length, latMin: bajo[0]?.lat, latMax: bajo.at(-1)?.lat, perfil: resumen(bajo) },
  arriba: { n: arriba.length, perfil: resumen(suave.map((p) => ({ ...p, m: p.m + '/' + p.mSuave })), 24) },
  desde, hacia,
}, null, 1));
