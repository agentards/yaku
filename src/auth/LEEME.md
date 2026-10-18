# Acceso al Centro de monitoreo (Clerk o PIN)

`sesion.ts` muestra la pantalla «Yaku 3D · Centro de monitoreo» antes de abrir el monitoreo
(escritorio sin `?vista`, o `?vista=portal|municipalidad|incidentes`). El poblador y `?vista=2d` siguen públicos.

- **Con clave de Clerk** → formulario de Clerk en español dentro de la pantalla. Cada llamada protegida lleva
  `authorization: Bearer <jwt>` (token vigente pedido en cada `cabeceras()`).
- **Sin clave** → «Acceso con PIN (sin Clerk)»: nombre + PIN municipal (`MUNI_PIN` del servidor). Plan B sin internet.
  El PIN vive solo en la pestaña abierta; al recargar se vuelve a pedir.

Clerk se carga solo si hay clave (import dinámico, ~600 kB gzip, fuera del precache): el poblador no lo descarga.

## Pasos para Jorge (una vez, ~10 min)

1. Entra a <https://dashboard.clerk.com> → **Create application** → nombre **Yaku Relay**. Deja *Email* como
   método de acceso (puedes añadir Google). La app nace en modo **Development**: basta para la demo.
2. **Configure → API keys**: copia la **Publishable key** (`pk_test_…`). La *Secret key* no hace falta.
3. En la raíz del repo crea `.env.local` (está en `.gitignore`; no se sube) a partir de `.env.example`:
   ```
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_…
   ```
   Vite incrusta la clave al compilar: `npm run build`. El servidor verifica los tokens con esa misma clave pública:
   `PORT=8790 node --env-file-if-exists=.env.local servidor-local/servidor.ts` (ver `servidor-local/README.md`).
4. **Configure → Restrictions → Sign-up mode: Restricted**. Así nadie se registra solo.
5. **Users → Invite** (o *Invitations*): invita a los correos del personal municipal. Cada uno recibe el enlace,
   pone su contraseña y ya puede entrar.
6. *(Opcional) Roles*: en **Users → (usuario) → Metadata → Public** pon `{"rol": "monitor"}` para quien solo mira
   (u `"operador"` para quien cambia estados). Luego **Configure → Sessions → Customize session token**:
   ```json
   { "rol": "{{user.public_metadata.rol}}" }
   ```
   Sin ese claim, toda sesión válida opera.

## Cómo verlo en local

- Sin clave (PIN): `npm run build`, luego `PORT=8790 MUNI_PIN=1234 node servidor-local/servidor.ts` y abre
  `http://localhost:8790/?vista=portal` (en Windows el 8080 lo ocupa otro servicio: usa otro puerto).
- Con clave: igual, tras crear `.env.local`. Necesita internet: Clerk sirve el formulario desde el Frontend API de
  tu instancia (`*.clerk.accounts.dev`), el único origen externo que se carga.
- Si Clerk no responde (sin red), la pantalla lo dice y ofrece el PIN; con Clerk activo el servidor solo lo acepta
  si arrancó con `YAKU_PERMITIR_PIN=1`.

## Para las pantallas

```ts
import { sesionActual } from '../auth/sesion';
const s = sesionActual();               // null antes del acceso
fetch('/api/incidentes', { headers: await s!.cabeceras() });
s!.montarBotonUsuario(elCabecera);       // UserButton de Clerk o chip «PIN · Salir»
if (s!.rol === 'monitor') { /* sin botones de acción */ }
```

Pruebas: `tests/auth-sesion.test.ts` (modo PIN, clave, Frontend API, rol) y `tests/auth-rutas.test.ts` (rutas).
