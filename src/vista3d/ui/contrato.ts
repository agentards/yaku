// Contrato entre la escena 3D (arquitecto-3d) y la interfaz que la envuelve (src/vista3d/ui).
// La UI solo habla con la escena a través de esta interfaz: la escena de prueba (../escena-prueba.ts)
// la implementa con MapLibre plano inclinado; la escena real (terreno DEM + cámara cinematográfica) la
// reemplaza sin tocar la UI.
import type { Map as MLMap, StyleSpecification } from 'maplibre-gl';

/** Capas reales que el panel puede encender, apagar y atenuar. */
export type CapaId = 'terreno' | 'basemap' | 'cenepred' | 'senamhi' | 'erosion' | 'limite' | 'citizen';

/** Centro poblado del escenario CENEPRED (data/cenepred-ccpp.geojson). */
export interface CentroPoblado {
  cod: string; n: string; d: string; pr: string; pob: number; niv: string;
  /** Nivel de exposición a inundaciones del Excel CENEPRED: 1 Muy bajo … 5 Muy alto. */
  r: 1 | 2 | 3 | 4 | 5;
  /** Cobertura móvil garantizada declarada por operadoras (OSIPTEL); null = sin dato OSIPTEL. */
  cg: boolean | null; g4: boolean | null;
  lon: number; lat: number;
}

/** Punto de reporte/ficha para dibujar en la escena (siempre NO VERIFICADO). */
export interface PuntoReporte { id: string; lat: number; lon: number; type: string; severity: number; note: string; state: string }

export interface PuntoPantalla { x: number; y: number }

export interface EscenaYaku {
  /** Mapa principal (MapLibre). La UI lo usa para marcadores y para escuchar movimiento de cámara. */
  readonly map: MLMap;
  /** Se resuelve cuando el estilo y las fuentes están cargados. */
  readonly listo: Promise<void>;
  /** true si hay terreno DEM activo (altitud real disponible). */
  tieneTerreno(): boolean;
  /** Capas que esta escena sabe manejar (el panel solo muestra estas). */
  capas(): CapaId[];
  setCapaVisible(id: CapaId, on: boolean): void;
  /** Opacidad 0..1 multiplicada sobre la opacidad de diseño de cada capa. */
  setCapaOpacidad(id: CapaId, v: number): void;
  /** Filtro «Solo sin cobertura garantizada según OSIPTEL» sobre los centros poblados. */
  setFiltroSinCobertura(on: boolean): void;
  setReportes(p: PuntoReporte[]): void;
  /** Resalta un centro poblado (o ninguno). */
  setSeleccion(cp: CentroPoblado | null): void;
  /** Vuelo de cámara al centro poblado (acercamiento + órbita lenta). Resuelve al llegar. */
  volarA(cp: CentroPoblado): Promise<void>;
  /** Vuelve a la vista regional de los 23 distritos del escenario. */
  vistaRegional(): Promise<void>;
  /** Altitud del DEM en m s.n.m., o null si no hay terreno. */
  altitud(lon: number, lat: number): number | null;
  /** Coordenadas de pantalla (px, relativas al contenedor) o null si queda detrás de la cámara. */
  proyectar(lon: number, lat: number): PuntoPantalla | null;
  /** Clic en un centro poblado de la escena. Devuelve la función para desuscribirse. */
  onElegirCentro(cb: (cod: string) => void): () => void;
  /** Estilo liviano para la mini-vista del portal (mismas fuentes locales, sin CDN). */
  estiloMiniVista(): StyleSpecification;
  /** Fuente de terreno para la mini-vista (si existe). */
  terrenoMiniVista(): { source: string; exaggeration: number } | null;
  /** Conmutador 2D|3D dentro de la misma escena (pitch 0 y sin terreno). */
  set2D(on: boolean): void;
  destruir(): void;
}
