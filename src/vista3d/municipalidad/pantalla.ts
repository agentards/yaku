// «Pantalla de la municipalidad en vivo» (?vista=municipalidad): pantalla grande 16:9 con el mapa 3D real de
// Piura (../escena.ts) que consulta GET /api/incidentes (mismo origen, servidor local) cada 3 s. Cada incidente
// agrupa los reportes de varios vecinos sobre el mismo hecho: tarjeta con respaldo 0–100 y contador
// («4 vecinos · 2 fotos · primer reporte 21:03»), galería de fotos, prioridad (vida > severidad > respaldo) y el
// flujo de estados con PIN (Nuevo → En revisión → Validado/Descartado → Acción → Atendido). Un incidente nuevo
// hace volar la cámara; cuando otro vecino coincide con uno existente, el contador se anima.
// Textos, respaldo y prioridad: producto/decision-confianza.md (vía ./textos.ts).
import * as maplibregl from 'maplibre-gl';
import { crearEscena, type EscenaYaku3D } from '../escena';
import { soportaWebGL2 } from '../conmutador';
import { esc } from '../ui/formato';
import type { CentroPoblado } from '../ui/contrato';
import { llegoHace } from './deteccion';
import { cerrado, contadorTxt, DetectorIncidentes, hhmm, plural, porPrioridad, siguientes, type Incidente } from './incidentes';
import { cambiarEstado, ErrorApi, fotoUrl, llevarA, traerIncidentes, type Fuente, type Operador } from './api';
import { ACCION_TXT, ACCIONES, DETALLE, ESTADO, estadoChip, esVerde, MOTIVOS_DESCARTE, motivoDescarteTxt, ORDEN_TXT, PIE_LEGAL, PIE_PANEL, respaldoTxt, RIESGO_VIDA, ROTULO_VECINAL, tipoTxt, VIDA_PANEL, vecinos, type Accion, type Estado } from './textos';
import { desgloseHtml, pendientesHtml, rodillo } from './piezas';
import './municipalidad.css';

export const esVistaMunicipalidad = (search: string) => new URLSearchParams(search).get('vista') === 'municipalidad';

export const INTERVALO_MS = 3000;
const CLAVE_QUIEN = 'yaku-muni-operador';
const ANIM_MS = 1800;

const hora = hhmm;
const sevTxt = (s: number) => `Severidad máx. ${s} de 3`;
const estadoTxt = (i: Incidente) => estadoChip(i.estado, i.accion);
const claseEstado = (i: Incidente) => `muni-est muni-est-${i.estado}${esVerde(i.estado) ? ' municipal' : ''}`;
const firma = (i: Incidente) => [i.id, i.personas, i.reportes, i.nFotos, i.fotos.join(','), i.puntaje, i.estado, i.accion, i.motivo, i.historial.length, i.ultimo, i.fotosPendientes, i.nuevosTrasDescarte, i.nivel].join('|');

/** Aviso corto con WebAudio: sin archivos ni red. El navegador exige un clic antes de sonar. */
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
  /** Dos tonos = incidente nuevo; uno = otro vecino coincide. */
  sonar(tonos: readonly (readonly [number, number])[] = [[880, 0], [1320, 0.18]]) {
    this.sonados++;
    const c = this.ctx;
    if (!c || c.state !== 'running') return false;
    const t0 = c.currentTime;
    for (const [f, dt] of tonos) {
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
  const raiz = document.createElement('div');
  raiz.className = 'muni';
  raiz.innerHTML = `
    <header class="muni-top">
      <div class="muni-logo"><svg viewBox="0 0 22 14" aria-hidden="true"><path d="M1 12 7 4l4 5 3-3 7 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>Yaku</div>
      <h1>Municipalidad · reportes de campo</h1>
      <span class="muni-en-vivo" data-estado="iniciando"><i aria-hidden="true"></i><span class="muni-estado-txt">Conectando…</span></span>
      <button type="button" class="muni-operador" aria-haspopup="dialog">Ingresar PIN</button>
      <button type="button" class="muni-sonido" aria-pressed="false">Activar sonido</button>
    </header>
    <main class="muni-cuerpo">
      <section class="muni-mapa" aria-label="Mapa 3D de Piura">
        <div class="muni-escena"></div>
        <div class="muni-aviso-mapa" hidden></div>
        <article class="muni-tarjeta" hidden aria-live="assertive"></article>
        <div class="muni-avisos" aria-live="polite"></div>
      </section>
      <aside class="muni-col" aria-label="Incidentes por prioridad">
        <div class="muni-contador">
          <div><b class="muni-n">0</b><span>incidentes abiertos</span></div>
          <div><b class="muni-n-personas">0</b><span>vecinos reportan</span></div>
          <div class="muni-sinver"><b class="muni-n-sinver">0</b><span>sin revisar</span></div>
        </div>
        <p class="muni-orden">${esc(ORDEN_TXT)}</p>
        <p class="muni-previos"></p>
        <ol class="muni-lista" aria-live="polite"></ol>
      </aside>
    </main>
    <footer class="muni-pie"><b>${esc(ROTULO_VECINAL)}</b> · ${esc(PIE_LEGAL)} ${esc(PIE_PANEL)}</footer>
    <dialog class="muni-dlg muni-dlg-pin" aria-label="Operador municipal">
      <form method="dialog">
        <h2>Operador municipal</h2>
        <p>Las acciones (revisar, validar, asignar, atender) quedan registradas con tu nombre y la hora.</p>
        <label>Nombre <input name="quien" autocomplete="name" required maxlength="60"></label>
        <label>PIN <input name="pin" type="password" inputmode="numeric" autocomplete="off" required maxlength="32"></label>
        <p class="muni-dlg-error" role="alert"></p>
        <div class="muni-dlg-botones"><button value="cancelar" formnovalidate>Cancelar</button><button value="ok" class="muni-primario">Entrar</button></div>
      </form>
    </dialog>
    <dialog class="muni-dlg muni-dlg-descartar" aria-label="Descartar incidente">
      <form method="dialog">
        <h2>Descartar incidente</h2>
        <label>Motivo <select name="motivo">${MOTIVOS_DESCARTE.map((m) => `<option>${esc(m)}</option>`).join('')}<option value="otro">Otro (escribir)</option></select></label>
        <label>Detalle <input name="detalle" maxlength="140" placeholder="Opcional"></label>
        <div class="muni-dlg-botones"><button value="cancelar" formnovalidate>Cancelar</button><button value="ok" class="muni-peligro">Descartar</button></div>
      </form>
    </dialog>
    <div class="muni-galeria-full" hidden role="dialog" aria-label="Foto del incidente">
      <button type="button" class="muni-gf-cerrar" aria-label="Cerrar foto">×</button>
      <button type="button" class="muni-gf-ant" aria-label="Foto anterior">‹</button>
      <figure><img alt=""><figcaption></figcaption></figure>
      <button type="button" class="muni-gf-sig" aria-label="Foto siguiente">›</button>
    </div>`;
  document.body.append(raiz);
  const $ = <T extends HTMLElement>(s: string) => raiz.querySelector(s) as T;
  const estadoEl = $<HTMLElement>('.muni-en-vivo'), estadoTxtEl = $<HTMLElement>('.muni-estado-txt');
  const tarjeta = $<HTMLElement>('.muni-tarjeta'), lista = $<HTMLOListElement>('.muni-lista'), avisos = $<HTMLElement>('.muni-avisos');
  const dlgPin = $<HTMLDialogElement>('.muni-dlg-pin'), dlgDesc = $<HTMLDialogElement>('.muni-dlg-descartar');

  // ---------- mapa 3D (degrada a solo lista si no hay WebGL 2) ----------
  let escena: EscenaYaku3D | null = null;
  if (soportaWebGL2()) {
    try { escena = crearEscena($('.muni-escena')); } catch { escena = null; }
  }
  if (!escena) {
    const a = $<HTMLElement>('.muni-aviso-mapa');
    a.hidden = false;
    a.textContent = 'Este equipo no puede dibujar el mapa 3D (sin WebGL 2). La lista de incidentes sigue funcionando.';
  }
  let marcador: maplibregl.Marker | null = null;

  // ---------- estado ----------
  const det = new DetectorIncidentes();
  let incidentes: Incidente[] = [];
  let fuente: Fuente = 'incidentes';
  const aviso = new Aviso();
  let actualId: string | null = null, pendiente: Incidente | null = null;
  let operador: Operador | null = null;
  const animados = new Set<string>();
  const desde = new Map<string, { personas: number; fotos: number; hasta: number }>(); // contador que se anima (antes → ahora)
  let totalMostrado: number | null = null;
  const nuevosIds: string[] = [];
  let coincidencias = 0, consultas = 0, errores = 0, enCurso = false, ultimaOk = 0, firmaLista = '', firmaTarjeta = '';
  let galeria: { fotos: string[]; k: number } | null = null;
  const actual = () => incidentes.find((i) => i.id === actualId) ?? null;
  const ocupado = () => dlgPin.open || dlgDesc.open;

  // ---------- sonido ----------
  const btnSonido = $<HTMLButtonElement>('.muni-sonido');
  const pintarSonido = () => {
    const on = aviso.activo();
    btnSonido.setAttribute('aria-pressed', String(on));
    btnSonido.textContent = on ? 'Sonido activado' : 'Activar sonido';
  };
  btnSonido.onclick = () => aviso.activar().then(pintarSonido);
  raiz.addEventListener('pointerdown', () => { if (!aviso.activo()) aviso.activar().then(pintarSonido); }, { once: true });

  // ---------- operador y PIN (el PIN vive solo en memoria de esta pestaña) ----------
  const btnOp = $<HTMLButtonElement>('.muni-operador');
  const pintarOperador = () => { btnOp.textContent = operador ? `Operador: ${operador.quien}` : 'Ingresar PIN'; btnOp.classList.toggle('activo', !!operador); };
  function pedirOperador(error = ''): Promise<Operador | null> {
    const f = dlgPin.querySelector('form')!;
    (f.elements.namedItem('quien') as HTMLInputElement).value = operador?.quien ?? (() => { try { return localStorage.getItem(CLAVE_QUIEN) ?? ''; } catch { return ''; } })();
    (f.elements.namedItem('pin') as HTMLInputElement).value = '';
    $<HTMLElement>('.muni-dlg-error').textContent = error;
    dlgPin.returnValue = '';
    dlgPin.showModal();
    return new Promise((ok) => dlgPin.addEventListener('close', () => {
      if (dlgPin.returnValue !== 'ok') { ok(null); return soltarPendiente(); }
      const quien = (f.elements.namedItem('quien') as HTMLInputElement).value.trim(), pin = (f.elements.namedItem('pin') as HTMLInputElement).value;
      operador = quien && pin ? { quien, pin } : null;
      try { if (quien) localStorage.setItem(CLAVE_QUIEN, quien); } catch { /* sin almacenamiento */ }
      pintarOperador(); ok(operador); soltarPendiente();
    }, { once: true }));
  }
  btnOp.onclick = () => void pedirOperador();
  function pedirMotivo(): Promise<string | null> {
    const f = dlgDesc.querySelector('form')!;
    f.reset();
    dlgDesc.returnValue = '';
    dlgDesc.showModal();
    return new Promise((ok) => dlgDesc.addEventListener('close', () => {
      soltarPendiente();
      if (dlgDesc.returnValue !== 'ok') return ok(null);
      const m = (f.elements.namedItem('motivo') as HTMLSelectElement).value, d = (f.elements.namedItem('detalle') as HTMLInputElement).value.trim();
      ok((m === 'otro' ? d || 'Otro' : d ? `${m}: ${d}` : m).slice(0, 160));
    }, { once: true }));
  }

  // ---------- avisos flotantes ----------
  function avisar(txt: string, tipo: 'ok' | 'error' | 'coincide' = 'ok', id?: string) {
    const el = document.createElement(id ? 'button' : 'div');
    el.className = `muni-toast muni-toast-${tipo}`;
    el.textContent = txt;
    if (id) { (el as HTMLButtonElement).type = 'button'; el.onclick = () => { const i = incidentes.find((x) => x.id === id); if (i) enfocar(i); el.remove(); }; }
    avisos.prepend(el);
    while (avisos.children.length > 3) avisos.lastElementChild!.remove();
    setTimeout(() => el.remove(), tipo === 'error' ? 8000 : 5000);
  }

  // ---------- acciones ----------
  async function accionar(id: string, destino: Estado, extra: { accion?: Accion; motivo?: string } = {}) {
    const inc = incidentes.find((i) => i.id === id);
    if (!inc) return;
    if (fuente !== 'incidentes') return avisar('Las acciones necesitan el servidor local con /api/incidentes.', 'error');
    if (destino === 'descartado' && !extra.motivo) {
      const m = await pedirMotivo();
      if (!m) return;
      extra.motivo = m;
    }
    let op = operador ?? (await pedirOperador());
    for (let intento = 0; op && intento < 3; intento++) {
      try {
        // Si es un cambio de acción (ya asignada), un solo paso; si no, recorre el flujo.
        if (destino === 'accion_asignada' && inc.estado === 'accion_asignada') await cambiarEstado(inc.id, { estado: destino, ...extra }, op);
        else await llevarA(inc, destino, extra, op);
        avisar(`${destino === 'accion_asignada' && extra.accion ? ACCION_TXT[extra.accion] : ESTADO[destino]} · ${tipoTxt(inc.tipo)}`);
        await consultar(true);
        return;
      } catch (e) {
        if (e instanceof ErrorApi && (e.status === 401 || e.status === 403)) { operador = null; pintarOperador(); op = await pedirOperador('PIN incorrecto. Intenta de nuevo.'); continue; }
        avisar(`No se pudo guardar: ${(e as Error).message}`, 'error');
        await consultar(true);
        return;
      }
    }
  }

  // ---------- galería ----------
  const gf = $<HTMLElement>('.muni-galeria-full');
  function pintarGaleria() {
    gf.hidden = !galeria;
    if (!galeria) return;
    const { fotos, k } = galeria;
    const img = gf.querySelector('img')!;
    img.src = fotoUrl(fotos[k]);
    img.alt = `Foto ${k + 1} de ${fotos.length} enviada por un vecino`;
    gf.querySelector('figcaption')!.textContent = `Foto ${k + 1} de ${fotos.length} · enviada por un vecino · por validar`;
    (gf.querySelector('.muni-gf-ant') as HTMLButtonElement).hidden = (gf.querySelector('.muni-gf-sig') as HTMLButtonElement).hidden = fotos.length < 2;
  }
  const moverGaleria = (d: number) => { if (galeria) { galeria.k = (galeria.k + d + galeria.fotos.length) % galeria.fotos.length; pintarGaleria(); } };
  (gf.querySelector('.muni-gf-cerrar') as HTMLButtonElement).onclick = () => { galeria = null; pintarGaleria(); };
  (gf.querySelector('.muni-gf-ant') as HTMLButtonElement).onclick = () => moverGaleria(-1);
  (gf.querySelector('.muni-gf-sig') as HTMLButtonElement).onclick = () => moverGaleria(1);
  document.addEventListener('keydown', (e) => {
    if (!galeria) return;
    if (e.key === 'Escape') { galeria = null; pintarGaleria(); } else if (e.key === 'ArrowLeft') moverGaleria(-1); else if (e.key === 'ArrowRight') moverGaleria(1);
  });

  // ---------- tarjeta ----------
  const sube = (id: string) => (desde.get(id)?.hasta ?? 0) > Date.now();
  /** «2 vecinos · 1 foto · primer reporte 21:03» con rodillo en los números que acaban de subir. */
  const contadorHtml = (i: Incidente, k = '') => {
    const a = sube(i.id) ? desde.get(i.id)! : null;
    return `<b class="muni-k-personas">${rodillo(i.personas, a?.personas, 'vecino', 'vecinos')}</b> · <b class="muni-k-fotos">${rodillo(i.nFotos, a?.fotos, 'foto', 'fotos')}</b> · primer reporte ${esc(hora(i.primer))}${k}`;
  };
  function botonesAccion(i: Incidente) {
    if (fuente !== 'incidentes') return '<p class="muni-t-sinacc">Acciones desactivadas: este servidor aún no tiene /api/incidentes (agrupado en esta pantalla, solo lectura).</p>';
    const sig = siguientes(i.estado);
    const b = (destino: Estado, txt: string, cls = '', accion = '') => `<button type="button" class="muni-acc ${cls}" data-destino="${destino}"${accion ? ` data-accion="${accion}"` : ''}>${esc(txt)}</button>`;
    const partes: string[] = [];
    if (i.estado === 'nuevo') partes.push(b('en_revision', 'Revisar'), b('validado', 'Validar', 'muni-primario'), b('descartado', 'Descartar', 'muni-peligro'));
    else if (i.estado === 'en_revision') partes.push(b('validado', 'Validar', 'muni-primario'), b('descartado', 'Descartar', 'muni-peligro'));
    else if (i.estado === 'validado' || i.estado === 'accion_asignada') {
      partes.push(`<span class="muni-acc-tit">${i.estado === 'validado' ? 'Asignar' : 'Cambiar'}:</span>`);
      for (const [k, v] of Object.entries(ACCIONES)) if (k !== i.accion) partes.push(b('accion_asignada', v, 'muni-acc-tipo', k));
      if (sig.includes('atendido')) partes.push(b('atendido', 'Marcar atendido', 'muni-primario'));
      if (sig.includes('descartado')) partes.push(b('descartado', 'Descartar', 'muni-peligro'));
    } else if (i.estado === 'descartado') partes.push(b('en_revision', 'Reabrir'));
    return partes.length ? `<div class="muni-t-acciones">${partes.join('')}</div>${operador ? '' : '<p class="muni-t-sinacc">Pide el PIN de operador al primer cambio.</p>'}` : '';
  }
  function galeriaHtml(i: Incidente) {
    const faltan = Math.max(0, i.nFotos - i.fotos.length) + i.fotosPendientes;
    if (!i.fotos.length && !faltan) return '<p class="muni-t-sinfoto">Sin fotos todavía.</p>';
    const max = 6, extra = Math.max(0, i.fotos.length - max);
    return `<div class="muni-galeria">${i.fotos.slice(0, max).map((f, k) => `<button type="button" class="muni-foto" data-k="${k}" aria-label="Ver foto ${k + 1}"><img loading="lazy" src="${esc(fotoUrl(f))}" alt="Foto ${k + 1} del incidente"></button>`).join('')}
      ${extra ? `<button type="button" class="muni-foto muni-foto-mas" data-k="${max}">+${extra}</button>` : ''}
      ${pendientesHtml(faltan)}</div>`;
  }
  function pintarTarjeta(forzar = false) {
    const i = actual();
    tarjeta.hidden = !i;
    if (!i) { firmaTarjeta = ''; return; }
    const f = firma(i) + '|' + fuente + '|' + !!operador + '|' + sube(i.id);
    if (!forzar && f === firmaTarjeta) return;
    firmaTarjeta = f;
    const vida = RIESGO_VIDA.includes(i.tipo);
    const otros = i.tipos.filter((t) => t !== i.tipo);
    const ult = i.historial[i.historial.length - 1];
    tarjeta.dataset.id = i.id;
    tarjeta.dataset.estado = i.estado;
    tarjeta.classList.toggle('vida', vida);
    tarjeta.innerHTML = `
      <div class="muni-t-cab"><span class="${claseEstado(i)}">${esc(estadoTxt(i))}</span>
        <span class="muni-conf muni-conf-${i.nivel}" title="${esc(i.puntajeOrigen === 'servidor' ? 'Respaldo calculado por el servidor' : 'Respaldo calculado en esta pantalla')}${i.congelado ? ' · congelado al validar' : ''}">${esc(respaldoTxt(i.puntaje, i.nivel))}${i.congelado ? ' <small>congelado al validar</small>' : ''}</span>
        <span class="muni-t-hace" data-recibido="${i.recibido ?? i.ultimo}">${esc(llegoHace(i.recibido ?? i.ultimo).replace('llegó', 'último'))}</span>
        <button type="button" class="muni-cerrar" aria-label="Cerrar tarjeta">×</button></div>
      <h2 class="muni-t-tipo">${esc(tipoTxt(i.tipo))}</h2>
      ${otros.length ? `<p class="muni-t-otros">También reportan: ${esc(otros.map(tipoTxt).join(', '))}</p>` : ''}
      ${vida ? `<p class="muni-t-vida">${esc(VIDA_PANEL).replace(/\b(116|105)\b/g, '<b>$1</b>')}</p>` : ''}
      <p class="muni-t-cont${sube(i.id) ? ' sube' : ''}">${contadorHtml(i)}</p>
      <dl class="muni-t-datos">
        <div><dt>Respaldo</dt><dd>${esc(DETALLE[i.nivel](i.personas, i.nFotos))}${i.desglose ? `<small class="muni-desglose">${desgloseHtml(i.desglose, i.puntaje)}</small>` : ''}</dd></div>
        <div><dt>Reportes</dt><dd>${esc(plural(i.reportes, 'reporte', 'reportes'))} de ${esc(vecinos(i.personas))}</dd></div>
        <div><dt>Severidad</dt><dd class="muni-sev${i.severidad}">${esc(sevTxt(i.severidad))} <small>la marca quien reporta</small></dd></div>
        <div><dt>Último reporte</dt><dd>${esc(hora(i.ultimo))} <small>reloj del celular</small></dd></div>
        <div><dt>Ubicación</dt><dd class="mono">${i.lat.toFixed(5)}, ${i.lon.toFixed(5)}</dd></div>
      </dl>
      ${galeriaHtml(i)}
      ${i.notas.length ? `<ul class="muni-t-notas">${i.notas.slice(-3).map((n) => `<li>«${esc(n)}»</li>`).join('')}</ul>` : ''}
      ${i.estado === 'descartado' && i.motivo ? `<p class="muni-t-motivo">${esc(motivoDescarteTxt(i.motivo))}</p>` : ''}
      ${i.estado === 'descartado' && i.nuevosTrasDescarte ? `<p class="muni-t-aviso">${esc(plural(i.nuevosTrasDescarte, 'reporte nuevo', 'reportes nuevos'))} después de descartar</p>` : ''}
      ${i.recurrenciaDe ? '<p class="muni-t-aviso">Posible recurrencia de un incidente ya atendido</p>' : ''}
      ${botonesAccion(i)}
      ${ult ? `<p class="muni-t-hist">${esc(estadoChip(ult.estado, ult.accion))}${ult.quien ? ` · ${esc(ult.quien)}` : ''}${Number.isFinite(ult.cuando) ? ` · ${esc(hora(ult.cuando))}` : ''}${i.historial.length > 1 ? ` <small>(${i.historial.length} cambios)</small>` : ''}</p>` : ''}
      <div class="muni-t-pie">${esc(PIE_LEGAL)}</div>`;
    (tarjeta.querySelector('.muni-cerrar') as HTMLButtonElement).onclick = () => { actualId = null; pintarTarjeta(); pintarLista(true); };
    tarjeta.querySelectorAll<HTMLButtonElement>('.muni-acc').forEach((b) => (b.onclick = () => void accionar(i.id, b.dataset.destino as Estado, b.dataset.accion ? { accion: b.dataset.accion as Accion } : {})));
    tarjeta.querySelectorAll<HTMLButtonElement>('button.muni-foto').forEach((b) => (b.onclick = () => { galeria = { fotos: i.fotos, k: Math.min(+b.dataset.k!, i.fotos.length - 1) }; pintarGaleria(); }));
    tarjeta.querySelectorAll<HTMLImageElement>('.muni-foto img').forEach((img) => (img.onerror = () => img.parentElement!.classList.add('rota')));
  }

  // ---------- columna ----------
  function pintarLista(forzar = false) {
    const abiertos = incidentes.filter((i) => !cerrado(i));
    $<HTMLElement>('.muni-n').textContent = String(abiertos.length);
    const total = abiertos.reduce((s, i) => s + i.personas, 0);
    // Rueda solo con cambios en vivo (no al sembrar los incidentes previos).
    if (total !== totalMostrado) { $<HTMLElement>('.muni-n-personas').innerHTML = rodillo(total, totalMostrado, '', '').trim(); totalMostrado = det.sembrado ? total : null; }
    $<HTMLElement>('.muni-n-sinver').textContent = String(abiertos.filter((i) => i.estado === 'nuevo').length);
    $<HTMLElement>('.muni-previos').textContent = !det.sembrado ? 'Conectando con el servidor…'
      : fuente === 'agrupado-en-pantalla' ? 'Este servidor aún no tiene /api/incidentes: los reportes se agrupan en esta pantalla (solo lectura).'
      : incidentes.length ? '' : 'Esperando reportes de vecinos…';
    const f = incidentes.map((i) => firma(i) + sube(i.id)).join(';') + '|' + actualId;
    if (!forzar && f === firmaLista) return;
    firmaLista = f;
    let separado = false;
    lista.innerHTML = incidentes.map((i) => {
      const entra = !animados.has(i.id);
      animados.add(i.id);
      const sep = cerrado(i) && !separado ? ((separado = true), '<li class="muni-sep">Cerrados</li>') : '';
      return `${sep}<li data-id="${esc(i.id)}" data-estado="${i.estado}" class="${RIESGO_VIDA.includes(i.tipo) ? 'vida' : ''}${actualId === i.id ? ' actual' : ''}${entra && det.sembrado ? ' entra' : ''}${cerrado(i) ? ' cerrado' : ''}">
        <button type="button" class="muni-item" title="Ver en el mapa"><b>${esc(tipoTxt(i.tipo))}</b>
          <span class="muni-i-cont${sube(i.id) ? ' sube' : ''}">${contadorHtml(i)}</span>
          <span class="muni-i-meta"><span class="${claseEstado(i)}">${esc(estadoTxt(i))}</span> <span class="muni-conf muni-conf-${i.nivel}">${esc(respaldoTxt(i.puntaje, i.nivel))}</span></span>
          <span class="muni-i-hace" data-recibido="${i.recibido ?? i.ultimo}">${esc(llegoHace(i.recibido ?? i.ultimo).replace('llegó', 'último'))}</span></button>
      </li>`;
    }).join('');
    lista.querySelectorAll<HTMLLIElement>('li[data-id]').forEach((li) => {
      (li.querySelector('.muni-item') as HTMLButtonElement).onclick = () => { const i = incidentes.find((x) => x.id === li.dataset.id); if (i) enfocar(i); };
    });
  }

  function pintarPuntos() {
    escena?.setReportes(incidentes.filter((i) => !cerrado(i)).map((i) => ({ id: i.id, lat: i.lat, lon: i.lon, type: i.tipo, severity: i.severidad, note: contadorTxt(i), state: estadoTxt(i) })));
  }

  /** Vuela al incidente, suelta el marcador pulsante y muestra la tarjeta. */
  function enfocar(i: Incidente) {
    actualId = i.id; pendiente = null;
    pintarTarjeta(true); pintarLista(true);
    tarjeta.style.animation = 'none'; void tarjeta.offsetWidth; tarjeta.style.animation = '';
    if (!escena) return;
    const e = escena;
    e.listo.then(() => {
      if (actualId !== i.id) return;
      marcador?.remove();
      const el = document.createElement('div');
      el.className = 'muni-pulso' + (RIESGO_VIDA.includes(i.tipo) ? ' vida' : '');
      el.innerHTML = '<i></i><i></i><b></b>';
      marcador = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([i.lon, i.lat]).addTo(e.map);
      void e.volarA({ lon: i.lon, lat: i.lat } as CentroPoblado);
    });
  }
  function soltarPendiente() { if (pendiente && !ocupado()) { const p = pendiente; pendiente = null; const i = incidentes.find((x) => x.id === p.id); if (i) enfocar(i); } }

  function pintarEstado(estado: 'ok' | 'error' | 'sin-red') {
    estadoEl.dataset.estado = estado;
    estadoTxtEl.textContent = estado === 'ok' ? `En vivo · consulta cada 3 s · ${hora(ultimaOk, true)}`
      : estado === 'sin-red' ? 'Sin red · reintentando cada 3 s'
      : 'Sin respuesta del servidor · reintentando cada 3 s';
  }

  async function consultar(forzar = false) {
    if (enCurso && !forzar) return;
    enCurso = true;
    consultas++;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), INTERVALO_MS - 300);
    try {
      const r = await traerIncidentes(ctl.signal);
      fuente = r.fuente;
      const { nuevos, coinciden } = det.procesar(r.lista);
      incidentes = r.lista.sort(porPrioridad);
      ultimaOk = Date.now();
      pintarEstado('ok');
      const ahora = Date.now();
      for (const c of coinciden) {
        desde.set(c.inc.id, { personas: c.personasAntes, fotos: c.fotosAntes, hasta: ahora + ANIM_MS });
        coincidencias++;
        const dp = c.inc.personas - c.personasAntes;
        avisar(dp > 0 ? `Otro vecino coincide: ${tipoTxt(c.inc.tipo)} · ahora ${vecinos(c.inc.personas)}` : `Nueva foto: ${tipoTxt(c.inc.tipo)} · ${plural(c.inc.nFotos, 'foto', 'fotos')}`, 'coincide', c.inc.id);
        setTimeout(() => { pintarLista(); pintarTarjeta(); }, ANIM_MS + 50);
      }
      pintarPuntos();
      if (nuevos.length) {
        nuevosIds.push(...nuevos.map((n) => n.id));
        aviso.sonar();
        if (ocupado()) pendiente = nuevos[0]; else enfocar(nuevos[0]); // el de mayor prioridad
      } else if (coinciden.length) aviso.sonar([[1046, 0]]);
      pintarLista(); pintarTarjeta();
    } catch {
      errores++;
      pintarEstado(navigator.onLine ? 'error' : 'sin-red');
      pintarLista();
    } finally { clearTimeout(to); enCurso = false; }
  }

  setInterval(() => raiz.querySelectorAll<HTMLElement>('[data-recibido]').forEach((n) => (n.textContent = llegoHace(+n.dataset.recibido!).replace('llegó', 'último'))), 1000);
  const ciclo = () => { void consultar().finally(() => setTimeout(ciclo, INTERVALO_MS)); };
  pintarLista();
  ciclo();

  (window as any).__yakuMuni = {
    escena: () => escena,
    estado: () => ({
      sembrado: det.sembrado, previos: det.previos, fuente, nuevos: [...nuevosIds], actual: actualId, consultas, errores, coincidencias,
      avisos: aviso.sonados, operador: operador?.quien ?? null, fase: (window as any).__yakuEscena?.cam?.fase ?? null,
      incidentes: incidentes.map((i) => ({ id: i.id, tipo: i.tipo, personas: i.personas, reportes: i.reportes, nFotos: i.nFotos, puntaje: i.puntaje, estado: i.estado, accion: i.accion })),
    }),
  };
  return raiz;
}
