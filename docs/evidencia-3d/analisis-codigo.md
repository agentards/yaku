# Vista 3D: cómo se integra sin romper el 2D (análisis y evidencia)

Rama `feat/3d-portal`. Fecha de las medidas: 17/10/2026. Autor del módulo: arquitecto-3d.

## 1. Lo que ya existía y se reutiliza
| Pieza del 2D | Qué aporta al 3D |
|---|---|
| `src/map.ts` (`style`, `LAYER_GROUPS`, `initMap`) | Estilo 100 % local (Protomaps + capas reales SENAMHI, SIGRID, CENEPRED 930, límite, reportes ciudadanos). El 3D **no copia** capas: enciende el relieve sobre el mismo estilo. |
| `src/basemap.ts` (`BlobOrFetchSource`, `downloadBasemap`, `cachedBasemap`) | Patrón offline del mapa base: el `.pmtiles` se guarda completo en Cache Storage con verificación de tamaño + sha256 y se lee con `Blob.slice()`. El DEM usa exactamente lo mismo. |
| `vite.config.ts` (Workbox, `globIgnores: **/*.pmtiles`) | El código 3D (JS/CSS) entra solo al precache; el DEM queda fuera del precache, como el mapa base (el test `bundle.test.ts` lo exige). |
| `server/worker.ts` (`/basemap/*.pmtiles` desde KV) | El DEM vive en `public/basemap/` para que en Cloudflare lo sirva la misma ruta (subirlo con `scripts/upload-basemap.mjs`). |

## 2. Decisiones de integración
1. **Mismo mapa, un solo contexto WebGL.** El conmutador 2D|3D (`src/vista3d/conmutador.ts`) es un `IControl` de MapLibre que activa/quita el relieve sobre el mapa que crea `initMap`. Ventajas: sin segundo canvas (memoria del celular), mismas capas, mismos puntos ciudadanos, mismo popup con fuente y fecha. Cambio en `src/main.ts`: 1 `import` + 1 llamada (`montarVista3D(getMap()!)`).
2. **2D sigue por defecto.** Solo `?vista=3d` o el botón 3D encienden el relieve. Al volver a 2D se quita terreno, cielo, capas y fuentes del relieve, y el mapa queda plano, al norte y sin rotación (verificado en E2E).
3. **DEM con protocolo propio `yakudem://`** (`src/vista3d/dem.ts`) para no pisar el `pmtiles://` del mapa base y no depender de peticiones Range sin red. Teselas Terrarium z5–9 recortadas a Piura (Terrain Tiles de Mapzen/AWS Open Data: SRTM, GMTED2010, ETOPO1), 2.924.589 B, sha256 `00100654…`.
4. **Relieve como funciones puras** (`src/vista3d/relieve.ts`): `conRelieve(style)` inserta color por altitud (`color-relief`) y sombreado bajo el agua y las vías, terreno 1,6× y cielo con bruma. Las capas reales quedan **drapeadas** sobre la malla (fill/line se proyectan; los círculos CENEPRED/SIGRID/ciudadanos se acuestan con `circle-pitch-alignment: map`). **Sin `fill-extrusion`**: no aporta información verificada y cuesta fps en celular.
5. **Cámara** (`src/vista3d/camara.ts`): vuelo regional oblicuo con horizonte (pitch 72°, rumbo 62°) → acercamiento al centro poblado con giro de 35° (3,2–7 s según distancia, easing cúbico) → órbita lenta con rampa (5°/s). Cualquier gesto (puntero, rueda, tecla, toque) la cancela. Con `prefers-reduced-motion` los vuelos son instantáneos y no hay órbita.
6. **Degradación.** Sin WebGL 2 → aviso y se queda en 2D. Contexto WebGL perdido → la UI vuelve a 2D en el acto. Sin red y sin DEM guardado → aviso «conéctese una vez para guardarlo» y 2D.
7. **Guardado del DEM en reposo**: tras guardar el mapa base y con red (y sin «ahorro de datos»), el DEM se guarda en segundo plano, para que el 3D funcione en modo avión aunque nunca se haya abierto con red.
8. **Escena para el portal de campo** (`src/vista3d/escena.ts`): implementa el contrato `EscenaYaku` de `src/vista3d/ui/contrato.ts` con el mismo relieve y la misma cámara, para el shell estilo FireTrace (`?vista=portal`, de UX Portal de Campo). Reemplaza a `escena-prueba.ts`, que usaba `pmtiles://` para el DEM (no funciona sin red).

## 3. Presupuesto offline (medido)
| Parte | Bytes | Dónde vive |
|---|---|---|
| DEM `piura_dem_z9.00100654.pmtiles` | 2.924.589 | Cache Storage `yaku-dem-v1` (fuera del precache, como el mapa base) |
| Código 3D del conmutador (JS minificado, sin MapLibre) | 10.747 (4.797 gzip) | precache del service worker |
| CSS del conmutador | 976 | precache |
| **Total adicional** | **≈ 2,94 MB** | límite 6 MB ✔ (test `vista3d.test.ts`) |

Cero CDN: el E2E registra 0 peticiones fuera de `localhost` en escritorio y celular.

## 4. Rendimiento (fps contados con el evento `render` de MapLibre)
Medido con `node scripts/e2e-3d.mjs` (Chrome 1xx sin ventana, GPU integrada Intel UHD vía ANGLE/D3D11). Tres corridas; se dan rangos porque la emulación es ruidosa.

| Escenario | Escritorio 1280×800 | Celular emulado 412×915, DPR 2,625, CPU 4× más lenta |
|---|---|---|
| 2D actual, desplazamiento (línea base) | 142–143 fps | 28–80 fps |
| 3D, vuelo regional de entrada (carga teselas) | 41–116 fps | 14–19 fps |
| 3D, órbita sobre el centro poblado | 69–138 fps | 28–91 fps |

- En 3D la resolución se limita a `pixelRatio` 1,5 (`PIXEL_RATIO_MAX_3D`): en el celular emulado subió la órbita de 18 a 28 fps en la misma corrida, sin diferencia visible.
- El punto débil es el **vuelo de entrada** en celular (decodifica teselas DEM y vectoriales con la cámara muy inclinada). La órbita, que es lo que se ve más tiempo, queda cerca de la línea base 2D.
- **Pendiente: medir en un celular real de gama media** (no había ninguno conectado por adb). La meta del spec es ≥ 30 fps.

## 5. Verificaciones E2E (`docs/evidencia-3d/medidas.json`, 18/18)
2D por defecto · DEM guardado con sha256 · 3D con terreno 1,6× y pitch ≥ 65 · altitud consultable sobre la sierra · órbita alrededor de un centro poblado del escenario CENEPRED sin cobertura garantizada según OSIPTEL · un gesto cancela la órbita · vuelta a 2D limpia · **sin red: recarga en modo avión y 3D con relieve desde la copia local** · pérdida del contexto WebGL → 2D · 0 peticiones externas. Las mismas verificaciones en escritorio y celular emulado.

Regresión: `npm test` 67/67, `npm run typecheck` sin errores en los archivos de este módulo, `scripts/e2e.mjs` 12/13 en Windows (el caso (f) «servidor apagado» falla porque `process.kill(-pid)` no apaga el servidor en Windows: `serverDown:false`; no depende del 3D).

## 6. Evidencia
`01`–`07-*.jpg` (escritorio y celular) y `recorrido-3d-15s.mp4` (vuelo regional → acercamiento → órbita → vuelta a 2D).

## 7. Preset «Ver desde la cuenca» (C3, «por qué 3D»)
- **Qué hace:** un botón vuela la cámara a una vista río abajo: sobre el río Piura aguas arriba (tramo de Tambogrande, 60 m) mirando al Bajo Piura (entre Catacaos y La Arena, 17 m), pitch 76°, rumbo 207° (SSO). Al llegar, la cámara se queda quieta, sin órbita, para que se pueda leer la vista. Al lado va una nota fija: «Relieve: Terrain Tiles z5–9 (descargado 17/10/2026), exageración vertical 1,6×. Ayuda a leer por dónde baja el agua; no es un modelo de inundación».
- **Puntos elegidos con datos, sin red:** `scripts/cuenca-dem.mjs` toma el cauce «Río Piura» del mapa base local (OpenStreetMap vía Protomaps, z11) y la cota de cada vértice del DEM local (z9). «desde» es el primer vértice río arriba de la ciudad donde la mediana móvil de 51 vértices llega a 60 m. «hacia» es el vértice mediano del tramo por debajo de 25 m al sur de la ciudad. Las cifras quedan en `config.ts` (`CUENCA`).
- **Función pura:** `presetCuenca(desde, hacia, { altoPx })` en `camara.ts`. Usa la misma geometría que MapLibre (`calculateCameraOptionsFromTo`): la cámara cae sobre el punto río arriba, por encima del relieve exagerado. `Recorrido.verCuenca()` la vuela con el mismo `volar` que el resto del recorrido. Cualquier gesto la corta (puntero, rueda, teclado o toque) y con `prefers-reduced-motion` salta sin animar (duración 0).
- **Dónde va:** en `?vista=3d`, como control de MapLibre abajo a la derecha (solo en 3D). En `?vista=portal`, el botón entra en `.v3d-ctrl.ad` y la nota queda encima, montados desde `entrada-portal.ts` sin tocar `ui/index.ts` ni `ui/tema.css`. A menos de 900 px, en la pestaña Relevo, las anclas y la nota suben (`cuenca.css`) para que nada se tape.
- **Tests:** 10 casos en `tests/vista3d-camara.test.ts`: cotas contra el DEM, rumbo y pitch, inversa geométrica, zoom según el alto del lienzo, pureza, vuelo, cancelación, corte por órbita o centro poblado, reduced-motion y texto exacto de la nota.
- **Evidencia sin red** (`node scripts/evidencia-cuenca.mjs` → `cuenca.json`, `cuenca-*.jpg`, `medidas.json#fpsCuenca`). Resultado: 21/23. Pasan el botón y la nota completos a la vista a 1280 y 360 px en las dos entradas; el vuelo, que llega a la vista con el relieve yakudem 1,6× y 0 peticiones externas; el corte por gesto; reduced-motion (126 ms); y el Relevo a 360 px sin solapes.
- **fps** (mediana de 3 rondas alternadas de 4 s desde la misma vista, Intel UHD, headless):

| Entrada | Órbita | Preset | Diferencia |
|---|---|---|---|
| `?vista=3d` escritorio 1280×800 | 133,0 | 122,8 | −8 % |
| `?vista=portal` escritorio 1280×800 | 142,2 | 139,0 | −2 % |
| `?vista=3d` celular emulado (360×780, DPR 3, CPU 4×) | 47,7 | 42,5 | **−11 %** |
| `?vista=portal` celular emulado | 36,8 | 30,7 | **−17 %** |

  En escritorio el preset queda dentro del margen del 10 %. **En el celular emulado no lo cumple:** el vuelo cruza unos 60 km y decodifica teselas nuevas, mientras que la órbita gira sobre teselas ya cargadas. Probé otras curvas de vuelo (0,6–1,25) y pitch 70°: ninguna mejora más allá del ruido de medida (la misma órbita dio entre 23 y 40 fps en una sola corrida). El celular real (G7) decide.
