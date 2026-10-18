// Formato compacto Yaku Relay v1 — sin dependencias de DOM (testeable en Node).
import { deflateRaw, inflateRaw } from 'pako';

// El índice viaja en el QR: los tipos nuevos van SIEMPRE al final (no reordenar ni borrar).
export const OBS_TYPES = ['agua', 'huaico', 'cauce', 'via_bloq', 'otro', 'vivienda', 'atrapados', 'heridos', 'ayuda'] as const;
export type ObsType = (typeof OBS_TYPES)[number];
export const OBS_LABELS: Record<ObsType, string> = {
  agua: 'Acumulación de agua',
  huaico: 'Huaico / flujo de lodo',
  cauce: 'Cauce obstruido',
  via_bloq: 'Vía bloqueada',
  otro: 'Otro',
  vivienda: 'Casa dañada o caída',
  atrapados: 'Personas atrapadas',
  heridos: 'Heridos',
  ayuda: 'Necesitan ayuda (agua, comida, abrigo)',
};

export interface Observation {
  id: string;          // hash corto del contenido (dedup)
  type: ObsType;
  severity: 1 | 2 | 3;
  lat: number;         // 5 decimales (~1.1 m)
  lon: number;
  note: string;        // <= 140 chars
  ts: number;          // epoch segundos
  deviceId: string;    // 8 chars
  verified: false;     // siempre false: reporte ciudadano
}

export type NewObservation = Omit<Observation, 'id' | 'verified'>;

const FORMAT_VERSION = 1;
const enc = new TextEncoder();
const dec = new TextDecoder();

/** cyrb53: hash no criptográfico de 53 bits, síncrono (sirve sin secure context). */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const q5 = (x: number) => Math.round(x * 1e5);

export function contentId(o: NewObservation): string {
  const canon = [o.type, o.severity, q5(o.lat), q5(o.lon), o.note.trim(), o.ts, o.deviceId].join('|');
  return cyrb53(canon).toString(36).padStart(11, '0');
}

export function makeObservation(o: NewObservation): Observation {
  const norm: NewObservation = {
    ...o,
    lat: q5(o.lat) / 1e5,
    lon: q5(o.lon) / 1e5,
    note: o.note.trim().slice(0, 140),
    ts: Math.floor(o.ts),
  };
  return { ...norm, id: contentId(norm), verified: false };
}

// ---- serialización posicional ----
type Row = [string, number, number, number, number, number, string, string];
// [id, typeIdx, sev, lat*1e5, lon*1e5, ts-epochBase, deviceId, note]

export function serialize(records: Observation[]): Uint8Array {
  const base = records.length ? Math.min(...records.map((r) => r.ts)) : 0;
  const rows: Row[] = records.map((r) => [
    r.id, OBS_TYPES.indexOf(r.type), r.severity, q5(r.lat), q5(r.lon), r.ts - base, r.deviceId, r.note,
  ]);
  return enc.encode(JSON.stringify([FORMAT_VERSION, base, rows]));
}

export function deserialize(bytes: Uint8Array): Observation[] {
  const parsed = JSON.parse(dec.decode(bytes));
  if (!Array.isArray(parsed) || parsed[0] !== FORMAT_VERSION) throw new Error('formato desconocido');
  const base: number = parsed[1];
  return (parsed[2] as Row[]).map((row) => {
    const [id, ti, sev, la, lo, dt, deviceId, note] = row;
    const type = OBS_TYPES[ti];
    if (!type || ![1, 2, 3].includes(sev)) throw new Error('registro inválido');
    const o = makeObservation({ type, severity: sev as 1 | 2 | 3, lat: la / 1e5, lon: lo / 1e5, ts: base + dt, deviceId, note });
    if (o.id !== id) throw new Error(`id no coincide con contenido (${id})`);
    return o;
  });
}

export const pack = (records: Observation[]) => deflateRaw(serialize(records), { level: 9 });
export const unpack = (bytes: Uint8Array) => deserialize(inflateRaw(bytes));

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- Base45 (RFC 9285): usa el modo alfanumérico del QR (5.5 bits/char) ----
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
export function base45Encode(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 2) {
    if (i + 1 < b.length) {
      let x = b[i] * 256 + b[i + 1];
      const c = x % 45; x = (x - c) / 45;
      const d = x % 45; const e = (x - d) / 45;
      out += B45[c] + B45[d] + B45[e];
    } else {
      const x = b[i];
      out += B45[x % 45] + B45[Math.floor(x / 45)];
    }
  }
  return out;
}
export function base45Decode(s: string): Uint8Array {
  const vals = [...s].map((ch) => {
    const v = B45.indexOf(ch);
    if (v < 0) throw new Error('carácter base45 inválido');
    return v;
  });
  if (vals.length % 3 === 1) throw new Error('longitud base45 inválida');
  const out: number[] = [];
  for (let i = 0; i < vals.length; i += 3) {
    if (i + 2 < vals.length) {
      const x = vals[i] + vals[i + 1] * 45 + vals[i + 2] * 2025;
      if (x > 0xffff) throw new Error('base45 fuera de rango');
      out.push(x >> 8, x & 0xff);
    } else {
      const x = vals[i] + vals[i + 1] * 45;
      if (x > 0xff) throw new Error('base45 fuera de rango');
      out.push(x);
    }
  }
  return Uint8Array.from(out);
}

// ---- base64url (para el enlace relay #p=) ----
export function b64urlEncode(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(s: string): Uint8Array {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ---- Fragmentación para QR ----
// Fragmento: "YR1:<msg>:<i>:<n>:<crc>:<base45 chunk>" — todo en el charset alfanumérico del QR.
export const DEFAULT_CHUNK = 450; // chars base45 por QR (≈ versión 11-12, ECC M)

export interface Encoded {
  jsonBytes: number;
  deflatedBytes: number;
  base45Chars: number;
  crc: number;
  fragments: string[];
}

export function encodeForQR(records: Observation[], chunk = DEFAULT_CHUNK): Encoded {
  const json = serialize(records);
  const z = deflateRaw(json, { level: 9 });
  const crc = crc32(z);
  const b45 = base45Encode(z);
  const n = Math.max(1, Math.ceil(b45.length / chunk));
  const msg = (crc % 1679616).toString(36).toUpperCase().padStart(4, '0'); // 4 chars
  const crcS = crc.toString(36).toUpperCase();
  const fragments: string[] = [];
  for (let i = 0; i < n; i++) {
    fragments.push(`YR1:${msg}:${i + 1}:${n}:${crcS}:${b45.slice(i * chunk, (i + 1) * chunk)}`);
  }
  return { jsonBytes: json.length, deflatedBytes: z.length, base45Chars: b45.length, crc, fragments };
}

export interface Fragment { msg: string; i: number; n: number; crc: number; data: string }
const FRAG_RE = /^YR1:([0-9A-Z]{4}):(\d+):(\d+):([0-9A-Z]+):([0-9A-Z $%*+\-./:]*)$/;
export function parseFragment(s: string): Fragment | null {
  // OJO: no usar trim(): el espacio es un símbolo válido de base45.
  const m = FRAG_RE.exec(s.replace(/[\r\n]+$/, ""));
  if (!m) return null;
  const i = +m[2], n = +m[3];
  if (i < 1 || i > n || n > 999) return null;
  return { msg: m[1], i, n, crc: parseInt(m[4], 36), data: m[5] };
}

export type AddResult =
  | { status: 'ignored'; reason: string }
  | { status: 'progress'; msg: string; have: number; n: number; duplicate: boolean }
  | { status: 'complete'; msg: string; n: number; records: Observation[] }
  | { status: 'error'; msg: string; reason: string };

/** Reensambla fragmentos (en cualquier orden, con repetidos) de varios mensajes a la vez. */
export class Reassembler {
  private parts = new Map<string, { n: number; crc: number; chunks: (string | undefined)[] }>();
  readonly done = new Set<string>();

  add(raw: string): AddResult {
    const f = parseFragment(raw);
    if (!f) return { status: 'ignored', reason: 'no es un fragmento YR1' };
    const key = `${f.msg}:${f.crc}`;
    if (this.done.has(key)) return { status: 'progress', msg: f.msg, have: f.n, n: f.n, duplicate: true };
    let p = this.parts.get(key);
    if (!p) { p = { n: f.n, crc: f.crc, chunks: new Array(f.n) }; this.parts.set(key, p); }
    if (p.n !== f.n) return { status: 'error', msg: f.msg, reason: 'n inconsistente' };
    const duplicate = p.chunks[f.i - 1] !== undefined;
    p.chunks[f.i - 1] = f.data;
    const have = p.chunks.filter((c) => c !== undefined).length;
    if (have < p.n) return { status: 'progress', msg: f.msg, have, n: p.n, duplicate };
    this.parts.delete(key);
    try {
      const z = base45Decode(p.chunks.join(''));
      if (crc32(z) !== p.crc) return { status: 'error', msg: f.msg, reason: 'checksum CRC32 inválido' };
      const records = unpack(z);
      this.done.add(key);
      return { status: 'complete', msg: f.msg, n: p.n, records };
    } catch (e) {
      return { status: 'error', msg: f.msg, reason: String((e as Error).message) };
    }
  }

  pending() {
    return [...this.parts.entries()].map(([k, p]) => ({ key: k, have: p.chunks.filter(Boolean).length, n: p.n }));
  }
}

// ---- Enlace relay: #p=<base64url(deflate)>.<crc36> ----
export function encodeLinkHash(records: Observation[]): string {
  const z = pack(records);
  return `p=${b64urlEncode(z)}.${crc32(z).toString(36)}`;
}
export function decodeLinkHash(hash: string): Observation[] | null {
  const m = /^#?p=([A-Za-z0-9_-]+)\.([0-9a-z]+)$/.exec(hash);
  if (!m) return null;
  const z = b64urlDecode(m[1]);
  if (crc32(z) !== parseInt(m[2], 36)) throw new Error('checksum CRC32 inválido en enlace');
  return unpack(z);
}

/** Dedup por id (último gana no importa: mismo id ⇒ mismo contenido). */
export function dedupById<T extends { id: string }>(xs: T[]): T[] {
  const m = new Map<string, T>();
  for (const x of xs) if (!m.has(x.id)) m.set(x.id, x);
  return [...m.values()];
}
