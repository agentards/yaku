// Plugin de Vite: escribe la landing dentro de index.html (dev, preview y build) a partir de contenido.ts.
// index.html solo lleva dos marcas: <!--yaku:head--> y <!--yaku:cuerpo-->. app.html no se toca.
import type { Plugin } from 'vite';
import { renderCuerpo, renderHead } from './plantilla';

export const landingHtml = (): Plugin => ({
  name: 'yaku-landing',
  transformIndexHtml: {
    order: 'pre',
    handler(html, ctx) {
      if (!/(^|[\\/])index\.html$/.test(ctx.filename) && ctx.path !== '/index.html' && ctx.path !== '/') return html;
      if (!html.includes('<!--yaku:cuerpo-->')) return html;
      return html.replace('<!--yaku:head-->', renderHead()).replace('<!--yaku:cuerpo-->', renderCuerpo());
    },
  },
});
