// Verificación del JWT de sesión de Clerk (RS256) SOLO con clave pública, sin dependencias (node:crypto).
// Clave: JWKS del Frontend API (derivado de la publishable key) con caché en memoria y en disco (sigue sin red),
// o CLERK_JWT_KEY (PEM) sin red. No necesita la secret key. Decisiones: agentards/producto/plan-centro-monitoreo.md
import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const HOLGURA_S = 5;          // tolerancia de reloj para exp/nbf
const REINTENTO_JWKS_MS = 30_000;    // kid desconocido: como mucho 1 descarga cada 30 s
const TIMEOUT_JWKS_MS = 4_000;

export type Rol = 'operador' | 'monitor';
export type Verificacion =
  | { ok: true; sub: string; rol: Rol; claims: Record<string, unknown> }
  | { ok: false; status: 401 | 403; codigo: string; error: string };

export interface ConfigClerk {
  publishableKey?: string;   // pk_test_… / pk_live_…
  jwtKey?: string;           // PEM (Clerk → API keys → «JWT public key»): verifica sin red
  emisor?: string;           // iss esperado; por defecto https://<frontend-api> de la publishable key
  partes?: string[];         // azp permitidos; vacío/omitido = orígenes localhost
  datos?: string;            // carpeta para la caché del JWKS (YAKU_DATOS)
  fetch?: typeof fetch;
  ahora?: () => number;      // ms
}

/** Host del Frontend API desde la publishable key: pk_(test|live)_ + base64("<host>$"). null si no es válida. */
export function frontendApiDe(pk: string | undefined): string | null {
  const m = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/.exec((pk ?? '').trim());
  if (!m) return null;
  const txt = Buffer.from(m[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  if (!txt.endsWith('$')) return null;
  const host = txt.slice(0, -1);
  return /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? host : null;
}

/** azp por defecto: cualquier origen http(s) de localhost / 127.0.0.1 (todo es local en la demo). */
export const esOrigenLocal = (o: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o);

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const jsonB64 = (s: string): any => { try { return JSON.parse(b64url(s).toString('utf8')); } catch { return null; } };
const no = (status: 401 | 403, codigo: string, error: string): Verificacion => ({ ok: false, status, codigo, error });

/** El PEM de una variable de entorno suele venir con «\n» literales. */
const pemDe = (s: string) => s.replace(/\\n/g, '\n').trim();

export function crearVerificadorClerk(c: ConfigClerk) {
  const host = frontendApiDe(c.publishableKey);
  const emisor = c.emisor?.replace(/\/$/, '') || (host ? `https://${host}` : null);
  const partes = (c.partes ?? []).map((p) => p.trim().replace(/\/$/, '')).filter(Boolean);
  const ahora = c.ahora ?? Date.now;
  const fetchar = c.fetch ?? fetch;
  const pem: KeyObject | null = c.jwtKey ? createPublicKey(pemDe(c.jwtKey)) : null;
  const archivoCache = c.datos && host ? path.join(c.datos, 'clerk-jwks.json') : null;
  const activo = Boolean(pem || host);

  let claves = new Map<string, KeyObject>();
  let ultimaDescarga = 0;
  let descargando: Promise<void> | null = null;

  const cargarJwks = (jwks: any) => {
    const m = new Map<string, KeyObject>();
    for (const k of Array.isArray(jwks?.keys) ? jwks.keys : []) {
      if (k?.kty !== 'RSA' || typeof k.kid !== 'string' || (k.use && k.use !== 'sig')) continue;
      try { m.set(k.kid, createPublicKey({ key: k, format: 'jwk' })); } catch { /* clave rota: se ignora */ }
    }
    return m;
  };
  if (archivoCache) { try { claves = cargarJwks(JSON.parse(fs.readFileSync(archivoCache, 'utf8'))); } catch { /* sin caché aún */ } }

  /** Baja el JWKS; si no hay red se queda con lo que tenía (memoria ← disco). */
  const descargar = (): Promise<void> => {
    if (!host) return Promise.resolve();
    if (descargando) return descargando;
    ultimaDescarga = ahora();
    descargando = (async () => {
      try {
        const r = await fetchar(`https://${host}/.well-known/jwks.json`, { signal: AbortSignal.timeout(TIMEOUT_JWKS_MS) });
        if (!r.ok) return;
        const jwks = await r.json();
        const m = cargarJwks(jwks);
        if (!m.size) return;
        claves = m;
        if (archivoCache) { try { fs.mkdirSync(path.dirname(archivoCache), { recursive: true }); fs.writeFileSync(archivoCache, JSON.stringify(jwks)); } catch { /* disco lleno: queda en memoria */ } }
      } catch { /* sin red: se usa la caché */ } finally { descargando = null; }
    })();
    return descargando;
  };

  async function claveDe(kid: string | undefined): Promise<KeyObject | null> {
    if (kid && claves.has(kid)) return claves.get(kid)!;
    if (host && (claves.size === 0 || ahora() - ultimaDescarga > REINTENTO_JWKS_MS)) {
      await descargar();
      if (kid && claves.has(kid)) return claves.get(kid)!;
    }
    return pem; // sin kid conocido: el PEM (si está) es la clave de la instancia
  }

  async function verificar(token: string): Promise<Verificacion> {
    const partesJwt = token.split('.');
    if (partesJwt.length !== 3) return no(403, 'formato', 'token de sesión mal formado');
    const [h64, p64, s64] = partesJwt;
    const cab = jsonB64(h64), claims = jsonB64(p64);
    if (!cab || !claims || typeof claims !== 'object') return no(403, 'formato', 'token de sesión mal formado');
    if (cab.alg !== 'RS256') return no(403, 'algoritmo', `algoritmo no permitido (${String(cab.alg)}): solo RS256`);
    const clave = await claveDe(cab.kid);
    if (!clave) return no(403, 'sin_clave', 'no se pudo obtener la clave pública de Clerk (sin red y sin caché): define CLERK_JWT_KEY');
    if (!verify('RSA-SHA256', Buffer.from(`${h64}.${p64}`), clave, b64url(s64))) return no(403, 'firma', 'firma del token inválida');

    const t = ahora() / 1000;
    if (typeof claims.exp !== 'number' || t > claims.exp + HOLGURA_S) return no(403, 'vencido', 'la sesión venció: vuelve a iniciar sesión');
    if (claims.nbf != null && (typeof claims.nbf !== 'number' || t < claims.nbf - HOLGURA_S)) return no(403, 'nbf', 'token aún no válido (revisa el reloj del equipo)');
    if (emisor ? claims.iss !== emisor : typeof claims.iss !== 'string' || !claims.iss.startsWith('https://')) return no(403, 'emisor', 'el token no lo emitió esta instancia de Clerk');
    const azp = typeof claims.azp === 'string' ? claims.azp.replace(/\/$/, '') : '';
    if (!azp || !(partes.length ? partes.includes(azp) : esOrigenLocal(azp))) return no(403, 'azp', `origen no autorizado${azp ? ` (${azp})` : ''}: agrégalo a CLERK_AUTHORIZED_PARTIES`);
    if (typeof claims.sub !== 'string' || !claims.sub) return no(403, 'sub', 'token sin usuario (sub)');

    // Claim opcional «rol» (Clerk → Sessions → Customize session token). Sin claim, opera; valor desconocido = solo mira.
    const r = claims.rol;
    const rol: Rol = r == null || r === '' || r === 'operador' ? 'operador' : 'monitor';
    return { ok: true, sub: claims.sub, rol, claims };
  }

  return {
    activo,
    host,
    emisor,
    modo: (pem && host ? 'pem+jwks' : pem ? 'pem' : host ? 'jwks' : 'ninguno') as 'pem+jwks' | 'pem' | 'jwks' | 'ninguno',
    /** Precarga el JWKS al arrancar (mientras hay red) para que quede en caché. */
    precargar: () => (host ? descargar() : Promise.resolve()),
    verificar,
  };
}

export type VerificadorClerk = ReturnType<typeof crearVerificadorClerk>;

/** Configuración desde el entorno. Acepta VITE_CLERK_PUBLISHABLE_KEY para reusar el .env.local del front. */
export function configDesdeEntorno(env: NodeJS.ProcessEnv, datos?: string): ConfigClerk & { permitirPin: boolean } {
  return {
    publishableKey: env.CLERK_PUBLISHABLE_KEY || env.VITE_CLERK_PUBLISHABLE_KEY || undefined,
    jwtKey: env.CLERK_JWT_KEY || undefined,
    emisor: env.CLERK_ISSUER || undefined,
    partes: (env.CLERK_AUTHORIZED_PARTIES ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    datos,
    permitirPin: env.YAKU_PERMITIR_PIN === '1',
  };
}
