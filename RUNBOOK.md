# Sohail — operación segura, Parte 1 integrada con v4.8 · v4.8.1

## Estado y alcance

La fuente base corresponde al commit `868c6b4ac393bedd31dfa8fdee8822b89ae64598`.
El usuario informa MFA con Google Authenticator en GitHub, Vercel y Supabase.
Esta entrega conserva ese MFA y no instala nada en la base de datos.
Integra las cuatro secciones de reglamento y la gestión de lesiones de v4.8.
No aplicar de nuevo los ZIP v4.7.1 o v4.8 después de esta entrega integrada.

Las instrucciones antiguas de compartir claves, usar contraseñas iniciales comunes,
pegar estados completos directamente en SQL o dar secretos de producción a todos
los previews quedan retiradas como procedimiento operativo.

## Publicar

Seguir `INSTRUCCIONES_PARTE1.md`. Conservar el proyecto Vercel y el dominio de los
jugadores. No cambiar `APP_BASE_URL`, RP ID ni los orígenes de passkeys por transferir
la propiedad del repositorio. Revisar siempre cuál es la cuenta personal vinculada
al propietario de Vercel antes de cambiar la conexión Git.

`vercel.json` fija la salida `dist`, `public: false` y un build con comprobaciones.
No subir `dist` generado, datos, archivos .env ni pruebas de navegador a GitHub.
Para trabajar localmente: Node 22; `npm run release:check`.

`check` conserva integridad y pruebas y agrega las comprobaciones de fuente y salida.
El build Vercel repite las comprobaciones, para no depender de que su integración
espere al workflow GitHub. Ninguna de estas medidas impide que un propietario con
permisos de escritura cambie la propia configuración; limitar colaboradores sigue
siendo necesario. GitHub Free privado no ofrece todas las protecciones obligatorias
que existen para repositorios públicos.

## Reglamento y lesiones

Normativa conserva REGLAMENTO. Horarios, Reservas y Cancelaciones son documentos
informativos separados; no se inventan políticas. Las lesiones se registran desde
Jugadores → Lesiones, solo por administradores autorizados. Una ausencia por lesión
no es un W.O.: no adjudica puntos, no consume la ventana del rating y no crea un
rival H2H. Dar el alta no borra las ausencias pasadas. Esta integración no modifica
los 19 archivos de ejecución entregados en v4.8.

## Dependencias

La dependencia de servidor sigue siendo `@simplewebauthn/server` 13.3.2. No se cambió
su implementación ni se verificó su criptografía en esta entrega.

Acorn 8.15.0, con licencia MIT y checksum, se incluye solo como herramienta local
de análisis/compactación; nunca se publica al navegador. Mantener su licencia.

Mientras falte un lockfile versionado, el instalador señala explícitamente que la
resolución inicial NO es reproducible. Generar y revisar `package-lock.json` con el
workflow manual **Revisar dependencias (Parte 1)**, descargar el artefacto y subir
ese archivo a la raíz. Después se usa `npm ci` y un lock incoherente falla: no se
reemplaza silenciosamente por una resolución nueva. No usar `npm audit fix --force`.

## Credenciales y sesiones — pendientes de Parte 2

Esta Parte 1 NO corrige aún la revocación al salir, NO cambia el formato PBKDF2
existente, NO genera invitaciones y NO activa verificación reciente para acciones
sensibles. La existencia de MFA en los paneles de infraestructura no incorpora MFA
a las cuentas de jugadores de la aplicación.

No pegar secretos ni códigos MFA en chats, issues, logs, archivos o comandos
compartidos. Si se confirma exposición de una clave real, priorizar su revocación
y rotación coordinada: ocultar el repositorio no basta. Un hash administrativo
histórico se retiró del setup legado; no se comprobó si coincide con una credencial
vigente. Su presencia anterior permanece en el historial Git hasta una revisión
específica. No borrar el historial como sustituto de rotar una credencial expuesta.

## Copias y recuperación

Respaldar el código y mantener una copia recuperable de la base antes de operaciones
de producción. El ZIP de código anterior NO es una copia de Supabase.
No ejecutar TRUNCATE ni pegar JSON de restauración sin un procedimiento probado.
Las mejoras de consistencia, copia independiente y recuperación se completan en
Parte 3. Esta Parte 1 conserva el cron existente de backup y no lo ejecuta.

Ante un fallo del nuevo build, no alterar la base: revisar el primer paso fallido.
Para una emergencia después del despliegue, usar una versión funcional conocida
según el instructivo, recordando que una versión anterior puede volver a exponer
archivos públicos. Una vez validada Parte 1, conservarla como punto de recuperación
para las Partes 2 y 3 y revisar las URLs antiguas de Vercel antes de retirarlas.

## Privacidad real

Revisar por separado: visibilidad GitHub; acceso a `_src` y `_logs`; URLs de
publicaciones anteriores; lista de colaboradores; conexiones Git; permisos de
previews. `public: false` de Vercel protege vistas de fuente/logs, no la interfaz.
El JavaScript enviado al navegador sigue siendo inspeccionable aunque tenga nombres
hash y menos comentarios. Copias ya descargadas no se recuperan por privatizar.

## Referencias de plataforma

- GitHub, transferencia de repositorios: https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository
- Vercel, integración Git y restricciones Hobby: https://vercel.com/docs/git
- Vercel, protección de código/logs: https://vercel.com/docs/project-configuration/security-settings
- npm, instalación reproducible: https://docs.npmjs.com/cli/v10/commands/npm-ci/

Documentación consultada el 25 de septiembre de 2026. Respetar las cuotas gratuitas
y la condición de uso personal no comercial de Vercel Hobby. No se verificó la
situación comercial de la liga ni se contrataron servicios.
