// Íconos SVG en línea (sin fuentes externas ni CDN). Todos decorativos: aria-hidden.
const s = (d: string, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const f = (d: string, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" fill="currentColor">${d}</svg>`;

export const IC = {
  logo: `<svg viewBox="0 0 44 28" aria-hidden="true"><path d="M2 26 15 6l7 9 5-6 15 17z" fill="#c4501b"/><path d="M15 6l7 9-4 5z" fill="#e9a37a"/></svg>`,
  calendario: s('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  capas: s('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>'),
  campo: s('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>'),
  relevo: s('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><path d="M14 6.5h4a3 3 0 0 1 3 3V11M10 17.5H6a3 3 0 0 1-3-3V13"/>'),
  norte: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 17 20 12 16 7 20z" fill="#2b2620"/><path d="M12 2v14l-5 4z" fill="#c4501b"/></svg>`,
  pantalla: s('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  play: f('<path d="M7 4.5v15l12-7.5z"/>'),
  pausa: f('<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>'),
  paso: f('<path d="M5 4.5v15l10-7.5zM16 4h3v16h-3z"/>'),
  menos: s('<path d="M5 12h14"/>'),
  mas: s('<path d="M5 12h14M12 5v14"/>'),
  expandir: s('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
  contraer: s('<path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7"/>'),
  cerrar: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  volar: s('<path d="M5 19 19 5M9 5h10v10"/>'),
  telefono: s('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>'),
  servidor: s('<rect x="3.5" y="4" width="17" height="7" rx="1.5"/><rect x="3.5" y="13" width="17" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>'),
  info: s('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  sinRed: s('<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1"/><path d="M3 3l18 18"/>'),
  regional: s('<path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"/><path d="M9 4v13M15 7v13"/>'),
};
