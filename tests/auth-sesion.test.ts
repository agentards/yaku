// Acceso del Centro de monitoreo (src/auth/sesion.ts): modo PIN, clave de Clerk, Frontend API y rol.
import { describe, it, expect, vi } from 'vitest';
import { entrarConPin, sesionPin, claveClerk, frontendApiDe, rolDeClaims, ROTULO_PIN, type Pedir } from '../src/auth/sesion';

const pk = (host: string, tipo = 'test') => `pk_${tipo}_${Buffer.from(host + '$').toString('base64')}`;

describe('modo PIN (sin Clerk)', () => {
  it('rótulo visible del plan B', () => expect(ROTULO_PIN).toBe('Acceso con PIN (sin Clerk)'));

  it('PIN aceptado por el servidor: sesión operador con X-Muni-Pin en cada cabeceras()', async () => {
    const pedir = vi.fn<Pedir>(async () => ({ status: 200 }));
    const r = await entrarConPin({ nombre: '  Rosa Chunga ', pin: '4321' }, { pedir });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [url, init] = pedir.mock.calls[0];
    expect(url).toBe('/api/incidentes');
    expect((init.headers as Record<string, string>)['x-muni-pin']).toBe('4321');
    expect(r.sesion).toMatchObject({ modo: 'pin', nombre: 'Rosa Chunga', usuarioId: 'pin', rol: 'operador' });
    expect(await r.sesion.cabeceras()).toEqual({ 'x-muni-pin': '4321' });
    expect(await r.sesion.cabeceras()).toEqual({ 'x-muni-pin': '4321' });
  });

  it('401/403 del servidor → «PIN incorrecto», sin sesión', async () => {
    for (const status of [401, 403]) {
      const r = await entrarConPin({ nombre: 'Rosa', pin: 'malo' }, { pedir: async () => ({ status }) });
      expect(r).toEqual({ ok: false, error: expect.stringMatching(/PIN incorrecto/) });
    }
  });

  it('sin servidor (red caída) abre la sesión: el servidor valida en cada acción', async () => {
    const r = await entrarConPin({ nombre: 'Rosa', pin: '1' }, { pedir: async () => { throw new TypeError('Failed to fetch'); } });
    expect(r.ok).toBe(true);
  });

  it('servidor colgado: corta a los esperaMs y abre la sesión', async () => {
    const r = await entrarConPin({ nombre: 'Rosa', pin: '1' }, { pedir: () => new Promise(() => {}), esperaMs: 30 });
    expect(r.ok).toBe(true);
  });

  it('pide nombre y PIN antes de llamar al servidor', async () => {
    const pedir = vi.fn<Pedir>(async () => ({ status: 200 }));
    expect((await entrarConPin({ nombre: '  ', pin: '1' }, { pedir })).ok).toBe(false);
    expect((await entrarConPin({ nombre: 'Rosa', pin: '' }, { pedir })).ok).toBe(false);
    expect((await entrarConPin({ nombre: 'Rosa', pin: 'x'.repeat(33) }, { pedir })).ok).toBe(false);
    expect(pedir).not.toHaveBeenCalled();
  });

  it('salir() olvida el PIN y avisa', async () => {
    const alSalir = vi.fn();
    const s = sesionPin('Rosa', '4321', alSalir);
    await s.salir();
    expect(alSalir).toHaveBeenCalledOnce();
    await expect(s.cabeceras()).rejects.toThrow(/cerrada/);
  });
});

describe('Clerk: clave, Frontend API y rol', () => {
  it('claveClerk: solo pk_test_/pk_live_; vacío o basura → null (PIN)', () => {
    expect(claveClerk({})).toBeNull();
    expect(claveClerk({ VITE_CLERK_PUBLISHABLE_KEY: '' })).toBeNull();
    expect(claveClerk({ VITE_CLERK_PUBLISHABLE_KEY: 'sk_test_abc' })).toBeNull();
    const k = pk('yaku-relay-12.clerk.accounts.dev');
    expect(claveClerk({ VITE_CLERK_PUBLISHABLE_KEY: ` ${k} ` })).toBe(k);
  });
  it('frontendApiDe decodifica el host de la clave', () => {
    expect(frontendApiDe(pk('yaku-relay-12.clerk.accounts.dev'))).toBe('yaku-relay-12.clerk.accounts.dev');
    expect(frontendApiDe(pk('clerk.yaku.pe', 'live'))).toBe('clerk.yaku.pe');
    expect(frontendApiDe('pk_test_' + Buffer.from('sin-dolar.dev').toString('base64'))).toBeNull();
    expect(frontendApiDe('pk_test_%%%')).toBeNull();
  });
  it('rolDeClaims: «monitor» solo mira; sin claim o cualquier otro valor opera', () => {
    expect(rolDeClaims({ rol: 'monitor' })).toBe('monitor');
    expect(rolDeClaims({ rol: ' Monitor ' })).toBe('monitor');
    expect(rolDeClaims({ rol: 'operador' })).toBe('operador');
    expect(rolDeClaims({})).toBe('operador');
    expect(rolDeClaims(null)).toBe('operador');
  });
});
