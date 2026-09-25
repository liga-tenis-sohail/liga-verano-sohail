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
//   • Cookie firmada + desafío persistido, de un solo uso y vinculado a sesión.
//   • Registro y contador se confirman atómicamente en la base de datos.
//   • La verificación criptográfica la hace @simplewebauthn/server (estándar).
//   • Nunca se guardan datos biométricos: la cara/huella no sale del dispositivo.
// =====================================================================
const crypto = require('crypto');
const lib = require('./_lib.js');
const security=require('./_auth-security');

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
  const raw=String(req.headers.host||'');
  if(!/^(?:[a-z0-9.-]+|\[::1\])(?::[0-9]{1,5})?$/i.test(raw))throw Object.assign(new Error('Host inválido.'),{status:400,code:'INVALID_ORIGIN'});
  const url=new URL((/^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(raw)?'http://':'https://')+raw);
  return {rpID:url.hostname,rpName:'Liga de Tenis',origin:url.origin};
}

// --- Challenge temporal firmado (en cookie) ---
// WebAuthn necesita recordar el "challenge" entre el start y el finish. Como
// Vercel no comparte memoria entre requests, lo guardamos en una cookie firmada
// (HMAC con SESSION_SECRET) y con expiración corta (5 min). No es secreto, pero
// la firma evita que lo manipulen.
const CHALLENGE_TTL = 5 * 60 * 1000;
function firmarChallenge(payload){
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update('sohail-webauthn-p2:'+body).digest('base64url');
  return body + '.' + sig;
}
function leerChallenge(tok){
  if(typeof tok!=='string'||tok.length>16384||tok.indexOf('.')<0) return null;
  const pieces=tok.split('.');if(pieces.length!==2)return null;const [body,sig]=pieces;
  const expect = crypto.createHmac('sha256', process.env.SESSION_SECRET).update('sohail-webauthn-p2:'+body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if(a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try{
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if(!Number.isSafeInteger(p.exp)||Date.now()>=p.exp||p.exp>Date.now()+CHALLENGE_TTL+30000||typeof p.nonce!=='string')return null;
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
async function passkeysDeUsuario(userName,principal){
  // Names are display labels; only an exact credential identity grants access.
  const r=await fetch(lib.SUPA_URL+'/rest/v1/passkeys?principal_key=eq.'+encodeURIComponent(principal)+'&select=*',{headers:lib.supaHeaders()});
  if(!r.ok)throw new Error('Supabase read passkeys '+r.status);
  return r.json();
}
async function challenge(kind,payload={}){
 const p={...payload,nonce:crypto.randomBytes(32).toString('base64url'),exp:Date.now()+CHALLENGE_TTL,kind};
 await lib.rpc('sohail_p2_challenge',{p_action:'issue',p_data:{id:crypto.createHash('sha256').update(p.nonce).digest('hex'),kind,principal:p.pk||null,epoch:p.sv??null,session_hash:p.sh||null}});
 return firmarChallenge(p);
}
async function consume(p,kind){
 if(!p||p.kind!==kind)return false;
 const r=await lib.rpc('sohail_p2_challenge',{p_action:'consume',p_data:{id:crypto.createHash('sha256').update(p.nonce).digest('hex'),kind,principal:p.pk||null,epoch:p.sv??null,session_hash:p.sh||null}});
 return !!r?.ok;
}

async function passkeyPorId(credId){
  const r = await fetch(lib.SUPA_URL + '/rest/v1/passkeys?credential_id=eq.' + encodeURIComponent(credId) + '&select=*', {
    headers: lib.supaHeaders()
  });
  if(!r.ok) throw new Error('Supabase read passkey ' + r.status);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
async function guardarPasskey(row,session){
  const r=await lib.rpc('sohail_p2_passkey',{p_action:'register',p_data:{...row,session_hash:security.hashSid(session.sid),epoch:session.sv,liga:session.src}});
  if(!r?.ok)throw Object.assign(new Error('La cuenta cambió o el registro ya existe. Iniciá el registro de nuevo.'),{status:409,code:r?.code||'PASSKEY_CONFLICT'});
}
async function actualizarContador(pk,counter){
  const r=await lib.rpc('sohail_p2_passkey',{p_action:'counter',p_data:{credential_id:pk.credential_id,principal_key:pk.principal_key,expected:Number(pk.counter)||0,counter}});
  if(!r?.ok)throw Object.assign(new Error('El dispositivo cambió durante la verificación. Reintentá desde el inicio.'),{status:409,code:'PASSKEY_CONFLICT'});
}
// Borra una passkey. El filtro por principal_key evita que un token válido de un
// usuario pueda borrarle passkeys a otro pasando un credential_id ajeno.
async function borrarPasskey(userName, credId, principal){
  const r = await fetch(lib.SUPA_URL + '/rest/v1/passkeys?credential_id=eq.' + encodeURIComponent(credId) + '&principal_key=eq.' + encodeURIComponent(principal), {
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
  if(Object.prototype.hasOwnProperty.call(body,'ligaId')&&!lib.ligaIdOK(body.ligaId))return res.status(400).json({error:'Identificador de liga inválido.',code:'INVALID_LEAGUE'});
  const accion = body.accion;
  let rpID,rpName,origin;
  res.setHeader('Cache-Control', 'no-store');

  try{
    ({rpID,rpName,origin}=rpInfo(req));
    if(req.headers.origin&&req.headers.origin!==origin)return res.status(403).json({code:'SESSION_ORIGIN',error:'Origen no permitido.'});
    if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return res.status(403).json({code:'SESSION_ORIGIN',error:'Origen no permitido.'});
    if(['auth-start','auth-finish','reauth-start','reauth-finish','reg-start','reg-finish'].includes(accion)){
      const key='passkey-rate:'+lib.clientIP(req),wait=await lib.rateLimitCheck(key,60);
      if(wait)return res.status(429).json({code:'AUTH_RATE_LIMIT',wait,error:'Demasiadas solicitudes. Esperá antes de reintentar.'});
      await lib.rateLimitFail(key,60,60000);
    }
    // Reverification rotates the bearer without extending its absolute expiry.
    if(accion==='reauth-start'||accion==='reauth-finish'){
      const session=await lib.auth(req);
      if(!session)return res.status(401).json({code:'SESSION_EXPIRED',error:'La sesión venció.'});
      if(accion==='reauth-start'){
        const existing=await passkeysDeUsuario(session.u,session.pk);
        if(!existing.length)return res.status(400).json({code:'NO_PASSKEY',error:'Usá tu contraseña actual: no tenés passkeys vinculadas.'});
        const {generateAuthenticationOptions}=await loadWebAuthn();
        const options=await generateAuthenticationOptions({rpID,userVerification:'required',allowCredentials:existing.map(p=>({id:p.credential_id,transports:p.transports?JSON.parse(p.transports):undefined}))});
        setCookie(res,'pk_reauth',await challenge('reauth',{ch:options.challenge,pk:session.pk,sv:session.sv,sh:security.hashSid(session.sid)}),CHALLENGE_TTL);
        return res.status(200).json(options);
      }
      const saved=leerChallenge(readCookie(req,'pk_reauth'));clearCookie(res,'pk_reauth');
      if(!saved||saved.pk!==session.pk||saved.sv!==session.sv||saved.sh!==security.hashSid(session.sid)||!await consume(saved,'reauth'))return res.status(400).json({code:'PASSKEY_CHALLENGE',error:'La verificación expiró o ya fue usada.'});
      const pk=await passkeyPorId(body.cred?.id||'');
      if(!pk||pk.principal_key!==session.pk)return res.status(401).json({code:'WRONG_PASSKEY',error:'Esta passkey no corresponde a tu cuenta.'});
      const {verifyAuthenticationResponse}=await loadWebAuthn();
      const v=await verifyAuthenticationResponse({response:body.cred,expectedChallenge:saved.ch,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,credential:{id:pk.credential_id,publicKey:Buffer.from(pk.public_key,'base64url'),counter:Number(pk.counter)||0,transports:pk.transports?JSON.parse(pk.transports):undefined}});
      if(!v.verified)return res.status(401).json({code:'WRONG_PASSKEY',error:'No se pudo verificar tu identidad.'});
      await actualizarContador(pk,v.authenticationInfo.newCounter);
      const state=await lib.readState(session.src),account=await lib.readAccount(session.pk);
      const next=await security.createSession(session.u,session.r,session.src,state,account,req,'passkey',session,pk.credential_id);
      await lib.logAudit(session.u,'session.reauth',null,{method:'passkey'},lib.clientIP(req));
      return res.status(200).json({ok:true,token:lib.signToken(next),exp:next.exp});
    }
    // =================================================================
    // 1) REGISTRO — iniciar. Requiere estar logueado con clave (token).
    // =================================================================
    if(accion === 'reg-start'){
      const session = await lib.auth(req);   // valida el token del login con clave
      if(!session) return res.status(401).json({ error: 'Iniciá sesión con tu clave antes de activar el ingreso con Face ID.' });
      security.ensureFresh(session);
      const userName = session.u;
      const existentes = await passkeysDeUsuario(userName,session.pk);
      if(existentes.length>=10)return res.status(400).json({code:'PASSKEY_LIMIT',error:'Eliminá un dispositivo antes de registrar otro.'});
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
          userVerification: 'required'   // requiere PIN o biometría verificados por el autenticador
        }
      });
      // Guardar el challenge firmado en cookie temporal
      setCookie(res, 'pk_reg', await challenge('reg',{ch:options.challenge,u:userName,pk:session.pk,sv:session.sv,src:session.src,sh:security.hashSid(session.sid)}), CHALLENGE_TTL);
      return res.status(200).json(options);
    }

    // =================================================================
    // 2) REGISTRO — completar. Guarda la passkey verificada.
    // =================================================================
    if(accion === 'reg-finish'){
      const session = await lib.auth(req);
      if(!session) return res.status(401).json({ error: 'Sesión inválida. Volvé a entrar con tu clave.' });
      const saved = leerChallenge(readCookie(req, 'pk_reg'));
      clearCookie(res, 'pk_reg');
      if(!saved||saved.u!==session.u||saved.pk!==session.pk||saved.sv!==session.sv||saved.src!==session.src||saved.sh!==security.hashSid(session.sid)||!await consume(saved,'reg')) return res.status(400).json({ error: 'El registro expiró. Probá de nuevo.' });

      security.ensureFresh(session);
      const { verifyRegistrationResponse } = await loadWebAuthn();
      const verification = await verifyRegistrationResponse({
        response: body.cred,
        expectedChallenge: saved.ch,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true
      });
      if(!verification.verified || !verification.registrationInfo){
        return res.status(400).json({ error: 'No se pudo verificar la passkey.' });
      }
      const info = verification.registrationInfo;
      const cred = info.credential;   // { id, publicKey, counter, transports }
      await guardarPasskey({
        credential_id: cred.id,
        user_name: session.u,
        principal_key:session.pk,
        public_key: Buffer.from(cred.publicKey).toString('base64url'),
        counter: cred.counter || 0,
        device_label: (body.deviceLabel || 'Mi dispositivo').toString().slice(0, 60),
        transports: cred.transports ? JSON.stringify(cred.transports) : null,
        created_at: new Date().toISOString()
      },session);
      return res.status(200).json({ ok: true });
    }

    // =================================================================
    // 3) LOGIN — iniciar. No requiere token: es para entrar.
    // =================================================================
    if(accion === 'auth-start'){
      const { generateAuthenticationOptions } = await loadWebAuthn();
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'required'
        // allowCredentials vacío: dejamos que el dispositivo ofrezca las passkeys
        // que tenga para este sitio (discoverable credentials). Más simple para el
        // usuario: ve sus passkeys sin escribir el usuario.
      });
      setCookie(res, 'pk_auth', await challenge('auth',{ch:options.challenge}), CHALLENGE_TTL);
      return res.status(200).json(options);
    }

    // =================================================================
    // 4) LOGIN — completar. Verifica y devuelve el token (igual que /api/login).
    // =================================================================
    if(accion === 'auth-finish'){
      const saved = leerChallenge(readCookie(req, 'pk_auth'));
      clearCookie(res, 'pk_auth');
      if(!saved||!await consume(saved,'auth')) return res.status(400).json({ error: 'El acceso expiró. Probá de nuevo.' });

      const cred = body.cred;
      if(!cred || !cred.id) return res.status(400).json({ error: 'Respuesta inválida.' });
      const pk = await passkeyPorId(cred.id);
      if(!pk||!pk.principal_key) return res.status(401).json({ error: 'Esta passkey no está registrada. Entrá con tu clave.' });

      const { verifyAuthenticationResponse } = await loadWebAuthn();
      const verification = await verifyAuthenticationResponse({
        response: cred,
        expectedChallenge: saved.ch,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
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
      await actualizarContador(pk, verification.authenticationInfo.newCounter);

      // Emitir el token igual que el login con clave: mismo formato de sesión.
      //
      // LOGIN UNIFICADO: igual que en /api/login, admin/superadmin siguen
      // atados a una sola liga (la que venga en body.ligaId o la default).
      // Un jugador de catálogo se busca en TODAS las ligas activas donde
      // participa: si está en una sola, entra directo; si está en 2+, se
      // devuelve eligeLiga:true para que el cliente muestre los botones
      // (mismo contrato que /api/login — el cliente ya sabe manejarlo).
      const userName = pk.user_name;
      const esCuentaDeGestion = (userName === 'admin' || userName === 'superadmin');

      if(esCuentaDeGestion){
        const ligaId = (body.ligaId && lib.ligaIdOK(body.ligaId)) ? body.ligaId : lib.LIGA_DEFAULT;
        const state = await lib.readState(ligaId);
        if(!state) return res.status(404).json({ error: 'No se encontró la liga.' });
        const users = state.users || {};
        const u = users[userName];
        if(!u) return res.status(404).json({ error: 'Tu usuario no está en esta liga. Entrá con tu clave.' });
        const role = u.role || 'player';
        const puedeAdmin = role === 'admin' || role === 'superadmin' || u.isAdmin === true;
        const exp = Date.now() + lib.SESSION_MIN * 60 * 1000;
        if(u.inactive)return res.status(403).json({error:'Cuenta inactiva.'});
        const authRecord=await lib.securityFor(userName,state);
        if(authRecord.id!==pk.principal_key)return res.status(401).json({code:'PASSKEY_IDENTITY',error:'Esta passkey no corresponde a la cuenta de esa liga.'});
        if(authRecord.must_change)return res.status(403).json({code:'TEMPORARY_PASSWORD_LOGIN',error:'Entrá con la contraseña temporal y elegí una personal antes de usar Face ID.'});
        const session=await security.createSession(userName,role,ligaId,state,authRecord,req,'passkey',null,pk.credential_id);
        const mustChangePw=!!authRecord.must_change;
        return res.status(200).json({
          token: lib.signToken(session),
          isAdmin: puedeAdmin,
          name: userName,
          role,
          exp:session.exp,
          mustChangePw,
          ligaId,
          state: lib.filterForSession(state, session)
        });
      }

      // --- Jugador: buscar en todas las ligas activas ---
      let idx;
      try { idx = await lib.readLigaIndex(); }
      catch(e){ return res.status(503).json({ error: 'No se pudo leer la lista de ligas.' }); }
      const activas = idx.filter(l => l.estado === 'activa');
      if(!activas.length) return res.status(401).json({ error: 'No hay ninguna liga activa en este momento.' });

      const encontradoEn = await require('./_login-read').findMemberships(activas, userName, u => u.role === 'player');
      if(!encontradoEn.length){
        return res.status(404).json({ error: 'Tu usuario no está en ninguna liga activa. Entrá con tu clave.' });
      }

      const disponibles = encontradoEn.filter(e => !e.u.inactive&&lib.principalKey(userName,e.u)===pk.principal_key);
      if(!disponibles.length){
        return res.status(403).json({ error: 'Tu cuenta está inactiva en todas las ligas activas. Contactá al administrador.' });
      }

      const exp = Date.now() + lib.SESSION_MIN * 60 * 1000;

      // ¿La contraseña actual sigue siendo una por defecto? Si sí, avisamos al
      // cliente con mustChangePw=true para que muestre el modal obligatorio.
      // Sin esto, un jugador con "tenis" que activa Face ID nunca más pasa por
      // el modal de cambio de clave y se queda con la clave pública para siempre.
      const authRecord=await lib.securityFor(userName,disponibles[0].state);
      if(authRecord.must_change)return res.status(403).json({code:'TEMPORARY_PASSWORD_LOGIN',error:'Entrá con la contraseña temporal y elegí una personal antes de usar Face ID.'});
      const mustChangePw=!!authRecord.must_change;
      if(disponibles.length === 1){
        const d = disponibles[0];
        const session=await security.createSession(userName,'player',d.ligaId,d.state,authRecord,req,'passkey',null,pk.credential_id);
        return res.status(200).json({
          token: lib.signToken(session),
          isAdmin: false,
          name: userName,
          role: 'player',
          exp:session.exp,
          mustChangePw,
          ligaId: d.ligaId,
          state: lib.filterForSession(d.state, session)
        });
      }

      // 2+ ligas activas: la passkey ya verificó identidad, pero falta
      // elegir a qué liga entrar. Mismo contrato que /api/login.
      const session=await security.createSession(userName,'player',disponibles[0].ligaId,disponibles[0].state,authRecord,req,'passkey',null,pk.credential_id);
      return res.status(200).json({
        token: lib.signToken(session),
        isAdmin: false,
        name: userName,
        role: 'player',
        exp:session.exp,
        mustChangePw,
        eligeLiga: true,
        ligas: lib.postLoginLeagueChoices(disponibles, idx)
      });
    }

    // =================================================================
    // 5) LIST — devuelve las passkeys del usuario (para mostrarlas en el perfil).
    // =================================================================
    if(accion === 'list'){
      const session = await lib.auth(req);
      if(!session) return res.status(401).json({ error: 'Sesión inválida.' });
      const blocked = await lib.blockedUserCached(session, body.ligaId);
      if(blocked) return res.status(403).json({ error: blocked });
      const rows = await passkeysDeUsuario(session.u,session.pk);
      const passkeys = rows.map(p => ({
        credentialId: p.credential_id,
        deviceLabel: p.device_label || 'Dispositivo',
        createdAt: p.created_at,
        lastUsedAt: p.last_used_at
      }));
      passkeys.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json({ passkeys });
    }

    // =================================================================
    // 6) DELETE — desactiva una passkey del propio usuario.
    // =================================================================
    if(accion === 'delete'){
      const session = await lib.auth(req);
      if(!session) return res.status(401).json({ error: 'Sesión inválida.' });
      const credId = String(body.credentialId || '');
      if(!credId || !/^[A-Za-z0-9_-]{16,512}$/.test(credId)){
        return res.status(400).json({ error: 'Identificador de passkey inválido.' });
      }
      const blocked = await lib.blockedUserCached(session, body.ligaId);
      if(blocked) return res.status(403).json({ error: blocked });
      security.ensureFresh(session);
      await borrarPasskey(session.u, credId,session.pk);
      lib.logAudit(session.u, 'passkey.delete', session.u, { credId: credId.slice(0, 8) + '…' }, lib.clientIP(req));
      return res.status(200).json({ ok: true });
    }

    // =================================================================
    // 7) RENAME — el usuario cambia el nombre visible de su passkey. No
    //    afecta la criptografía, solo la etiqueta que ve en el perfil.
    // =================================================================
    if(accion === 'rename'){
      const session = await lib.auth(req);
      if(!session) return res.status(401).json({ error: 'Sesión inválida.' });
      const credId = String(body.credentialId || '');
      const label  = String(body.deviceLabel || '').trim().slice(0, 60);
      if(!credId || !/^[A-Za-z0-9_-]{16,512}$/.test(credId)){
        return res.status(400).json({ error: 'Identificador de passkey inválido.' });
      }
      if(!label) return res.status(400).json({ error: 'El nombre no puede estar vacío.' });
      // Filtro doble por principal_key: un token de otro usuario no puede renombrar
      // pasando el credId ajeno.
      const r = await fetch(lib.SUPA_URL + '/rest/v1/passkeys?credential_id=eq.' + encodeURIComponent(credId) + '&principal_key=eq.' + encodeURIComponent(session.pk), {
        method: 'PATCH',
        headers: lib.supaHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ device_label: label })
      });
      if(!r.ok) return res.status(503).json({ error: 'No se pudo renombrar la passkey.' });
      lib.logAudit(session.u, 'passkey.rename', session.u, { credId: credId.slice(0, 8) + '…', label }, lib.clientIP(req));
      return res.status(200).json({ ok: true, deviceLabel: label });
    }

    // =================================================================
    // 8) ADMIN-LIST-USER — admin lista las passkeys de OTRO jugador. Útil
    //    cuando alguien pierde el dispositivo y no puede loguearse.
    // =================================================================
    if(accion === 'admin-list-user'){
      const session = await lib.auth(req);
      if(!session) return res.status(401).json({ error: 'Sesión inválida.' });
      const state = await lib.readState(body.ligaId || session.src);
      if(!lib.sesionEsAdmin(session, state && state.users)) return res.status(403).json({ error: 'Solo un administrador.' });
      const target = String(body.userName || '').trim();
      if(!target) return res.status(400).json({ error: 'Falta el usuario.' });
      const targetUser=state&&state.users&&state.users[target];
      if(!targetUser||(targetUser.role==='superadmin'&&session.u!==target)||(!lib.puedeGestionarAdmins(session)&&(target==='admin'||targetUser.role==='admin'||targetUser.isAdmin)))return res.status(403).json({error:'No tenés permiso para administrar esa cuenta.'});
      const rows = await passkeysDeUsuario(target,lib.principalKey(target,targetUser));
      const passkeys = rows.map(p => ({
        credentialId: p.credential_id,
        deviceLabel: p.device_label || 'Dispositivo',
        createdAt: p.created_at,
        lastUsedAt: p.last_used_at
      }));
      passkeys.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json({ userName: target, passkeys });
    }

    // =================================================================
    // 9) ADMIN-DELETE-USER — admin borra una passkey de OTRO jugador.
    // =================================================================
    if(accion === 'admin-delete-user'){
      const session = await lib.auth(req);
      if(!session) return res.status(401).json({ error: 'Sesión inválida.' });
      const state = await lib.readState(body.ligaId || session.src);
      if(!lib.sesionEsAdmin(session, state && state.users)) return res.status(403).json({ error: 'Solo un administrador.' });
      const target = String(body.userName || '').trim();
      const credId = String(body.credentialId || '');
      if(!target) return res.status(400).json({ error: 'Falta el usuario.' });
      const targetUser=state&&state.users&&state.users[target];
      if(!targetUser||(targetUser.role==='superadmin'&&session.u!==target)||(!lib.puedeGestionarAdmins(session)&&(target==='admin'||targetUser.role==='admin'||targetUser.isAdmin)))return res.status(403).json({error:'No tenés permiso para administrar esa cuenta.'});
      if(!credId || !/^[A-Za-z0-9_-]{16,512}$/.test(credId)){
        return res.status(400).json({ error: 'Identificador de passkey inválido.' });
      }
      security.ensureFresh(session);
      await borrarPasskey(target, credId,lib.principalKey(target,targetUser));
      lib.logAudit(session.u, 'passkey.admin_delete', target, { credId: credId.slice(0, 8) + '…' }, lib.clientIP(req));
      return res.status(200).json({ ok: true });
    }

    // =================================================================
    // 10) ADMIN-STATS — cuántos jugadores tienen al menos una passkey.
    //     Solo agregado, no expone credenciales.
    // =================================================================
    if(accion === 'admin-stats'){
      const session = await lib.auth(req);
      if(!session) return res.status(401).json({ error: 'Sesión inválida.' });
      const state = await lib.readState(body.ligaId || session.src);
      if(!lib.sesionEsAdmin(session, state && state.users)) return res.status(403).json({ error: 'Solo un administrador.' });
      // Traemos solo user_name distinct. Simple: agarrar todos y contar
      // localmente. Con 60 usuarios × N passkeys, la tabla es chica.
      const r = await fetch(lib.SUPA_URL + '/rest/v1/passkeys?select=principal_key', { headers: lib.supaHeaders() });
      if(!r.ok) return res.status(503).json({ error: 'No se pudo leer las passkeys.' });
      const rows = await r.json();
      const users = (state && state.users) || {};
      const allowed=new Set(Object.entries(users).map(([n,u])=>lib.principalKey(n,u)));
      const scoped=rows.filter(r=>allowed.has(r.principal_key));
      const usuariosConPasskey = new Set(scoped.map(r => r.principal_key));
      const totalJugadores = Object.values(users).filter(u => (u.role || 'player') === 'player' && !u.inactive).length;
      const conPasskey = Object.keys(users).filter(n => usuariosConPasskey.has(lib.principalKey(n,users[n])) && (users[n].role || 'player') === 'player' && !users[n].inactive).length;
      return res.status(200).json({
        totalJugadores,
        conPasskey,
        totalPasskeys: scoped.length,
        pct: totalJugadores > 0 ? Math.round(100 * conPasskey / totalJugadores) : 0
      });
    }

    return res.status(400).json({ error: 'Acción desconocida.' });
  }catch(e){
    return res.status(e.status||500).json({error:e.status?e.message:'No se pudo completar la operación con la passkey.',code:e.code||'PASSKEY_ERROR'});
  }
};

module.exports = require('./_session').withCookie(module.exports);
