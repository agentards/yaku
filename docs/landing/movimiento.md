# Movimiento de la landing (yaku.lat)

Principios para quien implementa con GSAP (`src/landing/main.ts`, `src/landing/cadena.ts`) y CSS (`src/landing/estilos.css`).
La figura vive en `src/landing/svg.ts`.

## La idea audaz (una sola)

**El scroll es la señal.** El reporte no viaja solo: lo empuja el pulgar de quien lee. Si dejas de bajar, el reporte se
queda quieto en el celular donde está, igual que en la vida real cuando nadie pasa con otro celular. Por eso:

- Lo único que se mueve por su cuenta en toda la página es la entrada del hero (una vez) y los revelados (una vez).
- Todo lo demás de la cadena va atado al scroll (`scrub`), no a un reloj. Nada en bucle: la lluvia está quieta, los
  halos no laten, no hay parallax en los fondos.
- **Agua (`--yaku-agua`) es lo único que avanza**: el camino de ida y el pulso. **Barro (`--yaku-barro`) solo aparece en
  el paso 5**, cuando la municipalidad responde: anillo, cuentas de la vuelta e insignia «Bomberos asignados».
  Si algo en barro se mueve antes del paso 5, está mal.

## Easing y duraciones

Un solo easing para todo lo que entra o cambia de estado: **expo-out**, arranca rápido y asienta lento.

| Token CSS | Valor | GSAP | Para qué |
|---|---|---|---|
| `--ease-expo` | `cubic-bezier(.16, 1, .3, 1)` | `'expo.out'` | entradas, revelados, estados de la cadena, hover |
| `--dur-corta` | 0,2 s | `0.2` | hover, foco, press del botón (`scale(.98)`) |
| `--dur-media` | 0,5 s | `0.5` | halos, insignias, señal de Vecino C, paso activo |
| `--dur-larga` | 0,9 s | `0.9` | entrada del hero, anillo de la municipalidad |

Ya implementado y dentro de la regla: hero `y: 28 → 0`, 0,9 s, stagger 0,08 · revelados `y: 18 → 0` + opacidad, 0,7 s,
stagger 0,08 · conteo de cifras 1,4 s (la única duración larga: un número que sube muy rápido no se lee).

Dos excepciones, ambas a propósito:

1. **El scrub de la cadena usa `ease: 'none'` con `scrub: 0.6`.** El easing lo pone la mano de quien lee; el 0,6 solo
   suaviza la rueda del mouse.
2. **Entre dos celulares el pulso usa `power2.inOut`** (en `cadena.ts`): sale despacio, cruza, y *aterriza* en el
   celular. Es el único inOut de la página; no copiarlo a otros elementos.

## Cuánto se mueve

- Desplazamiento máximo: 28 px (hero). Revelados: 18 px. Nada se desplaza en horizontal salvo el pulso.
- Escala: solo el press del botón (0,98). Sin rotaciones, sin rebote, sin `elastic`/`back`, sin parpadeos.
- Opacidad de los pasos no activos: 0,32 (siguen legibles para quien escanea).

## Qué se mueve en cada paso (`.cadena-figura[data-paso]`)

| Paso | Texto | Lo que cambia en la figura | Cómo |
|---|---|---|---|
| 1 | El reporte nace | aparece el pulso en `#n1`; halo de `#n1`; `#sin-senal` visible | opacidad, `--dur-media` |
| 2 | Pasa por QR | `#camino-ida` se dibuja de `#n1` a `#n2`; el pulso viaja | scrub (stroke-dashoffset) |
| 3 | Vecino C encuentra señal | ida hasta `#n3`; `#sin-senal` se apaga; los dos arcos de `#senal-c` se **dibujan** (el segundo 80 ms después); la lluvia baja a 0,08 | dashoffset con `pathLength="1"`, expo-out |
| 4 | Llega agrupado | ida hasta `#n4`; halo de la municipalidad; `#insignia-grupo` «2 vecinos · por validar» | opacidad |
| 5 | La respuesta vuelve | `#muni-anillo` se dibuja en barro (0,9 s); `#camino-vuelta` descubre `#camino-vuelta-cuentas` de la municipalidad a la vecina A; `#pulso-vuelta`; `#insignia-resp` | scrub + dashoffset |

Por qué la vuelta son cuentas: antes la línea de barro iba encima de la de agua y las dos se mezclaban en un beige que no
se leía como respuesta. Ahora `#camino-vuelta` vive dentro de `<mask id="m-vuelta">` y descubre una fila de cuentas de
barro (5 px cada 12 px) sobre el mismo camino: se ve que la respuesta usa *la misma cadena* sin tapar la ida.
`cadena.ts` no cambió: sigue moviendo `stroke-dashoffset` de `.camino-vuelta`.

## Contrato de ids (no renombrar)

`cadena.ts` y el CSS dependen de: `n1`–`n4`, `camino-ida`, `camino-vuelta`, clases `pulso-ida`, `pulso-ida-n`,
`pulso-vuelta`, `pulso-vuelta-n`, `insignia-grupo`, `insignia-resp`. Los mismos nombres existen ahora también como id,
más `lluvia`, `sin-senal`, `senal-c`, `muni-anillo` y `camino-vuelta-cuentas`, para animarlos con
`gsap.to('#muni-anillo', …)` si algún día se pasan del CSS a una línea de tiempo.

Trazos pensados para `stroke-dashoffset`: `#camino-ida` y `#camino-vuelta` (los mide `cadena.ts` con
`getTotalLength`); `#senal-c path` (`pathLength="1"`, usar `stroke-dasharray: 1 2`); `#muni-anillo`
(`pathLength="100"`, empieza arriba por `rotate(-90)`).

## Qué apaga `prefers-reduced-motion`

`main.ts` no pone la clase `.mov`, y todo el CSS de movimiento cuelga de `.mov`. Con reduced-motion:

- **Sin Lenis** (scroll nativo), **sin scrub**, **sin pulsos**, **sin entrada del hero**, **sin revelados**, **sin conteo**
  (las cifras ya vienen con su valor en el HTML) y **sin videos de fondo** (quedan los pósters).
- La figura queda en su **estado final** (`data-paso="5"` viene del HTML): camino de ida completo, cuentas de la vuelta,
  anillo, señal, las dos insignias. Ninguna información depende del movimiento: los cinco pasos se leen igual.
- Las transiciones que quedan (hover, foco) se acortan a 0,12 s por la regla global de `estilos.css`.
- Sin JS pasa exactamente lo mismo: la página es estática y completa.

## og:image

`public/landing/og-cadena.jpg` (1200×630, ~56 KB) es la misma figura en su estado final, con la marca y el dominio,
dibujada desde `svg.ts` con las fuentes de la landing: **sin imágenes ni texto generados con IA**. Se regenera con
`node scripts/og-landing.mjs` (usa el Chrome instalado; no levanta servidor). El nombre cambió de `og.jpg` a
`og-cadena.jpg` para que las redes no sirvan la vieja captura desde su caché.

## Cómo comprobar

```
node scripts/contraste-landing.mjs        # AA de los 6 tokens --yaku-*
node scripts/e2e-landing.mjs --build      # puerto 4191; escritorio 1440 y celular 390, con y sin reduced-motion
```
