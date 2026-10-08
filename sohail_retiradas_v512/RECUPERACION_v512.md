# Recuperación de código — v5.1.2

El ZIP de referencia `sohail_respaldo_codigo_pre_v512.zip` conserva los seis archivos reemplazados tal como estaban en el commit `fafc3260d21292eecae9a500a17513c2f9e1d90d`. **No contiene la base de datos ni es una restauración de resultados.**

Si las pruebas del Pull Request fallan, no lo fusiones. La producción permanece con la versión anterior; corregí el error antes de seguir.

Si ya publicaste y todavía no se guardaron retiradas parciales con la regla nueva, puede revertirse el commit completo de esta entrega mediante otra rama y Pull Request, comprobando el resultado antes de publicar. En una reversión manual hay que restituir los seis archivos y retirar `tests/retirement-partials-v512.test.js`, que comprueba el comportamiento nuevo.

**Si ya hay parciales guardados, no vuelvas ciegamente a la validación anterior:** puede rechazar nuevas correcciones de esos partidos y volver a mostrar balances incompletos o incorrectos. Preferí un fix compatible con ambos datos. No completes juegos ficticios, no borres partidos y no ejecutes SQL de limpieza para forzar compatibilidad.

Conservá borradores y cualquier aviso de guardado no confirmado antes de recargar o cerrar pestañas. La reversión debe limitarse a v5.1.2; no reemplaces partes de seguridad ni el backend por paquetes históricos.
