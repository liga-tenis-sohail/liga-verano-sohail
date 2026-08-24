// =====================================================================
// LIGA SOHAIL — helper de notificaciones WhatsApp (CallMeBot)
// El prefijo "_" hace que Vercel NO publique este archivo como ruta.
//
// PRINCIPIO RECTOR: este módulo NUNCA debe romper el flow principal.
// Si CallMeBot rechaza, si la red se cae, si falta el APIKEY — se loguea
// a audit_log y se devuelve un resultado benigno. La carga de un
// resultado en la liga NO puede fallar porque el WhatsApp no llegó.
// =====================================================================
const { SUPA_URL, supaHeaders, logAudit } = require('./_lib');

const CB_ENDPOINT   = 'https://api.callmebot.com/whatsapp.php';
const CB_TIMEOUT_MS = 15000;  // 15s de timeout por llamada para evitar colgar la función Serverless

const CB_APIKEY_FALLBACK = process.env.CALLMEBOT_APIKEY || '';

function waConfigured(){
  return !!CB_APIKEY_FALLBACK;
}

// ============================================================================
// FORMATEADORES
// ============================================================================
function fmtFecha(input){
  let d;
  try {
    if(input instanceof Date) d = input;
    else if(typeof input === 'number') d = new Date(input);
    else if(typeof input === 'string' && input) d = new Date(input);
    else d = new Date();
    if(isNaN(d.getTime())) d = new Date();
  } catch(_){ d = new Date(); }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return dd + '/' + mm + '/' + yy;
}

function fmtSets(match){
  if(!match || typeof match !== 'object') return '(sin datos)';
  if(match.wo === true || match.wo === 'true') return 'W.O.';
  if(match.np === true || match.np === 'true') return 'No jugado';
  const sets = Array.isArray(match.sets) ? match.sets : null;
  if(!sets || !sets.length) return '(sin sets)';
  const partes = [];
  for(const s of sets){
    if(!Array.isArray(s) || s.length < 2) continue;
    const a = Number(s[0]), b = Number(s[1]);
    if(!Number.isFinite(a) || !Number.isFinite(b)) continue;
    partes.push(a + '-' + b);
  }
  return partes.length ? partes.join(' · ') : '(sin sets)';
}

// ============================================================================
// TEMPLATES
// ============================================================================
function armarMensaje(templateName, params){
  const p = params || {};
  if(templateName === 'resultado_cargado'){
    return (
      '🎾 *Nuevo resultado cargado* 🎾\n\n' +
      'En *' + p.liga + '* se cargó un nuevo partido.\n\n' +
      'Jugador que reportó: *' + p.actor + '*\n' +
      'Club donde se jugó: *' + p.club + '*\n' +
      'Fecha del encuentro: *' + p.fecha + '*\n\n' +
      'Partido: *' + p.jugA + '* vs *' + p.jugB + '*\n' +
      'Resultado final: *' + p.sets + '*\n\n' +
      'Gracias! 🙌🏼'
    );
  }
  if(templateName === 'partido_disputado'){
    return (
      '⚠️ *Partido en disputa* ⚠️\n\n' +
      'En *' + p.liga + '* se marcó un partido como disputado.\n\n' +
      'Jugador que disputa: *' + p.actor + '*\n' +
      'Club donde se jugó: *' + p.club + '*\n' +
      'Fecha del encuentro: *' + p.fecha + '*\n\n' +
      'El partido en cuestión es: *' + p.jugA + '* vs *' + p.jugB + '*\n\n' +
      'Revisar en el panel de Pendientes/Disputas, gracias!'
    );
  }
  return '📣 Evento en la liga: ' + templateName;
}

function _paramsArrayAObjeto(templateName, arr){
  const a = Array.isArray(arr) ? arr : [];
  if(templateName === 'resultado_cargado'){
    return { liga: a[0], actor: a[1], club: a[2], fecha: a[3], jugA: a[4], jugB: a[5], sets: a[6] };
  }
  if(templateName === 'partido_disputado'){
    return { liga: a[0], actor: a[1], club: a[2], fecha: a[3], jugA: a[4], jugB: a[5] };
  }
  return {};
}

// ============================================================================
// LLAMADA BASE A CALLMEBOT
// ============================================================================
async function _enviarUno(phoneNumber, text, apikey){
  if(!apikey){
    return { ok: false, error: 'Sin APIKEY (ni de canal ni de env var)' };
  }

  let phoneNorm = String(phoneNumber || '').trim();
  phoneNorm = phoneNorm.replace(/[^\d+]/g, '');
  if(!phoneNorm){
    return { ok: false, error: 'Número de destino vacío' };
  }

  const phoneParam = phoneNorm.startsWith('+') ? phoneNorm : ('+' + phoneNorm);

  const url = CB_ENDPOINT
    + '?phone=' + encodeURIComponent(phoneParam)
    + '&text='  + encodeURIComponent(text || '')
    + '&apikey=' + encodeURIComponent(apikey);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CB_TIMEOUT_MS);
  try {
    const r = await fetch(url, { method: 'GET', signal: ctrl.signal });
    const txt = await r.text();
    if(!r.ok){
      return { ok: false, status: r.status, error: txt.slice(0, 500) };
    }
    return { ok: true, status: r.status, response: txt.slice(0, 200) };
  } catch(e){
    const msg = e && e.name === 'AbortError' ? 'timeout ' + CB_TIMEOUT_MS + 'ms' : (e && e.message || String(e));
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// CANALES ACTIVOS
// ============================================================================
async function _leerCanalesActivos(){
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/admin_notify_channels?active=eq.true&select=id,phone_number,admin_name,apikey', {
      headers: supaHeaders()
    });
    if(!r.ok){
      if(r.status === 400){
        const r2 = await fetch(SUPA_URL + '/rest/v1/admin_notify_channels?active=eq.true&select=id,phone_number,admin_name', {
          headers: supaHeaders()
        });
        if(!r2.ok) return [];
        const rows2 = await r2.json();
        return Array.isArray(rows2) ? rows2 : [];
      }
      return [];
    }
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch(_){ return []; }
}

async function _marcarNotificado(id){
  try {
    await fetch(SUPA_URL + '/rest/v1/admin_notify_channels?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ last_notified_at: new Date().toISOString() })
    });
  } catch(_){ /* silencioso */ }
}

// ============================================================================
// notifyAdmins
// ============================================================================
async function notifyAdmins(templateName, parameters){
  const resumen = { sent: 0, failed: 0, skipped: 0 };
  try {
    const canales = await _leerCanalesActivos();
    if(!canales.length){
      resumen.skipped = 1;
      return resumen;
    }
    const hayAlgunApikey = canales.some(c => c.apikey) || !!CB_APIKEY_FALLBACK;
    if(!hayAlgunApikey){
      logAudit('whatsapp', 'wa_no_apikey', templateName, { canales: canales.length });
      resumen.skipped = 1;
      return resumen;
    }

    const paramsObj = _paramsArrayAObjeto(templateName, parameters);
    const texto = armarMensaje(templateName, paramsObj);

    for(const c of canales){
      const apikey = c.apikey || CB_APIKEY_FALLBACK;
      const r = await _enviarUno(c.phone_number, texto, apikey);
      if(r.ok){
        resumen.sent++;
        _marcarNotificado(c.id);
      } else {
        resumen.failed++;
        logAudit(
          'whatsapp',
          'wa_send_fail',
          templateName + ' → ' + c.phone_number,
          { admin: c.admin_name, error: r.error, status: r.status || null }
        );
      }
    }
    if(resumen.sent > 0){
      logAudit(
        'whatsapp',
        'wa_send_ok',
        templateName,
        { sent: resumen.sent, failed: resumen.failed }
      );
    }
  } catch(e){
    try {
      logAudit('whatsapp', 'wa_crash', templateName || '(unknown)', {
        error: (e && e.message) || String(e)
      });
    } catch(_){ /* silencioso */ }
    resumen.failed++;
  }
  return resumen;
}

async function sendTestMessage(phoneNumber, apikey){
  const key = apikey || CB_APIKEY_FALLBACK;
  if(!key){
    return { ok: false, error: 'Sin APIKEY para probar' };
  }
  return await _enviarUno(
    phoneNumber,
    '✅ *Test de notificaciones*\n\nSi ves este mensaje, tu WhatsApp está bien configurado para recibir avisos de la liga.',
    key
  );
}

module.exports = {
  notifyAdmins,
  sendTestMessage,
  fmtFecha,
  fmtSets,
  waConfigured
};
