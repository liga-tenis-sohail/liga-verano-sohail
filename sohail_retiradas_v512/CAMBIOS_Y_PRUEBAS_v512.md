# RET parcial — cambios, pruebas y límites v5.1.2

Preparación: 8 de octubre de 2026. Base leída en GitHub: `fafc3260d21292eecae9a500a17513c2f9e1d90d`, rama `main`, que ya incluye v5.1.1.

## Problema confirmado

La función compartida `validRetirement` solo aceptaba sets terminados; el editor, su ayuda ES/EN y una prueba de regresión exigían lo mismo. Además, el lector estadístico trataba ese parcial como no resuelto y el cálculo de grupo podía contarlo como si fuera un set terminado. No era suficiente habilitar el número en el campo del navegador.

## Qué se cambió

La validación de un partido normal permanece sin cambios. Solo la validación RET admite el último set no terminado que sea alcanzable en el formato actual. Los sets anteriores deben estar completos, sin continuar un partido ya definido. Se conservan el límite de dos sets regulares y la representación 1–0/0–1 del supertiebreak para partidos normales. El formato de datos no necesita una migración.

El API sigue exigiendo el jugador retirado y un ganador que sea el otro participante, y ahora rechaza una bandera `wo` de tipo cadena o número. La bandera interna existente representa los resultados especiales; el formulario diferencia RET con juego de W.O. sin juego. No se cambian los permisos de carga, confirmación, corrección ni lesión.

En el editor se eliminan únicamente filas finales no iniciadas. Un cero debe escribirse explícitamente si el otro lado tiene juegos; no se convierte un campo faltante en cero ni se desplaza silenciosamente el segundo set al primero.

Clasificación, desempates, historial y H2H reconocen los games realmente disputados. Solo un set completo cuenta como set ganado/perdido. El marcador y el ganador se conservan separados: quien se retira pierde aunque iba ganando. La fórmula numérica de rating no se editó, ni el número de partidos de su ventana. Esta entrega no ejecuta ni certifica de nuevo la batería numérica completa del rating.

## Pruebas ejecutadas en esta entrega

| Comprobación | Resultado |
|---|---|
| `node --test tests/retirement-partials-v512.test.js` | **132 aprobadas; 0 fallidas, canceladas u omitidas** |
| Comparación exhaustiva, dentro de una de esas 132 pruebas | **6.643 combinaciones** de cero/uno/dos sets con valores 0–8; comparación contra recorrido independiente de marcadores alcanzables y contra el lector de historial |
| `node --check` sobre los siete archivos técnicos del paquete | **7/7** |
| Formulario real aislado en Chromium, con adaptadores locales | **28 comprobaciones; sin errores de script observados** |
| Reconstrucción de seis archivos originales a reemplazar | **6/6 hashes Git originales coinciden con el commit base** |

Las pruebas focalizadas ejecutan las reglas compartidas, el validador real del API, la validación del editor mediante VM, la función `computeStats` extraída del archivo actual y las funciones reales de historial/H2H. Incluyen grupos y playoffs, jugador/admin/superadmin, permisos, confirmación, campos faltantes, datos inválidos y regreso de RET a partido completo.

La comprobación de navegador usa el editor y la política reales con personas ficticias, estilos locales y un adaptador de mutación en memoria. Se verificó la entrada 4–0, el rechazo normal, una retirada con primer set completo, editar el registro y los textos ES/EN, incluido un viewport móvil oscuro. Las capturas son del formulario aislado, **no de la liga de producción**.

La extracción del ZIP final se prueba nuevamente sobre una copia de los módulos base necesarios. Los logs y el manifiesto identifican exactamente qué archivos se probaron.

## Límites y verificaciones pendientes

**No se ejecutó aquí `npm test` de toda la repo ni el build completo de publicación.** No estaba montada una copia completa de las dependencias/archivos actuales. Los resultados de v5.1.1 no se reutilizan como prueba de esta entrega: las 132 pruebas anteriores son nuevas comprobaciones focalizadas. El Pull Request debe ejecutar la batería completa actual y su construcción antes del Merge.

No se enviaron resultados a Supabase real, no se alteró ninguna tabla, no se ejecutó SQL y no se publicó en GitHub/Vercel. Falta comprobar en el despliegue nuevo el próximo caso real de retirada y su consulta posterior. Los ensayos aislados no equivalen a comprobar autenticación, red, persistencia, CSP, passkeys físicas ni todos los dispositivos.

No se cambia la restauración histórica para borrar o reinterpretar automáticamente registros antiguos: sus anomalías siguen el flujo de revisión existente. La exigencia estricta de marcador normal se aplica en la carga/corrección de resultados. Si había RET parciales antiguos, las lecturas corregidas pueden variar sus totales derivados sin cambiar su registro.

## Alcance conservado

Sin SQL, endpoints nuevos, variables, dependencias, cambios de región, cron o seguridad de sesiones. No se editan el flujo de login/guardado de v5.1.1, las lesiones ni los controles de caché/red. La compilación existente utiliza nombres de recursos derivados de su contenido: no es necesario reemplazar `index.html` ni la lista de recursos por modificar estos archivos ya incluidos.
