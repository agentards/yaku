# RESUMEN_DATOS: Yaku Relay / Piura (Hack the Andes 2026, Track 01)

> **Actualización del 2026-10-17, 13:40 (America/Lima):** se agregaron los anexos Excel de CENEPRED que Brayan descargó a mano desde Perú (§7), la georreferenciación (§8), `piura_cenepred_421.geojson` (§9) y una nueva consulta del aviso SENAMHI (§10). Donde contradigan a las secciones 1–6, mandan las 7–10.

Auditoría hecha el 2026-10-17, entre 12:03 y 12:20 (America/Lima). Archivos crudos en `raw/<fuente>/` y hashes en `inventario.csv`.
Clasificación usada: **OFICIAL-OBS** (oficial observado/registrado), **PRONÓSTICO** (predicción/pronóstico), **ESCENARIO** (escenario hipotético), **CIUDADANO** (reporte ciudadano no verificado). En este conjunto **no hay datos ciudadanos**.

## 0. Bloqueo de red (importante)
Desde el box, `curl` falla en el handshake TLS (error 35 `unexpected eof while reading`; DNS → 198.18.0.1, el proxy de salida) con estos dominios: `sigrid.cenepred.gob.pe`, `sigrid4.cenepred.gob.pe`, `cenepred.gob.pe`, `enfen.imarpe.gob.pe`, `www.senamhi.gob.pe`, `www.ana.gob.pe`, `repositorio.ana.gob.pe`, `snirh.ana.gob.pe`, `snirhgeo.ana.gob.pe`, `geocatmin.ingemmet.gob.pe`.
Sí responden: `gob.pe`/`cdn.www.gob.pe`, `datosabiertos.gob.pe`, `geo.indeci.gob.pe`, `geosinpad.indeci.gob.pe`, `coen.indeci.gob.pe`, `cpc.ncep.noaa.gov`, `psl.noaa.gov`, `ide.inei.gob.pe`, `geoidep.gob.pe`.
Los documentos de CENEPRED se leyeron **solo como texto con WebFetch**, así que no hay binario ni sha256 del original. Las capas sí se obtuvieron a través del **geoservicio ArcGIS de INDECI** (`geosinpad.indeci.gob.pe/indeci/rest/services`), que encontré dentro del JS del Visor INDECI (https://geo.indeci.gob.pe/visorindeci/, citado en el comunicado ENFEN 18-2026).

## 1. Tabla por fuente

| # | Fuente / recurso | Estado | Formato | Cobertura (¿Piura?) | Fechas / vigencia | Licencia | Clasificación | Utilidad para la demo |
|---|---|---|---|---|---|---|---|---|
| 1a | CENEPRED/SIGRID **23077**: escenario por Aviso 421 | PDF leído como texto con WebFetch. curl falla (TLS). **SHAPE/Excel NO obtenidos**: la ficha no muestra enlaces y la tabla «Anexos y Ver» de /sigridv3/escenarios se carga con JS. Las tablas 2 y 3 llegaron vacías | PDF | Amazonas, Cajamarca, La Libertad, Lambayeque, **Piura**, Tumbes | 17–19 oct 2026; firmado el 16/10/2026 | SIGRID «de libre acceso … respeto a los derechos y crédito a los autores»; sin licencia formal | ESCENARIO (a partir de PRONÓSTICO SENAMHI) | Alta para la narrativa y las cifras; geometría pendiente |
| 1b | CENEPRED/SIGRID **22910**: escenario lluvias OND 2026 | PDF leído como texto con WebFetch (URL del PDF deducida del patrón `storage/biblioteca/<id>_<slug>.pdf`; respondió). Anexos (Excel por distrito) NO obtenidos | PDF | Nacional, con filas para Piura | oct–dic 2026; base IT N° 12-2026/SENAMHI-DMA-SVC y ENFEN 17-2026 | Igual que 1a | ESCENARIO | Alta: cifras de Piura por nivel de riesgo (ver §3) |
| 1c | CENEPRED/SIGRID **22169**: escenarios El Niño (análogos 1983/1998/2017/2023) | Solo la ficha (WebFetch). La URL del PDF deducida dio **404**; PDF no localizado | HTML (ficha) | Nacional (según la ficha) | Actualizado con IT N° 69-2026/SENAMHI-DMA-SPC | Igual que 1a | ESCENARIO | Baja hasta conseguir el PDF/anexos |
| 1d | Capa `SDE.SIGRID_Areas_Exposicion_Erosion` (servicio INDECI) | OK, 69 polígonos en Piura | GeoJSON (ArcGIS REST), Polygon, EPSG:4326; **geometrías no todas válidas** | Piura (Ayabaca, Morropón, Huancabamba, Talara, Paita) | FECHA_DOC 2019–2023 | No declarada en el servicio | OFICIAL-OBS (zonas evaluadas por INGEMMET/IGP/CENEPRED) | Media: capa de peligro geológico con enlace a la ficha SIGRID (campo URL) |
| 2 | ENFEN Comunicado Oficial **N.º 18-2026** | **OK**: HTTP 200, 778 221 bytes, sha256 `f0df5749…c172`, 2 págs., creado el 16/10/2026 14:22 -05 | PDF + texto (pdftotext) | Nacional; cita los ríos **Chira y Piura** | 16/10/2026; próximo comunicado el 30/10/2026 | Publicación institucional en gob.pe; sin licencia explícita | Estado de alerta: oficial. Perspectivas: PRONÓSTICO | Alta: banner oficial |
| 3a | SENAMHI aviso **activación de quebradas 24 h** (servicio INDECI, capa 2) | **OK**: 124 polígonos, **55 en Piura** (Nivel 2: 43, Nivel 3: 12) | GeoJSON, Polygon, EPSG:4326 (origen 3857), todas válidas | Piura: Ayabaca, Huancabamba, Morropón, etc. | FECHA = 1792022400000 ms = 2026-10-15 00:00 UTC; FECHA_ETL vacío | No declarada | PRONÓSTICO (aviso) | **Alta**: polígonos reales de Piura → `piura_minimo.geojson` |
| 3b | SENAMHI aviso **precipitación 24 h** (capa 5) | OK: 5 polígonos; 2 cruzan Piura (Nivel 1 y 2) | GeoJSON, Polygon | Parcial | Misma FECHA (15/10/2026) | No declarada | PRONÓSTICO | Media. No dice el número de aviso (¿421?); falta confirmarlo |
| 3c | SENAMHI aviso **hidrológico 24 h** (capa 4) | OK: 8 puntos, **todos en Loreto** | GeoJSON, Point | **No hay Piura/Chira** | 07–16/10/2026 | No declarada | OFICIAL-OBS (nivel de río) + aviso | Nula para Piura hoy |
| 3d | SENAMHI estaciones automáticas GBON/RBON (datosabiertos) | OK: 50 474 012 bytes, 416 273 filas, 5 estaciones | CSV (`ID,ESTACION,FECHA,HORA,LONGITUD,LATITUD,ALTITUD,TEMP,HR,PP,RED,DEPARTAMENTO,PROVINCIA,DISTRITO,UBIGEO,FECHA_CORTE`) | **No incluye Piura** (Arequipa 2, Lima 2, Tacna 1) | 2015-01-01 a 2024-06-30 | No verificada en la página del recurso | OFICIAL-OBS | Nula para Piura |
| 3e | Portal SENAMHI (descarga de datos, avisos vigentes) | **NO descargado**: TLS bloqueado desde el box | n/a | n/a | n/a | n/a | n/a | Necesita navegador |
| 4 | INDECI/SINPAD «Emergencias y daños a nivel nacional por departamento» | **OK**: 27 040 446 bytes, 142 139 filas × 49 columnas, `;`, **latin-1** | CSV tabular, sin geometría (tiene `COD. DISTRITO` = UBIGEO) | **Piura: 6 065 registros** (2003–2025) | 2003–2025. Ficha: modificada/lanzada el 2026-08-26. **Fechas mixtas**: hasta 2024 DD/MM/AAAA; 2025 MM/DD/AA | **Open Data Commons Attribution License** | OFICIAL-OBS (registros EDAN) | Alta para el contexto histórico; se une a los distritos por UBIGEO |
| 4b | COEN `geojson-last-emergencies` | Responde 200, pero con **0 features** en el momento de la consulta | GeoJSON (CRS84) | n/a | n/a | n/a | OFICIAL-OBS | Candidato para tiempo real; revisar más tarde |
| 5 | NOAA CPC: ONI + ENSO Diagnostic Discussion | **OK** (oni 23 025 B; ersst5 67 087 B; ensodisc 13 499 B). `roni.ascii.txt` en la ruta probada → 404 | ASCII / HTML | Global | ONI hasta **JAS 2026 = 2.16**; discusión del 8/10/2026; la próxima, 12/11/2026 | Dominio público (gobierno de EE. UU.); no lo verifiqué en la página | ONI: OFICIAL-OBS. Perspectiva: PRONÓSTICO | Media: contexto global |
| 6a | ANA nota de prensa «283 puntos críticos» | **OK** (gob.pe, 14/01/2026) | HTML | AAA Jequetepeque-Zarumilla; **Piura 54 fichas** | 14/01/2026 | Contenido gob.pe | OFICIAL (inventario técnico de puntos críticos) | Cifra verificada (§3) |
| 6b | Fichas PDF + Excel resumen en repositorio.ana.gob.pe | **NO descargadas**: TLS bloqueado | PDF/XLSX | Piura | n/a | n/a | n/a | Necesita navegador |
| 6c | Capa `SDE.T20260827_puntosCriticosPriorizados` (servicio INDECI) | **OK**: 1 072 puntos; **Piura 138 puntos = 69 códigos FTR** (cada tramo tiene un punto INICIAL y uno FINAL) | GeoJSON, Point, EPSG:4326 | Piura: cuencas Piura (104 pts), Chira (32), Intercuenca 13779 (2) | Fichas de 2025 y 2026; nombre de la tabla T20260827 | No declarada | OFICIAL (puntos críticos priorizados) | **Alta**: capa operativa de puntos críticos en Piura |
| L | Límites dpto./prov./distr. Piura (servicio INDECI) | **OK**: 1 / 8 / 65 polígonos | GeoJSON, Polygon, EPSG:4326 (origen 3857) | Piura | Campos de población POB_PRY_22/23 | No declarada; origen primario (INEI/IGN) **no declarado** | Cartografía base | Alta: base del mapa y unión con SINPAD |

## 2. Esquemas clave (nombres de campo tal como vienen en la fuente)
- SENAMHI AvisoActQuebrada24H: `OBJECTID, ID, GID, NIVEL, FECHA, DESCRIPCIO, RECOMENDAC, RESPONS, NOMBDEP, NOMBPROV, NOMBDIST, FECHA_ETL`.
- SENAMHI AvisoPP24H: `OBJECTID, NIVEL, FECHA, DESCRIPCIO, RECOMENDAC, RESPONS, FECHA_ETL`.
- SENAMHI AvisoHidrologico24H: `ID, COD_ZONAL, NOM_ZONAL, NOM_ESTACI, LONGITUD, LATITUD, FECHA_HORA, NIVEL, COLOR_TEXT, COLOR_HEXA, ID_AVISO, NUM_AVISO, TITULO, PELIGRO_NI, RECOMENDAC, URL_CENTRO, NOMBDEP, NOMBPROV, NOMBDIST, COD_CUENCA, NOM_CUENCA, NOM_UND_HI, FECHA_ETL`.
- ANA puntosCriticosPriorizados: `N_, CODIGO, COD, TIPO, AAA, ALA, CUENCA, FUENTE_NAT, NOMBRE, DEPARTAMEN, PROVINCIA, DISTRITO, SECTOR, ESTE_I, NORTE_I, LATITUD, LONGITUD, ZONA, MI, MD, NOMBRE_DE, UN, META, VOLUMEN_M3, PELIGRO, NIVEL_DE_P, FECHA, RESPONSABL, RESP, RESPONSA_1`. En Piura: NIVEL_DE_P Muy Alto 104 / Alto 34 (en puntos, no en tramos); PELIGRO: «Inundación, Erosión fluvial» 84, «Inundación, Flujo de detritos, Erosión fluvial» 30, «Inundación» 22, «Erosión fluvial» 2.
- Límites DISTRITOS: `UBI_DIST, NOMBDEP, NOMBPROV, NOMBDIST, CAPITAL, POB_PRY_22, POB_PRY_23, UBI_DEP, CODPROV, CODDIST, UBI_PROV`.
- SINPAD CSV: 49 columnas (ver la cabecera en el CSV y en `Diccionario_de_datos_9.xlsx`), entre ellas `CODIGO DE EMERGENCIA-SINPAD; FECHA  DE LA EMER` (con doble espacio)`; AÑO; MES; COD. DISTRITO; DPTO.; PROV.; DIST.; PELIGRO; TIPO DE PELIGRO; … DAMNIFICADOS; AFECTADOS; VIVIENDAS DESTRUIDAS; VIVIENDAS AFECTADAS; …`.

## 3. Hallazgos verificados
- **ENFEN 18-2026 (16/10/2026)**: estado «**Alerta de El Niño Costero**». Cita literal: «Frente a la costa peruana (región Niño 1+2) es más probable que calentamiento del mar (El Niño costero) se mantenga con una magnitud de extraordinaria hasta enero de 2027 […], para luego disminuir a fuerte hasta inicios del otoño de 2027.» Y también: «Caudales: Superiores a lo normal, principalmente, desde noviembre en los ríos Tumbes, Chira, Piura, La Leche y Jequetepeque». El listado de enfen.imarpe.gob.pe indica 759.98 KB y la copia de gob.pe pesa 778.2 KB: no las comparé byte a byte.
- **NOAA**: ONI de **JAS 2026 = 2.16** (`oni.ascii.txt`: `JAS 2026 29.12 2.16`). ENSO Diagnostic Discussion del **8/10/2026**: «ENSO Alert System Status: El Niño Advisory»; «a strong-to-very strong El Niño likely through January-March 2027 (remaining greater than an 83% chance)». Probabilidad de evento histórico (RONI ≥ +2.5 °C): 54 % SON, 83 % OND, 70 % NDJ. Observación: `ersst5.nino.mth.91-20.ascii` llega solo hasta 2026-06.
- **ANA, 283 puntos**: confirmado en la nota de gob.pe del 14/01/2026: 25 Tumbes + **54 Piura** + 34 Lambayeque + 94 La Libertad + 76 Cajamarca = **283** fichas en la AAA Jequetepeque-Zarumilla (1 645 a nivel nacional, R.D. N.° 0008-2025-ANA-DPDRH). **Las 54 fichas de Piura (PDF + Excel) no se descargaron** por el bloqueo TLS. La capa de priorizados de INDECI es **otro corte** (69 tramos en Piura, 132 códigos en la AAA JZ) y no debe presentarse como «los 283».
- **CENEPRED 23077**: costa de Piura ~8 mm/día (17/10), ~10 mm/día (18 y 19/10). Riesgo por inundación Muy Alto: 280,355 hab. y Alto: 138,350 hab. (sumando todos los departamentos del aviso; no hay desglose para Piura en el texto obtenido).
- **CENEPRED 22910 (OND 2026), Piura** (leído del texto convertido; conviene cotejarlo con el PDF): inundación Muy Alto **16 distritos** y Alto **24**; movimientos en masa Muy Alto **29** y Alto **6**; 126 puntos críticos por inundación en distritos de riesgo Alto/Muy Alto. Perspectiva hidrológica: Chira (El Ciruelo) y Piura (Ñácara) «normal» en octubre y «sobre lo normal» en noviembre y diciembre.
- **SINPAD Piura**: 6 065 emergencias registradas 2003–2025. Las más frecuentes: incendio urbano/industrial 2 192, lluvia intensa 2 020, vientos fuertes 1 092, inundación 127. En 2023: 31 572 damnificados y 318 407 afectados (suma de columnas).

## 4. `piura_minimo.geojson`
56 features, EPSG:4326, geometrías válidas, se abre con geopandas:
- 1 polígono **límite del departamento de Piura** (servicio INDECI `LimitesAdministrativos`, capa 2). Es cartografía base y no expresa riesgo.
- 55 polígonos **SENAMHI aviso de activación de quebradas 24 h** en Piura (campo de riesgo original `NIVEL`: «Nivel 2» / «Nivel 3»). Clasificación: **PRONÓSTICO**. Es un nivel de aviso; **no es profundidad de agua ni área inundada**.
Properties: `capa, nombre, ubigeo, fuente, url, fecha_descarga, clasificacion, riesgo_campo_original, riesgo_valor_original, vigencia, nota`.
No contiene ningún polígono de CENEPRED, porque los SHAPE de 23077 no se pudieron descargar.

## 5. Qué sirve realmente para una demo en Piura
Sirve: límites distritales (65) + SINPAD por UBIGEO (histórico) + polígonos de aviso de quebradas SENAMHI (pronóstico vigente) + 69 tramos críticos ANA priorizados (con coordenadas) + banner ENFEN 18-2026 + cifras de 22910/23077 citadas como escenario. Todo esto **ya está en disco** y permite una consulta geoespacial real del tipo «distrito → avisos, puntos críticos e historial de emergencias».
No sirve todavía: estaciones automáticas SENAMHI (no hay ninguna en Piura); avisos hidrológicos (solo Loreto); 22169 (sin PDF); COEN en tiempo real (vacío). Ninguno de estos recursos es un **dataset de entrenamiento ML**: son fichas, escenarios y capas de aviso.

## 6. NO verificado / pendiente (necesita navegador o un humano en Perú)
1. ~~Excel de los anexos de 23077~~ **RESUELTO (Excel)** con la descarga manual de Brayan (§7). Siguen faltando los **SHAPE** de los anexos de 23077 (y de 22910 y 22169): hay que abrir https://sigrid.cenepred.gob.pe/sigridv3/escenarios → «Anexos y Ver» en un navegador real; SIGRID v4 puede pedir registro para descargar.
2. PDF de 22169 (la URL deducida dio 404).
3. Las **54 fichas ANA de Piura y su Excel resumen** en repositorio.ana.gob.pe (TLS bloqueado).
4. Portal SENAMHI: Aviso Meteorológico N° 421 (https://www.senamhi.gob.pe/?p=aviso-meteorologico-vigente&a=2026&b=29267&c=00&d=SENA) y datos de estaciones de los ríos Piura/Chira (TLS bloqueado). Tampoco está confirmado si las capas AvisoPP24H/AvisoActQuebrada24H corresponden al aviso 421.
5. Copia del PDF ENFEN 18-2026 en enfen.imarpe.gob.pe: la diferencia de tamaño frente a gob.pe no está resuelta.
6. Licencias de las capas del servicio INDECI y del dataset SENAMHI en datosabiertos (no declaradas o no encontradas).
7. Origen primario (INEI/IGN) de los límites del servicio INDECI.
8. Las cifras de las tablas de 22910 salen de texto convertido de PDF; hay que cotejarlas con el PDF antes de mostrarlas.


## 7. Anexos Excel CENEPRED descargados a mano por Brayan (desde Perú)
Ubicación: `raw/cenepred/usuario/`. Los sha256 coinciden con los nombres de los adjuntos originales.

| Archivo | sha256 (inicio) | Bytes | Escenario SIGRID | Piura |
|---|---|---|---|---|
| aviso_421_2026.xlsx | b8bc00a7… | 2 810 283 | **23077, verificado**: el título del Excel dice «(Con base al Aviso Meteorológico 421_2026)» y la ficha 23077 dice «(Aviso 421)» | Sí |
| aviso_422_2026.xlsx | 5c6e9732… | 3 564 000 | 23104: la ficha dice «(Aviso 422)», pero solo la vi en resultados de búsqueda y no la abrí desde el box | No |
| aviso_415_2026.xlsx | eab4293b… | 2 373 565 | **No verificado** (la biblioteca tiene el estudio «friaje 15–17 oct 2026 (Aviso 415)», pero no encontré su ID) | No |
| aviso_409_2026.xlsx | e32f29c1… | 2 886 643 | **No verificado** («extensión del aviso 403, 12–13 oct 2026 (Aviso 409)») | Sí (MM: 28 distritos; CCPP: 1 814) |
| aviso_403_2026.xlsx | 064264cc… | 2 918 666 | **No verificado** («09–11 oct 2026 (Aviso 403)») | Sí (MM: 32 distritos; CCPP: 2 230) |
| sigrid_export_brayan.xlsx | 341f80a5… | 14 055 | Export vacío | n/a |

Autor de los .xlsx (metadatos): «Nataly Romero». Fecha de modificación del 421: 2026-10-16 13:52.
Licencia: la misma de SIGRID (libre acceso con crédito al autor); no hay licencia formal.

### 7.1 Auditoría del Aviso 421, Piura (verificado con código; coincide con lo que reportó Brayan)
- **Hoja `Distritos_riesgo_421_MM`**: cabecera de 3 filas (fila 1: título; fila 2: grupos; fila 3: subcolumnas). Columnas: `Departamento, Provincia, Ubigeo distrital, Distrito, 1/ Condición del territorio, 2/ N° Eventos mov. masa, Valor de Susceptib., 3/ Incidencia de Pobreza, 4/ Desnutrición Crónica, 5/ Tasa de Analfabetismo, Valor de Exposición, Nivel de Riesgo, 6/Población, 7/Viviendas, 8/Establecim. de salud, 9/ Instituc. educativas, 10/ Alumnos, 11/Docentes`.
  - Total: 196 distritos (MA 143, A 46, M 7).
  - **Piura: 23 distritos (MA 14, A 8, M 1)**, en 4 provincias: Ayabaca 10, Huancabamba 8, Morropón 4, Sullana 1. Suma de `6/Población`: 268 807.
  - No hay UBIGEO duplicados. Los códigos MA/A/M/B no se explican dentro de la hoja; los traduje como Muy Alto/Alto/Medio/Bajo según la escala del PDF.
  - Las notas 1/–11/ de la cabecera no están en la hoja.
- **Hoja `CentrosPobladosEnRiesgo_INUND`**: columnas `Departamento, Provincia, Distrito, Ubigeo de distrito, Código del centro poblado, Nombre delcentro poblado` (sic, sin espacio)`, Población, Viviendas, Nivel de exposición a inundaciones`.
  - **Piura: 1 255 centros poblados (Muy Alto 4, Alto 14, Medio 210, Bajo 28, Muy Bajo 999)**. Población 198 541; viviendas 64 303; 15 centros con población 0.
  - Todos los códigos tienen 10 dígitos, sin duplicados, y su prefijo coincide al 100 % con el UBIGEO del distrito.
- **Hoja `Est.Salud_en_Riesgo_INUN`**: Piura 140 establecimientos (Muy Bajo 107, Medio 27, Alto 3, Bajo 3). `Codigo MINSA` de 8 dígitos, sin duplicados.
- **Hoja `Inst.Educativas_Riesgo_INUN`**: Piura 1 696 instituciones (Muy Bajo 1 334, Medio 303, Bajo 29, Alto 24, Muy Alto 6). Hay 1 187 locales distintos (509 filas repiten `Codigo de local`, porque un local alberga varios niveles).

**Anomalías y advertencias**
1. **Las hojas dicen «EnRiesgo» / «_Riesgo_», pero la columna es «Nivel de exposición a inundaciones».** Ese valor es un nivel de **EXPOSICIÓN**, no de riesgo. En los entregables lo rotulo como exposición.
2. **El inventario de inundación cubre solo los 23 distritos andinos de la hoja MM** (Ayabaca, Huancabamba, Morropón, Sullana). No aparecen Piura ciudad, Castilla, Catacaos ni la costa, aunque el texto del PDF 23077 menciona la «costa interior de Piura». No sé si es un recorte metodológico o un error: hay que consultarlo con CENEPRED.
3. Muchas filas vacías: en CCPP, 38 737 de 47 318 filas; en EE.SS., 2 301 de 3 786; en II.EE., 11 361 de 21 241. Además, la hoja II.EE. tiene 2 columnas sin nombre y vacías.
4. Las cifras de 23077 que salen del PDF (280,355 hab. en Muy Alto, etc.) son de **inundación a nivel de departamento** y no se pueden reconstruir sumando directamente estas hojas.

CSV filtrados de Piura en `cenepred_421_piura/`:
- `aviso421_piura_distritos_MM.csv` (23 filas)
- `aviso421_piura_centros_poblados_INUND.csv` (1 255)
- `aviso421_piura_establecimientos_salud_INUN.csv` (140)
- `aviso421_piura_instituciones_educativas_INUN.csv` (1 696)

## 8. Georreferenciación (los Excel no traen coordenadas)
| Elemento | Fuente de coordenadas | Llave de unión | Coincidencia |
|---|---|---|---|
| Distritos MM | INDECI geosinpad `LimitesAdministrativos/limitesAdministrativos/MapServer/0` (SDE.DISTRITOS) | UBIGEO (`Ubigeo distrital` = `UBI_DIST`) | **23/23 (100 %)**, mismos nombres |
| Centros poblados | **IGN «Dataset Centros Poblados»** (`CCPP_IGN100K.shp`, 136 587 puntos, EPSG:4326), https://www.datosabiertos.gob.pe/sites/default/files/CCPP_0.zip. Ficha: publicador IGN, modificada el 2025-04-01, **License Not Specified** | `Código del centro poblado` = `CÓDIGO` (10 dígitos) | **930/1 255 (74.1 %)**. Por nivel: Muy Alto 3/4, Alto 11/14, Medio 167/210, Bajo 24/28, Muy Bajo 725/999. Población cubierta: 171 538 de 198 541 |
| II.EE. | INDECI geosinpad `SIRAIM/SDE_IE_ESCALE_MINEDU/MapServer/0` (MINEDU ESCALE; `FECHA_ACT` 28-08-2026), 10 445 registros en Piura | `Codigo modular` = `COD_MOD` | **1 696/1 696 (100 %)**; el `Codigo de local` coincide en el 99.9 % |
| EE.SS. | INDECI geosinpad `Multisectorial/MINSA/MapServer/3` (SDE.MINSA_RENIPRESS), 1 835 en Piura | **La capa NO trae el código IPRESS/MINSA**, así que uní por UBIGEO + nombre normalizado, descartando 178 claves ambiguas | 138/140 (98.6 %). **Es una unión por nombre: no la incluí en el GeoJSON** |

Calidad de la unión de centros poblados:
- En 286 de los 930 cruces el nombre normalizado no coincide. Muchos son variantes («YANCHALA»/«ANCHALA», «SARGENTO LORENZ»/«SARGENTO LORES»), pero algunos son nombres claramente distintos («SANTA ROSA»/«HIGUERILLAS», «SALVIA»/«MINAS»).
- 10 de los 930 puntos caen fuera de su propio distrito (con un margen de unos 100 m).
- Ambos casos quedan marcados en las properties (`nombre_coincide_normalizado`, `punto_dentro_de_su_distrito`).
- El IGN mezcla códigos de FUENTE IGN e INEI y no lo declaré como «marco censal INEI». Además, el shapefile trae 311 códigos de 9 dígitos con el cero inicial perdido (son de Áncash, no de Piura).
- 325 centros poblados no tienen punto y no se dibujaron.

Archivos `*_georef*.csv` en `cenepred_421_piura/`.

## 9. `piura_cenepred_421.geojson`
953 features en EPSG:4326, todas las geometrías válidas, se abre con geopandas:
- 23 polígonos distritales con `nivel_original` MA/A/M (riesgo por **movimientos en masa**);
- 930 puntos de centros poblados con `Nivel de exposición a inundaciones`.

Todas las features llevan `rotulo` = «Escenario de riesgo CENEPRED», `clasificacion` = «escenario hipotético basado en pronóstico», `vigencia` = «17-19 oct 2026», `aviso`, `fuente`, `geom_fuente` y `nota` = «nivel de exposición/riesgo, no profundidad de agua».
Por indicación del equipo, **no se rotula como pronóstico de inundación ni se cruza espacialmente con las capas SENAMHI**: son archivos separados.

## 10. Aviso SENAMHI de activación de quebradas vigente
Consulta del 2026-10-17 a las 13:30 (America/Lima) a la misma capa (`Ent_Tecnico_Cientificas/SENAMHI/MapServer/2`):
- **10 polígonos, todos de Nivel 2, en Amazonas/Condorcanqui**. `FECHA` = 1792195200000 ms = 2026-10-17 00:00 UTC (2026-10-16 19:00 en America/Lima). `RESPONS` = SFLOREZ.
- **Ninguno en Piura.** El aviso del 15/10 (55 polígonos en Piura) ya no está publicado en el servicio.

`senamhi_quebradas_vigente_piura.geojson` es una FeatureCollection **vacía** con metadatos que explican esto. `piura_minimo.geojson` conserva el aviso del 15/10, que **ya venció** y debe rotularse como histórico.
Aviso de precipitación 24 h (capa 5) en la misma consulta: 7 polígonos con FECHA 2026-10-17; dos tocan Piura (Nivel 1 y Nivel 2). Crudo en `raw/senamhi/geosinpad_SENAMHI_AvisoPP24H_consulta1330.geojson`. No sé a qué número de aviso corresponde.

## 11. Pendiente tras esta actualización
- IDs SIGRID de los avisos 403, 409 y 415, y confirmación directa de la ficha 23104 para el 422.
- SHAPE de los anexos de 23077, si existen.
- Por qué el inventario de inundación del 421 excluye los distritos costeros de Piura.
- Licencia del dataset IGN de centros poblados («License Not Specified»).
- Una capa de EE.SS. con el código IPRESS, para unirlos por código en vez de por nombre.
- Origen de la carpeta `basemap/`: la creó otro agente a las 13:30; no está en mi inventario y no la auditué.
