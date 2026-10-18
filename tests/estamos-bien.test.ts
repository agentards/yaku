// yaku.lat/estamos-bien: la ruta sirve su propia página (no app.html) y la búsqueda arma bien la URL y la hora de Perú.
import { describe, expect, it } from 'vitest';
import { esRutaApp, paginaDeRuta } from '../src/rutas';
import { buscarUrl, fechaLima } from '../src/estamos-bien/buscar';

describe('yaku.lat/estamos-bien', () => {
  it('es una página propia, liviana: no carga la app del vecino', () => {
    expect(paginaDeRuta('/estamos-bien')).toBe('/estamos-bien.html');
    expect(paginaDeRuta('/estamos-bien/')).toBe('/estamos-bien.html');
    expect(esRutaApp('/estamos-bien')).toBe(false);
    expect(paginaDeRuta('/estoy-bien')).toBeNull(); // el vecino escribe su mensaje en la app
    expect(paginaDeRuta('/estamos-bienes')).toBeNull();
  });
  it('busca por nombre con /api/estamos-bien, codificado y recortado', () => {
    expect(buscarUrl('  Rosa Chunga ')).toBe('/api/estamos-bien?nombre=Rosa%20Chunga');
    expect(buscarUrl('José & Ñique')).toBe('/api/estamos-bien?nombre=Jos%C3%A9%20%26%20%C3%91ique');
    expect(buscarUrl('x'.repeat(80))).toBe('/api/estamos-bien?nombre=' + 'x'.repeat(40));
  });
  it('la hora sale en hora de Perú aunque la familia busque desde otro país', () => {
    const t = Date.parse('2026-10-18T11:04:00Z') / 1000; // 06:04 en Lima
    expect(fechaLima(t)).toMatch(/06:04/);
    expect(fechaLima(t)).toMatch(/hora de Perú/);
  });
});
