// =====================================================================
// LIGA SOHAIL — helper de notificaciones WhatsApp (Meta Cloud API)
// El prefijo "_" hace que Vercel NO publique este archivo como ruta.
//
// PRINCIPIO RECTOR: este módulo NUNCA debe romper el flow principal.
// Si Meta rechaza, si la tabla no existe, si falta un token — se loguea
// a audit_log y se devuelve un resultado benigno. La carga de un
// resultado en la liga NO puede fallar porque el WhatsApp no llegó.
// =====================================================================
const { SUPA_URL, supaHeaders, logAudit } = require('./_lib');

const WA_PHONE_ID   = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WA_TOKEN      = process.env.WHATSAPP_ACCESS_TOKEN;
const WA_ENDPOINT   = 'https://graph.facebook.com/v20.0/';
const WA_LANG       = 'es';   // NO 'es_ES': los templates están aprobados en 'es' genérico
const WA_TIMEOUT_MS = 5000;   // corte defensivo: Meta no puede colgar el save más de 5s

// ¿Está el módulo configurado? Sin env vars, todas las llamadas se convierten
// en no-op silenciosos (útil en desarrollo o si un deploy quedó sin secrets).
function waConfigured(){
  return !!(WA_PHONE_ID && WA_TOKEN);
}

// ============================================================================
// FORMATEADORES
// ============================================================================

// Fecha dd/mm/yyyy. Acepta Date, timestamp o string ISO. Ante cualquier basura,
// devuelve la fecha de hoy: mejor mostrar algo razonable que romper el template.
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

// Formatea los sets de un partido. Cubre los casos del plan:
//   - wo:true               → "W.O."
//   - np:true               → "No jugado"
//   - sets [[6,3],[6,4]]    → "6-3 6-4"
//   - con super tiebreak    → "6-3 4-6 10-8"
// Tolerante: si la estructura no es la esperada, devuelve un placeholder
// vacío en vez de romper. La info exacta la puede recuperar el admin desde
// la app; el WhatsApp es un aviso, no una fuente de verdad.
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
  return partes.length ? partes.join(' ') : '(sin sets)';
}

// ============================================================================
// LLAMADA BASE A META
// Envía un template a un número. Devuelve { ok, error, status }.
// NUNCA lanza: los errores se capturan y se devuelven como {ok:false, error}.
// ============================================================================
async function _postTemplate(to, templateName, parameters){
  if(!waConfigured()){
    return { ok: false, error: 'WhatsApp no configurado (faltan env vars)' };
  }
  // Normaliza el número: solo dígitos, sin '+' ni espacios. Meta lo quiere así.
  const toNorm = String(to || '').replace(/[^\d]/g, '');
  if(!toNorm) return { ok: false, error: 'Número de destino vacío' };

  const body = {
    messaging_product: 'whatsapp',
    to: toNorm,
    type: 'template',
    template: {
      name: templateName,
      language: { code: WA_LANG }
    }
  };
  // Los templates sin parámetros (como hello_world) no llevan components.
  if(Array.isArray(parameters) && parameters.length){
    body.template.components = [{
      type: 'body',
      parameters: parameters.map(v => ({ type: 'text', text: String(v == null ? '' : v) }))
    }];
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WA_TIMEOUT_MS);
  try {
    const r = await fetch(WA_ENDPOINT + encodeURIComponent(WA_PHONE_ID) + '/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + WA_TOKEN
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const txt = await r.text();
    if(!r.ok){
      // Guardamos el detalle del error de Meta (código, mensaje) para diagnóstico.
      // El caso más frecuente durante desarrollo: #131030 destinatario no en allowlist.
      return { ok: false, status: r.status, error: txt.slice(0, 500) };
    }
    return { ok: true, status: r.status, response: txt.slice(0, 200) };
  } catch(e){
    const msg = e && e.name === 'AbortError' ? 'timeout ' + WA_TIMEOUT_MS + 'ms' : (e && e.message || String(e));
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// CANALES ACTIVOS — lectura de la tabla admin_notify_channels
// Si la tabla no existe o falla la lectura, devuelve [] sin romper.
// ============================================================================
async function _leerCanalesActivos(){
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/admin_notify_channels?active=eq.true&select=id,phone_number,admin_name', {
      headers: supaHeaders()
    });
    if(!r.ok) return [];
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
// notifyAdmins — API pública principal
//
// Envía el template a TODOS los canales activos. Los parámetros deben venir
// en el orden EXACTO del template, como array de strings.
//
// Ejemplo:
//   await notifyAdmins('resultado_cargado', [
//     'Liga Verano 2026',      // {{1}} liga
//     'Marcos Gavassa',        // {{2}} reportante
//     'Sohail',                // {{3}} club
//     '21/08/2026',            // {{4}} fecha
//     'Marcos Gavassa',        // {{5}} jugador A
//     'Leo Ramos',             // {{6}} jugador B
//     '6-3 6-4'                // {{7}} sets
//   ]);
//
// NUNCA lanza. Devuelve { sent, failed } para diagnóstico opcional.
// Cada error se loguea a audit_log con detalle.
// ============================================================================
async function notifyAdmins(templateName, parameters){
  const resumen = { sent: 0, failed: 0, skipped: 0 };
  try {
    if(!waConfigured()){
      // No hay error real: simplemente WhatsApp está desactivado en este deploy.
      resumen.skipped = 1;
      return resumen;
    }
    const canales = await _leerCanalesActivos();
    if(!canales.length){
      resumen.skipped = 1;
      return resumen;
    }
    // Se envían en serie para no golpear a Meta con paralelo (rate limits).
    // En la práctica hay 1-3 canales, no vale la pena Promise.all.
    for(const c of canales){
      const r = await _postTemplate(c.phone_number, templateName, parameters);
      if(r.ok){
        resumen.sent++;
        _marcarNotificado(c.id);   // fire-and-forget: no importa si falla
      } else {
        resumen.failed++;
        // Auditamos el fallo con detalle para poder diagnosticar (bug #131030,
        // token expirado, template rechazado, etc.). No bloquea el flow.
        logAudit(
          'whatsapp',
          'wa_send_fail',
          templateName + ' → ' + c.phone_number,
          { admin: c.admin_name, error: r.error, status: r.status || null }
        );
      }
    }
    // Si al menos uno se envió, dejamos rastro también del éxito (útil para
    // saber cuándo Meta destrabó el destinatario).
    if(resumen.sent > 0){
      logAudit(
        'whatsapp',
        'wa_send_ok',
        templateName,
        { sent: resumen.sent, failed: resumen.failed }
      );
    }
  } catch(e){
    // Cualquier cosa que se nos escape: se loguea y se sigue.
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
// sendTestMessage — para el botón "Test" del panel admin.
// Envía el template 'hello_world' (pre-aprobado por Meta, siempre disponible)
// a un número puntual. Devuelve { ok, error } directo, sin auditar.
// ============================================================================
async function sendTestMessage(phoneNumber){
  if(!waConfigured()){
    return { ok: false, error: 'WhatsApp no configurado en este deploy' };
  }
  const r = await _postTemplate(phoneNumber, 'hello_world', null);
  // Aunque hello_world no lleva variables, si por algún motivo Meta responde
  // sobre parámetros, devolvemos el mensaje tal cual para que el admin vea el detalle.
  return r;
}

module.exports = {
  notifyAdmins,
  sendTestMessage,
  fmtFecha,
  fmtSets,
  waConfigured
};
