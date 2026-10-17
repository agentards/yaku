import './style.css';
import QRCode from 'qrcode';
import { registerSW } from 'virtual:pwa-register';
import {
  OBS_TYPES, OBS_LABELS, makeObservation, encodeForQR, encodeLinkHash, decodeLinkHash,
  Reassembler, DEFAULT_CHUNK, type ObsType, type Observation,
} from './codec';
import { all, putIfAbsent, clearAll, type Source, type StoredObs } from './db';
import { flushQueue, MOCK_ENDPOINT } from './sync';
import { listCameras, startCamera, scanLoop, decodeImageFile, type ScanStats } from './scanner';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

registerSW({ immediate: true });

// ---- deviceId persistente ----
function deviceId(): string {
  let d = localStorage.getItem('yaku-device');
  if (!d) {
    const a = new Uint8Array(6); crypto.getRandomValues(a);
    d = [...a].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 8);
    localStorage.setItem('yaku-device', d);
  }
  return d;
}
$('build').textContent = `deviceId ${deviceId()} · build ${__BUILD__}`;

// ---- red ----
function renderNet() {
  const n = $('net');
  n.textContent = navigator.onLine ? 'EN LÍNEA' : 'SIN RED';
  n.className = 'net ' + (navigator.onLine ? 'on' : 'off');
}
addEventListener('online', () => { renderNet(); doSync('evento online'); });
addEventListener('offline', renderNet);
renderNet();

// ---- formulario ----
const typeSel = $<HTMLSelectElement>('f-type');
for (const t of OBS_TYPES) typeSel.add(new Option(OBS_LABELS[t], t));

$('gps').onclick = () => {
  const st = $('gps-status');
  if (!('geolocation' in navigator)) { st.textContent = 'Sin geolocalización: ingrese lat/lon manual.'; return; }
  st.textContent = 'Obteniendo posición…';
  navigator.geolocation.getCurrentPosition(
    (p) => {
      $<HTMLInputElement>('f-lat').value = p.coords.latitude.toFixed(5);
      $<HTMLInputElement>('f-lon').value = p.coords.longitude.toFixed(5);
      st.textContent = `GPS ±${Math.round(p.coords.accuracy)} m`;
    },
    (e) => { st.textContent = `GPS falló (${e.message}). Ingrese lat/lon manual.`; },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
  );
};

$<HTMLFormElement>('form').onsubmit = async (ev) => {
  ev.preventDefault();
  const o = makeObservation({
    type: typeSel.value as ObsType,
    severity: +$<HTMLSelectElement>('f-sev').value as 1 | 2 | 3,
    lat: +$<HTMLInputElement>('f-lat').value,
    lon: +$<HTMLInputElement>('f-lon').value,
    note: $<HTMLInputElement>('f-note').value,
    ts: Date.now() / 1000,
    deviceId: deviceId(),
  });
  const r = await putIfAbsent([o], 'local');
  $('gps-status').textContent = r.added ? `Guardado ${o.id}` : `Duplicado (${o.id}) — ya existía`;
  $<HTMLInputElement>('f-note').value = '';
  await renderList();
  doSync('nuevo registro');
};

// ---- lista ----
const selected = new Set<string>();
let cache: StoredObs[] = [];
const SOURCE_LABEL: Record<Source, string> = { local: 'creado aquí', qr: 'recibido por QR (cámara)', enlace: 'recibido por enlace', imagen: 'recibido por imagen QR' };

async function renderList() {
  cache = await all();
  $('count').textContent = String(cache.length);
  const ul = $('list');
  ul.innerHTML = '';
  for (const r of cache) {
    const li = document.createElement('li');
    li.className = 'citizen';
    li.dataset.id = r.id;
    li.innerHTML = `
      <label class="pick"><input type="checkbox" ${selected.has(r.id) || $<HTMLInputElement>('sel-all').checked ? 'checked' : ''} /></label>
      <div>
        <span class="badge-unverified">NO VERIFICADO</span>
        <span class="kind">Reporte ciudadano</span>
        <span class="sync ${r.synced ? 'ok' : 'pend'}">${r.synced ? 'sincronizado' : 'pendiente'}</span>
        <div><strong></strong> · sev ${r.severity} · <span class="mono">${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}</span></div>
        <div class="note"></div>
        <small class="mono">${new Date(r.ts * 1000).toLocaleString()} · ${r.deviceId} · ${SOURCE_LABEL[r.source]} · id ${r.id}</small>
      </div>`;
    li.querySelector('strong')!.textContent = OBS_LABELS[r.type] ?? r.type;
    li.querySelector('.note')!.textContent = r.note;
    const cb = li.querySelector('input')!;
    if (cb.checked) selected.add(r.id);
    cb.onchange = () => { cb.checked ? selected.add(r.id) : selected.delete(r.id); };
    ul.append(li);
  }
}
$<HTMLInputElement>('sel-all').onchange = (e) => {
  const on = (e.target as HTMLInputElement).checked;
  selected.clear();
  if (on) cache.forEach((r) => selected.add(r.id));
  renderList();
};
$('clear').onclick = async () => { if (confirm('¿Borrar todos los registros locales?')) { await clearAll(); selected.clear(); renderList(); } };

// ---- emisor ----
let frags: string[] = [];
let fi = 0;
let timer: number | undefined;
async function drawFrag() {
  if (!frags.length) return;
  const segs = [{ data: frags[fi], mode: 'alphanumeric' as const }];
  const qr = QRCode.create(segs, { errorCorrectionLevel: 'M' });
  await QRCode.toCanvas($<HTMLCanvasElement>('qr'), segs, { errorCorrectionLevel: 'M', margin: 4, width: Math.min(480, innerWidth - 40) });
  $('qr').dataset.fragment = String(fi + 1);
  $('qr-idx').textContent = `fragmento ${fi + 1}/${frags.length} · QR v${qr.version} · ${frags[fi].length} chars`;
}
$('emit').onclick = async () => {
  const recs: Observation[] = cache.filter((r) => selected.has(r.id)).map(({ source, receivedAt, synced, syncedAt, ...o }) => o);
  if (!recs.length) { $('emit-info').textContent = 'Nada seleccionado.'; return; }
  const chunk = +$<HTMLInputElement>('chunk').value || DEFAULT_CHUNK;
  const e = encodeForQR(recs, chunk);
  frags = e.fragments; fi = 0;
  const versions = frags.map((f) => QRCode.create([{ data: f, mode: 'alphanumeric' }], { errorCorrectionLevel: 'M' }).version);
  $('emit-info').textContent = `${recs.length} registros · JSON ${e.jsonBytes} B → deflate ${e.deflatedBytes} B → base45 ${e.base45Chars} chars · ${frags.length} QR (v${Math.max(...versions)} máx, ECC M) · CRC32 ${e.crc.toString(16)}`;
  const link = `${location.origin}${location.pathname}#${encodeLinkHash(recs)}`;
  $<HTMLInputElement>('link').value = link;
  $('link').dataset.bytes = String(link.length);
  await drawFrag();
  if (frags.length > 1) play(true);
};
function play(on: boolean) {
  clearInterval(timer); timer = undefined;
  if (on && frags.length > 1) timer = window.setInterval(() => { fi = (fi + 1) % frags.length; drawFrag(); }, 500);
}
$('qr-play').onclick = () => play(timer === undefined);
$('qr-prev').onclick = () => { play(false); fi = (fi - 1 + frags.length) % frags.length; drawFrag(); };
$('qr-next').onclick = () => { play(false); fi = (fi + 1) % frags.length; drawFrag(); };
$('copy-link').onclick = async () => {
  const v = $<HTMLInputElement>('link').value;
  try { await navigator.clipboard.writeText(v); } catch { $<HTMLInputElement>('link').select(); }
};

// ---- receptor ----
const reasm = new Reassembler();
const recvStatus = (s: string) => { $('recv-status').textContent = s; };
async function ingest(raw: string, source: Source): Promise<boolean> {
  const r = reasm.add(raw);
  if (r.status === 'ignored') { recvStatus(`QR leído, pero no es Yaku Relay.`); return false; }
  if (r.status === 'error') { recvStatus(`Error en mensaje ${r.msg}: ${r.reason}`); return false; }
  if (r.status === 'progress') { recvStatus(`Mensaje ${r.msg}: ${r.have}/${r.n} fragmentos${r.duplicate ? ' (repetido)' : ''}`); return false; }
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
$('cam-start').onclick = async () => {
  if (!navigator.mediaDevices?.getUserMedia) { recvStatus('Este navegador no expone cámara (¿HTTPS?). Use subir imagen o enlace.'); return; }
  try {
    stream?.getTracks().forEach((t) => t.stop());
    stream = await startCamera($<HTMLVideoElement>('video'), $<HTMLSelectElement>('cams').value || undefined);
    await fillCams(); // etiquetas visibles tras el permiso
    let last = '';
    scanLoop($<HTMLVideoElement>('video'), (s) => { if (s !== last) { last = s; ingest(s, 'qr'); } }, stats, () => !!stream);
    recvStatus('Cámara activa, apunte al QR…');
    setTimeout(() => { $('recv-status').dataset.engine = stats.engine; }, 500);
  } catch (e) { recvStatus(`Cámara no disponible: ${(e as Error).name} ${(e as Error).message}`); }
};
$('cam-stop').onclick = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };
fillCams();

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
  } catch (e) { recvStatus(`Enlace inválido: ${(e as Error).message}`); }
  history.replaceState(null, '', location.pathname + location.search);
  await renderList();
  doSync('enlace');
}
addEventListener('hashchange', importFromHash);

// ---- sync ----
const ep = $<HTMLInputElement>('endpoint');
ep.value = localStorage.getItem('yaku-endpoint') || import.meta.env.VITE_SYNC_ENDPOINT || MOCK_ENDPOINT;
ep.onchange = () => localStorage.setItem('yaku-endpoint', ep.value.trim());
async function doSync(why: string) {
  if (!navigator.onLine) { $('sync-status').textContent = `Sin red: cola pendiente (${cache.filter((r) => !r.synced).length}).`; return; }
  const r = await flushQueue(ep.value.trim());
  $('sync-status').textContent = r.error
    ? `Sync (${why}) falló: ${r.error} — reintenta al volver la red`
    : `Sync (${why}): ${r.accepted}/${r.attempted} confirmados`;
  if (r.accepted) await renderList();
}
$('sync').onclick = () => doSync('manual');

(window as any).__yaku = { all };
(async () => { await importFromHash(); await renderList(); document.body.dataset.ready = '1'; doSync('inicio'); })();
