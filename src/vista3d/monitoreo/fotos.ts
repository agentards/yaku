// Fotos de los vecinos en el Centro de monitoreo. GET /api/fotos/:id pide la sesión (Authorization o X-Muni-Pin) y un
// <img src> no puede mandar cabeceras: por eso las piezas dejan <img data-foto="id"> sin src, y aquí se descargan con
// las cabeceras de la Sesion y se muestran como blob: (una sola descarga por foto, caché en memoria). Si no se puede,
// se dispara «error» en la imagen y cada pieza muestra su respaldo (ícono del tipo o «Foto aún no disponible»).
import { fotoUrl } from '../municipalidad/api';

type Cabeceras = () => Promise<Record<string, string>>;
const cache = new Map<string, Promise<string>>();

export function urlFoto(id: string, cab: Cabeceras): Promise<string> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const r = await fetch(fotoUrl(id), { headers: await cab(), cache: 'force-cache' });
      if (!r.ok) throw new Error(`foto ${r.status}`);
      return URL.createObjectURL(await r.blob());
    })();
    cache.set(id, p);
    // Un fallo (foto aún subiendo, sin red) se vuelve a intentar más tarde, no en cada repintado.
    p.catch(() => setTimeout(() => cache.delete(id), 15_000));
  }
  return p;
}

/** Carga las <img data-foto> sin src dentro de `raiz`. */
export function hidratarFotos(raiz: ParentNode, cab: Cabeceras) {
  raiz.querySelectorAll<HTMLImageElement>('img[data-foto]:not([src])').forEach((img) => {
    urlFoto(img.dataset.foto!, cab).then((u) => { if (img.isConnected) img.src = u; }, () => img.dispatchEvent(new Event('error')));
  });
}
