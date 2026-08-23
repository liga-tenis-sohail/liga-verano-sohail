# Runbook — Liga de Tenis Sohail

Guía de operaciones. Volvé acá cuando algo se rompa o cuando quieras hacer un cambio de infraestructura.

---

## Tabla de contenidos

1. [Deploy inicial de la Tanda 1](#1-deploy-inicial-de-la-tanda-1)
2. [Rotar SESSION_SECRET](#2-rotar-session_secret)
3. [Restaurar desde un backup](#3-restaurar-desde-un-backup)
4. [Pausa de Supabase por inactividad (7 días)](#4-pausa-de-supabase-por-inactividad-7-días)
5. [Ver el audit log](#5-ver-el-audit-log)
6. [Investigar un incidente de seguridad](#6-investigar-un-incidente-de-seguridad)
7. [Configurar reset por email (Resend)](#7-configurar-reset-por-email-resend)
8. [Alertas de errores 5xx](#8-alertas-de-errores-5xx)

---

## 1. Deploy inicial de la Tanda 1

**Orden importa.** Hacé cada paso completo antes de pasar al siguiente.

### 1.1 SQL — crear tablas nuevas

En Supabase Dashboard → SQL Editor → New query, pegá y ejecutá `03_rate_limits_audit_reset.sql`. Debe decir "Success. No rows returned".

### 1.2 Bucket de backups

Supabase Dashboard → Storage → New bucket:
- Nombre: `backups`
- Public: **NO** (dejalo privado)
- File size limit: 50 MB
- Allowed MIME types: dejar vacío

### 1.3 Environment variables en Vercel

Vercel Dashboard → Settings → Environment Variables → agregar:

| Variable | Valor | Notas |
|---|---|---|
| `CRON_SECRET` | Generá uno: `openssl rand -base64 32` | Vercel lo pasa como `Authorization: Bearer` a los crons |
| `BACKUP_SECRET` | Generá uno: `openssl rand -base64 32` | Alternativo, para llamadas manuales a `/api/backup` |
| `APP_BASE_URL` | `https://liga-tenis-sohail.vercel.app` | Para armar links en emails de reset |
| `RESEND_API_KEY` | (opcional, para emails) | Ver sección 7 abajo |
| `RESET_FROM_EMAIL` | (opcional) | Ej: `"Liga Sohail <no-reply@tudominio.com>"` |

Aplicar a: **Production, Preview, Development** (todos).

### 1.4 Subir archivos al repo

Copiá al repo estos archivos manteniendo su ruta:

```
├── .github/workflows/check.yml       (nuevo)
├── vercel.json                        (nuevo — cron cada 3 días)
├── package.json                       (actualizado — engines Node 20)
├── api/
│   ├── _lib.js                        (actualizado)
│   ├── audit.js                       (nuevo)
│   ├── backup.js                      (nuevo)
│   ├── health.js                      (nuevo)
│   ├── liga.js                        (actualizado — audit)
│   ├── login.js                       (actualizado — rate limit compartido + audit)
│   ├── passkey.js                     (actualizado — 4 acciones nuevas + audit)
│   ├── password.js                    (actualizado — audit)
│   └── reset.js                       (nuevo — pending Resend config)
└── public/index.html                  (sin cambios en esta tanda)
```

Git commit + push. Vercel deploya solo.

### 1.5 Chequeo post-deploy

Cuando el deploy esté Ready:

```bash
# Health check debe devolver 200
curl https://liga-tenis-sohail.vercel.app/api/health

# El cron debe aparecer en Vercel Dashboard → Settings → Crons
```

Probá manualmente el backup:

```bash
curl -H "x-backup-secret: TU_BACKUP_SECRET" https://liga-tenis-sohail.vercel.app/api/backup
```

Debe responder `{"ok": true, "file": "backup-...", "sizeBytes": ..., "totalMs": ...}` y aparecer un archivo en el bucket `backups`.

---

## 2. Rotar SESSION_SECRET

**Cuándo:** al menos una vez al año, o inmediatamente si sospechás filtración.

**Efecto:** todos los usuarios logueados quedan deslogueados (sus tokens dejan de validar).

**Cómo:**

1. Generar nueva clave: `openssl rand -base64 48`
2. Vercel → Settings → Environment Variables → `SESSION_SECRET` → editar → pegar nueva → guardar
3. Vercel → Deployments → tres puntos del último deploy → **Redeploy** (para forzar nueva instancia con la env nueva)
4. Todos los usuarios verán "Tu sesión expiró" en la próxima acción. Es esperable.

---

## 3. Restaurar desde un backup

**Cuándo:** perdiste datos, hubo un DELETE accidental, la base se corrompió.

**Los backups están en:** Supabase Dashboard → Storage → `backups` → archivos `backup-YYYY-MM-DDTHH-MM-SS-mmmZ.json.gz`

**Restauración parcial (solo una liga):**

1. Descargar el backup deseado desde el Storage.
2. Descomprimir: `gunzip backup-....json.gz`
3. Abrir el JSON, ubicar el objeto en `tables.liga_state` cuya `id` coincide con la liga a restaurar.
4. SQL Editor:
   ```sql
   UPDATE liga_state
     SET data = '<pegá acá el JSON de data>'::jsonb
     WHERE id = '<liga-id>';
   ```

**Restauración total (BORRA TODO Y REEMPLAZA):**

⚠️ Peligroso. Solo si tenés certeza. Hacé un backup manual PRIMERO.

1. `TRUNCATE liga_state, liga_index, jugadores, passkeys CASCADE;`
2. Correr un script Node que lea el JSON y haga bulk insert. (Sin script listo hoy — armamos uno si es necesario.)

---

## 4. Pausa de Supabase por inactividad (7 días)

Supabase Free pausa proyectos con 7 días sin queries. Mitigaciones:

**A. Reactivación manual** (simple, cuando ocurre)
Supabase Dashboard → tu proyecto → botón "Restore project". Tarda 1-2 minutos.

**B. Ping automático** (previene la pausa)
El cron de backup cada 3 días ya cumple esta función: hace queries frecuentes. Con backup activo, la pausa no debería ocurrir.

Si querés un ping extra por si acaso, agregá otro cron en `vercel.json`:

```json
{
  "path": "/api/health",
  "schedule": "0 3 * * *"
}
```

(Health check diario a las 3 AM. Cuenta como actividad para Supabase.)

---

## 5. Ver el audit log

**Endpoint:** `GET /api/audit` (requiere token de superadmin).

**Filtros:**
- `?limit=50` — cantidad (max 500, default 100)
- `?action=liga.eliminar` — prefijo de acción
- `?actor=marcos` — quién hizo la acción
- `?target=liga-verano-2026` — sobre qué
- `?since=2026-08-01` — desde qué fecha

**Ejemplo:**
```bash
TOKEN="tu_token_superadmin"
curl -H "Authorization: Bearer $TOKEN" "https://liga-tenis-sohail.vercel.app/api/audit?action=liga&limit=20"
```

**Acciones registradas:**
- `login.ok` / `login.ok.admin` / `login.fail`
- `liga.crear` / `liga.eliminar` / `liga.cerrar` / `liga.reabrir` / `liga.renombrar`
- `jugador.eliminar`
- `pass.self_change` / `pass.admin_reset` / `pass.reset_by_email`
- `passkey.delete` / `passkey.rename` / `passkey.admin_delete`
- `reset.request.ok` / `reset.request.no_email` / `reset.email.fail`
- `backup.ok` / `backup.fail`

En la Tanda 2 vamos a agregar un panel visual para verlo desde la app sin `curl`.

---

## 6. Investigar un incidente de seguridad

**Escenario:** "Alguien entró a mi cuenta."

1. **Audit log** de esa cuenta:
   ```
   /api/audit?actor=NOMBRE_DEL_USUARIO&limit=200
   ```
2. Buscar `login.ok` con IPs que no reconozcas → si aparecen, la clave se filtró.
3. **Acción inmediata:** cambiar la clave del usuario desde el panel admin, y borrar todas sus passkeys por si le habían activado Face ID desde otro dispositivo:
   ```bash
   # (con la UI de la Tanda 2, esto será un botón; hoy es via /api/passkey admin-list-user + admin-delete-user)
   ```
4. Revisar `login.fail` para ver si hubo brute force previo.

**Escenario:** "Se eliminó una liga sin querer."

1. `/api/audit?action=liga.eliminar` — quién y cuándo.
2. Restaurar desde backup (sección 3).

---

## 7. Configurar reset por email (Resend)

El endpoint `/api/reset` está listo. Solo falta la cuenta de email.

1. Crear cuenta gratis en [resend.com](https://resend.com) (3.000 mails/mes).
2. Dashboard → API Keys → Create API Key (nombre: "Liga Sohail production").
3. Copiar la key (`re_...`).
4. Vercel → Env vars → `RESEND_API_KEY` = `re_...`
5. **Opcional pero recomendado:** Agregar un dominio propio en Resend (evita que emails caigan en spam):
   - Resend → Domains → Add Domain → seguir instrucciones DNS
   - Una vez verificado, `RESET_FROM_EMAIL` = `"Liga Sohail <no-reply@tudominio.com>"`
   - Sin dominio propio, usa `onboarding@resend.dev` (solo para pruebas — mensajes tipo "de Resend")

**Probar:**
```bash
curl -X POST https://liga-tenis-sohail.vercel.app/api/reset \
  -H "Content-Type: application/json" \
  -d '{"accion":"request","user":"tu_usuario","ligaId":"liga-actual"}'
```

Debe llegar un email con un link `?reset=...`. En la Tanda 2 agregamos el link "Olvidé mi contraseña" en el login y la pantalla de confirmación.

---

## 8. Alertas de errores 5xx

Vercel Hobby no incluye alertas nativas. Opciones:

**Opción A: Sentry (gratis para hobby, 5.000 errores/mes)**
1. Crear cuenta en [sentry.io](https://sentry.io) → New Project → Node.js.
2. Copiar DSN.
3. `npm install @sentry/node` (agregar a `package.json`).
4. En cada endpoint, envolver el `try/catch` global con `Sentry.captureException(e)`.
5. Sentry Dashboard → Settings → Alerts → New Alert → email cuando > 5 errores/hora.

**Opción B: UptimeRobot (gratis)**
1. [uptimerobot.com](https://uptimerobot.com) → Add Monitor.
2. Tipo: HTTP(s).
3. URL: `https://liga-tenis-sohail.vercel.app/api/health`
4. Intervalo: 5 minutos.
5. Alerta a tu email cuando responda != 200.

**Opción C: Better Stack (gratis)**
Similar a UptimeRobot, pero con status page pública.

Recomendado: **B + C** (uptime) por ahora. **A** cuando tengas más tiempo — es más completo pero requiere más setup.

---

## Notas finales

- **Bus factor = 1** por diseño (Marcos es el único dev). Este runbook está pensado para reducir el impacto: si algo falla, seguí las instrucciones paso a paso.
- Los archivos `.js` de la carpeta `api/` son endpoints serverless: cada uno se ejecuta independientemente. Si uno se rompe, los demás siguen funcionando.
- La memoria de las Functions **no persiste entre invocaciones**. Todo estado va a Supabase.
- El caché en memoria (ej. `_blockedCache` en `_lib.js`) es solo para performance intra-instancia; expira en 60 segundos.
