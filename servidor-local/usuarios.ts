// Usuarios del Centro de monitoreo y sus sesiones (en la misma base SQLite). La contraseña se guarda con scrypt y
// sal propia; la sesión es un token aleatorio que guarda el navegador, y el servidor solo guarda su hash (sha256).
// Así cambiar de región (Piura ↔ Lima) o recargar no vuelve a pedir la contraseña.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Almacen } from './almacen.ts';

export const USUARIO = /^[a-z0-9._-]{3,32}$/;
export const TOKEN = /^[A-Za-z0-9_-]{40,64}$/;
export const hashClave = (clave: string, sal = randomBytes(16).toString('base64url')) => ({ sal, hash: scryptSync(clave, sal, 32).toString('base64url') });
export function claveOk(clave: string, sal: string, hash: string): boolean {
  const h = scryptSync(clave, sal, 32), e = Buffer.from(hash, 'base64url');
  return e.length === h.length && timingSafeEqual(h, e);
}
export const nuevoToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('base64url');

/** Crea o actualiza el usuario de la municipalidad con la contraseña del entorno. Si la contraseña cambió, cierra
 *  sus sesiones abiertas (el equipo que la tenía tiene que volver a entrar). */
export function asegurarUsuario(A: Almacen, u: { usuario: string; nombre: string; clave: string }, ahora: number): 'creado' | 'actualizado' | 'igual' {
  if (!USUARIO.test(u.usuario)) throw new Error(`usuario inválido: ${u.usuario} (3 a 32 letras minúsculas, números, . _ -)`);
  if (!u.clave) throw new Error('falta la contraseña del usuario de la municipalidad');
  const prev = A.usuario(u.usuario);
  if (prev && claveOk(u.clave, prev.sal, prev.hash)) {
    if (prev.nombre !== u.nombre) A.guardarUsuario({ ...prev, nombre: u.nombre }, ahora);
    return 'igual';
  }
  A.guardarUsuario({ usuario: u.usuario, nombre: u.nombre, ...hashClave(u.clave), rol: 'operador' }, ahora);
  if (prev) A.cerrarSesionesDe(u.usuario);
  return prev ? 'actualizado' : 'creado';
}
