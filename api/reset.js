// =====================================================================
// POST /api/reset   { accion: 'request' | 'confirm', ... }
//
// Reset de contraseña por email. Dos fases:
//   1. 'request' { user, ligaId }
//      - Busca al usuario, obtiene su email del catálogo.
//      - Genera token aleatorio, lo guarda en password_resets (24 hs).
//      - Envía email con el link (via Resend).
//      - Responde SIEMPRE con ok=true (no reveal si el usuario existe).
//   2. 'confirm' { token, newPass }
//      - Valida el token, marca como usado, guarda la clave nueva.
//
// Requiere env vars:
//   RESEND_API_KEY   — de https://resend.com (3.000 mails/mes gratis)
//   APP_BASE_URL     — ej. https://liga-tenis-sohail.vercel.app
//   RESET_FROM_EMAIL — ej. "Liga Sohail <no-reply@tudominio.com>"
//                      (por defecto usa onboarding@resend.dev, solo para pruebas)
// =====================================================================
const crypto = require('crypto');
const {
  SUPA_URL, supaHeaders, envOK, hashV2,
  readCatalogo, upsertJugador, readState, writeState,
  ligaIdOK, LIGA_DEFAULT, logAudit, clientIP,
  rateLimitCheck, rateLimitFail
} = require('./_lib');

const TOKEN_TTL_MS = 24 * 3600 * 1000;
const MAX_REQ_PER_IP = 5;
const LOCK_MS = 30 * 60 * 1000;

async function sendEmail(to, subject, html){
  const key = process.env.RESEND_API_KEY;
  if(!key){
    // Sin key configurada: log y salir OK. Para desarrollo sin bloquear el flujo.
    console.log('[reset] RESEND_API_KEY no configurada. Email simulado a:', to);
    console.log('[reset] Asunto:', subject);
    console.log('[reset] Cuerpo:\n', html);
    return { simulated: true };
  }
  const from = process.env.RESET_FROM_EMAIL || 'onboarding@resend.dev';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html })
  });
  if(!r.ok){
    const txt = await r.text().catch(()=>'');
    throw new Error('Resend ' + r.status + ' ' + txt.slice(0, 200));
  }
  return r.json();
}

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if(!envOK(res)) return;

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const accion = String(body.accion || '');
  const ip = clientIP(req);

  // ==================== REQUEST ====================
  if(accion === 'request'){
    // Rate limit por IP: evitar spam de mails.
    const wait = await rateLimitCheck('reset:' + ip, MAX_REQ_PER_IP);
    if(wait) return res.status(429).json({ error: 'Muchos pedidos. Esperá ' + wait + ' segundos.' });

    const user = String(body.user || '').trim();
    const ligaId = ligaIdOK(body.ligaId) ? body.ligaId : LIGA_DEFAULT;
    if(!user){
      await rateLimitFail('reset:' + ip, MAX_REQ_PER_IP, LOCK_MS);
      return res.status(400).json({ error: 'Falta el usuario.' });
    }

    // Buscar al usuario en la liga → obtener jugadorId → email del catálogo.
    // Respuesta siempre ok=true: no revelamos si existe o si tiene email.
    let email = null, jugadorId = null;
    try {
      const state = await readState(ligaId);
      const u = state && state.users && state.users[user];
      if(u && u.jugadorId){
        const cat = await readCatalogo();
        const jug = cat[u.jugadorId];
        if(jug && jug.email){ email = jug.email; jugadorId = jug.id; }
      }
    } catch(_){ /* silent, respondemos igual */ }

    if(!email){
      // No hay email registrado. Registramos el intento en audit para que el
      // admin pueda ver que Marcos pidió reset pero no tenía email.
      logAudit(user, 'reset.request.no_email', ligaId, null, ip);
      // Rate limit incluso en este caso, para que no se pueda enumerar.
      await rateLimitFail('reset:' + ip, MAX_REQ_PER_IP, LOCK_MS);
      return res.status(200).json({ ok: true, sent: false });
    }

    // Generar token seguro
    const token = crypto.randomBytes(32).toString('base64url');
    const expires_at = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    try {
      const r = await fetch(SUPA_URL + '/rest/v1/password_resets', {
        method: 'POST',
        headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ token, user_name: user, jugador_id: jugadorId, email, expires_at, created_ip: ip })
      });
      if(!r.ok) throw new Error('supabase ' + r.status);
    } catch(e){
      return res.status(503).json({ error: 'No se pudo generar el pedido. Probá de nuevo.' });
    }

    // Enviar email con el link
    const baseUrl = process.env.APP_BASE_URL || 'https://liga-tenis-sohail.vercel.app';
    const link = baseUrl + '/?reset=' + encodeURIComponent(token);
    const html =
      '<div style="font-family:-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:520px;padding:24px">' +
      '<h2 style="margin:0 0 12px">Reset de contraseña — Liga Sohail</h2>' +
      '<p>Alguien (probablemente vos) pidió restablecer la contraseña de <strong>' + user + '</strong>.</p>' +
      '<p>Hacé clic en el link de abajo para elegir una nueva contraseña. El link vence en 24 horas.</p>' +
      '<p style="margin:22px 0"><a href="' + link + '" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Elegir nueva contraseña</a></p>' +
      '<p style="color:#64748b;font-size:13px">Si no lo pediste vos, ignorá este mensaje: tu contraseña actual sigue funcionando.</p>' +
      '</div>';
    try {
      await sendEmail(email, 'Reset de contraseña — Liga Sohail', html);
    } catch(e){
      // Log pero devolvemos ok=true igual (no revelamos si existe).
      logAudit(user, 'reset.email.fail', ligaId, { err: String(e.message).slice(0, 200) }, ip);
    }

    logAudit(user, 'reset.request.ok', ligaId, null, ip);
    return res.status(200).json({ ok: true, sent: true });
  }

  // ==================== CONFIRM ====================
  if(accion === 'confirm'){
    const token = String(body.token || '');
    const newPass = String(body.newPass || '');
    if(!token || token.length < 20) return res.status(400).json({ error: 'Token inválido.' });
    if(newPass.length < 6) return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 6 caracteres.' });

    // Buscar el token
    let row;
    try {
      const r = await fetch(SUPA_URL + '/rest/v1/password_resets?token=eq.' + encodeURIComponent(token) + '&select=*', { headers: supaHeaders() });
      if(!r.ok) return res.status(503).json({ error: 'Error de lectura.' });
      const rows = await r.json();
      row = rows[0];
    } catch(_){ return res.status(503).json({ error: 'Error de lectura.' }); }

    if(!row) return res.status(400).json({ error: 'Token inválido o vencido.' });
    if(row.used_at) return res.status(400).json({ error: 'Este link ya fue usado. Pedí uno nuevo.' });
    if(new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'Token vencido. Pedí uno nuevo.' });

    // Actualizar la contraseña. Preferentemente en el catálogo global.
    const newHash = hashV2(newPass);
    let done = false;
    if(row.jugador_id){
      try {
        const cat = await readCatalogo();
        const jug = cat[row.jugador_id];
        if(jug){ jug.pass = newHash; await upsertJugador(jug); done = true; }
      } catch(_){}
    }
    if(!done){
      // Fallback: escribir en la liga (para cuentas sin catálogo, admin, superadmin).
      // Sin ligaId conocido no podemos, así que usamos LIGA_DEFAULT como intento.
      try {
        const state = await readState(LIGA_DEFAULT);
        const u = state && state.users && state.users[row.user_name];
        if(u){ u.pass = newHash; await writeState(LIGA_DEFAULT, state); done = true; }
      } catch(_){}
    }

    if(!done) return res.status(503).json({ error: 'No se pudo guardar la contraseña. Contactá al administrador.' });

    // Marcar token como usado
    try {
      await fetch(SUPA_URL + '/rest/v1/password_resets?token=eq.' + encodeURIComponent(token), {
        method: 'PATCH',
        headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ used_at: new Date().toISOString() })
      });
    } catch(_){ /* best-effort */ }

    logAudit(row.user_name, 'pass.reset_by_email', row.user_name, null, ip);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Acción desconocida.' });
};
