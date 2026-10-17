# Decisiones y trade-offs

| Decisión | Por qué | Qué sacrificamos |
|---|---|---|
| PWA (no app nativa) | Se abre desde una URL pública, que es lo que evalúa el jurado; se instala sin tienda | Sin Bluetooth ni Wi-Fi Direct; dependemos del navegador para la cámara y el almacenamiento |
| QR como canal de relevo | Funciona en cualquier teléfono con cámara, sin emparejar ni tener red, y se puede auditar visualmente | Ancho de banda bajo: 20 registros = 3 fragmentos (medido); 50 = 5 |
| Formato posicional + deflate + Base45 | 20 registros caben en un QR v21 en vez de v34 con JSON crudo (medido) | El formato es menos legible y obliga a versionar el esquema |
| Id = hash del contenido, recalculado en el servidor | Idempotencia: la misma ficha llega una sola vez aunque la traigan varios portadores | Corregir una ficha produce una ficha nueva, no una edición |
| Firma por dispositivo (en construcción) | Detecta si alguien alteró la ficha durante el relevo | **No prueba la identidad** del evaluador; eso exigiría registrar las claves en la municipalidad |
| TS vanilla + Vite (sin React) | Bundle chico; precache ~2 MB | Más código de UI a mano |
| Cloudflare Pages + Worker + D1 | Gratis, global y con despliegue en minutos | Sin PostGIS; las consultas espaciales se hacen en el cliente |
| Mapa base en KV | Pages no aceptaba el archivo de 2,6 MB | Un componente más de infraestructura |
| PMTiles z11, no z12 | 2,6 MB frente a 5,7 MB: guardar sin red en Fast 3G ya toma 18,5 s (medido) | Se ven carreteras pero no calles locales |
| Sin autenticación ni límite de tasa en la API | Ahorra tiempo de hackathon | El endpoint de prueba es público; no sirve para producción real |
| Sin integración con SINPAD ni EDAN Digital | No tenemos acceso ni autorización | El dato llega al COE por nuestro panel, no al sistema oficial |
