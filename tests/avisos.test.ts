// Avisos de la municipalidad en el celular (src/poblador/avisos.ts): forma, firma y relevo por QR.
import { describe, it, expect } from 'vitest';
import { cargarFirmante } from '../servidor-local/avisos';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonico, verificarAviso, codificarAvisoQR, decodificarAvisoQR, esCodigoAviso, avisosParaQR, leerAviso, textoAviso, type Aviso, type AvisoGuardado } from '../src/poblador/avisos';

const b64url = (b: ArrayBuffer) => Buffer.from(b).toString('base64url');
async function clave() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { priv: k.privateKey, pub: await crypto.subtle.exportKey('jwk', k.publicKey) };
}
async function firmar(a: Omit<Aviso, 'firma'>, priv: CryptoKey): Promise<Aviso> {
  const f = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(canonico(a)));
  return { ...a, firma: b64url(f) };
}
const base = { id: '0123456789ab', incidente: 'inc-abcdefghijk', accion: 'bomberos' as const, tipo: 'vivienda', lat: -5.1945, lon: -80.6328, min: 29871640, texto: 'Van por el puente' };

describe('avisos firmados', () => {
  it('firma válida pasa; texto, acción o clave distintos no', async () => {
    const k = await clave(), otra = await clave();
    const a = await firmar(base, k.priv);
    expect(await verificarAviso(a, k.pub)).toBe(true);
    expect(await verificarAviso({ ...a, texto: 'Evacúen' }, k.pub)).toBe(false);
    expect(await verificarAviso({ ...a, accion: 'rescate' }, k.pub)).toBe(false);
    expect(await verificarAviso(a, otra.pub)).toBe(false);
    expect(await verificarAviso(a, null)).toBe(false);
  });
  it('QR: un aviso por código, ida y vuelta exacta y la firma sigue valiendo', async () => {
    const k = await clave();
    const a = await firmar(base, k.priv);
    const qr = codificarAvisoQR(a);
    expect(esCodigoAviso(qr)).toBe(true);
    expect(qr).toMatch(/^YA1:[0-9A-Z]+:[0-9A-Z $%*+\-./:]+$/);
    const b = decodificarAvisoQR(qr);
    expect(b).toEqual(a);
    expect(await verificarAviso(b, k.pub)).toBe(true);
    expect(() => decodificarAvisoQR(qr.slice(0, -3) + 'AAA')).toThrow();
  });
  it('un aviso firmado por el servidor se verifica en el celular, también después de pasar por QR', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaku-firma-'));
    try {
      const f = cargarFirmante(dir);
      const a = f.firmar({ ...base, accion: 'provisiones' });
      expect(await verificarAviso(a, f.jwkPublica)).toBe(true);
      const b = decodificarAvisoQR(codificarAvisoQR(a));
      expect(codificarAvisoQR(a).length).toBeLessThan(420);
      expect(await verificarAviso(b, f.jwkPublica)).toBe(true);
      expect(await verificarAviso({ ...b, texto: 'Evacúen ya' }, f.jwkPublica)).toBe(false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('rechaza formas inválidas', () => {
    expect(leerAviso({ ...base, firma: 'x'.repeat(86), accion: 'alerta' })).toBeNull();
    expect(leerAviso({ ...base, firma: 'x'.repeat(86), incidente: 'otro' })).toBeNull();
    expect(leerAviso({ ...base, firma: 'corta' })).toBeNull();
    expect(leerAviso({ ...base, firma: 'x'.repeat(86) })).not.toBeNull();
  });
  it('por QR solo pasan los verificados de las últimas 72 h, máximo 5, más recientes primero', () => {
    const ahora = base.min * 60000;
    const g = (i: number, verificado = true, horas = 0): AvisoGuardado => ({ ...base, id: String(i).padStart(12, '0'), min: base.min - horas * 60 - i, firma: 'x'.repeat(86), verificado, via: 'red', recibidoAt: 0 });
    const xs = [g(1), g(2, false), g(3, true, 80), g(4), g(5), g(6), g(7), g(8)];
    const r = avisosParaQR(xs, ahora);
    expect(r.map((a) => a.id)).toEqual(['000000000001', '000000000004', '000000000005', '000000000006', '000000000007']);
  });
  it('lo que ve el vecino: qué hace la municipalidad, dónde y que viene firmado', () => {
    const t = textoAviso({ ...base, accion: 'provisiones', firma: 'x', verificado: true, via: 'qr', recibidoAt: 0 }, () => 'Casa dañada o caída');
    expect(t.titulo).toBe('Provisiones asignadas');
    expect(t.titulo).not.toMatch(/en camino/);
    expect(t.detalle).toContain('Casa dañada o caída');
    expect(t.detalle).toContain('Van por el puente');
    expect(t.origen).toMatch(/Firmado por la municipalidad ✓ · te lo pasó otro vecino/);
  });
});
