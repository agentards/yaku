# Yaku Relay — prototipo de validación offline + QR (desechable)

Objetivo: medir dos riesgos técnicos antes de aprobar la idea: **(1) offline real de una PWA** (segunda apertura sin red) y **(2) transferencia de registros estructurados por QR** (tamaño, fragmentación, lectura). No es el MVP.

Público (HTTPS, Cloudflare Pages): https://yaku-relay-proto.pages.dev/

## Cómo correrlo
```bash
npm install
npm run dev            # http://localhost:5173 (el SW solo se activa en build/preview)
npm run build && npm run preview   # http://localhost:4173 con service worker
npm test               # build + vitest (unidad + verificación del bundle)
npm run measure:qr     # round-trip QR real → results/qr-measure.{json,md}
npm run e2e            # build + Playwright/Chrome headless → results/e2e.json
BASE_URL=https://yaku-relay-proto.pages.dev/ node scripts/e2e.mjs   # mismo E2E contra producción
node scripts/build-worker.mjs      # empaqueta dist/ en deploy/_worker.js (Pages advanced mode)
```

## Flujo
Formulario (tipo, severidad 1–3, lat/lon por GPS o manual, nota ≤140, ts, deviceId) → IndexedDB → seleccionar → **emitir**: QR (animado si no cabe) **o enlace relay** `#p=…` → **recibir**: cámara (selector de cámara, sirve webcam de laptop), **subir imagen/captura** del QR, o abrir el enlace → reensamblado + CRC32 + dedup por id → cola de sync al volver la red.

Todo reporte se muestra con borde discontinuo ámbar, rayado y la etiqueta **NO VERIFICADO** + «Reporte ciudadano»; la plantilla de datos oficiales usa borde sólido azul y «FUENTE OFICIAL» (no se carga ningún dato oficial en el prototipo). La app no afirma que una ruta sea transitable sin riesgo; `tests/bundle.test.ts` falla si el bundle contiene esas frases (con control negativo comprobado).

## Decisiones (cada librería tiene una función medible)
| Pieza | Por qué | Medición |
|---|---|---|
| Vite + TS vanilla | Bundle mínimo, sin framework | JS 219 KB (79 KB gzip) |
| vite-plugin-pwa (Workbox generateSW) | Precache del app shell + `navigateFallback` | E2E (a) y (f): carga sin red y con servidor apagado |
| idb | Wrapper fino de IndexedDB con transacciones | `putIfAbsent` dedup, tests db |
| Formato posicional `[v, tsBase, [[id,tipo,sev,lat·1e5,lon·1e5,Δts,dev,nota]]]` | Quita nombres de campo; ts relativo | JSON 183 B → 108 B por registro |
| pako `deflateRaw` (nivel 9) | Síncrono y igual en Node y navegador (CompressionStream es async y difiere entre motores) | 20 reg.: 1650 → 655 B |
| Base45 (RFC 9285) + modo alfanumérico QR | 8,25 bits/byte vs 10,67 de base64 en modo byte | 20 reg.: v21 vs v24 (b64url) vs v34 (JSON crudo) |
| Fragmento `YR1:<msg>:<i>:<n>:<crc>:<datos>` | Reensamblado en cualquier orden, repetidos, mensajes intercalados | tests de reensamblado |
| CRC32 sobre bytes comprimidos + id = hash(cyrb53) del contenido | Integridad + dedup; si el id no coincide con el contenido el registro se rechaza | tests de manipulación |
| qrcode | Genera QR con segmento alfanumérico forzado y ECC M | versión reportada |
| BarcodeDetector → fallback jsQR (empaquetado, sin CDN) | BarcodeDetector nativo en Chrome Android; jsQR en desktop/iOS | E2E (d) usó jsQR |
| Enlace `#p=` (base64url) | El fragmento no viaja al servidor; funciona offline vía SW | E2E (b) |
| Sync `POST text/plain` | Evita preflight CORS; idempotente por id | E2E (e) |

Chunk por defecto: 450 chars → QR v13 (69×69 módulos), elegido por legibilidad en cámara; ajustable en la UI.
Hash cyrb53 (53 bits, no criptográfico) porque `crypto.subtle` exige contexto seguro. **No hay firma**: cualquiera puede fabricar reportes (riesgo abierto).

## Mediciones (reales, en el box, Chrome 155 headless)
Ver `results/`. Muestras sintéticas de Piura con notas repetidas → la compresión es **optimista** frente a notas reales únicas.

`results/qr-measure.md` (round-trip PNG → jsQR → reensamblado):
Chunk 450 chars/QR, ECC M. "v—" = no cabe en un QR (máx. v40).

| N | JSON verboso B | JSON posicional B | deflate B | base45 chars | 1 QR base45/alnum | 1 QR b64url/byte | 1 QR JSON/byte | fragmentos (450) | versión máx frag | decode jsQR 4px | decode 2px | reensamblado | ms jsQR total |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|:-:|:-:|--:|
| 1 | 183 | 108 | 98 | 147 | v7 | v8 | v7 | 1 | v7 | ✅ | ✅ | ✅ | 27.4 |
| 5 | 854 | 422 | 280 | 420 | v13 | v15 | v16 | 1 | v13 | ✅ | ✅ | ✅ | 16.8 |
| 10 | 1705 | 830 | 412 | 618 | v16 | v18 | v23 | 2 | v13 | ✅ | ✅ | ✅ | 15.4 |
| 20 | 3406 | 1650 | 655 | 983 | v21 | v24 | v34 | 3 | v13 | ✅ | ✅ | ✅ | 19.6 |
| 50 | 8519 | 4110 | 1326 | 1989 | v31 | v35 | v— | 5 | v13 | ✅ | ✅ | ✅ | 36 |

E2E (`results/e2e.json` local; `results/e2e-remote.json` contra pages.dev): (a) offline recarga + nueva pestaña, (b) enlace relay entre dos contextos con dedup, (c) subir imágenes de QR fragmentado, (d) cámara simulada (Chrome fake device con video Y4M de QR animado), (e) sync diferida idempotente, (f) servidor apagado.

## Qué NO se probó (pendiente en hardware real)
- Cámara física, enfoque, reflejos de pantalla, distancia, QR animado entre dos teléfonos.
- Chrome Android (BarcodeDetector real), Safari iOS (no tiene BarcodeDetector; jsQR), Firefox.
- Permiso de cámara en modo avión, instalación PWA, desalojo de almacenamiento (iOS borra datos tras días sin uso).
- GPS real. Backend persistente: `/api/sync` en Pages es un **eco sin persistencia**.

## Checklist manual con 2 teléfonos (A emite, B recibe)
1. [ ] En ambos, con datos/Wi-Fi: abrir https://yaku-relay-proto.pages.dev/ , esperar 5 s (SW instalado). Opcional: «Agregar a pantalla de inicio».
2. [ ] Modo avión en ambos. Cerrar la pestaña/app por completo y **volver a abrirla** → ¿carga completa? ¿indicador «SIN RED»?
3. [ ] En A: «Usar GPS» en modo avión → ¿obtiene posición (GPS sin red) o hay que ingresar manual? Anotar precisión ±m y tiempo.
4. [ ] En A: crear 1 registro → «Generar QR». En B: «Iniciar cámara» → **¿pide permiso de cámara en modo avión? ¿lo concede?** ¿Lee el QR? Anotar segundos.
5. [ ] Crear 10–20 registros en A, generar QR animado (2–3 fragmentos) → ¿B completa el reensamblado? Segundos. Probar chunk 300 y 800.
6. [ ] En B, volver a leer el mismo QR → debe decir «0 nuevos · N duplicados».
7. [ ] Fallback: captura de pantalla del QR en A, enviarla a B (o laptop) → «subir imagen». Enlace relay: copiar y abrir en B.
8. [ ] En B: cerrar y reabrir en modo avión → ¿siguen los registros recibidos?
9. [ ] Desactivar modo avión en B con endpoint `/api/sync` o `mock:local` → ¿pasan a «sincronizado» solos?
10. [ ] Laptop con webcam (para jurado): abrir la URL, elegir cámara en el selector, leer el QR del teléfono.
11. [ ] Anotar modelo, SO y navegador de cada teléfono + resultados.

## Despliegue
`scripts/build-worker.mjs` embebe `dist/` en un `_worker.js` (Pages advanced mode) y genera `deploy/deploy-code.js`, que se ejecutó con el conector Cloudflare (API de Pages, proyecto `yaku-relay-proto`). No hay claves en ningún archivo.
