# Guion de pitch — Yaku Relay (3:00) · borrador v1 del Andes Judge Bot
Estado: borrador. Depende del MVP real; ajustar cuando el PRD fije el flujo. Puntajes de la rúbrica = simulados.

## Reglas que no se rompen
- Reportes y fichas de campo = "no verificado". Nunca "alerta oficial", nunca "vía segura"/"transitable", nunca "sin riesgo".
- CENEPRED Aviso 421 = "escenario de riesgo", no pronóstico de inundación ni profundidad de agua.
- No decir que hoy hay aviso SENAMHI de quebradas en Piura (no hay vigente al 17/10 13:30).
- Cobertura = "sin cobertura garantizada según OSIPTEL (declarada por operadoras, no medida en campo)", nunca "sin señal".
- Nombrar EDAN Digital (INDECI) como herramienta oficial que Yaku complementa; no afirmar integración ni lo que EDAN no hace sin verificarlo.

## Guion cronometrado
**0:00–0:25 · Problema (con dato)**
"Este es el escenario de riesgo de CENEPRED vigente del 17 al 19 de octubre en la sierra de Piura. Casi la mitad de sus centros poblados —445 de 928— no tiene cobertura móvil garantizada según OSIPTEL. Y en Huancabamba y Ayabaca las carreteras se cortan casi cada año."
Pantalla: mapa abre encuadrado en Ayabaca/Huancabamba con la capa CENEPRED.

**0:25–0:45 · Usuario y hueco**
"INDECI ya tiene EDAN Digital para evaluar daños offline. Lo que falta es el tramo siguiente: que esa evaluación salga de un caserío sin cobertura en el teléfono de quien sí puede moverse."
Pantalla: contador "930 con ubicación de 1.255" y lista "Sin ubicar".

**0:45–1:30 · Registrar sin red**
Activar modo avión en vivo. Registrar una ficha con GPS automático. Mostrar que el mapa base y las capas siguen ahí.
Frase: "Sin red. La ficha queda guardada y marcada como no verificada."

**1:30–2:10 · Relevo por QR (+ acuse ~10 s, PRD sección 8)**
Teléfono A muestra QR (barra de progreso). Teléfono B o la webcam de la laptop lo lee. Estado "en relevo". B muestra QR de acuse; A lo lee y marca "entregada a relevo" (no "recibida por INDECI").
Frase: "No es una conversación, es el registro completo, con coordenadas y hora, que no se distorsiona al pasar de mano en mano."

**2:10–2:40 · Consolidación** (recortar a 25 s si el acuse se alarga)
Recuperar red en B → sincronizar → estado "consolidado". Mapa: el centro poblado pasa de "sin evaluar" a "con registro recibido, no verificado". Mostrar 5 s de /api/stats: sin duplicados.

**2:40–3:00 · Cierre y trade-offs**
"Trade-offs: la cobertura es declarada, no medida; 317 centros poblados tienen ubicación aproximada de OSIPTEL y 8 quedan en lista aparte (3 sin ubicar y 5 fuera de su distrito); los reportes no son verificados. Cuando la conexión se pierde, la información no debería desaparecer."

## Plan B
| Falla | Respuesta en vivo (≤10 s) |
|---|---|
| Wifi del evento caído | La app ya está en caché: se demuestra igual, es el argumento del producto. Sincronización: usar hotspot del teléfono. |
| Cámara no lee el QR | Usar el "enlace relay" en otra pestaña, o subir captura del QR. |
| Acuse falla | Saltarlo y decir "el acuse confirma la entrega entre teléfonos"; no improvisar. |
| QR animado lento (>10 s) | Transferir 1 registro, no 20. |
| Teléfono/batería falla | Flujo completo en dos pestañas de la laptop. |
| Backend caído | Mostrar estado "pendiente de sincronizar" y explicar idempotencia; video grabado de respaldo (grabar ANTES del evento, etiquetado como grabación). |
| Proyector no muestra el celular | Todo el flujo desde la laptop + webcam. |

## Pendientes antes de ensayar
- Medición física: tiempo de lectura QR 1 vs 20 registros con cámara real.
- Confirmar con organizadores si se permite usar teléfonos propios en el pitch.
- Validar con un evaluador o COE real (sube impacto de 3 a 4 en la simulación).
- Ensayar 3 veces con cronómetro; cortar lo que pase de 3:00.
