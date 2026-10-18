import './style.css';
import QRCode from 'qrcode';
import { registerSW } from 'virtual:pwa-register';
import {
  OBS_TYPES, OBS_LABELS, makeObservation, encodeForQR, encodeLinkHash, decodeLinkHash,
  Reassembler, DEFAULT_CHUNK, type ObsType, type Observation,
} from './codec';
import { all, putIfAbsent, clearAll, type Source, type StoredObs } from './db';
import { flushQueue, serverStats, MOCK_ENDPOINT, DEFAULT_ENDPOINT } from './sync';
import { listCameras, startCamera, scanLoop, decodeImageFile, type ScanStats } from './scanner';
import { OFFICIAL_LAYERS, forecastStatus } from './layers';
import { initMap, setVisible, setCenepredSinCobertura, setCitizen, placeDraft, draftPos, centerOf, getMap, mapLoaded, startBasemapOffline, basemapInfo, BASEMAP, type BasemapStatus } from './map';
import { fmtMB } from './basemap';
import { montarVista3D } from './vista3d/conmutador';
import { FEAT, PHASE } from './features';
import { entornoActual, prepararVistaPoblador } from './poblador/ruta';
import { decidirRuta, redireccionRuta } from './rutas';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

registerSW({ immediate: true });
history.scrollRestoration = 'manual';
// Enlace viejo /?vista=… abierto sin red (el service worker sirve app.html): se pasa a la ruta nueva sin recargar.
const rutaNueva = redireccionRuta(location.pathname, location.search, location.hash);
if (rutaNueva) history.replaceState(null, '', rutaNueva);
const ruta = decidirRuta(location.pathname, location.search, entornoActual()); // /reportar, /municipalidad, /app o ?vista= (src/rutas.ts)
if (ruta.vista === 'poblador') { prepararVistaPoblador(); import('./poblador/app').then((m) => m.arrancar()); } // modo poblador (celular por defecto)

function deviceId(): string {
  let d = localStorage.getItem('yaku-device');
  if (!d) {
    const a = new Uint8Array(6); crypto.getRandomValues(a);
    d = [...a].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 8);
    localStorage.setItem('yaku-device', d);
  }
  return d;
}

// ---------- pestañas ----------
type Tab = 'mapa' | 'registrar' | 'relevo' | 'sync';
function showTab(t: Tab) {
  document.body.dataset.tab = t;
  document.querySelectorAll<HTMLButtonElement>('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== t));
  requestAnimationFrame(() => getMap()?.resize());
  if (t === 'registrar') startLocate(false);
  if (t === 'sync') refreshStats();
}
document.querySelectorAll<HTMLButtonElement>('[role=tab]').forEach((b) => (b.onclick = () => showTab(b.dataset.tab as Tab)));

// ---------- red ----------
function renderNet() {
  const n = $('net');
  n.textContent = navigator.onLine ? 'EN LÍNEA' : 'SIN RED';
  n.className = 'pill net ' + (navigator.onLine ? 'on' : 'off');
  document.body.classList.toggle('offline', !navigator.onLine);
}
addEventListener('online', () => { renderNet(); doSync('conexión recuperada'); });
addEventListener('offline', renderNet);
renderNet();

// ---------- mapa + leyenda ----------
initMap($('map'));
montarVista3D(getMap()!); // conmutador 2D|3D (aditivo: 2D por defecto, ?vista=3d entra al relieve)
// Centro de monitoreo: primero el acceso con PIN municipal (src/auth/), luego la interfaz unificada (src/vista3d/monitoreo/).
// portal | municipalidad | incidentes son alias de la misma pantalla; «incidentes» y «municipalidad» abren la pestaña Incidentes.
if (ruta.vista === 'monitoreo') import('./auth/sesion').then((a) => a.exigirSesion(document.body)).then(async (sesion) => {
  (await import('./vista3d/entrada-portal')).arrancarMonitoreo(sesion, { pestana: ruta.pestana === 'portal' ? 'escenario' : 'incidentes' });
});
// Portal de relevo de campo anterior (fichas de IndexedDB de este equipo y demo SIMULADO): público, como la vista 2D.
if (new URLSearchParams(location.search).get('vista') === 'portal-relevo') import('./vista3d/entrada-portal').then((m) => m.arrancar());
const legend = $('legend');
for (const l of OFFICIAL_LAYERS) {
  const li = document.createElement('li');
  li.className = 'legend-item official-layer';
  li.dataset.layer = l.id;
  const sw = l.id === 'senamhi'
    ? '<span class="sw-stack"><span class="sw sw-n3"></span><span class="sw sw-n2"></span></span>'
    : `<span class="sw sw-${l.id}" aria-hidden="true"></span>`;
  const fs = l.emision && l.vigenciaH ? forecastStatus(l.emision, l.vigenciaH) : null;
  if (fs) li.dataset.vencido = String(fs.vencido);
  li.innerHTML = `<label class="layer-toggle"><input type="checkbox" data-layer="${l.id}" checked />${sw}
    <span>${fs ? `<b class="forecast-status ${fs.vencido ? 'expired' : 'valid'}">${esc(fs.etiqueta)}</b><br>` : ''}<b>${esc(l.titulo)}</b><br>
    <span class="badge-source">${esc(l.tipo)} · ${esc(l.fuente)}</span><br>
    <small>${esc(l.fecha)}. ${esc(l.nota)}</small>
    ${l.id === 'senamhi' ? '<br><small class="keys"><span class="k k3"></span>Nivel 3 <span class="k k2"></span>Nivel 2</small>' : ''}</span></label>`;
  if (l.id === 'cenepred') li.insertAdjacentHTML('beforeend', `
    ${FEAT.osiptel ? `<label class="layer-toggle sub"><input type="checkbox" id="cenepred-sincob" /> <span>Solo sin cobertura garantizada según OSIPTEL <small id="cenepred-sincob-n">(445 de 928 centros poblados del escenario CENEPRED con dato OSIPTEL; cobertura declarada por operadoras. 2 van como «sin dato OSIPTEL» y no entran en el filtro)</small></span></label>` : ''}
    <details class="fold" id="cenepred-sin-ubicar"><summary>Sin ubicar (…)</summary>
      <p><small>Filas del Excel de CENEPRED sin coordenadas en el dataset de Centros Poblados del IGN: no se pueden dibujar.</small></p>
      <div class="table-wrap"><table><thead><tr><th>Centro poblado</th><th>Distrito</th><th>Población</th><th>Nivel</th></tr></thead><tbody></tbody></table></div>
    </details>
    ${FEAT.osiptel ? '<small class="osiptel-attrib">Cobertura móvil: OSIPTEL, «Porcentaje de cobertura móvil por centro poblado, empresa operadora y tecnología» (datosabiertos.gob.pe, ODC-By), información 2025-IV.</small>' : ''}`);
  legend.append(li);
}
if (FEAT.osiptel) $<HTMLInputElement>('cenepred-sincob').onchange = (e) => setCenepredSinCobertura((e.target as HTMLInputElement).checked);
// Lista «Sin ubicar»: JSON precacheado por el service worker (funciona sin red)
if (FEAT.cenepred) fetch('data/cenepred-sin-ubicar.json').then((r) => r.json()).then((j: { sinUbicar: number; filas: { n: string; d: string; pob: number; niv: string }[] }) => {
  const det = $('cenepred-sin-ubicar');
  det.querySelector('summary')!.textContent = `Sin ubicar (${j.sinUbicar})`;
  det.querySelector('tbody')!.innerHTML = j.filas.map((f) => `<tr><td>${esc(f.n)}</td><td>${esc(f.d)}</td><td>${esc(f.pob)}</td><td>${esc(f.niv)}</td></tr>`).join('');
  det.dataset.rows = String(j.filas.length);
}).catch(() => { $('cenepred-sin-ubicar').querySelector('summary')!.textContent = 'Sin ubicar (lista no disponible)'; });
// ---------- mapa base: estado de guardado sin red ----------
function renderBasemap(s: BasemapStatus) {
  const txt = s.state === 'saved' ? `Mapa base guardado sin red · ${fmtMB(s.total)}`
    : s.state === 'downloading' ? `Guardando mapa base para usar sin red… ${Math.floor((100 * (s.loaded ?? 0)) / s.total)} % (${fmtMB(s.loaded ?? 0)} de ${fmtMB(s.total)})`
    : s.state === 'checking' ? 'Mapa base: comprobando copia sin red…'
    : s.state === 'offline-missing' ? 'Mapa base aún no guardado: se guardará al volver la conexión'
    : s.state === 'unsupported' ? 'Este navegador no permite guardar el mapa base sin red'
    : `No se pudo guardar el mapa base (${s.msg ?? 'error'}); se reintentará`;
  for (const id of ['basemap-pill', 'basemap-status']) {
    const el = $(id);
    el.textContent = txt; el.dataset.state = s.state;
    el.style.setProperty('--pct', s.state === 'saved' ? '100%' : `${Math.floor((100 * (s.loaded ?? 0)) / s.total)}%`);
  }
  $('basemap-pill').hidden = false;
}
startBasemapOffline(renderBasemap);
$('basemap-detail').textContent = `Detalle hasta zoom ${BASEMAP.maxzoom} · ${fmtMB(BASEMAP.bytes)} · ${BASEMAP.build}.`;
document.querySelectorAll<HTMLInputElement>('input[data-layer]').forEach((cb) => (cb.onchange = () => setVisible(cb.dataset.layer!, cb.checked)));

// ---------- ubicación (GPS automático + marcador arrastrable + manual) ----------
type LocSrc = 'gps' | 'ajustada' | 'manual' | 'centro';
let loc: { lat: number; lon: number; src: LocSrc; acc?: number; at: number } | null = null;
let locating: Promise<void> | null = null;
const latI = $<HTMLInputElement>('f-lat'), lonI = $<HTMLInputElement>('f-lon');
function setLoc(lat: number, lon: number, src: LocSrc, acc?: number, fly = true) {
  loc = { lat, lon, src, acc, at: Date.now() };
  latI.value = lat.toFixed(5); lonI.value = lon.toFixed(5);
  placeDraft(lat, lon, (la, lo) => setLoc(la, lo, 'ajustada', undefined, false), fly);
  const txt: Record<LocSrc, string> = {
    gps: `GPS ±${Math.round(acc ?? 0)} m`, ajustada: 'ajustada en el mapa', manual: 'coordenadas manuales', centro: 'centro del mapa (sin GPS) — ajuste el marcador',
  };
  $('loc-status').textContent = `${txt[src]} · ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  $('loc').dataset.src = src;
}
function startLocate(force: boolean, timeout = 12000): Promise<void> {
  if (locating) return locating;
  if (!force && loc && (loc.src !== 'gps' || Date.now() - loc.at < 120000)) return Promise.resolve();
  if (!('geolocation' in navigator)) { $('loc-status').textContent = 'GPS no disponible: arrastre el marcador o use coordenadas manuales.'; return Promise.resolve(); }
  $('loc-status').textContent = 'obteniendo GPS…';
  locating = new Promise<void>((res) => {
    navigator.geolocation.getCurrentPosition(
      (p) => { if (!loc || loc.src === 'gps' || loc.src === 'centro' || force) setLoc(p.coords.latitude, p.coords.longitude, 'gps', p.coords.accuracy); res(); },
      (e) => {
        if (!loc) { const c = centerOf(); setLoc(c.lat, c.lon, 'centro', undefined, false); }
        $('loc-status').textContent = `GPS no disponible (${e.code === 1 ? 'permiso denegado' : e.code === 3 ? 'tiempo agotado' : 'sin posición'}). ` + $('loc-status').textContent;
        res();
      },
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
  }).finally(() => { locating = null; });
  return locating;
}
$('gps').onclick = () => startLocate(true);
const onManual = () => { if (latI.value && lonI.value) setLoc(+latI.value, +lonI.value, 'manual'); };
latI.onchange = onManual; lonI.onchange = onManual;

// ---------- formulario ----------
const typeBox = $('f-type');
OBS_TYPES.forEach((t, i) => {
  const l = document.createElement('label');
  l.innerHTML = `<input type="radio" name="type" value="${t}" ${i === 0 ? 'checked' : ''} /><span>${esc(OBS_LABELS[t])}</span>`;
  l.dataset.type = t;
  typeBox.append(l);
});
$<HTMLFormElement>('form').onsubmit = async (ev) => {
  ev.preventDefault();
  const st = $('save-status');
  // GPS automático al guardar si no hay un punto elegido por el usuario
  if (!loc || (loc.src === 'gps' && Date.now() - loc.at > 120000) || loc.src === 'centro') { st.textContent = 'Tomando GPS…'; await startLocate(true, 8000); }
  const p = loc ?? (() => { const d = draftPos(); return d ? { lat: d.lat, lon: d.lng } : centerOf(); })();
  const o = makeObservation({
    type: (document.querySelector<HTMLInputElement>('input[name=type]:checked')!.value) as ObsType,
    severity: +document.querySelector<HTMLInputElement>('input[name=sev]:checked')!.value as 1 | 2 | 3,
    lat: p.lat, lon: p.lon,
    note: $<HTMLInputElement>('f-note').value,
    ts: Date.now() / 1000,
    deviceId: deviceId(),
  });
  const r = await putIfAbsent([o], 'local');
  st.textContent = r.added ? `Guardado · en relevo · ${o.lat.toFixed(5)}, ${o.lon.toFixed(5)}` : 'Ya existía un registro idéntico.';
  st.className = 'hint flash';
  $<HTMLInputElement>('f-note').value = '';
  await renderList();
  doSync('nuevo registro');
};

// ---------- lista ----------
const selected = new Set<string>();
let cache: StoredObs[] = [];
const SOURCE_LABEL: Record<Source, string> = { local: 'creado aquí', qr: 'recibido por QR', enlace: 'recibido por enlace', imagen: 'recibido por imagen' };
const stateLabel = (r: StoredObs) => (r.synced ? 'consolidado' : 'en relevo');
let prevSynced = new Set<string>();
let listInit = false;

async function renderList() {
  cache = await all();
  const pend = cache.filter((r) => !r.synced).length;
  $('count').textContent = String(cache.length);
  $('pending-count').textContent = String(pend);
  $('pending-pill').classList.toggle('zero', pend === 0);
  $('c-relay').textContent = String(pend);
  $('c-done').textContent = String(cache.length - pend);
  const ul = $('list');
  ul.innerHTML = '';
  const allOn = $<HTMLInputElement>('sel-all').checked;
  for (const r of cache) {
    const li = document.createElement('li');
    li.className = 'citizen';
    li.dataset.id = r.id;
    const justDone = r.synced && listInit && !prevSynced.has(r.id);
    if (allOn) selected.add(r.id);
    li.innerHTML = `
      <label class="pick"><input type="checkbox" ${selected.has(r.id) ? 'checked' : ''} aria-label="Seleccionar para relevo" /></label>
      <div class="body">
        <div class="tags"><span class="badge-unverified">NO VERIFICADO</span><span class="sync ${r.synced ? 'ok' : 'pend'}${justDone ? ' just' : ''}">${stateLabel(r)}</span></div>
        <div class="title"><strong></strong> <span class="sev sev${r.severity}">sev ${r.severity}</span></div>
        <div class="note"></div>
        <small class="meta">Reporte ciudadano · ${new Date(r.ts * 1000).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })} · ${SOURCE_LABEL[r.source]}</small>
      </div>`;
    li.querySelector('strong')!.textContent = OBS_LABELS[r.type] ?? r.type;
    li.querySelector('.note')!.textContent = r.note;
    const cb = li.querySelector('input')!;
    cb.onchange = () => { cb.checked ? selected.add(r.id) : selected.delete(r.id); };
    ul.append(li);
  }
  prevSynced = new Set(cache.filter((r) => r.synced).map((r) => r.id));
  listInit = true;
  setCitizen(cache.map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, type: r.type, severity: r.severity, note: r.note, state: stateLabel(r) })));
}
$<HTMLInputElement>('sel-all').onchange = (e) => {
  selected.clear();
  if ((e.target as HTMLInputElement).checked) cache.forEach((r) => selected.add(r.id));
  renderList();
};
$('clear').onclick = async () => { if (confirm('¿Borrar todos los registros de este equipo?')) { await clearAll(); selected.clear(); renderList(); } };

// ---------- emisor ----------
let frags: string[] = [];
let fi = 0;
let timer: number | undefined;
async function drawFrag() {
  if (!frags.length) return;
  const segs = [{ data: frags[fi], mode: 'alphanumeric' as const }];
  const qr = QRCode.create(segs, { errorCorrectionLevel: 'M' });
  const w = Math.min(420, $('emit-out').clientWidth || innerWidth - 48);
  await QRCode.toCanvas($<HTMLCanvasElement>('qr'), segs, { errorCorrectionLevel: 'M', margin: 4, width: w, color: { dark: '#000000', light: '#ffffff' } });
  $('qr').dataset.fragment = String(fi + 1);
  $('qr-idx').textContent = frags.length > 1 ? `QR ${fi + 1} de ${frags.length}` : `QR único · v${qr.version}`;
}
$('emit').onclick = async () => {
  const recs: Observation[] = cache.filter((r) => selected.has(r.id)).map(({ source, receivedAt, synced, syncedAt, ...o }) => o);
  if (!recs.length) { $('emit-info').textContent = 'Seleccione al menos un registro.'; $('emit-out').hidden = false; return; }
  const chunk = +$<HTMLInputElement>('chunk').value || DEFAULT_CHUNK;
  const e = encodeForQR(recs, chunk);
  frags = e.fragments; fi = 0;
  const versions = frags.map((f) => QRCode.create([{ data: f, mode: 'alphanumeric' }], { errorCorrectionLevel: 'M' }).version);
  $('emit-out').hidden = false;
  $('emit-info').textContent = `${recs.length} registros · ${e.deflatedBytes} B comprimidos · ${frags.length} QR (v${Math.max(...versions)}) · CRC ${e.crc.toString(16)}`;
  $('emit-info').dataset.detail = `JSON ${e.jsonBytes} B → deflate ${e.deflatedBytes} B → base45 ${e.base45Chars}`;
  const link = `${location.origin}${location.pathname}#${encodeLinkHash(recs)}`;
  $<HTMLInputElement>('link').value = link;
  document.querySelector<HTMLElement>('.qrnav')!.hidden = frags.length < 2;
  await drawFrag();
  play(frags.length > 1);
  $('emit-out').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
function play(on: boolean) {
  clearInterval(timer); timer = undefined;
  if (on && frags.length > 1) timer = window.setInterval(() => { fi = (fi + 1) % frags.length; drawFrag(); }, 500);
  $('qr-play').textContent = timer ? 'Pausar' : 'Animar';
}
$('qr-play').onclick = () => play(timer === undefined);
$('qr-prev').onclick = () => { play(false); fi = (fi - 1 + frags.length) % frags.length; drawFrag(); };
$('qr-next').onclick = () => { play(false); fi = (fi + 1) % frags.length; drawFrag(); };
$('copy-link').onclick = async () => {
  const v = $<HTMLInputElement>('link').value;
  try { await navigator.clipboard.writeText(v); $('copy-link').textContent = 'Copiado'; } catch { $<HTMLInputElement>('link').select(); }
};

// ---------- receptor ----------
const reasm = new Reassembler();
const recvStatus = (s: string) => { $('recv-status').textContent = s; };
function progress(have: number, n: number) {
  const box = $('recv-progress');
  box.hidden = false;
  box.dataset.have = String(have); box.dataset.n = String(n);
  $('recv-bar').style.width = `${Math.round((100 * have) / n)}%`;
  $('recv-progress-label').textContent = have >= n ? `${n}/${n} · completo` : `${have}/${n} fragmentos`;
  box.classList.toggle('complete', have >= n);
}
async function ingest(raw: string, source: Source): Promise<boolean> {
  const r = reasm.add(raw);
  if (r.status === 'ignored') { recvStatus('QR leído, pero no es de Yaku Relay.'); return false; }
  if (r.status === 'error') { recvStatus(`Error en el mensaje ${r.msg}: ${r.reason}`); return false; }
  if (r.status === 'progress') { progress(r.have, r.n); recvStatus(`Mensaje ${r.msg}: ${r.have}/${r.n} fragmentos${r.duplicate ? ' (repetido)' : ''}`); return false; }
  progress(r.n, r.n);
  const res = await putIfAbsent(r.records, source);
  recvStatus(`Mensaje ${r.msg} completo: ${r.records.length} registros · ${res.added} nuevos · ${res.dupes} duplicados ignorados`);
  await renderList();
  doSync('recepción');
  return true;
}

let stream: MediaStream | null = null;
const stats: ScanStats = { frames: 0, engine: 'jsQR' };
async function fillCams() {
  try {
    const cams = await listCameras();
    const sel = $<HTMLSelectElement>('cams');
    const cur = sel.value;
    sel.length = 1;
    cams.forEach((c, i) => sel.add(new Option(c.label || `Cámara ${i + 1}`, c.deviceId)));
    sel.value = cur;
  } catch { /* sin mediaDevices */ }
}
async function camStart() {
  if (!navigator.mediaDevices?.getUserMedia) { recvStatus('Este navegador no expone la cámara (¿HTTPS?). Use «Subir imagen» o el enlace relay.'); return; }
  try {
    stream?.getTracks().forEach((t) => t.stop());
    $('cam-box').hidden = false;
    stream = await startCamera($<HTMLVideoElement>('video'), $<HTMLSelectElement>('cams').value || undefined);
    await fillCams();
    let last = '';
    scanLoop($<HTMLVideoElement>('video'), (s) => { if (s !== last) { last = s; ingest(s, 'qr'); } }, stats, () => !!stream);
    recvStatus('Cámara activa: apunte al QR del otro equipo.');
    $('cam-start').textContent = 'Cámara activa';
    setTimeout(() => { $('recv-status').dataset.engine = stats.engine; renderDiag(); }, 500);
  } catch (e) {
    $('cam-box').hidden = true;
    recvStatus(`Cámara no disponible: ${(e as Error).name}. Use «Subir imagen» o el enlace relay.`);
  }
}
$('cam-start').onclick = camStart;
$<HTMLSelectElement>('cams').onchange = () => { if (stream) camStart(); };
$('cam-stop').onclick = () => {
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  $('cam-box').hidden = true; $('cam-start').textContent = 'Escanear QR con cámara';
};

$<HTMLInputElement>('file').onchange = async (e) => {
  const files = [...((e.target as HTMLInputElement).files ?? [])];
  let read = 0;
  for (const f of files) {
    const s = await decodeImageFile(f);
    if (s) { read++; await ingest(s, 'imagen'); }
  }
  if (!read) recvStatus('No se encontró ningún QR en la(s) imagen(es).');
  (e.target as HTMLInputElement).value = '';
};

async function importFromHash() {
  if (!location.hash.startsWith('#p=')) return;
  try {
    const recs = decodeLinkHash(location.hash)!;
    const res = await putIfAbsent(recs, 'enlace');
    recvStatus(`Enlace relay: ${recs.length} registros · ${res.added} nuevos · ${res.dupes} duplicados ignorados`);
    showTab('relevo');
  } catch (e) { recvStatus(`Enlace inválido: ${(e as Error).message}`); }
  history.replaceState(null, '', location.pathname + location.search);
  await renderList();
  doSync('enlace');
}
addEventListener('hashchange', importFromHash);

// ---------- sync ----------
const ep = $<HTMLInputElement>('endpoint');
const endpoint = () => ep.value.trim() || DEFAULT_ENDPOINT;
ep.value = localStorage.getItem('yaku-endpoint') || import.meta.env.VITE_SYNC_ENDPOINT || DEFAULT_ENDPOINT;
ep.onchange = () => { localStorage.setItem('yaku-endpoint', ep.value.trim()); renderDiag(); };
async function doSync(why: string) {
  const pend = cache.filter((r) => !r.synced).length;
  if (!navigator.onLine) { $('sync-status').textContent = `Sin red: ${pend} registro(s) esperan en relevo.`; return; }
  const r = await flushQueue(endpoint());
  if (r.error) $('sync-status').textContent = `No se pudo consolidar (${why}): ${r.error}. Se reintentará al volver la red.`;
  else if (r.attempted) $('sync-status').textContent = `Consolidados ${r.accepted}/${r.attempted}${r.inserted !== undefined ? ` · ${r.inserted} nuevos en servidor, ${r.duplicates} ya estaban` : ''} (${why}).`;
  else $('sync-status').textContent = 'Nada pendiente.';
  if (r.accepted) { await renderList(); refreshStats(); }
}
async function refreshStats() {
  const s = await serverStats(endpoint());
  $('server-stats').textContent = s ? `Servidor: ${s.total} reportes consolidados (ids únicos: ${s.unique_ids}).` : '';
}
$('sync').onclick = () => doSync('manual');

// ---------- diagnóstico ----------
async function renderDiag() {
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const sw = navigator.serviceWorker?.controller ? 'activo' : 'no controla aún';
  $('diag-info').innerHTML = [
    ['deviceId', deviceId()], ['build', __BUILD__], ['service worker', sw], ['lector QR', stats.engine],
    ['endpoint', endpoint() === MOCK_ENDPOINT ? 'mock:local (simulado)' : endpoint()],
    ['almacenamiento', est ? `${Math.round((est.usage ?? 0) / 1024)} KB usados` : 's/d'],
  ].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
}
$('diag').addEventListener('toggle', renderDiag);

(window as any).__yaku = { all, getMap, mapLoaded, basemap: basemapInfo, phase: PHASE };
(async () => {
  await importFromHash();
  await renderList();
  document.body.dataset.ready = '1';
  doSync('inicio');
})();

// Aviso cuando se acerca más allá del detalle del mapa base (las teselas se amplían, con menos detalle)
getMap()?.on('zoomend', () => {
  const m = getMap()!;
  const h = $('map-hint');
  h.hidden = m.getZoom() < BASEMAP.maxzoom + 2;
  h.textContent = `Mapa base con detalle hasta zoom ${BASEMAP.maxzoom}: más cerca se amplía con menos detalle.`;
});
