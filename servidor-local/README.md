# servidor-local — Yaku en localhost (WP1)

Un solo proceso Node (≥ 22.13; probado con 26.1) que sirve la PWA compilada (`dist/`) y la API con SQLite (`node:sqlite`, sin dependencias en runtime). Nada de Cloudflare: nunca escribe en la base de producción.

## Cómo verlo
```bash
npm run servidor          # vite build + empaqueta + levanta http://localhost:8080
npm run servidor:dev      # sin compilar: node servidor-local/servidor.ts (usa el dist/ que haya)
npm run test:servidor     # 61 tests (los 7 de §3, respaldo, prioridad, estados, fotos, HTTP, login Clerk/PIN, histórico)
# con la clave pública de Clerk del .env.local del front (git-ignorado), en un puerto libre:
PORT=8790 node --env-file-if-exists=.env.local servidor-local/servidor.ts
```
Si no defines `MUNI_PIN`, la consola muestra un **PIN temporal** al arrancar. Datos en `servidor-local/datos/` (gitignored: `yaku.db`, `fotos/` y `clerk-jwks.json`). En esta laptop el 8080 lo ocupa `AgentService.exe` de Windows: usa `PORT=8787` u otro libre.

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Escucha (0.0.0.0 para celulares en la LAN o ngrok) |
| `YAKU_DIST` | `dist` | Carpeta de la PWA |
| `YAKU_DATOS` | `servidor-local/datos` | SQLite + fotos (en Docker: volumen `/datos`) |
| `MUNI_PIN` | temporal | Plan B sin Clerk: protege lo del municipio (cabecera `X-Muni-Pin`) |
| `YAKU_REGLAS` | — | JSON parcial para cambiar radios, ventanas o pesos sin tocar código (ver `reglas.ts`) |
| `CLERK_PUBLISHABLE_KEY` | — | `pk_test_…`/`pk_live_…` (pública). Activa el login: de ahí sale el Frontend API y su JWKS. Si falta, se usa `VITE_CLERK_PUBLISHABLE_KEY` (la del front) |
| `CLERK_JWT_KEY` | — | Clave pública PEM de la instancia (Clerk → API keys → «JWT public key»). Verifica **sin red**; acepta `\n` literales |
| `CLERK_AUTHORIZED_PARTIES` | orígenes `localhost` / `127.0.0.1` (cualquier puerto) | Orígenes (`azp`) separados por coma, p. ej. `https://yaku.midominio.pe`. Si la defines, reemplaza a localhost |
| `CLERK_ISSUER` | `https://<frontend-api>` | `iss` esperado; solo hace falta si usas `CLERK_JWT_KEY` sin publishable key |
| `YAKU_PERMITIR_PIN` | `0` | `1` = con Clerk activo, el PIN también vale (plan B en la demo) |

## Login (auth.ts)
Lo protegido: `GET /api/incidentes`, `GET /api/fotos/:id` (fotos de casas: dato sensible) y las escrituras `POST /api/incidentes/:id/estado|unir|separar`. Siguen públicos `POST /api/sync`, `POST /api/fotos`, `GET /api/estado`, `GET /api/stats` y `GET /api/reports`.
- **Con Clerk configurado** (`CLERK_PUBLISHABLE_KEY` o `CLERK_JWT_KEY`): `Authorization: Bearer <token de sesión>` (`await Clerk.session.getToken()`). Se verifica **solo con clave pública** (`node:crypto`, sin dependencias, sin secret key): `alg` RS256, firma con el JWKS de `https://<frontend-api>/.well-known/jwks.json` (caché en memoria y en `YAKU_DATOS/clerk-jwks.json`: si se va la red sigue validando; se baja al arrancar y, ante un `kid` nuevo, como mucho 1 vez cada 30 s) o con el PEM; `exp`/`nbf` con ±5 s; `iss`; `azp` dentro de `CLERK_AUTHORIZED_PARTIES`; `sub`. El PIN solo vale si `YAKU_PERMITIR_PIN=1`.
- **Rol**: claim opcional `rol` (Clerk → Sessions → Customize session token: `{"rol": "{{user.public_metadata.rol}}"}`). `operador` o sin claim = mira y escribe; `monitor` (o cualquier otro valor) = solo mira.
- **Sin Clerk**: `X-Muni-Pin` como siempre.
- Respuestas: **401** sin credencial · **403** credencial inválida o rol insuficiente. Cuerpo `{error, codigo}` en español; `codigo` ∈ `sin_credencial`, `vencido` (pedir token nuevo y reintentar), `nbf`, `firma`, `algoritmo`, `formato`, `emisor`, `azp`, `sub`, `sin_clave`, `rol`, `pin`, `pin_desactivado`.
- **Historial**: cada cambio guarda `quien` (el nombre que manda el cliente) y `usuario` (`sub` de Clerk o `pin`); sale en `historial[]` y `ajustes[]` de `/api/incidentes`.
- Las fotos protegidas no cargan con `<img src>` (no manda cabeceras): el cliente las pide con `fetch` + cabeceras y usa `URL.createObjectURL`.

## API
| Ruta | Qué hace |
|---|---|
| `POST /api/sync` | **Mismo contrato que `server/worker.ts`**: `{records:[...]}` (texto JSON, ≤ 128 KB, ≤ 200) → `{accepted, inserted, duplicates, rejected, persisted}`. Recalcula el id y hace `INSERT OR IGNORE`: idempotente. Asigna cada reporte nuevo a un incidente |
| `GET /api/reports[?ids=…&limit=]` · `GET /api/stats` | Igual que el Worker (stats agrega `incidentes`): sin `desde`, los últimos `limit` ≤ 200, del más nuevo al más viejo |
| `GET /api/reports?desde=<ms>&limit=<≤5000>` | Histórico para la línea de tiempo: `received_at ≥ desde`, **del más antiguo al más nuevo**, `limit` 1000 por defecto (tope 5000). Devuelve `{count, reports, desde, hasta, truncado}`; si `truncado`, pide de nuevo con `desde=hasta` y descarta ids repetidos. 400 si `desde` no es número |
| `GET /api/incidentes` | Login. Incidentes ordenados por prioridad con `personas`, `reportes`, `fotos`, `puntaje` (= respaldo 0–100), `nivel` N1–N3, `desglose`, `fotos_pendientes` (marcaron «(con foto)» y la imagen no llegó: suman 0), `estado`, `accion`, `historial` (quién y cuándo), `recurrencia_de`, `nuevos_tras_descarte` |
| `POST /api/fotos` | `{reportId, data: base64 o dataURL}` o binario `image/*` con `?reporte=`. ≤ 400 KB, solo JPEG/PNG/WebP (bytes mágicos). Id = hash del contenido (idempotente) |
| `GET /api/fotos/:id` | Login. La imagen |
| `POST /api/incidentes/:id/estado` | Login con rol operador. `{estado, quien, accion?, motivo?}`. Flujo `nuevo → en_revision → validado / descartado(motivo) → accion_asignada(rescate, bomberos, provisiones, maquinaria, edan) → atendido`. 401 sin credencial, 403 inválida o rol monitor, 409 salto no permitido |
| `POST /api/incidentes/:id/unir` · `/separar` | Login con rol operador. `{con, quien}` / `{reportes:[ids], quien}`. Corrección manual; los reportes crudos nunca se borran |
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
#   VITE_CLERK_PUBLISHABLE_KEY=pk_…   (build arg del front y verificación en el servidor; es pública)
#   CLERK_JWT_KEY=…  CLERK_AUTHORIZED_PARTIES=… (por defecto https://$YAKU_HOST)  YAKU_PERMITIR_PIN=0
docker compose up -d --build                  # requiere la red externa «traefik»
TRAEFIK_EXTERNA=false docker compose up -d    # si aún no hay Traefik (la red la crea compose)
```
Volumen `yaku-datos` → `/datos` (base y fotos). **No probado en este equipo**: Docker Desktop estaba apagado y el disco C: tenía ~2 GB libres; sí se validó `docker compose config` y el paquete `salida/servidor.mjs` (el mismo que corre la imagen) contra `dist/` real. Tamaño esperado ≈ 180 MB (base alpine + 15 MB de dist), sin medir.
