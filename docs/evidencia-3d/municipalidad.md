# Pantalla de la municipalidad en vivo (`?vista=municipalidad`) — WP3

Pantalla grande 16:9: mapa 3D real de Piura (relieve DEM 1,6×, CENEPRED, SENAMHI, límites) + **incidentes**
que llegan en vivo desde el **servidor local** (`servidor-local/`, mismo origen). Título: «Municipalidad · reportes de campo».
Textos, respaldo, prioridad y agrupación: `agentards/producto/decision-confianza.md` (vía `src/vista3d/municipalidad/textos.ts`).

## Qué hace
- Consulta `GET /api/incidentes` cada 3 s. Cada incidente agrupa los reportes de varios vecinos sobre el mismo hecho
  (agrupación y respaldo los calcula el servidor; contrato en `src/vista3d/municipalidad/CONTRATO-API.md`).
- **Tarjeta del incidente**: chip «Reporte vecinal · por validar» (o el estado municipal), **Respaldo 0–100 · N1/N2/N3** con
  su desglose (personas · fotos · cercanía · recencia), contador **«2 vecinos · 1 foto · primer reporte 20:03»**, severidad
  máx. («la marca quien reporta»), notas, aviso **116 / 105** si hay atrapados o heridos, pie legal de la decisión.
- **Galería**: miniaturas de `GET /api/fotos/:id`, pantalla completa con ← → y Esc; «N fotos pendientes de subir» si el
  celular aún no las subió; «Foto aún no disponible» si falla.
- **Prioridad** (columna): vida (atrapados > heridos) > severidad > respaldo > lo más reciente; cerrados al final.
- **Flujo con PIN**: Revisar · Validar · Descartar (con motivo) → asignar Rescate / Bomberos / Provisiones / Maquinaria /
  Evaluación EDAN → Marcar atendido; reabrir un descartado. `POST /api/incidentes/:id/estado` con `X-Muni-Pin` y «quién».
  «Validar» desde Nuevo recorre el flujo paso a paso (en revisión → validado), así cada paso queda en el historial.
  PIN incorrecto (403) → se vuelve a pedir. El PIN vive solo en la memoria de la pestaña; el nombre del operador se recuerda.
- **Incidente nuevo** → vuelo de cámara (acercamiento + órbita lenta, cancelable con el ratón), marcador pulsante, aviso de
  dos tonos. Si hay un diálogo abierto, el vuelo espera a que se cierre.
- **Otro vecino coincide** (personas o fotos suben en un incidente existente) → **rodillo**: el «1» sale hacia arriba, entra el
  «2» con un «+1» (también en fotos y en el total «vecinos reportan»); aviso «Otro vecino coincide: … · ahora 2 vecinos»
  (clic = ir al incidente) y un tono. El número viejo lo pinta CSS (`::before`), así el lector de pantalla solo lee el nuevo;
  con `prefers-reduced-motion` se ve el valor final sin movimiento.
- **Desglose del respaldo**: «Personas 40 · Fotos 15 · Cercanía 20 · Recencia ×1,00 = 75» + barra apilada 0–100 en ámbar;
  lo que se pierde por antigüedad va rayado (caso E: (55+25+12) × 0,79 = 73, 19 puntos rayados). Encima de la columna:
  «Orden: riesgo de vida → severidad → respaldo → más reciente».
- **Textos desde `src/poblador/textos.ts`**: rótulo, detalle N1–N3, chips de estado (los mismos que ve el poblador), acciones
  «… asignados», motivo de descarte, «N fotos pendientes de subir» (`FOTOS_PENDIENTES`) y pie legal. El panel solo agrega lo
  suyo (número 0–100, desglose, orden, pie del respaldo) en `src/vista3d/municipalidad/textos.ts`; HTML puro en `piezas.ts`.
- Colores: **verde solo para estados municipales** (validado, acción, atendido); nunca rojo para un reporte vecinal.
- Si el servidor **no tiene** `/api/incidentes` (404, p. ej. producción actual): agrupa `GET /api/reports` en la pantalla con
  las mismas reglas (§3) y **desactiva las acciones** (solo lectura).
- Sin WebGL 2: la lista sigue funcionando con aviso. Servidor caído: «Sin respuesta del servidor · reintentando cada 3 s».

## Ver en local
```
npm run servidor                       # build + servidor local en http://localhost:8080 (WP1); muestra el PIN si no hay MUNI_PIN
# abrir http://localhost:8080/?vista=municipalidad   (F11 pantalla completa; clic en «Activar sonido»)
```
Con `vite dev`/`preview`, `/api` va por proxy a `http://localhost:8080` (o `YAKU_API_LOCAL`). Producción solo con
`YAKU_API=produccion` y en **solo lectura** (POST/PUT/DELETE → 404 en el propio proxy).

## Pruebas
- Unitario: `tests/vista3d-municipalidad-incidentes.test.ts` (25): lectura de la forma de `servidor-local/vista.ts`,
  ejemplos A–G del respaldo (§2.4), prioridad, nuevos y coincidencias 1→2, flujo de estados, tests (a)–(g) de agrupación;
  `tests/vista3d-municipalidad.test.ts` (13): detección, «llegó hace», proxy local / producción solo lectura;
  `tests/vista3d-municipalidad-piezas.test.ts` (10): rodillo 1→2 (innerText solo «2 vecinos»), desglose B = 75 y E = 73 con
  tramos, «1/2 fotos pendientes de subir», chips idénticos a los del poblador, verde solo municipal, sin palabras prohibidas.
- E2E: `npm run e2e:municipalidad` (Node ≥ 23.6): **servidor local real** con SQLite temporal fuera del repo y PIN de prueba.
  **23/23** (17-oct-2026 20:15; antes 21/21): A reporta → incidente nuevo y vuelo; B sube su reporte + el de A (relevo) + foto → 1 incidente,
  contador 1 → 2 animado, respaldo 75 · N2; galería; atrapados arriba con 116/105; PIN incorrecto → correcto; Validar +
  «Bomberos» persiste en SQLite, tras recargar y en `/api/estado` (acuse al celular); descarte con motivo; modo solo lectura
  sin `/api/incidentes`; cero CDN; `/` sigue en 2D; **rodillo 1 → 2** en la tarjeta; atrapados con «(con foto)» sin imagen →
  «1 foto pendiente de subir» y Fotos 0 en el respaldo. 79–83 fps a 1920×1080 (GPU integrada de escritorio). Sin celular real medido.
- Capturas (datos SIMULADOS del E2E): `municipalidad-1920-incidente-2-vecinos.jpg`, `municipalidad-1920-bomberos-asignados.jpg`,
  `municipalidad-rodillo-1-a-2.jpg` (tarjeta durante el rodillo: «+1» en vecinos y fotos, barra del desglose).
