# Lectura QR con cuadros de cámara SIMULADOS

Generado por `npx vite-node scripts/qr-camara-bench.ts` el 2026-10-18T01:18Z. **SIMULADO**: perspectiva, giro ±17°, QR al 30–60 % del lado corto, desenfoque, reflejo, moiré, viñeta y ruido (tests/qr-camara-sim.ts). No reemplaza la prueba con 2 celulares.

| Cuadro | Payload | Antes (cuadro entero a 800 px) | Ahora (recortes) | Recorte que leyó | ms por recorte (Node) |
|---|---|--:|--:|---|---|
| 1280×720 | 1 registro (v7) | 16/20 | **20/20** | c60x2:13 c85x1.5:7 | c60x2 62 · c85x1.5 75 · c85@480 48 · c100@640 108 · c50@960 81 · c70@800 54 · todo 142 |
| 1280×720 | 20 registros, fragmento chunk 450 (v13) | 8/20 | **19/20** | c85x1.5:7 c60x2:8 c70@800:2 c50@960:1 c85@480:1 | c60x2 78 · c85x1.5 86 · c85@480 68 · c100@640 165 · c50@960 97 · c70@800 68 · todo 216 |
| 1280×720 | 20 registros, fragmento chunk 300 (v11) | 8/20 | **18/20** | c60x2:8 c85x1.5:9 c85@480:1 | c60x2 71 · c85x1.5 80 · c85@480 72 · c100@640 159 · c50@960 90 · c70@800 62 · todo 238 |
| 1920×1080 | 1 registro (v7) | 19/20 | **19/20** | c85x1.5:11 c60x2:8 | c60x2 84 · c85x1.5 94 · c85@480 30 · c100@640 60 · c50@960 86 · c70@800 65 · todo 64 |
| 1920×1080 | 20 registros, fragmento chunk 450 (v13) | 14/20 | **19/20** | c60x2:9 c85x1.5:9 todo:1 | c60x2 88 · c85x1.5 102 · c85@480 37 · c100@640 73 · c50@960 91 · c70@800 72 · todo 68 |
| 1920×1080 | 20 registros, fragmento chunk 300 (v11) | 8/20 | **19/20** | c85x1.5:8 c60x2:10 c85@480:1 | c60x2 92 · c85x1.5 101 · c85@480 37 · c100@640 70 · c50@960 93 · c70@800 72 · todo 64 |

Fallos (semilla y condiciones): 1280×720 20 registros, fragmento chunk 450 (v13) seed 1280521 (QR 0.57 del lado, 5.4 px/módulo, giro -15°, blur 0, reflejo 41); 1280×720 20 registros, fragmento chunk 300 (v11) seed 1280456 (QR 0.4 del lado, 4.1 px/módulo, giro -4°, blur 2, reflejo 34); 1280×720 20 registros, fragmento chunk 300 (v11) seed 1280609 (QR 0.48 del lado, 5 px/módulo, giro -8°, blur 2, reflejo 0); 1920×1080 1 registro (v7) seed 1920370 (QR 0.47 del lado, 9.6 px/módulo, giro -2°, blur 3, reflejo 0); 1920×1080 20 registros, fragmento chunk 450 (v13) seed 1920504 (QR 0.31 del lado, 4.4 px/módulo, giro -13°, blur 2, reflejo 0); 1920×1080 20 registros, fragmento chunk 300 (v11) seed 1920524 (QR 0.57 del lado, 8.9 px/módulo, giro 12°, blur 3, reflejo 0)
