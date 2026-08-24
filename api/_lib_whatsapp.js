// =====================================================================
// LIGA SOHAIL — helper de notificaciones WhatsApp (CallMeBot)
// El prefijo "_" hace que Vercel NO publique este archivo como ruta.
//
// PRINCIPIO RECTOR: este módulo NUNCA debe romper el flow principal.
// Si CallMeBot rechaza, si la red se cae, si falta el APIKEY — se loguea
// a audit_log y se devuelve un resultado benigno. La carga de un
// resultado en la liga NO puede fallar porque el WhatsApp no llegó.
//
// DIFERENCIAS clave vs helper de Meta:
//  - No hay templates aprobados: los mensajes se arman como strings libres
//    en este archivo. Cambiar el texto no requiere aprobación de nadie.
//  - Endpoint es GET simple con querystring (no POST con JSON).
//  - Auth es un APIKEY por número: cada canal activo tiene el suyo
//    (guardado como columna nueva en admin_notify_channels).
//  - CallMeBot es solo para uso personal → cada admin activa su propio
//    APIKEY siguiendo el setup del bot.
// =====================================================================
const { SUPA_URL, supaHeaders, logAudit } = require('./_lib');

const CB_ENDPOINT   = 'https://api.callmebot.com/whatsapp.php';
const CB_TIMEOUT_MS = 5000;   // corte defensivo: CallMeBot no puede colgar el save más de 5s

// APIKEY del admin principal (compat retro): si un canal en la tabla NO tiene
// apikey propio, cae a este de env var. Útil para el número del admin dueño
// del sistema, que ya está configurado desde el día 0.
const CB_APIKEY_FALLBACK = process.env.CALLMEBOT_APIKEY || '';

// ¿Está el módulo mínimamente configurado? Sin fallback y sin apikey por canal,
// no puede enviar nada — pero eso lo decide _enviarUno() en runtime.
function waConfigured(){
  return !!CB_APIKEY_FALLBACK;
}

// ============================================================================
// FORMATEADORES (idénticos a los del helper de Meta — misma API pública)
// ============================================================================

// Fecha dd/mm/yyyy. Acepta Date, timestamp o string ISO. Ante cualquier basura,
// devuelve la fecha de hoy: mejor mostrar algo razonable que romper el mensaje.
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

// Formatea los sets de un partido. Cubre los casos del proyecto:
//   - wo:true               → "W.O."
//   - np:true               → "No jugado"
//   - sets [[6,3],[6,4]]    → "6-3 6-4"
//   - con super tiebreak    → "6-3 4-6 10-8"
// Tolerante: si la estructura no es la esperada, devuelve un placeholder
// vacío en vez de romper. El WhatsApp es un aviso, no una fuente de verdad.
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
// TEMPLATES — se arman como strings libres con formato de WhatsApp
// (*negrita*, _itálica_, emojis). Cambiar el texto acá NO requiere aprobación
// de nadie: se reemplaza el archivo y ya. Esta es la libertad que Meta no da.
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
      'En la liga *' + p.liga + '* se marcó un partido como disputado.\n\n' +
      'Jugador que disputa: *' + p.actor + '*\n' +
      'Club donde se jugó: *' + p.club + '*\n' +
      'Fecha del encuentro: *' + p.fecha + '*\n\n' +
      'El partido en cuestión es: *' + p.jugA + '* vs *' + p.jugB + '*\n\n' +
      'Revisar en el panel de Pendientes/Disputas, gracias!'
    );
  }
  // Fallback defensivo: si save.js llama con un template desconocido, no rompemos,
  // mandamos un texto genérico para que quede rastro. Igual queda logueado en audit.
  return '📣 Evento en la liga: ' + templateName;
}

// ============================================================================
// ADAPTADOR — save.js llama con arrays de parámetros (como si fuera Meta).
// Acá convertimos ese array posicional al objeto nombrado que armarMensaje usa.
// Así no necesitamos tocar save.js al migrar de Meta a CallMeBot.
// ============================================================================
function _paramsArrayAObjeto(templateName, arr){
  const a = Array.isArray(arr) ? arr : [];
  if(templateName === 'resultado_cargado'){
    // Orden de save.js: [liga, actor, club, fecha, jugA, jugB, sets]
    return { liga: a[0], actor: a[1], club: a[2], fecha: a[3], jugA: a[4], jugB: a[5], sets: a[6] };
  }
  if(templateName === 'partido_disputado'){
    // Orden de save.js: [liga, actor, club, fecha, jugA, jugB]
    return { liga: a[0], actor: a[1], club: a[2], fecha: a[3], jugA: a[4], jugB: a[5] };
  }
  return {};
}

// ============================================================================
// LLAMADA BASE A CALLMEBOT
// GET a la API con phone/text/apikey. Devuelve { ok, error, status }.
// NUNCA lanza: los errores se capturan y se devuelven como {ok:false, error}.
// ============================================================================
async function _enviarUno(phoneNumber, text, apikey){
  if(!apikey){
    return { ok: false, error: 'Sin APIKEY (ni de canal ni de env var)' };
  }
  const phoneNorm = String(phoneNumber || '').replace(/[^\d+]/g, '');
  if(!phoneNorm){
    return { ok: false, error: 'Número de destino vacío' };
  }

  // CallMeBot espera el phone con '+' opcional; usamos siempre con '+' para claridad.
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
      // CallMeBot devuelve texto plano con el detalle del error (no JSON).
      return { ok: false, status: r.status, error: txt.slice(0, 500) };
    }
    // Ok "duro" de HTTP: normalmente 200 con "Message queued...". Igual pasamos
    // los primeros bytes del body por si trae info útil.
    return { ok: true, status: r.status, response: txt.slice(0, 200) };
  } catch(e){
    const msg = e && e.name === 'AbortError' ? 'timeout ' + CB_TIMEOUT_MS + 'ms' : (e && e.message || String(e));
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// CANALES ACTIVOS — lectura de la tabla admin_notify_channels
// La tabla ahora idealmente incluye una columna 'apikey' con el APIKEY de
// CallMeBot de cada admin. Si un canal no la tiene, cae al CB_APIKEY_FALLBACK
// (que es el del admin principal). Así no rompe con la fila que ya existía.
// Si la tabla no existe o falla la lectura, devuelve [] sin romper.
// ============================================================================
async function _leerCanalesActivos(){
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/admin_notify_channels?active=eq.true&select=id,phone_number,admin_name,apikey', {
      headers: supaHeaders()
    });
    if(!r.ok){
      // 400 puede venir si la columna 'apikey' no existe todavía (migración pendiente):
      // reintentamos sin ella para no bloquear el envío.
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

// Actualiza last_notified_at en un canal. Best-effort, silencioso.
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
// notifyAdmins — API pública principal (misma firma que en el helper de Meta)
//
// Recibe:
//   - templateName: 'resultado_cargado' | 'partido_disputado'
//   - parameters:   array posicional (compat con la llamada existente de save.js)
//
// NUNCA lanza. Devuelve { sent, failed, skipped } para diagnóstico opcional.
// Cada error se loguea a audit_log con detalle.
// ============================================================================
async function notifyAdmins(templateName, parameters){
  const resumen = { sent: 0, failed: 0, skipped: 0 };
  try {
    const canales = await _leerCanalesActivos();
    if(!canales.length){
      resumen.skipped = 1;
      return resumen;
    }
    // Sin APIKEY ni de canal ni de fallback, no vale la pena ni intentar:
    // logueamos una única entrada informativa y salimos.
    const hayAlgunApikey = canales.some(c => c.apikey) || !!CB_APIKEY_FALLBACK;
    if(!hayAlgunApikey){
      logAudit('whatsapp', 'wa_no_apikey', templateName, { canales: canales.length });
      resumen.skipped = 1;
      return resumen;
    }

    // Armamos el texto una sola vez (mismo texto para todos los canales).
    const paramsObj = _paramsArrayAObjeto(templateName, parameters);
    const texto = armarMensaje(templateName, paramsObj);

    // En serie para no golpear a CallMeBot con paralelo (rate limits del bot).
    // En la práctica hay 1-3 canales, no vale la pena Promise.all.
    for(const c of canales){
      const apikey = c.apikey || CB_APIKEY_FALLBACK;
      const r = await _enviarUno(c.phone_number, texto, apikey);
      if(r.ok){
        resumen.sent++;
        _marcarNotificado(c.id);   // fire-and-forget: no importa si falla
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

// ============================================================================
// sendTestMessage — para el botón "Test" del panel admin (Tanda 4).
// Envía un mensaje simple de prueba a un número puntual, usando el APIKEY
// pasado explícitamente. Devuelve { ok, error } directo, sin auditar.
// ============================================================================
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
