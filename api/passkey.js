// =====================================================================
// LIGA SOHAIL — Login con passkeys (Face ID / Touch ID / huella / Windows Hello)
// =====================================================================
// Este endpoint maneja el registro y el login con passkeys usando WebAuthn.
// El login con CLAVE sigue intacto en /api/login: esto es una capa opcional
// encima. Si un usuario no tiene passkey, entra con clave como siempre.
//
// Cuatro acciones (POST con { accion, ... }):
//   1. 'reg-start'   → inicia el registro de una passkey (devuelve opciones)
//   2. 'reg-finish'  → completa el registro (guarda la passkey en Supabase)
//   3. 'auth-start'  → inicia el login con passkey (devuelve el challenge)
//   4. 'auth-finish' → completa el login (verifica y devuelve el token)
//
// SEGURIDAD:
//   • Registrar una passkey requiere estar logueado con clave primero (token).
//   • El challenge se guarda firmado en una cookie temporal (no en memoria,
//     porque Vercel es serverless y no comparte memoria entre requests).
//   • La verificación criptográfica la hace @simplewebauthn/server (estándar).
//   • Nunca se guardan datos biométricos: la cara/huella no sale del dispositivo.
// =====================================================================
const crypto = require('crypto');
const lib = require('./_lib.js');

// @simplewebauthn/server v13 es ESM puro: require() lo rompe con ERR_REQUIRE_ESM
// y la función serverless muere al inicializar (Vercel devuelve 504). Se carga
// con dynamic import y se cachea el módulo para no re-importar en cada request.
let _wa = null;
async function loadWebAuthn(){
  if(!_wa) _wa = await import('@simplewebauthn/server');
  return _wa;
}

// --- Identidad del sitio (Relying Party) ---
// rpID = el dominio. rpName = nombre visible. origin = la URL completa.
// Se derivan del host de la request para que funcione en cualquier dominio
// (producción o previews de Vercel) sin hardcodear nada.
function rpInfo(req){
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
  const proto = (req.headers['x-forwarded-proto'] || 'https');
  return { rpID: host, rpName: 'Liga de Tenis', origin: proto + '://' + host };
}

// --- Challenge temporal firmado (en cookie) ---
// WebAuthn necesita recordar el "challenge" entre el start y el finish. Como
// Vercel no comparte memoria entre requests, lo guardamos en una cookie firmada
// (HMAC con SESSION_SECRET) y con expiración corta (5 min). No es secreto, pero
// la firma evita que lo manipulen.
const CHALLENGE_TTL = 5 * 60 * 1000;
function firmarChallenge(payload){
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function leerChallenge(tok){
  if(!tok || tok.indexOf('.') < 0) return null;
  const [body, sig] = tok.split('.');
  const expect = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if(a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try{
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if(!p.exp || Date.now() > p.exp) return null;
    return p;
  }catch(_){ return null; }
}
function setCookie(res, name, value, maxAgeMs){
  const parts = [
    name + '=' + value,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=' + Math.round(maxAgeMs / 1000)
  ];
  // Permitir varias cookies acumulando el header
  const prev = res.getHeader('Set-Cookie');
  const cookie = parts.join('; ');
  if(prev) res.setHeader('Set-Cookie', [].concat(prev, cookie));
  else res.setHeader('Set-Cookie', cookie);
}
function clearCookie(res, name){ setCookie(res, name, 'x', 1); }
function readCookie(req, name){
  const raw = req.headers.cookie || '';
  const m = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return m ? m.slice(name.length + 1) : null;
}

// --- Helpers de Supabase para la tabla passkeys ---
async function passkeysDeUsuario(userName){
  const r = await fetch(lib.SUPA_URL + '/rest/v1/passkeys?user_name=eq.' + encodeURIComponent(userName) + '&select=*', {
    headers: lib.supaHeaders()
  });
  if(!r.ok) throw new Error('Supabase read passkeys ' + r.status);
  return await r.json();
}
async function passkeyPorId(credId){
  const r = await fetch(lib.SUPA_URL + '/rest/v1/passkeys?credential_id=eq.' + encodeURIComponent(credId) + '&select=*', {
    headers: lib.supaHeaders()
  });
  if(!r.ok) throw new Error('Supabase read passkey ' + r.status);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
async function guardarPasskey(row){
  const r = await fetch(lib.SUPA_URL + '/rest/v1/passkeys', {
    method: 'POST',
    headers: lib.supaHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row)
  });
  if(!r.ok) throw new Error('Supabase write passkey ' + r.status + ' ' + (await r.text()));
}
async function actualizarContador(credId, counter){
  const r = await fetch(lib.SUPA_URL + '/rest/v1/passkeys?credential_id=eq.' + encodeURIComponent(credId), {
    method: 'PATCH',
    headers: lib.supaHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ counter: counter, last_used_at: new Date().toISOString() })
  });
  if(!r.ok) throw new Error('Supabase patch passkey ' + r.status);
}
// Borra una passkey. El filtro por user_name evita que un token válido de un
// usuario pueda borrarle passkeys a otro pasando un credential_id ajeno.
async function borrarPasskey(userName, credId){
  const r = await fetch(lib.SUPA_URL + '/rest/v1/passkeys?credential_id=eq.' + encodeURIComponent(credId) + '&user_name=eq.' + encodeURIComponent(userName), {
    method: 'DELETE',
    headers: lib.supaHeaders({ Prefer: 'return=minimal' })
  });
  if(!r.ok) throw new Error('Supabase delete passkey ' + r.status + ' ' + (await r.text()));
}

module.exports = async (req, res) => {
  if(req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  if(!lib.envOK(res)) return;   // faltan variables de entorno

  let body = req.body;
  if(typeof body === 'string'){ try{ body = JSON.parse(body); }catch(_){ body = {}; } }
  body = body || {};
  const accion = body.accion;
  const { rpID, rpName, origin } = rpInfo(req);
  res.setHeader('Cache-Control', 'no-store');

  try{
    // =================================================================
    // 1) REGISTRO — iniciar. Requiere estar logueado con clave (token).
    // =================================================================
    if(accion === 'reg-start'){
      const session = lib.auth(req);   // valida el token del login con clave
      if(!session) return res.status(401).json({ error: 'Iniciá sesión con tu clave antes de activar el ingreso con Face ID.' });
      const userName = session.u;
      const existentes = await passkeysDeUsuario(userName);
      const { generateRegistrationOptions } = await loadWebAuthn();
      const options = await generateRegistrationOptions({
        rpName, rpID,
        userName: userName,
        userDisplayName: userName,
        attestationType: 'none',
        // No permitir registrar dos veces la misma credencial en el mismo device
        excludeCredentials: existentes.map(p => ({ id: p.credential_id, transports: p.transports ? JSON.parse(p.transports) : undefined })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred'   // pide Face ID/Touch ID pero no lo exige rígido
        }
      });
      // Guardar el challenge firmado en cookie temporal
      setCookie(res, 'pk_reg', firmarChallenge({ ch: options.challenge, u: userName, exp: Date.now() + CHALLENGE_TTL }), CHALLENGE_TTL);
      return res.status(200).json(options);
    }

    // =================================================================
    // 2) REGISTRO — completar. Guarda la passkey verificada.
    // =================================================================
    if(accion === 'reg-finish'){
      const session = lib.auth(req);
      if(!session) return res.status(401).json({ error: 'Sesión inválida. Volvé a entrar con tu clave.' });
      const saved = leerChallenge(readCookie(req, 'pk_reg'));
      clearCookie(res, 'pk_reg');
      if(!saved || saved.u !== session.u) return res.status(400).json({ error: 'El registro expiró. Probá de nuevo.' });

      const { verifyRegistrationResponse } = await loadWebAuthn();
      const verification = await verifyRegistrationResponse({
        response: body.cred,
        expectedChallenge: saved.ch,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false
      });
      if(!verification.verified || !verification.registrationInfo){
        return res.status(400).json({ error: 'No se pudo verificar la passkey.' });
      }
      const info = verification.registrationInfo;
      const cred = info.credential;   // { id, publicKey, counter, transports }
      await guardarPasskey({
        credential_id: cred.id,
        user_name: session.u,
        public_key: Buffer.from(cred.publicKey).toString('base64url'),
        counter: cred.counter || 0,
        device_label: (body.deviceLabel || 'Mi dispositivo').toString().slice(0, 60),
        transports: cred.transports ? JSON.stringify(cred.transports) : null,
        created_at: new Date().toISOString()
      });
      return res.status(200).json({ ok: true });
    }

    // =================================================================
    // 3) LOGIN — iniciar. No requiere token: es para entrar.
    // =================================================================
    if(accion === 'auth-start'){
      const { generateAuthenticationOptions } = await loadWebAuthn();
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'preferred'
        // allowCredentials vacío: dejamos que el dispositivo ofrezca las passkeys
        // que tenga para este sitio (discoverable credentials). Más simple para el
        // usuario: ve sus passkeys sin escribir el usuario.
      });
      setCookie(res, 'pk_auth', firmarChallenge({ ch: options.challenge, exp: Date.now() + CHALLENGE_TTL }), CHALLENGE_TTL);
      return res.status(200).json(options);
    }

    // =================================================================
    // 4) LOGIN — completar. Verifica y devuelve el token (igual que /api/login).
    // =================================================================
    if(accion === 'auth-finish'){
      const saved = leerChallenge(readCookie(req, 'pk_auth'));
      clearCookie(res, 'pk_auth');
      if(!saved) return res.status(400).json({ error: 'El acceso expiró. Probá de nuevo.' });

      const cred = body.cred;
      if(!cred || !cred.id) return res.status(400).json({ error: 'Respuesta inválida.' });
      const pk = await passkeyPorId(cred.id);
      if(!pk) return res.status(401).json({ error: 'Esta passkey no está registrada. Entrá con tu clave.' });

      const { verifyAuthenticationResponse } = await loadWebAuthn();
      const verification = await verifyAuthenticationResponse({
        response: cred,
        expectedChallenge: saved.ch,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
        credential: {
          id: pk.credential_id,
          publicKey: Buffer.from(pk.public_key, 'base64url'),
          counter: Number(pk.counter) || 0,
          transports: pk.transports ? JSON.parse(pk.transports) : undefined
        }
      });
      if(!verification.verified){
        return res.status(401).json({ error: 'No se pudo verificar. Entrá con tu clave.' });
      }
      // Actualizar el contador anti-clonación
      await actualizarContador(pk.credential_id, verification.authenticationInfo.newCounter);

      // Emitir el token igual que el login con clave: mismo formato de sesión.
      const userName = pk.user_name;
      const ligaId = body.ligaId || lib.LIGA_DEFAULT;
      const state = await lib.readState(ligaId);
      if(!state) return res.status(404).json({ error: 'No se encontró la liga.' });
      const users = state.users || {};
      const u = users[userName];
      if(!u) return res.status(404).json({ error: 'Tu usuario no está en esta liga. Entrá con tu clave.' });
      if(u.inactive && (u.role || 'player') === 'player'){
        return res.status(403).json({ error: 'Tu cuenta está inactiva. Contactá al administrador.' });
      }
      const role = u.role || 'player';
      const puedeAdmin = role === 'admin' || role === 'superadmin' || u.isAdmin === true;
      const exp = Date.now() + lib.SESSION_MIN * 60 * 1000;
      const session = { u: userName, r: role, exp };
      return res.status(200).json({
        token: lib.signToken(session),
        isAdmin: puedeAdmin,
        name: userName,
        role,
        exp,
        state: lib.filterForSession(state, session)
      });
    }

    // =================================================================
    // 5) LIST — devuelve las passkeys del usuario (para mostrarlas en el perfil).
    //    Solo devuelve datos "públicos" del propio usuario: nada de public_key
    //    ni contadores. Requiere sesión activa.
    // =================================================================
    if(accion === 'list'){
      const session = lib.auth(req);
      if(!session) return res.status(401).json({ error: 'Sesión inválida.' });
      const rows = await passkeysDeUsuario(session.u);
      const passkeys = rows.map(p => ({
        credentialId: p.credential_id,
        deviceLabel: p.device_label || 'Dispositivo',
        createdAt: p.created_at,
        lastUsedAt: p.last_used_at
      }));
      // Orden: más recientes primero (por creación).
      passkeys.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json({ passkeys });
    }

    // =================================================================
    // 6) DELETE — desactiva una passkey del propio usuario. El filtro por
    //    user_name en el DELETE de Supabase evita que un token válido de un
    //    usuario pueda tocar passkeys de otro pasando un credential_id ajeno.
    // =================================================================
    if(accion === 'delete'){
      const session = lib.auth(req);
      if(!session) return res.status(401).json({ error: 'Sesión inválida.' });
      const credId = String(body.credentialId || '');
      if(!credId) return res.status(400).json({ error: 'Falta la passkey a desactivar.' });
      await borrarPasskey(session.u, credId);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Acción desconocida.' });
  }catch(e){
    return res.status(500).json({ error: 'Error en el servidor de passkeys: ' + (e.message || 'desconocido') });
  }
};
