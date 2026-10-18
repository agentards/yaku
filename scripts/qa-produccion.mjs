// QA de producción (yaku.lat u otra URL) sin escribir datos: salud, rutas, API protegida y, si se da la contraseña
// en la variable YAKU_CLAVE (nunca en el repo), el ciclo de la sesión: entrar → token → «recargar» y «cambiar de
// región» (otras peticiones con el mismo token) → salir → el token deja de servir. No necesita npm install.
//   node scripts/qa-produccion.mjs [https://yaku.lat]                 (YAKU_USUARIO=central por defecto)
//   PowerShell:  $env:YAKU_CLAVE = "<contraseña>"; node scripts/qa-produccion.mjs; Remove-Item Env:YAKU_CLAVE
const BASE = (process.argv[2] ?? 'https://yaku.lat').replace(/\/$/, '');
const USUARIO = process.env.YAKU_USUARIO ?? 'central', CLAVE = process.env.YAKU_CLAVE ?? '';
const checks = [];
const check = (n, ok, d) => { checks.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}`, d === undefined ? '' : JSON.stringify(d)); };
const pedir = async (ruta, init = {}) => {
  const r = await fetch(BASE + ruta, { ...init, signal: AbortSignal.timeout(15000) });
  return { status: r.status, tipo: r.headers.get('content-type') ?? '', j: await r.json().catch(() => null) };
};
const entrar = (clave) => pedir('/api/sesion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usuario: USUARIO, clave }) });
const conToken = (t, ruta, method = 'GET') => pedir(ruta, { method, headers: { authorization: `Bearer ${t}` } });

console.log(`QA de producción · ${BASE}\n`);
try {
  const salud = await pedir('/salud');
  check('el contenedor está arriba: /salud = 200', salud.status === 200, salud.status === 404 && !salud.j ? 'Traefik no encuentra el contenedor: está caído o el dominio no apunta al puerto 8080' : undefined);
  for (const ruta of ['/', '/municipalidad', '/estoy-bien']) { const r = await pedir(ruta); check(`${ruta} sirve la página (200, HTML)`, r.status === 200 && r.tipo.includes('text/html'), { status: r.status }); }
  check('API protegida: /api/incidentes sin credencial = 401', (await pedir('/api/incidentes')).status === 401);
  const s = await pedir('/api/sesion');
  check('versión con usuarios y sesiones: /api/sesion sin token = 401', s.status === 401, s.status === 404 ? 'responde 404: corre una versión vieja → redesplegar main' : undefined);
  check('contraseña falsa = 403 «usuario o contraseña incorrectos»', (await entrar('falsa-' + Math.random().toString(36).slice(2))).status === 403);

  if (!CLAVE) console.log('\n(Sin YAKU_CLAVE: se saltan las pruebas de la sesión. Ver el encabezado del script.)');
  else {
    const r = await entrar(CLAVE);
    const token = r.j?.token ?? '';
    check(`«${USUARIO}» entra con su contraseña: el usuario existe en la base de producción`, r.status === 200 && token.length >= 40, { status: r.status, nombre: r.j?.nombre, vence: r.j?.expira ? new Date(r.j.expira).toISOString() : undefined });
    if (token) {
      check('GET /api/sesion con el token devuelve el usuario', (await conToken(token, '/api/sesion')).j?.usuario === USUARIO);
      const i = await conToken(token, '/api/incidentes');
      check('con el token se leen los incidentes (sin PIN)', i.status === 200, { incidentes: i.j?.incidentes?.length });
      check('«recargar» y «cambiar Piura ↔ Lima» = mismas peticiones con el mismo token: siguen en 200', (await conToken(token, '/api/sesion')).status === 200 && (await conToken(token, '/api/incidentes')).status === 200);
      check('«Salir» cierra la sesión en el servidor', (await conToken(token, '/api/sesion', 'DELETE')).status === 200);
      check('después de «Salir» el token ya no sirve (401)', (await conToken(token, '/api/incidentes')).status === 401);
    }
  }
} catch (e) {
  check('sin errores de red', false, String(e?.message || e));
}
const ok = checks.filter(Boolean).length;
console.log(`\n${ok === checks.length ? 'OK' : 'FALLA'} · ${ok}/${checks.length}`);
process.exit(ok === checks.length ? 0 : 1);
