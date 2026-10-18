// Rutas de arranque y redirecciones (src/rutas.ts) según plan-centro-monitoreo.md y plan-landing-yaku-lat.md.
import { describe, it, expect } from 'vitest';
import { decidirRuta, esRutaApp, redireccionRuta } from '../src/rutas';

const escritorio = { celular: false, automatizado: false };
const celular = { celular: true, automatizado: false };
const e2e = { celular: false, automatizado: true };
const todos = [escritorio, celular, e2e];

describe('decidirRuta por ruta', () => {
  it('/reportar → poblador; /municipalidad → Centro de monitoreo; /app → app técnica (en cualquier equipo)', () => {
    for (const env of todos) {
      expect(decidirRuta('/reportar', '', env)).toEqual({ vista: 'poblador' });
      expect(decidirRuta('/reportar/', '', env)).toEqual({ vista: 'poblador' });
      expect(decidirRuta('/municipalidad', '', env)).toEqual({ vista: 'monitoreo', pestana: 'municipalidad' });
      expect(decidirRuta('/app', '', env)).toEqual({ vista: 'tecnica' });
    }
  });
  it('?vista= sigue mandando dentro de app.html', () => {
    for (const env of todos) {
      expect(decidirRuta('/municipalidad', '?vista=portal', env)).toEqual({ vista: 'monitoreo', pestana: 'portal' });
      expect(decidirRuta('/municipalidad', '?vista=2d', env)).toEqual({ vista: 'tecnica' }); // «salir a 2D» del monitoreo
      expect(decidirRuta('/app', '?vista=portal-relevo', env)).toEqual({ vista: 'tecnica' });
      expect(decidirRuta('/app', '?vista=poblador', env)).toEqual({ vista: 'poblador' });
    }
  });
});

describe('decidirRuta sin ruta conocida (app.html directo): comportamiento anterior', () => {
  it('sin ?vista: escritorio → Centro de monitoreo; celular → poblador', () => {
    expect(decidirRuta('/app.html', '', escritorio)).toEqual({ vista: 'monitoreo', pestana: 'portal' });
    expect(decidirRuta('/app.html', '?vista=', escritorio)).toEqual({ vista: 'monitoreo', pestana: 'portal' });
    expect(decidirRuta('/app.html', '', celular)).toEqual({ vista: 'poblador' });
  });
  it('?vista=portal|municipalidad|incidentes → Centro de monitoreo con su pestaña (también en celular)', () => {
    for (const env of todos) {
      expect(decidirRuta('/app.html', '?vista=portal', env)).toEqual({ vista: 'monitoreo', pestana: 'portal' });
      expect(decidirRuta('/app.html', '?vista=municipalidad', env)).toEqual({ vista: 'monitoreo', pestana: 'municipalidad' });
      expect(decidirRuta('/app.html', '?vista=incidentes&x=1', env)).toEqual({ vista: 'monitoreo', pestana: 'incidentes' });
    }
  });
  it('?vista=2d (y 3d u otra) → app técnica pública; ?vista=poblador → poblador', () => {
    for (const env of [escritorio, celular]) {
      expect(decidirRuta('/app.html', '?vista=2d', env)).toEqual({ vista: 'tecnica' });
      expect(decidirRuta('/app.html', '?vista=3d', env)).toEqual({ vista: 'tecnica' });
      expect(decidirRuta('/app.html', '?vista=otra', env)).toEqual({ vista: 'tecnica' });
      expect(decidirRuta('/app.html', '?vista=poblador', env)).toEqual({ vista: 'poblador' });
    }
  });
  it('navegador automatizado sin ?vista sigue en la app técnica', () => {
    expect(decidirRuta('/app.html', '', e2e)).toEqual({ vista: 'tecnica' });
    expect(decidirRuta('/app.html', '', { celular: true, automatizado: true })).toEqual({ vista: 'tecnica' });
  });
});

describe('redireccionRuta: enlaces viejos en / → ruta nueva', () => {
  it('tabla del plan', () => {
    expect(redireccionRuta('/', '?vista=poblador')).toBe('/reportar');
    expect(redireccionRuta('/', '?vista=municipalidad')).toBe('/municipalidad');
    expect(redireccionRuta('/', '?vista=incidentes')).toBe('/municipalidad');
    expect(redireccionRuta('/', '?vista=portal')).toBe('/municipalidad?vista=portal');
    expect(redireccionRuta('/', '?vista=2d')).toBe('/app');
    expect(redireccionRuta('/', '?vista=3d')).toBe('/app?vista=3d');
    expect(redireccionRuta('/', '?vista=portal-relevo')).toBe('/app?vista=portal-relevo');
    expect(redireccionRuta('/index.html', '?vista=poblador')).toBe('/reportar');
  });
  it('conserva los demás parámetros y el hash', () => {
    expect(redireccionRuta('/', '?vista=poblador&lang=qu', '#x')).toBe('/reportar?lang=qu#x');
    expect(redireccionRuta('/', '?basemap=z12&vista=2d')).toBe('/app?basemap=z12');
  });
  it('enlace relay viejo /#p=… → /app#p=…; la landing sin ?vista no redirige', () => {
    expect(redireccionRuta('/', '', '#p=abc.12')).toBe('/app#p=abc.12');
    expect(redireccionRuta('/', '')).toBeNull();
    expect(redireccionRuta('/', '?utm_source=x')).toBeNull();
  });
  it('/reportar/ → /reportar; las rutas de la app y los archivos no redirigen', () => {
    expect(redireccionRuta('/reportar/', '?a=1')).toBe('/reportar?a=1');
    expect(redireccionRuta('/reportar', '?vista=2d')).toBeNull();
    expect(redireccionRuta('/assets/x.js', '')).toBeNull();
    expect(esRutaApp('/municipalidad')).toBe(true);
    expect(esRutaApp('/municipalidades')).toBe(false);
  });
});
