// Estado compartido de la interfaz 3D (sin DOM): centros poblados, fichas, cabezal, selección y pestaña.
// Los módulos de la UI se suscriben a eventos; nadie toca el DOM de otro módulo.
import type { CentroPoblado } from './contrato';
import { asociar, fichasSimuladas, type Ficha, type ResumenEscenario } from './datos';
import { ESCENARIO_INICIO, clamp, rango } from './tiempo';

export type Pestana = 'escenario' | 'campo' | 'relevo';
interface Eventos { t: number; fichas: Ficha[]; seleccion: CentroPoblado | null; pestana: Pestana; red: boolean; demo: boolean }

export class Tienda {
  centros: CentroPoblado[] = [];
  porCod = new Map<string, CentroPoblado>();
  resumen: ResumenEscenario | null = null;
  reales: Ficha[] = [];
  simuladas: Ficha[] = [];
  demo = false;
  asoc = new Map<string, string>();
  rango: [number, number];
  t: number;
  seleccion: CentroPoblado | null = null;
  pestana: Pestana = 'escenario';
  red: boolean;
  private subs: Partial<Record<keyof Eventos, Set<(v: never) => void>>> = {};

  constructor(public ahora = () => Date.now(), red = true) {
    this.red = red;
    this.rango = rango([], ahora());
    this.t = clamp(ahora(), ...this.rango);
  }

  on<K extends keyof Eventos>(k: K, cb: (v: Eventos[K]) => void) {
    const s = (this.subs[k] ??= new Set()) as unknown as Set<(v: Eventos[K]) => void>;
    s.add(cb);
    return () => { s.delete(cb); };
  }
  private emit<K extends keyof Eventos>(k: K, v: Eventos[K]) { (this.subs[k] as unknown as Set<(v: Eventos[K]) => void> | undefined)?.forEach((cb) => cb(v)); }

  /** Fichas visibles: las reales del equipo y, en modo demo, las SIMULADAS. */
  fichas(): Ficha[] { return this.demo ? [...this.reales, ...this.simuladas] : this.reales; }

  setCentros(cs: CentroPoblado[], resumen: ResumenEscenario | null = null) {
    this.centros = cs;
    this.porCod = new Map(cs.map((c) => [c.cod, c]));
    this.resumen = resumen;
    this.recalcular();
  }
  setReales(fs: Ficha[]) { this.reales = fs; this.recalcular(); }
  setDemo(on: boolean) {
    if (on === this.demo) return;
    this.demo = on;
    if (on) {
      const [a, b] = rango(this.reales.map((f) => f.ts), this.ahora());
      this.simuladas = fichasSimuladas(this.centros, Math.max(a, ESCENARIO_INICIO), b);
    } else this.simuladas = [];
    this.recalcular();
    this.emit('demo', on);
  }
  private recalcular() {
    const fs = this.fichas();
    this.asoc = asociar(fs, this.centros);
    this.rango = rango(fs.flatMap((f) => [f.ts, ...(f.syncedAt ? [f.syncedAt] : [])]), this.ahora());
    this.t = clamp(this.t, ...this.rango);
    this.emit('fichas', fs);
  }

  setT(t: number) {
    const v = clamp(t, ...this.rango);
    if (v === this.t) return;
    this.t = v;
    this.emit('t', v);
  }
  seleccionar(cp: CentroPoblado | null) {
    if (cp?.cod === this.seleccion?.cod) return;
    this.seleccion = cp;
    this.emit('seleccion', cp);
  }
  setPestana(p: Pestana) {
    if (p === this.pestana) return;
    this.pestana = p;
    this.emit('pestana', p);
  }
  setRed(on: boolean) { this.red = on; this.emit('red', on); }
}
