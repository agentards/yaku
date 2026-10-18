// Prepara capas oficiales reales (EPSG:4326) para el mapa offline: filtra campos,
// repara/simplifica geometrías con mapshaper y mide tamaños. Uso: npm run prep:data
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const SRC = process.env.DATA_DIR || 'data/raw';
const OUT = 'public/data';
const TMP = '/tmp/yaku-prep';
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const ms = (...a) => execFileSync('npx', ['mapshaper', ...a], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

// 1) piura_minimo → límite + avisos SENAMHI (props mínimas)
const pm = JSON.parse(fs.readFileSync(`${SRC}/piura_minimo.geojson`, 'utf8'));
const lim = pm.features.filter((f) => f.properties.capa === 'limite_departamental').map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { nombre: f.properties.nombre } }));
const sen = pm.features.filter((f) => f.properties.capa === 'senamhi_aviso_activacion_quebradas_24h').map((f) => {
  const [prov, dist] = String(f.properties.nombre).split('/');
  return { type: 'Feature', geometry: f.geometry, properties: { nivel: +String(f.properties.riesgo_valor_original).replace(/\D/g, ''), prov, dist, fecha: '2026-10-15' } };
});
fs.writeFileSync(`${TMP}/lim.json`, JSON.stringify({ type: 'FeatureCollection', features: lim }));
fs.writeFileSync(`${TMP}/sen.json`, JSON.stringify({ type: 'FeatureCollection', features: sen }));

// 2) SIGRID áreas expuestas a erosión (Piura)
const er = JSON.parse(fs.readFileSync(`${SRC}/raw/cenepred/geosinpad_SIGRID_Areas_Exposicion_Erosion_PIURA.geojson`, 'utf8'));
const erF = er.features.map((f) => {
  const p = f.properties;
  const y = String(p.FECHA_DOC || '').slice(0, 4).trim();
  return { type: 'Feature', geometry: f.geometry, properties: { peligro: p.PELIGRO_ES, lugar: p.NOM_LUGAR, dist: p.NOM_DIST, prov: p.NOM_PROV, anio: /^\d{4}$/.test(y) ? +y : null, ficha: /^https:\/\/sigrid\.cenepred\.gob\.pe\//.test(p.URL) ? p.URL : null } };
});
fs.writeFileSync(`${TMP}/ero.json`, JSON.stringify({ type: 'FeatureCollection', features: erF }));

ms(`${TMP}/lim.json`, '-simplify', 'dp', '4%', 'keep-shapes', '-o', `${OUT}/piura-limite.geojson`, 'precision=0.0001', 'format=geojson');
ms(`${TMP}/sen.json`, '-clean', '-simplify', 'dp', '8%', 'keep-shapes', '-o', `${OUT}/senamhi-quebradas.geojson`, 'precision=0.0001', 'format=geojson');
ms(`${TMP}/ero.json`, '-clean', '-simplify', 'dp', 'interval=3', 'keep-shapes', '-o', `${OUT}/sigrid-erosion.geojson`, 'precision=0.00001', 'format=geojson');
ms(`${OUT}/sigrid-erosion.geojson`, '-points', 'inner', '-o', `${OUT}/sigrid-erosion-pts.geojson`, 'precision=0.00001', 'format=geojson');

const size = (f) => fs.statSync(f).size;
const report = {
  fecha: new Date().toISOString(),
  original: { piura_minimo: size(`${SRC}/piura_minimo.geojson`), sigrid_erosion: size(`${SRC}/raw/cenepred/geosinpad_SIGRID_Areas_Exposicion_Erosion_PIURA.geojson`) },
  salida: Object.fromEntries(fs.readdirSync(OUT).filter((f) => f.endsWith('.geojson')).map((f) => {
    const j = JSON.parse(fs.readFileSync(`${OUT}/${f}`, 'utf8'));
    return [f, { bytes: size(`${OUT}/${f}`), features: j.features.length }];
  })),
  conteos: { senamhi_nivel2: sen.filter((f) => f.properties.nivel === 2).length, senamhi_nivel3: sen.filter((f) => f.properties.nivel === 3).length, erosion: erF.length },
};
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/data-prep.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
