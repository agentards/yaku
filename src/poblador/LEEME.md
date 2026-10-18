# Modo poblador (WP2) — `?vista=poblador` y por defecto en celular

Pantalla simple para el vecino, con una mano, en el mismo PWA. La municipalidad usa `?vista=municipalidad` (WP3); el servidor es `servidor-local/` (WP1).

## Qué hace
| Pantalla | Qué ve el vecino |
|---|---|
| **Reportar** | 9 botones grandes con ícono: personas atrapadas, heridos, casa dañada o caída, agua en la calle, huaico o lodo, río o quebrada tapada, camino bloqueado, necesito agua/comida/abrigo, otro peligro. |
| Aviso 116/105 | Si elige **atrapados** o **heridos**, primero: «Si tienes señal, llama al 116 (Bomberos) o al 105 (Policía)», con botones `tel:`. El reporte se guarda igual. |
| Detalle | GPS (o la última ubicación, o el centro de Piura marcado «sin GPS»), **foto** (`<input capture>` → JPEG ≤ 150 KB, lado ≤ 1280 px, en IndexedDB `yaku-poblador`), gravedad Leve/Grave/Muy grave, nota opcional. |
| **Intercambiar** | En un solo paso: **mi QR arriba** (animado si son varios) + **cámara abajo** (frontal por defecto: celulares frente a frente; ⟲ cambia de cámara) leyendo el del otro. Lleva todos los reportes (míos y los que llevo) y un código extra `YE1:` con el **estado municipal** que conozco. Sin cámara: «Leer código desde una foto». |
| **Mis reportes** | «Mis reportes» y «Los que llevo de otros vecinos». Sin estado municipal: chip **«Reporte vecinal · por validar»** + respaldo en palabras («2 vecinos lo reportan · 1 foto»). Con estado: solo el estado («En revisión por la municipalidad», «Bomberos asignados», «Atendido…»). |

Al volver la red se sincroniza solo (`POST /api/sync`, el mismo de la app técnica), sube las fotos de **este** celular (`POST /api/fotos`) y baja el estado (`GET /api/estado?ids=`). También cada 45 s y con «Actualizar estado».

## Reglas de texto (agentards/producto/decision-confianza.md)
- Constantes únicas en `textos.ts`: `ROTULO_VECINAL`, `DETALLE`, `ESTADO`, `ESTADO_DETALLE`, `PIE_LEGAL`, `FOTOS_PENDIENTES`. WP3 las importa.
- Al vecino nunca se le muestra el número 0–100; nunca rojo para un reporte vecinal; verde solo validado / acción / atendido; «coinciden», no «confirman».
- **Desviación escrita:** la acción dice «Bomberos **asignados**», no «en camino»: Yaku solo sabe que la municipalidad asignó la acción, no si el equipo salió.
- Primera vez: aviso de datos personales (ubicación + código anónimo, sin nombre ni DNI; art. 315-A).

## Tipos nuevos sin romper QR viejos
`tipos.ts` usa `vivienda`, `atrapados`, `heridos`, `ayuda` si `OBS_TYPES` los tiene (WP1 los agregó al final). Con un codec viejo guarda `otro` + «Casa dañada o caída: …» en la nota y lo reconoce al leerlo. La marca «(con foto)» va al final de la nota: la foto no viaja por QR.

## Cómo verlo en local
```bash
npm run servidor                      # build + servidor-local en http://localhost:8080 (MUNI_PIN en consola)
# celular: http://localhost:8080/  (por defecto en pantalla táctil ≤ 760 px)
# escritorio: http://localhost:8080/?vista=poblador   · app técnica: ?vista=2d   · municipalidad: ?vista=municipalidad
```
La cámara del celular necesita HTTPS (ngrok, WP4). En navegadores automatizados (`navigator.webdriver`) no se activa por defecto, para que las E2E de la vista técnica no cambien.

## Pruebas
- `npx vitest run tests/poblador.test.ts`: tipos ↔ codec, estado de vuelta, código YE1, vecinos que coinciden, ruta, compresión, textos.
- `npm run e2e:poblador`: A ↔ B con `/api` simulado. `npm run e2e:poblador:real`: el mismo flujo contra `servidor-local/` real (SQLite temporal, puerto 4184, PIN de prueba; la municipalidad valida y asigna «Bomberos» por la API con PIN). Compila en una carpeta temporal (no pisa `dist/`). Cámara simulada: cada celular «ve» el QR que dibuja el otro (`canvas.captureStream`), pasa por `scanner.ts` (jsQR) igual que una cámara real.
- Evidencia: `docs/evidencia-poblador/` (412×915 y 1280×800) y `results/e2e-poblador*.json`.

## Pendiente
- Prueba con dos celulares reales y cámara frontal (luz, distancia, brillo de pantalla); el lector es el de WP0.
- La foto de un reporte relevado no viaja: si el autor nunca recupera internet, el panel queda con «1 foto pendiente de subir».
- Vista sin mapa: el vecino no puede corregir el punto si el GPS falla (usa la última ubicación o el centro de Piura, marcado «sin GPS»).
