// Rutas de arranque (src/rutas.ts) según plan-centro-monitoreo.md.
import { describe, it, expect } from 'vitest';
import { decidirRuta } from '../src/rutas';

const escritorio = { celular: false, automatizado: false };
const celular = { celular: true, automatizado: false };
const e2e = { celular: false, automatizado: true };

describe('decidirRuta', () => {
  it('sin ?vista: escritorio → Centro de monitoreo; celular → poblador', () => {
    expect(decidirRuta('', escritorio)).toEqual({ vista: 'monitoreo', pestana: 'portal' });
    expect(decidirRuta('?vista=', escritorio)).toEqual({ vista: 'monitoreo', pestana: 'portal' });
    expect(decidirRuta('', celular)).toEqual({ vista: 'poblador' });
  });
  it('?vista=portal|municipalidad|incidentes → Centro de monitoreo con su pestaña (también en celular)', () => {
    for (const env of [escritorio, celular, e2e]) {
      expect(decidirRuta('?vista=portal', env)).toEqual({ vista: 'monitoreo', pestana: 'portal' });
      expect(decidirRuta('?vista=municipalidad', env)).toEqual({ vista: 'monitoreo', pestana: 'municipalidad' });
      expect(decidirRuta('?vista=incidentes&x=1', env)).toEqual({ vista: 'monitoreo', pestana: 'incidentes' });
    }
  });
  it('?vista=2d (y 3d u otra) → app técnica pública; ?vista=poblador → poblador', () => {
    for (const env of [escritorio, celular]) {
      expect(decidirRuta('?vista=2d', env)).toEqual({ vista: 'tecnica' });
      expect(decidirRuta('?vista=3d', env)).toEqual({ vista: 'tecnica' });
      expect(decidirRuta('?vista=otra', env)).toEqual({ vista: 'tecnica' });
      expect(decidirRuta('?vista=poblador', env)).toEqual({ vista: 'poblador' });
    }
  });
  it('navegador automatizado sin ?vista sigue en la app técnica (E2E existentes)', () => {
    expect(decidirRuta('', e2e)).toEqual({ vista: 'tecnica' });
    expect(decidirRuta('', { celular: true, automatizado: true })).toEqual({ vista: 'tecnica' });
  });
});
