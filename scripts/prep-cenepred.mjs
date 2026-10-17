// Prepara la capa «Escenario de riesgo CENEPRED/SIGRID 23077 (Aviso 421)» para la PWA (offline, precache):
//   public/data/cenepred-ccpp.geojson     930 centros poblados ubicados (IGN) + cobertura OSIPTEL
//   public/data/cenepred-sin-ubicar.json  325 filas del Excel con COD_IGN vacío (sin coordenadas en el dataset IGN)
// Entradas: ../data/piura_cenepred_421.geojson, ../data/cenepred_421_piura/aviso421_piura_centros_poblados_INUND_georef.csv,
//           ../data/conectividad/cruce_cobertura_930_ccpp.csv (OSIPTEL, ODC-By).
import fs from 'node:fs';
const D = '../data';
function csv(file) {
  const t = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...rest] = rows.filter((r) => r.length > 1);
  return rest.map((r) => Object.fromEntries(h.map((k, i) => [k.trim(), r[i] ?? ''])));
}
const NIV = { 'Muy Alto': 5, Alto: 4, Medio: 3, Bajo: 2, 'Muy Bajo': 1 };
const gj = JSON.parse(fs.readFileSync(`${D}/piura_cenepred_421.geojson`, 'utf8'));
const cob = new Map(csv(`${D}/conectividad/cruce_cobertura_930_ccpp.csv`).map((r) => [r.codigo_ccpp, r]));
const pts = gj.features.filter((f) => f.geometry.type === 'Point' && f.properties.capa === 'centros_poblados_exposicion_inundaciones');
let noOsiptel = 0;
const features = pts.map((f) => {
  const p = f.properties, c = cob.get(p.codigo_ccpp);
  const inO = c && c.en_osiptel === 'True';
  if (!inO) noOsiptel++;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: f.geometry.coordinates.map((v) => +v.toFixed(5)) },
    properties: {
      cod: p.codigo_ccpp, n: p.nombre_ccpp, d: p.distrito, pr: p.provincia, pob: p.poblacion_excel, niv: p.nivel_texto, r: NIV[p.nivel_texto],
      // cobertura garantizada (CG) declarada por operadoras; null = el CCPP no figura en el CSV de OSIPTEL
      cg: inO ? +c.maxAny_CG > 0 : null, g4: inO ? +c.max4G_CG > 0 : null,
    },
  };
});
const rows = csv(`${D}/cenepred_421_piura/aviso421_piura_centros_poblados_INUND_georef.csv`);
const sinUbicar = rows.filter((r) => !r.COD_IGN.trim()).map((r) => ({ n: r['Nombre delcentro poblado'], d: r.Distrito, pr: r.Provincia, pob: +r['Población'], niv: r['Nivel de exposición a inundaciones'], r: NIV[r['Nivel de exposición a inundaciones']] }))
  .sort((a, b) => b.r - a.r || b.pob - a.pob || a.n.localeCompare(b.n, 'es'));
const meta = { total: rows.length, ubicados: features.length, sinUbicar: sinUbicar.length, conDatoOsiptel: features.filter((f) => f.properties.cg !== null).length, sinCoberturaGarantizada: features.filter((f) => f.properties.cg === false).length, sinDatoOsiptel: noOsiptel };
if (meta.ubicados + meta.sinUbicar !== meta.total) throw new Error('conteos no cuadran ' + JSON.stringify(meta));
fs.writeFileSync('public/data/cenepred-ccpp.geojson', JSON.stringify({ type: 'FeatureCollection', features }));
fs.writeFileSync('public/data/cenepred-sin-ubicar.json', JSON.stringify({ ...meta, filas: sinUbicar }));
const byNiv = (arr, get) => Object.fromEntries(Object.keys(NIV).map((k) => [k, arr.filter((x) => get(x) === k).length]));
const out = { ...meta, ubicadosPorNivel: byNiv(features, (f) => f.properties.niv), sinUbicarPorNivel: byNiv(sinUbicar, (x) => x.niv),
  bytes: { geojson: fs.statSync('public/data/cenepred-ccpp.geojson').size, sinUbicar: fs.statSync('public/data/cenepred-sin-ubicar.json').size } };
fs.writeFileSync('results/data-prep-cenepred.json', JSON.stringify(out, null, 2));
console.log(out);
