// Paso de acceso del Centro de monitoreo para las E2E (?vista=portal|municipalidad|incidentes): la pantalla pide
// nombre + PIN municipal (src/auth/sesion.ts). Con servidor real, pasar su PIN.
export async function accederConPin(page, { nombre = 'Operador SIMULADO', pin = 'pin-e2e' } = {}) {
  await page.waitForSelector('.ycm-acc-pin', { timeout: 30000 });
  await page.fill('.ycm-acc-pin input[name="nombre"]', nombre);
  await page.fill('.ycm-acc-pin input[name="pin"]', pin);
  await page.click('.ycm-acc-pin .ycm-acc-entrar');
  await page.waitForSelector('.ycm-acc', { state: 'detached', timeout: 15000 });
}
