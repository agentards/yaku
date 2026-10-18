# Pantalla de la municipalidad en vivo (`?vista=municipalidad`)

Pantalla grande 16:9 para la demo: mapa 3D real de Piura (relieve DEM 1,6×, CENEPRED, SENAMHI, límites) +
reportes de campo que llegan en vivo. Título en pantalla: «Municipalidad · reportes de campo».

## Qué hace
- Consulta `GET /api/reports?limit=50` cada 3 s (mismo origen en producción). Nunca escribe: solo GET.
- Al abrir **ignora los reportes existentes** (la primera respuesta solo siembra; se muestra «N reportes anteriores no se muestran»).
- Reporte nuevo = `id` no visto con `received_at` ≥ el más reciente al abrir (`src/vista3d/municipalidad/deteccion.ts`).
- Por cada consulta con nuevos: la cámara vuela al más nuevo (acercamiento + órbita lenta, cancelable con el ratón),
  marcador pulsante, aviso de dos tonos (WebAudio, sin archivos) y tarjeta grande: tipo, severidad «N de 3 (la marca quien reporta)»,
  hora del reporte (reloj del celular), hora de llegada, «llegó hace N s», nota, **NO VERIFICADO**, «No es una alerta oficial».
- Columna: últimos reportes (más nuevo arriba), contador de nuevos y de «sin marcar Visto». Clic en un reporte = volar a él.
- «Visto **demo**» marca solo en esta pantalla (localStorage); el acuse de recibo real es un siguiente paso.
- Sin WebGL 2: la lista sigue funcionando con aviso. Si el servidor falla: «Sin respuesta del servidor · reintentando cada 3 s».

## Antes de la demo
- **Haz un clic en «Activar sonido»**: el navegador no deja sonar audio sin un gesto del usuario.
- Los reportes nuevos llegan a `/api/reports` cuando un celular sincroniza (M4). Las notas `prueba e2e …` también se muestran.

## Ver en local
```
npm run build
npx vite preview --port 4173
# abrir http://localhost:4173/?vista=municipalidad   (pantalla completa: F11)
```
`vite.config.ts` hace proxy de `/api` → `https://yaku-relay-proto.pages.dev` en `dev` y `preview`, **solo lectura**:
todo método que no sea GET/HEAD responde 404 en el propio proxy (probado: GET 200, POST/DELETE 404).

## Pruebas
- Unitario: `tests/vista3d-municipalidad.test.ts` (11): siembra, nuevos por id/received_at, orden, filas inválidas, «llegó hace», proxy solo lectura.
- E2E: `npm run e2e:municipalidad` (`scripts/e2e-municipalidad.mjs`, `/api/reports` simulado con Playwright): 17/17,
  detección en ~0,3 s tras la consulta, órbita sobre el reporte, ~75 fps en escritorio (GPU integrada, 1920×1080).
- Capturas: `municipalidad-1920-reporte-nuevo.jpg`, `municipalidad-1920-columna.jpg` (datos SIMULADOS del E2E).
- Peso: 8,8 kB JS + 6,8 kB CSS (carga diferida; la vista 2D no paga nada).
