// Persistencia local con node:sqlite (Node ≥ 22.13, sin dependencias). Los reportes crudos nunca se borran:
// los incidentes son asignaciones reporte→incidente que el operador puede corregir (unir / separar).
import { DatabaseSync } from 'node:sqlite';
import { elegirIncidente, porHora, type Estado, type IncBase, type Rep } from './agrupacion.ts';
import { familiaDe, type Reglas } from './reglas.ts';

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, severity INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
  note TEXT NOT NULL, ts INTEGER NOT NULL, device_id TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, received_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS reports_received ON reports(received_at);
CREATE TABLE IF NOT EXISTS incidentes (
  id TEXT PRIMARY KEY, familia TEXT NOT NULL, ancla_lat REAL NOT NULL, ancla_lon REAL NOT NULL,
  creado_at INTEGER NOT NULL, recurrencia_de TEXT, unido_a TEXT);
CREATE TABLE IF NOT EXISTS asignaciones (
  report_id TEXT PRIMARY KEY, incidente_id TEXT NOT NULL, motivo TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS asig_inc ON asignaciones(incidente_id);
CREATE TABLE IF NOT EXISTS estados (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, incidente_id TEXT NOT NULL, estado TEXT NOT NULL, accion TEXT,
  motivo TEXT NOT NULL DEFAULT '', quien TEXT NOT NULL, cuando INTEGER NOT NULL, respaldo INTEGER);
CREATE INDEX IF NOT EXISTS estados_inc ON estados(incidente_id, seq);
CREATE TABLE IF NOT EXISTS ajustes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, incidente_id TEXT NOT NULL, tipo TEXT NOT NULL, detalle TEXT NOT NULL,
  quien TEXT NOT NULL, cuando INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS fotos (
  id TEXT PRIMARY KEY, report_id TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, received_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS fotos_rep ON fotos(report_id);
`;

export interface FilaEstado { seq: number; incidente_id: string; estado: Estado; accion: string | null; motivo: string; quien: string; usuario: string | null; cuando: number; respaldo: number | null }
export interface FilaIncidente { id: string; familia: string; ancla_lat: number; ancla_lon: number; creado_at: number; recurrencia_de: string | null; unido_a: string | null }
export interface FilaFoto { id: string; report_id: string; mime: string; bytes: number; received_at: number }
export interface FilaAjuste { seq: number; incidente_id: string; tipo: string; detalle: string; quien: string; usuario: string | null; cuando: number }

export interface Todo {
  incidentes: FilaIncidente[]; reportes: (Rep & { incidente_id: string | null })[];
  estados: FilaEstado[]; fotos: FilaFoto[]; ajustes: FilaAjuste[];
}

export class Almacen {
  readonly db: DatabaseSync;
  readonly reglas: Reglas;

  constructor(ruta: string, reglas: Reglas) {
    this.db = new DatabaseSync(ruta);
    this.reglas = reglas;
    if (ruta !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.db.exec(ESQUEMA);
    // Migración: quién (sub de Clerk o 'pin') junto al nombre que manda el cliente.
    for (const t of ['estados', 'ajustes']) {
      const cols = this.db.prepare(`PRAGMA table_info(${t})`).all() as unknown as { name: string }[];
      if (!cols.some((c) => c.name === 'usuario')) this.db.exec(`ALTER TABLE ${t} ADD COLUMN usuario TEXT`);
    }
    this.asignarPendientes(Date.now());
  }

  cerrar() { this.db.close(); }

  private tx<T>(f: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = f(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  /** INSERT OR IGNORE (idempotente por id) y asigna los nuevos a incidentes. Devuelve cuántos eran nuevos. */
  insertarReportes(recs: { id: string; type: string; severity: number; lat: number; lon: number; note: string; ts: number; deviceId: string }[], ahora: number): number {
    return this.tx(() => {
      const st = this.db.prepare('INSERT OR IGNORE INTO reports (id,type,severity,lat,lon,note,ts,device_id,verified,received_at) VALUES (?,?,?,?,?,?,?,?,0,?)');
      let n = 0;
      for (const o of recs) n += Number(st.run(o.id, o.type, o.severity, o.lat, o.lon, o.note, o.ts, o.deviceId, ahora).changes);
      if (n) this.asignarPendientes(ahora);
      return n;
    });
  }

  /** Incidentes visibles con sus miembros y estado actual (base para elegir a cuál va un reporte). */
  private bases(): IncBase[] {
    const incs = this.db.prepare('SELECT * FROM incidentes WHERE unido_a IS NULL').all() as unknown as FilaIncidente[];
    const miembros = this.db.prepare('SELECT r.*, a.incidente_id FROM reports r JOIN asignaciones a ON a.report_id = r.id').all() as unknown as (Rep & { incidente_id: string })[];
    const est = this.estadosActuales();
    const por = new Map<string, Rep[]>();
    for (const m of miembros) (por.get(m.incidente_id) ?? por.set(m.incidente_id, []).get(m.incidente_id)!).push(m);
    return incs.map((i) => ({ id: i.id, familia: i.familia, anclaLat: i.ancla_lat, anclaLon: i.ancla_lon, estado: est.get(i.id)?.estado ?? 'nuevo', miembros: por.get(i.id) ?? [] }));
  }

  estadosActuales(): Map<string, FilaEstado> {
    const filas = this.db.prepare('SELECT * FROM estados ORDER BY seq').all() as unknown as FilaEstado[];
    const m = new Map<string, FilaEstado>();
    for (const f of filas) m.set(f.incidente_id, f);
    return m;
  }

  /** Asigna, en orden de hora, los reportes que aún no tienen incidente. */
  asignarPendientes(ahora: number) {
    const sueltos = (this.db.prepare('SELECT r.* FROM reports r LEFT JOIN asignaciones a ON a.report_id = r.id WHERE a.report_id IS NULL').all() as unknown as Rep[])
      .sort(porHora(this.reglas));
    if (!sueltos.length) return;
    const bases = this.bases();
    const insInc = this.db.prepare('INSERT INTO incidentes (id,familia,ancla_lat,ancla_lon,creado_at,recurrencia_de) VALUES (?,?,?,?,?,?)');
    const insAsig = this.db.prepare('INSERT OR REPLACE INTO asignaciones (report_id,incidente_id,motivo,at) VALUES (?,?,?,?)');
    const existe = this.db.prepare('SELECT 1 AS x FROM incidentes WHERE id = ?');
    for (const r of sueltos) {
      const e = elegirIncidente(r, bases, this.reglas);
      if (e.id) {
        insAsig.run(r.id, e.id, e.motivo, ahora);
        bases.find((b) => b.id === e.id)!.miembros.push(r);
        continue;
      }
      let id = 'inc-' + r.id;
      for (let k = 2; existe.get(id); k++) id = `inc-${r.id}-${k}`;
      const familia = familiaDe(r.type, this.reglas);
      insInc.run(id, familia, r.lat, r.lon, ahora, e.recurrenciaDe);
      insAsig.run(r.id, id, 'nuevo', ahora);
      bases.push({ id, familia, anclaLat: r.lat, anclaLon: r.lon, estado: 'nuevo', miembros: [r] });
    }
  }

  todo(): Todo {
    return {
      incidentes: this.db.prepare('SELECT * FROM incidentes').all() as unknown as FilaIncidente[],
      reportes: this.db.prepare('SELECT r.*, a.incidente_id FROM reports r LEFT JOIN asignaciones a ON a.report_id = r.id').all() as unknown as Todo['reportes'],
      estados: this.db.prepare('SELECT * FROM estados ORDER BY seq').all() as unknown as FilaEstado[],
      fotos: this.db.prepare('SELECT * FROM fotos').all() as unknown as FilaFoto[],
      ajustes: this.db.prepare('SELECT * FROM ajustes ORDER BY seq').all() as unknown as FilaAjuste[],
    };
  }

  incidente(id: string): FilaIncidente | null {
    return (this.db.prepare('SELECT * FROM incidentes WHERE id = ?').get(id) as unknown as FilaIncidente | undefined) ?? null;
  }

  guardarEstado(f: Omit<FilaEstado, 'seq' | 'usuario'> & { usuario?: string | null }) {
    this.db.prepare('INSERT INTO estados (incidente_id,estado,accion,motivo,quien,usuario,cuando,respaldo) VALUES (?,?,?,?,?,?,?,?)')
      .run(f.incidente_id, f.estado, f.accion, f.motivo, f.quien, f.usuario ?? null, f.cuando, f.respaldo);
  }

  /** Une `otro` dentro de `id`: sus reportes pasan a `id` (manual) y `otro` queda oculto con unido_a. */
  unir(id: string, otro: string, quien: string, ahora: number, usuario: string | null = null) {
    this.tx(() => {
      this.db.prepare("UPDATE asignaciones SET incidente_id = ?, motivo = 'manual', at = ? WHERE incidente_id = ?").run(id, ahora, otro);
      this.db.prepare('UPDATE incidentes SET unido_a = ? WHERE id = ?').run(id, otro);
      this.db.prepare('INSERT INTO ajustes (incidente_id,tipo,detalle,quien,usuario,cuando) VALUES (?,?,?,?,?,?)').run(id, 'unir', otro, quien, usuario, ahora);
    });
  }

  /** Saca `reportIds` de `id` a un incidente nuevo (ancla = el primero por hora). Devuelve el id nuevo. */
  separar(id: string, reportIds: string[], quien: string, ahora: number, usuario: string | null = null): string {
    return this.tx(() => {
      const ph = reportIds.map(() => '?').join(',');
      const reps = (this.db.prepare(`SELECT r.* FROM reports r JOIN asignaciones a ON a.report_id = r.id WHERE a.incidente_id = ? AND r.id IN (${ph})`).all(id, ...reportIds) as unknown as Rep[]).sort(porHora(this.reglas));
      if (!reps.length) throw new Error('ninguno de esos reportes es de este incidente');
      const inc = this.incidente(id)!;
      let nuevo = `inc-${reps[0].id}-s`;
      for (let k = 2; this.incidente(nuevo); k++) nuevo = `inc-${reps[0].id}-s${k}`;
      this.db.prepare('INSERT INTO incidentes (id,familia,ancla_lat,ancla_lon,creado_at) VALUES (?,?,?,?,?)').run(nuevo, inc.familia, reps[0].lat, reps[0].lon, ahora);
      const up = this.db.prepare("UPDATE asignaciones SET incidente_id = ?, motivo = 'manual', at = ? WHERE report_id = ?");
      for (const r of reps) up.run(nuevo, ahora, r.id);
      const aj = this.db.prepare('INSERT INTO ajustes (incidente_id,tipo,detalle,quien,usuario,cuando) VALUES (?,?,?,?,?,?)');
      aj.run(id, 'separar', `${reps.map((r) => r.id).join(',')} → ${nuevo}`, quien, usuario, ahora);
      aj.run(nuevo, 'separado_de', id, quien, usuario, ahora);
      return nuevo;
    });
  }

  guardarFoto(f: FilaFoto): boolean {
    return Number(this.db.prepare('INSERT OR IGNORE INTO fotos (id,report_id,mime,bytes,received_at) VALUES (?,?,?,?,?)').run(f.id, f.report_id, f.mime, f.bytes, f.received_at).changes) > 0;
  }

  foto(id: string): FilaFoto | null {
    return (this.db.prepare('SELECT * FROM fotos WHERE id = ?').get(id) as unknown as FilaFoto | undefined) ?? null;
  }

  // ---- mismas consultas que server/worker.ts ----
  stats() {
    const t = this.db.prepare('SELECT COUNT(*) AS total, COUNT(DISTINCT id) AS unique_ids, MAX(received_at) AS last FROM reports').get() as any;
    const byType = this.db.prepare('SELECT type, COUNT(*) AS n FROM reports GROUP BY type').all();
    return { ...t, byType };
  }
  reportesPorId(ids: string[]) {
    return ids.length ? this.db.prepare(`SELECT * FROM reports WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
  }
  ultimosReportes(limit: number) {
    return this.db.prepare('SELECT * FROM reports ORDER BY received_at DESC LIMIT ?').all(limit);
  }
  /** Histórico: recibidos desde `desde` (ms), del más antiguo al más nuevo (índice reports_received). */
  reportesDesde(desde: number, limit: number) {
    return this.db.prepare('SELECT * FROM reports WHERE received_at >= ? ORDER BY received_at, id LIMIT ?').all(desde, limit) as unknown as { received_at: number }[];
  }
}
