# API

La API de Yaku vive en el mismo origen que la PWA: `https://yaku.lat/api/…`. La implementa `servidor-local/api.ts` como una función `Request → Response` que `servidor.ts` conecta a `node:http`. Este documento lista cada endpoint con sus códigos, límites y ejemplos de petición y respuesta.

Los ejemplos de abajo salen de ejecutar el servidor real con datos de prueba (los ids, tokens y firmas son de esa corrida, sin valor fuera de ella).

## Camino rápido

```bash
# 1. Salud y conteos (público)
curl -s http://localhost:8080/salud
curl -s http://localhost:8080/api/stats

# 2. Entrar y leer los incidentes
TOKEN=$(curl -s -X POST http://localhost:8080/api/sesion \
  -d '{"usuario":"central","clave":"<tu MUNI_CLAVE o MUNI_PIN>"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s http://localhost:8080/api/incidentes -H "authorization: Bearer $TOKEN"
```

## Convenciones

- Los cuerpos son JSON. Los celulares mandan `content-type: text/plain` con el JSON adentro para evitar el preflight de CORS; el servidor lee el cuerpo como texto y lo parsea, así que da igual.
- Todas las respuestas llevan `cache-control: no-store` y `x-content-type-options: nosniff`. Las fotos son la excepción: `private, max-age=31536000, immutable`.
- Los errores son `{"error": "texto en español"}` y, cuando ayuda a la app, un `codigo`.
- Los ids son estables: un reporte tiene 11 caracteres base36, una foto 20 hexadecimales, una carta o un aviso 12 hexadecimales, un incidente `inc-…`.
- Sin `YAKU_MODO_ESTRICTO`, CORS está abierto (`access-control-allow-origin: *`). Con el modo estricto se quita. Ver [Seguridad](SEGURIDAD.md#mvp-frente-a-estricto).

### Niveles de acceso

| Nivel | Cómo se pide | Para qué |
| --- | --- | --- |
| Público | Nada | Lo que usan los celulares y la página de la familia |
| Sesión | `Authorization: Bearer <token>` (token de `POST /api/sesion`) | Centro de monitoreo |
| PIN | `X-Muni-Pin: <MUNI_PIN>` | Respaldo para la misma lista protegida, sin usuarios |

Si llega un `Bearer`, **solo** se mira el token: nunca se cae al PIN.

### Códigos comunes

| Código | Cuándo | `codigo` |
| --- | --- | --- |
| 400 | JSON inválido o campo que no cumple las reglas | — |
| 401 | No hay credencial, o el token venció o se cerró | `sin_credencial` o `sesion` |
| 403 | PIN incorrecto, o usuario o contraseña incorrectos | `pin` o `credencial` |
| 404 | Ruta, incidente o foto inexistente | — |
| 413 | Cuerpo o foto demasiado grande | — |
| 429 | Demasiados intentos o demasiadas peticiones. Trae `retry-after` en segundos | `limite` |
| 500 | Error interno. El detalle va a la consola, no a la respuesta | — |

## Endpoints

| Método y ruta | Acceso | Para qué | Worker |
| --- | --- | --- | :---: |
| `GET /salud` | Público | Responde `ok`. Lo usa el `HEALTHCHECK` de la imagen | — |
| `POST /api/sync` | Público | Sube reportes, idempotente por id | Sí |
| `GET /api/stats` | Público | Conteos | Sí (menos campos) |
| `GET /api/reports` | Público; sesión para listado e histórico en modo estricto | Reportes por id, últimos o desde una fecha | Parcial (sin `desde`) |
| `POST /api/fotos` | Público | Sube la foto de un reporte | No |
| `GET /api/fotos/:id` | Sesión o PIN | Ver una foto | No |
| `GET /api/estado?ids=` | Público | Estado que puso la municipalidad a esos reportes | No |
| `GET /api/avisos`, `GET /api/avisos/clave` | Público | Avisos firmados y clave pública | No |
| `POST /api/cartas` | Público | Sube mensajes «Estoy bien» | No |
| `GET /api/cartas?q=`, `GET /api/estamos-bien?nombre=` | Público | Busca mensajes por nombre (3 letras o más) | No |
| `POST /api/sesion` | Público | Entrar con usuario y contraseña | No |
| `GET /api/sesion`, `DELETE /api/sesion` | Token | Quién soy y salir | No |
| `GET /api/incidentes` | Sesión o PIN | Incidentes agrupados con su respaldo | No |
| `POST /api/incidentes/:id/estado` | Sesión o PIN | Cambiar el estado, con acción | No |
| `POST /api/incidentes/:id/unir` | Sesión o PIN | Unir dos incidentes | No |
| `POST /api/incidentes/:id/separar` | Sesión o PIN | Sacar reportes a un incidente nuevo | No |
| `GET /api/memoria/notas?zona=&tipo=`, `POST /api/memoria/notas`, `DELETE /api/memoria/notas/:id` | Sesión de usuario (no PIN) | Notas de zona en Atomic Memory, opcionales | No |

## Reportes

### `POST /api/sync`

Cuerpo de hasta **128 KB** y hasta **200 registros** (el resto se ignora). Cada registro es una `Observation`; el servidor **recalcula el id** con el mismo código del celular y rechaza el que no coincide.

```json
{
  "records": [
    { "id": "1qo3dv8496w", "type": "vivienda", "severity": 2, "lat": -5.1945, "lon": -80.6328,
      "note": "Casa caída (con foto)", "ts": 1792329137, "deviceId": "k3x9a1b2", "verified": false }
  ],
  "subidoPor": "k3x9a1b2"
}
```

`subidoPor` es opcional: el código del celular que sube. Si no es el `deviceId` del autor, el reporte llegó por la cadena QR.

```json
{
  "accepted": ["1qo3dv8496w", "1xw46aex7px"],
  "inserted": 2,
  "duplicates": 0,
  "rejected": [{ "id": "xxxxxxxxxxx", "why": "id no coincide con contenido" }],
  "persisted": true
}
```

`accepted` incluye los ids válidos aunque ya existieran: el celular los marca como sincronizados. Los motivos de rechazo son `tipo`, `severidad`, `coordenadas`, `nota` (más de 140 caracteres), `ts/deviceId` e `id no coincide con contenido`.

### `GET /api/stats`

```json
{
  "total": 2, "unique_ids": 2, "last": 1792329257164,
  "byType": [{ "type": "vivienda", "n": 2 }],
  "verified": false, "incidentes": 1, "cartas": 0, "servidor": "local"
}
```

`last` es el `received_at` más reciente, en milisegundos.

### `GET /api/reports`

| Parámetros | Resultado | Acceso |
| --- | --- | --- |
| `ids=a,b,c` | Hasta 200 ids válidos | Público siempre (lo usa el acuse del celular) |
| `limit=50` | Los últimos por llegada. Por defecto 50, máximo 200 | Sesión en modo estricto |
| `desde=<ms>&limit=1000` | Histórico desde esa hora de llegada, del más antiguo al más nuevo. Por defecto 1000, máximo 5000 | Sesión en modo estricto |

```json
{
  "count": 1,
  "reports": [{ "id": "1qo3dv8496w", "type": "vivienda", "severity": 2, "lat": -5.1945, "lon": -80.6328,
    "note": "Casa caída (con foto)", "ts": 1792329137, "device_id": "k3x9a1b2", "verified": 0,
    "received_at": 1792329257164, "subido_por": "k3x9a1b2" }],
  "desde": 0, "hasta": 1792329257164, "truncado": true,
  "note": "Reportes vecinales por validar"
}
```

`truncado: true` significa que hay más: pide otra vez con `desde` igual a `hasta`. Un `desde` que no sea un número mayor o igual a 0 responde 400.

## Fotos

### `POST /api/fotos`

Acepta JSON con la foto en base64 o el binario directo con `content-type: image/*` y `?reporte=<id>`. Máximo **400 KB** de imagen. El servidor **no confía en el tipo que diga el cliente**: lo deduce de los primeros bytes (JPEG, PNG o WebP). El id de la foto es el SHA-256 de sus bytes (20 hexadecimales), así que subir la misma foto dos veces no la duplica.

```json
{ "id": "1qo3dv8496w", "report_id": "1qo3dv8496w", "mime": "image/jpeg", "data": "<base64>" }
```

```json
{ "id": "d67227c5a3a2eee322bd", "url": "/api/fotos/d67227c5a3a2eee322bd", "bytes": 204, "duplicate": false, "reporte_en_servidor": true }
```

| Código | Motivo |
| --- | --- |
| 400 | `reportId inválido (11 caracteres base36)` o base64 inválido |
| 413 | `foto > 400 KB` |
| 415 | `solo JPEG, PNG o WebP` |
| 409 | Ese reporte ya tiene el máximo de fotos (solo en modo estricto: 3) |
| 507 | Cuota total de fotos alcanzada (solo en modo estricto: 2 GB) |

La foto puede llegar antes que su reporte: `reporte_en_servidor` lo dice. El celular solo sube la foto de un reporte ya sincronizado.

### `GET /api/fotos/:id`

Pide sesión o PIN. 404 si no existe, 410 si el archivo falta en el volumen. Sin credencial:

```json
{ "error": "falta iniciar sesión (o el PIN municipal)", "codigo": "sin_credencial" }
```

## Estado de vuelta

### `GET /api/estado?ids=a,b`

Hasta 200 ids. Para cada reporte, el estado de **su incidente**. Los nombres de estado son los del servidor (`accion_asignada`); el celular los traduce.

```json
{
  "estados": [
    { "id": "1qo3dv8496w", "recibido": true, "recibido_at": 1792329257164, "incidente": "inc-1qo3dv8496w",
      "estado": "accion_asignada", "accion": "bomberos", "motivo": "", "cuando": 1792329257399, "personas": 2 },
    { "id": "aaaaaaaaaaa", "recibido": false }
  ],
  "generado": 1792329257407
}
```

`recibido: false` quiere decir que el servidor aún no tiene ese reporte. Para un reporte nuevo que nadie ha tocado, `estado` es `nuevo` y `cuando` es `null`.

## Avisos de la municipalidad

### `GET /api/avisos`

Los avisos de los últimos 7 días, hasta 50, y la clave pública para verificarlos. Con `?desde=<ms>` se pide desde otra hora.

```json
{
  "count": 1,
  "avisos": [{
    "id": "b8670e6646ec", "incidente": "inc-1qo3dv8496w", "accion": "bomberos", "tipo": "vivienda",
    "lat": -5.1945, "lon": -80.6328, "min": 29872154,
    "texto": "Unidad 12 en ruta de evaluación",
    "firma": "RvDoGJzqtfpQhaMt-7G2M8uXb7L0DNIVdGIk6WgWPRmCnG3QcfNfJOgWgJqfZC_GkCnJAhm-KBr_f4qihVUH9g"
  }],
  "clave": { "kty": "EC", "crv": "P-256", "x": "Ic_keFHjo3EH1-MSCfZ8D2MNnnLcQmK_ML4opbIzAEE", "y": "5-SJDTmp-Ma0A8YHHtKLnG60XqIP26fK9j7ZAIwBEuU" }
}
```

`min` son los minutos desde 1970 del momento del aviso. `GET /api/avisos/clave` devuelve solo la clave. Cómo se firma y se verifica: [Seguridad](SEGURIDAD.md#avisos-firmados).

## «Estoy bien»

### `POST /api/cartas`

Hasta 100 cartas por petición. El servidor valida la forma y **recalcula el id** (los primeros 12 hexadecimales del SHA-256 de `YB1|nombre|para|mensaje|zona|ts|deviceId`).

```json
{
  "cartas": [{ "id": "2a714401b8b9", "nombre": "Rosa Chunga", "para": "mi mamá",
    "mensaje": "Hola, soy Rosa. Si leen esto: estoy bien.", "zona": "Castilla", "ts": 1792329257, "deviceId": "k3x9a1b2" }],
  "subidoPor": "k3x9a1b2"
}
```

```json
{ "accepted": ["2a714401b8b9"], "inserted": 1, "duplicates": 0, "rejected": [] }
```

Límites de texto: nombre 40, para 40, mensaje 200, zona 40. El nombre necesita 2 caracteres como mínimo. No se aceptan saltos de línea ni `|`.

### `GET /api/estamos-bien?nombre=chunga`

Busca por nombre de quien escribe o de para quién es, sin tildes ni mayúsculas, con **3 letras como mínimo**. Devuelve hasta 50, las más recientes primero, y **nunca un listado completo**.

```json
{
  "count": 1,
  "cartas": [{ "id": "2a714401b8b9", "nombre": "Rosa Chunga", "para": "mi mamá",
    "mensaje": "Hola, soy Rosa. Si leen esto: estoy bien.", "zona": "Castilla", "ts": 1792329257 }],
  "nota": "Lo escribió quien firma; la municipalidad no lo verifica"
}
```

Con menos de 3 letras: `400 {"error":"escribe al menos 3 letras del nombre"}`. `GET /api/cartas?q=` es la misma búsqueda para la app y además devuelve el `deviceId` de cada carta, que la app necesita para verificar el id.

## Sesión

### `POST /api/sesion`

```json
{ "usuario": "central", "clave": "<contraseña>" }
```

```json
{ "token": "1M-9fTyz…", "usuario": "central", "nombre": "Municipio central", "expira": 1792588457284 }
```

El token dura `YAKU_SESION_HORAS` (72 por defecto) y el servidor guarda solo su hash. Credenciales incorrectas: `403 {"error":"usuario o contraseña incorrectos","codigo":"credencial"}`.

`GET /api/sesion` devuelve `{usuario, nombre, expira}` y `DELETE /api/sesion` cierra la sesión (`{"ok": true}`). Sin token válido: `401 {"error":"sin sesión","codigo":"sesion"}`.

## Incidentes

### `GET /api/incidentes`

Los incidentes ordenados por prioridad. Cada uno trae el respaldo, el historial de estados y los ajustes.

```json
{
  "count": 1,
  "incidentes": [{
    "id": "inc-1qo3dv8496w", "familia": "vivienda", "tipo": "vivienda", "tipos": ["vivienda"], "severidad": 3,
    "lat": -5.1945, "lon": -80.6328, "ancla": { "lat": -5.1945, "lon": -80.6328 },
    "personas": 2, "reportes": 2, "n_reportes": 2, "reportes_ids": ["1qo3dv8496w", "1xw46aex7px"],
    "notas": ["Casa caída (con foto)", "Techo caído, 2 adultos"], "por_cadena": 1,
    "fotos": [], "n_fotos": 0, "personas_con_foto": 0, "fotos_pendientes": 1,
    "primer_reporte": 1792329137000, "ultimo_reporte": 1792329197000, "recibido": 1792329257164,
    "puntaje": 60, "respaldo": 60, "nivel": "N2",
    "desglose": { "personas": 40, "fotos": 0, "cercania": 20, "recencia": 0.999 },
    "respaldo_congelado": false, "mediana_m": 7,
    "estado": "nuevo", "accion": null, "motivo": "", "historial": [], "ajustes": [],
    "recurrencia_de": null, "nuevos_tras_descarte": 0, "riesgo_vida": false
  }],
  "reglas": "la decisión de producto «confianza» (17-oct-2026)",
  "nota": "Reporte vecinal · por validar: lo valida la municipalidad"
}
```

`por_cadena` cuenta los reportes que subió un celular distinto del autor. Cómo se calculan `puntaje`, `nivel` y `desglose`: [Agrupación y respaldo](AGRUPACION_Y_RESPALDO.md).

### `POST /api/incidentes/:id/estado`

```json
{ "estado": "accion_asignada", "accion": "bomberos", "mensaje": "Unidad 12 en ruta de evaluación", "quien": "Municipio central" }
```

`motivo` (hasta 200 caracteres) es obligatorio al descartar; `mensaje` es el texto opcional del aviso (hasta 120). Respuesta:

```json
{ "ok": true, "incidente": { "…": "el incidente ya actualizado" }, "aviso": { "id": "b8670e6646ec", "accion": "bomberos", "min": 29872154, "firma": "…" } }
```

`aviso` es `null` salvo al asignar una acción o al dar el incidente por atendido. Un cambio no permitido responde `409` con el estado actual:

```json
{ "error": "no se puede pasar de nuevo a validado", "estado": "nuevo" }
```

La tabla completa de errores está en [Agrupación y respaldo](AGRUPACION_Y_RESPALDO.md#errores-de-post-apiincidentesidestado).

### `POST /api/incidentes/:id/unir`

```json
{ "con": "inc-1xw46aex7px", "quien": "Municipio central" }
```

Mueve los reportes de `con` al incidente `:id`. Responde `{"ok": true, "incidente": {…}}`, o 404 `incidentes no encontrados` si alguno no existe o son el mismo.

### `POST /api/incidentes/:id/separar`

```json
{ "reportes": ["1xw46aex7px"], "quien": "Municipio central" }
```

Hasta 200 ids de reporte. Responde `{"ok": true, "nuevo": "inc-1xw46aex7px-s"}`. Si no hay reportes válidos o el incidente no existe: `400 faltan reportes o el incidente no existe`. El id del incidente en la ruta debe tener la forma `inc-…`, si no, 400.

## Notas de zona

Opcionales: ver [Configuración](CONFIGURACION.md#notas-de-zona-atomic-memory). Piden `Authorization: Bearer` de un usuario; sin credencial 401, con `X-Muni-Pin` 403 `memoria_sin_usuario`. Si el servidor no tiene Atomic Memory configurado, las tres rutas responden `{"activa": false}` (200) y no hacen nada. Si Atomic Memory falla, no responde a tiempo o devuelve algo inesperado: 502 `{"activa": true, "error": "Atomic Memory no respondió…: la nota NO se guardó.", "codigo": "memoria"}`. Las notas nunca cambian el incidente.

### `GET /api/memoria/notas?zona=Castilla%20(Castilla)&tipo=agua`

Responde `{"activa": true, "zona": "…", "notas": [{"id", "texto", "zona", "incidente", "creada"}]}`, hasta 5, solo del usuario de la sesión y de esa zona exacta. `zona` es obligatoria (2 a 80 caracteres).

### `POST /api/memoria/notas`

```json
{ "zona": "Castilla (Castilla)", "texto": "Puente Cáceres cerrado; entrar por Av. Guardia Civil.", "incidente": "inc-1xw46aex7px", "reemplaza": "id-de-la-nota-anterior" }
```

`texto` de 3 a 280 caracteres; `incidente` y `reemplaza` son opcionales. Responde 201 `{"activa": true, "guardada": true, "nota": {…}, "anterior": null}`. Con `reemplaza` (corregir) se guarda la nueva y después se borra la anterior; `anterior` dice cómo terminó: `borrada`, `no_existe` o `no_borrada` (quedan las dos y hay que borrar la vieja a mano). Cualquier `user_id` en el cuerpo se ignora.

### `DELETE /api/memoria/notas/:id`

Responde `{"activa": true, "borrada": true, "resultado": "borrada"}` solo si Atomic Memory confirmó con `success: true`. Si la nota no existe o es de otro usuario: `{"borrada": false, "resultado": "no_existe"}`.

## Límites y modo estricto

| Límite | Valor | Dónde |
| --- | ---: | --- |
| Cuerpo de `POST /api/sync` y `POST /api/cartas` | 128 KB | Siempre |
| Registros por `POST /api/sync` | 200 | Siempre |
| Cartas por `POST /api/cartas` | 100 | Siempre |
| Foto | 400 KB | Siempre |
| Cuerpo máximo leído por el servidor | 640 KB | Siempre |
| Filas del histórico | 5 000 | Siempre |
| Intentos de contraseña o PIN | 10 en 10 min, luego 5 min de espera por IP | Solo estricto |
| `POST` públicos (`/api/sync`, `/api/fotos`, `/api/cartas`) | 120 por minuto por IP | Solo estricto |
| Fotos por reporte | 3 | Solo estricto |
| Total de fotos | 2 GB | Solo estricto |

Los límites del modo estricto están en memoria y se reinician con el proceso.

## Diferencias con el Worker de Cloudflare

`server/worker.ts` implementa **solo** `POST /api/sync`, `GET /api/stats` y `GET /api/reports`, sobre D1 (binding `DB`), con el mismo `validate` de ids.

| Tema | Servidor Docker | Worker |
| --- | --- | --- |
| Endpoints | Todos los de la tabla | Solo sync, stats y reports |
| `GET /api/reports?desde=` | Sí | No |
| `subidoPor` y `por_cadena` | Sí | No |
| Incidentes, estados, fotos, avisos, «Estoy bien» | Sí | No |
| Sesión, PIN y límites | Sí | No hay credenciales: `/api/reports` es público |
| CORS | Abierto, o cerrado en modo estricto | Siempre abierto |
| Sin base | — | `503 D1 no enlazado (binding DB)` |

La app del vecino lo tolera: si un endpoint no existe, reintenta en la próxima sincronización y no pierde nada. Ver [Despliegue](DESPLIEGUE.md#alternativa-cloudflare-pages).

## Documentos relacionados

- [Arquitectura](ARQUITECTURA.md): quién llama a quién.
- [Datos](DATOS.md): qué guarda cada endpoint en SQLite.
- [Seguridad](SEGURIDAD.md): sesión, PIN y modo estricto.
