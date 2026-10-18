# Estrategia de la landing de yaku.lat

17-oct-2026. El copy vive en `src/landing/contenido.ts` y `plantilla.ts` lo convierte en HTML estático.

**Meta:** que un alcalde, una gerencia de gestión del riesgo o un centro de operaciones de emergencia regional entienda Yaku en 10 segundos y pida un piloto.

Fuentes de voz y cifras:
- `agentards/producto/` (PRODUCTO-v2, decision-confianza, descubrimiento/b2g y voz-municipio-confianza)
- `entregables/Yaku-Relay-propuesta-gobierno.pptx`
- `agentards/traccion/linkedin/posts-v2-cadena.md`

## Orden de secciones y por qué

| # | Sección | Qué pregunta del comprador responde | CTA (uno por sección) |
|---|---|---|---|
| 1 | Hero | ¿Qué es esto y para quién? Responde «Yaku es una cadena de apoyo vecinal…» en la primera frase. | Solicitar un piloto. El vecino tiene su propio camino. |
| 2 | El problema | ¿Es un problema real? Lo muestran 2 cifras, cada una con su fuente al lado. | ninguno |
| 3 | Cómo funciona | ¿Cómo llega el reporte sin señal? Lo cuenta la cadena en 5 pasos, con scroll. | ninguno |
| 4 | Lo que ve la municipalidad | ¿Qué gana mi equipo? Capturas reales del Centro de monitoreo. | Solicitar un piloto |
| 5 | Lo que ve el vecino | ¿Lo va a poder usar la gente? | Reportar un incidente |
| 6 | Gobiernos regionales | ¿Escala? ¿Choca con lo que ya tenemos? | Solicitar un piloto |
| 7 | Videos | ¿Cómo se ve? | ninguno |
| 8 | Confianza y datos | ¿Me meto en problemas legales? | ninguno |
| 9 | Preguntas | Responde las objeciones restantes. Es también la FAQPage. | ninguno |
| 10 | Cierre | Pasar a la acción antes de la próxima lluvia. | Solicitar un piloto, más el contacto escrito |

El comprador ve un solo pedido, «Solicitar un piloto». «Ingresar» queda solo en la navegación porque la página no es para conseguir registros.

## Objeciones de una municipalidad y cómo las responde la página

| Objeción | Dónde y cómo se responde |
|---|---|
| «Sin señal no sirve de nada» | Cadena, paso 3: basta que un celular de la cadena encuentre señal. En las Preguntas se aclara que solo hace falta internet la primera vez y que conviene difundir Yaku antes de las lluvias. |
| «Ya tenemos EDAN Digital y SINPAD» | Regional: «Complementa EDAN y SINPAD». En las Preguntas, validar en Yaku es una validación operativa; la EDAN, el SINPAD y la firma de la autoridad siguen su curso. No decimos que esas herramientas dejen de hacer algo. |
| «Nos van a llegar avisos falsos y quedaremos mal» | Nada se publica como oficial sin la municipalidad. Los reportes del mismo lugar se agrupan y muestran cuántos vecinos los respaldan. Se cita el art. 315-A del Código Penal. Nunca usamos «alerta»: decimos «reporte vecinal por validar». |
| «Datos personales» | No pedimos nombre ni DNI y aplicamos la proporcionalidad de la Ley 29733. Las fotos solo se ven con PIN municipal y el servidor puede ir en la red de la municipalidad. |
| «¿Sirve fuera de Piura?» | Regional: hoy están cargadas las capas de Piura y cada región suma su escenario vigente. |
| «¿Cuánto cuesta y con qué presupuesto?» | No damos precio. El alcance, los plazos y el costo se acuerdan con su equipo. El PP 0068 aparece solo como en el deck: si aplica, se confirma con el área de logística. |
| «¿Lo usa alguien?» | No mostramos clientes ni testimonios. Las capturas son reales y usan reportes de prueba, y la página lo dice. |

## SEO y GEO

- **Título** (55 caracteres): «Yaku: reportes vecinales sin señal para municipalidades».
- **Descripción** (152 caracteres): incluye El Niño, QR y municipalidad.
- **Canonical:** `https://yaku.lat/`. Open Graph de 1200×630.
- **JSON-LD** (`plantilla.ts`): `WebSite`, `SoftwareApplication` sin `offers` y `FAQPage`. La FAQPage sale solo de `PREGUNTAS`: 6 preguntas de 50 a 58 palabras, las mismas que se ven en la página.
- **GEO:**
  - la primera pregunta define la entidad («¿Qué es Yaku?»);
  - cada respuesta se lee sola y nombra las entidades (CENEPRED, SENAMHI, OSIPTEL, SINPAD, Ley 29733);
  - `public/llms.txt` resume la página, qué ofrece, el contacto y las páginas.

## Pendientes fuera de `contenido.ts`

1. **Jorge:** confirmar `piloto@yaku.lat` (TODO en `CONTACTO`) y el mismo dato en `public/llms.txt`.
2. **`plantilla.ts`:**
   - agregar `Organization` al `@graph`, solo con `name`, `url` y `email`, sin logo ni redes inventadas;
   - el `SoftwareApplication` se llama «Yaku Relay» y la página, «Yaku». Unificar en «Yaku».
3. **`robots.txt` y `sitemap.xml`** (revisión pendiente con ingeniero-producto):
   - agregar `Disallow: /app`, porque es la app técnica y duplica `app.html`;
   - `/reportar` está en el sitemap, pero `app.html` tiene el título «Yaku Relay · campo» y no tiene descripción ni canonical. Hay que darle título y descripción propios o sacar `/reportar` del sitemap;
   - agregar `<lastmod>2026-10-17</lastmod>`.
