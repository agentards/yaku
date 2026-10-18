// Acceso del Centro de monitoreo (src/auth/sesion.ts): usuario + contraseña con sesión guardada, y el PIN de respaldo.
import { describe, it, expect, vi } from 'vitest';
import { entrarConPin, sesionPin, ROTULO_PIN, entrar, restaurarSesion, sesionGuardada, type Pedir } from '../src/auth/sesion';


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
    expect((await entrarConPin({ nombre: 'Rosa', pin: 'x'.repeat(65) }, { pedir })).ok).toBe(false);
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

describe('usuario + contraseña con sesión guardada en el equipo', () => {
  const memoria = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => void memoria.set(k, v), removeItem: (k: string) => void memoria.delete(k) });
  const expira = Date.now() + 3_600_000;
  const ok: Pedir = async (url, init) => url === '/api/sesion' && init.method === 'POST'
    ? { status: 200, json: async () => ({ token: 't'.repeat(43), usuario: 'central', nombre: 'Municipio central', expira }) }
    : { status: 200, json: async () => ({ usuario: 'central', nombre: 'Municipio central', expira }) };

  it('entra con usuario y contraseña, guarda el token y manda Bearer en cada consulta', async () => {
    const r = await entrar({ usuario: ' Central ', clave: 'secreta', nombre: 'Rosa' }, { pedir: ok });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sesion).toMatchObject({ modo: 'usuario', nombre: 'Rosa', usuarioId: 'central' });
    expect(await r.sesion.cabeceras()).toEqual({ authorization: 'Bearer ' + 't'.repeat(43) });
    expect(sesionGuardada()?.token).toBe('t'.repeat(43));
  });
  it('al recargar o cambiar de región restaura la sesión sin pedir la contraseña', async () => {
    const s = await restaurarSesion({ pedir: ok });
    expect(s?.modo).toBe('usuario');
    expect(s?.nombre).toBe('Rosa');
  });
  it('si el servidor dice que venció (401), se borra y vuelve a pedir el acceso', async () => {
    expect(await restaurarSesion({ pedir: async () => ({ status: 401 }) })).toBeNull();
    expect(sesionGuardada()).toBeNull();
  });
  it('sin nombre escrito (la pantalla ya no lo pide): el chip y el historial usan el nombre que da el servidor', async () => {
    memoria.set('yaku-muni-nombre', 'Nombre viejo del formulario');
    const r = await entrar({ usuario: 'central', clave: 'secreta' }, { pedir: ok });
    expect(r.ok && r.sesion.nombre).toBe('Municipio central');
    const s = await restaurarSesion({ pedir: ok });
    expect(s?.nombre).toBe('Municipio central');
    expect(memoria.has('yaku-muni-nombre')).toBe(false);
  });
  it('contraseña mala → mensaje claro; servidor sin usuarios (404) → entra con el PIN como antes', async () => {
    expect(await entrar({ usuario: 'central', clave: 'mala' }, { pedir: async () => ({ status: 403 }) })).toEqual({ ok: false, error: 'Usuario o contraseña incorrectos.' });
    const r = await entrar({ usuario: 'central', clave: '4321', nombre: 'Rosa' }, { pedir: async (url) => ({ status: url === '/api/sesion' ? 404 : 200 }) });
    expect(r.ok && r.sesion.modo).toBe('pin');
    // PIN de respaldo sin nombre escrito: «Municipio» para central, o el usuario escrito.
    const sinNombre = await entrar({ usuario: 'central', clave: '4321' }, { pedir: async (url) => ({ status: url === '/api/sesion' ? 404 : 200 }) });
    expect(sinNombre.ok && sinNombre.sesion.nombre).toBe('Municipio');
    const otro = await entrar({ usuario: 'castilla', clave: '4321' }, { pedir: async (url) => ({ status: url === '/api/sesion' ? 404 : 200 }) });
    expect(otro.ok && otro.sesion.nombre).toBe('castilla');
  });
});
