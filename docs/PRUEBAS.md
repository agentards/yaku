# Pruebas

## Automáticas
```bash
npm test              # build + vitest: códec, IndexedDB, Worker con D1 falso, bundle, mapa base
npm run e2e           # Playwright, Android 412x915 → results/e2e-android.json
npm run e2e:desktop   # 1280x800 → results/e2e-desktop.json
BASE_URL=https://yaku-relay-proto.pages.dev/ node scripts/e2e.mjs   # remoto contra el Worker y D1 reales
npm run measure:qr    # tamaño y fragmentos de QR → results/qr-measure.md
```
La CI en GitHub Actions (`.github/workflows/ci.yml`) corre `npm ci`, `npm test` y `npm run build` con Node 20 y 22 en cada push y en cada PR.

## Prueba manual con 2 teléfonos (A emite, B recibe)
1. Abrir la URL con red en ambos y esperar el aviso del mapa guardado.
2. Activar el modo avión en ambos, cerrar la app por completo y reabrirla. Debe abrir con el mapa y las capas.
3. En A, registrar con GPS. Anotar la precisión en metros y el tiempo.
4. En A, mostrar el QR; en B, escanearlo con la cámara. Anotar los segundos y si el permiso de cámara funciona en modo avión.
5. Repetir con 10 y con 20 registros (QR animado).
6. Volver a leer el mismo QR. Debe decir «0 nuevos · N duplicados».
7. Quitar el modo avión en B. Los registros deben pasar a consolidados en `/api/stats`.
8. Anotar el modelo, el sistema y el navegador de cada teléfono.
