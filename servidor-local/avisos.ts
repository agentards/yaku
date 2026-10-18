// Avisos de la municipalidad: cuando el operador asigna una acción (rescate, bomberos, provisiones, maquinaria,
// EDAN) o da por atendido un incidente, el servidor crea un aviso FIRMADO (ECDSA P-256). Lo bajan todos los celulares
// conectados y viaja por QR, de vecino en vecino, a los que no tienen internet. La firma evita que alguien fabrique un
// «aviso de la municipalidad» dentro de la cadena: el celular lo verifica con la clave pública del servidor.
// El mismo texto canónico se firma aquí y se verifica en el celular (src/poblador/avisos.ts).
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ACCIONES_AVISO = ['rescate', 'bomberos', 'provisiones', 'maquinaria', 'edan', 'atendido'] as const;
export type AccionAviso = (typeof ACCIONES_AVISO)[number];

export interface Aviso {
  id: string; incidente: string; accion: AccionAviso; tipo: string;
  /** Ancla del incidente redondeada a 4 decimales (~11 m). */
  lat: number; lon: number;
  /** Minutos desde 1970 (lo que se firma y viaja por QR). */
  min: number;
  /** Mensaje opcional del operador (≤ 120 caracteres). */
  texto: string;
  /** ECDSA P-256 / SHA-256 en formato IEEE P1363, base64url. */
  firma: string;
}
export type AvisoSinFirma = Omit<Aviso, 'firma'>;

export const canonico = (a: AvisoSinFirma) => ['YA1', a.id, a.incidente, a.accion, a.tipo, a.lat.toFixed(4), a.lon.toFixed(4), String(a.min), a.texto].join('|');
export const idAviso = (incidente: string, accion: string, min: number) => createHash('sha256').update(`${incidente}|${accion}|${min}`).digest('hex').slice(0, 12);
export const limpiarTexto = (s: unknown, max = 120) => String(s ?? '').replace(/[\u0000-\u001f\u007f|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const redondear = (x: number) => Math.round(x * 1e4) / 1e4;

export interface Firmante { jwkPublica: JsonWebKey; firmar(a: AvisoSinFirma): Aviso }

/** Clave del servidor en YAKU_DATOS/avisos-clave.json (se crea la primera vez; sobrevive a reinicios y despliegues). */
export function cargarFirmante(datos: string): Firmante {
  const archivo = path.join(datos, 'avisos-clave.json');
  let priv: KeyObject;
  if (fs.existsSync(archivo)) priv = createPrivateKey({ key: JSON.parse(fs.readFileSync(archivo, 'utf8')), format: 'jwk' });
  else {
    priv = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    fs.writeFileSync(archivo, JSON.stringify(priv.export({ format: 'jwk' })), { mode: 0o600 });
  }
  const pub = createPublicKey(priv).export({ format: 'jwk' }) as JsonWebKey;
  return {
    jwkPublica: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y },
    firmar: (a) => ({ ...a, firma: sign('sha256', Buffer.from(canonico(a)), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url') }),
  };
}
