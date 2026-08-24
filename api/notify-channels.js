// =====================================================================
// GET/POST/PATCH/DELETE /api/notify-channels    (Authorization: Bearer <token>)
//
// Gestiona la tabla admin_notify_channels: los números de WhatsApp a los
// que se avisa cuando se carga o disputa un resultado.
//
// Restringido a admin original y superadmin (criterio puedeGestionarAdmins):
// abrir esto a admins ascendidos habilitaría que cualquiera agregue un número
// arbitrario y reciba notificaciones con datos sensibles de la liga.
// =====================================================================
const {
  auth, envOK, puedeGestionarAdmins, renewIfStale,
  SUPA_URL, supaHeaders, logAudit, clientIP
} = require('./_lib');
const { sendTestMessage } = require('./_lib_whatsapp');

module.exports = async function handler(req, res){
  try {
    return await _handler(req, res);
  } catch(err){
    console.error('❌ notify-channels crash:', err && err.stack ? err.stack : err);
    if(!res.headersSent){
      return res.status(500).json({ error: 'Error interno: ' + (err && err.message ? err.message : String(err)) });
    }
  }
};

async function _handler(req, res){
  if(!envOK(res)) return;

  const session = auth(req);
  if(!session) return res.status(401).json({ error: 'Sesión inválida o expirada. Volvé a entrar.' });

  // La restricción a admin original / superadmin es intencional (ver cabecera).
  if(!puedeGestionarAdmins(session)){
    return res.status(403).json({ error: 'Solo el administrador original o el super admin gestionan las notificaciones.' });
  }

  const ip    = clientIP(req);
  const token = renewIfStale(session) || undefined;

  if(req.method === 'GET')    return await listar(res, token);
  if(req.method === 'POST')   return await agregar(req, res, session, ip, token);
  if(req.method === 'PATCH')  return await modificar(req, res, session, ip, token);
  if(req.method === 'DELETE') return await borrar(req, res, session, ip, token);
  return res.status(405).json({ error: 'Método no permitido' });
}

// ============================================================================
// GET — lista todos los canales, ordenados por fecha de alta.
// ============================================================================
async function listar(res, token){
  const r = await fetch(SUPA_URL + '/rest/v1/admin_notify_channels?select=id,phone_number,admin_name,active,apikey,created_at,last_notified_at&order=created_at.asc', {
    headers: supaHeaders()
  });
  if(!r.ok){
    // Si la tabla no existe (deploy previo a la migración), devolvemos lista vacía
    // en vez de romper: el panel puede aún mostrar "sin canales" y ofrecer agregar.
    if(r.status === 404 || r.status === 400){
      // Puede ser que 400 venga porque la columna apikey aún no existe (migración pendiente):
      // reintentamos sin ella para no bloquear la carga del panel.
      const r2 = await fetch(SUPA_URL + '/rest/v1/admin_notify_channels?select=id,phone_number,admin_name,active,created_at,last_notified_at&order=created_at.asc', {
        headers: supaHeaders()
      });
      if(r2.ok){
        const rows2 = await r2.json();
        return res.status(200).json({ channels: Array.isArray(rows2) ? rows2 : [], token });
      }
      return res.status(200).json({ channels: [], token });
    }
    return res.status(503).json({ error: 'No se pudo leer la lista de canales.' });
  }
  const rows = await r.json();
  return res.status(200).json({ channels: Array.isArray(rows) ? rows : [], token });
}

// ============================================================================
// POST — dos comportamientos según body.action:
//   - action:'test' con {id}   → dispara un mensaje de prueba al canal
//   - sin action                → agrega un canal nuevo
// ============================================================================
async function agregar(req, res, session, ip, token){
  const b = req.body || {};

  // ---- Sub-handler: prueba de envío a un canal existente ----
  if(b.action === 'test'){
    const id = Number(b.id);
    if(!Number.isInteger(id) || id <= 0){
      return res.status(400).json({ error: 'Falta el id del canal para probar.' });
    }
    // Buscamos el canal para tomar su teléfono y su apikey (si tiene uno propio).
    const rc = await fetch(SUPA_URL + '/rest/v1/admin_notify_channels?id=eq.' + encodeURIComponent(id) + '&select=id,phone_number,admin_name,apikey', {
      headers: supaHeaders()
    });
    if(!rc.ok) return res.status(503).json({ error: 'No se pudo leer el canal.' });
    const rows = await rc.json();
    if(!rows.length) return res.status(404).json({ error: 'Canal no encontrado.' });
    const c = rows[0];

    const r = await sendTestMessage(c.phone_number, c.apikey || null);
    logAudit(session.u, 'wa_channel_test', String(id), {
      admin: c.admin_name, ok: !!r.ok, error: r.error || null
    }, ip);

    if(!r.ok){
      return res.status(502).json({ error: r.error || 'La prueba de envío falló.' });
    }
    return res.status(200).json({ ok: true, token });
  }

  // ---- Alta de canal nuevo ----
  const phoneRaw  = String(b.phone_number || '').trim();
  const nameRaw   = String(b.admin_name   || '').trim();
  const apikeyRaw = b.apikey == null ? null : String(b.apikey).trim();

  // Normalizamos: Meta/CallMeBot quieren el número sin '+', sin espacios, solo dígitos.
  const phone = phoneRaw.replace(/[^\d]/g, '');
  if(!phone || phone.length < 7 || phone.length > 15){
    return res.status(400).json({ error: 'El número tiene que estar en formato internacional (ej: 34687291646), entre 7 y 15 dígitos.' });
  }

  if(!nameRaw || nameRaw.length > 60){
    return res.status(400).json({ error: 'El nombre no puede estar vacío ni tener más de 60 caracteres.' });
  }
  // Mismo filtro que save.js: los nombres se dibujan en el panel admin.
  if(/[<>"`\\]/.test(nameRaw)){
    return res.status(400).json({ error: 'El nombre tiene caracteres no permitidos: < > " ` \\' });
  }

  // El apikey es opcional al crear: si no viene, el helper cae al env var
  // CALLMEBOT_APIKEY (fallback del sistema). Si viene, se guarda tal cual.
  const payload = { phone_number: phone, admin_name: nameRaw, active: true };
  if(apikeyRaw) payload.apikey = apikeyRaw.slice(0, 40);

  const r = await fetch(SUPA_URL + '/rest/v1/admin_notify_channels', {
    method: 'POST',
    headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(payload)
  });

  if(r.status === 409 || r.status === 400){
    // 409 clásico de UNIQUE violado; 400 puede venir con detalle "duplicate key" en el texto.
    const txt = await r.text();
    if(/duplicate|unique|conflict/i.test(txt)){
      return res.status(409).json({ error: 'Ese número ya está registrado como canal.' });
    }
    // Si el 400 viene por columna apikey inexistente, reintentamos sin ella.
    if(apikeyRaw && /column.*apikey|apikey.*does not exist/i.test(txt)){
      const r2 = await fetch(SUPA_URL + '/rest/v1/admin_notify_channels', {
        method: 'POST',
        headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ phone_number: phone, admin_name: nameRaw, active: true })
      });
      if(r2.ok){
        const rows = await r2.json();
        const created = Array.isArray(rows) && rows.length ? rows[0] : null;
        logAudit(session.u, 'wa_channel_add', phone, { admin_name: nameRaw, apikey_skipped: true }, ip);
        return res.status(200).json({ ok: true, channel: created, token });
      }
    }
    return res.status(400).json({ error: 'No se pudo agregar el canal: ' + txt.slice(0, 200) });
  }
  if(!r.ok){
    return res.status(503).json({ error: 'No se pudo agregar el canal (código ' + r.status + ').' });
  }

  const rows = await r.json();
  const created = Array.isArray(rows) && rows.length ? rows[0] : null;

  logAudit(session.u, 'wa_channel_add', phone, { admin_name: nameRaw, has_apikey: !!apikeyRaw }, ip);

  return res.status(200).json({ ok: true, channel: created, token });
}

// ============================================================================
// PATCH — modifica un canal existente. Body: { id, active?, admin_name? }
// Solo se pueden tocar 'active' y 'admin_name'. El número no se puede cambiar:
// para cambiar el número, se borra el canal y se agrega uno nuevo.
// ============================================================================
async function modificar(req, res, session, ip, token){
  const b = req.body || {};
  const id = Number(b.id);
  if(!Number.isInteger(id) || id <= 0){
    return res.status(400).json({ error: 'Falta el id del canal.' });
  }

  const cambios = {};
  if('active' in b) cambios.active = !!b.active;
  if('admin_name' in b){
    const nameRaw = String(b.admin_name || '').trim();
    if(!nameRaw || nameRaw.length > 60){
      return res.status(400).json({ error: 'El nombre no puede estar vacío ni tener más de 60 caracteres.' });
    }
    if(/[<>"`\\]/.test(nameRaw)){
      return res.status(400).json({ error: 'El nombre tiene caracteres no permitidos: < > " ` \\' });
    }
    cambios.admin_name = nameRaw;
  }
  if('apikey' in b){
    // apikey puede ser null (borrar → volver al fallback del sistema) o string de hasta 40.
    if(b.apikey == null || b.apikey === ''){
      cambios.apikey = null;
    } else {
      cambios.apikey = String(b.apikey).trim().slice(0, 40);
    }
  }
  if(!Object.keys(cambios).length){
    return res.status(400).json({ error: 'Nada para modificar.' });
  }

  const r = await fetch(SUPA_URL + '/rest/v1/admin_notify_channels?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(cambios)
  });
  if(!r.ok){
    return res.status(503).json({ error: 'No se pudo modificar el canal (código ' + r.status + ').' });
  }
  const rows = await r.json();
  const updated = Array.isArray(rows) && rows.length ? rows[0] : null;
  if(!updated){
    return res.status(404).json({ error: 'Canal no encontrado.' });
  }

  logAudit(session.u, 'wa_channel_patch', String(id), cambios, ip);

  return res.status(200).json({ ok: true, channel: updated, token });
}

// ============================================================================
// DELETE — elimina un canal. Body o query: { id }
// ============================================================================
async function borrar(req, res, session, ip, token){
  // Aceptamos id en body o query (algunos clientes no mandan body en DELETE).
  const b = req.body || {};
  const idRaw = b.id != null ? b.id : (req.query && req.query.id);
  const id = Number(idRaw);
  if(!Number.isInteger(id) || id <= 0){
    return res.status(400).json({ error: 'Falta el id del canal.' });
  }

  const r = await fetch(SUPA_URL + '/rest/v1/admin_notify_channels?id=eq.' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: supaHeaders({ Prefer: 'return=representation' })
  });
  if(!r.ok){
    return res.status(503).json({ error: 'No se pudo borrar el canal (código ' + r.status + ').' });
  }
  const rows = await r.json();
  const removed = Array.isArray(rows) && rows.length ? rows[0] : null;
  if(!removed){
    return res.status(404).json({ error: 'Canal no encontrado.' });
  }

  logAudit(session.u, 'wa_channel_delete', String(id), { phone: removed.phone_number, name: removed.admin_name }, ip);

  return res.status(200).json({ ok: true, removed, token });
}
