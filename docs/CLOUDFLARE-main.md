# Desplegar `main` en Cloudflare (17-oct-2026)

`main` = el trabajo de `feat/poblador-municipio` hasta el commit `7668c1b` (todo en verde: vitest 206/206, servidor 46/46, E2E del Centro de monitoreo 31/31 y ensayo de la demo 10/10). El Worker (`server/worker.ts`) y el esquema de D1 **no cambiaron**; el codec suma 4 tipos **al final** de `OBS_TYPES` (`vivienda`, `atrapados`, `heridos`, `ayuda`), que el Worker ya acepta porque importa `src/codec.ts`. Los QR viejos siguen leyéndose.

## Qué trae
- **Modo vecino** (`?vista=poblador`, por defecto en celular): botones grandes por tipo, foto, aviso 116/105 en atrapados y heridos, «Intercambiar» por QR en un paso, cadena acumulada.
- **Centro de monitoreo** (escritorio sin `?vista`, o `?vista=portal|municipalidad|incidentes`): portal 3D + monitor en vivo + incidentes agrupados con «Respaldo», histórico real en la línea de tiempo, acceso con nombre + PIN.
- Lector de QR más fiable con cámara real (recortes centrales + rotación).

## Pasos (igual que antes)
```bash
npm ci
npm run build            # dist/
npm run build:worker     # deploy/_worker.js (~3,8 MB; los .pmtiles no se embeben)
```
Los `.pmtiles` van a KV (`BASEMAP`) con `scripts/upload-basemap.mjs`, uno por archivo. **Nuevos** respecto de producción, para la vista 3D: `public/basemap/piura_dem_z9.00100654.pmtiles` y `public/basemap/piura_basemap_z12.cc6d9219.pmtiles` (el z11 ya estaba). Sin ellos, el 2D funciona y el 3D se queda sin relieve.

## Qué funciona en Cloudflare y qué no (hoy)
El Worker solo tiene `/api/sync`, `/api/stats` y `/api/reports`. Lo nuevo vive en `servidor-local/` (Node + SQLite):

| Función | En Cloudflare |
|---|---|
| Reportar sin red, intercambiar por QR, sincronizar | ✅ |
| Tipos nuevos (casa dañada, atrapados, heridos, ayuda) | ✅ |
| Centro de monitoreo: mapa 3D, histórico, incidentes agrupados | ✅ en **solo lectura**: sin `/api/incidentes` agrupa `/api/reports` en pantalla |
| Validar / asignar bomberos, rescate, provisiones | ❌ botones desactivados (falta `POST /api/incidentes/:id/estado`) |
| Fotos | ❌ quedan en el celular (falta `POST/GET /api/fotos`) |
| Acuse al vecino («Bomberos asignados») | ❌ (falta `GET /api/estado`) |
| PIN del Centro de monitoreo | ⚠️ la pantalla lo pide, pero sin servidor que lo valide entra cualquiera (los datos son los mismos públicos de `/api/reports`) |

Para tenerlo completo en Cloudflare hay que portar `servidor-local/api.ts` al Worker (ya está escrito como `Request → Response`): tablas de asignaciones, estados e historial en D1, fotos en R2 y `MUNI_PIN` como secreto. La alternativa es la imagen Docker (`Dockerfile` + `docker-compose.yml`, ver `servidor-local/README.md`), que ya trae todo.

## Ojo
- D1 de producción puede tener registros de personas reales: no borrarlos.
- En `feat/poblador-municipio` sigue en curso la landing de `yaku.lat` y las rutas `/reportar`, `/municipalidad`, `/app`; se pasará a `main` cuando esté en verde.
