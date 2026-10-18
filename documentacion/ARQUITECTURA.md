# Arquitectura de Yaku

Yaku es una cadena de apoyo vecinal: un reporte nace en un celular **sin señal**, pasa de celular en celular por QR y llega a la municipalidad cuando cualquiera de esos celulares encuentra internet. Este documento explica qué piezas hay, quién es dueño de cada dato y dónde están los límites de confianza.

La autoridad sobre los incidentes, los estados y los avisos es **el servidor** (`servidor-local/`, un solo proceso Node con SQLite). El celular guarda su propia copia y la manda cuando puede, pero nunca decide nada oficial. Los secretos (contraseña municipal, clave de firma de avisos) viven solo en el contenedor y en su volumen `/datos`.

## Camino rápido

1. Mira el [contexto del sistema](#contexto-del-sistema) y la [tabla de componentes](#componentes).
2. Sigue la secuencia que te interese: [reportar sin señal](#1-reportar-sin-señal), [relevo por QR](#2-relevo-por-qr-entre-dos-celulares), [sincronización](#3-sincronización-con-internet), [respuesta municipal](#4-respuesta-municipal-y-aviso-firmado) o [«Estoy bien»](#5-estoy-bien).
3. Para saber quién guarda qué, ve a [quién es dueño de cada dato](#quién-es-dueño-de-cada-dato); para qué se cree y qué no, a [límites de confianza](#límites-de-confianza).

## Contexto del sistema

```mermaid
flowchart LR
    subgraph campo["Campo: celulares de los vecinos"]
        A["Celular A\nPWA /reportar\nIndexedDB"]
        B["Celular B\nPWA /reportar\nIndexedDB"]
        F["Familia\n/estamos-bien"]
    end

    subgraph muni["Oficina de la municipalidad"]
        M["Centro de monitoreo\n/municipalidad"]
    end

    subgraph cont["Contenedor yaku, puerto 8080"]
        S["servidor.mjs\nNode 24, node:sqlite"]
        D[("/datos\nyaku.db, fotos/,\navisos-clave.json")]
        W["dist/\nPWA compilada + .pmtiles"]
    end

    P["Traefik de Dokploy\nHTTPS yaku.lat"]

    A <-->|"QR animado, sin red"| B
    A -->|"HTTPS: sync, fotos, avisos"| P
    B -->|"HTTPS"| P
    F -->|"GET /api/estamos-bien"| P
    M -->|"sesión + consulta cada 3 s"| P
    P --> S
    S --> D
    S --> W
```

## Componentes

| Componente | Dónde está | Qué hace | ¿Tiene secretos? |
| --- | --- | --- | --- |
| App del vecino | `src/poblador/`, `src/codec.ts`, `src/db.ts`, `src/sync.ts`, `src/scanner.ts` | Reporta sin red, guarda en IndexedDB, muestra y lee QR, sincroniza cada 20 s con red, verifica avisos firmados | No. Guarda un código anónimo del equipo (`yaku-device`) y la **clave pública** de avisos |
| Centro de monitoreo | `src/vista3d/monitoreo/`, `src/vista3d/municipalidad/`, `src/auth/sesion.ts` | Mapa 3D, bandeja de incidentes, validar y asignar acciones. Consulta al servidor cada 3 s | No. Guarda el **token de sesión** en `localStorage` |
| Página de la familia | `src/estamos-bien/`, `estamos-bien.html` | Busca mensajes «Estoy bien» por nombre, sin abrir la app | No |
| Página pública | `src/landing/`, `index.html` | Presenta el proyecto | No |
| Servidor | `servidor-local/` (`servidor.ts`, `api.ts`, `almacen.ts`, `agrupacion.ts`, `reglas.ts`, `estados.ts`, `vista.ts`, `avisos.ts`, `cartas.ts`, `usuarios.ts`, `estaticos.ts`) | API, agrupación en incidentes, respaldo 0–100, estados, firma de avisos, sesiones y archivos estáticos | **Sí**: `MUNI_PIN`, `MUNI_CLAVE`, clave privada de avisos |
| Base y fotos | Volumen `yaku-datos` montado en `/datos` | `yaku.db` (SQLite en modo WAL), `fotos/`, `avisos-clave.json` | **Sí**: hashes de contraseña y de sesión, clave privada |
| PWA compilada | `dist/` dentro de la imagen | HTML, JS, CSS, mapa base y capas. El servicio worker la deja sin red | No |
| Proxy HTTPS | Traefik de Dokploy (fuera del repo) | Termina TLS y reenvía al puerto 8080 con `X-Forwarded-For` | Certificado de Let's Encrypt |
| Worker de Cloudflare | `server/worker.ts` | Alternativa mínima: solo `/api/sync`, `/api/stats`, `/api/reports`. Ver [API](API.md#diferencias-con-el-worker-de-cloudflare) | Bindings D1 y KV |

## Arranque del servidor

`iniciar()` en `servidor-local/servidor.ts` hace esto, en orden:

```mermaid
flowchart TD
    E["Lee variables de entorno"] --> C["Crea YAKU_DATOS si no existe"]
    C --> P{"¿MUNI_PIN definido?"}
    P -- "no" --> T["Genera un PIN temporal de 6 dígitos\ny lo imprime en consola"]
    P -- "sí" --> L{"¿Producción y menos de 8 caracteres?"}
    L -- "sí" --> W["Aviso en consola, arranca igual"]
    L -- "no" --> R
    T --> R["Lee YAKU_REGLAS (JSON parcial)\ny lo mezcla con reglas.ts"]
    W --> R
    R --> DB["Abre yaku.db, WAL, esquema y migraciones,\nasigna reportes sueltos a incidentes"]
    DB --> U["asegurarUsuario: crea o actualiza\nel usuario municipal con scrypt"]
    U --> K["cargarFirmante: lee o crea\navisos-clave.json"]
    K --> H["Escucha en PORT y HOST\n/salud, /api/*, archivos de dist/"]
```

- Una variable vacía cuenta como no definida: Dokploy pasa `MUNI_CLAVE` como cadena vacía y el servidor arranca igual, con la contraseña igual al PIN.
- Un usuario mal escrito no tumba el arranque: queda solo el PIN de respaldo.
- Si el cuerpo de una petición `/api/*` pasa de **640 KB**, responde 413 y corta la conexión (cabe una foto de 400 KB en base64 más el JSON).
- Con `SIGINT` o `SIGTERM` cierra el servidor y la base. Si no termina en 2 s, sale igual.
- La IP del cliente sale de `X-Forwarded-For` (último salto) **solo** si quien conecta es una red privada, como Traefik dentro de Docker. Si conecta directo desde internet, lo que mande el cliente se ignora.

## Secuencias

### 1. Reportar sin señal

```mermaid
sequenceDiagram
    autonumber
    actor V as Vecino
    participant App as App /reportar
    participant GPS as GPS del celular
    participant IDB as IndexedDB

    V->>App: Elige el tipo (9 botones) y la gravedad
    opt Tipo con riesgo de vida (atrapados, heridos)
        App->>V: Muestra primero 116 y 105
    end
    App->>GPS: getCurrentPosition (alta precisión, 10 s, caché de 60 s)
    GPS-->>App: Posición (o la última guardada)
    opt Con foto
        V->>App: Toma la foto
        App->>App: Comprime a JPEG de 150 KB o menos
    end
    App->>App: makeObservation: lat y lon a 5 decimales, id = hash del contenido
    App->>IDB: Guarda el reporte en yaku-relay-proto, synced = false
    opt Con foto
        App->>IDB: Guarda la foto en yaku-poblador, subida = false
    end
    App-->>V: Guardado en tu celular
```

Si el tipo del botón no existe en el codec, se guarda como `otro` con el nombre al inicio de la nota. Con foto, la nota termina en `(con foto)`: la foto no viaja por QR, pero quien recibe el reporte sabe que existe.

### 2. Relevo por QR entre dos celulares

Los dos celulares muestran su QR y leen el del otro **a la vez**. Todo ocurre sin internet.

```mermaid
sequenceDiagram
    autonumber
    participant A as Celular A
    participant B as Celular B

    par A muestra y B lee
        A->>B: Cuadros QR cada 650 ms (YR1, YE1, YA1, YB1)
        B->>B: scanLoop lee, Reassembler junta los fragmentos
        B->>B: CRC32 correcto, deserializa, recalcula cada id
        B->>B: putIfAbsent en IndexedDB (no duplica)
    and B muestra y A lee
        B->>A: Cuadros QR cada 650 ms
        A->>A: scanLoop lee, Reassembler junta los fragmentos
        A->>A: CRC32 correcto, deserializa, recalcula cada id
        A->>A: putIfAbsent en IndexedDB (no duplica)
    end
    Note over A,B: Cada celular termina con los reportes de ambos
```

Detalles del formato en [Relevo por QR](RELEVO_QR.md).

### 3. Sincronización con internet

`sincronizar()` corre al abrir la app, cada 20 s con la pestaña visible, al volver la red y después de guardar o recibir un reporte. El reporte nuevo sale primero (`enviarYa`), sin esperar a una foto que se esté subiendo.

```mermaid
sequenceDiagram
    autonumber
    participant App as Celular con red
    participant API as servidor-local/api.ts
    participant DB as SQLite

    App->>API: POST /api/sync {records, subidoPor}
    API->>API: validar(): recalcula cada id y rechaza el que no coincide
    API->>DB: INSERT OR IGNORE en reports (received_at = hora del servidor)
    Note over API,DB: Si subidoPor no es el autor (device_id), el reporte llegó por la cadena QR
    DB->>DB: asignarPendientes: elegirIncidente y asignaciones
    API-->>App: accepted, inserted, duplicates, rejected
    App->>App: markSynced de los ids aceptados
    loop Por cada foto pendiente de un reporte ya sincronizado
        App->>API: POST /api/fotos {report_id, mime, data}
        API->>API: Tipo real por bytes mágicos, tamaño de 400 KB o menos
        API-->>App: id, url, duplicate
    end
    App->>API: GET /api/estado?ids=...
    API-->>App: Estado de cada reporte, de su incidente
    App->>API: POST /api/cartas (las «Estoy bien» pendientes)
    App->>API: GET /api/avisos
    API-->>App: Avisos de los últimos 7 días y la clave pública
    App->>App: Guarda la clave y verifica cada firma
```

`subidoPor` es lo que permite al servidor contar, por incidente, cuántos reportes llegaron `por_cadena`.

### 4. Respuesta municipal y aviso firmado

```mermaid
sequenceDiagram
    autonumber
    actor O as Operador
    participant C as Centro de monitoreo
    participant API as servidor-local/api.ts
    participant DB as SQLite
    participant App as Celular con red
    participant Otro as Celular sin red

    O->>C: Entra con usuario y contraseña
    C->>API: POST /api/sesion
    API-->>C: Token (72 h por defecto), el servidor guarda solo su hash
    loop Cada 3 s
        C->>API: GET /api/reports?desde=... y GET /api/incidentes
        API-->>C: Reportes nuevos e incidentes con su respaldo
    end
    O->>C: Valida el incidente y asigna «Bomberos»
    C->>API: POST /api/incidentes/:id/estado
    API->>API: validarCambio contra el flujo de estados
    API->>DB: INSERT en estados (quién, cuándo, respaldo)
    API->>API: Firma el aviso con ECDSA P-256
    API->>DB: INSERT OR IGNORE en avisos
    API-->>C: Incidente actualizado y aviso
    App->>API: GET /api/avisos (en 20 s o menos)
    API-->>App: Aviso firmado y clave pública
    App->>App: Verifica la firma y muestra «Bomberos asignados»
    App-->>Otro: Pasa el aviso en un QR YA1 al intercambiar
    Otro->>Otro: Verifica la firma sin red, con la clave que guardó antes
```

El aviso dice «asignado», nunca «en camino»: Yaku sabe que la municipalidad asignó la acción, no que el equipo ya salió.

### 5. «Estoy bien»

```mermaid
sequenceDiagram
    autonumber
    actor R as Rosa
    participant A as Celular de Rosa
    participant B as Celular de otro vecino
    participant API as Servidor
    actor F as Familia en el exterior

    R->>A: Escribe nombre, mensaje y zona, y acepta
    A->>A: Carta con id = SHA-256 del contenido, guardada en IndexedDB
    A->>B: QR YB1 al intercambiar
    B->>B: Valida forma y recalcula el id, guarda la carta
    B->>API: POST /api/cartas cuando tenga internet
    API->>API: validarCarta recalcula el id
    API->>API: INSERT OR IGNORE en cartas
    F->>API: GET /api/estamos-bien?nombre=chunga
    API-->>F: Hasta 50 mensajes, nunca un listado completo
```

## Quién es dueño de cada dato

| Dato | Lo crea | Dónde vive | Quién manda si hay diferencias |
| --- | --- | --- | --- |
| Reporte (`Observation`) | El celular que lo escribe | IndexedDB del celular y tabla `reports` | Nadie lo cambia: el id es un hash del contenido |
| Foto | El celular que la tomó | IndexedDB del celular y `/datos/fotos/` | El servidor guarda lo que llegó, con su tipo real |
| Hora del celular (`ts`) | El celular | `reports.ts` | El servidor la corrige si viene más de 10 min en el futuro (ver [hora efectiva](AGRUPACION_Y_RESPALDO.md#hora-efectiva)) |
| Hora de llegada (`received_at`) | El servidor | `reports.received_at` | El servidor |
| Incidente y asignaciones | El servidor | Tablas `incidentes` y `asignaciones` | El servidor. El operador puede corregir con unir y separar |
| Respaldo 0–100 y nivel | El servidor | Se calcula en cada consulta | El servidor. El celular solo estima con lo que tiene |
| Estado y acción | El operador | Tabla `estados` | El servidor. El celular guarda el más reciente que le llegó |
| Aviso firmado | El servidor | Tabla `avisos` | El servidor, por su firma |
| «Estoy bien» | El vecino | IndexedDB y tabla `cartas` | Nadie: lo escribió quien firma y la municipalidad no lo verifica |
| Usuario y sesión | El servidor al arrancar | Tablas `usuarios` y `sesiones` | Las variables de entorno |

Las tablas completas están en [Datos](DATOS.md).

## Límites de confianza

```mermaid
flowchart LR
    subgraph sinconf["No confiable"]
        Q["Cualquier QR en la cadena"]
        I["Cualquier petición pública"]
    end
    subgraph valida["Se valida siempre"]
        R["Reporte: id recalculado"]
        Ca["Carta: id recalculado"]
        Av["Aviso: firma ECDSA"]
        Fo["Foto: bytes mágicos y tamaño"]
    end
    subgraph conf["Confiable"]
        Op["Operador con sesión o PIN"]
        Srv["Servidor y volumen /datos"]
    end
    Q --> R
    Q --> Ca
    Q --> Av
    I --> R
    I --> Fo
    R --> Srv
    Ca --> Srv
    Fo --> Srv
    Op --> Srv
```

- **Un reporte es solo un reporte vecinal por validar.** Nada en la cadena lo vuelve oficial; solo el operador lo valida.
- **Los avisos oficiales no se pueden fabricar en la cadena**: el celular los muestra como de la municipalidad solo si la firma coincide con la clave pública que guardó.
- **Las cartas «Estoy bien» no son oficiales.** Su id impide cambiar el texto, pero no prueba quién las escribió.
- **Las fotos y el histórico exacto** (ubicación y nota de cada vecino) pasan por la sesión. En modo estricto, el histórico también.

Más detalle en [Seguridad](SEGURIDAD.md).

## Documentos relacionados

- [Relevo por QR](RELEVO_QR.md): formato de los códigos y reensamblado.
- [Agrupación y respaldo](AGRUPACION_Y_RESPALDO.md): cómo se arman los incidentes y se calcula el puntaje.
- [API](API.md): endpoints, ejemplos y límites.
- [Datos](DATOS.md): SQLite, IndexedDB y mapa sin red.
- [Seguridad](SEGURIDAD.md): actores, firmas y modo estricto.
