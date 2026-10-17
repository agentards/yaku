# Mapa base de Piura — licencia y atribución

**Archivo principal:** `piura_basemap.pmtiles` (PMTiles v3, teselas vectoriales MVT, gzip), zoom 0–12, 5 740 095 bytes.
Variantes más livianas: `piura_basemap_z11.pmtiles` (z0–11, 2 594 101 B) y `piura_basemap_z10.pmtiles` (z0–10, 1 533 557 B).

## Fuente
- **Protomaps Basemap**, build diario **20261017** (versión del tileset 4.15.2, planetiler 0.10.2,
  replicación OSM hasta 2026-10-17T04:00:00Z, subido 2026-10-17T09:04:02Z = 04:04 hora de Lima).
- URL: https://build.protomaps.com/20261017.pmtiles (listado: https://maps.protomaps.com/builds/ ;
  metadatos: https://build-metadata.protomaps.dev/builds.json ; b3sum del planeta completo:
  93f9c4ab37a35ab7e83e1585c593e5dbf987cef4e18ad7881eb5dd64281fb590).
- Extracción: `pmtiles extract https://build.protomaps.com/20261017.pmtiles piura_basemap.pmtiles --bbox=-81.43,-6.48,-79.11,-3.98 --maxzoom=12`
  con go-pmtiles 1.31.2.
- bbox = límite departamental de Piura (INDECI, `piura_minimo.geojson`, capa `limite_departamental`:
  -81.328, -6.372, -79.210, -4.083) + margen de 0.1°, redondeado hacia afuera.
- Doc de descargas: https://docs.protomaps.com/basemaps/downloads (pide no hacer hotlink y copiar el tileset
  a almacenamiento propio — por eso se sirve desde la propia app).

## Licencia de los datos (teselas)
- Datos **© OpenStreetMap contributors**, bajo la **Open Database License (ODbL) 1.0** —
  https://www.openstreetmap.org/copyright . El tileset es un *Produced Work* de OpenStreetMap
  (https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline).
- Polígonos de agua/tierra de osmdata.openstreetmap.de (también ODbL). Incluye datos de Natural Earth
  (dominio público, no requiere atribución). Ver https://github.com/protomaps/basemaps/blob/main/LICENSE_DATA.md

## Atribución obligatoria (visible en el mapa)
Según el README de protomaps/basemaps, las apps web/nativas que usan este tileset **deben mostrar
visiblemente "© OpenStreetMap"**, p. ej. en la esquina del mapa. En MapLibre, poner en el `source`:

```js
attribution: '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
```
y no ocultar el `AttributionControl` (también en modo offline). El crédito a Protomaps es solicitado, no obligatorio.

## Licencia del estilo, esquema y código de Protomaps (verificado en https://github.com/protomaps/basemaps, README "Licensing and Attribution Guidelines" y LICENSE.md)
- **Código** (incluye el paquete npm `@protomaps/basemaps`): **BSD 3-Clause** (© 2019-2023 Protomaps LLC, Kelso Cartography). Conservar los avisos de licencia en el código derivado.
- **Diseño visual de los estilos**: **CC0** (Geraldine Sarmiento para Protomaps LLC) — https://creativecommons.org/publicdomain/zero/1.0/
- **Esquema de capas/tags**: adaptado de Tilezen vector-datasource, **MIT** (© 2015-2018 Mapzen, © 2019 Linux Foundation) — https://github.com/tilezen/vector-datasource/blob/master/docs/LICENSE-SCHEMA.md
- Íconos de algunos estilos: derivados de Mapzen/Tangram icons, **MIT**.
- Si se distribuye un fork modificado de estilos/teselas o un servicio de teselas basado en ellos, debe llamarse distinto de "Protomaps".
- El formato `.pmtiles` es una especificación abierta en dominio público.

## Estilo sugerido para MapLibre (según https://docs.protomaps.com/basemaps/maplibre)
- Paquete npm **`@protomaps/basemaps`** (última versión en npm al 2026-10-17: 5.7.2, BSD-3-Clause; compatible con tilesets v4 desde style v4.0.0) + protocolo **`pmtiles`** (npm `pmtiles` 4.5.0) registrado en MapLibre.

```js
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';
maplibregl.addProtocol('pmtiles', new Protocol().tile);
const style = {
  version: 8,
  glyphs: '/basemap-assets/fonts/{fontstack}/{range}.pbf',   // self-host para offline
  sprite: '/basemap-assets/sprites/v4/light',                // self-host para offline
  sources: { protomaps: { type: 'vector', url: 'pmtiles:///data/basemap/piura_basemap.pmtiles',
    attribution: '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
  layers: layers('protomaps', namedFlavor('light'), { lang: 'es' })
};
```
Flavors: `light`, `dark`, `white`, `black`, `grayscale`. Para uso offline, las fuentes (glyphs) y sprites se
descargan como ZIP desde https://github.com/protomaps/basemaps-assets y se sirven junto a la PWA
(por defecto la doc apunta a protomaps.github.io).

## Advertencia
Esto es **cartografía base de referencia** (calles, ríos, lugares). **No es dato de riesgo**: no indica zonas
inundables, peligro ni vulnerabilidad. Puede tener omisiones o errores propios de OSM. La información de riesgo
debe venir de las fuentes oficiales (INDECI, CENEPRED, SENAMHI, ANA) y mostrarse como capas separadas.
