# README técnico del prototipo (README original del código en producción)

> Movido desde la raíz al fusionar con la documentación. Las cifras vigentes (1.255 = 930 + 317 + 8) están en [HANDOFF.md](../HANDOFF.md) y [ESTADO.md](ESTADO.md); este archivo conserva el detalle técnico histórico tal como estaba. Las rutas `../data/...` apuntan a `data/` en la raíz del repo.


Prototipo **técnico y desechable** que mide dos riesgos: **(1) offline real** (segunda apertura sin red, incluido el mapa y sus capas) y **(2) relevo de registros estructurados por QR** entre equipos sin internet, con consolidación diferida. Nada de esto está aprobado como producto.

- Rediseño (rama de Pages `rediseno-mapa`): https://rediseno-mapa.yaku-relay-proto.pages.dev/
- Producción (`main`): https://yaku-relay-proto.pages.dev/ — tiene el rediseño desplegado el 17/10/2026 a las 13:13 (Lima), **anterior** al cambio de leyenda SENAMHI/SIGRID; no se revirtió.

## Cómo correrlo
```bash
npm ci                 # lockfile compatible con npm 10
npm run dev            # http://localhost:5173 (sin service worker)
npm run build && npm run preview   # http://localhost:4173 con service worker
npm test               # build + vitest (codec, IndexedDB, Worker+D1 falso, bundle)
npm run e2e            # Playwright, viewport Android 412x915 → results/e2e-android.json
npm run e2e:desktop    # 1280x800 → results/e2e-desktop.json
BASE_URL=https://rediseno-mapa.yaku-relay-proto.pages.dev/ node scripts/e2e.mjs   # remoto con D1 real
npm run measure:qr     # tabla payload/QR → results/qr-measure.md
npm run prep:data      # recorta/simplifica capas desde ../data → public/data
npm run screens        # capturas → results/screens/despues-*.png
CF_BRANCH=rediseno-mapa npm run build:worker   # dist/ → deploy/_worker.js + deploy/deploy-code.js
```
E2E: usa `/usr/bin/google-chrome` (o `CHROME=…`). Las pruebas locales interceptan `/api/*`; las remotas usan el Worker + D1 de verdad.

## Qué hace (pestañas inferiores en móvil, panel lateral en escritorio)
- **Mapa**: MapLibre GL empaquetado localmente, **mapa base vectorial propio de Piura (PMTiles, Protomaps, © OpenStreetMap contributors)** que funciona sin red, y capas reales en EPSG:4326. Abre encuadrado en los 23 distritos andinos del escenario CENEPRED 23077 (`fitBounds` [-80.77, -5.94, -79.21, -4.08] + padding 24 px). La leyenda muestra fuente y fecha de cada capa. Ya no existe la capa raster de tile.openstreetmap.org.
- **Registrar**: al abrir la pestaña y al guardar se toma el GPS de forma automática. El punto se ajusta arrastrando el marcador; las coordenadas manuales quedan plegadas como respaldo. Botones grandes para elegir tipo y severidad, más una nota opcional.
- **Relevo**: QR (animado si no cabe en uno solo), enlace `#p=…` plegado, cámara (selector de cámara; el video aparece solo al iniciarla), subida de imagen o captura del QR y **barra de progreso** de fragmentos.
- **Sync**: contadores **en relevo → consolidado**; consolida sola al volver la red. Ajustes y diagnóstico plegados: endpoint (`/api/sync` por defecto; `mock:local` solo aquí), caracteres por QR, deviceId, build, estado del service worker.
- Los reportes ciudadanos llevan borde discontinuo ámbar y la etiqueta **NO VERIFICADO**; en el mapa son un punto ámbar con halo. La insignia de fuente solo aparece junto a las capas oficiales reales (leyenda y popups). Ya no hay plantilla «FUENTE OFICIAL». No se implementaron «zonas sin evaluar», que dependen de una decisión de producto.

## Capas (results/data-prep.json)
| Capa | Fuente | Fecha | Original → empaquetado |
|---|---|---|---|
| Pronóstico SENAMHI: aviso de activación de quebradas 24 h (55 polígonos; Nivel 2: 43, Nivel 3: 12). **NIVEL = nivel de aviso, no profundidad**. La leyenda calcula emisión + 24 h frente a la hora actual y muestra «VIGENTE» o «VENCIDO, se muestra como ejemplo» | SENAMHI vía geoservicio INDECI (`SDE.SENAMHI_AvisoActQuebrada24H`) | aviso 15/10/2026; descargado 17/10/2026 | (piura_minimo 806 766 B) → 20 217 B |
| SIGRID: áreas expuestas a erosión (69) | SIGRID/CENEPRED, obtenida vía geoservicio de INDECI | documentos 2019–2024 | 2 950 745 B → 78 070 B + 18 497 B (centroides para zoom < 11) |
| Límite departamental de Piura | INDECI LimitesAdministrativos | descargado 17/10/2026 | → 9 633 B |

Se simplificaron con mapshaper (`-clean`, Douglas-Peucker con `keep-shapes`) y se dejaron solo los campos necesarios. Las capas van en el precache del service worker.

## Backend (Cloudflare Pages advanced mode `_worker.js` + D1)
- `POST /api/sync` `{records:[…]}`: valida cada registro y **recalcula el id desde el contenido** (rechaza manipulados), luego hace `INSERT OR IGNORE` en `reports(id PRIMARY KEY, …, verified=0, received_at)`. Responde `{accepted, inserted, duplicates, rejected}`.
- `GET /api/stats`, `GET /api/reports?limit=50` o `?ids=a,b,c`.
- D1 `yaku-relay-proto-db` enlazado como `DB` (producción y preview). **Sin autenticación ni límite de tasa**: es un endpoint público de prueba. Contiene registros de prueba de los E2E remotos.

## Decisiones (cada pieza tiene una función medible)
| Pieza | Por qué | Medición |
|---|---|---|
| Vite + TS vanilla, CSS propio | Sin framework UI | JS 1,29 MB (370 KB gzip) + worker de MapLibre 508 KB (144 KB gzip); precache total 1,99 MB, 15 entradas |
| MapLibre GL JS 6.14 (la 5.x tenía el aviso crítico GHSA-jrc7-96c5-q579; el worker se empaqueta con `setWorkerUrl`) | Mapa vectorial WebGL sin tiles obligatorios | E2E (m): capas renderizadas sin red, 0 hosts remotos |
| vite-plugin-pwa / Workbox | Precache de app, mapa y GeoJSON; `navigateFallback` (excepto `/api/`) | E2E (a) y (f): con el servidor apagado, la app y el mapa cargan |
| idb | IndexedDB con dedup `putIfAbsent` | tests db |
| Formato posicional + pako `deflateRaw` + Base45/alfanumérico + CRC32 | Ver results/qr-measure.md | 20 registros → 655 B → QR v21 (v34 con JSON crudo) |
| qrcode / jsQR (BarcodeDetector cuando existe) | Generar y leer QR offline | E2E (c) y (d) |
| mapshaper (solo desarrollo) | Reparar y simplificar geometrías | 3,76 MB → 126 KB |

## Licencias y atribuciones
- MapLibre GL JS: BSD-3-Clause (© MapLibre contributors, © Mapbox). qrcode: MIT. jsQR: Apache-2.0. pako: MIT y Zlib. idb: ISC. Workbox y vite-plugin-pwa: MIT. mapshaper (herramienta de desarrollo): MPL-2.0. Playwright: Apache-2.0.
- **Mapa base**: datos **© OpenStreetMap contributors**, licencia **ODbL 1.0** (https://www.openstreetmap.org/copyright); teselas **Protomaps Basemap** (build 20261017, tileset v4.15.2). El crédito «Protomaps · © OpenStreetMap contributors (ODbL)» se ve siempre en la esquina inferior izquierda del mapa, también sin red y con la atribución compacta plegada. **ODbL share-alike**: el `.pmtiles` es un *Produced Work*. Si se redistribuye una base de datos derivada (por ejemplo, un recorte modificado o datos de OSM extraídos de las teselas), hay que publicarla bajo ODbL y ofrecer la base o el método para reproducirla: `pmtiles extract https://build.protomaps.com/20261017.pmtiles … --bbox=-81.43,-6.48,-79.11,-3.98 --maxzoom=11|12`. Estilo: `@protomaps/basemaps` 5.7.2 (código BSD-3-Clause; diseño CC0), flavor `light` con colores atenuados. Fuentes Noto Sans (SIL OFL 1.1, `public/basemap/fonts/OFL.txt`) y sprites v4 `light` (íconos derivados de Mapzen, MIT) de `protomaps/basemaps-assets` (commit 028c18f), servidos desde el propio sitio. `pmtiles` 4.5.0: BSD-3-Clause. Detalle en `../data/basemap/LICENSE_BASEMAP.md`.
- **Escenario de riesgo CENEPRED/SIGRID 23077** (anexo Excel del Aviso SENAMHI 421_2026). Ubicación de centros poblados: IGN «Dataset Centros Poblados» (License Not Specified).
- Datos: SENAMHI y CENEPRED/SIGRID obtenidos a través del geoservicio de INDECI; límites de INDECI. Los servicios **no declaran licencia**. SIGRID indica «libre acceso… con crédito a los autores». Atribución visible en la leyenda y en el control de atribución del mapa. Detalle en `../data/RESUMEN_DATOS.md`.

## Qué NO se probó (pendiente en hardware real)
Cámara física y QR animado entre teléfonos; BarcodeDetector real (Chrome Android); iOS Safari; Brave Android; GPS real y su precisión; permiso de cámara en modo avión; instalación como PWA; desalojo de almacenamiento; rendimiento de WebGL en gama baja.

## Checklist manual con 2 teléfonos (A emite, B recibe)
1. [ ] Con red, abrir la URL en ambos y esperar unos 5 s.
2. [ ] Modo avión en ambos, cerrar la app por completo y **reabrirla**. ¿Carga con el **mapa y sus capas**? ¿Dice «SIN RED»?
3. [ ] A → Registrar: ¿se toma el GPS solo en modo avión? Precisión ±m y tiempo. Arrastrar el marcador y guardar.
4. [ ] A → Relevo → «Mostrar QR». B → «Escanear QR con cámara»: **¿pide permiso de cámara en modo avión? ¿Se puede conceder?** Medir los segundos.
5. [ ] Con 10 a 20 registros, QR animado: ¿la barra de progreso de B llega a completo? Probar 300, 450 y 800 caracteres por QR (en Ajustes).
6. [ ] Releer el mismo QR → «0 nuevos · N duplicados».
7. [ ] Respaldos: captura subida como imagen, enlace relay y webcam de laptop (selector de cámara).
8. [ ] Quitar el modo avión en B: ¿pasan de «en relevo» a «consolidado»? ¿Sube el contador de la pestaña Sync?
9. [ ] Anotar modelo, sistema y navegador.


## Mapa base vectorial PMTiles (17/10/2026)
- **Archivo por defecto: `piura_basemap_z11`**, de 2 594 101 B (2,6 MB), z0–11, sha256 `5e31b1dc…`. Se cambia con **una sola constante** (`DEFAULT_BASEMAP` en `src/basemap-config.ts`). Con `?basemap=z12` se elige `piura_basemap_z12` (5 740 095 B, sha256 `cc6d9219…`), pero solo en builds `VITE_PHASE=3`; ese archivo **todavía no está en el preview ni en producción**.
- **El z12 se descartó como predeterminado por su peso**: 5,74 MB supera el tope del jurado (≤ 5 MB). El z10 pesa 1,53 MB. Trade-off medido sin red (`results/basemap-measure-*.json`): con z11, las carreteras troncales y principales (`highway` y `major_road`) aparecen desde z8 en Piura y en Sullana, pero las **calles locales (`minor_road`) no aparecen en ningún zoom** (z8–16). Más allá de z11 las teselas se amplían y pierden detalle (`#map-hint` lo avisa desde z13). Con z12, las calles locales aparecen desde **z12** en las dos ciudades.
- **Offline real**: el `.pmtiles` **no va en el precache** de Workbox. Motivos: pesa más que todo el precache junto (2,9 MB), una falla en la instalación del SW dejaría sin offline a toda la app y no hay forma de mostrar el progreso. Al primer uso con red, `src/basemap.ts` descarga el archivo completo con un solo GET, verifica tamaño y sha256 y lo guarda en Cache Storage (`yaku-basemap-v1`). MapLibre lo lee por `pmtiles://` con `BlobOrFetchSource`: si hay copia guardada sirve los rangos con `Blob.slice()` sin red; mientras se descarga usa peticiones Range al propio sitio. Las copias de builds anteriores se borran porque el nombre del archivo lleva el sha256. Se llama a `navigator.storage.persist()`.
- **Indicador**: una píldora sobre el mapa y una línea en la leyenda muestran «Guardando mapa base para usar sin red… N % (x de y MB)» y, cuando termina, «Mapa base guardado sin red · 2,6 MB». También hay estados de error, de «aún no guardado (sin red)» y de reintento al volver la conexión.
- Glyphs (Noto Sans Regular, Medium e Italic; rangos 0-255, 256-511 y 8192-8447) y sprites `light` van en el precache (unos 0,9 MB). El estilo no pide nada a protomaps.github.io ni a ninguna CDN. Se quitaron las capas de POI, edificios, números de casa y sentido de vía.
- **Servidor**: el Worker no puede embeber varios MB, así que el `.pmtiles` va en **KV `yaku-relay-basemap`** (binding `BASEMAP`, preview y producción), partido en trozos de 1 MiB (`scripts/upload-basemap.mjs`). El Worker responde 200 al archivo completo y 206 a los Range. No se pudo usar la subida de assets de Pages porque el conector no admite el JWT de `/pages/assets/*` (403).

### Tiempos medidos de guardado sin red (412x915, Chrome headless, perfiles CDP)
Perfiles: «4G» = 9 Mbps de bajada, 1,5 Mbps de subida y 60 ms de latencia. «Fast 3G» de DevTools = 1,6 Mbps, 750 kbps y 562,5 ms. Las columnas dan el tiempo desde la navegación hasta «guardado» y, entre paréntesis, el de la descarga más la verificación.
| Archivo | Servidor | Sin límite | 4G | Fast 3G | Recarga sin red |
|---|---|---|---|---|---|
| z11 (2,6 MB) | preview Cloudflare | 0,92 s (0,32 s) | 3,67 s (2,72 s) | 18,5 s (15,0 s) | 0,76–0,80 s |
| z11 (2,6 MB) | local (vite preview) | 0,65 s (0,29 s) | 3,22 s (2,49 s) | 18,2 s (14,8 s) | 0,73–0,79 s |
| z12 (5,7 MB) | **solo local** (no desplegado) | 0,63 s (0,31 s) | 6,08 s (5,32 s) | 34,0 s (30,5 s) | 0,72–0,86 s |

## Escenario de riesgo CENEPRED/SIGRID 23077 (Aviso 421)
- Se rotula siempre como **«Escenario de riesgo»**, nunca como pronóstico de inundación. Muestra **930 centros poblados con ubicación de 1.255** del Excel, coloreados por el nivel de exposición a inundaciones que trae el Excel. Los 325 restantes no tienen coordenadas en el dataset de Centros Poblados del IGN (no se encontró su código) y aparecen en la lista plegable **«Sin ubicar (325)»** (`public/data/cenepred-sin-ubicar.json`, precacheada, funciona sin red). Datos preparados con `node scripts/prep-cenepred.mjs` (`results/data-prep-cenepred.json`).
- El popup dice «Centro poblado del escenario CENEPRED». El E2E prohíbe «afectado», «con daños», «sin señal», «expuesto en escenario» y «pronóstico de inundación».
- No se implementaron los estados «sin evaluar» ni «evaluado» (pendientes de aprobación).
- **OSIPTEL (fase 3, no publicada)**: popup «Cobertura móvil garantizada (declarada por operadoras, OSIPTEL): sí/no, 4G sí/no» y filtro «Solo sin cobertura garantizada según OSIPTEL». Son **445 de 928** centros con dato; los 2 que no figuran en OSIPTEL van como «sin dato OSIPTEL» y no entran en el filtro. Fuente: OSIPTEL, «Porcentaje de cobertura móvil por centro poblado, empresa operadora y tecnología», datosabiertos.gob.pe, **ODC-By**, información 2025-IV.

## Entregas por partes (`VITE_PHASE`)
`VITE_PHASE=1`: mapa base z11 y encuadre andino. `=2`: además, escenario CENEPRED y «Sin ubicar». `=3` (por defecto en desarrollo): además, OSIPTEL y `?basemap=z12`.
```bash
VITE_PHASE=2 npx vite build && VITE_PHASE=2 CF_BRANCH=rediseno-mapa node scripts/build-worker.mjs   # luego deploy/deploy-code.js con el conector
BASEMAP=z12 node scripts/e2e.mjs                       # E2E con la variante z12
BASE_URL=… KEY=z11 node scripts/basemap-measure.mjs    # tiempos y zoom de calles
node scripts/screens-basemap.mjs https://yaku-relay-proto.pages.dev/   # results/screens/basemap-*.png
```
