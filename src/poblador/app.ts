// Modo poblador (?vista=poblador y por defecto en celular): pantalla simple para el vecino, con una mano.
// Reportar con botones grandes (GPS + foto comprimida en el celular), aviso 116/105 primero si hay riesgo de
// vida, «Intercambiar» en un paso (mi QR arriba, cámara abajo leyendo el del otro), lista de mis reportes y
// los que llevo, y el estado de vuelta de la municipalidad tras sincronizar (también viaja por QR).
// Usa el mismo almacén, codec, relevo QR y sincronización que la app técnica (src/db.ts, codec.ts, sync.ts).
import QRCode from 'qrcode';
import { makeObservation, encodeForQR, Reassembler, type Observation } from '../codec';
import { all, putIfAbsent, type StoredObs } from '../db';
import { flushQueue, DEFAULT_ENDPOINT } from '../sync';
import { scanLoop, decodeImageFile, type ScanStats } from '../scanner';
import { BOTONES, BOTON, aCodec, deCodec, type TipoPoblador } from './tipos';
import { T, ROTULO_VECINAL, DETALLE, PIE_LEGAL, nivelLocal } from './textos';
import { vecinosQueCoinciden } from './confianza';
import { textoEstado, codificarEstadosQR, decodificarEstadosQR, esCodigoEstados, type EstadoReporte } from './estados';
import { comprimirFoto, type FotoComprimida } from './foto';
import { guardarFoto, fotos as leerFotos, marcarFotoSubida, estados as leerEstados, fusionarEstados, avisos as leerAvisos, guardarAvisos, cartas as leerCartas, guardarCartas, marcarCartasSubidas, type FotoGuardada } from './almacen';
import { pedirEstados, subirFoto, pedirAvisos, claveAvisos, subirCartas, buscarCartasServidor } from './api';
import { crearCarta, verificarId, codificarCartasQR, decodificarCartasQR, esCodigoCartas, cartasParaQR, buscarCartas, textoCarta, type Carta, type CartaGuardada } from './cartas';
import { verificarAviso, codificarAvisoQR, decodificarAvisoQR, esCodigoAviso, avisosParaQR, textoAviso, type Aviso, type AvisoGuardado } from './avisos';
import './poblador.css';

type Vista = 'reportar' | 'aviso' | 'detalle' | 'intercambiar' | 'lista' | 'bien';
type Loc = { lat: number; lon: number; acc?: number; src: 'gps' | 'ultima' | 'ninguna'; at: number };

const PIURA = { lat: -5.19449, lon: -80.63282 };
const CLAVE_ULTIMA = 'yaku-poblador-ultima';
const CLAVE_CONSENT = 'yaku-poblador-consentimiento';
const CLAVE_BIEN_NOMBRE = 'yaku-bien-nombre';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const svg = (cuerpo: string, cls = 'pb-ico') => `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${cuerpo}</svg>`;
const hora = (s: number) => new Date(s * 1000).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

function deviceId(): string { // misma clave que la app técnica: un solo código anónimo por celular
  let d = ls.get('yaku-device');
  if (!d) {
    const a = new Uint8Array(6); crypto.getRandomValues(a);
    d = [...a].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 8);
    ls.set('yaku-device', d);
  }
  return d;
}

const ICONOS = {
  reportar: '<path d="M24 8v32M8 24h32"/>',
  intercambiar: '<rect x="5" y="5" width="15" height="15" rx="2"/><rect x="28" y="28" width="15" height="15" rx="2"/><path d="M30 8h10v10M18 40H8V30M40 8 28 20M8 40l12-12"/>',
  lista: '<path d="M16 12h26M16 24h26M16 36h26"/><circle cx="7" cy="12" r="2"/><circle cx="7" cy="24" r="2"/><circle cx="7" cy="36" r="2"/>',
  camara: '<path d="M6 16h8l4-6h12l4 6h8v22H6Z"/><circle cx="24" cy="27" r="7"/>',
  gota: '<path d="M24 5s-12 13-12 22a12 12 0 0 0 24 0c0-9-12-22-12-22Z"/>',
  bien: '<path d="M24 40S7 30 7 18a8.5 8.5 0 0 1 17-3 8.5 8.5 0 0 1 17 3c0 12-17 22-17 22Z"/>',
};

export function arrancar() {
  document.title = 'Yaku · Modo vecino';
  const raiz = document.createElement('div');
  raiz.className = 'pb';
  raiz.innerHTML = plantilla();
  document.body.append(raiz);
  const $ = <E extends HTMLElement = HTMLElement>(id: string) => raiz.querySelector<E>('#' + id)!;

  // ---------- estado ----------
  let vista: Vista = 'reportar';
  let tipo: TipoPoblador = 'agua';
  let foto: FotoComprimida | null = null;
  let loc: Loc | null = null;
  let buscando: Promise<void> | null = null;
  let cache: StoredObs[] = [];
  let estadosMap = new Map<string, EstadoReporte>();
  let fotosMap = new Map<string, FotoGuardada>();
  const urls = new Map<string, string>();
  let resaltar = '';
  let syncTxt = '';

  // ---------- navegación ----------
  function ir(v: Vista) {
    if (vista === 'intercambiar' && v !== 'intercambiar') cerrarIntercambio();
    vista = v;
    raiz.dataset.vista = v;
    raiz.querySelectorAll<HTMLElement>('[data-v]').forEach((s) => (s.hidden = s.dataset.v !== v));
    const nav = v === 'aviso' || v === 'detalle' ? 'reportar' : v;
    raiz.querySelectorAll<HTMLButtonElement>('.pb-nav button').forEach((b) => b.toggleAttribute('aria-current', b.dataset.ir === nav));
    $('pb-main').scrollTop = 0; scrollTo(0, 0);
    raiz.querySelector<HTMLElement>(`[data-v="${v}"] h1`)?.focus({ preventScroll: true });
    if (v === 'intercambiar') abrirIntercambio();
    if (v === 'lista') render();
    if (v === 'bien') renderBien();
  }
  raiz.querySelectorAll<HTMLButtonElement>('.pb-nav button').forEach((b) => (b.onclick = () => ir(b.dataset.ir as Vista)));

  // ---------- red y consentimiento ----------
  function renderRed() {
    const on = navigator.onLine;
    const r = $('pb-red');
    r.textContent = on ? T.enLinea : T.sinRed; r.dataset.on = String(on);
  }
  addEventListener('online', () => { renderRed(); sincronizar(); });
  addEventListener('offline', () => { renderRed(); render(); });
  renderRed();
  if (!ls.get(CLAVE_CONSENT)) $('pb-consent').hidden = false;
  $('pb-consent-ok').onclick = () => { ls.set(CLAVE_CONSENT, '1'); $('pb-consent').hidden = true; };

  // ---------- reportar ----------
  raiz.querySelectorAll<HTMLButtonElement>('.pb-tipo').forEach((b) => (b.onclick = () => elegir(b.dataset.tipo as TipoPoblador)));
  function elegir(t: TipoPoblador) {
    tipo = t;
    const b = BOTON[t];
    if (b.riesgoVida) { $('pb-aviso-tipo').textContent = b.texto; ir('aviso'); return; }
    abrirDetalle();
  }
  $('pb-aviso-seguir').onclick = () => abrirDetalle();
  function abrirDetalle() {
    const b = BOTON[tipo];
    $('pb-d-ico').innerHTML = svg(b.icono);
    $('pb-d-tipo').textContent = b.texto;
    raiz.querySelector<HTMLInputElement>(`input[name="pb-sev"][value="${b.sev}"]`)!.checked = true;
    $<HTMLTextAreaElement>('pb-nota').value = '';
    ponerFoto(null);
    $('pb-guardar-txt').textContent = '';
    ir('detalle');
    ubicar(false);
  }
  $('pb-cancelar').onclick = () => ir('reportar');

  function ubicar(forzar: boolean): Promise<void> {
    if (buscando) return buscando;
    if (!forzar && loc?.src === 'gps' && Date.now() - loc.at < 60_000) { pintarLoc(); return Promise.resolve(); }
    const txt = $('pb-loc-txt');
    if (!('geolocation' in navigator)) { usarUltima(); return Promise.resolve(); }
    txt.textContent = T.ubicacionBuscando; $('pb-loc').dataset.src = 'buscando';
    buscando = new Promise<void>((ok) => {
      navigator.geolocation.getCurrentPosition((p) => {
        loc = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, src: 'gps', at: Date.now() };
        ls.set(CLAVE_ULTIMA, JSON.stringify(loc));
        pintarLoc(); ok();
      }, () => { usarUltima(); ok(); }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 });
    }).finally(() => { buscando = null; });
    return buscando;
  }
  function usarUltima() {
    try {
      const u = JSON.parse(ls.get(CLAVE_ULTIMA) || 'null');
      loc = u && Number.isFinite(u.lat) ? { ...u, src: 'ultima' } : { ...PIURA, src: 'ninguna', at: Date.now() };
    } catch { loc = { ...PIURA, src: 'ninguna', at: Date.now() }; }
    pintarLoc();
  }
  function pintarLoc() {
    if (!loc) return;
    $('pb-loc').dataset.src = loc.src;
    $('pb-loc-txt').textContent = loc.src === 'gps' ? T.ubicacionGps(loc.acc ?? 0)
      : loc.src === 'ultima' ? T.ubicacionUltima(Math.max(1, Math.round((Date.now() - loc.at) / 60000)))
      : T.ubicacionSin;
  }
  $('pb-gps').onclick = () => ubicar(true);

  // foto: <input capture> → JPEG ~150 KB en IndexedDB
  const fotoIn = $<HTMLInputElement>('pb-foto-in');
  fotoIn.onchange = async () => {
    const f = fotoIn.files?.[0];
    fotoIn.value = '';
    if (!f) return;
    $('pb-foto-txt').textContent = T.fotoComprimiendo;
    try { ponerFoto(await comprimirFoto(f)); } catch { ponerFoto(null); $('pb-foto-txt').textContent = T.fotoError; }
  };
  $('pb-foto-quitar').onclick = () => ponerFoto(null);
  function ponerFoto(f: FotoComprimida | null) {
    foto = f;
    const img = $<HTMLImageElement>('pb-foto-img');
    if (img.src) URL.revokeObjectURL(img.src);
    img.hidden = !f; img.removeAttribute('src');
    if (f) img.src = URL.createObjectURL(f.blob);
    $('pb-foto-lbl').textContent = f ? T.fotoOtra : T.foto;
    $('pb-foto-quitar').hidden = !f;
    $('pb-foto-txt').textContent = f ? T.fotoLista(Math.round(f.bytes / 1024)) : '';
    raiz.dataset.foto = f ? String(f.bytes) : '';
  }

  $<HTMLFormElement>('pb-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = $<HTMLButtonElement>('pb-guardar');
    btn.disabled = true;
    try {
      if (buscando) { $('pb-guardar-txt').textContent = T.ubicacionBuscando; await Promise.race([buscando, new Promise((r) => setTimeout(r, 6000))]); }
      if (!loc) usarUltima();
      const p = loc!;
      const nota = (p.src === 'ninguna' ? '(sin GPS) ' : '') + $<HTMLTextAreaElement>('pb-nota').value;
      const { type, note } = aCodec(tipo, nota, !!foto);
      const sev = +raiz.querySelector<HTMLInputElement>('input[name="pb-sev"]:checked')!.value as 1 | 2 | 3;
      const o = makeObservation({ type, severity: sev, lat: p.lat, lon: p.lon, note, ts: Date.now() / 1000, deviceId: deviceId() });
      const r = await putIfAbsent([o], 'local');
      if (foto && r.added) await guardarFoto({ id: o.id, blob: foto.blob, bytes: foto.bytes, w: foto.w, h: foto.h });
      resaltar = o.id;
      aviso(r.added ? (navigator.onLine ? T.guardadoEnviando : T.guardado) : T.yaExistia);
      await recargar();
      ir('lista');
      void enviarYa();
    } finally { btn.disabled = false; }
  };

  // ---------- lista ----------
  let avisosLista: AvisoGuardado[] = [];
  async function recargar() {
    [cache, estadosMap, fotosMap, avisosLista] = await Promise.all([all(), leerEstados(), leerFotos().then((xs) => new Map(xs.map((f) => [f.id, f]))), leerAvisos()]);
    render();
  }
  /** Verifica y guarda avisos (de la red o de un QR). Devuelve los nuevos verificados y avisa en pantalla. */
  async function recibirAvisos(xs: Aviso[], via: 'red' | 'qr'): Promise<AvisoGuardado[]> {
    const clave = claveAvisos();
    const marcados = await Promise.all(xs.map(async (a) => ({ ...a, verificado: await verificarAviso(a, clave), via, recibidoAt: Date.now() })));
    const nuevos = (await guardarAvisos(marcados)).filter((a) => a.verificado);
    if (nuevos.length) {
      const t = textoAviso(nuevos[0], tipoAviso);
      aviso(`📣 ${t.titulo} · ${t.detalle}`);
      try { navigator.vibrate?.([120, 80, 120]); } catch { /* sin vibración */ }
    }
    return nuevos;
  }
  const tipoAviso = (t: string) => (BOTON as Record<string, { texto: string } | undefined>)[t]?.texto ?? 'Incidente';
  function tarjetaAviso(a: AvisoGuardado): string {
    const t = textoAviso(a, tipoAviso);
    return `<li class="pb-aviso" data-id="${esc(a.id)}" data-accion="${a.accion}" data-verificado="${a.verificado ? '1' : '0'}">
      <b>📣 ${esc(t.titulo)}</b>
      <div class="pb-aviso-det">${esc(t.detalle)}</div>
      <small class="pb-meta">${esc(t.origen)}</small>
    </li>`;
  }
  function render() {
    const pend = cache.filter((r) => !r.synced).length;
    const pp = $('pb-pend');
    pp.textContent = T.porEnviar(pend); pp.hidden = pend === 0;
    const mios = cache.filter((r) => r.source === 'local'), llevo = cache.filter((r) => r.source !== 'local');
    $('pb-nav-n').textContent = cache.length ? String(cache.length) : '';
    if (vista !== 'lista') return;
    const visibles = avisosLista.filter((a) => a.verificado);
    $('pb-n-avisos').textContent = String(visibles.length);
    $('pb-avisos').innerHTML = visibles.length ? visibles.map(tarjetaAviso).join('') : `<li class="pb-vacio">${esc(T.avisosVacio)}</li>`;
    $('pb-n-mios').textContent = String(mios.length);
    $('pb-n-llevo').textContent = String(llevo.length);
    $('pb-mios').innerHTML = mios.length ? mios.map(tarjeta).join('') : `<li class="pb-vacio">${esc(T.vacioMios)}</li>`;
    $('pb-llevo').innerHTML = llevo.length ? llevo.map(tarjeta).join('') : `<li class="pb-vacio">${esc(T.vacioLlevo)}</li>`;
    $('pb-sync-txt').textContent = navigator.onLine ? syncTxt : T.sinInternetEstado;
    $<HTMLButtonElement>('pb-actualizar').disabled = !navigator.onLine;
    if (resaltar) { raiz.querySelector(`.pb-rep[data-id="${resaltar}"]`)?.scrollIntoView({ block: 'nearest' }); resaltar = ''; }
  }
  function tarjeta(r: StoredObs): string {
    const d = deCodec(r), b = BOTON[d.tipo];
    const e = estadosMap.get(r.id);
    const est = textoEstado(e, r.synced);
    const loc = vecinosQueCoinciden(r, cache);
    const n = Math.max(e?.personas ?? 0, loc.vecinos);
    const niv = nivelLocal(n);
    const f = fotosMap.get(r.id);
    if (f && !urls.has(r.id)) urls.set(r.id, URL.createObjectURL(f.blob));
    const meta = [hora(r.ts), d.conFoto ? T.conFoto : '', r.source !== 'local' ? T.llegoPorQr : ''].filter(Boolean).join(' · ');
    // Con estado municipal el vecino ve SOLO el estado; sin él, el rótulo vecinal y su respaldo en palabras.
    const chip = est.chip
      ? `<span class="pb-chip-muni" data-nivel="${est.nivel}">${esc(est.chip)}</span>`
      : `<span class="pb-badge" data-n="${niv}">${esc(ROTULO_VECINAL)}</span> <small class="pb-respaldo">${esc(DETALLE[niv](n, loc.fotos))}</small>`;
    return `<li class="pb-rep${r.id === resaltar ? ' pb-nuevo' : ''}" data-id="${esc(r.id)}" data-tipo="${d.tipo}" data-nivel="${est.nivel}" data-vecinos="${n}">
      ${svg(b.icono)}
      <div class="pb-rep-cuerpo">
        <div class="pb-rep-tit"><b>${esc(b.texto)}</b> <span class="pb-sev s${r.severity}">${esc(T.grav[r.severity])}</span></div>
        <div class="pb-rotulo">${chip}</div>
        ${d.nota ? `<div class="pb-rep-nota">${esc(d.nota)}</div>` : ''}
        <div class="pb-estado" data-nivel="${est.nivel}">${esc(est.detalle)}</div>
        <small class="pb-meta">${esc(meta)}</small>
      </div>
      ${urls.has(r.id) ? `<img class="pb-mini" src="${urls.get(r.id)}" alt="Foto del reporte">` : ''}
    </li>`;
  }
  $('pb-actualizar').onclick = () => sincronizar(true);

  // ---------- sincronización + estado de vuelta + fotos ----------
  let enCurso: Promise<void> | null = null;
  let otraVez = false;
  /** El reporte nuevo (propio o recibido por QR) sale ya: solo POST /api/sync, sin esperar a una sincronización en
   *  curso (p. ej. una foto subiendo por red lenta). Fotos, estados, cartas y avisos siguen en sincronizar(). */
  async function enviarYa() {
    if (navigator.onLine) { try { await flushQueue(DEFAULT_ENDPOINT); await recargar(); } catch { /* reintenta sincronizar() */ } }
    void sincronizar();
  }
  function sincronizar(manual = false): Promise<void> {
    // Si ya hay una en curso, se repite al terminar (antes se perdía y lo nuevo esperaba al temporizador de 20 s).
    if (enCurso) { otraVez = true; return enCurso; }
    enCurso = (async () => {
      if (!navigator.onLine) { render(); return; }
      if (manual) { $('pb-sync-txt').textContent = T.actualizando; }
      const r = await flushQueue(DEFAULT_ENDPOINT);
      await recargar();
      const partes: string[] = [];
      if (r.error) partes.push(`No se pudo enviar (${r.error}); se reintenta solo.`);
      else if (r.accepted) partes.push(`${r.accepted === 1 ? '1 reporte enviado' : `${r.accepted} reportes enviados`} al servidor.`);
      for (const f of fotosMap.values()) {
        if (f.subida || !cache.find((x) => x.id === f.id)?.synced) continue;
        try { if (await subirFoto(f.id, f.blob)) { await marcarFotoSubida(f.id); partes.push('Foto subida.'); } } catch { /* reintenta luego */ }
      }
      try {
        const xs = await pedirEstados(cache.filter((x) => x.synced).map((x) => x.id));
        if (xs?.length) { const c = await fusionarEstados(xs); if (c) partes.push(`${c === 1 ? '1 respuesta nueva' : `${c} respuestas nuevas`} de la municipalidad.`); }
      } catch { /* sin endpoint o sin red */ }
      try {
        const pend = (await leerCartas()).filter((c) => !c.synced);
        const ok = await subirCartas(pend.map(({ id, nombre, para, mensaje, zona, ts, deviceId }) => ({ id, nombre, para, mensaje, zona, ts, deviceId })), deviceId());
        if (ok?.length) { await marcarCartasSubidas(ok); partes.push(T.cartasSubidas(ok.length)); }
      } catch { /* sin endpoint de cartas o sin red */ }
      try {
        const xs = await pedirAvisos();
        if (xs?.length) { const n = (await recibirAvisos(xs, 'red')).length; if (n) partes.push(T.avisosNuevos(n)); }
      } catch { /* sin endpoint de avisos (p. ej. Cloudflare) o sin red */ }
      syncTxt = partes.join(' ') || (manual ? 'Todo al día.' : syncTxt);
      await recargar();
    })().finally(() => { enCurso = null; if (otraVez) { otraVez = false; void sincronizar(); } });
    return enCurso;
  }

  // ---------- intercambiar: mi QR arriba + cámara abajo, en un solo paso ----------
  let frames: string[] = [];
  let fi = 0;
  let timer: number | undefined;
  let stream: MediaStream | null = null;
  let camara: 'user' | 'environment' = 'user'; // celulares frente a frente: la cámara frontal mira al otro
  let reasm = new Reassembler();
  let vistos = new Set<string>();
  let recibidos = 0, estadosRecibidos = 0, cartasRecibidas = 0, completo = false;
  const stats: ScanStats = { frames: 0, engine: 'jsQR' };

  async function abrirIntercambio() {
    reasm = new Reassembler(); vistos = new Set(); recibidos = 0; estadosRecibidos = 0; cartasRecibidas = 0; completo = false;
    $('pb-listo').hidden = true; $('pb-prog').hidden = true; raiz.dataset.intercambio = '';
    cache = await all();
    estadosMap = await leerEstados();
    const recs: Observation[] = cache.map(({ source, receivedAt, synced, syncedAt, ...o }) => o);
    frames = encodeForQR(recs).fragments;
    const ye = codificarEstadosQR([...estadosMap.values()]);
    if (ye) frames.push(ye);
    for (const a of avisosParaQR(await leerAvisos())) frames.push(codificarAvisoQR(a)); // la respuesta de la municipalidad sigue la cadena
    frames.push(...codificarCartasQR(cartasParaQR(await leerCartas()))); // «Estoy bien»: primero las mías, luego las más recientes
    fi = 0;
    $('pb-qr').dataset.frames = String(frames.length);
    await dibujar(recs.length);
    clearInterval(timer);
    if (frames.length > 1) timer = window.setInterval(() => { fi = (fi + 1) % frames.length; dibujar(recs.length); }, 650);
    await encenderCamara();
  }
  async function dibujar(n: number) {
    if (vista !== 'intercambiar' || !frames.length) return;
    const c = $<HTMLCanvasElement>('pb-qr');
    const w = Math.min(250, Math.max(180, (raiz.clientWidth || innerWidth) - 140)); // QR y cámara a la vista sin desplazar (412×915)
    await QRCode.toCanvas(c, [{ data: frames[fi], mode: 'alphanumeric' }], { errorCorrectionLevel: 'M', margin: 3, width: w, color: { dark: '#000000', light: '#ffffff' } });
    c.dataset.frame = String(fi + 1);
    $('pb-qr-info').textContent = T.miCodigoInfo(n, fi + 1, frames.length);
  }
  async function encenderCamara() {
    const v = $<HTMLVideoElement>('pb-video');
    const txt = $('pb-cam-txt');
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
    if (!navigator.mediaDevices?.getUserMedia) { txt.textContent = T.camaraNo('este navegador no da la cámara; ¿falta HTTPS?'); $('pb-leer-foto').hidden = false; return; }
    txt.textContent = T.camaraIniciando;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: camara }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (vista !== 'intercambiar') { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      v.srcObject = s; v.setAttribute('playsinline', ''); v.muted = true;
      v.dataset.espejo = String(camara === 'user');
      await v.play();
      txt.textContent = T.camaraLista;
      const actual = s;
      scanLoop(v, leer, stats, () => stream === actual);
    } catch (e) {
      txt.textContent = T.camaraNo((e as Error).name || 'error');
      $('pb-leer-foto').hidden = false;
    }
  }
  $('pb-girar').onclick = () => { camara = camara === 'user' ? 'environment' : 'user'; encenderCamara(); };
  function cerrarIntercambio() {
    clearInterval(timer); timer = undefined;
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
    $<HTMLVideoElement>('pb-video').srcObject = null;
  }
  async function leer(s: string) {
    if (vistos.has(s)) return;
    vistos.add(s);
    const txt = $('pb-cam-txt');
    if (esCodigoCartas(s)) {
      try {
        const cs = decodificarCartasQR(s);
        const buenas = (await Promise.all(cs.map(async (c) => ((await verificarId(c)) ? c : null)))).filter((c): c is Carta => !!c);
        const nuevas = await guardarCartas(buenas.map((c) => ({ ...c, via: 'qr' as const, synced: false, recibidoAt: Date.now() })));
        cartasRecibidas += nuevas.length;
        if (nuevas.length) $('pb-estados-txt').textContent = T.cartasRecibidas(cartasRecibidas);
      } catch { vistos.delete(s); txt.textContent = T.codigoDanado; }
      return;
    }
    if (esCodigoAviso(s)) {
      try {
        const a = decodificarAvisoQR(s);
        const nuevos = await recibirAvisos([a], 'qr');
        if (nuevos.length) { $('pb-estados-txt').textContent = T.avisoRecibidoQr; await recargar(); }
        else if (!(await verificarAviso(a, claveAvisos()))) $('pb-estados-txt').textContent = T.avisoSinFirma;
      } catch { vistos.delete(s); txt.textContent = T.codigoDanado; }
      return;
    }
    if (esCodigoEstados(s)) {
      try {
        const c = await fusionarEstados(decodificarEstadosQR(s));
        estadosRecibidos += c;
        if (c) { $('pb-estados-txt').textContent = T.estadosRecibidos(estadosRecibidos); await recargar(); }
      } catch { vistos.delete(s); txt.textContent = T.codigoDanado; }
      return;
    }
    const r = reasm.add(s);
    if (r.status === 'ignored') { vistos.delete(s); txt.textContent = T.noEsYaku; return; }
    if (r.status === 'error') { txt.textContent = T.codigoDanado; return; }
    if (r.status === 'progress') {
      if (r.duplicate && r.have >= r.n) return;
      $('pb-prog').hidden = false;
      $('pb-prog-bar').style.width = `${Math.round((100 * r.have) / r.n)}%`;
      txt.textContent = T.recibiendo(r.have, r.n);
      return;
    }
    $('pb-prog').hidden = false; $('pb-prog-bar').style.width = '100%';
    const res = await putIfAbsent(r.records, 'qr');
    recibidos += res.added; completo = true;
    raiz.dataset.intercambio = 'listo';
    const l = $('pb-listo');
    l.hidden = false; l.textContent = T.listo(recibidos);
    txt.textContent = T.camaraLista;
    await recargar();
    void enviarYa();
  }
  $<HTMLInputElement>('pb-leer-in').onchange = async (e) => {
    const inp = e.target as HTMLInputElement;
    for (const f of [...(inp.files ?? [])]) { const s = await decodeImageFile(f); if (s) await leer(s); }
    inp.value = '';
  };
  $('pb-terminar').onclick = () => ir('lista');

  // ---------- «Estoy bien» ----------
  const fb = () => $<HTMLFormElement>('pb-bien-form');
  const campoB = (n: string) => fb().elements.namedItem(n) as HTMLInputElement;
  campoB('nombre').value = ls.get(CLAVE_BIEN_NOMBRE) ?? '';
  campoB('mensaje').onfocus = () => { if (!campoB('mensaje').value.trim()) campoB('mensaje').value = T.bienPlantilla(campoB('nombre').value.trim()); };
  fb().onsubmit = async (ev) => {
    ev.preventDefault();
    const st = $('pb-bien-estado');
    if (!campoB('consent').checked) { st.textContent = T.bienFaltaConsent; return; }
    try {
      const c = await crearCarta({ nombre: campoB('nombre').value, para: campoB('para').value, mensaje: campoB('mensaje').value, zona: campoB('zona').value, ts: Date.now() / 1000, deviceId: deviceId() });
      await guardarCartas([{ ...c, via: 'local', synced: false, recibidoAt: Date.now() }]);
      ls.set(CLAVE_BIEN_NOMBRE, c.nombre);
      campoB('mensaje').value = ''; campoB('para').value = '';
      st.textContent = T.bienGuardado; aviso('💚 ' + T.bienGuardado);
      await renderBien();
      sincronizar();
    } catch (e) { st.textContent = (e as Error).message; }
  };
  function tarjetaCarta(c: CartaGuardada): string {
    const t = textoCarta(c);
    return `<li class="pb-carta" data-id="${esc(c.id)}" data-via="${c.via}"><b>${esc(t.titulo)}</b><p>${esc(c.mensaje)}</p><div class="pb-aviso-det">${esc(t.detalle)}</div><small class="pb-meta">${esc(t.origen)}</small></li>`;
  }
  async function renderBien() {
    const todas = await leerCartas();
    const mias = todas.filter((c) => c.via === 'local');
    $('pb-bien-mias').innerHTML = mias.length ? mias.map(tarjetaCarta).join('') : '';
    $('pb-bien-mias-tit').hidden = !mias.length;
    const otras = todas.filter((c) => c.via !== 'local').length;
    $('pb-bien-llevo').textContent = otras ? T.bienLlevo(otras) : '';
  }
  $<HTMLFormElement>('pb-bien-buscar').onsubmit = async (ev) => {
    ev.preventDefault();
    const q = $<HTMLInputElement>('pb-bien-q').value;
    const res = $('pb-bien-res');
    const locales = buscarCartas(await leerCartas(), q);
    let enRed: CartaGuardada[] = [];
    if (navigator.onLine) {
      try {
        const xs = await buscarCartasServidor(q);
        if (xs) enRed = (await Promise.all(xs.map(async (c): Promise<CartaGuardada | null> => ((await verificarId(c)) ? { ...c, via: 'red', synced: true, recibidoAt: Date.now() } : null)))).filter((c): c is CartaGuardada => !!c);
      } catch { /* sin red */ }
    }
    const vistas = new Set(locales.map((c) => c.id));
    const todas = [...locales, ...enRed.filter((c) => !vistas.has(c.id))].sort((a, b) => b.ts - a.ts);
    res.innerHTML = todas.length ? todas.map(tarjetaCarta).join('') : `<li class="pb-vacio">${esc(q.trim().length < 3 ? T.bienBuscarAyuda : T.bienSinResultados)}</li>`;
  };

  // ---------- avisos breves ----------
  let tAviso: number | undefined;
  function aviso(s: string) {
    const t = $('pb-toast');
    t.textContent = s; t.hidden = false;
    clearTimeout(tAviso); tAviso = window.setTimeout(() => (t.hidden = true), 3500);
  }

  // ---------- arranque ----------
  // La app técnica importa los enlaces #p= al arrancar (src/main.ts); recargamos cuando termina.
  new MutationObserver(() => { if (document.body.dataset.ready === '1') recargar(); }).observe(document.body, { attributes: true, attributeFilter: ['data-ready'] });
  addEventListener('hashchange', () => setTimeout(recargar, 300));
  setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') sincronizar(); }, 20_000); // con red, los avisos de la municipalidad llegan en ≤ 20 s
  (window as any).__yakuPoblador = {
    estado: () => ({
      vista, total: cache.length, mios: cache.filter((r) => r.source === 'local').length, llevo: cache.filter((r) => r.source !== 'local').length,
      pendientes: cache.filter((r) => !r.synced).length, frames: frames.length, recibidos, estadosRecibidos, completo, lector: stats.engine,
      cartasRecibidas, estados: Object.fromEntries(estadosMap), avisos: avisosLista.map((a) => ({ id: a.id, accion: a.accion, verificado: a.verificado, via: a.via })), fotos: [...fotosMap.values()].map((f) => ({ id: f.id, bytes: f.bytes, w: f.w, h: f.h, subida: f.subida })),
    }),
    sincronizar: () => sincronizar(true),
  };
  ir(/^\/estoy-bien\/?$/.test(location.pathname) ? 'bien' : 'reportar');
  recargar().then(() => { raiz.dataset.listo = '1'; sincronizar(); });
}

function plantilla(): string {
  const botones = BOTONES.map((b) => `<button type="button" class="pb-tipo${b.riesgoVida ? ' pb-vida' : ''}" data-tipo="${b.id}">${svg(b.icono)}<span>${esc(b.texto)}</span></button>`).join('');
  const grav = ([1, 2, 3] as const).map((s) => `<label class="pb-g s${s}"><input type="radio" name="pb-sev" value="${s}"><span>${esc(T.grav[s])}</span></label>`).join('');
  return `
  <header class="pb-top">
    <div class="pb-marca">${svg(ICONOS.gota, 'pb-logo')}<b>${esc(T.marca)}</b><small>${esc(T.modo)}</small></div>
    <div class="pb-chips"><span class="pb-pend" id="pb-pend" hidden></span><span class="pb-red" id="pb-red" role="status" aria-live="polite"></span></div>
  </header>
  <div class="pb-consent" id="pb-consent" hidden><p>${esc(T.consentimiento)}</p><button type="button" class="pb-btn pb-btn-sec" id="pb-consent-ok">${esc(T.entendido)}</button></div>
  <main class="pb-main" id="pb-main">
    <section data-v="reportar">
      <h1 tabindex="-1">${esc(T.queVes)}</h1>
      <p class="pb-ayuda">${esc(T.queVesAyuda)}</p>
      <div class="pb-grid">${botones}</div>
    </section>

    <section data-v="aviso" hidden>
      <h1 tabindex="-1" class="pb-peligro">${esc(T.avisoTitulo)}</h1>
      <p class="pb-aviso-tipo" id="pb-aviso-tipo"></p>
      <p class="pb-aviso-txt">${esc(T.avisoTexto)}</p>
      <a class="pb-btn pb-btn-pel" href="tel:116" id="pb-tel-116">${esc(T.llamar116)}</a>
      <a class="pb-btn pb-btn-pel" href="tel:105" id="pb-tel-105">${esc(T.llamar105)}</a>
      <button type="button" class="pb-btn pb-btn-sec" id="pb-aviso-seguir">${esc(T.seguirReporte)}</button>
    </section>

    <section data-v="detalle" hidden>
      <form id="pb-form" novalidate>
        <h1 tabindex="-1" class="pb-d-tit"><span id="pb-d-ico"></span><span id="pb-d-tipo"></span></h1>
        <div class="pb-loc" id="pb-loc"><span id="pb-loc-txt" aria-live="polite"></span><button type="button" class="pb-link" id="pb-gps">${esc(T.reintentarGps)}</button></div>
        <div class="pb-foto">
          <label class="pb-btn pb-btn-sec" id="pb-foto-btn">${svg(ICONOS.camara)}<span id="pb-foto-lbl">${esc(T.foto)}</span><input type="file" id="pb-foto-in" accept="image/*" capture="environment" class="pb-sr"></label>
          <img id="pb-foto-img" class="pb-foto-img" alt="Foto del reporte" hidden>
          <p id="pb-foto-txt" class="pb-ayuda" aria-live="polite"></p>
          <button type="button" class="pb-link" id="pb-foto-quitar" hidden>${esc(T.fotoQuitar)}</button>
        </div>
        <fieldset class="pb-grav"><legend>${esc(T.gravedad)}</legend>${grav}</fieldset>
        <label class="pb-campo"><span>${esc(T.nota)}</span><textarea id="pb-nota" rows="2" maxlength="90" placeholder="${esc(T.notaAyuda)}"></textarea></label>
        <p class="pb-pie">${esc(PIE_LEGAL)}</p>
        <p id="pb-guardar-txt" class="pb-ayuda" aria-live="polite"></p>
        <div class="pb-acciones">
          <button type="submit" class="pb-btn pb-btn-pri" id="pb-guardar">${esc(T.guardar)}</button>
          <button type="button" class="pb-btn pb-btn-ter" id="pb-cancelar">${esc(T.cancelar)}</button>
        </div>
      </form>
    </section>

    <section data-v="intercambiar" hidden>
      <h1 tabindex="-1">${esc(T.intercambiarTitulo)}</h1>
      <p class="pb-ayuda">${esc(T.intercambiarAyuda)}</p>
      <div class="pb-qr"><h2>${esc(T.miCodigo)}</h2><canvas id="pb-qr" role="img" aria-label="Mi código QR con los reportes que llevo"></canvas><p id="pb-qr-info" class="pb-ayuda"></p></div>
      <div class="pb-cam">
        <h2>${esc(T.camaraOtro)}</h2>
        <div class="pb-visor"><video id="pb-video" muted playsinline></video><i class="e1"></i><i class="e2"></i><i class="e3"></i><i class="e4"></i>
          <button type="button" class="pb-girar" id="pb-girar" aria-label="Cambiar de cámara">⟲</button></div>
        <div class="pb-prog" id="pb-prog" hidden><div id="pb-prog-bar"></div></div>
        <p id="pb-cam-txt" role="status" aria-live="polite"></p>
        <p id="pb-listo" class="pb-listo" role="status" hidden></p>
        <p id="pb-estados-txt" class="pb-ayuda" aria-live="polite"></p>
        <label class="pb-btn pb-btn-sec" id="pb-leer-foto" hidden>${esc(T.leerFoto)}<input type="file" id="pb-leer-in" accept="image/*" class="pb-sr"></label>
      </div>
      <p class="pb-ayuda">${esc(T.sinFotoEnQr)}</p>
      <p class="pb-pie">${esc(PIE_LEGAL)}</p>
      <button type="button" class="pb-btn pb-btn-pri" id="pb-terminar">${esc(T.terminar)}</button>
    </section>

    <section data-v="bien" hidden>
      <h1 tabindex="-1">💚 ${esc(T.bienTitulo)}</h1>
      <p class="pb-ayuda">${esc(T.bienAyuda)}</p>
      <form class="pb-bien" id="pb-bien-form" novalidate>
        <label>${esc(T.bienNombre)}<input name="nombre" maxlength="40" autocomplete="name" required></label>
        <label>${esc(T.bienPara)}<input name="para" maxlength="40" placeholder="${esc(T.bienParaEj)}"></label>
        <label>${esc(T.bienMensaje)}<textarea name="mensaje" maxlength="200" rows="3" required></textarea></label>
        <label>${esc(T.bienZona)}<input name="zona" maxlength="40" placeholder="${esc(T.bienZonaEj)}"></label>
        <label class="pb-check"><input type="checkbox" name="consent"> <span>${esc(T.bienConsent)}</span></label>
        <button type="submit" class="pb-btn pb-btn-bien">${esc(T.bienGuardar)}</button>
        <p id="pb-bien-estado" class="pb-ayuda" aria-live="polite"></p>
      </form>
      <h2 id="pb-bien-mias-tit" hidden>${esc(T.bienMios)}</h2>
      <ul class="pb-cartas" id="pb-bien-mias"></ul>
      <h2>${esc(T.bienBuscar)}</h2>
      <form class="pb-bien-buscar" id="pb-bien-buscar"><input id="pb-bien-q" maxlength="40" placeholder="Ej.: Rosa Chunga" aria-label="${esc(T.bienBuscar)}"><button type="submit" class="pb-btn pb-btn-sec pb-chico">${esc(T.bienBuscarBtn)}</button></form>
      <p class="pb-ayuda" id="pb-bien-llevo"></p>
      <ul class="pb-cartas" id="pb-bien-res"></ul>
      <p class="pb-pie">${esc(PIE_LEGAL)}</p>
    </section>

    <section data-v="lista" hidden>
      <div class="pb-lista-top"><h1 tabindex="-1">${esc(T.navLista)}</h1><button type="button" class="pb-btn pb-btn-sec pb-chico" id="pb-actualizar">${esc(T.actualizar)}</button></div>
      <p id="pb-sync-txt" class="pb-ayuda" aria-live="polite"></p>
      <h2>${esc(T.avisosTitulo)} (<span id="pb-n-avisos">0</span>)</h2>
      <ul class="pb-avisos" id="pb-avisos"></ul>
      <h2>${esc(T.misReportes)} (<span id="pb-n-mios">0</span>)</h2>
      <ul class="pb-reps" id="pb-mios"></ul>
      <h2>${esc(T.queLlevo)} (<span id="pb-n-llevo">0</span>)</h2>
      <ul class="pb-reps" id="pb-llevo"></ul>
      <p class="pb-pie">${esc(PIE_LEGAL)}</p>
      <a class="pb-tecnica" href="/app">${esc(T.vistaTecnica)}</a>
    </section>
  </main>
  <div class="pb-toast" id="pb-toast" role="status" aria-live="polite" hidden></div>
  <nav class="pb-nav" aria-label="Secciones">
    <button type="button" data-ir="reportar">${svg(ICONOS.reportar)}<span>${esc(T.navReportar)}</span></button>
    <button type="button" data-ir="bien">${svg(ICONOS.bien)}<span>${esc(T.navBien)}</span></button>
    <button type="button" data-ir="intercambiar">${svg(ICONOS.intercambiar)}<span>${esc(T.navIntercambiar)}</span></button>
    <button type="button" data-ir="lista">${svg(ICONOS.lista)}<span>${esc(T.navLista)}</span><b class="pb-nav-n" id="pb-nav-n"></b></button>
  </nav>`;
}
