// =====================================================================
// POST /api/login   { user, pass }  ->  { token, name, role, exp, mustChangePw }
// La contraseña se verifica ACÁ. El hash nunca sale del servidor.
//
// Rate limiting: por USUARIO y por IP, con contador compartido en Supabase.
// Antes vivía en un Map en memoria: al escalar Vercel a N instancias, el
// atacante ganaba N * MAX_FAILS intentos. Ahora el contador es global.
// =====================================================================
const { hashV1, hashV2, POR_DEFECTO_V2, signToken, readState, writeState, envOK, filterForSession, SESSION_MIN, SUPER_HASH,
        readCatalogo, upsertJugador, ligaIdOK, LIGA_DEFAULT,
        rateLimitCheck, rateLimitFail, rateLimitClear, logAudit, clientIP } = require('./_lib');

const MAX_FAILS = 5;      // por usuario
const MAX_IP    = 12;     // por IP: tolera una familia tras el mismo router
const LOCK_MS   = 5 * 60 * 1000;

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if(!envOK(res)) return;

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const user = String(body.user || '').trim();
  const pass = String(body.pass || '');
  if(!user || !pass) return res.status(400).json({ error: 'Escribí tu usuario y tu contraseña.' });

  const ligaId = (body.ligaId && ligaIdOK(body.ligaId)) ? body.ligaId : LIGA_DEFAULT;

  const ip = clientIP(req);
  const [waitU, waitIP] = await Promise.all([
    rateLimitCheck('u:' + user, MAX_FAILS),
    rateLimitCheck('i:' + ip, MAX_IP)
  ]);
  const wait = Math.max(waitU, waitIP);
  if(wait) return res.status(429).json({ error: 'Demasiados intentos fallidos. Esperá ' + wait + ' segundos.', wait });

  let state;
  try { state = await readState(ligaId); }
  catch(e){ return res.status(503).json({ error: 'No se pudo leer la base de datos. Probá de nuevo en unos segundos.' }); }
  if(!state || !state.users) return res.status(503).json({ error: 'La base de datos no tiene datos.' });

  const u = state.users[user];
  const v2 = hashV2(pass);
  const v1 = hashV1(pass);
  const isSuper = !!(SUPER_HASH && v2 === SUPER_HASH);

  if(!u){
    await Promise.all([rateLimitFail('u:' + user, MAX_FAILS, LOCK_MS), rateLimitFail('i:' + ip, MAX_IP, LOCK_MS)]);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  let jugGlobal = null;
  if(u.jugadorId){
    try {
      const cat = await readCatalogo();
      jugGlobal = cat[u.jugadorId] || null;
    } catch(e){ /* fallback a método viejo */ }
  }

  const stored   = (jugGlobal && jugGlobal.pass) ? jugGlobal.pass : (u.pass || '');
  const isLegacy = !/^v[12]:/.test(stored);
  const match    = isSuper || (isLegacy ? stored === pass : (stored === v2 || stored === v1));
  if(!match){
    await Promise.all([rateLimitFail('u:' + user, MAX_FAILS, LOCK_MS), rateLimitFail('i:' + ip, MAX_IP, LOCK_MS)]);
    // Audit: intento fallido con usuario existente. No registramos usuario
    // inexistente para no llenar la tabla con scanners.
    logAudit(user, 'login.fail', ligaId, null, ip);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  await Promise.all([rateLimitClear('u:' + user), rateLimitClear('i:' + ip)]);

  if(!isSuper && stored !== v2){
    if(jugGlobal){
      try { jugGlobal.pass = v2; await upsertJugador(jugGlobal); } catch(e){}
    } else {
      try { u.pass = v2; await writeState(ligaId, state); } catch(e){}
    }
  }

  const mustChangePw = !isSuper && POR_DEFECTO_V2.has(v2);

  const role = u.role || 'player';
  const puedeAdmin = role === 'admin' || role === 'superadmin' || u.isAdmin === true;

  if(u.inactive && role === 'player'){
    return res.status(403).json({ error: 'Tu cuenta está inactiva. Contactá al administrador.' });
  }

  const exp = Date.now() + SESSION_MIN * 60 * 1000;
  const session = { u: user, r: role, exp };

  logAudit(user, puedeAdmin ? 'login.ok.admin' : 'login.ok', ligaId, { role }, ip);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    token: signToken(session),
    isAdmin: puedeAdmin,
    name: user,
    role,
    exp,
    mustChangePw,
    state: filterForSession(state, session)
  });
};
