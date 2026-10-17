# Yaku 3D — especificación de la vista 3D con «portal» de campo

Rama: `feat/3d-portal` (nunca directo a `main`; se entrega por PR). Autoría de los commits: GeorgeTech20.
Referencia visual: video de @claudeai (X, post 2111177834127601902), app «FireTrace — Wildfire Forensic Analysis».
El video, sus fotogramas y el análisis completo están en `C:\Users\Lenovo\hackathons\andes-chofex\referencias\` (NO se suben al repo).

## 1. Qué muestra el video (análisis, 115 s, pantalla completa de una app web)
**Composición fija (cuatro zonas):**
1. **Barra superior** (crema, texto pequeño): logo + nombre, selector del incidente, ubicación, rango de fechas, pestañas de modo (Incident · Drones · Resources) con contadores en rojo, menús View / Analysis / Share.
2. **Escena 3D a pantalla casi completa** (izquierda): terreno fotorreal con relieve exagerado, vegetación 3D, caminos, bruma de horizonte y cielo. Brújula arriba-izquierda; abajo-derecha conmutador **2D | 3D**, escala métrica, zoom (21,7×) y pantalla completa.
3. **Panel derecho** (crema, tarjetas): lista de **capas** con casilla + deslizador de opacidad (Terreno 3D, Imagen aérea, Cicatriz, Propagación, Probabilidad de ignición, Supresión…), resumen del incidente, clima/comportamiento, eventos clave. El contenido cambia según la pestaña.
4. **Línea de tiempo inferior**: play / pausa / paso / velocidad (1×), cabezal arrastrable con etiqueta de fecha-hora, marcadores de eventos y **tres gráficos sincronizados** con el cabezal (área, tasa de avance, perfil de elevación). Todo el mapa se anima con el cabezal (el fuego crece).

**El «portal / proyectado» que le gusta a Jorge:** una **ventana flotante insertada sobre la escena 3D** (picture-in-picture) que muestra la «cámara» de un dron seleccionado: marco con esquinas de visor, HUD (REC, hora, coordenadas, altitud, rumbo, batería, enlace, zoom), modos EO/IR con paleta térmica, controles (zoom, pantalla completa, cerrar). Al elegir otro dron en el panel, el portal cambia de vista y la escena principal vuela hasta él. Es una vista «proyectada» dentro de la vista, con datos en vivo del objeto elegido.

**Coreografía de cámara (lo que da la sensación cinematográfica):** vuelo oblicuo regional con horizonte (pitch ~65–75°) → acercamiento al punto de interés con giro suave → órbita lenta alrededor del evento; transición 3D → 2D plano (mapa base claro) con la misma capa; los objetos (rutas, etiquetas con fecha) se anclan al terreno y escalan con el zoom. Aviones/vehículos 3D animados sobre el relieve en la pestaña de recursos.

**Lenguaje visual:** crema/beige cálido (UI) + naranja-rojo de acento para lo crítico; terreno cálido desaturado con sombreado fuerte; tipografía sans pequeña y densa; mucha información secundaria, jerarquía clara; sin sombras pesadas.

## 2. Traducción a Yaku Relay (la zona: Piura / Niño Costero)
| FireTrace | Yaku 3D |
|---|---|
| Incidente «Ridgeview» | Escenario: «Piura · Aviso 421 / FEN 2027» (fuente CENEPRED/SIGRID vía INDECI) |
| Rango de fechas | Ventana del pronóstico SENAMHI (vigente o VENCIDO, 24 h) |
| Pestañas Incident / Drones / Resources | **Escenario** · **Campo** (fichas EDAN y su relevo) · **Relevo** (teléfonos/QR) |
| Capas de fuego | capas reales ya existentes: SENAMHI quebradas, SIGRID erosión, CENEPRED centros poblados 930+317+8, cobertura OSIPTEL (445/928), riesgo inundación y movimientos en masa por distrito (65) |
| Terreno 3D | DEM Terrarium recortado a Piura (`dem.pmtiles` ~2,9 MB ya generado en `agentards/app/public/data/piura/`), exageración 1,4–1,8× |
| Cabezal de la línea de tiempo | ventana de pronóstico SENAMHI (horas) + sucesión de fichas recibidas/relevadas |
| Gráficos inferiores | centros poblados sin ficha · fichas por estado · cobertura OSIPTEL por nivel de riesgo |
| **Portal de dron** | **Portal de campo**: ventana flotante sobre la escena que muestra el centro poblado elegido: mini-vista 3D en órbita, HUD con coordenadas, altitud (DEM), nivel de riesgo, fuente y fecha, cobertura OSIPTEL declarada, fichas con estado «NO VERIFICADO», y estado del enlace (SIN RED / EN LÍNEA) |
| Aviones/vehículos | **Relevo animado**: arcos que viajan de teléfono a teléfono entre centros poblados al pasar una ficha por QR; llega al servidor al volver la red |

## 3. Reglas que no se rompen (heredadas del HANDOFF del repo)
- Un reporte ciudadano nunca es alerta oficial; siempre «NO VERIFICADO». Nunca «vía segura» ni «transitable».
- Decir «sin cobertura garantizada según OSIPTEL», no «sin señal»; «centros poblados del escenario CENEPRED», no «expuestos»/«afectados».
- Cifras permitidas: 1.255 centros poblados (930 IGN + 317 aproximados OSIPTEL + 8 sin ubicar); 445 de 928 sin cobertura garantizada. No inventar otras.
- No contar al jurado lo que no esté en producción. Lo simulado se etiqueta SIMULADO.
- La vista 3D es **aditiva**: el modo 2D actual y todos los tests/E2E existentes deben seguir verdes. Entrada por `?vista=3d` y por el conmutador 2D|3D; 2D sigue siendo el predeterminado hasta que QA apruebe.
- Presupuesto offline: el paquete adicional del 3D (DEM + sprites) ≤ 6 MB y debe entrar en el precache existente de la PWA; cero CDN ni teselas externas.
- Cuidado con `src/`: el repo tiene a otras personas/agentes construyendo ahí (HANDOFF). Trabaja en archivos nuevos (`src/vista3d/*`) y toca los archivos existentes lo mínimo (un `import` y un conmutador). Haz `git pull --rebase origin main` antes de cada sesión.

## 4. Entregables y criterios de «hecho»
1. `src/vista3d/` con: escena 3D (terreno + cielo/bruma + capas reales proyectadas sobre el relieve), cámara cinematográfica (vuelo regional → acercamiento → órbita), conmutador 2D|3D.
2. Shell de interfaz estilo FireTrace en tema crema/naranja de Yaku: barra superior, panel de capas con opacidad, línea de tiempo con cabezal y gráficos sincronizados.
3. **Portal de campo** flotante con HUD y mini-vista en órbita del centro poblado seleccionado.
4. Relevo animado (arcos) disparado por el flujo real de fichas (y un modo demo etiquetado SIMULADO).
5. Funciona sin red (modo avión) en un celular real y en escritorio; ≥ 30 fps en celular de gama media (medir y anotar); degradación a 2D si WebGL falla.
6. Tests: unitarios de la cámara/línea de tiempo, E2E Playwright de 3D offline, y los existentes en verde (`npm test`, `npm run typecheck`, `npm run e2e`).
7. Documentación: sección en `docs/ARQUITECTURA.md` y `docs/DEMO.md` actualizada con el nuevo recorrido de 3 minutos.
8. PR `feat/3d-portal → main` con capturas y un video de 15 s por entregable. Sin claves, sin datos personales.
