// Arma la respuesta de GET /api/incidentes a partir de las filas (lógica pura). Forma pensada para
// src/vista3d/municipalidad/incidentes.ts (leerIncidente): id, tipo, tipos, severidad, lat, lon, personas,
// reportes, fotos, n_fotos, primer_reporte, ultimo_reporte, recibido, puntaje, estado, accion, motivo, historial…
import { compararPrioridad, horaMs, respaldo, tipoPrincipal, type Estado, type Respaldo } from './agrupacion.ts';
import type { Todo } from './almacen.ts';
import { CONGELA } from './estados.ts';
import type { Reglas } from './reglas.ts';

export interface IncidenteVista {
  id: string; familia: string; tipo: string; tipos: string[]; severidad: number;
  lat: number; lon: number; ancla: { lat: number; lon: number };
  personas: number; reportes: number; n_reportes: number; reportes_ids: string[]; notas: string[];
  fotos: string[]; n_fotos: number; personas_con_foto: number;
  /** Personas que marcaron «(con foto)» y cuya imagen aún no llegó al servidor: suman 0 al respaldo. */
  fotos_pendientes: number;
  primer_reporte: number; ultimo_reporte: number; recibido: number;
  /** Respaldo 0–100 (decision-confianza.md §2.1). Congelado al validar. */
  puntaje: number; respaldo: number; nivel: Respaldo['nivel']; desglose: Respaldo['desglose']; respaldo_congelado: boolean;
  mediana_m: number | null;
  estado: Estado; accion: string | null; motivo: string;
  /** quien = nombre que manda el cliente; usuario = sub de Clerk, 'pin' o null (antes de la migración). */
  historial: { estado: Estado; accion: string | null; motivo: string; quien: string; usuario: string | null; cuando: number }[];
  ajustes: { tipo: string; detalle: string; quien: string; usuario: string | null; cuando: number }[];
  recurrencia_de: string | null; nuevos_tras_descarte: number; riesgo_vida: boolean;
}

export function armarIncidentes(t: Todo, ahora: number, reglas: Reglas): IncidenteVista[] {
  const porInc = new Map<string, Todo['reportes']>();
  for (const r of t.reportes) if (r.incidente_id) (porInc.get(r.incidente_id) ?? porInc.set(r.incidente_id, []).get(r.incidente_id)!).push(r);
  const fotosDeRep = new Map<string, string[]>();
  for (const f of t.fotos) (fotosDeRep.get(f.report_id) ?? fotosDeRep.set(f.report_id, []).get(f.report_id)!).push(f.id);
  const histDe = new Map<string, Todo['estados']>();
  for (const e of t.estados) (histDe.get(e.incidente_id) ?? histDe.set(e.incidente_id, []).get(e.incidente_id)!).push(e);
  const ajDe = new Map<string, Todo['ajustes']>();
  for (const a of t.ajustes) (ajDe.get(a.incidente_id) ?? ajDe.set(a.incidente_id, []).get(a.incidente_id)!).push(a);

  const out: IncidenteVista[] = [];
  for (const inc of t.incidentes) {
    const miembros = porInc.get(inc.id);
    if (inc.unido_a || !miembros?.length) continue;
    const fotos = miembros.flatMap((m) => fotosDeRep.get(m.id) ?? []);
    const conFoto = new Set(miembros.filter((m) => fotosDeRep.has(m.id)).map((m) => m.device_id));
    // La foto vale cuando llega (§2.1): la marca sola no suma, se muestra como pendiente (1 por dispositivo).
    const marcaron = new Set(miembros.filter((m) => m.note.trim().endsWith(reglas.marcaFoto)).map((m) => m.device_id));
    const pendientes = [...marcaron].filter((d) => !conFoto.has(d)).length;
    const r = respaldo({ familia: inc.familia, anclaLat: inc.ancla_lat, anclaLon: inc.ancla_lon, miembros }, conFoto, ahora, reglas);
    const hist = histDe.get(inc.id) ?? [];
    const actual = hist.at(-1);
    const estado: Estado = actual?.estado ?? 'nuevo';
    // Al validar, el respaldo se congela como dato histórico (decision-confianza.md §2.3).
    const validacion = CONGELA.includes(estado) ? [...hist].reverse().find((h) => h.estado === 'validado' && h.respaldo !== null) : undefined;
    const puntaje = validacion?.respaldo ?? r.total;
    const descarte = estado === 'descartado' ? actual!.cuando : null;
    const tipos = [...new Set(miembros.map((m) => m.type))];
    const tipo = tipoPrincipal(tipos, reglas);
    const accion = [...hist].reverse().find((h) => h.accion)?.accion ?? null;
    out.push({
      id: inc.id, familia: inc.familia, tipo, tipos, severidad: r.severidad,
      lat: inc.ancla_lat, lon: inc.ancla_lon, ancla: { lat: inc.ancla_lat, lon: inc.ancla_lon },
      personas: r.personas, reportes: miembros.length, n_reportes: miembros.length, reportes_ids: miembros.map((m) => m.id),
      notas: miembros.map((m) => m.note.trim()).filter(Boolean),
      fotos, n_fotos: fotos.length, personas_con_foto: r.personasConFoto, fotos_pendientes: pendientes,
      primer_reporte: Math.min(...miembros.map((m) => horaMs(m, reglas))), ultimo_reporte: r.ultimo,
      recibido: Math.max(...miembros.map((m) => m.received_at)),
      puntaje, respaldo: puntaje, nivel: validacion ? nivelDe(puntaje, reglas) : r.nivel, desglose: r.desglose,
      respaldo_congelado: !!validacion, mediana_m: r.medianaM,
      estado, accion: estado === 'accion_asignada' || estado === 'atendido' ? accion : null, motivo: actual?.motivo ?? '',
      historial: hist.map((h) => ({ estado: h.estado, accion: h.accion, motivo: h.motivo, quien: h.quien, usuario: h.usuario ?? null, cuando: h.cuando })),
      ajustes: (ajDe.get(inc.id) ?? []).map((a) => ({ tipo: a.tipo, detalle: a.detalle, quien: a.quien, usuario: a.usuario ?? null, cuando: a.cuando })),
      recurrencia_de: inc.recurrencia_de, nuevos_tras_descarte: descarte === null ? 0 : miembros.filter((m) => m.received_at > descarte).length,
      riesgo_vida: reglas.riesgoVida.includes(tipo),
    });
  }
  return out.sort(compararPrioridad(reglas));
}

const nivelDe = (n: number, reglas: Reglas): Respaldo['nivel'] => (n >= reglas.niveles.n3 ? 'N3' : n >= reglas.niveles.n2 ? 'N2' : 'N1');

/** GET /api/estado?ids=: estado de MIS reportes para el acuse que vuelve al celular (y que puede viajar por QR). */
export function estadoDeReportes(ids: string[], incs: IncidenteVista[], t: Todo) {
  const incDe = new Map<string, IncidenteVista>();
  for (const i of incs) for (const r of i.reportes_ids) incDe.set(r, i);
  const recDe = new Map(t.reportes.map((r) => [r.id, r.received_at]));
  return ids.map((id) => {
    const i = incDe.get(id);
    const rec = recDe.get(id);
    if (rec === undefined) return { id, recibido: false };
    const ult = i?.historial.at(-1);
    return {
      id, recibido: true, recibido_at: rec, incidente: i?.id ?? null,
      estado: i?.estado ?? 'nuevo', accion: i?.accion ?? null, motivo: i?.estado === 'descartado' ? i.motivo : '',
      cuando: ult?.cuando ?? null, personas: i?.personas ?? 1,
    };
  });
}
