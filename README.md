# Yaku Relay — prototipo de validación (rama conceptual `rediseno-mapa`)

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
- **Mapa**: MapLibre GL empaquetado localmente, fondo liso (sin tiles ni fuentes remotas) y capas reales en EPSG:4326. La leyenda muestra fuente y fecha de cada capa. El mapa base OSM es opcional, está apagado por defecto y solo funciona con red.
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
- OpenStreetMap (opcional, en línea): © colaboradores de OpenStreetMap, ODbL; teselas sujetas a la política de uso de tile.openstreetmap.org.
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
