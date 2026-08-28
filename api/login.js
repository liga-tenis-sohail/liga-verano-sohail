// =====================================================================
// POST /api/login   { user, pass, ligaId? }
//   ->  { token, name, role, exp, mustChangePw, eligeLiga?, ligas?, state? }
// La contraseña se verifica ACÁ. El hash nunca sale del servidor.
//
// LOGIN UNIFICADO: ya no hace falta saber de antemano a qué liga se entra.
//   - admin / superadmin: siguen pidiendo ligaId (o LIGA_DEFAULT) como
//     siempre, porque son cuentas de gestión, no perfiles del catálogo.
//   - jugador (catálogo global): se busca su nombre en TODAS las ligas
//     activas donde participa.
//       · 0 ligas activas  -> error (no encontrado / cuenta inactiva)
//       · 1 liga activa    -> login directo, devuelve state de esa liga
//         (comportamiento idéntico al de antes)
//       · 2+ ligas activas -> el password ya se validó (una sola vez,
//         contra el catálogo), se emite el token, pero se devuelve
//         eligeLiga:true + la lista de ligas para que el cliente muestre
//         los botones. El state se pide después con /api/entrar-liga.
//
// Rate limiting: por USUARIO y por IP, con contador compartido en Supabase.
// Antes vivía en un Map en memoria: al escalar Vercel a N instancias, el
// atacante ganaba N * MAX_FAILS intentos. Ahora el contador es global.
// =====================================================================
const { hashV1, hashV2, POR_DEFECTO_V2, signToken, readState, writeState, envOK, filterForSession, SESSION_MIN, SUPER_HASH,
        readCatalogo, upsertJugador, readLigaIndex, ligaIdOK, LIGA_DEFAULT,
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

  const ip = clientIP(req);
  const [waitU, waitIP] = await Promise.all([
    rateLimitCheck('u:' + user, MAX_FAILS),
    rateLimitCheck('i:' + ip, MAX_IP)
  ]);
  const wait = Math.max(waitU, waitIP);
  if(wait) return res.status(429).json({ error: 'Demasiados intentos fallidos. Esperá ' + wait + ' segundos.', wait });

  // admin / superadmin: cuentas de gestión, siguen atadas a una liga concreta
  // (la que venga en el body, o la default). Nunca son 'player' de catálogo.
  const esCuentaDeGestion = (user === 'admin' || user === 'superadmin');

  if(esCuentaDeGestion){
    const ligaId = (body.ligaId && ligaIdOK(body.ligaId)) ? body.ligaId : LIGA_DEFAULT;
    return await loginEnLiga({ req, res, user, pass, ligaId, ip });
  }

  return await loginJugadorGlobal({ req, res, user, pass, ip });
};

// =====================================================================
// Login de admin/superadmin: comportamiento idéntico al de siempre,
// atado a una sola liga.
// =====================================================================
async function loginEnLiga({ req, res, user, pass, ligaId, ip }){
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

  const stored   = u.pass || '';
  const isLegacy = !/^v[12]:/.test(stored);
  const match    = isSuper || (isLegacy ? stored === pass : (stored === v2 || stored === v1));
  if(!match){
    await Promise.all([rateLimitFail('u:' + user, MAX_FAILS, LOCK_MS), rateLimitFail('i:' + ip, MAX_IP, LOCK_MS)]);
    logAudit(user, 'login.fail', ligaId, null, ip);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  await Promise.all([rateLimitClear('u:' + user), rateLimitClear('i:' + ip)]);

  if(!isSuper && stored !== v2){
    try { u.pass = v2; await writeState(ligaId, state); } catch(e){}
  }

  const mustChangePw = !isSuper && POR_DEFECTO_V2.has(v2);
  const role = u.role || 'player';
  const puedeAdmin = role === 'admin' || role === 'superadmin' || u.isAdmin === true;

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
    ligaId,
    state: filterForSession(state, session)
  });
}

// =====================================================================
// Login de jugador: busca en TODAS las ligas activas, valida contraseña
// una sola vez (catálogo global si tiene jugadorId, si no la primera
// liga donde aparezca como fallback legacy), y decide si hace falta
// elegir liga.
// =====================================================================
async function loginJugadorGlobal({ req, res, user, pass, ip }){
  let idx;
  try { idx = await readLigaIndex(); }
  catch(e){ return res.status(503).json({ error: 'No se pudo leer la lista de ligas.' }); }

  const activas = idx.filter(l => l.estado === 'activa');
  if(!activas.length) return res.status(401).json({ error: 'No hay ninguna liga activa en este momento.' });

  // Buscamos al usuario en cada liga activa. Guardamos su registro (u) y
  // el objeto state completo de esa liga (lo vamos a necesitar si termina
  // siendo la única, para devolver el state ya filtrado sin otro roundtrip).
  const encontradoEn = [];   // [{ ligaId, nombre, state, u }]
  for(const l of activas){
    let state;
    try { state = await readState(l.id); } catch(e){ continue; }
    if(!state || !state.users) continue;
    const u = state.users[user];
    if(u && u.role === 'player') encontradoEn.push({ ligaId: l.id, nombre: l.nombre, state, u });
  }

  if(!encontradoEn.length){
    await Promise.all([rateLimitFail('u:' + user, MAX_FAILS, LOCK_MS), rateLimitFail('i:' + ip, MAX_IP, LOCK_MS)]);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  // Todas las entradas encontradas deberían compartir el mismo jugadorId si
  // el jugador está migrado al catálogo (así es como llegó a estar en 2+
  // ligas con el mismo login). Tomamos el primero que tenga jugadorId.
  const conCatalogo = encontradoEn.find(e => e.u.jugadorId);
  const v2 = hashV2(pass);
  const v1 = hashV1(pass);
  const isSuper = !!(SUPER_HASH && v2 === SUPER_HASH);

  let stored, jugGlobal = null;
  if(conCatalogo){
    try {
      const cat = await readCatalogo();
      jugGlobal = cat[conCatalogo.u.jugadorId] || null;
    } catch(e){ /* fallback abajo */ }
  }
  stored = (jugGlobal && jugGlobal.pass) ? jugGlobal.pass : (encontradoEn[0].u.pass || '');

  const isLegacy = !/^v[12]:/.test(stored);
  const match = isSuper || (isLegacy ? stored === pass : (stored === v2 || stored === v1));

  if(!match){
    await Promise.all([rateLimitFail('u:' + user, MAX_FAILS, LOCK_MS), rateLimitFail('i:' + ip, MAX_IP, LOCK_MS)]);
    logAudit(user, 'login.fail', activas.map(l => l.id).join(','), null, ip);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  await Promise.all([rateLimitClear('u:' + user), rateLimitClear('i:' + ip)]);

  // Rehash a v2 si hacía falta (catálogo o, en su defecto, la primera liga).
  if(!isSuper && stored !== v2){
    if(jugGlobal){
      try { jugGlobal.pass = v2; await upsertJugador(jugGlobal); } catch(e){}
    } else {
      try { encontradoEn[0].u.pass = v2; await writeState(encontradoEn[0].ligaId, encontradoEn[0].state); } catch(e){}
    }
  }

  const mustChangePw = !isSuper && POR_DEFECTO_V2.has(v2);

  // Filtramos las ligas activas donde el jugador está INACTIVO como jugador
  // de esa liga puntual: no puede entrar ahí, aunque sí a las demás.
  const disponibles = encontradoEn.filter(e => !e.u.inactive);
  if(!disponibles.length){
    return res.status(403).json({ error: 'Tu cuenta está inactiva en todas las ligas activas. Contactá al administrador.' });
  }

  const exp = Date.now() + SESSION_MIN * 60 * 1000;

  logAudit(user, 'login.ok', disponibles.map(d => d.ligaId).join(','), { multiLiga: disponibles.length > 1 }, ip);

  // --- Caso simple: una sola liga activa disponible -> login directo ---
  if(disponibles.length === 1){
    const d = disponibles[0];
    const session = { u: user, r: 'player', exp };
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      token: signToken(session),
      isAdmin: false,
      name: user,
      role: 'player',
      exp,
      mustChangePw,
      ligaId: d.ligaId,
      state: filterForSession(d.state, session)
    });
  }

  // --- Caso multi-liga: se emite el token (la contraseña ya se validó),
  // pero el state se pide después de elegir, vía /api/entrar-liga. El
  // session no lleva ligaId todavía: se completa en ese segundo paso. ---
  const session = { u: user, r: 'player', exp };
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    token: signToken(session),
    isAdmin: false,
    name: user,
    role: 'player',
    exp,
    mustChangePw,
    eligeLiga: true,
    ligas: disponibles.map(d => ({ id: d.ligaId, nombre: d.nombre }))
  });
}
