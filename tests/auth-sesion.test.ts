// Acceso del Centro de monitoreo (src/auth/sesion.ts): nombre + PIN municipal.
import { describe, it, expect, vi } from 'vitest';
import { entrarConPin, sesionPin, ROTULO_PIN, type Pedir } from '../src/auth/sesion';


describe('acceso con PIN', () => {
  it('rótulo visible', () => expect(ROTULO_PIN).toBe('Acceso del personal municipal'));

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

  it('429 del servidor → espera, sin sesión', async () => {
    const r = await entrarConPin({ nombre: 'Rosa', pin: '1' }, { pedir: async () => ({ status: 429 }) });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/Espera unos minutos/) });
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
