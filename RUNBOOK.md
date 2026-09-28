# Sohail — operación segura · Parte 3 v5.0.0

Base: `52ebc3498520501593085fc018477d9631279028` (v4.9.1). Esta guía sustituye las instrucciones operativas anteriores; no modifica reglas deportivas.

## Publicación controlada

Configurar una regla clásica para `main`: Pull Request obligatorio, chequeo **Integridad, regresión y seguridad local**, rama actualizada y reglas aplicadas también a administradores. No exigir una segunda aprobación si no hay otro mantenedor. Desactivar force push, borrado y Lock branch. El archivo no activa esta configuración remota.

Trabajar en una rama, subir los archivos completos, abrir PR, esperar las comprobaciones y fusionar. Mantener Node 22, raíz del proyecto en la raíz de la repo, salida `dist/` y `npm run release:check`. No publicar `public/` directamente ni desactivar pruebas ante un error. No agregar `public: false` a vercel.json: el validador de esta liga lo rechazó.

Con GitHub CLI autenticado y permisos adecuados, `node scripts/check-branch-protection.cjs` consulta la regla sin modificarla. Un 403/404 no se considera éxito. La fuente sigue siendo visible mientras GitHub sea público: proteger una rama no equivale a privatizarla.

## Instalación de Parte 3

Conservar primero el código, una copia recuperable de los datos y el esquema. Incorporar el paquete previo y aprobar **Verificar SQL y dependencias Seguridad Parte 3**, sin secretos de producción. El workflow instala y prueba PostgreSQL 17 desechable y verifica la biblioteca de Excel descargada oficialmente.

Después ejecutar SQL10 y SQL11 en el Supabase actual: **55 filas, todas true**. Configurar `BACKUP_ENCRYPTION_KEY` en Production antes de publicar el código completo. Los archivos de `tests/security-db` y `tests/security-part3-db` nunca deben ejecutarse en Supabase real. No repetir el setup histórico ni abrir tablas para resolver un error.

La migración es aditiva. Cierra permisos actuales de las tablas y funciones de la aplicación; también permisos predeterminados del dueño ejecutor, globalmente y en `public`, para futuros objetos. Las nuevas funciones necesitan grants explícitos. No modifica objetos existentes de `auth`/`storage` ni los defaults de otros dueños.

## Cuentas y deporte

Se conservan contraseñas nuevas de 6–128 caracteres, `tenis` temporal y restablecimiento elegido por el administrador, con cambio personal obligatorio. También scrypt, passkeys, sesiones revocables de hasta 24 horas y verificación reciente de operaciones sensibles. No regresar a un backend anterior a Parte 2. El MFA de los paneles no agrega MFA obligatorio a todos los jugadores.

El rating conserva su motor, 50 partidos y umbral provisional de 15. Las lesiones siguen sin puntos de partido, con accesos desde jugadores/resultados y leyenda. Se conservan las cuatro categorías del reglamento.

## Límites operativos y navegador

Las cuotas compartidas usan ventanas fijas: público 120, acceso 30, lectura 240, escritura 60 y pesado 12 por 60 segundos. Una cabecera de sesión no autoriza por sí sola: el handler verifica el acceso. El backup tiene cuota global de tres por cinco minutos, después de comprobar su secreto. Varias personas bajo el mismo Wi-Fi comparten un presupuesto; un 429 requiere esperar Retry-After, no repetir escrituras automáticamente. Cada comprobación añade una consulta de base. No es una protección completa contra ataques distribuidos.

Los errores internos son genéricos y tienen un identificador. Las auditorías nuevas filtran ciertos campos sensibles, pero no reescriben registros anteriores; los registros existentes pueden incluir IP y actor.

La CSP limita scripts de elemento y conexiones, bloquea eval y marcos, pero **conserva atributos de eventos inline y estilos inline**. No es una CSP estricta completa ni sustituye la sanitización.

Excel usa SheetJS 0.20.3 a demanda. XLSX/JSON: hasta 5 MiB; XLS antiguo: 2 MiB. XLSX requiere un navegador compatible con `DecompressionStream('deflate-raw')`; si falta, pide actualizarlo. Revisa estructura y contenido expandido, con máximos de 64 MiB totales, 16 MiB por entrada y 3.000 entradas. No recorta una importación para hacerla pasar. XLS no tiene un análisis equivalente del contenedor. No se incluye un antivirus ni se garantiza detectar todo archivo hostil.

Las imágenes de mensajes admiten formatos raster revisados por firma y tamaño, no SVG/HTML. No es una decodificación forense completa de imágenes.

## Vercel y secretos

Activar Vercel Authentication + Standard Protection. Comprobar sin sesión URLs antiguas, aliases y proyectos adicionales; el dominio habitual de producción debe seguir mostrando el login de la liga. Mantener Git Fork Protection y Build Logs and Source Protection.

El nuevo backend devuelve PREVIEW_DATA_DISABLED en Preview. No activar `SOHAIL_PREVIEW_DATA_ACCESS=1` con claves productivas; las pruebas funcionales de preview necesitan una base aislada. Retirar secretos productivos de Preview/Development: el bloqueo de la API no protege un build malicioso que pueda leer variables. Ningún ZIP verifica el panel ni protege retroactivamente los despliegues antiguos.

No compartir claves, tokens o MFA en capturas, chats, issues o archivos. Ante exposición confirmada, rotar de forma coordinada; borrar código o privatizar no revoca una clave filtrada.

## Backups cifrados y retención

Generar PRIVADAMENTE una clave aleatoria de 32 bytes, por ejemplo con `openssl rand -hex 32`. Guardar los 64 dígitos hexadecimales en un gestor y una copia independiente, además de `BACKUP_ENCRYPTION_KEY` en Vercel Production. No reutilizar otros secretos. `BACKUP_KEY_ID` es una etiqueta opcional. Al rotar, conservar las claves e identificadores anteriores.

El cron sigue cada tres días. Obtiene una instantánea de 11 tablas, cifra con AES-256-GCM, sube al bucket privado y vuelve a descargar y verificar. Solo termina con verified:true tras completar esa comprobación. Sin clave, con bucket público o datos alterados, falla sin caer a texto plano ni borrar copias anteriores.

Los datos persistentes incluyen perfiles, credenciales y configuración. No se exportan sesiones activas, desafíos ni códigos temporales. El límite es 250.000 filas por tabla y 32 MiB sin comprimir: superarlo requiere un respaldo nativo, no una copia parcial.

No hay borrado automático. Revisar almacenamiento y retención; eliminar manualmente solo copias con sustituto independiente verificado. Los archivos .json.gz antiguos siguen siendo sensibles y no se recifran automáticamente. Los Excel descargados desde la aplicación son distintos: no reciben este cifrado.

**Sin la clave no se recupera una copia cifrada.** Conservar una copia independiente fuera de Supabase. No subir backups, claves, Excel o archivos descifrados a GitHub.

## Verificar y recuperar

Descargar una copia .sohail.enc fuera de la repo. Con Node 22 y la clave en el entorno privado:
`node scripts/verify-backup.cjs /ruta/privada/archivo.sohail.enc`
El comando verifica cifrado, integridad, descompresión y cantidades; no muestra contactos ni credenciales y no escribe en la base.

`--decrypt-to /ruta/privada/nuevo.json` crea un archivo sensible nuevo fuera de la repo, con permisos 0600. No sobrescribe archivos. No compartirlo y retirarlo cuando deje de ser necesario.

El ensayo del workflow restaura tablas ficticias en un esquema separado. No prueba una restauración total del proyecto real. Conservar también esquema, roles, objetos de Storage y configuración de infraestructura: no forman parte de esta exportación lógica.

Ante fallos, conservar el primer error y preferir una corrección hacia adelante. No ejecutar TRUNCATE ni sobreescribir cuentas con hashes antiguos. Una restauración de credenciales exige revisar revocaciones y secretos antes de reabrir la liga. Volver a v4.9.1 retiraría Parte 3 y reactivaría el backup antiguo sin cifrado; no es una reversión automática segura.

## Dependencias y límites pendientes

Se mantiene SimpleWebAuthn 13.3.2. No se certifica aquí su criptografía ni una auditoría npm. Cuando falte package-lock.json, usar el workflow Revisar dependencias (Parte 1); no fabricar un lock ni ejecutar npm audit fix --force. Conservar la licencia de Acorn, utilizado solo para construir y verificar, no publicado al navegador.

Sigue siendo necesario verificar la instalación real, los ajustes remotos, la copia independiente y la recuperación. Ninguna batería local certifica la ausencia de vulnerabilidades o impide toda imitación de la interfaz.

Fuentes oficiales consultadas el 26/09/2026:
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- https://vercel.com/docs/deployment-protection
- https://www.postgresql.org/docs/17/xfunc-volatility.html
- https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html
- https://docs.sheetjs.com/docs/getting-started/installation/standalone/
