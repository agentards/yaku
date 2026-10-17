# Datos de Yaku Relay (Piura, Hack the Andes 2026)

> [README](../README.md) · [Arquitectura](ARQUITECTURA.md) · [Decisiones](DECISIONES.md) · **Datos** · [Pruebas](PRUEBAS.md)

Este documento dice qué datos usa la app, de dónde salen, qué son y qué **no** son.
Auditoría del 17/10/2026 (hora de Lima). Detalle completo, hashes y scripts: [`data/RESUMEN_DATOS.md`](../data/RESUMEN_DATOS.md), [`data/inventario.csv`](../data/inventario.csv), [`audit421.py`](../audit421.py), [`build421.py`](../build421.py).

## Cómo clasificamos cada dato
| Clase | Significa | Ejemplo en la app |
|---|---|---|
| **Escenario** | Escenario hipotético de riesgo o exposición, calculado a partir de un pronóstico | Capa «Escenario de riesgo CENEPRED» |
| **Predicción / aviso** | Pronóstico o aviso oficial con vigencia | Aviso SENAMHI de activación de quebradas (vencido) |
| **Dato oficial** | Registro u observación oficial | Límites distritales, comunicado ENFEN, cobertura OSIPTEL declarada |
| **Reporte ciudadano no verificado** | Lo que registra un usuario en la app | Fichas creadas en Yaku (siempre «no verificado») |

Reglas que respeta la app:
- Ningún nivel de riesgo o exposición es **profundidad de agua**, área inundada ni daño confirmado.
- Las capas de escenario (CENEPRED) y de aviso (SENAMHI) **no se cruzan** entre sí.
- Un reporte ciudadano nunca se muestra como alerta oficial, y la app nunca afirma que una vía es segura.
- Ninguna de estas fuentes es un dataset para entrenar un modelo: son escenarios, avisos y capas.

## Fuentes que usa la app
| Capa / archivo | Fuente | Clase | Cobertura y fecha | Licencia |
|---|---|---|---|---|
| `data/piura_cenepred_421.geojson` (23 distritos + 930 centros poblados) | CENEPRED/SIGRID, escenario 23077, anexo Excel del Aviso Meteorológico 421 (descargado a mano desde Perú) | Escenario | 23 distritos andinos de Piura (Ayabaca 10, Huancabamba 8, Morropón 4, Sullana 1). Vigencia 17–19 oct 2026 | SIGRID: libre acceso con crédito al autor; sin licencia formal |
| `data/piura_ccpp_estado_base.json` (1.255 centros poblados) | Mismo anexo + coordenadas IGN + cobertura OSIPTEL | Escenario + dato oficial | Base de los estados «sin ficha de evaluación» / «con registro recibido, no verificado» | Ver fuentes componentes |
| Coordenadas de centros poblados | IGN, Dataset Centros Poblados ([datosabiertos.gob.pe](https://www.datosabiertos.gob.pe/sites/default/files/CCPP_0.zip)) | Dato oficial | Unión por código de 10 dígitos | «License Not Specified» (pendiente) |
| Cobertura móvil por centro poblado | OSIPTEL ([datosabiertos.gob.pe](https://www.datosabiertos.gob.pe/dataset/porcentaje-de-cobertura-m%C3%B3vil-por-centro-poblado-empresa-operadora-y-tecnolog%C3%ADa)) | Dato oficial (declarado por las operadoras, no medido en campo) | Unión por código | ODC-By |
| Límites distritales | Servicio de mapas de INDECI (`geosinpad.indeci.gob.pe`) | Dato oficial | Piura | No declarada |
| `data/piura_minimo.geojson` (55 polígonos) | Aviso SENAMHI de activación de quebradas 24 h, vía servicio INDECI | Predicción / aviso | Emitido el 15/10/2026. **Ya venció**: se muestra solo como ejemplo histórico | No declarada |
| Banner ENFEN | [Comunicado Oficial ENFEN N.º 18-2026](https://www.gob.pe/institucion/senamhi/informes-publicaciones/8731950-comunicado-oficial-enfen-n-18-2026) (copia en gob.pe, 16/10/2026) | Dato oficial (estado de alerta) + predicción (perspectivas) | Nacional; menciona caudales sobre lo normal en los ríos Chira y Piura desde noviembre | Publicación institucional, sin licencia explícita |
| Mapa base `piura_basemap*.pmtiles` | © OpenStreetMap, build Protomaps | Cartografía | Bbox `-81.43,-6.48,-79.11,-3.98`; producción usa z11 | Datos ODbL (atribución visible obligatoria); ver [`data/basemap/LICENSE_BASEMAP.md`](../data/basemap/LICENSE_BASEMAP.md) |

## Cifras verificadas que se pueden decir
- Aviso 421, Piura: **23 distritos** por movimientos en masa (Muy Alto 14, Alto 8, Medio 1) y **1.255 centros poblados** con nivel de exposición a inundaciones (Muy Alto 4, Alto 14, Medio 210, Bajo 28, Muy Bajo 999).
- Ubicación de los 1.255: **930** con coordenadas IGN, **317** aproximados con coordenadas OSIPTEL dentro de su distrito y **8** en la lista «Sin ubicar» (3 sin coordenadas + 5 con punto OSIPTEL fuera de su distrito).
- Cobertura: **445 de 928** centros poblados con punto IGN y dato OSIPTEL (48 %) no tienen cobertura móvil garantizada según OSIPTEL. Es cobertura declarada por las operadoras, no medida en campo.
- ENFEN 18-2026: estado «Alerta de El Niño Costero». NOAA: ONI jul–sep 2026 = 2,16; «El Niño Advisory» (8/10/2026).

Cómo **no** decirlas: no «centros poblados afectados», no «expuestos» para el total (725 de los 930 tienen exposición «Muy Bajo»), no «sin señal», no «hay alerta de quebradas en Piura hoy».

## Huecos conocidos (dichos a propósito)
1. El anexo del Aviso 421 **no incluye Piura ciudad ni la costa**, aunque el PDF del escenario menciona la costa interior de Piura. No sabemos si es un recorte metodológico o un error.
2. Hoy (17/10/2026, 13:30 hora de Lima) **no hay aviso SENAMHI de quebradas vigente en Piura**; los únicos polígonos publicados están en Amazonas.
3. No conseguimos los SHAPE oficiales de los escenarios CENEPRED (el acceso desde nuestro servidor está bloqueado), así que la geometría viene de unir códigos con capas oficiales.
4. En 286 de los 930 cruces con el IGN el nombre no coincide exactamente, y 10 puntos IGN caen fuera de su distrito. Quedan marcados en cada punto.
5. Licencias no declaradas: capas del servicio INDECI, aviso SENAMHI y dataset IGN de centros poblados.
6. Los 283 puntos críticos de la ANA (54 en Piura) están confirmados por [nota de gob.pe](https://www.gob.pe/institucion/ana/noticias/1333382-ana-identifica-283-puntos-criticos-en-rios-y-quebradas-del-norte-del-pais), pero sus fichas no se pudieron descargar y no están en la app.
