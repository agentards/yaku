# Producto

## Problema
Tras una emergencia, el **evaluador EDAN del gobierno local** debe llenar el **Formulario de Evaluación Rápida (Anexo 01)**.

- **[VERIFICADO]** La norma pide hacerlo «en un rango de 2 a 4 horas de ocurrida la emergencia», según los lineamientos EDAN aprobados con la RM 324-2023-PCM.
- **[VERIFICADO]** El formulario «tiene carácter de Declaración Jurada».

En la sierra de Piura, ese formulario a menudo no puede salir a tiempo del lugar:

- **[VERIFICADO]** Según OSIPTEL, **445 de los 928** centros poblados del escenario CENEPRED del Aviso 421 en Piura (48 %) no tienen cobertura móvil garantizada. Es cobertura declarada por las operadoras, no medida en campo.
- **[VERIFICADO]** Hubo cortes de vía en Huancabamba y Ayabaca entre 2023 y 2026, y una antena caída en Pinchijaga en abril de 2023. Las fuentes están en `evidencia-casos-uso.md`.
- **[VERIFICADO]** INDECI ya tiene **EDAN Digital**, que captura offline y sincroniza con SINPAD «una vez restablecida la señal» (gob.pe, 17-sep-2026).
- **[NO VERIFICADO]** No sabemos si EDAN Digital transfiere fichas de un teléfono a otro. Si no lo hace, la ficha espera a que **el mismo teléfono** del evaluador encuentre señal.

## Usuario y tarea
| | |
|---|---|
| Usuario principal | Evaluador EDAN de una municipalidad distrital o provincial (Ayabaca, Huarmaca, Lancones, Huancabamba…) |
| Tarea urgente | Hacer llegar la Evaluación Rápida al COE o a la oficina de Defensa Civil dentro de las 2 a 4 horas |
| Usuario secundario | Portador: cualquier persona que salga de la zona (brigadista, mototaxista, docente) |
| Quién consume el dato | COE y Defensa Civil, que lo registran en SINPAD |

## ¿Por qué un QR si los vecinos pueden hablar?
Hablar transmite **urgencia**. El COE necesita **evidencia**: cuántos afectados hay, coordenadas, autor, hora y que el dato no haya sido alterado. Una llamada o un recado de boca en boca no se puede deduplicar ni auditar, y no tiene valor de declaración jurada.

El QR lleva el **registro estructurado completo**, sin errores de transcripción y sin depender de que haya red, y el servidor lo consolida **una sola vez** aunque lo lleven varias personas.

## Qué buscamos (MVP)
1. **Ficha de Evaluación Rápida reducida**, fiel al Anexo 01. La vía solo puede marcarse como «interrumpida» o «sin evaluar».
2. **Ficha firmada por el dispositivo**: si alguien la altera durante el relevo, el servidor la rechaza.
3. **Relevo por QR con acuse**: el evaluador sabe qué fichas ya salieron de la zona.
4. **Mapa de centros poblados sin ficha de evaluación**: el COE ve **dónde falta información**, no solo lo que llegó.
5. **Filtro de cobertura OSIPTEL**, para priorizar dónde el relevo hace más falta.

## Qué NO es
- No es un sistema de alerta temprana ni una fuente oficial.
- No está integrado con SINPAD ni con EDAN Digital, ni los reemplaza; es una capa complementaria de relevo.
- No hace empadronamiento familiar (Anexo 03), porque implica datos personales y DNI.
- No dice que una vía sea segura o transitable.
