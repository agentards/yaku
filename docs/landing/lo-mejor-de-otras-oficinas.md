# Lo mejor de otras oficinas, aplicado a yaku.lat

Lectura del 17-oct-2026. Fuentes solo leídas, no copiadas, salvo las fuentes tipográficas OFL y la fórmula de contraste WCAG.

## 1. ZeroSlop: evitar el look «hecho por IA»
Fuentes: `workspace/zeroslop/.claude/agents/ux-ui-designer.md`, `workspace/zeroslop/diseno/design-system.md` y `diseno/tokens.css`.
- **Tokens compactos.** Entre 4 y 6 colores, cada uno con nombre y con su ratio de contraste anotado. Está prohibido el par crema `#F4F1EA` + terracota `#D97757`.
- **Una metáfora rectora.** En ZeroSlop el producto es «instrumento, no scoreboard». En Yaku es **la cadena**: un punto de agua que viaja de celular en celular.
- **Una sola idea audaz.** ZeroSlop gasta toda la audacia en la revelación del score (unos 900 ms, `expo-out`) y deja el resto de la página sobrio.
- **Un solo color de señal.** Ningún valor se expresa con semáforo rojo/verde.
- **Reduced motion.** Basta un fundido corto, y el foco tiene que verse siempre (`:focus-visible`).

**En yaku.lat:**
- La página es de noche y con lluvia, nunca crema. Hay 6 tokens `--yaku-*` en `src/landing/estilos.css`.
- **agua** es el único color de señal y representa el reporte que viaja. **barro** es el color de la respuesta y de los botones.
- La cadena por scroll es el único momento audaz. Todo lo demás son fundidos breves.

## 2. Tomo Legal: identidad derivada y contraste con script
Fuentes: `D:/tomo-legal/diseno/contraste.mjs` (34 líneas, Node sin dependencias) y `D:/tomo-legal/marca/identidad.md`.
- Un script lee los tokens del CSS, calcula el ratio WCAG de cada par texto/fondo declarado y falla si alguno queda bajo el mínimo: 4,5 para texto, 3 para foco y bordes.
- La identidad se deriva del producto existente en dos columnas, «qué tomamos» y «qué cambia».
- Los estados siempre llevan texto, nunca solo color.

**En yaku.lat:**
- Usamos `scripts/contraste-landing.mjs`, con la misma fórmula, sobre los tokens `--yaku-*`. Escribe `docs/landing/contraste.md` y sale con código distinto de 0 si algún par falla.
- **Qué tomamos de la app:** el naranja de los botones del modo vecino, convertido en *barro*, y la gota de la marca.
- **Qué cambia:** la app es clara porque se usa a pleno sol; la landing es de noche y con lluvia, el momento en que la cadena hace falta.

## 3. System Design Web: CRO B2B
Fuentes: `la-oficina/skills/ux-cro-b2b-whatsapp/SKILL.md` y `la-oficina/skills/copy-b2b-seo-geo/SKILL.md`. La carpeta `workspace/system-design-web` solo tiene `CONTEXTO.md`; el proyecto vive en F:, que no existe en esta máquina.
- Que se entienda en 5 segundos.
- Un CTA primario por sección (dos solo en el hero) y un CTA final.
- CTA del hero de 52 px; objetivos táctiles de al menos 44 px.
- LCP por debajo de 2,5 s y CLS por debajo de 0,1.
- Copy sin hype: definiciones del tipo «Yaku es…», entidades con nombre (CENEPRED, OSIPTEL, SINPAD).
- Un dato faltante se marca `[PENDIENTE]` en vez de inventarse.

**En yaku.lat:**
- **Orden de secciones:** hero → problema con fuente → la cadena → lo que ve la municipalidad → gobiernos regionales → videos → confianza y datos → preguntas → CTA final.
- El comprador ve un solo CTA, «Solicitar un piloto».
- El vecino tiene su propio camino, «Reportar un incidente» → `/reportar`.
- «Ingresar» solo aparece en la navegación.

## 4. Chakaruna: SEO y GEO
Fuentes: `D:/chakaruna-web/web/lib/seo.ts`, `D:/chakaruna-web/seo/plan.md` y `web/public/llms.txt`.
- Canonical absoluto, Open Graph de 1200×630 y Twitter `summary_large_image`.
- JSON-LD en un `@graph`. `FAQPage` solo si las preguntas se ven en la página.
- Nunca `Review` ni `AggregateRating` inventados. Sin `offers` mientras no haya precio confirmado.
- **GEO:** la entidad se explica en el primer párrafo, cada párrafo responde una pregunta, y el contenido está en el HTML sin depender de JS.

**En yaku.lat:**
- `src/landing/plugin.ts` escribe el cuerpo, las meta y el JSON-LD dentro de `index.html` al compilar, a partir de `src/landing/contenido.ts`. Así la página llega completa sin JS.
- El JSON-LD lleva `WebSite`, `SoftwareApplication` sin `offers` y `FAQPage` con las mismas preguntas visibles.

## 5. Fuentes tipográficas (autoalojadas, sin CDN)
Son subsets latin (cubren tildes, ñ, ¿ y ¡) tomados del build de ZeroSlop (`zeroslop-app/.next/static/media`). Las tres tienen licencia SIL Open Font License 1.1 (Google Fonts).

| Archivo en `src/landing/fuentes/` | Familia | Uso |
|---|---|---|
| `space-grotesk-latin-500.woff2` (13 KB) | Space Grotesk 500 | titulares |
| `inter-latin-var.woff2` (48 KB) | Inter variable | texto |
| `jetbrains-mono-latin-var.woff2` (40 KB) | JetBrains Mono variable | etiquetas, cifras, fuentes |

## Reglas que seguimos
1. 6 tokens con nombre y contraste comprobado con script.
2. Prohibidos el crema + terracota y el semáforo.
3. Una sola idea audaz: la cadena por scroll.
4. `prefers-reduced-motion` apaga Lenis, el scrub, los videos de fondo y los conteos. Todo queda visible y estático.
5. Sin JS, la página se lee completa: es HTML estático generado.
6. LCP: el hero pinta un póster webp con `fetchpriority="high"`; el video llega después del `load` y nunca con datos ahorrados.
7. Un CTA primario por sección.
8. Cifras solo con fuente visible al lado.
9. Nunca «alerta»: se dice «reporte vecinal por validar».
10. Todo lo hecho con IA lleva la etiqueta «Imagen generada con IA» o «Voz e imágenes generadas con IA».
11. Nada de precios, clientes, testimonios, enlaces al repositorio ni nombre del equipo.
