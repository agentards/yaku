// Panel de la municipalidad (WP3): contador en rodillo 1 → 2 vecinos, desglose del respaldo, fotos pendientes y
// textos tomados de src/poblador/textos.ts. Reglas: agentards/producto/decision-confianza.md §1, §2.1 y §2.4.
import { describe, it, expect } from 'vitest';
import { desgloseHtml, pendientesHtml, rodillo, tramos } from '../src/vista3d/municipalidad/piezas';
import { ESTADO, estadoChip, esVerde, motivoDescarteTxt, respaldo, ROTULO_VECINAL, type Estado } from '../src/vista3d/municipalidad/textos';
import * as P from '../src/poblador/textos';

/** Lo que leería innerText: sin etiquetas y sin el número viejo (va en data-de, lo pinta ::before). */
const texto = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

describe('rodillo del contador', () => {
  it('1 → 2 vecinos: rueda hacia arriba, guarda el 1 en data-de y marca +1; el texto leído es «2 vecinos»', () => {
    const h = rodillo(2, 1, 'vecino', 'vecinos');
    expect(h).toContain('muni-rod-sube');
    expect(h).toContain('data-de="1"');
    expect(h).toContain('data-mas="+1"');
    expect(texto(h)).toBe('2 vecinos');
  });
  it('0 → 1 foto usa el singular; sin valor anterior o sin cambio queda texto plano', () => {
    expect(texto(rodillo(1, 0, 'foto', 'fotos'))).toBe('1 foto');
    expect(rodillo(1, null, 'vecino', 'vecinos')).toBe('1 vecino');
    expect(rodillo(3, 3, 'vecino', 'vecinos')).toBe('3 vecinos');
  });
  it('si baja (incidente cerrado) rueda al revés y sin «+»', () => {
    const h = rodillo(4, 6, '', '');
    expect(h).toContain('muni-rod-baja');
    expect(h).toContain('data-mas=""');
    expect(texto(h)).toBe('4');
  });
});

describe('desglose del respaldo (§2.1, ejemplos §2.4)', () => {
  it('B demo: «Personas 40 · Fotos 15 · Cercanía 20 · Recencia ×1,00 = 75»', () => {
    const { total, desglose } = respaldo({ personas: 2, personasConFoto: 1, medianaM: 40, radioM: 100, horas: 0, mediaVidaH: 12 });
    expect(total).toBe(75);
    expect(texto(desgloseHtml(desglose, total))).toBe('Personas 40 · Fotos 15 · Cercanía 20 · Recencia ×1,00 = 75');
  });
  it('E decae: los tramos suman el total y lo perdido por antigüedad va aparte', () => {
    const { total, desglose } = respaldo({ personas: 4, personasConFoto: 2, medianaM: 80, radioM: 250, horas: 1, mediaVidaH: 3 });
    expect(total).toBe(73);
    const t = tramos(desglose);
    expect(Math.round(t.personas + t.fotos + t.cercania)).toBe(73);
    expect(Math.round(t.perdido)).toBe(19);
    expect(texto(desgloseHtml(desglose, total))).toBe('Personas 55 · Fotos 25 · Cercanía 12 · Recencia ×0,79 = 73');
    expect(desgloseHtml(desglose, total)).toContain('muni-dg-perdido');
  });
  it('un vecino sin foto: solo el tramo de personas (sin fotos ni cercanía)', () => {
    const { total, desglose } = respaldo({ personas: 1, personasConFoto: 0, medianaM: null, radioM: 100, horas: 0, mediaVidaH: 12 });
    const h = desgloseHtml(desglose, total);
    expect(h).toContain('muni-dg-personas');
    expect(h).not.toContain('muni-dg-fotos');
    expect(h).not.toContain('muni-dg-cercania');
    expect(h).toContain('aria-label="Respaldo 25 de 100"');
  });
});

describe('fotos pendientes y textos desde src/poblador/textos.ts', () => {
  it('«1 foto pendiente de subir» / «2 fotos pendientes de subir»; 0 no pinta nada', () => {
    expect(texto(pendientesHtml(1))).toBe(`1 foto pendiente de subir${P.FOTOS_PENDIENTES_AYUDA}`);
    expect(pendientesHtml(2)).toContain('2 fotos pendientes de subir');
    expect(pendientesHtml(0)).toBe('');
  });
  it('los chips del panel son los mismos que ve el poblador', () => {
    expect(ESTADO.nuevo).toBe(P.ROTULO_VECINAL);
    expect(ROTULO_VECINAL).toBe('Reporte vecinal · por validar');
    for (const k of ['en_revision', 'validado', 'atendido', 'descartado'] as const) expect(ESTADO[k]).toBe(P.ESTADO[k]);
    expect(estadoChip('accion_asignada', 'bomberos')).toBe(P.ESTADO.accion('bomberos'));
    expect(estadoChip('accion_asignada', null)).toBe(P.ESTADO.accion(undefined));
    expect(motivoDescarteTxt('Duplicado de otro incidente')).toBe(P.ESTADO_DETALLE.descartado('Duplicado de otro incidente', ''));
  });
  it('verde solo para estados municipales; «nuevo» (vecinal) y «en revisión» no', () => {
    const verdes = (['nuevo', 'en_revision', 'validado', 'descartado', 'accion_asignada', 'atendido'] as Estado[]).filter(esVerde);
    expect(verdes).toEqual(['validado', 'accion_asignada', 'atendido']);
  });
  it('ningún chip usa palabras prohibidas (alerta, aviso, oficial, verificado, confirmado, emergencia)', () => {
    const chips = [...Object.values(ESTADO), ...Object.values(P.ACCION_TXT)];
    for (const c of chips) expect(c).not.toMatch(/alerta|aviso|oficial|verificad|confirmad|emergencia/i);
  });
});
