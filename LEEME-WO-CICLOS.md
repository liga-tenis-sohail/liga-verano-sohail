# Liga Sohail — Instalación del parche WO y cierre de ciclos v5.2

## Qué contiene este ZIP

Este es un **parche**, no el proyecto completo. Contiene **22 archivos para reemplazar**, **4 archivos nuevos de código y pruebas** y este instructivo (`LEEME-WO-CICLOS.md`): **27 archivos en total**. No hay archivos que borrar.

Se calculó comparando `liga-verano-sohail-main.zip` —el ZIP original que enviaste— con `liga-sohail-WO-y-ciclos-v5.2.zip` —la entrega completa anterior—. Los 26 archivos de código, recursos y pruebas son idénticos a los de aquella entrega; solo se adaptó el instructivo para esta instalación parcial. No se añadieron nuevas correcciones funcionales.

**Aplicalo sobre el proyecto existente, no sobre un repositorio vacío.** Si ya instalaste la entrega completa v5.2, no necesitás aplicar este parche. Si cambiaste alguno de estos archivos después del ZIP original, compará esos cambios antes de sobrescribirlos para no perderlos.

## 1. Antes de copiar

Conservá una copia del código actual y un backup válido de los datos de la liga. Usá primero tu entorno de pruebas. No pruebes cierres de ciclo ni WO ficticios en una liga real: esas acciones sí modifican datos.

No cambies ni subas claves, contraseñas o archivos `.env`. Este parche no sustituye tu configuración privada.

## 2. Dónde va cada archivo

Descomprimí `parche-sohail-WO-ciclos-v5.2.zip`. Encontrarás directamente:

```text
api/
public/
scripts/
tests/
LEEME-WO-CICLOS.md
```

Copiá ese contenido a la **raíz de tu repositorio existente**, donde ya están `package.json`, `vercel.json` y las carpetas `api/` y `public/`.

**Fusioná las carpetas y reemplazá únicamente los archivos del mismo nombre. No borres ni reemplaces las carpetas completas:** el parche no contiene los otros archivos que la aplicación necesita. Si el sistema ofrece reemplazar una carpeta entera en lugar de fusionarla, cancelá esa acción y copiá los archivos individuales a sus rutas correspondientes.

Ejemplos:

```text
parche/api/save.js              → tu-repositorio/api/save.js
parche/public/cycle-close.js    → tu-repositorio/public/cycle-close.js
parche/scripts/public-assets.json → tu-repositorio/scripts/public-assets.json
```

No crees `public/public/`, `api/api/` ni una segunda carpeta `liga-verano-sohail-main/` dentro del repositorio. No copies todos los archivos sueltos a la raíz: deben conservar su ruta.

## 3. Guardar y comprobar la actualización

Actualizá **frontend, API, scripts y pruebas juntos, en el mismo commit**. No publiques solo `public/` ni un archivo ZIP como sustituto del código.

Si cargás los archivos desde la web de GitHub, hacelo en la raíz del repositorio y conservá las carpetas indicadas. Antes de confirmar, revisá que cada ruta coincida con el inventario del final de esta guía y que no se estén borrando otros archivos. Si tus repositorios de pruebas y producción son distintos, repetí la carga en producción solo después de validar pruebas y comprobar que su base es compatible con este parche.

El workflow existente **`.github/workflows/check.yml` no cambió**, por eso no está incluido. Conservá el de tu repositorio: ya estaba presente en el ZIP original. Lo mismo sucede con `package.json`, `vercel.json`, los scripts de instalación y los archivos SQL; no necesitan reemplazo por esta entrega.

El workflow del proyecto ejecuta las comprobaciones en los pushes a `main`, en las solicitudes de incorporación dirigidas a `main` y al lanzarlo manualmente. Revisá el resultado del **commit nuevo**, no solo una ejecución anterior. Debe terminar sin fallos antes de dar la actualización por lista.

Para comprobarlo localmente, desde la raíz del proyecto y con **Node 22**, ejecutá:

```sh
node scripts/install-dependencies.cjs
npm run release:check
```

El primer comando usa el instalador existente y necesita acceso al registro de dependencias. Si no hay `package-lock.json`, lo genera y muestra una advertencia: la revisión de ese archivo sigue siendo un pendiente separado. No borres un lockfile existente para evitar un error ni desactives los controles de publicación.

El segundo comando ejecuta integridad, pruebas, control de seguridad del código, construcción pública y verificación de los archivos publicables. Usa la base simulada de los tests; **un resultado correcto no certifica la base ni el despliegue reales**.

## 4. Publicar sin cambiar la configuración

Publicá desde el proceso habitual del repositorio que ya tenés configurado, con todos los archivos del parche en el mismo commit. Comprobá que el despliegue terminado corresponde a ese commit.

**No hace falta ejecutar SQL nuevo por estas dos mejoras.** Se guardan dentro del estado JSON existente. Esto no elimina el requisito de tener instaladas las migraciones anteriores que necesita tu aplicación. No ejecutes `supabase_setup.sql` como instalador ni uses el texto antiguo de `INSTRUCTIONS.txt` para concluir que una base vacía está lista.

Este paquete no incluye datos de la liga y no cambia por sí solo las variables de entorno. No publiques antes de comprobar que la actualización pasó los controles del proyecto.

## 5. Comprobación en la liga de pruebas

Recargá la aplicación después del despliegue; si una pestaña conserva la interfaz anterior, cerrala y abrí la app de nuevo.

### WO flexible

Entrá como administrador, abrí Cargar resultado y elegí **W.O. · no se jugó**. Después de indicar al ausente deben aparecer dos casillas independientes: sumar 1 punto y contar 1 partido jugado —derrota— al ausente. En un resultado confirmado:

| Selección para el ausente | Puntos del ausente | PJ del ausente |
|---|---:|---:|
| Ninguna | 0 | 0 |
| Solo punto | 1 | 0 |
| Solo partido | 0 | 1 |
| Ambas | 1 | 1 |

En todos los casos el ganador debe recibir **3 puntos, 1 PJ y 1 victoria**. Probá las cuatro combinaciones en datos de prueba y recargá la app para confirmar la persistencia. Los WO históricos sin configuración conservan 1 punto y 1 PJ al ausente hasta que un administrador los edite. No deben modificarse por el solo hecho de instalar el parche.

### Cierre con jugadores empatados en 0

Con el administrador original de la liga o el superadministrador, abrí el cierre de un ciclo con al menos dos jugadores activos del mismo grupo empatados en **0 puntos de partidos del grupo**. Debe pedir el destino de cada jugador, respetando las plazas configuradas.

Probá cancelar o dejar la revisión incompleta: no debe habilitarse el siguiente ciclo. Después completá el reparto, confirmá y guardá. Recargá la app y comprobá los grupos del siguiente ciclo. Usá únicamente una liga de pruebas para este ensayo.

## 6. Si algo falla

Si un control o el despliegue falla, guardá el mensaje completo y comprobá primero las rutas, los cuatro archivos nuevos y que no falte ninguna carpeta de la base. No desactives permisos ni comprobaciones para forzar la publicación.

Si necesitás volver atrás, conservá el commit anterior y los backups. **Revertir el código no revierte los datos**: después de guardar WO con las nuevas opciones o cerrar ciclos, el código antiguo puede interpretar esos datos de otra manera. No restaures un backup ni retrocedas código a ciegas si ya hubo actividad real; preservá los resultados nuevos y evaluá ambos estados antes de recuperar.

## 7. Inventario exacto

### Reemplazar — 22 archivos

```text
api/_restore.js
api/_validation.js
api/save.js
public/admin-ciclos-config.js
public/core-estado.js
public/history-leagues.js
public/index.html
public/jugadores-perfiles.js
public/login-auth-p2.js
public/persistencia.js
public/result-editor.js
public/resultados-y-grupos.js
public/score-rules.js
public/shell-render.js
public/ui-modern.css
public/ui-modern.js
scripts/public-assets.json
tests/passwords-injury-access-v491.test.js
tests/release-v400.test.js
tests/result-guard.test.js
tests/retirement-partials-v512.test.js
tests/rules-sections-injuries.test.js
```

### Agregar — 4 archivos de código y pruebas

```text
api/_cycle-close.js
public/cycle-close-ui.js
public/cycle-close.js
tests/wo-cycle-v520.test.js
```

### Agregar — documentación

```text
LEEME-WO-CICLOS.md
```

**Los archivos que no figuran en este inventario no se tocan.** No se incluye `.github/workflows/check.yml` porque es idéntico al de la base, ni se incluyen los 172 archivos sin cambios.

## Alcance pendiente

El parche solo incorpora las mejoras de WO y de cierre con empates a cero ya entregadas. No corrige el fallo del historial administrativo con más de 10.000 operaciones ni los demás pendientes de documentación global, dependencias o retención de snapshots. No se publicó en GitHub/Vercel ni se modificó la base real al preparar este ZIP.
