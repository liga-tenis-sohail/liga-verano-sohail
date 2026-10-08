# RET: sets incompletos solo por retirada — v5.1.2

## Qué descargar y subir

El paquete `sohail_retiradas_v512.zip` contiene 7 archivos técnicos completos. Se aplica sobre la v5.1.1 de estabilidad: commit `fafc3260d21292eecae9a500a17513c2f9e1d90d`.

**No hace falta SQL, cambiar claves, cambiar de plan ni volver a cargar paquetes anteriores.** No se cambió producción durante la preparación.

## Instalar en 3 pasos

1. En GitHub → Code, seleccioná `main` y creá la rama **`retiradas-v512`**. Descomprimí el ZIP. Desde la raíz de la repo, subí sus carpetas **`api/`, `public/` y `tests/`**, conservando las rutas. Podés cargar en varias tandas: guardá todas en esa misma rama. No borres los archivos existentes que no vienen en esta entrega.
2. Abrí **un solo Pull Request**: base `main`, compare `retiradas-v512`. Cuando estén los siete archivos, esperá que aprueben **Integridad, regresión y seguridad local** y los demás controles que se ejecuten. No saltees pruebas ni hagas Merge con una X. Después: **Merge pull request → Confirm merge**.
3. Esperá el despliegue de **Production** del nuevo commit en Vercel. Terminá o descargá cualquier borrador pendiente antes de cerrar las pestañas anteriores y volvé a abrir la dirección habitual de la liga. No hace falta mover archivos después del Merge.

**No reemplaces `check.yml`, `vercel.json`, `package.json`, `.gitignore`, `.vercelignore`, `index.html` ni `scripts/public-assets.json`. No ejecutes SQL.** No subas un ZIP cerrado, el respaldo, la evidencia ni `dist/`. La documentación del paquete es de consulta; los siete archivos técnicos están listados en `ARCHIVOS_v512.md`.

## Cómo cargar una retirada

En **Cargar resultado**, o al editar un marcador desde la matriz/cuadro:

- Elegí **RET · retirada** y seleccioná **quién se retiró**.
- Escribí ambos números del último set, también el cero: **4 y 0**, no 4 y un campo vacío.
- Se conservan los sets anteriores completos. Solo el último registrado puede estar incompleto: **6–4 / 3–2 RET** es válido; **4–0 / 6–2 RET** no lo es porque no se puede empezar otro set dejando el primero sin terminar.
- Dejá vacíos los sets que no se iniciaron. No se completan automáticamente con juegos ficticios.

Al volver a **Partido completo**, todos los sets deben ser válidos y estar terminados: **6–0 a 6–4, 7–5 o 7–6**, o invertidos. Con un set para cada jugador sigue siendo obligatorio el supertiebreak **1–0 / 0–1**; no se habilita un tercer set regular ni una nueva forma de anotar puntos de supertiebreak.

El rival de quien se retira gana el partido aunque estuviera perdiendo el marcador. Un parcial 4–0 suma cuatro juegos reales, **no un set ganado/perdido ni seis juegos inventados**. Se mantienen las reglas de puntos existentes. W.O. sin juego y lesión no jugada siguen siendo situaciones distintas.

## Comprobar después de publicar

Revisá que 4–0 sin RET muestre error, y que con RET se habilite la carga al indicar quién se retiró. Probá la validación sin guardar partidos ficticios en la liga real. En el próximo caso real, verificá el marcador y las estadísticas después de confirmar el guardado. El jugador conserva su carga pendiente de validación; el permiso administrativo no cambia.

No se modifican automáticamente los partidos almacenados. Si ya existían retiradas parciales históricas, la nueva lectura puede corregir sus balances de sets/juegos y su reconocimiento en H2H, sin reescribir los resultados originales.

## Si algo falla

No fuerces otro guardado ni borres datos. Conservá el aviso y el borrador. Si falla GitHub/Vercel, revisá el primer error del commit nuevo; no desactives las protecciones. El respaldo adjunto es solo de código y debe consultarse con `RECUPERACION_v512.md` antes de usarlo.
