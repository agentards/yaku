// SVGs propios de la landing (sin librerías de íconos). Trazo de 1.6 px, esquinas redondeadas, currentColor:
// heredan el color del contexto y se ven bien en los dos tamaños en que se usan.

/** Marca: una gota hecha de tres eslabones (la cadena de vecinos). */
export const marca = (clase = 'marca') => `<svg class="${clase}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <path d="M16 2.5C16 2.5 6 13.2 6 19.6A10 10 0 0 0 26 19.6C26 13.2 16 2.5 16 2.5Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
  <circle cx="16" cy="13.5" r="2.4" fill="currentColor"/><circle cx="12.4" cy="20.5" r="2.4" fill="currentColor"/><circle cx="19.6" cy="20.5" r="2.4" fill="currentColor"/>
  <path d="M16 13.5 12.4 20.5H19.6Z" fill="none" stroke="currentColor" stroke-width="1.4"/>
</svg>`;

const icono = (d: string) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</g></svg>`;

export const ICONOS = {
  flecha: icono('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  check: icono('<path d="m5 12.5 4.2 4.2L19 7"/>'),
  play: icono('<path d="M8 5.5v13l10.5-6.5z"/>'),
  ojo: icono('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>'),
  candado: icono('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  persona: icono('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>'),
  foto: icono('<rect x="3" y="6.5" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8.5 6.5 10 4h4l1.5 2.5"/>'),
  aviso: icono('<path d="M12 3.5 21 19.5H3Z"/><path d="M12 10v4.5M12 17v.01"/>'),
  capas: icono('<path d="m12 3.5 9 4.8-9 4.8-9-4.8z"/><path d="m3 12.5 9 4.8 9-4.8"/><path d="m3 16.7 9 4.8 9-4.8"/>'),
  servidor: icono('<rect x="4" y="4" width="16" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="16" height="6.5" rx="1.5"/><path d="M8 7.3h.01M8 16.8h.01"/>'),
  mapa: icono('<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>'),
  enlace: icono('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
};

/** Celular estilizado para la figura de la cadena (centrado en 0,0; 34×58). */
const celular = (id: string, x: number, y: number, etiqueta: string) => `<g class="nodo nodo-cel" id="${id}" transform="translate(${x} ${y})">
  <circle class="nodo-halo" r="40"/>
  <rect class="cel-cuerpo" x="-17" y="-29" width="34" height="58" rx="7"/>
  <rect class="cel-pantalla" x="-12.5" y="-22" width="25" height="40" rx="2.5"/>
  <rect class="cel-boton" x="-4" y="22.5" width="8" height="1.6" rx=".8"/>
  <g class="cel-qr" transform="translate(-7 -9)"><rect width="5" height="5"/><rect x="9" width="5" height="5"/><rect y="9" width="5" height="5"/><rect x="9" y="9" width="2.5" height="2.5"/><rect x="11.5" y="11.5" width="2.5" height="2.5"/></g>
  <text class="nodo-etq" y="50" text-anchor="middle">${etiqueta}</text>
</g>`;

const CAMINO = 'M70 270C130 270 135 150 205 150S290 280 345 280 455 120 560 120';

/**
 * Figura central: tres vecinos y la municipalidad unidos por un camino. cadena.ts dibuja el camino y mueve el pulso
 * con el scroll; sin JS (o con reduced-motion) se ve el estado final completo: todo encendido.
 * La vuelta no se pinta encima de la ida (agua + barro se mezclaban en un beige): #camino-vuelta vive en una máscara
 * y descubre una fila de cuentas de barro sobre el mismo camino. cadena.ts sigue moviendo su stroke-dashoffset.
 * Los trazos que se dibujan solos (señal, anillo) usan pathLength para animarse con stroke-dashoffset sin medir.
 */
export const figuraCadena = (titulo: string) => `<svg class="cadena-svg" viewBox="0 0 640 380" role="img" aria-labelledby="cadena-svg-t">
  <title id="cadena-svg-t">${titulo}</title>
  <defs>
    <radialGradient id="g-pulso"><stop offset="0" stop-color="currentColor" stop-opacity=".9"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>
    <pattern id="p-lluvia" width="14" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(14)"><path d="M7 0v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></pattern>
    <radialGradient id="g-lluvia" cx=".42" cy=".5" r=".55"><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
    <mask id="m-lluvia" maskContentUnits="userSpaceOnUse"><rect width="420" height="380" fill="url(#g-lluvia)"/></mask>
    <mask id="m-vuelta" maskUnits="userSpaceOnUse" x="-20" y="-20" width="680" height="420"><path class="camino-vuelta" id="camino-vuelta" d="${CAMINO}"/></mask>
  </defs>
  <rect class="lluvia" id="lluvia" x="0" y="0" width="420" height="380" fill="url(#p-lluvia)" mask="url(#m-lluvia)"/>
  <g class="sin-senal" id="sin-senal" transform="translate(150 50)">
    <path d="M18 17 11 44M18 17l7 27M13.6 35h8.8M11 10a10 10 0 0 0 0 14M25 10a10 10 0 0 1 0 14"/><circle cx="18" cy="17" r="2.2"/><path class="sin-senal-tachado" d="M4 5l28 38"/>
    <text x="18" y="-4" text-anchor="middle">sin señal</text>
  </g>
  <path class="camino-base" d="${CAMINO}"/>
  <path class="camino-ida" id="camino-ida" d="${CAMINO}"/>
  <path class="camino-vuelta-cuentas" id="camino-vuelta-cuentas" d="${CAMINO}" mask="url(#m-vuelta)"/>
  ${celular('n1', 70, 270, 'Vecina A')}
  ${celular('n2', 205, 150, 'Vecino B')}
  ${celular('n3', 345, 280, 'Vecino C')}
  <g class="senal" id="senal-c" transform="translate(345 222)"><path pathLength="1" d="M-16 -6a22 22 0 0 1 32 0"/><path pathLength="1" d="M-9 1a12 12 0 0 1 18 0"/><circle cy="7" r="2.2"/></g>
  <g class="nodo nodo-muni" id="n4" transform="translate(560 120)">
    <circle class="nodo-halo" r="52"/>
    <circle class="muni-anillo" id="muni-anillo" r="48" pathLength="100" transform="rotate(-90)"/>
    <path class="muni-cuerpo" d="M-36 30V-6H36V30ZM-42 -6 0 -32 42 -6Z"/>
    <path class="muni-col" d="M-24 24V2M-8 24V2M8 24V2M24 24V2"/>
    <text class="nodo-etq" y="66" text-anchor="middle">Municipalidad</text>
  </g>
  <g class="insignia insignia-grupo" id="insignia-grupo" transform="translate(544 224)"><rect x="-94" y="-17" width="188" height="26" rx="13"/><text y="1" text-anchor="middle">2 vecinos · por validar</text></g>
  <g class="insignia insignia-resp" id="insignia-resp" transform="translate(86 356)"><rect x="-76" y="-17" width="152" height="26" rx="13"/><text y="1" text-anchor="middle">Bomberos asignados</text></g>
  <circle class="pulso pulso-ida" id="pulso-ida" r="15" cx="70" cy="270" fill="url(#g-pulso)"/>
  <circle class="pulso-nucleo pulso-ida-n" id="pulso-ida-n" r="4.5" cx="70" cy="270"/>
  <circle class="pulso pulso-vuelta" id="pulso-vuelta" r="15" cx="560" cy="120" fill="url(#g-pulso)"/>
  <circle class="pulso-nucleo pulso-vuelta-n" id="pulso-vuelta-n" r="4.5" cx="560" cy="120"/>
</svg>`;
