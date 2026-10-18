// «Estoy bien» en el celular (src/poblador/cartas.ts): forma, id por contenido, relevo por QR y búsqueda por nombre.
import { describe, it, expect } from 'vitest';
import { idCarta as idServidor } from '../servidor-local/cartas';
import { crearCarta, leerCarta, verificarId, codificarCartasQR, decodificarCartasQR, esCodigoCartas, cartasParaQR, buscarCartas, textoCarta, type CartaGuardada } from '../src/poblador/cartas';

const T = 1792310000;
const nueva = (n: string, extra: object = {}) => crearCarta({ nombre: n, para: 'mi mamá, Rosa', mensaje: `Hola, soy ${n}. Si leen esto: estoy bien. Estoy en el colegio.`, zona: 'Castilla', ts: T, deviceId: 'celulara', ...extra });
const guardada = (c: Awaited<ReturnType<typeof nueva>>, via: CartaGuardada['via'] = 'qr'): CartaGuardada => ({ ...c, via, synced: false, recibidoAt: 0 });

describe('«Estoy bien»', () => {
  it('pide nombre y mensaje; limpia saltos de línea y «|»', async () => {
    await expect(crearCarta({ nombre: ' ', mensaje: 'hola', ts: T, deviceId: 'a1' })).rejects.toThrow(/nombre/);
    await expect(crearCarta({ nombre: 'Ana Ruiz', mensaje: '  ', ts: T, deviceId: 'a1' })).rejects.toThrow(/mensaje/);
    const c = await crearCarta({ nombre: 'Ana\nRuiz', mensaje: 'estoy | bien', ts: T + 0.7, deviceId: 'a1' });
    expect(c).toMatchObject({ nombre: 'Ana Ruiz', mensaje: 'estoy bien', ts: T });
  });
  it('el id es el mismo en el celular y en el servidor, y cambia si alguien toca el texto', async () => {
    const c = await nueva('Luis Chunga');
    expect(c.id).toBe(idServidor(c));
    expect(await verificarId(c)).toBe(true);
    expect(await verificarId({ ...c, mensaje: 'Necesito que me depositen' })).toBe(false);
  });
  it('QR: varias cartas por código, ida y vuelta exacta', async () => {
    const largo = (i: number) => Array.from({ length: 30 }, (_, k) => ((i * 7919 + k * 104729) % 9973).toString(36)).join(' ').slice(0, 200);
    const cs = await Promise.all(['Luis Chunga', 'Rosa Chunga', 'Pedro Sosa', 'Ana Ruiz', 'José Ñique'].map((n, i) => nueva(n, { mensaje: largo(i) })));
    const qrs = codificarCartasQR(cs);
    expect(qrs.length).toBeGreaterThan(1);
    expect(qrs.every((q) => esCodigoCartas(q) && q.length <= 600 && /^YB1:[0-9A-Z]+:[0-9A-Z $%*+\-./:]+$/.test(q))).toBe(true);
    expect(qrs.flatMap(decodificarCartasQR)).toEqual(cs);
  });
  it('por QR van primero las mías y luego las más recientes, máximo 8 y de la última semana', async () => {
    const otras = await Promise.all(Array.from({ length: 10 }, (_, i) => nueva('Vecino ' + i, { ts: T - i * 60, deviceId: 'otro' + i })));
    const vieja = await nueva('Antigua Paz', { ts: T - 8 * 86_400 });
    const mia = await nueva('Yo Mismo', { ts: T - 3_600 });
    const r = cartasParaQR([...otras.map((c) => guardada(c)), guardada(vieja), guardada(mia, 'local')], T);
    expect(r).toHaveLength(8);
    expect(r[0].nombre).toBe('Yo Mismo');
    expect(r.some((c) => c.nombre === 'Antigua Paz')).toBe(false);
  });
  it('busca por nombre o por para quién, sin tildes ni mayúsculas, con al menos 3 letras', async () => {
    const cs = (await Promise.all(['José Ñique', 'Rosa Chunga'].map((n) => nueva(n)))).map((c) => guardada(c));
    expect(buscarCartas(cs, 'jose').map((c) => c.nombre)).toEqual(['José Ñique']);
    expect(buscarCartas(cs, 'ÑIQUE')).toHaveLength(1);
    expect(buscarCartas(cs, 'rosa')).toHaveLength(2); // «Rosa Chunga» firma y también es «para mi mamá, Rosa»
    expect(buscarCartas(cs, 'ro')).toEqual([]);
  });
  it('rechaza formas inválidas y deja claro quién lo escribió', async () => {
    const c = await nueva('Luis Chunga');
    expect(leerCarta({ ...c, mensaje: 'a\nb' })).toBeNull();
    expect(leerCarta({ ...c, id: 'xyz' })).toBeNull();
    expect(leerCarta({ ...c, mensaje: 'x'.repeat(201) })).toBeNull();
    const t = textoCarta(guardada(c));
    expect(t.titulo).toBe('💚 Luis Chunga está bien');
    expect(t.detalle).toContain('Para mi mamá, Rosa');
    expect(t.origen).toMatch(/la municipalidad no lo verifica · te lo pasó otro vecino/);
  });
});
