# Seguridad y límites

## Qué garantiza hoy
- Si cambia el contenido de un registro, cambia su id. El servidor lo recalcula y rechaza los registros manipulados.
- Los duplicados no se insertan dos veces.
- La app no hace ninguna petición a hosts externos cuando está sin red.
- No hay claves ni tokens en el repo; el binding de D1 y el de KV se configuran en Cloudflare.

## Qué agrega la firma (en construcción)
- Cada dispositivo genera una clave no exportable y firma cada ficha. Si alguien altera la ficha durante el relevo, la firma deja de ser válida y el servidor la rechaza.
- **No** demuestra quién es el evaluador; solo que la ficha no cambió desde que la firmó ese dispositivo.

## Límites conocidos
- La API de prueba es pública, sin autenticación ni límite de tasa.
- La cadena de custodia (los saltos entre teléfonos) no va firmada.
- Los datos personales se excluyen a propósito: la ficha guarda un alias del autor, no su DNI, y no hay empadronamiento familiar.

## Nunca afirmar
- Que un registro es una alerta oficial o que está verificado.
- Que una vía es segura o transitable.
- Que un centro poblado está «sin señal». Lo correcto es «sin cobertura garantizada según OSIPTEL».
- Que hay integración con SINPAD o con EDAN Digital.
