// Paso de acceso del Centro de monitoreo para las E2E (/municipalidad): usuario «central» + contraseña (en el
// servidor de prueba es el PIN con que se arrancó; ver servidor-local/usuarios.ts). El nombre del historial ya no se
// escribe: es el del usuario en el servidor (iniciar({ nombre }) o MUNI_NOMBRE). `nombre` se acepta y se ignora.
export async function accederConPin(page, { pin = 'pin-e2e', usuario = 'central' } = {}) {
  await page.waitForSelector('.ycm-acc-pin', { timeout: 30000 });
  await page.fill('.ycm-acc-pin input[name="usuario"]', usuario);
  await page.fill('.ycm-acc-pin input[name="clave"]', pin);
  await page.click('.ycm-acc-pin .ycm-acc-entrar');
  await page.waitForSelector('.ycm-acc', { state: 'detached', timeout: 15000 });
}
