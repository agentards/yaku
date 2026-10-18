# Imágenes generadas con IA de la landing

Imágenes de ambiente para la galería de https://yaku.lat/ (`IMAGENES_IA` en `src/landing/contenido.ts`). La galería pinta cada una con la etiqueta «Imagen generada con IA». **No son fotos reales** de Piura ni de ningún evento: nunca se presentan como registro de un desastre.

- Generador: xAI Grok Imagine, modelo `grok-imagine-image-2.0`, `POST https://api.x.ai/v1/images/generations`, `aspect_ratio 3:4`, `resolution 1k`, `n 1`, `response_format b64_json`.
- Fecha: 17-oct-2026 (noche, Lima). Generado por el agente grok-video-yaku (La Oficina).
- Costo: US$0,04 por imagen (`usage.cost_in_usd_ticks` = 400 000 000; 1 USD = 10^10 ticks). 6 imágenes = **US$0,24**, sin repeticiones.
- Salida cruda 864×1152 JPEG → recorte central 4:5 (la galería usa `aspect-ratio: 4/5`) → WebP calidad 78 con ffmpeg (`-c:v libwebp -quality 78 -compression_level 6`). Resultado 864×1080, 50–75 KB cada una (tope 250 KB).
- Reglas que siguen los prompts: sin texto, letras, números ni logos; sin uniformes, escudos ni marcas; personas de espaldas o en sombra (no identificables); sin víctimas ni casas destruidas. Revisadas a ojo una por una: cumplen.
- Estilo común: foto documental sobria, noche y lluvia, luz fría azul verdosa con un solo punto cálido naranja (calza con los tokens `--yaku-agua` y `--yaku-barro`).

| Archivo | Uso sugerido | KB |
|---|---|---|
| `public/landing/img/ia-vecinos-lluvia.webp` | Portada de la galería; problema (el vecino con el reporte y sin señal). | 68 |
| `public/landing/img/ia-manos-qr.webp` | Junto a «el reporte pasa de celular a celular por QR». El QR es decorativo: no decodifica. | 54 |
| `public/landing/img/ia-sala-municipal.webp` | Junto a la sección de municipalidades/gobiernos regionales. Sin uniformes ni escudos. | 49 |
| `public/landing/img/ia-caserio-noche.webp` | Variante de ambiente: el mundo de Yaku (adobe, calamina, noche). | 65 |
| `public/landing/img/ia-rio-crecido.webp` | Variante: contexto de crecida. No mostrar como registro real de un evento. | 73 |
| `public/landing/img/ia-calle-anegada.webp` | Variante: vecino con el celular en la calle anegada. | 69 |

## Prompts (literales)

### ia-vecinos-lluvia.webp

- Modelo: `grok-imagine-image-2.0` · 3:4 · 1k · costo US$0.04 · 2026-10-18T03:33:04.137Z

```text
Documentary photograph at night in a small rural village in northern Peru (Piura region): two neighbors seen from behind and in profile, faces in shadow and not identifiable, standing under the eave of an adobe house with a corrugated metal roof, heavy rain falling, one of them holds a smartphone whose screen glow lights their hands in cold cyan light, muddy dirt street with puddles reflecting a single warm orange bulb. Cold blue-teal night palette, deep shadows, subtle film grain, 35mm lens, sober and respectful mood. No text, no letters, no logos, no signs, no uniforms, no brand names.
```

### ia-manos-qr.webp

- Modelo: `grok-imagine-image-2.0` · 3:4 · 1k · costo US$0.04 · 2026-10-18T03:33:25.280Z

```text
Close-up documentary photograph at night: two pairs of hands holding two smartphones face to face, one phone screen shows a plain black-and-white QR-style square pattern with no words, the other phone screen shows a camera viewfinder pointed at it, raindrops on the screens and on the wet sleeves of rain jackets, background is a blurred adobe wall and corrugated metal roof edge with rain streaks, cold cyan light from the screens, a faint warm orange light far behind. Shallow depth of field, 50mm lens, film grain. No text, no letters, no numbers, no logos, no app interface text, no brand names, no faces.
```

### ia-sala-municipal.webp

- Modelo: `grok-imagine-image-2.0` · 3:4 · 1k · costo US$0.04 · 2026-10-18T03:33:39.567Z

```text
Documentary photograph of a modest municipal operations room in a provincial town in northern Peru at night: three people in plain civilian clothes seen from behind, faces not visible, standing around a table looking at a large wall screen showing a dark topographic map of a river valley with a few small glowing cyan dots and one warm orange dot, rain on the dark window to the side, cold fluorescent light, cables and a thermos on the table, simple painted walls. Sober and calm mood, muted blue-teal palette, 28mm lens, film grain. No text, no letters, no labels on the map, no logos, no flags, no uniforms, no badges, no brand names.
```

### ia-caserio-noche.webp

- Modelo: `grok-imagine-image-2.0` · 3:4 · 1k · costo US$0.04 · 2026-10-18T03:33:54.399Z

```text
Wide documentary photograph at night of a small rural hamlet in northern Peru: a row of low adobe houses with corrugated metal roofs along a muddy dirt road, heavy rain visible as streaks in the light of a single warm orange bulb over a doorway, power poles with no lights, puddles reflecting the cold blue sky, distant dark hills, carob trees (algarrobo) silhouettes. Cold blue-teal night palette, deep shadows, sober and quiet mood, 24mm lens, film grain. No people, no text, no letters, no signs, no logos, no brand names.
```

### ia-rio-crecido.webp

- Modelo: `grok-imagine-image-2.0` · 3:4 · 1k · costo US$0.04 · 2026-10-18T03:34:05.174Z

```text
Documentary photograph at dusk turning to night of a swollen brown river in the dry coastal valley of northern Peru (Piura) running high next to a small village of adobe houses with corrugated metal roofs, rain falling, muddy water close to the banks, carob trees bending, a single warm orange light in a distant window, cold blue-grey overcast sky. Wide 24mm lens, sober and respectful mood, muted teal palette, film grain. No people, no text, no letters, no signs, no logos, no brand names, no disaster victims, no destroyed houses.
```

### ia-calle-anegada.webp

- Modelo: `grok-imagine-image-2.0` · 3:4 · 1k · costo US$0.04 · 2026-10-18T03:34:18.419Z

```text
Documentary photograph at night, low angle, of a flooded dirt street in a village of adobe houses with corrugated metal roofs in northern Peru, ankle-deep rainwater with rain ripples, a lone person far away seen from behind wearing a rain poncho and holding up a smartphone whose small screen glows cyan, a warm orange doorway light reflected on the water, cold blue-teal palette, deep shadows, 35mm lens, film grain, sober mood. No text, no letters, no signs, no logos, no uniforms, no brand names, no identifiable faces.
```
