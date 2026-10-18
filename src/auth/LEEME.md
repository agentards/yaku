# Acceso al Centro de monitoreo (nombre + PIN)

`sesion.ts` muestra la pantalla «Yaku 3D · Centro de monitoreo» antes de abrir el monitoreo
(escritorio sin `?vista`, o `?vista=portal|municipalidad|incidentes`). El poblador y `?vista=2d` siguen públicos.

- El operador escribe **su nombre** (queda en el historial de cada cambio de estado) y el **PIN municipal**.
- El PIN lo define el servidor con la variable `MUNI_PIN` (en Docker, en el `.env` junto al `docker-compose.yml`).
  Si falta, el servidor genera uno temporal y lo muestra en su consola al arrancar.
- Cada lectura o escritura protegida lleva la cabecera `x-muni-pin`; el servidor la valida siempre
  (`servidor-local/api.ts`). El PIN vive solo en la pestaña abierta: al recargar se vuelve a pedir.
- No depende de servicios externos: funciona igual sin internet en la sala de la municipalidad.

Contrato (`Sesion`, `exigirSesion`): `agentards/producto/plan-centro-monitoreo.md`.
