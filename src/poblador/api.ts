// Llamadas del modo poblador al servidor local de WP1 (mismo origen /api). Si un endpoint aún no existe
// (404) o no hay red, se reintenta en la próxima sincronización: nada se pierde, todo queda en el celular.
import { leerRespuestaEstados, type EstadoReporte } from './estados';
import { blobABase64 } from './foto';
import { leerAviso, type Aviso } from './avisos';
import { leerCarta, type Carta } from './cartas';

/** POST /api/cartas: sube las cartas «Estoy bien» que lleva este celular. Devuelve los ids aceptados (null sin endpoint). */
export async function subirCartas(cs: Carta[], subidoPor: string): Promise<string[] | null> {
  if (!cs.length) return [];
  const r = await fetch('/api/cartas', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ cartas: cs, subidoPor }) });
  if (!r.ok) return null;
  const j = await r.json();
  return Array.isArray(j?.accepted) ? j.accepted.map(String) : [];
}
/** GET /api/cartas?q=: busca por nombre en el servidor (mínimo 3 letras). null sin red o sin endpoint. */
export async function buscarCartasServidor(q: string): Promise<Carta[] | null> {
  const r = await fetch('/api/cartas?q=' + encodeURIComponent(q), { cache: 'no-store' });
  if (!r.ok) return null;
  const j = await r.json();
  return (Array.isArray(j?.cartas) ? j.cartas : []).map(leerCarta).filter((c: Carta | null): c is Carta => !!c);
}

const CLAVE_AVISOS = 'yaku-avisos-clave';
/** Clave pública de la municipalidad guardada la última vez que hubo red (para verificar avisos que llegan por QR). */
export function claveAvisos(): JsonWebKey | null {
  try { const s = localStorage.getItem(CLAVE_AVISOS); return s ? (JSON.parse(s) as JsonWebKey) : null; } catch { return null; }
}
/** GET /api/avisos: los avisos de los últimos 7 días y la clave para verificarlos (se guarda). null si no hay endpoint o red. */
export async function pedirAvisos(): Promise<Aviso[] | null> {
  const r = await fetch('/api/avisos', { cache: 'no-store' });
  if (!r.ok) return null;
  const j = await r.json();
  if (j?.clave?.kty === 'EC') { try { localStorage.setItem(CLAVE_AVISOS, JSON.stringify(j.clave)); } catch { /* sin almacenamiento */ } }
  return (Array.isArray(j?.avisos) ? j.avisos : []).map(leerAviso).filter((a: Aviso | null): a is Aviso => !!a);
}

const LOTE = 80;

export async function pedirEstados(ids: string[]): Promise<EstadoReporte[] | null> {
  if (!ids.length) return [];
  const out: EstadoReporte[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const r = await fetch(`/api/estado?ids=${encodeURIComponent(ids.slice(i, i + LOTE).join(','))}`, { cache: 'no-store' });
    if (!r.ok) return null;
    out.push(...leerRespuestaEstados(await r.json()));
  }
  return out;
}

/** POST /api/fotos {id, report_id, mime, data: base64} (≤ 400 KB en el servidor). true si quedó guardada. */
export async function subirFoto(id: string, blob: Blob): Promise<boolean> {
  const data = await blobABase64(blob);
  const r = await fetch('/api/fotos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, report_id: id, mime: blob.type || 'image/jpeg', data }),
  });
  return r.ok;
}
