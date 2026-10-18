# Yaku Relay

[![CI](https://github.com/agentards/yaku/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/agentards/yaku/actions/workflows/ci.yml)

Cadena de apoyo vecinal ante el Fenómeno El Niño. El vecino reporta un incidente **sin señal** (tipo, foto y ubicación), el reporte pasa **de celular en celular por QR** y el primero que encuentra internet sube toda la cadena. La municipalidad lo ve agrupado, con cuántos vecinos lo respaldan, lo valida y responde; la respuesta vuelve por la misma cadena.

> Los reportes son **reportes vecinales por validar**: no son alertas oficiales ni reemplazan a SINPAD ni a EDAN Digital. Las capas CENEPRED son escenarios de riesgo, no daños observados; la cobertura móvil es la declarada ante OSIPTEL.

En producción: **https://yaku.lat**

## Qué hace
- **El vecino** (`/reportar`, PWA que funciona sin internet): elige entre 9 tipos de incidente, marca la gravedad y puede agregar una foto, que se comprime en el celular a JPEG de 150 KB o menos. Todo se guarda en el celular (IndexedDB). Si hay personas atrapadas o heridas, primero ve los números 116 y 105.
- **Relevo por QR** («Intercambiar»): en un solo paso cada celular muestra su QR y lee el del otro. Viajan los reportes, los estados que puso la municipalidad, sus avisos firmados y los mensajes «Estoy bien» (base45 + deflate + CRC32; QR animado por fragmentos). Las fotos no viajan por QR: las sube el celular que las tomó cuando tiene internet.
- **Sincronización:** con internet, el reporte sale apenas se guarda; después suben las fotos y bajan estados y avisos. Cada registro tiene un id derivado de su contenido, así que llegar por varios caminos no lo duplica.
- **Centro de monitoreo** (`/municipalidad`, Piura y Lima):
  - Mapa 3D con relieve en Piura y edificios en Lima.
  - Los reportes cercanos de vecinos distintos se agrupan en un incidente, con un respaldo de 0 a 100 y un nivel N1–N3.
  - Validar, descartar o asignar una acción (rescate, bomberos, provisiones, maquinaria o EDAN); el historial guarda quién y cuándo.
  - Línea de tiempo con el histórico reproducible y «Eventos clave».
  - Capas oficiales (CENEPRED/SIGRID, OSIPTEL) y modo claro u oscuro.
- **Avisos de la municipalidad:** al asignar una acción se genera un aviso firmado (ECDSA P-256). Los celulares con red lo reciben en 20 s o menos y lo pasan por QR; el celular verifica la firma sin red, siempre que antes haya abierto la app con internet una vez. El aviso dice «asignado», nunca «en camino».
- **Estoy bien:** el vecino deja un mensaje para su familia en `/estoy-bien` (también sin internet, viaja por QR) y la familia, también desde el extranjero, lo busca por nombre en `/estamos-bien`.

## Rutas
| URL | Qué abre |
|---|---|
| `/` | Página pública |
| `/reportar` | App del vecino (PWA, funciona sin internet) |
| `/municipalidad` | Centro de monitoreo (usuario + contraseña municipal); `?region=piura` o `?region=lima` |
| `/estoy-bien` | El vecino deja su mensaje «Estoy bien» (también sin internet) |
| `/estamos-bien` | La familia busca esos mensajes por nombre, sin abrir la app; el enlace `?nombre=` se puede compartir |
| `/app` | Vista técnica 2D |

## API (servidor Docker)
| Ruta | Acceso | Para qué |
|---|---|---|
| `POST /api/sync` | público | Sube reportes (idempotente por id) |
| `POST /api/fotos` | público | Foto de un reporte ya subido (JPEG de 150 KB o menos) |
| `GET /api/estado?ids=` | público | Estado que puso la municipalidad a esos reportes |
| `GET /api/avisos`, `GET /api/avisos/clave` | público | Avisos firmados y clave pública para verificarlos |
| `POST /api/cartas`, `GET /api/cartas?q=`, `GET /api/estamos-bien?nombre=` | público | «Estoy bien»: búsqueda desde 3 letras, nunca un listado completo |
| `GET /api/stats`, `GET /api/reports` | público | Conteos; reportes por id o desde una fecha (en modo estricto, el histórico pide sesión) |
| `POST` / `GET` / `DELETE /api/sesion` | — | Entrar (usuario + contraseña → token), quién soy, salir |
| `GET /api/incidentes`, `POST /api/incidentes/:id/(estado\|unir\|separar)`, `GET /api/fotos/:id` | sesión o PIN | Centro de monitoreo |

## Desplegar en Dokploy
Una sola imagen: la PWA compilada + un servidor Node con SQLite (`node:sqlite`). Datos y fotos en el volumen `yaku-datos`. El compose no trae Traefik ni publica puertos: el proxy y HTTPS los pone Dokploy. La app escucha en el **puerto 8080** del contenedor.

1. DNS: registros **A** de `yaku.lat` y `www.yaku.lat` a la IP del VPS (si el DNS está en Cloudflare, en «DNS only»).
2. Dokploy → Create Service → **Compose** (tipo «Docker Compose», no «Stack») → este repo, rama `main`, `./docker-compose.yml`.
3. **Environment** (plantilla en `yaku.env.ejemplo`):

| Variable | Valor | Nota |
|---|---|---|
| `MUNI_PIN` | un secreto | **Obligatoria.** Respaldo (versión sin usuarios) y contraseña de `central` si `MUNI_CLAVE` está vacía |
| `MUNI_CLAVE` | contraseña larga | **Secreta.** Contraseña del usuario de `/municipalidad`. Si cambia, se cierran las sesiones abiertas |
| `MUNI_USUARIO` | `central` (por defecto) | Usuario del Centro de monitoreo |
| `MUNI_NOMBRE` | `Municipio central` (por defecto) | Nombre que se muestra y queda en el historial |
| `YAKU_SESION_HORAS` | `72` (por defecto) | Cuánto dura la sesión guardada en el navegador |
| `YAKU_MODO_ESTRICTO` | `0` (por defecto) | `1` activa las protecciones extra (ver Seguridad) |

4. **Domains**: servicio `yaku`, host `yaku.lat`, **Container Port `8080`**, HTTPS activado con Let's Encrypt. Repetir con `www.yaku.lat` si se quiere.
5. **Deploy**. En los logs debe aparecer `Yaku servidor local en http://localhost:8080` y `Centro de monitoreo: usuario «central» (creado)`. El usuario se crea solo en el SQLite del volumen al arrancar y se actualiza si cambia `MUNI_CLAVE`. Si una variable queda vacía, el servidor arranca igual.

Antes de desplegar, `npm run qa:despliegue` simula los despliegues de Dokploy (variables resueltas con `docker compose config`, el mismo servidor empaquetado y un volumen temporal): primero, redespliegue, cambio de contraseña, `MUNI_CLAVE` vacía y sin `MUNI_PIN`. Después, `npm run qa:produccion -- https://yaku.lat` revisa producción sin escribir datos; con la contraseña en `YAKU_CLAVE` prueba también la sesión completa.

Requisitos del VPS: unos 2 GB de RAM para compilar la imagen (o swap).

## Seguridad
- **Acceso:** usuario + contraseña (scrypt en SQLite) → token de sesión (el navegador guarda el token, el servidor solo su hash). Incidentes, fotos y cambios de estado exigen `Authorization: Bearer <token>` o, como respaldo, `X-Muni-Pin`. «Salir» cierra la sesión; cambiar `MUNI_CLAVE` cierra todas.
- **Avisos firmados:** la clave privada queda en el volumen (`/datos/avisos-clave.json`); nadie en la cadena de celulares puede inventar ni cambiar un aviso.
- **Por defecto (MVP)** no hay bloqueo por intentos ni límites.
- `YAKU_MODO_ESTRICTO=1` (para producción real): 10 contraseñas o PIN incorrectos seguidos desde una IP → 5 min de espera, histórico de reportes solo con sesión, límites de escritura por IP, máximo 3 fotos por reporte y cuota total, sin CORS y cabeceras `X-Frame-Options`, `Referrer-Policy`, HSTS.
- Nunca subas un `.env` ni valores reales de variables al repo.

## Desarrollo
Node.js 24 (`.nvmrc`; mínimo 22.18).
```bash
npm ci
npm run dev                  # http://localhost:5173
npm run typecheck && npm run typecheck:servidor
npm test                     # build + vitest
npm run test:servidor        # API, sesión, agrupación, fotos, avisos, «Estoy bien», seguridad
PORT=8787 MUNI_PIN=<pin> npm run servidor   # build + servidor local en http://localhost:8787
```
Pruebas de punta a punta con Chrome local (dejan capturas en `docs/` y `results/`, ignorados por git):

| Comando | Qué prueba |
|---|---|
| `npm run ensayo:demo` | La demo completa: reporte sin red, relevo QR, validación, aviso firmado de vuelta por QR, «Estoy bien» |
| `npm run e2e:poblador:real` | Dos celulares A ↔ B contra el servidor real |
| `npm run e2e:envio` | El reporte llega en menos de 3 s aunque la foto anterior siga subiendo |
| `npm run e2e:monitoreo` · `e2e:lima` · `e2e:sesion` | Centro de monitoreo, región Lima, sesión sin volver a pedir contraseña |
| `npm run e2e:estamos-bien` · `e2e:rutas` · `e2e:landing` | Búsqueda de la familia, rutas, página pública |

## Cloudflare (alternativa)
`npm run build && npm run build:worker` genera `deploy/_worker.js` (Pages en modo avanzado, `server/worker.ts`) con D1 (binding `DB`) y KV (binding `BASEMAP`, los `.pmtiles` se suben con `scripts/upload-basemap.mjs`). El Worker solo tiene `/api/sync`, `/api/stats` y `/api/reports`: incidentes, fotos, estados, sesión, avisos y «Estoy bien» existen solo en el servidor Docker. Los videos de la página pública no se embeben en el Worker.

## Licencia y atribuciones
- **Código:** licencia por definir.
- **Datos y mapas:** © colaboradores de OpenStreetMap (ODbL), mapa base vía Protomaps (ver `data/basemap/LICENSE_BASEMAP.md`); SENAMHI y CENEPRED/SIGRID vía el geoservicio de INDECI; centros poblados del IGN; cobertura móvil de OSIPTEL (Datos Abiertos, ODC-By).
