# Demo presencial de 3 minutos — guion, ensayo y checklist (WP4)

Rama `feat/poblador-municipio`, todo en **localhost** (nada de Cloudflare, nada contra la base de producción).
Historia: `agentards/producto/plan-implementacion-local.md`. Textos: `agentards/producto/decision-confianza.md`
(«Reporte vecinal · por validar», «coinciden», nunca «confirmado» ni «alerta»).

## Quién hace qué
| Rol | Equipo | Pantalla |
|---|---|---|
| Narrador | — | Habla al jurado; no toca nada |
| Poblador **A** | Celular A (modo avión desde el inicio) | `URL/` (modo poblador, por defecto en celular) |
| Poblador **B** | Celular B (modo avión hasta el paso 4) | `URL/` |
| Operador municipal | Laptop + pantalla grande, Chrome en pantalla completa (F11) | `URL/?vista=municipalidad` |

`URL` = la dirección HTTPS del túnel (ver «HTTPS para los celulares»). La laptop puede usar `http://localhost:8080`.

## Guion (3:00)
| Tiempo | Paso | Qué se toca | Qué dice el narrador | Qué ve el jurado |
|---|---|---|---|---|
| 0:00–0:20 | Contexto | Nada. Pantalla grande con el mapa 3D de Piura | «Lluvias en Piura: la red cae primero donde más se necesita. Esta es la pantalla de la municipalidad, con el escenario de riesgo de CENEPRED.» | Mapa 3D con relieve y centros poblados CENEPRED |

> **Procedencia (pendiente WP3):** el ensayo no encuentra «Fuente …» en `?vista=municipalidad`; el chip
> «Fuente: CENEPRED/SIGRID 23077 · 16/10/2026» existe en `?vista=portal` (`src/vista3d/ui/fuente.ts`). Hasta que la
> pantalla municipal lo muestre, el narrador no debe decir «fuente y fecha en pantalla».
| 0:20–0:50 | **1 · A reporta sin red** | A: «Casa dañada o caída» → gravedad → nota corta → **Guardar** (sin foto) | «A está en modo avión. Toca un botón grande, el GPS marca dónde está y el reporte queda guardado en su celular.» | Chip **SIN RED**, tarjeta «Reporte vecinal · por validar» · «Guardado en tu celular» |
| 0:50–1:20 | **2 · Intercambiar** | A y B: **Intercambiar**, celulares frente a frente (cámara frontal, QR arriba) | «Nadie tiene internet. Juntan los celulares: en un solo paso cada uno lee el código del otro.» | Barra de progreso → «Listo» en los dos; B ahora «lleva» el reporte de A |
| 1:20–1:45 | **3 · B coincide** | B: «Casa dañada o caída» → **Foto** (tomarla) → Guardar | «B ve lo mismo a 40 metros y lo reporta con foto. Su celular ya sabe que dos vecinos coinciden.» | En B: «2 vecinos lo reportan · 1 foto» |
| 1:45–2:05 | **4 · B recupera red** | B: quitar modo avión. No tocar nada más | «B llega a donde hay señal. No tiene que hacer nada: se sincroniza solo, con la foto.» | Chip de red de B cambia; B sube los 2 reportes y la foto sin tocar nada |
| 2:05–2:30 | **5 · La municipalidad lo ve** | Nada (la pantalla reacciona sola) | «En la municipalidad el mapa vuela al punto. No son dos alertas: es **un** incidente con su respaldo: dos vecinos, una foto. Sigue siendo un reporte vecinal hasta que la municipalidad lo valide.» | Vuelo 3D, tarjeta «2 vecinos · 1 foto · primer reporte hh:mm», respaldo con desglose, foto en la galería |
| 2:30–2:55 | **6 · Valida y acciona** | Operador: **Validar** → nombre + PIN → **Bomberos**. B: «Actualizar estado». A y B: **Intercambiar** otra vez | «El operador valida con su PIN y asigna Bomberos. B lo recibe al sincronizar y se lo pasa a A por QR, que sigue sin red.» | En B y luego en A: «Bomberos asignados · Asignado por la municipalidad · hh:mm» |
| 2:55–3:00 | Cierre | — | «Yaku no reemplaza al 116 ni a SENAMHI: hace que lo que ven los vecinos llegue, sin duplicados, a quien puede actuar.» | — |

Notas del guion:
- **La foto la toma B, no A.** La foto no viaja por QR (solo la marca «con foto»); sube cuando el celular que la tomó recupera internet. Si la toma A, la pantalla mostrará «1 foto pendiente de subir» hasta que A tenga red.
- El estado dice «Bomberos **asignados**», no «en camino»: Yaku solo sabe que la municipalidad asignó la acción (desviación escrita en `src/poblador/LEEME.md`).
- Si el jurado pregunta por atrapados o heridos: al elegirlos sale primero «llama al 116 / 105» y el reporte se guarda igual.

## Ensayo automatizado (los 6 pasos, en local)
```bash
node scripts/ensayo-demo.mjs        # compila a una carpeta temporal y levanta servidor-local real (SQLite temporal)
```
Abre en Chrome 2 celulares Android 412×915 y la pantalla 1920×1080 de la municipalidad; hace exactamente el guion
(sin red con `setOffline`, cámara simulada que ve el QR del otro, Validar + «Bomberos» con clics y PIN) y deja
`results/ensayo-demo.json` con lo que tardó cada paso. Datos de prueba marcados **SIMULADO**.

Corridas del 17-oct (Lima): 20:24 **10/10** en 9,8 s y 20:28 **10/10** en 13,5 s de pasos automatizados
(intercambio 0,9–1,4 s; acuse por QR 1,2–3,3 s); 1 incidente «2 vecinos · 1 foto», respaldo 75 · N2; 2 filas en el
servidor tras sincronizar A y B (sin duplicados); 0 peticiones fuera de localhost. Una corrida anterior terminó con
Node caído (0xC0000409) sin salida, con la memoria virtual de Windows casi llena: si pasa, cierra otros procesos
pesados y repite.

Qué **no** cubre (va a la checklist manual): cámaras reales, arranque en frío sin red desde el service worker, GPS
real, el túnel HTTPS y el brillo/reflejo de las pantallas.

## Lectura del QR con cámara real (WP0, `src/scanner.ts`)
- BarcodeDetector si el equipo lo tiene (Android/Chrome), con jsQR de respaldo cada 3 cuadros; en iPhone, solo jsQR.
- jsQR ya no reduce el cuadro entero: prueba recortes centrales ampliados y reducidos (uno por cuadro, en rotación)
  y se queda en el que leyó. Cámara a 1280×720 con autofoco continuo.
- Bench con cuadros **SIMULADOS** (perspectiva, giro, desenfoque, reflejo, moiré, ruido; `results/qr-camara.md`):
  **114/120 lecturas** (antes 73/120). En Chrome con cámara falsa (`scripts/e2e-camara.ts`): QR animado de 20
  registros completo en 2,1 s (antes 3,4 s).
- Caso débil: QR v13 (fragmentos de 450 caracteres) visto a 1920×1080 con perspectiva fuerte, ~85 % por cuadro.
  Con fragmentos de 300 caracteres (v11) sube a ~95 %. **Recomendación para WP2**: `encodeForQR(recs, 300)` en
  Intercambiar (20 reportes = 4 QR en vez de 3).
- Pendiente: medirlo con 2 celulares reales (≥ 9/10 intentos) — ver checklist.

## HTTPS para los celulares
Los celulares necesitan **HTTPS** para la cámara y para el service worker (modo avión). Verificado en Chrome:
por `http://IP-de-la-laptop:8080` la página carga, pero `isSecureContext = false`, **sin cámara y sin service worker**.

### Ruta principal: ngrok (instalado, v3.3.1)
**Estado: BLOQUEADO** — ngrok no tiene authtoken en esta laptop (`ERR_NGROK_4018`). Lo hace Jorge, una vez:
1. Iniciar sesión en https://dashboard.ngrok.com/get-started/your-authtoken y ejecutar
   `ngrok config add-authtoken <token>` (queda en `%LOCALAPPDATA%\ngrok\ngrok.yml`, **fuera del repo**; nunca en `.env` del repo).
2. Opcional pero recomendado: reclamar el dominio fijo gratis (Dashboard › Domains) para que la URL no cambie.
3. Si ngrok pide actualizar el agente: `ngrok update`.

Prueba y arranque (el script no lee ni imprime el token):
```bash
npm run build
node scripts/https-ngrok.mjs                                   # prueba por el túnel y cierra → results/https-ngrok.json
MANTENER=1 NGROK_DOMAIN=<dominio>.ngrok-free.app MUNI_PIN=<pin> node scripts/https-ngrok.mjs   # para la demo
```
Comprueba por el túnel `/salud`, la PWA, `sw.js`, `manifest.webmanifest`, `/api/stats` y, en Chrome móvil, contexto
seguro + cámara + service worker; imprime la URL y un QR en la terminal. La cuenta gratis muestra un aviso de ngrok
la primera vez: en cada celular tocar **«Visit Site»** antes de instalar.

### Plan B: misma red Wi-Fi + bandera de Chrome (solo Android) — verificado
1. `npm run servidor` (ya escucha en `0.0.0.0`, o sea en la LAN; si Windows pregunta, permitir Node en red **privada**).
2. En cada Android: `chrome://flags/#unsafely-treat-insecure-origin-as-secure` → agregar `http://IP-de-la-laptop:8080` → Relaunch.
3. Abrir `http://IP-de-la-laptop:8080/`. Con la bandera, Chrome la trata como segura: **cámara y service worker
   funcionan** (probado en Chrome de escritorio con la misma bandera: `isSecureContext`, cámara y SW = true).
- Sin internet en el local: usar el hotspot del celular B o de la laptop como red (no hace falta salida a internet).
- iPhone no tiene esa bandera: con plan B, iPhone solo como pantalla, no como poblador.

### Plan C: sin HTTPS
Cargar la página con red **y no recargarla**: sin service worker, el modo avión funciona solo mientras la pestaña
siga abierta. Si la cámara no está disponible, usar **«Leer código desde una foto»** (foto del QR del otro con la
cámara del sistema; `<input capture>` no necesita HTTPS). Más lento: ensayarlo.

## Checklist de la demo
**La noche anterior**
- [ ] `git pull` en `feat/poblador-municipio`; `npm run build`; `npx vitest run`; `node scripts/ensayo-demo.mjs` → 10/10.
- [ ] `node ../agentards/scripts/check-secrets.mjs` (con `SECRETS_DIR=../agentards`) → «OK» (17-oct: OK, 84 commits).
- [ ] Ruta HTTPS lista: ngrok con authtoken y `node scripts/https-ngrok.mjs` en verde, o plan B probado en los 2 Android.
- [ ] Procedencia: `results/ensayo-demo.json › procedenciaMunicipalidad` no es `null` (17-oct: `null`, pendiente WP3).
- [ ] Prueba real de QR con los 2 celulares: 10 intercambios, anotar cuántos completan y en cuántos segundos (meta ≥ 9/10). Modelo, SO y navegador de cada uno.

**30 minutos antes**
- [ ] Base limpia para la demo: `YAKU_DATOS=servidor-local/datos-demo MUNI_PIN=<pin> npm run servidor` (carpeta nueva = 0 reportes).
- [ ] Laptop: `URL/?vista=municipalidad` en pantalla completa; mapa 3D cargado; PIN a mano; sonido como se quiera.
- [ ] Cada celular, **con red**: abrir `URL/`, aceptar el aviso de datos, **permitir ubicación y cámara** (el permiso se pide con red, antes del modo avión), instalar («Agregar a pantalla de inicio») y abrir el ícono instalado.
- [ ] Hacer un intercambio de prueba y borrar sus datos (Ajustes del sitio › Borrar datos) o usar otra carpeta de datos del servidor.
- [ ] Brillo al máximo, bloqueo automático apagado, ahorro de batería apagado, no molestar activado.
- [ ] Modo avión en A y B **y Wi-Fi apagado**; cerrar y reabrir la app: debe abrir sin red con el chip «SIN RED».

**Durante**
- [ ] Si el QR no lee en 10 s: alejar un poco (20–30 cm), inclinar para quitar el reflejo, o ⟲ para cambiar de cámara. Si la cámara no arranca, la app ofrece «Leer código desde una foto».
- [ ] Si la pantalla grande no reacciona en 15 s tras el paso 4: en B tocar «Actualizar estado» (fuerza la sincronización).
- [ ] Si el GPS no responde: la app usa la última ubicación (o el centro de Piura marcado «sin GPS»); seguir.

## Comandos útiles
```bash
npx vitest run tests/scanner.test.ts            # WP0: lectura QR con cuadros simulados (≥ 9/10)
npx vite-node scripts/qr-camara-bench.ts 20     # bench ampliado → results/qr-camara.md
npx vite build && npx vite-node scripts/e2e-camara.ts   # cámara falsa en Chrome → results/e2e-camara.json
node scripts/ensayo-demo.mjs                    # los 6 pasos → results/ensayo-demo.json
node scripts/https-ngrok.mjs                    # túnel HTTPS → results/https-ngrok.json
```
