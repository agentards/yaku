// Reglas de agrupación y de respaldo (0–100), en un solo objeto configurable.
// Fuente: la decisión de producto «confianza» §2.1–§3 (17-oct-2026). Cambiar aquí, no en el código.

export interface Familia {
  tipos: string[];
  /** Radio al ancla (primer reporte). null = no agrupa entre personas (solo nivel 3). */
  radioM: number | null;
  /** Ventana desde el último reporte del incidente. */
  ventanaH: number;
  /** Vida media del decaimiento del respaldo. */
  mediaVidaH: number;
}

export interface Reglas {
  familias: Record<string, Familia>;
  /** Nivel 3: misma persona + mismo tipo + ≤ metros + ≤ minutos = actualización. */
  nivel3: { metros: number; minutos: number };
  /** Si el ts del celular viene más de N min en el futuro respecto a la llegada, se usa la llegada. */
  relojFuturoMaxMin: number;
  /** Puntos por personas distintas: índice n-1, el último vale para n ≥ largo. */
  personasPts: number[];
  /** Puntos por dispositivos distintos con foto recibida. */
  fotosPts: number[];
  /** Cercanía (solo con ≥ 2 personas): mediana de distancias al ancla. hastaM null = el radio de la familia. */
  cercania: { hastaM: number | null; pts: number }[];
  recenciaPiso: number;
  /** Umbrales de nivel: N2 desde, N3 desde. */
  niveles: { n2: number; n3: number };
  /** Tipo principal del incidente: el primero de esta lista que aparezca. */
  gravedad: string[];
  /** Vida primero en la bandeja. */
  riesgoVida: string[];
  /** Marca «tiene foto» al final de la nota (= MARCA_FOTO de src/poblador/tipos.ts). Suma 0 hasta recibir la imagen. */
  marcaFoto: string;
}

export const REGLAS: Reglas = {
  familias: {
    agua: { tipos: ['agua', 'cauce', 'huaico', 'via_bloq'], radioM: 250, ventanaH: 3, mediaVidaH: 3 },
    // Casa dañada y heridos son necesidades distintas (bomberos/EDAN vs. ambulancia): cada una es su propio incidente.
    vivienda: { tipos: ['vivienda'], radioM: 100, ventanaH: 12, mediaVidaH: 12 },
    heridos: { tipos: ['heridos'], radioM: 100, ventanaH: 12, mediaVidaH: 12 },
    atrapados: { tipos: ['atrapados'], radioM: 50, ventanaH: 12, mediaVidaH: 12 },
    ayuda: { tipos: ['ayuda'], radioM: 150, ventanaH: 24, mediaVidaH: 24 },
    otro: { tipos: ['otro'], radioM: null, ventanaH: 3, mediaVidaH: 3 },
  },
  nivel3: { metros: 50, minutos: 30 },
  relojFuturoMaxMin: 10,
  personasPts: [25, 40, 50, 55],
  fotosPts: [15, 25],
  cercania: [{ hastaM: 50, pts: 20 }, { hastaM: 100, pts: 12 }, { hastaM: null, pts: 5 }],
  recenciaPiso: 0.2,
  niveles: { n2: 45, n3: 80 },
  gravedad: ['atrapados', 'heridos', 'vivienda', 'huaico', 'via_bloq', 'cauce', 'agua', 'ayuda', 'otro'],
  riesgoVida: ['atrapados', 'heridos'],
  marcaFoto: '(con foto)',
};

/** Reglas por defecto con cambios parciales (p. ej. desde la variable YAKU_REGLAS en JSON). */
export function conCambios(base: Reglas, cambios: unknown): Reglas {
  if (!cambios || typeof cambios !== 'object') return base;
  const c = cambios as Partial<Reglas>;
  return { ...base, ...c, familias: { ...base.familias, ...(c.familias ?? {}) }, nivel3: { ...base.nivel3, ...(c.nivel3 ?? {}) }, niveles: { ...base.niveles, ...(c.niveles ?? {}) } };
}

export function familiaDe(tipo: string, r: Reglas): string {
  for (const [k, f] of Object.entries(r.familias)) if (f.tipos.includes(tipo)) return k;
  return 'otro';
}
