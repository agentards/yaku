# servidor-local — Yaku en localhost (WP1)

Un solo proceso Node (≥ 22.13; probado con 26.1) que sirve la PWA compilada (`dist/`) y la API con SQLite (`node:sqlite`, sin dependencias en runtime). Nada de Cloudflare: nunca escribe en la base de producción.

## Cómo verlo
```bash
npm run servidor          # vite build + empaqueta + levanta http://localhost:8080
npm run servidor:dev      # sin compilar: node servidor-local/servidor.ts (usa el dist/ que haya)
npm run test:servidor     # 61 tests (los 7 de §3, respaldo, prioridad, estados, fotos, HTTP, PIN, histórico)
# en un puerto libre y con PIN fijo:
PORT=8790 MUNI_PIN=1234 node servidor-local/servidor.ts
```
Si no defines `MUNI_PIN`, la consola muestra un **PIN temporal** al arrancar. Datos en `servidor-local/datos/` (gitignored: `yaku.db` y `fotos/`). En esta laptop el 8080 lo ocupa `AgentService.exe` de Windows: usa `PORT=8787` u otro libre.

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Escucha (0.0.0.0 para celulares en la LAN o ngrok) |
| `YAKU_DIST` | `dist` | Carpeta de la PWA |
| `YAKU_DATOS` | `servidor-local/datos` | SQLite + fotos (en Docker: volumen `/datos`) |
| `MUNI_PIN` | temporal | PIN del Centro de monitoreo: protege lo del municipio (cabecera `X-Muni-Pin`) |
| `YAKU_REGLAS` | — | JSON parcial para cambiar radios, ventanas o pesos sin tocar código (ver `reglas.ts`) |

## Login (auth.ts)
Lo protegido: `GET /api/incidentes`, `GET /api/fotos/:id` (fotos de casas: dato sensible) y las escrituras `POST /api/incidentes/:id/estado|unir|separar`. Siguen públicos `POST /api/sync`, `POST /api/fotos`, `GET /api/estado`, `GET /api/stats` y `GET /api/reports`.
- Credencial: cabecera `X-Muni-Pin` con el `MUNI_PIN` del servidor (comparación en tiempo constante).
- Respuestas: **401** sin PIN · **403** PIN incorrecto. Cuerpo `{error, codigo}` en español; `codigo` ∈ `sin_credencial`, `pin`.
- **Historial**: cada cambio guarda `quien` (el nombre que manda el cliente) y `usuario` (`pin`); sale en `historial[]` y `ajustes[]` de `/api/incidentes`.
- Las fotos protegidas no cargan con `<img src>` (no manda cabeceras): el cliente las pide con `fetch` + cabeceras y usa `URL.createObjectURL`.

## API
| Ruta | Qué hace |
|---|---|
| `POST /api/sync` | **Mismo contrato que `server/worker.ts`**: `{records:[...]}` (texto JSON, ≤ 128 KB, ≤ 200) → `{accepted, inserted, duplicates, rejected, persisted}`. Recalcula el id y hace `INSERT OR IGNORE`: idempotente. Asigna cada reporte nuevo a un incidente |
| `GET /api/reports[?ids=…&limit=]` · `GET /api/stats` | Igual que el Worker (stats agrega `incidentes`): sin `desde`, los últimos `limit` ≤ 200, del más nuevo al más viejo |
| `GET /api/reports?desde=<ms>&limit=<≤5000>` | Histórico para la línea de tiempo: `received_at ≥ desde`, **del más antiguo al más nuevo**, `limit` 1000 por defecto (tope 5000). Devuelve `{count, reports, desde, hasta, truncado}`; si `truncado`, pide de nuevo con `desde=hasta` y descarta ids repetidos. 400 si `desde` no es número |
| `GET /api/incidentes` | PIN. Incidentes ordenados por prioridad con `personas`, `reportes`, `fotos`, `puntaje` (= respaldo 0–100), `nivel` N1–N3, `desglose`, `fotos_pendientes` (marcaron «(con foto)» y la imagen no llegó: suman 0), `estado`, `accion`, `historial` (quién y cuándo), `recurrencia_de`, `nuevos_tras_descarte` |
| `POST /api/fotos` | `{reportId, data: base64 o dataURL}` o binario `image/*` con `?reporte=`. ≤ 400 KB, solo JPEG/PNG/WebP (bytes mágicos). Id = hash del contenido (idempotente) |
| `GET /api/fotos/:id` | PIN. La imagen |
| `POST /api/incidentes/:id/estado` | PIN. `{estado, quien, accion?, motivo?}`. Flujo `nuevo → en_revision → validado / descartado(motivo) → accion_asignada(rescate, bomberos, provisiones, maquinaria, edan) → atendido`. 401 sin PIN, 403 PIN incorrecto, 409 salto no permitido |
| `POST /api/incidentes/:id/unir` · `/separar` | PIN. `{con, quien}` / `{reportes:[ids], quien}`. Corrección manual; los reportes crudos nunca se borran |
| `GET /api/estado?ids=` | Acuse para el celular: por reporte `{recibido, incidente, estado, accion, cuando, personas}` |
| `GET /salud` | `ok` (healthcheck de Docker) |

## Reglas (fuente: `agentards/producto/decision-confianza.md`, 17-oct-2026)
- **Agrupación** (`agrupacion.ts`, pura): familia de tipo + radio medido al **ancla** (primer reporte) + ventana desde el último reporte. Agua y terreno 250 m / 3 h · daños (vivienda, heridos) 100 m / 12 h · atrapados 50 m / 12 h, nunca con otro tipo · ayuda 150 m / 24 h · otro no agrupa entre personas. Nivel 3: mismo `device_id` + tipo, ≤ 50 m y ≤ 30 min = actualización. Un incidente atendido no recibe más: se abre uno nuevo enlazado (`recurrencia_de`).
- **Respaldo** = round((Personas + Fotos + Cercanía) × Recencia): personas 25/40/50/55, fotos recibidas 15/25 (1 por dispositivo), cercanía 20/12/5 por mediana al ancla, recencia `max(0,2; 0,5^(h/T½))`. La severidad **no** suma: va a la prioridad. Al validar, el respaldo se congela.
- **Prioridad**: abiertos primero · atrapados > heridos > resto · severidad · respaldo · más reciente.
- La asignación se guarda al llegar cada reporte (tabla `asignaciones`), así el id del incidente no cambia y su estado no se pierde. Si cambias las reglas, afectan a los reportes nuevos.

## Docker en un VPS
`Dockerfile` (raíz, multi-etapa: compila la PWA y empaqueta el servidor; runtime `node:24-alpine` sin `node_modules`, usuario sin privilegios, healthcheck en `/salud`) y `docker-compose.yml`: la app **no publica puertos** (solo `expose: 8080` + labels de Traefik con el host en `YAKU_HOST`). Datos en el volumen `yaku-datos` → `/datos` (base SQLite y fotos): sobrevive a reinicios y a `--build`.
```bash
git clone https://github.com/agentards/yaku && cd yaku && git checkout feat/poblador-municipio
cp yaku.env.ejemplo .env          # completar MUNI_PIN, YAKU_HOST (DNS al VPS) y ACME_EMAIL
# A) el VPS ya tiene Traefik (Easypanel, Dokploy, Coolify o uno propio en la red «traefik»):
docker compose up -d --build
# B) VPS limpio: el perfil «traefik» levanta también Traefik v3 con HTTPS de Let's Encrypt (publica 80 y 443)
TRAEFIK_EXTERNA=false docker compose --profile traefik up -d --build
docker compose logs -f yaku        # «Yaku servidor local en http://localhost:8080»
```
Respaldo: `docker run --rm -v yaku_yaku-datos:/datos -v "$PWD":/r alpine tar czf /r/yaku-datos.tgz -C /datos .` (el prefijo del volumen es el nombre de la carpeta).
Los celulares necesitan **HTTPS** para la cámara y el modo sin conexión: por eso el dominio con certificado.
**No probado en este equipo** (Docker Desktop apagado y disco C: casi lleno): sí se validó `docker compose config` en ambos modos y el paquete `salida/servidor.mjs` (el mismo que corre la imagen) contra el `dist/` real. Tamaño esperado ≈ 180 MB, sin medir.
