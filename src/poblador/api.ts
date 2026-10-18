// Llamadas del modo poblador al servidor local de WP1 (mismo origen /api). Si un endpoint aún no existe
// (404) o no hay red, se reintenta en la próxima sincronización: nada se pierde, todo queda en el celular.
import { leerRespuestaEstados, type EstadoReporte } from './estados';
import { blobABase64 } from './foto';

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
