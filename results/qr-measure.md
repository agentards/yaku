Chunk 450 chars/QR, ECC M. "v—" = no cabe en un QR (máx. v40).

| N | JSON verboso B | JSON posicional B | deflate B | base45 chars | 1 QR base45/alnum | 1 QR b64url/byte | 1 QR JSON/byte | fragmentos (450) | versión máx frag | decode jsQR 4px | decode 2px | reensamblado | ms jsQR total |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|:-:|:-:|--:|
| 1 | 183 | 108 | 98 | 147 | v7 | v8 | v7 | 1 | v7 | ✅ | ✅ | ✅ | 27.4 |
| 5 | 854 | 422 | 280 | 420 | v13 | v15 | v16 | 1 | v13 | ✅ | ✅ | ✅ | 16.8 |
| 10 | 1705 | 830 | 412 | 618 | v16 | v18 | v23 | 2 | v13 | ✅ | ✅ | ✅ | 15.4 |
| 20 | 3406 | 1650 | 655 | 983 | v21 | v24 | v34 | 3 | v13 | ✅ | ✅ | ✅ | 19.6 |
| 50 | 8519 | 4110 | 1326 | 1989 | v31 | v35 | v— | 5 | v13 | ✅ | ✅ | ✅ | 36 |
