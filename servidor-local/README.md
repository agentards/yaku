# servidor-local — Yaku en localhost (WP1)

Un solo proceso Node (≥ 22.13; probado con 26.1) que sirve la PWA compilada (`dist/`) y la API con SQLite (`node:sqlite`, sin dependencias en runtime). Nada de Cloudflare: nunca escribe en la base de producción.

## Cómo verlo
```bash
npm run servidor          # vite build + empaqueta + levanta http://localhost:8080
npm run servidor:dev      # sin compilar: node servidor-local/servidor.ts (usa el dist/ que haya)
npm run test:servidor     # 46 tests (los 7 de §3 en lógica pura y por SQLite real, respaldo, prioridad, estados, fotos, HTTP)
```
Si no defines `MUNI_PIN`, la consola muestra un **PIN temporal** al arrancar. Datos en `servidor-local/datos/` (gitignored: `yaku.db` y `fotos/`).

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Escucha (0.0.0.0 para celulares en la LAN o ngrok) |
| `YAKU_DIST` | `dist` | Carpeta de la PWA |
| `YAKU_DATOS` | `servidor-local/datos` | SQLite + fotos (en Docker: volumen `/datos`) |
| `MUNI_PIN` | temporal | Protege las escrituras del municipio (cabecera `X-Muni-Pin`) |
| `YAKU_REGLAS` | — | JSON parcial para cambiar radios, ventanas o pesos sin tocar código (ver `reglas.ts`) |

## API
| Ruta | Qué hace |
|---|---|
| `POST /api/sync` | **Mismo contrato que `server/worker.ts`**: `{records:[...]}` (texto JSON, ≤ 128 KB, ≤ 200) → `{accepted, inserted, duplicates, rejected, persisted}`. Recalcula el id y hace `INSERT OR IGNORE`: idempotente. Asigna cada reporte nuevo a un incidente |
| `GET /api/reports[?ids=…&limit=]` · `GET /api/stats` | Igual que el Worker (stats agrega `incidentes`) |
| `GET /api/incidentes` | Incidentes ordenados por prioridad con `personas`, `reportes`, `fotos`, `puntaje` (= respaldo 0–100), `nivel` N1–N3, `desglose`, `fotos_pendientes` (marcaron «(con foto)» y la imagen no llegó: suman 0), `estado`, `accion`, `historial` (quién y cuándo), `recurrencia_de`, `nuevos_tras_descarte` |
| `POST /api/fotos` | `{reportId, data: base64 o dataURL}` o binario `image/*` con `?reporte=`. ≤ 400 KB, solo JPEG/PNG/WebP (bytes mágicos). Id = hash del contenido (idempotente) |
| `GET /api/fotos/:id` | La imagen |
| `POST /api/incidentes/:id/estado` | PIN. `{estado, quien, accion?, motivo?}`. Flujo `nuevo → en_revision → validado / descartado(motivo) → accion_asignada(rescate, bomberos, provisiones, maquinaria, edan) → atendido`. 401 sin PIN, 403 PIN malo, 409 salto no permitido |
| `POST /api/incidentes/:id/unir` · `/separar` | PIN. `{con, quien}` / `{reportes:[ids], quien}`. Corrección manual; los reportes crudos nunca se borran |
| `GET /api/estado?ids=` | Acuse para el celular: por reporte `{recibido, incidente, estado, accion, cuando, personas}` |
| `GET /salud` | `ok` (healthcheck de Docker) |

## Reglas (fuente: `agentards/producto/decision-confianza.md`, 17-oct-2026)
- **Agrupación** (`agrupacion.ts`, pura): familia de tipo + radio medido al **ancla** (primer reporte) + ventana desde el último reporte. Agua y terreno 250 m / 3 h · daños (vivienda, heridos) 100 m / 12 h · atrapados 50 m / 12 h, nunca con otro tipo · ayuda 150 m / 24 h · otro no agrupa entre personas. Nivel 3: mismo `device_id` + tipo, ≤ 50 m y ≤ 30 min = actualización. Un incidente atendido no recibe más: se abre uno nuevo enlazado (`recurrencia_de`).
- **Respaldo** = round((Personas + Fotos + Cercanía) × Recencia): personas 25/40/50/55, fotos recibidas 15/25 (1 por dispositivo), cercanía 20/12/5 por mediana al ancla, recencia `max(0,2; 0,5^(h/T½))`. La severidad **no** suma: va a la prioridad. Al validar, el respaldo se congela.
- **Prioridad**: abiertos primero · atrapados > heridos > resto · severidad · respaldo · más reciente.
- La asignación se guarda al llegar cada reporte (tabla `asignaciones`), así el id del incidente no cambia y su estado no se pierde. Si cambias las reglas, afectan a los reportes nuevos.

## Docker + Traefik
`Dockerfile` (raíz, multi-etapa: compila la PWA y empaqueta el servidor; runtime `node:24-alpine` sin `node_modules`) y `docker-compose.yml` sin `ports:`: solo `expose: 8080` y labels de Traefik con el host en `YAKU_HOST`.
```bash
# .env junto al compose: MUNI_PIN=…  YAKU_HOST=yaku.midominio.pe
docker compose up -d --build                  # requiere la red externa «traefik»
TRAEFIK_EXTERNA=false docker compose up -d    # si aún no hay Traefik (la red la crea compose)
```
Volumen `yaku-datos` → `/datos` (base y fotos). **No probado en este equipo**: Docker Desktop estaba apagado y el disco C: tenía ~2 GB libres; sí se validó `docker compose config` y el paquete `salida/servidor.mjs` (el mismo que corre la imagen) contra `dist/` real. Tamaño esperado ≈ 180 MB (base alpine + 15 MB de dist), sin medir.
