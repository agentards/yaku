# PRD técnico: Yaku Relay, relevo de Evaluación Rápida (EDAN) y mapa del silencio

Leyenda de estados: **[VERIFICADO]** tiene fuente en disco o URL; **[NO VERIFICADO]** es una hipótesis o falta probarlo; **[DECISIÓN]** es una elección de diseño, no un hecho.

---

## 1. Problema, usuario y tarea urgente

### Usuario real
El usuario es el **evaluador EDAN del gobierno local**, es decir, de la municipalidad distrital o provincial. Trabaja en distritos andinos de Piura: Ayabaca, Huarmaca, Lancones, Huancabamba, etc.

### Tarea urgente
Llenar el **Formulario de Evaluación Rápida (Anexo 01)** de cada centro poblado afectado y hacerlo llegar a la oficina de Defensa Civil y al COE, que lo registran en SINPAD.

- **[VERIFICADO]** La norma pide hacerlo «en un rango de 2 a 4 horas de ocurrida la emergencia» (lineamientos EDAN de la RM 324-2023-PCM, numeral de la Etapa 1; está en `research/4986001-lineamientos-edan.txt`, línea ~321).
- **[VERIFICADO]** El formulario «tiene carácter de Declaración Jurada» (`research/4986001-anexo-01-formulario-evaluacion-rapida.txt`).

### Por qué falla hoy
1. **[VERIFICADO]** OSIPTEL declara que 445 de los 928 centros poblados del escenario CENEPRED del Aviso 421 en Piura (48 %) no tienen cobertura garantizada. Es cobertura declarada por las operadoras, no medida en campo. Ver `data/conectividad/`.
2. **[VERIFICADO]** Entre 2023 y 2026 hubo cortes de vía en Huancabamba y Ayabaca, y en abril de 2023 una antena cayó en Pinchijaga (ver `evidencia-casos-uso.md`).
3. **[VERIFICADO]** INDECI ya tiene la app **EDAN Digital**, que captura offline y sincroniza con SINPAD «una vez restablecida la señal» (gob.pe, 17-sep-2026).
4. **[NO VERIFICADO]** No sabemos si EDAN Digital pasa registros de un teléfono a otro. Si no lo hace, el registro se queda en el teléfono del evaluador hasta que **él mismo** encuentre señal.

### Respuesta a «¿por qué QR si los vecinos pueden hablar?»
Hablar sirve para transmitir urgencia. Pero quien recibe el dato no es el vecino, es el COE, y necesita **evidencia estructurada**: un formulario con número de afectados, coordenadas, autor y hora, que tiene valor de declaración jurada, se puede deduplicar y se puede auditar.

Yaku Relay deja que **cualquier persona que salga de la zona**, como un mototaxista, un brigadista o un profesor, lleve los formularios firmados en su teléfono hasta donde haya señal. Él no puede leerlos ni modificarlos sin que se note.

### Posicionamiento [DECISIÓN]
Yaku Relay es un **complemento** de EDAN Digital: es la capa de relevo entre teléfonos. **No** reemplaza a EDAN Digital ni a SINPAD, y **no** está integrado con ninguno de los dos. EDAN Digital se nombra en los primeros 30 segundos del pitch.

---

## 2. Alcance del MVP

### Dentro
- **F1, formulario de Evaluación Rápida reducido:** un subconjunto fiel del Anexo 01 (sección 4.1). Funciona offline, toma el GPS y permite elegir el centro poblado desde la capa CENEPRED.
- **F2, firma por dispositivo:** cada registro se firma con una clave generada en el teléfono (sección 5). El servidor verifica la firma y el id.
- **F3, relevo QR:** reutiliza el códec actual (formato posicional, deflate, Base45, CRC32 y QR animado) y le agrega la firma.
- **F4, acuse de recibo por QR (mejora creativa, parte 1):** el teléfono que recibe muestra un QR corto con los ids que recibió. El evaluador lo escanea y ve «3 formularios en camino con el portador X». Así sabe qué datos ya salieron de la zona.
- **F5, mapa del silencio (mejora creativa, parte 2):** sobre los centros poblados del escenario CENEPRED (`data/piura_ccpp_estado_base.json`), el mapa colorea cada uno según su estado:
  - «sin ficha de evaluación»: no hay ningún registro (en el código el valor sigue siendo `sin_evaluar`). **Nunca** debe dar a entender que ahí no pasa nada; «mapa del silencio» es solo un nombre interno y no aparece en pantalla ni en el pitch;
  - «en relevo»: hay un registro en algún teléfono, pero aún no llega al servidor;
  - «con registro recibido, no verificado»: el registro ya está en el servidor.

  Los 317 con ubicación aproximada de OSIPTEL dentro de su distrito se dibujan con borde punteado y el rótulo «ubicación aproximada (OSIPTEL)», y los 3 sin ubicar van en una lista aparte llamada «Sin ubicar». [DECISIÓN] Los 5 puntos de OSIPTEL que caen fuera de su distrito (`punto_dentro_de_su_distrito = false`, según Data Bot) no se dibujan en el mapa: van a esa misma lista con la nota «ubicación OSIPTEL fuera de su distrito». El COE ve **dónde falta información**, no solo lo que llegó.
- **F6, filtro de cobertura OSIPTEL:** un interruptor que muestra solo los centros poblados «sin cobertura garantizada según OSIPTEL». Es la prioridad más baja.
- **F7, vista COE:** la ruta `/coe` muestra el mapa del silencio con datos del servidor, contadores y la lista de formularios recibidos con autor, hora, cadena de custodia (quién lo cargó y quién lo subió) y la firma verificada.

### Fuera (para que no lo construya nadie)
- Integración real con SINPAD o EDAN Digital.
- Empadronamiento familiar (Anexo 03): tiene datos personales y DNI, por eso se descartó por privacidad.
- Login de usuarios y cuentas institucionales.
- Bluetooth, WebRTC, malla P2P, IA, 3D, WebGPU y WebXR.
- Cualquier rótulo de vía «segura» o «transitable». En el MVP, una vía solo puede quedar como **«interrumpida»** o **«sin evaluar»**.

---

## 3. Reglas de contenido (no negociables)

1. Ningún registro se muestra como alerta oficial. Su estado máximo es «con registro recibido, no verificado».
2. El rótulo de la capa CENEPRED es «centros poblados del escenario CENEPRED». Nunca «expuestos» ni «afectados». Cada punto muestra su `nivel_texto`.
3. La cobertura siempre se describe como «sin cobertura garantizada según OSIPTEL», nunca como «sin señal».
4. El aviso SENAMHI vencido solo puede aparecer con la etiqueta «VENCIDO, se muestra como ejemplo». Si confunde, se quita del modo demo.
5. Ninguna clave o token va en el repo. Los secretos de Cloudflare viven en el dashboard o en `wrangler secret`.
6. El README dice: «1.255 centros poblados del escenario: 930 con ubicación IGN, 317 con ubicación aproximada de OSIPTEL dentro de su distrito, y 8 en la lista «Sin ubicar» (3 sin coordenadas y 5 con punto OSIPTEL fuera de su distrito)». La base es `data/piura_ccpp_estado_base.json` (Data Bot); se lee el campo `ubicacion` (`con_ubicacion`, `con_ubicacion_osiptel`, `sin_ubicar`), y los aproximados se dibujan con otro estilo.

---

## 4. Modelo de datos

### 4.1 Registro `er1` (Evaluación Rápida v1), basado en el Anexo 01

Cada campo lleva entre corchetes su código en el Anexo 01.

| Campo | Tipo | Anexo 01 | Notas |
|---|---|---|---|
| `v` | `"er1"` | n/a | Versión del esquema |
| `ccpp` | string(10) | I-3, centro poblado | `codigo_ccpp` CENEPRED/INEI. Vacío si «otro» |
| `ccpp_nombre` | string ≤40 | I-3 | |
| `ubigeo` | string(6) | I-2 | |
| `peligro` | enum: `inundacion`, `huaico`, `deslizamiento`, `lluvia_intensa`, `otro` | I-1, tipo de peligro | |
| `t_evento` | epoch (minutos) | I-1, fecha y hora estimada | |
| `lat`, `lon` | entero ×1e5 | I-7 | Más `acc_m`, la precisión del GPS |
| `afectadas`, `damnificadas` | entero ≥0 | II-1, II-2 | |
| `lesionados`, `atrapados`, `aislados`, `desaparecidos`, `fallecidos` | entero ≥0 o `null` (= no evaluado) | II-3 a II-7 | `null` ≠ 0 |
| `viviendas` | entero o `null` | II-8 | |
| `via` | enum: `interrumpida`, `sin_evaluar` | II-9 | **No existe** el valor «transitable» |
| `servicios` | bitmask: agua, desagüe, energía, telefonía, internet | II-13 a II-17 | 1 = interrumpido |
| `necesidades` | bitmask: rescate, evacuación, agua, alimentos, abrigo, maquinaria | III-1 y III-2, simplificado | |
| `nota` | string ≤140 | Observaciones | |
| `autor` | string ≤40 | Evaluador | Es un rol o alias, **no el DNI** |
| `t_reg` | epoch (minutos) | n/a | Momento del registro |
| `pk` | 32 bytes (b64url) | n/a | Clave pública del dispositivo |
| `sig` | 64 bytes | n/a | Firma sobre la serialización canónica |
| `id` | 16 bytes hex | n/a | `SHA-256(canónico sin sig)[0:16]`, ya existe en el prototipo |

**Presupuesto de tamaño:** cada registro debería medir menos de 200 B comprimido, incluidos la firma y la clave pública. Con 20 registros el QR animado debería caber en 2 a 4 fragmentos. **[NO VERIFICADO]** Hay que medirlo con `npm run measure:qr` después del cambio y anotar el resultado real en el README.

**Optimización [DECISIÓN]:** la clave pública `pk` se manda una sola vez por paquete, no una vez por registro.

### 4.2 Paquete de relevo `rp1`
```
{ v:"rp1", carrier_hint?: string≤20, pk_table:[pk...], recs:[er1 con pk_idx], hops:[{dev:hash8, t}] }
```
- `hops` es la cadena de custodia: cada teléfono que reenvía el paquete agrega un salto `{dev, t}`.
- Los saltos no van firmados en el MVP **[DECISIÓN, es un trade-off que se documenta]**. La firma protege el **contenido** del registro, no la ruta que siguió.

### 4.3 Acuse `ack1`
```
{ v:"ack1", ids:[id8...], dev:hash8, t }
```
- Cada id se recorta a 8 bytes, así que caben unos 40 ids en un solo QR estático.
- Cuando el evaluador escanea el acuse, sus registros locales pasan a «en relevo (portador dev-xxxx)».

### 4.4 D1 (migración nueva, sin romper la tabla `reports`)
```sql
CREATE TABLE er_records (
  id TEXT PRIMARY KEY, ccpp TEXT, ubigeo TEXT, payload TEXT NOT NULL,
  pk TEXT NOT NULL, sig_ok INTEGER NOT NULL, verified INTEGER NOT NULL DEFAULT 0,
  t_reg INTEGER, received_at INTEGER NOT NULL, uploader_dev TEXT, hops TEXT
);
CREATE INDEX er_ccpp ON er_records(ccpp);
```
- **Endpoints:**
  - `POST /api/er/sync`, que responde `{inserted, duplicates, rejected:[{id,reason}]}`;
  - `GET /api/er/status`, que devuelve `ccpp → {count, last_t}` para el mapa del silencio;
  - `GET /api/er/records?ccpp=`.
- **Validación en el Worker:**
  - recalcular el id;
  - verificar la firma;
  - comprobar los rangos (enteros ≥0, coordenadas dentro del bbox de Piura `-81.4,-6.4,-79.1,-3.9`);
  - aceptar en `via` solo los valores del enum.

  Si la firma no es válida, el registro se rechaza con la razón `bad_sig`.
- **Límite básico [DECISIÓN]:** máximo 200 registros por request y 64 KB de cuerpo. No hay rate-limit real; esto se declara en el README.

---

## 5. Firma: el detalle técnico que suma complejidad sin cambiar el flujo
- **Clave:** se genera la primera vez que se abre la app y se guarda en IndexedDB como `CryptoKey` no exportable.
- **Algoritmo preferido:** Ed25519 vía WebCrypto. **[NO VERIFICADO en teléfonos reales]** Hay que comprobar el soporte en Chrome Android y Safari iOS.
- **Respaldo:** ECDSA P-256 (firma de 64 bytes en formato raw). Así hay que **probarlo**, no suponerlo: el test de compatibilidad en el arranque decide qué algoritmo se usa, y el registro lleva `alg`.
- **Serialización canónica:** el array posicional del códec actual, sin `sig`. Hay un test que garantiza que codificar y decodificar no cambia los bytes firmados.
- **Lo que demuestra:**
  - el portador no puede cambiar «12 damnificadas» por «2» sin que el servidor lo detecte;
  - el COE ve «firma válida, dispositivo 7f3a…».
- **Lo que NO demuestra:** que el evaluador sea quien dice ser. Eso exigiría registrar las claves en la municipalidad. Se declara en la tabla de trade-offs del README.

---

## 6. Arquitectura (sobre lo que ya existe en `proto-offline-qr/`)
```
PWA (Vite + TS, MapLibre 6, PMTiles Piura z11, Workbox)
 ├─ IndexedDB: er_records(local), acks, keys, outbox
 ├─ codec: er1 / rp1 / ack1 → deflateRaw → Base45 → QR (animado si hace falta)
 ├─ crypto: Ed25519 | ECDSA P-256 (WebCrypto)
 └─ capas: cenepred_421 (930 pts + 23 distritos), osiptel_cobertura (propiedad por ccpp), límites
Cloudflare Pages (_worker.js) + D1
 ├─ /api/er/sync (verifica id + firma, INSERT OR IGNORE)
 ├─ /api/er/status (agregado por ccpp)
 └─ /coe (misma PWA, modo lectura)
```
**Decisión clave:** se queda con el stack actual (TS vanilla + Worker + D1) y **no** migra a React ni a FastAPI. La razón medible: ya pasa los E2E offline y el precache pesa unos 2 MB. Cambiar de stack costaría horas y no daría ningún punto en la rúbrica.

---

## 7. Criterios de aceptación (cada uno tiene un test o un E2E)

| # | Criterio | Cómo se prueba |
|---|---|---|
| A1 | Después de una primera visita con red, en modo avión la app abre con el mapa base, la capa CENEPRED y el formulario | E2E (servidor apagado), Android y escritorio |
| A2 | El formulario elige un centro poblado tocándolo en el mapa o buscándolo por nombre, y guarda sin red | E2E |
| A3 | `via` no acepta «transitable»: no está en la UI y el Worker lo rechaza | unit + worker test |
| A4 | Un registro modificado en el portador da `rejected: bad_sig` | worker test |
| A5 | 20 registros pasan de A a B por QR animado; se mide cuántos fragmentos y cuántos segundos tarda | `measure:qr` + prueba manual con 2 teléfonos **[pendiente, la hace Brayan]** |
| A6 | Al escanear el acuse en A, sus registros pasan a «en relevo» | E2E con imagen de QR |
| A7 | Al volver la red en B, el mapa del silencio de `/coe` pasa ese centro poblado de «sin ficha de evaluación» a «con registro recibido, no verificado» en menos de 10 s | E2E remoto contra el preview |
| A8 | Reenviar el mismo paquete da `duplicates = N` e `inserted = 0` | worker test |
| A9 | El contador separa 930 IGN, 317 aproximados OSIPTEL en el mapa y 8 en «Sin ubicar» (3 sin coordenadas y 5 fuera de su distrito; total 1.255), leídos de `piura_ccpp_estado_base.json` | unit sobre los datos |
| A10 | No hay ninguna petición a hosts externos en modo offline | E2E (ya existe) |
| A11 | CI en GitHub Actions corre typecheck, test y build en cada PR; el README tiene arquitectura, trade-offs, licencias y qué no se probó | revisión |
