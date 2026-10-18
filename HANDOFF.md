# HANDOFF: lee esto primero (17-oct, 14:20 hora de Lima)

**Cierre duro: domingo 18-oct a las 09:00 (hora de Lima).** Para esa hora tienen que estar la URL pública, el demo en vivo y este repo. Un video no reemplaza el demo.

## Qué es
Yaku Relay es una PWA que funciona sin conexión. Sirve al evaluador EDAN del gobierno local, que tiene que levantar la Evaluación Rápida en un plazo de 2 a 4 horas (Lineamientos EDAN, RM 324-2023-PCM) desde centros poblados sin cobertura garantizada según OSIPTEL. El evaluador llena la ficha (Anexo 01, que tiene carácter de declaración jurada) y la pasa por QR de teléfono a teléfono hasta alguien que tenga conexión. Así el COE ve en el mapa qué centros poblados siguen **sin ficha de evaluación**. Es un complemento de EDAN Digital, no lo reemplaza. El detalle está en `docs/PRD.md` y `docs/PRODUCTO.md`.

## Estado
Revisa `docs/ESTADO.md`.
- **Ya está en producción:** el mapa base de Piura, la capa CENEPRED con 930 centros poblados, el registro offline, el relay por QR y la sincronización sin duplicados.
- **En construcción, en este orden:**
  1. la lista «Sin ubicar» (8);
  2. el filtro OSIPTEL;
  3. el estado de cada centro poblado;
  4. la ficha firmada `er1` y el QR de acuse `ack1`.

## Prioridad si falta tiempo
Primero la ficha firmada junto con las pruebas de rechazo (firma inválida, duplicado, payload corrupto). Después el QR de acuse, y al final el filtro OSIPTEL. Si hay empate, gana la complejidad técnica. Plan hora por hora: `docs/PRD.md` §9.

## Reglas que no se rompen
- Nunca subir claves al repo.
- Un reporte ciudadano nunca es una alerta oficial.
- Nunca escribir «vía segura» ni «transitable».
- Escribir «sin cobertura garantizada según OSIPTEL», no «sin señal».
- Escribir «centros poblados del escenario CENEPRED», no «expuestos» ni «afectados».
- No borrar registros de personas de fuera del equipo. Solo se borran los que tienen la etiqueta «prueba e2e».

## Cifras verificadas (no inventar otras)
- 1.255 centros poblados en total: 930 ubicados por IGN, 317 con punto aproximado de OSIPTEL y 8 sin ubicar.
- 445 de 928 sin cobertura garantizada, según lo que declaran los operadores.
- 20 registros ocupan 655 B y caben en 3 QR (v21).
- Guardar el mapa base: 3,7 s en 4G. Reabrirlo offline: unos 0,5 s.

## Pendiente de verificar
- Si EDAN Digital ya hace relay entre teléfonos.
- Una prueba real con cámara.
- Validación con un evaluador o un COE real.
- Soporte de Ed25519 en los teléfonos del demo (si no hay, usar ECDSA P-256).

Más documentación: `docs/ARQUITECTURA.md`, `docs/DATOS.md`, `docs/DECISIONES.md`, `docs/PRUEBAS.md`, `docs/SEGURIDAD.md`. PRD técnico: `docs/PRD.md`.

## Cómo correr y publicar
- **Rama y trabajo a medias:** se trabaja en `main`. Los bloques 1-3 se están construyendo ahora en la máquina de Builder y llegarán en commits posteriores: (1) filtro OSIPTEL 445 de 928 + 317 centros aproximados con borde discontinuo + lista «Sin ubicar» (8); (2) estados «Sin ficha de evaluación» / «Con registro recibido, no verificado» y contador 930 + 317 + 8 = 1.255; (3) ficha `er1` firmada en el teléfono, rechazo de fichas alteradas en el servidor y QR de acuse. **Haz `git pull` antes de trabajar y no toques `src/` hasta que lleguen; coordinen quién toca `src/` para evitar conflictos.**
- **En local** (Node 20 o 22, npm 10; comandos del `package.json`):
  ```bash
  npm ci
  npm run dev                       # http://localhost:5173 (sin service worker)
  npm run build && npm run preview  # http://localhost:4173 (con service worker, offline real)
  npm test                          # vite build + vitest
  npm run typecheck                 # tsc
  npm run e2e                       # build + Playwright Android 412x915 (Chrome en /usr/bin/google-chrome o CHROME=…)
  npm run e2e:desktop               # build + Playwright 1280x800
  BASE_URL=https://rediseno-mapa.yaku-relay-proto.pages.dev/ node scripts/e2e.mjs   # E2E remoto contra D1 real
  npm run build:worker              # dist/ → deploy/_worker.js
  ```
  CI: `.github/workflows/ci.yml` (`npm ci`, `npm test`, `npm run build` en Node 20 y 22).
- **Despliegue (Cloudflare Pages, cuenta de Brayan):** proyecto `yaku-relay-proto`. Producción https://yaku-relay-proto.pages.dev/ · preview https://rediseno-mapa.yaku-relay-proto.pages.dev/. Modo avanzado `_worker.js` (fuente `server/worker.ts`) con D1 `yaku-relay-proto-db` (binding `DB`) y KV `yaku-relay-basemap` (binding `BASEMAP`: el mapa base z11 va subido en trozos de 1 MiB con `scripts/upload-basemap.mjs` porque Pages no aceptaba el archivo).
- **Endpoints:** `POST /api/sync` (idempotente: recalcula el id desde el contenido e inserta con `INSERT OR IGNORE`), `GET /api/reports`, `GET /api/stats`.
- **Publicar** requiere que Brayan te dé acceso a la cuenta de Cloudflare; ese acceso no está en el repo y no se suben claves.

## Lenguaje obligatorio (recordatorio)
- Reportes ciudadanos: siempre **NO VERIFICADO**. Nunca «revisado» ni «sin riesgo».
- Vías: solo «interrumpida» o «sin evaluar»; nunca «transitable» ni «vía segura».
- CENEPRED = «Escenario de riesgo», «centros poblados del escenario CENEPRED»; nunca «expuestos» ni «afectados».
- «Sin cobertura garantizada según OSIPTEL», nunca «sin señal».
- NIVEL (SENAMHI) es nivel de aviso, no profundidad de agua. No afirmar que hay un aviso SENAMHI vigente para Piura.
