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

## Desplegar con Docker Compose (Dokploy u otro VPS con Traefik)
Una sola imagen: la PWA compilada + un servidor Node con SQLite (`node:sqlite`). Datos y fotos en el volumen `yaku-datos`. La app no publica puertos: Traefik entra por su red al puerto 8080.

1. DNS: registros **A** de `yaku.lat` y `www.yaku.lat` a la IP del VPS (si el DNS está en Cloudflare, en «DNS only»).
2. Dokploy → Create Service → **Compose** (tipo «Docker Compose», no «Stack») → este repo, rama `main`, `./docker-compose.yml`, «Isolated Deployments» apagado.
3. Pestaña **Environment** (plantilla en `yaku.env.ejemplo`):

| Variable | Valor | Nota |
|---|---|---|
| `MUNI_PIN` | 12+ caracteres | **Obligatoria y secreta.** Sin ella (o con menos de 8) el servidor no arranca |
| `YAKU_HOST` | `yaku.lat` | `www` redirige a la raíz y `http` a `https` |
| `TRAEFIK_NETWORK` | `dokploy-network` | Red del Traefik que ya existe |
| `TRAEFIK_EXTERNA` | `true` | `false` solo en un VPS limpio (ver abajo) |

4. **Deploy**, sin agregar el dominio en «Domains»: los labels de Traefik ya van en el compose. En los logs debe aparecer `Yaku servidor local en http://localhost:8080`.

VPS limpio, sin proxy: `TRAEFIK_EXTERNA=false ACME_EMAIL=<correo> docker compose --profile traefik up -d --build` levanta también Traefik con HTTPS de Let's Encrypt (publica 80 y 443).

Requisitos del VPS: unos 2 GB de RAM para compilar la imagen (o swap).

## Seguridad
- Lo de la municipalidad (incidentes, fotos, histórico de reportes y cambios de estado) exige el PIN (`X-Muni-Pin`). Tras 5 intentos fallidos desde una IP, esa IP espera 15 minutos.
- Público: enviar reportes y fotos (con límite por IP y minuto, máximo 3 fotos por reporte y cuota total), el acuse de cada vecino por id y contadores agregados.
- Sin CORS abierto (la API y la app comparten origen); cabeceras `nosniff`, `X-Frame-Options`, `Referrer-Policy` y HSTS.
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
