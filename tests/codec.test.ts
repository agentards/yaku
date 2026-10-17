import { describe, it, expect } from 'vitest';
import {
  makeObservation, serialize, deserialize, pack, unpack, base45Encode, base45Decode, crc32,
  encodeForQR, Reassembler, encodeLinkHash, decodeLinkHash, dedupById, b64urlEncode, b64urlDecode,
} from '../src/codec';
import { sample } from './fixtures';

describe('serialización', () => {
  it('round-trip posicional exacto', () => {
    const recs = sample(20);
    expect(deserialize(serialize(recs))).toEqual(recs);
    expect(unpack(pack(recs))).toEqual(recs);
  });
  it('todos los registros salen NO verificados', () => {
    expect(unpack(pack(sample(5))).every((r) => r.verified === false)).toBe(true);
  });
  it('rechaza registro cuyo id no corresponde al contenido (manipulación)', () => {
    const recs = sample(1);
    const arr = JSON.parse(new TextDecoder().decode(serialize(recs)));
    arr[2][0][2] = arr[2][0][2] === 3 ? 1 : 3; // cambia severidad
    expect(() => deserialize(new TextEncoder().encode(JSON.stringify(arr)))).toThrow(/id no coincide/);
  });
  it('rechaza versión de formato desconocida', () => {
    expect(() => deserialize(new TextEncoder().encode('[9,0,[]]'))).toThrow();
  });
  it('base45 RFC 9285 vectores', () => {
    const e = new TextEncoder();
    expect(base45Encode(e.encode('AB'))).toBe('BB8');
    expect(base45Encode(e.encode('Hello!!'))).toBe('%69 VD92EX0');
    expect(base45Encode(e.encode('ietf!'))).toBe('QED8WEX0');
    expect(new TextDecoder().decode(base45Decode('QED8WEX0'))).toBe('ietf!');
    expect(() => base45Decode('GGW')).toThrow(); // 65535+ fuera de rango
  });
  it('base45/base64url round-trip binario', () => {
    const b = Uint8Array.from({ length: 257 }, (_, i) => (i * 37) & 255);
    expect(base45Decode(base45Encode(b))).toEqual(b);
    expect(b64urlDecode(b64urlEncode(b))).toEqual(b);
  });
  it('crc32 vector estándar', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('dedup', () => {
  it('id es estable y depende solo del contenido', () => {
    const base = { type: 'agua' as const, severity: 2 as const, lat: -5.194491, lon: -80.632821, note: ' x ', ts: 1000.7, deviceId: 'aaaa' };
    const a = makeObservation(base), b = makeObservation({ ...base, note: 'x', lat: -5.194489 });
    expect(a.id).toBe(b.id); // misma cuantización a 5 decimales y trim
    expect(makeObservation({ ...base, severity: 3 }).id).not.toBe(a.id);
    expect(a.id).toMatch(/^[0-9a-z]{11}$/);
  });
  it('dedupById elimina repetidos de varios relays', () => {
    const r = sample(10);
    expect(dedupById([...r, ...r.slice(3), ...r.slice(0, 2)])).toHaveLength(10);
  });
  it('sin colisiones de id en 20 000 registros sintéticos', () => {
    const ids = new Set(sample(20000, 7).map((r) => r.id));
    expect(ids.size).toBe(20000);
  });
});

describe('fragmentación y reensamblado', () => {
  it('1 registro cabe en 1 QR', () => {
    expect(encodeForQR(sample(1)).fragments).toHaveLength(1);
  });
  it('fragmentos son solo charset alfanumérico QR', () => {
    for (const f of encodeForQR(sample(20), 100).fragments) expect(f).toMatch(/^[0-9A-Z $%*+\-./:]+$/);
  });
  it('reensambla fuera de orden y con repetidos', () => {
    const recs = sample(20);
    const { fragments } = encodeForQR(recs, 120);
    expect(fragments.length).toBeGreaterThan(3);
    const order = [...fragments].reverse();
    const r = new Reassembler();
    let out;
    for (const [k, f] of [order[0], order[0], ...order.slice(1)].entries()) {
      out = r.add(f);
      if (k === 1) expect(out).toMatchObject({ status: 'progress', duplicate: true });
    }
    expect(out).toMatchObject({ status: 'complete' });
    expect((out as any).records).toEqual(recs);
    expect(r.add(fragments[0])).toMatchObject({ status: 'progress', duplicate: true }); // mensaje ya completado
  });
  it('dos mensajes intercalados se reensamblan por separado', () => {
    const A = encodeForQR(sample(10, 1), 100).fragments, B = encodeForQR(sample(10, 2), 100).fragments;
    const r = new Reassembler();
    const done: any[] = [];
    for (let i = 0; i < Math.max(A.length, B.length); i++) for (const f of [A[i], B[i]]) if (f) {
      const x = r.add(f); if (x.status === 'complete') done.push(x);
    }
    expect(done).toHaveLength(2);
  });
  it('detecta fragmento corrupto vía CRC32 o decodificación', () => {
    const { fragments } = encodeForQR(sample(5), 100);
    const bad = fragments.map((f, i) => (i === 1 ? f.slice(0, -3) + (f.endsWith('AAA') ? 'BBB' : 'AAA') : f));
    const r = new Reassembler();
    const last = bad.map((f) => r.add(f)).pop();
    expect(last?.status).toBe('error');
  });
  it('ignora QR ajenos', () => {
    expect(new Reassembler().add('https://example.com')).toMatchObject({ status: 'ignored' });
  });
});

describe('enlace relay', () => {
  it('round-trip #p= y checksum', () => {
    const recs = sample(5);
    const h = encodeLinkHash(recs);
    expect(decodeLinkHash('#' + h)).toEqual(recs);
    expect(() => decodeLinkHash('#' + h.replace(/\.[0-9a-z]+$/, '.zz'))).toThrow(/checksum/);
    expect(h).toMatch(/^p=[A-Za-z0-9_-]+\.[0-9a-z]+$/);
  });
});

describe('regresión', () => {
  it('fragmento que termina o empieza en espacio (símbolo base45) no se recorta', () => {
    // Bug encontrado por el test de mensajes intercalados: parseFragment hacía trim().
    let found = 0;
    for (let seed = 1; seed < 60 && found < 3; seed++) {
      const { fragments } = encodeForQR(sample(10, seed), 100);
      if (!fragments.some((f) => f.endsWith(' '))) continue;
      found++;
      const r = new Reassembler();
      expect(fragments.map((f) => r.add(f)).pop()?.status).toBe('complete');
    }
    expect(found).toBeGreaterThan(0);
  });
});

import { forecastStatus } from '../src/layers';
describe('vigencia de pronóstico', () => {
  const emit = '2026-10-15T00:00:00Z';
  it('vigente dentro de las 24 h y vencido después (calculado, no fijo)', () => {
    expect(forecastStatus(emit, 24, Date.parse('2026-10-15T23:59:00Z'))).toMatchObject({ vencido: false, etiqueta: 'Pronóstico SENAMHI del 15/10/2026 · vigencia 24 h · VIGENTE' });
    expect(forecastStatus(emit, 24, Date.parse('2026-10-16T00:01:00Z'))).toMatchObject({ vencido: true, etiqueta: 'Pronóstico SENAMHI del 15/10/2026 · vigencia 24 h · VENCIDO, se muestra como ejemplo' });
  });
});
