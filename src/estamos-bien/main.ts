// yaku.lat/estamos-bien: página liviana para la familia (también en el exterior) que busca por nombre los mensajes
// «Estoy bien», sin abrir la app del vecino ni instalar nada. Solo GET /api/estamos-bien?nombre= (mínimo 3 letras,
// nunca un listado completo). El enlace con ?nombre= se puede compartir y busca solo al abrirse.
import './estamos-bien.css';
import { buscarUrl, fechaLima, MIN_LETRAS, type Mensaje } from './buscar';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('eb-form'), campo = $<HTMLInputElement>('eb-nombre');
const estado = $<HTMLParagraphElement>('eb-estado'), lista = $<HTMLUListElement>('eb-resultados');

function tarjeta(m: Mensaje): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'eb-msj';
  const t = document.createElement('p'); t.className = 'eb-msj-titulo'; t.textContent = `${m.nombre} está bien`;
  const d = document.createElement('p'); d.className = 'eb-msj-meta'; d.textContent = [m.para ? `Para ${m.para}` : '', m.zona, fechaLima(m.ts)].filter(Boolean).join(' · ');
  const x = document.createElement('p'); x.className = 'eb-msj-texto'; x.textContent = m.mensaje;
  li.append(t, d, x);
  return li;
}

let pedido = 0;
async function buscar(nombre: string) {
  const q = nombre.trim();
  const url = new URL(location.href);
  if (q) url.searchParams.set('nombre', q); else url.searchParams.delete('nombre');
  history.replaceState(null, '', url);
  lista.replaceChildren();
  if (q.length < MIN_LETRAS) { estado.textContent = `Escribe al menos ${MIN_LETRAS} letras del nombre.`; return; }
  const yo = ++pedido;
  estado.textContent = 'Buscando…';
  try {
    const r = await fetch(buscarUrl(q), { cache: 'no-store' });
    if (yo !== pedido) return;
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { count: number; cartas: Mensaje[] };
    if (!j.count) { estado.textContent = `Todavía no hay mensajes con «${q}». Puede que siga viajando entre celulares: vuelve a buscar más tarde.`; return; }
    estado.textContent = j.count === 1 ? '1 mensaje encontrado.' : `${j.count} mensajes encontrados, el más reciente primero.`;
    lista.append(...j.cartas.map(tarjeta));
  } catch {
    if (yo === pedido) estado.textContent = 'No se pudo buscar ahora (sin conexión o servicio no disponible). Intenta de nuevo en unos minutos.';
  }
}

form.addEventListener('submit', (e) => { e.preventDefault(); void buscar(campo.value); });
const inicial = new URLSearchParams(location.search).get('nombre') ?? new URLSearchParams(location.search).get('q');
if (inicial) { campo.value = inicial.slice(0, 40); void buscar(campo.value); }
