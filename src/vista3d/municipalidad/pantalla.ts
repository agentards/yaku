// «Pantalla de la municipalidad en vivo» (?vista=municipalidad): pantalla grande 16:9 con el mapa 3D real de
// Piura (./escena.ts), que consulta GET /api/reports cada 3 s y, cuando llega un reporte NUEVO, vuela hasta él,
// suelta un marcador pulsante, suena un aviso corto y muestra una tarjeta grande. Solo lectura: nunca escribe
// en el servidor. «Visto» marca solo en esta pantalla (demo; el acuse real es un siguiente paso).
import * as maplibregl from 'maplibre-gl';
import { OBS_LABELS, type ObsType } from '../../codec';
import { crearEscena, type EscenaYaku3D } from '../escena';
import { soportaWebGL2 } from '../conmutador';
import { esc } from '../ui/formato';
import type { CentroPoblado } from '../ui/contrato';
import { DetectorNuevos, leerRespuesta, llegoHace, masNuevoPrimero, type ReporteApi } from './deteccion';
import './municipalidad.css';

export const esVistaMunicipalidad = (search: string) => new URLSearchParams(search).get('vista') === 'municipalidad';

export const INTERVALO_MS = 3000;
const ENDPOINT = '/api/reports?limit=50';
const CLAVE_VISTOS = 'yaku-muni-vistos';

const hora = (ms: number, seg = false) => new Date(ms).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', ...(seg ? { second: '2-digit' } : {}) });
const tipoTxt = (t: string) => OBS_LABELS[t as ObsType] ?? 'Otro';
const sevTxt = (s: number) => (Number.isFinite(s) ? `Severidad ${s} de 3` : 'Severidad sin dato');

function leerVistos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE_VISTOS) || '[]')); } catch { return new Set(); }
}
function guardarVistos(v: Set<string>) {
  try { localStorage.setItem(CLAVE_VISTOS, JSON.stringify([...v].slice(-500))); } catch { /* sin almacenamiento: queda en memoria */ }
}

/** Aviso corto (dos tonos, ~0,4 s) con WebAudio: sin archivos ni red. El navegador exige un clic antes de sonar. */
class Aviso {
  private ctx: AudioContext | null = null;
  sonados = 0;
  activo = () => this.ctx?.state === 'running';
  activar() {
    try {
      this.ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
      return this.ctx.resume().then(() => this.activo()).catch(() => false);
    } catch { return Promise.resolve(false); }
  }
  sonar() {
    this.sonados++;
    const c = this.ctx;
    if (!c || c.state !== 'running') return false;
    const t0 = c.currentTime;
    for (const [f, dt] of [[880, 0], [1320, 0.18]] as const) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.2);
      o.connect(g).connect(c.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 0.22);
    }
    return true;
  }
}

export function arrancar() {
  document.body.classList.add('vista-muni');
  document.title = 'Municipalidad · reportes de campo';
  const abierto = Date.now();
  const raiz = document.createElement('div');
  raiz.className = 'muni';
  raiz.innerHTML = `
    <header class="muni-top">
      <div class="muni-logo"><svg viewBox="0 0 22 14" aria-hidden="true"><path d="M1 12 7 4l4 5 3-3 7 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>Yaku</div>
      <h1>Municipalidad · reportes de campo</h1>
      <span class="muni-en-vivo" data-estado="iniciando"><i aria-hidden="true"></i><span class="muni-estado-txt">Conectando…</span></span>
      <button type="button" class="muni-sonido" aria-pressed="false">Activar sonido</button>
    </header>
    <main class="muni-cuerpo">
      <section class="muni-mapa" aria-label="Mapa 3D de Piura">
        <div class="muni-escena"></div>
        <div class="muni-aviso-mapa" hidden></div>
        <article class="muni-tarjeta" hidden aria-live="assertive"></article>
      </section>
      <aside class="muni-col" aria-label="Últimos reportes">
        <div class="muni-contador">
          <div><b class="muni-n">0</b><span>reportes nuevos desde las ${esc(hora(abierto))}</span></div>
          <div class="muni-sinver"><b class="muni-n-sinver">0</b><span>sin marcar «Visto»</span></div>
        </div>
        <p class="muni-previos"></p>
        <ol class="muni-lista" aria-live="polite"></ol>
      </aside>
    </main>
    <footer class="muni-pie">Reportes ciudadanos <b>NO VERIFICADOS</b>: no son alertas oficiales. «Visto» solo marca en esta pantalla (demo; el acuse de recibo real es un siguiente paso).</footer>`;
  document.body.append(raiz);
  const $ = <T extends HTMLElement>(s: string) => raiz.querySelector(s) as T;
  const estadoEl = $<HTMLElement>('.muni-en-vivo'), estadoTxt = $<HTMLElement>('.muni-estado-txt');
  const tarjeta = $<HTMLElement>('.muni-tarjeta'), lista = $<HTMLOListElement>('.muni-lista');

  // ---------- mapa 3D (degrada a solo lista si no hay WebGL 2) ----------
  let escena: EscenaYaku3D | null = null;
  if (soportaWebGL2()) {
    try { escena = crearEscena($('.muni-escena')); } catch { escena = null; }
  }
  if (!escena) {
    const a = $<HTMLElement>('.muni-aviso-mapa');
    a.hidden = false;
    a.textContent = 'Este equipo no puede dibujar el mapa 3D (sin WebGL 2). La lista de reportes sigue funcionando.';
  }
  let marcador: maplibregl.Marker | null = null;

  // ---------- estado ----------
  const det = new DetectorNuevos();
  const recibidos: ReporteApi[] = [];
  const vistos = leerVistos();
  const animados = new Set<string>();
  const aviso = new Aviso();
  let actual: ReporteApi | null = null;
  let consultas = 0, errores = 0, enCurso = false, ultimaOk = 0;

  const btnSonido = $<HTMLButtonElement>('.muni-sonido');
  const pintarSonido = () => {
    const on = aviso.activo();
    btnSonido.setAttribute('aria-pressed', String(on));
    btnSonido.textContent = on ? 'Sonido activado' : 'Activar sonido';
  };
  btnSonido.onclick = () => aviso.activar().then(pintarSonido);
  // Cualquier clic en la pantalla también habilita el sonido (política de reproducción del navegador).
  raiz.addEventListener('pointerdown', () => { if (!aviso.activo()) aviso.activar().then(pintarSonido); }, { once: true });

  function marcarVisto(id: string) {
    vistos.add(id); guardarVistos(vistos);
    pintarLista();
    if (actual?.id === id) pintarTarjeta();
  }

  function pintarTarjeta() {
    const r = actual;
    tarjeta.hidden = !r;
    if (!r) return;
    const visto = vistos.has(r.id);
    tarjeta.dataset.id = r.id;
    tarjeta.innerHTML = `
      <div class="muni-t-cab"><span class="muni-nv">NO VERIFICADO</span><span class="muni-t-hace" data-recibido="${r.received_at}">${esc(llegoHace(r.received_at))}</span>
        <button type="button" class="muni-cerrar" aria-label="Cerrar tarjeta">×</button></div>
      <h2 class="muni-t-tipo">${esc(tipoTxt(r.type))}</h2>
      <p class="muni-t-sev muni-sev${esc(r.severity)}">${esc(sevTxt(r.severity))} <small>(la marca quien reporta)</small></p>
      <dl class="muni-t-datos">
        <div><dt>Hora del reporte</dt><dd>${Number.isFinite(r.ts) && r.ts > 0 ? esc(hora(r.ts * 1000)) : '—'} <small>reloj del celular</small></dd></div>
        <div><dt>Llegó al servidor</dt><dd>${esc(hora(r.received_at, true))}</dd></div>
        <div><dt>Ubicación</dt><dd class="mono">${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}</dd></div>
      </dl>
      ${r.note?.trim() ? `<p class="muni-t-nota">«${esc(r.note.trim())}»</p>` : ''}
      <div class="muni-t-pie"><span>Reporte ciudadano de campo. No es una alerta oficial.</span>
        <button type="button" class="muni-visto" ${visto ? 'disabled' : ''}>${visto ? '✓ Visto' : 'Visto'} <small>demo</small></button></div>`;
    (tarjeta.querySelector('.muni-visto') as HTMLButtonElement).onclick = () => marcarVisto(r.id);
    (tarjeta.querySelector('.muni-cerrar') as HTMLButtonElement).onclick = () => { actual = null; pintarTarjeta(); pintarLista(); };
  }

  function pintarLista() {
    $<HTMLElement>('.muni-n').textContent = String(recibidos.length);
    $<HTMLElement>('.muni-n-sinver').textContent = String(recibidos.filter((r) => !vistos.has(r.id)).length);
    $<HTMLElement>('.muni-previos').textContent = det.sembrado
      ? (recibidos.length ? '' : `Esperando reportes nuevos… (${det.previos} reportes anteriores a esta pantalla no se muestran)`)
      : 'Conectando con el servidor…';
    lista.innerHTML = recibidos.map((r) => {
      const visto = vistos.has(r.id);
      // Solo la primera vez que se dibuja un reporte entra animado: repintar cada 3 s no debe parpadear.
      const entra = !animados.has(r.id);
      animados.add(r.id);
      return `<li data-id="${esc(r.id)}" class="${visto ? 'visto' : ''}${actual?.id === r.id ? ' actual' : ''}${entra ? ' entra' : ''}">
        <button type="button" class="muni-item" title="Ver en el mapa"><b>${esc(tipoTxt(r.type))}</b>
          <span class="muni-i-meta"><span class="muni-nv">NO VERIFICADO</span> ${esc(sevTxt(r.severity))} · ${esc(hora(r.received_at, true))}</span>
          <span class="muni-i-hace" data-recibido="${r.received_at}">${esc(llegoHace(r.received_at))}</span></button>
        <button type="button" class="muni-visto" ${visto ? 'disabled' : ''}>${visto ? '✓ Visto' : 'Visto'} <small>demo</small></button>
      </li>`;
    }).join('');
    lista.querySelectorAll('li').forEach((li) => {
      const r = recibidos.find((x) => x.id === li.dataset.id)!;
      (li.querySelector('.muni-item') as HTMLButtonElement).onclick = () => enfocar(r);
      (li.querySelector('.muni-visto') as HTMLButtonElement).onclick = () => marcarVisto(r.id);
    });
  }

  function pintarPuntos() {
    escena?.setReportes(recibidos.map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, type: r.type, severity: r.severity, note: r.note ?? '', state: 'NO VERIFICADO' })));
  }

  /** Vuela al reporte, suelta el marcador pulsante y muestra la tarjeta. */
  function enfocar(r: ReporteApi) {
    actual = r;
    pintarTarjeta(); pintarLista();
    tarjeta.style.animation = 'none'; void tarjeta.offsetWidth; tarjeta.style.animation = ''; // reanima la entrada
    if (!escena) return;
    const e = escena;
    e.listo.then(() => {
      if (actual?.id !== r.id) return;
      marcador?.remove();
      const el = document.createElement('div');
      el.className = 'muni-pulso';
      el.innerHTML = '<i></i><i></i><b></b>';
      marcador = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([r.lon, r.lat]).addTo(e.map);
      // La cámara solo necesita lon/lat del destino (ver escena.volarA).
      void e.volarA({ lon: r.lon, lat: r.lat } as CentroPoblado);
    });
  }

  function pintarEstado(estado: 'ok' | 'error' | 'sin-red') {
    estadoEl.dataset.estado = estado;
    estadoTxt.textContent = estado === 'ok' ? `En vivo · consulta cada 3 s · ${hora(ultimaOk, true)}`
      : estado === 'sin-red' ? 'Sin red · reintentando cada 3 s'
      : 'Sin respuesta del servidor · reintentando cada 3 s';
  }

  async function consultar() {
    if (enCurso) return;
    enCurso = true;
    consultas++;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), INTERVALO_MS - 300);
    try {
      const res = await fetch(ENDPOINT, { method: 'GET', cache: 'no-store', headers: { accept: 'application/json' }, signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const filas = leerRespuesta(await res.json());
      if (!filas) throw new Error('respuesta inesperada');
      const nuevos = det.procesar(filas);
      ultimaOk = Date.now();
      pintarEstado('ok');
      if (nuevos.length) {
        recibidos.push(...nuevos);
        recibidos.sort(masNuevoPrimero);
        pintarPuntos();
        aviso.sonar();
        enfocar(nuevos[0]); // el más nuevo; los demás quedan en la columna
      } else pintarLista();
    } catch {
      errores++;
      pintarEstado(navigator.onLine ? 'error' : 'sin-red');
      pintarLista();
    } finally { clearTimeout(to); enCurso = false; }
  }

  // «llegó hace N s» al segundo, sin repintar todo.
  setInterval(() => raiz.querySelectorAll<HTMLElement>('[data-recibido]').forEach((n) => (n.textContent = llegoHace(+n.dataset.recibido!))), 1000);
  const ciclo = () => { void consultar().finally(() => setTimeout(ciclo, INTERVALO_MS)); };
  pintarLista();
  ciclo();

  (window as any).__yakuMuni = {
    escena: () => escena,
    estado: () => ({ sembrado: det.sembrado, previos: det.previos, nuevos: recibidos.map((r) => r.id), actual: actual?.id ?? null, consultas, errores, avisos: aviso.sonados, vistos: [...vistos], fase: (window as any).__yakuEscena?.cam?.fase ?? null }),
  };
  return raiz;
}
