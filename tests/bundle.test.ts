// Verifica el bundle construido (dist/): textos prohibidos y etiquetado de reportes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(__dirname, '../dist');
function files(d: string): string[] {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]));
}

describe('bundle dist/', () => {
  it('existe (ejecutar vite build antes)', () => expect(fs.existsSync(path.join(dist, 'index.html'))).toBe(true));
  const text = () => files(dist).filter((f) => /\.(js|html|css|webmanifest|json)$/.test(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  it('nunca contiene afirmaciones de seguridad de rutas', () => {
    // Construido por partes para no depender de la literal; cubre tildes, unicode-escape y mayúsculas.
    const t = text().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\\u00ed/gi, 'i').replace(/\\xed/gi, 'i').toLowerCase();
    const banned = [['v', 'ia', ' segura'], ['ruta', ' segura'], ['camino', ' seguro'], ['safe', ' route']].map((p) => p.join(''));
    for (const b of banned) expect(t.includes(b), `texto prohibido: "${b}"`).toBe(false);
  });
  it('incluye la etiqueta NO VERIFICADO y estilos distintos citizen/official', () => {
    const t = text();
    expect(t).toContain('NO VERIFICADO');
    expect(t).toMatch(/\.citizen\{[^}]*dashed/);
    expect(t).toMatch(/\.official\{[^}]*solid/);
  });
  it('no referencia CDNs externos (todo empaquetado para offline)', () => {
    expect(text()).not.toMatch(/(unpkg|jsdelivr|cdnjs|googleapis)\.(com|net)/);
  });
});
