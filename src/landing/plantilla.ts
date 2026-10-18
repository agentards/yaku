// contenido.ts → HTML estático. Funciones puras (sin DOM): plugin.ts las llama al servir y al compilar index.html,
// y la página queda completa sin JS. main.ts solo añade movimiento y carga diferida de video.
import * as C from './contenido';
import { ICONOS, figuraCadena, marca } from './svg';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const VIDEO = '/landing/video/';

const fuente = (f: C.Fuente) =>
  f.url ? `<a href="${esc(f.url)}" rel="noopener" target="_blank">${esc(f.texto)}</a>` : esc(f.texto);

const ctaPiloto = (texto: string, clase = 'btn btn-primario', id = '') =>
  `<a class="${clase}" href="${esc(C.CONTACTO.href)}" data-cta="piloto"${id ? ` id="${id}"` : ''}>${esc(texto)}${ICONOS.flecha}</a>`;
const ctaVecino = (texto: string, clase = 'btn btn-vecino') =>
  `<a class="${clase}" href="${C.RUTAS.reportar}" data-cta="reportar">${esc(texto)}</a>`;

const antetitulo = (t: string) => `<p class="antetitulo">${esc(t)}</p>`;

/** Fondo de sección: póster webp (16:9 o 9:16 según la pantalla); main.ts le pone el video encima si conviene. */
const fondo = (base: string, alt: string, etiqueta: string, prioridad = false) => `<div class="fondo" data-video="${base}">
  <picture>
    <source media="(max-aspect-ratio: 1/1)" srcset="${VIDEO}${base}-9x16.webp" width="720" height="1280">
    <img src="${VIDEO}${base}-16x9.webp" width="1280" height="720" alt="${esc(alt)}"${prioridad ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">
  </picture>
  <span class="etiqueta-ia">${esc(etiqueta)}</span>
</div>`;

function cabecera() {
  return `<header class="nav" id="arriba">
  <a class="nav-marca" href="#arriba" aria-label="Yaku, inicio">${marca()}<span>Yaku</span></a>
  <nav class="nav-enlaces" aria-label="Secciones">${C.NAV.map((n) => `<a href="${n.href}">${esc(n.texto)}</a>`).join('')}</nav>
  <div class="nav-acciones">
    ${ctaVecino('Reportar', 'nav-vecino')}
    <a class="nav-ingresar" href="${C.RUTAS.ingresar}" data-cta="ingresar">${ICONOS.candado}Ingresar</a>
  </div>
</header>`;
}

function hero() {
  const h = C.HERO;
  return `<section class="hero" aria-labelledby="hero-t">
  ${fondo('lluvia-caserio', 'Calle de tierra mojada entre casas de adobe y calamina bajo la lluvia, en un caserío del norte peruano.', h.etiquetaIA, true)}
  <div class="hero-velo" aria-hidden="true"></div>
  <div class="contenedor hero-cuerpo">
    ${antetitulo(h.antetitulo)}
    <h1 id="hero-t" class="hero-titulo">${esc(h.titulo)}</h1>
    <p class="hero-bajada">${esc(h.bajada)}</p>
    <div class="hero-ctas">${ctaPiloto(h.ctaPrincipal, 'btn btn-primario btn-grande', 'cta-hero')}${ctaVecino(h.ctaVecino)}</div>
  </div>
  <a class="hero-bajar" href="#problema" aria-label="Bajar a El problema"><span></span></a>
</section>`;
}

function problema() {
  const p = C.PROBLEMA;
  return `<section class="seccion problema" id="problema" aria-labelledby="problema-t">
  ${fondo('antena-sin-luz', 'Torre de telefonía y postes de luz apagados al atardecer sobre un pueblo sin energía.', p.etiquetaIA)}
  <div class="contenedor">
    ${antetitulo(p.antetitulo)}
    <h2 id="problema-t" class="titulo-2 revelar">${esc(p.titulo)}</h2>
    <div class="cifras">
      ${p.cifras
        .map(
          (c) => `<figure class="cifra revelar">
        <p class="cifra-valor"><span class="num" data-contar="${c.valor}">${c.valor}</span> <span class="cifra-unidad">${esc(c.unidad)}</span></p>
        <figcaption><span>${esc(c.texto)}</span><cite>Fuente: ${fuente(c.fuente)}</cite></figcaption>
      </figure>`,
        )
        .join('')}
    </div>
    <p class="problema-cierre revelar">${esc(p.cierre)}</p>
  </div>
</section>`;
}

function cadena() {
  const c = C.CADENA;
  return `<section class="seccion cadena" id="cadena" aria-labelledby="cadena-t">
  <div class="contenedor">
    ${antetitulo(c.antetitulo)}
    <h2 id="cadena-t" class="titulo-2">${esc(c.titulo)}</h2>
  </div>
  <div class="contenedor cadena-grid">
    <div class="cadena-figura" data-paso="5">${figuraCadena(c.etiquetaFigura)}</div>
    <ol class="cadena-pasos">
      ${c.pasos
        .map(
          (p, i) => `<li class="paso" data-paso="${i + 1}">
        <span class="paso-n">${p.n}</span>
        <h3>${esc(p.titulo)}</h3>
        <p>${esc(p.texto)}</p>
        <p class="paso-detalle">${esc(p.detalle)}</p>
      </li>`,
        )
        .join('')}
    </ol>
  </div>
</section>`;
}

function municipalidad() {
  const m = C.MUNICIPALIDAD;
  return `<section class="seccion muni" id="municipalidad" aria-labelledby="muni-t">
  <div class="contenedor muni-grid">
    <div class="muni-texto">
      ${antetitulo(m.antetitulo)}
      <h2 id="muni-t" class="titulo-2 revelar">${esc(m.titulo)}</h2>
      <ul class="lista-check revelar">${m.puntos.map((p) => `<li>${ICONOS.check}<span>${esc(p)}</span></li>`).join('')}</ul>
      ${ctaPiloto(m.cta)}
    </div>
    <div class="pantalla revelar">
      <div class="pantalla-barra" role="tablist" aria-label="Capturas del Centro de monitoreo">
        ${m.capturas
          .map((k, i) => `<button role="tab" id="tab-m${i}" aria-controls="panel-m${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(k.pestana)}</button>`)
          .join('')}
      </div>
      ${m.capturas
        .map(
          (k, i) => `<figure class="pantalla-panel" role="tabpanel" id="panel-m${i}" aria-labelledby="tab-m${i}"${i === 0 ? '' : ' hidden'}>
        <img src="${k.archivo}" width="1600" height="900" alt="${esc(k.alt)}" loading="lazy" decoding="async">
        <figcaption>${esc(k.pie)}</figcaption>
      </figure>`,
        )
        .join('')}
      <p class="pantalla-nota">${esc(m.nota)}</p>
    </div>
  </div>
</section>`;
}

function vecino() {
  const v = C.VECINO;
  return `<section class="seccion vecino" id="vecino" aria-labelledby="vecino-t">
  <div class="contenedor vecino-grid">
    <div class="vecino-texto">
      ${antetitulo(v.antetitulo)}
      <h2 id="vecino-t" class="titulo-2 revelar">${esc(v.titulo)}</h2>
      <p class="revelar">${esc(v.texto)}</p>
      ${ctaVecino(v.cta, 'btn btn-secundario')}
    </div>
    <ul class="celulares">
      ${v.capturas
        .map(
          (k) => `<li class="celular revelar"><img src="${k.archivo}" width="412" height="824" alt="${esc(k.alt)}" loading="lazy" decoding="async"><span>${esc(k.pie)}</span></li>`,
        )
        .join('')}
    </ul>
  </div>
</section>`;
}

function regional() {
  const r = C.REGIONAL;
  const iconos = [ICONOS.mapa, ICONOS.capas, ICONOS.enlace, ICONOS.servidor];
  return `<section class="seccion regional" id="regional" aria-labelledby="regional-t">
  ${fondo('coe-pantallas', 'Sala de operaciones con varias pantallas que muestran un mapa con puntos de reportes.', r.etiquetaIA)}
  <div class="contenedor">
    ${antetitulo(r.antetitulo)}
    <h2 id="regional-t" class="titulo-2 revelar">${esc(r.titulo)}</h2>
    <ul class="tarjetas">${r.puntos.map((p, i) => `<li class="tarjeta revelar">${iconos[i]}<h3>${esc(p.t)}</h3><p>${esc(p.d)}</p></li>`).join('')}</ul>
    ${ctaPiloto(r.cta)}
  </div>
</section>`;
}

function imagenesIA() {
  if (!C.IMAGENES_IA.length) return '';
  return `<section class="seccion galeria" aria-label="Escenas de la cadena">
  <ul class="contenedor galeria-lista">${C.IMAGENES_IA.map(
    (im) => `<li class="revelar"><figure><img src="${im.archivo}" width="${im.ancho}" height="${im.alto}" alt="${esc(im.alt)}" loading="lazy" decoding="async"><figcaption class="etiqueta-ia">Imagen generada con IA</figcaption></figure></li>`,
  ).join('')}</ul>
</section>`;
}

function videos() {
  const v = C.VIDEOS;
  return `<section class="seccion videos" id="videos" aria-labelledby="videos-t">
  <div class="contenedor">
    ${antetitulo(v.antetitulo)}
    <h2 id="videos-t" class="titulo-2 revelar">${esc(v.titulo)}</h2>
    <ul class="videos-lista">${v.lista
      .map(
        (x) => `<li class="video revelar"><figure>
      <video controls preload="none" playsinline width="720" height="1280" poster="${VIDEO}${x.archivo}.webp" aria-label="${esc(x.titulo)}"><source src="${VIDEO}${x.archivo}.mp4" type="video/mp4"></video>
      <figcaption><strong>${esc(x.titulo)}</strong><span>${esc(x.descripcion)}</span><span class="etiqueta-ia">${esc(x.etiquetaIA)}</span></figcaption>
    </figure></li>`,
      )
      .join('')}</ul>
  </div>
</section>`;
}

function confianza() {
  const c = C.CONFIANZA;
  return `<section class="seccion confianza" id="confianza" aria-labelledby="confianza-t">
  <div class="contenedor">
    ${antetitulo(c.antetitulo)}
    <h2 id="confianza-t" class="titulo-2 revelar">${esc(c.titulo)}</h2>
    <dl class="confianza-lista">${c.puntos.map((p) => `<div class="revelar"><dt>${esc(p.t)}</dt><dd>${esc(p.d)}</dd></div>`).join('')}</dl>
  </div>
</section>`;
}

function preguntas() {
  return `<section class="seccion preguntas" id="preguntas" aria-labelledby="preguntas-t">
  <div class="contenedor preguntas-grid">
    <div>${antetitulo('Preguntas frecuentes')}<h2 id="preguntas-t" class="titulo-2">Lo que preguntan las municipalidades.</h2></div>
    <div class="preguntas-lista">${C.PREGUNTAS.map((q, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q.p)}</summary><p>${esc(q.r)}</p></details>`).join('')}</div>
  </div>
</section>`;
}

function cierre() {
  const c = C.CIERRE;
  return `<section class="seccion cierre" id="piloto" aria-labelledby="cierre-t">
  ${fondo('manos-qr', 'Dos manos con celulares sobre una mesa de madera; uno muestra un código QR para pasar reportes.', 'Imagen generada con IA')}
  <div class="contenedor cierre-cuerpo">
    <h2 id="cierre-t" class="titulo-cierre revelar">${esc(c.titulo)}</h2>
    <p class="revelar">${esc(c.texto)}</p>
    <div class="hero-ctas">${ctaPiloto(c.cta, 'btn btn-primario btn-grande')}${ctaVecino(c.vecino)}</div>
    <p class="cierre-contacto">Escríbanos a <a href="${esc(C.CONTACTO.href)}">${esc(C.CONTACTO.texto)}</a></p>
  </div>
</section>`;
}

function pie() {
  const p = C.PIE;
  return `<footer class="pie">
  <div class="contenedor pie-grid">
    <div class="pie-marca">${marca()}<span>Yaku</span><p>Cadena de apoyo vecinal ante el Fenómeno El Niño.</p></div>
    <nav aria-label="Entradas"><a href="${C.RUTAS.reportar}" data-cta="reportar">Reportar un incidente</a><a href="${C.RUTAS.ingresar}" data-cta="ingresar">Ingresar (municipalidad)</a></nav>
    <div class="pie-fuentes"><p>Fuentes</p><ul>${p.fuentes.map((f) => `<li>${fuente(f)}</li>`).join('')}</ul></div>
  </div>
  <p class="contenedor pie-ia">${esc(p.ia)} Actualizado el <time datetime="${C.SEO.actualizado}">17 de octubre de 2026</time>.</p>
</footer>`;
}

export function renderCuerpo(): string {
  return [
    `<a class="saltar" href="#contenido">Saltar al contenido</a>`,
    cabecera(),
    `<main id="contenido">`,
    hero(),
    problema(),
    cadena(),
    municipalidad(),
    vecino(),
    regional(),
    imagenesIA(),
    videos(),
    confianza(),
    preguntas(),
    cierre(),
    `</main>`,
    pie(),
  ].join('\n');
}

export function renderHead(): string {
  const s = C.SEO;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${s.url}#web`, name: 'Yaku', url: s.url, inLanguage: 'es-PE', description: s.descripcion },
      {
        '@type': 'SoftwareApplication',
        '@id': `${s.url}#app`,
        name: 'Yaku Relay',
        applicationCategory: 'GovernmentApplication',
        operatingSystem: 'Web (PWA), Android, iOS',
        url: s.url,
        description: C.HERO.bajada,
        inLanguage: 'es-PE',
        areaServed: { '@type': 'Country', name: 'Perú' },
        audience: { '@type': 'Audience', audienceType: 'Municipalidades y gobiernos regionales del Perú' },
      },
      {
        '@type': 'FAQPage',
        '@id': `${s.url}#preguntas`,
        mainEntity: C.PREGUNTAS.map((q) => ({ '@type': 'Question', name: q.p, acceptedAnswer: { '@type': 'Answer', text: q.r } })),
      },
    ],
  };
  return [
    `<title>${esc(s.titulo)}</title>`,
    `<meta name="description" content="${esc(s.descripcion)}" />`,
    `<link rel="canonical" href="${s.url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="es_PE" />`,
    `<meta property="og:site_name" content="Yaku" />`,
    `<meta property="og:url" content="${s.url}" />`,
    `<meta property="og:title" content="${esc(s.titulo)}" />`,
    `<meta property="og:description" content="${esc(s.descripcion)}" />`,
    `<meta property="og:image" content="${s.ogImagen}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(s.ogAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<link rel="preload" href="/landing/fuentes/space-grotesk-latin-500.woff2" as="font" type="font/woff2" crossorigin />`,
    `<link rel="preload" href="/landing/fuentes/inter-latin-var.woff2" as="font" type="font/woff2" crossorigin />`,
    `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>`,
  ].join('\n  ');
}
