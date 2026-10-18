// Paso de acceso del Centro de monitoreo para las E2E (/municipalidad): usuario «central» + contraseña (en el
// servidor de prueba es el PIN con que se arrancó; ver servidor-local/usuarios.ts) + nombre para el historial.
export async function accederConPin(page, { nombre = 'Operador SIMULADO', pin = 'pin-e2e', usuario = 'central' } = {}) {
  await page.waitForSelector('.ycm-acc-pin', { timeout: 30000 });
  await page.fill('.ycm-acc-pin input[name="usuario"]', usuario);
  await page.fill('.ycm-acc-pin input[name="clave"]', pin);
  await page.fill('.ycm-acc-pin input[name="nombre"]', nombre);
  await page.click('.ycm-acc-pin .ycm-acc-entrar');
  await page.waitForSelector('.ycm-acc', { state: 'detached', timeout: 15000 });
}
