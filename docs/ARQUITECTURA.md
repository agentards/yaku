# Arquitectura

## Contexto
```mermaid
flowchart LR
  subgraph Teléfono[PWA en el teléfono · funciona sin red]
    UI[UI TS vanilla<br/>Mapa · Registrar · Relevo · Sync]
    SW[Service worker<br/>Workbox precache]
    IDB[(IndexedDB<br/>registros · claves · acuses)]
    MAP[MapLibre GL 6<br/>+ PMTiles Piura z11]
    QR[Códec QR<br/>posicional + deflate + Base45 + CRC32]
  end
  subgraph Cloudflare
    W[Pages advanced mode<br/>_worker.js]
    D1[(D1<br/>reports / er_records)]
    KV[(KV yaku-relay-basemap<br/>PMTiles en trozos de 1 MB)]
  end
  UI --> IDB
  UI --> QR
  MAP --> SW
  SW -->|primera visita| W
  W --> KV
  UI -->|POST /api/sync| W --> D1
```

## Componentes
| Componente | Responsabilidad |
|---|---|
| `src/main.ts` | Pestañas, flujo de registro, relevo y sincronización |
| `src/codec.ts` | Codificación posicional, `deflateRaw` (pako), Base45, CRC32 y fragmentación en QR animado |
| `src/db.ts` | IndexedDB con deduplicación (`putIfAbsent`) |
| `src/sync.ts` | Consolidación diferida cuando vuelve la red |
| `src/scanner.ts` | Lectura de QR con BarcodeDetector cuando existe y jsQR como respaldo |
| `src/map.ts`, `src/layers.ts`, `src/basemap*.ts` | MapLibre, capas oficiales con fuente y fecha, y mapa base PMTiles guardado en Cache Storage |
| `server/worker.ts` | API `/api/*`, servicio del mapa base desde KV y archivos estáticos |

## Flujo de relevo
```mermaid
sequenceDiagram
  participant A as Evaluador (A, sin red)
  participant B as Portador (B)
  participant S as Worker + D1
  A->>A: Guarda la ficha (id = SHA-256 del contenido)
  A->>B: QR (1 a N fragmentos)
  B->>B: Reensambla, verifica CRC y guarda sin duplicar
  B-->>A: QR de acuse con los ids (en construcción)
  B->>S: POST /api/sync al encontrar red
  S->>S: Recalcula el id, verifica la firma (en construcción) e INSERT OR IGNORE
  S-->>B: {inserted, duplicates, rejected}
```

## API
| Ruta | Descripción |
|---|---|
| `POST /api/sync` | `{records:[…]}`. Valida cada registro y recalcula su id; rechaza los manipulados. Responde `{accepted, inserted, duplicates, rejected}` |
| `GET /api/stats` | Contadores |
| `GET /api/reports?limit=50` o `?ids=a,b` | Lectura de registros |
| `GET /basemap/*.pmtiles` | Mapa base desde KV, con soporte de Range |
| *(PRD)* `POST /api/er/sync`, `GET /api/er/status`, `GET /api/er/records?ccpp=` | Fichas `er1` firmadas y estado por centro poblado |

## Modelo de la ficha `er1` (en construcción)
Subconjunto del Anexo 01 con estos campos:

- centro poblado y ubigeo, tipo de peligro y hora del evento, coordenadas con su precisión;
- afectadas y damnificadas;
- lesionados, atrapados, aislados, desaparecidos y fallecidos, donde `null` significa «no evaluado», que no es lo mismo que 0;
- viviendas;
- vía: solo `interrumpida` o `sin_evaluar`;
- servicios interrumpidos y necesidades, guardados como bitmask;
- nota, alias del autor (sin DNI), clave pública, firma e id.

El esquema completo está en el PRD (`prd/PRD-yaku-relay-edan.md`, sección 4).
