# Yaku Relay

[![CI](https://github.com/agentards/yaku/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/agentards/yaku/actions/workflows/ci.yml)

Cadena de apoyo vecinal ante el Fenómeno El Niño. El vecino reporta un incidente **sin señal** (tipo, foto y ubicación), el reporte pasa **de celular en celular por QR** y el primero que encuentra internet sube toda la cadena. La municipalidad lo ve agrupado, con cuántos vecinos lo respaldan, lo valida y responde; la respuesta vuelve por la misma cadena.

> Los reportes son **reportes vecinales por validar**: no son alertas oficiales ni reemplazan a SINPAD ni a EDAN Digital. Las capas CENEPRED son escenarios de riesgo, no daños observados; la cobertura móvil es la declarada ante OSIPTEL.

## Rutas
| URL | Qué abre |
|---|---|
| `/` | Página pública |
| `/reportar` | App del vecino (PWA, funciona sin internet) |
| `/municipalidad` | Centro de monitoreo (nombre + PIN municipal) |
| `/app` | Vista técnica 2D |

## Desplegar en Dokploy
Una sola imagen: la PWA compilada + un servidor Node con SQLite (`node:sqlite`). Datos y fotos en el volumen `yaku-datos`. El compose no trae Traefik ni publica puertos: el proxy y HTTPS los pone Dokploy. La app escucha en el **puerto 8080** del contenedor.

1. DNS: registros **A** de `yaku.lat` y `www.yaku.lat` a la IP del VPS (si el DNS está en Cloudflare, en «DNS only»).
2. Dokploy → Create Service → **Compose** (tipo «Docker Compose», no «Stack») → este repo, rama `main`, `./docker-compose.yml`.
3. **Environment** (plantilla en `yaku.env.ejemplo`):

| Variable | Valor | Nota |
|---|---|---|
| `MUNI_CLAVE` | contraseña larga | **Secreta.** Contraseña del usuario `central` (`MUNI_USUARIO`) para entrar a `/municipalidad`. La sesión queda guardada en el equipo 72 h (`YAKU_SESION_HORAS`) |
| `MUNI_PIN` | otro secreto | **Obligatoria.** Respaldo (versión sin usuarios) y contraseña de `central` si `MUNI_CLAVE` está vacía |
| `YAKU_MODO_ESTRICTO` | `0` (por defecto) | `1` activa las protecciones extra (ver Seguridad) |

4. **Domains**: servicio `yaku`, host `yaku.lat`, **Container Port `8080`**, HTTPS activado con Let's Encrypt. Repetir con `www.yaku.lat` si se quiere.
5. **Deploy**. En los logs debe aparecer `Yaku servidor local en http://localhost:8080`.

Requisitos del VPS: unos 2 GB de RAM para compilar la imagen (o swap).

## Seguridad
- **Acceso:** usuario + contraseña (scrypt en SQLite) → token de sesión (el navegador guarda el token, el servidor solo su hash). Incidentes, fotos y cambios de estado exigen `Authorization: Bearer <token>` o, como respaldo, `X-Muni-Pin`. «Salir» cierra la sesión; cambiar `MUNI_CLAVE` cierra todas.
- **Por defecto (MVP)** no hay bloqueo por intentos ni límites.
- `YAKU_MODO_ESTRICTO=1` (para producción real): 10 PIN incorrectos seguidos desde una IP → 5 min de espera, histórico de reportes solo con PIN, límites de escritura por IP, máximo 3 fotos por reporte y cuota total, sin CORS y cabeceras `X-Frame-Options`, `Referrer-Policy`, HSTS.
- Nunca subas un `.env` ni valores reales de variables al repo.

## Desarrollo
Node.js 24 (`.nvmrc`; mínimo 22.18).
```bash
npm ci
npm run dev                  # http://localhost:5173
npm run typecheck && npm run typecheck:servidor
npm test                     # build + vitest
npm run test:servidor        # API, PIN, agrupación, fotos, seguridad
PORT=8787 MUNI_PIN=<pin> npm run servidor   # build + servidor local en http://localhost:8787
```
Los E2E (`npm run e2e:*`) usan Chrome local y dejan capturas en `docs/` y `results/` (ignorados por git).

## Cloudflare (alternativa)
`npm run build && npm run build:worker` genera `deploy/_worker.js` (Pages en modo avanzado, `server/worker.ts`) con D1 (binding `DB`) y KV (binding `BASEMAP`, los `.pmtiles` se suben con `scripts/upload-basemap.mjs`). El Worker solo tiene `/api/sync`, `/api/stats` y `/api/reports`: incidentes, fotos, estados y PIN existen solo en el servidor Docker. Los videos de la página pública no se embeben en el Worker.

## Licencia y atribuciones
- **Código:** licencia por definir.
- **Datos y mapas:** © colaboradores de OpenStreetMap (ODbL), mapa base vía Protomaps (ver `data/basemap/LICENSE_BASEMAP.md`); SENAMHI y CENEPRED/SIGRID vía el geoservicio de INDECI; centros poblados del IGN; cobertura móvil de OSIPTEL (Datos Abiertos, ODC-By).
