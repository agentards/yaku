// Modo Claro / Oscuro / Sistema del Centro de monitoreo y su pantalla de acceso (src/vista3d/ui/modo.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_MODO, MODOS, esModoPref, guardarModo, leerModo, resolverModo, selectorModoHtml } from '../src/vista3d/ui/modo';

afterEach(() => { vi.unstubAllGlobals(); });

describe('modo de color', () => {
  it('«Sistema» sigue a prefers-color-scheme; Claro y Oscuro mandan', () => {
    expect(resolverModo('sistema', true)).toBe('oscuro');
    expect(resolverModo('sistema', false)).toBe('claro');
    expect(resolverModo('claro', true)).toBe('claro');
    expect(resolverModo('oscuro', false)).toBe('oscuro');
  });

  it('se guarda en este equipo; sin preferencia o con un valor raro, «Sistema»', () => {
    const datos = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v) });
    expect(leerModo()).toBe('sistema');
    guardarModo('oscuro');
    expect(datos.get(CLAVE_MODO)).toBe('oscuro');
    expect(leerModo()).toBe('oscuro');
    datos.set(CLAVE_MODO, 'satelite');
    expect(leerModo()).toBe('sistema');
    expect(esModoPref('claro')).toBe(true);
    expect(esModoPref('noche')).toBe(false);
  });

  it('sin almacenamiento (modo privado, bloqueado) no rompe: vale para esta carga', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } });
    expect(leerModo()).toBe('sistema');
    expect(() => guardarModo('claro')).not.toThrow();
  });

  it('selector: tres botones con texto (Claro, Oscuro, Sistema) y el elegido marcado', () => {
    const h = selectorModoHtml('oscuro');
    for (const m of MODOS) expect(h).toContain(`>${m.nombre}</span>`);
    expect(h).toContain('data-modo-op="oscuro" aria-pressed="true"');
    expect(h).toContain('data-modo-op="claro" aria-pressed="false"');
    expect(h.match(/<button type="button"/g)).toHaveLength(3);
    expect(h).toContain('role="group" aria-label="Modo de color"');
  });
});
