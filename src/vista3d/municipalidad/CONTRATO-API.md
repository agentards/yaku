# Contrato que espera la pantalla de la municipalidad (WP3 ↔ WP1 `servidor-local/`)

Todo es **mismo origen** (`/api/...`). La lectura es tolerante (`incidentes.ts › leerIncidente`): acepta los nombres
alternativos entre paréntesis, horas en segundos, milisegundos o ISO 8601.

## `GET /api/incidentes`
```jsonc
{ "incidentes": [{
  "id": "inc-3f9a…",                 // estable mientras el grupo exista
  "tipo": "vivienda",                // principal (type); "tipos": ["vivienda","heridos"] opcional
  "lat": -5.19, "lon": -80.63,       // centro del grupo (lng)
  "severidad": 3,                    // máxima del grupo, 1–3 (severity)
  "personas": 4,                     // device_id distintos (personas_distintas)
  "n_reportes": 5,                   // reportes crudos (o "reportes_ids": [...])
  "fotos": ["foto-id-1", "foto-id-2"], // ids para GET /api/fotos/:id (foto_ids); "n_fotos" si faltan por subir
  "primer_reporte": 1760753000000,   // reloj del celular (primer_ts); "ultimo_reporte" (ultimo_ts)
  "recibido": 1760753100000,         // última llegada al servidor (received_at); opcional
  "puntaje": 65,                     // 0–100 (confianza|score); si falta, la pantalla usa el provisional de textos.ts
  "estado": "nuevo",                 // nuevo | en_revision | validado | descartado | accion_asignada | atendido
  "accion": null,                    // rescate | bomberos | provisiones | maquinaria | edan
  "motivo": "",                      // si descartado
  "historial": [{ "estado": "validado", "accion": null, "motivo": "", "quien": "Ana", "cuando": 1760753200000 }],
  "reportes_ids": ["r1", "r2"],      // opcional: si el servidor re-agrupa y cambia el id, no se anuncia como nuevo
  "notas": ["el agua llega a la rodilla"]
}]}
```
También acepta un arreglo plano. Si responde **404** (servidor de producción actual), la pantalla agrupa
`GET /api/reports?limit=200` por su cuenta (`incidentes.ts › agrupar`, reglas de `requisitos-poblador-municipio.md` §2)
y desactiva las acciones (solo lectura).

## `POST /api/incidentes/:id/estado`
Cabecera `X-Muni-Pin: <MUNI_PIN>`; cuerpo `{ "estado": "validado", "accion"?: "bomberos", "motivo"?: "…", "quien": "Ana" }`.
- `401`/`403` → la pantalla dice «PIN incorrecto» y lo vuelve a pedir (el PIN vive solo en memoria de la pestaña).
- La pantalla recorre el flujo **paso a paso** (`pasosHasta`): «Validar» desde `nuevo` envía `en_revision` y luego
  `validado`, así funciona con un servidor estricto. Cambiar la acción ya asignada = `accion_asignada` otra vez.
- Flujo: `nuevo → en_revision → validado | descartado`; `validado → accion_asignada | descartado`;
  `accion_asignada → accion_asignada (cambio) | atendido`; `descartado → en_revision` (reabrir).

## `GET /api/fotos/:id`
Imagen (JPEG/WebP). Si falla, la miniatura dice «Foto aún no disponible» (la foto sube cuando el celular que la
tomó tiene internet; el QR solo lleva la marca «tiene foto»).

## Proxy en `vite dev` / `vite preview`
`/api` → `http://localhost:8080` (o `YAKU_API_LOCAL`). Producción solo con `YAKU_API=produccion` y en **solo lectura**.
