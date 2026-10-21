// Notas de zona en el detalle del incidente (src/vista3d/monitoreo/memoria.ts): la sección se oculta si el servidor
// no tiene Atomic Memory, nunca muestra «guardada» sin confirmación del servidor y deja claro que no decide nada.
import { describe, expect, it } from 'vitest';
import { AVISO_NOTAS, escribirNota, notasHtml, traerNotas, zonaDe } from '../src/vista3d/monitoreo/memoria';

const cab = async () => ({ authorization: 'Bearer t' });
const responde = (status: number, cuerpo: unknown) => async () => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
const nota = { id: 'a1', texto: 'Puente cerrado; entrar por Av. Grau', zona: 'Castilla (Castilla)', incidente: 'inc-aaaaaaaaaa1', creada: '2026-10-20T15:00:00Z' };

describe('notas de zona: lectura', () => {
  it('servidor sin Atomic Memory → null (la sección se oculta)', async () => {
    expect(await traerNotas({ zona: 'Castilla', tipo: 'agua' }, cab, responde(200, { activa: false }))).toEqual({ ok: true, notas: null });
  });
  it('lee las notas y descarta lo que no tiene la forma esperada', async () => {
    const r = await traerNotas({ zona: 'Castilla', tipo: 'agua' }, cab, responde(200, { activa: true, notas: [nota, { id: 3 }] }));
    expect(r).toEqual({ ok: true, notas: [nota] });
  });
  it('proveedor caído o sin red: error visible, no lista vacía', async () => {
    expect(await traerNotas({ zona: 'C', tipo: 'agua' }, cab, responde(502, { error: 'Atomic Memory no respondió: no se pudieron leer las notas de zona.' })))
      .toEqual({ ok: false, error: 'Atomic Memory no respondió: no se pudieron leer las notas de zona.' });
    expect((await traerNotas({ zona: 'C', tipo: 'agua' }, cab, async () => { throw new TypeError('offline'); })).ok).toBe(false);
  });
});

describe('notas de zona: escritura sin «guardado» falso', () => {
  const guardar = { kind: 'guardar' as const, zona: 'Castilla', texto: 'Puente cerrado', incidente: 'inc-aaaaaaaaaa1', reemplaza: null };
  it('solo dice «guardada» con guardada:true del servidor', async () => {
    expect(await escribirNota(guardar, cab, responde(201, { activa: true, guardada: true, nota }))).toEqual({ ok: true, mensaje: 'Nota guardada en Atomic Memory.' });
    expect((await escribirNota(guardar, cab, responde(200, { activa: false }))).ok).toBe(false);
    expect(await escribirNota(guardar, cab, responde(502, { error: 'Atomic Memory no respondió: la nota NO se guardó.' }))).toEqual({ ok: false, error: 'Atomic Memory no respondió: la nota NO se guardó.' });
    expect(await escribirNota(guardar, cab, async () => { throw new TypeError('offline'); })).toEqual({ ok: false, error: 'Sin conexión con el servidor: la nota NO se guardó.' });
  });
  it('corrección: avisa si la nota anterior no se pudo borrar', async () => {
    const r = await escribirNota({ ...guardar, reemplaza: 'a1' }, cab, responde(201, { guardada: true, nota, anterior: 'no_borrada' }));
    expect(r).toEqual({ ok: true, mensaje: 'Corrección guardada, pero la nota anterior no se pudo borrar: bórrala a mano.' });
  });
  it('borrar distingue «borrada» de «ya no estaba»', async () => {
    expect(await escribirNota({ kind: 'borrar', id: 'a1' }, cab, responde(200, { borrada: true }))).toEqual({ ok: true, mensaje: 'Nota borrada de Atomic Memory.' });
    expect(await escribirNota({ kind: 'borrar', id: 'a1' }, cab, responde(200, {}))).toEqual({ ok: false, error: 'El servidor no confirmó el borrado.' });
    expect(await escribirNota({ kind: 'borrar', id: 'a1' }, cab, async () => { throw new Error('offline'); })).toEqual({ ok: false, error: 'Sin conexión con el servidor: la nota NO se borró.' });
    expect(await escribirNota({ kind: 'borrar', id: 'a1' }, cab, responde(200, { borrada: false, resultado: 'no_existe' }))).toEqual({ ok: true, mensaje: 'La nota ya no estaba guardada.' });
  });
});

describe('notas de zona: HTML', () => {
  it('oculto no pinta nada; la lista dice que es contexto y no decide', () => {
    expect(notasHtml({ kind: 'oculto' })).toBe('');
    const h = notasHtml({ kind: 'lista', zona: 'Castilla (Castilla)', notas: [nota], editando: null });
    expect(h).toContain(AVISO_NOTAS);
    expect(h).toContain('Puente cerrado; entrar por Av. Grau');
    expect(h).toContain('data-mem-corregir="a1"');
    expect(h).toContain('Guardar nota');
  });
  it('corregir precarga el texto; los textos se escapan', () => {
    const h = notasHtml({ kind: 'lista', zona: 'Z', notas: [{ ...nota, texto: '<b>x</b> & y' }], editando: 'a1' });
    expect(h).toContain('Guardar corrección');
    expect(h).toContain('&#60;b&#62;x&#60;/b&#62; &#38; y</textarea>');
    expect(h).not.toContain('<b>x</b>');
  });
  it('error muestra el motivo y permite reintentar', () => {
    expect(notasHtml({ kind: 'error', zona: 'Z', error: 'Atomic Memory no respondió a tiempo' })).toContain('data-mem-reintentar');
  });
});

describe('zona del incidente', () => {
  const centro = { cod: '2001', n: 'Castilla', d: 'Castilla', lat: -5.19, lon: -80.62 };
  const inc = (lat: number, lon: number) => ({ id: 'inc-aaaaaaaaaa1', lat, lon });
  it('centro poblado ≤ 3 km; si no hay, la celda de ~1 km; null mientras cargan los centros', () => {
    const porCod = new Map([[centro.cod, centro]]);
    expect(zonaDe(inc(-5.195, -80.625), [centro], porCod)).toBe('Castilla (Castilla)');
    expect(zonaDe(inc(-5.5, -80.9), [centro], porCod)).toBe('Cerca de -5.50, -80.90');
    expect(zonaDe(inc(-5.195, -80.625), [], new Map())).toBeNull();
  });
});
