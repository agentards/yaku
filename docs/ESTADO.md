# Estado actual

Corte: 17-oct-2026, ~14:15 (hora de Lima). Este documento se actualiza con cada publicación.

## En producción y probado
| Función | Evidencia |
|---|---|
| PWA offline: segunda apertura sin red en Chrome (celular y escritorio) | E2E Playwright en producción: recarga sin red ~0,5 s, pestaña nueva ~0,8 s, 0 peticiones a la red (`results/e2e-prod-*.json`) |
| Mapa base propio de Piura (PMTiles z11, 2,6 MB) servido por la app, sin tile.openstreetmap.org | Revisión externa por red y E2E |
| Tiempo de guardado del mapa base (viewport celular) | 0,9 s sin límite · 3,7 s en 4G · 18,5 s en Fast 3G, simulados con Playwright (`results/basemap-measure-*.json`) |
| Capa «Escenario de riesgo CENEPRED», Aviso 421, con 930 centros poblados ubicados con el IGN | En producción desde las 13:55 (hora de Lima) |
| Registro offline con GPS, etiquetado «NO VERIFICADO» | E2E |
| Relevo por QR (animado si hace falta), enlace `#p=…` o imagen del QR | E2E con imagen de QR; 20 registros = 655 B comprimidos = 3 fragmentos (`results/qr-measure.md`) |
| Sincronización idempotente: el id se recalcula en el servidor y `INSERT OR IGNORE` en D1 | `tests/worker.test.ts` y E2E remoto |
| Base de demo limpia | `/api/stats` = 0 registros |

## En construcción (orden de salida)
1. Lista «Sin ubicar» con **8** centros poblados: 3 sin coordenadas y 5 con un punto de OSIPTEL fuera de su distrito. Además, 317 puntos con ubicación aproximada de OSIPTEL, con borde discontinuo. Hoy la pantalla todavía dice 325.
2. Filtro OSIPTEL: «445 de 928 sin cobertura garantizada según OSIPTEL». Los datos ya están en el bundle, pero el filtro sigue apagado.
3. Estados por centro poblado: «sin ficha de evaluación» y «con registro recibido, no verificado».
4. Ficha `er1` basada en el Anexo 01, firmada por el dispositivo, con verificación de la firma en el servidor y el QR de acuse.

## No probado todavía
- Cámara física y QR animado entre dos teléfonos reales, con 1 y con 20 fichas. La prueba la hace Brayan.
- BarcodeDetector real en Chrome Android, Safari iOS y Brave.
- Precisión real del GPS.
- Permiso de cámara en modo avión.
- Instalación como PWA y desalojo de almacenamiento.
- Rendimiento en gama baja.
- Soporte de Ed25519 en WebCrypto en los teléfonos de la demo. Si no hay, se usa ECDSA P-256.

## Pendiente de validación de producto
- Si EDAN Digital ya transfiere fichas entre teléfonos.
- La opinión de un evaluador EDAN o de un COE real.
