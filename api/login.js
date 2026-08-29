// =====================================================================
// POST /api/login   { user, pass, ligaId? }
//   ->  { token, name, role, exp, mustChangePw, eligeLiga?, ligas?, state? }
// La contraseña se verifica ACÁ. El hash nunca sale del servidor.
//
// LOGIN UNIFICADO: ya no hace falta saber de antemano a qué liga se entra,
// NI PARA JUGADORES NI PARA CUENTAS DE GESTIÓN.
//   - admin / superadmin: se buscan en TODAS las ligas activas (se heredan
//     automáticamente en cada liga nueva, ver estadoInicial() en liga.js),
//     igual que un jugador de catálogo.
//       · 0 ligas activas  -> error (no hay ninguna liga activa)
//       · 1 liga activa    -> login directo, devuelve state de esa liga
//       · 2+ ligas activas -> el password ya se validó, se emite el
//         token, pero se devuelve eligeLiga:true + la lista de ligas para
//         que el cliente muestre los botones (el mismo selector que ya
//         usa un jugador en 2+ ligas). El state se pide después con
//         /api/state?liga=X&elegir=1.
//     No hay ninguna liga "por defecto" mientras existan ligas activas:
//     el ligaId que venga en el body se ignora para decidir dónde entrar.
//     EXCEPCIÓN: si no hay ninguna liga activa (o la cuenta no aparece en
//     ninguna liga activa), se entra en modo de emergencia a una sola
//     liga concreta (ver loginCuentaGestionSinLigasActivas) — si no,
//     nadie podría reabrir ni crear una liga nueva.
//   - jugador (catálogo global): se busca su nombre en TODAS las ligas
//     activas donde participa.
//       · 0 ligas activas  -> error (no encontrado / cuenta inactiva)
//       · 1 liga activa    -> login directo, devuelve state de esa liga
//         (comportamiento idéntico al de antes)
//       · 2+ ligas activas -> el password ya se validó (una sola vez,
//         contra el catálogo), se emite el token, pero se devuelve
//         eligeLiga:true + la lista de ligas para que el cliente muestre
//         los botones. El state se pide después con /api/state?elegir=1.
//
// ligaNombre: en TODOS los logins directos (1 sola liga) se devuelve
// además el nombre OFICIAL de la liga tal como figura en liga_index (lo
// mismo que se ve en "Gestión de ligas"), separado de state.LEAGUE_NAME.
// El cliente lo usa para pintar el header y el título del login post-
// selección, para que ese nombre visible SIEMPRE coincida con el que
// figura en Gestión de Ligas, sin importar qué guardó el formulario de
// "Apariencia de la liga" en LEAGUE_NAME.
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

  // admin / superadmin: cuentas de gestión, pero YA NO atadas a una liga
  // fija. Se heredan en cada liga nueva (estadoInicial en liga.js), así
  // que participan potencialmente en TODAS las ligas activas — mismo
  // tratamiento multi-liga que un jugador de catálogo.
  const esCuentaDeGestion = (user === 'admin' || user === 'superadmin');

  if(esCuentaDeGestion){
    return await loginCuentaGestionGlobal({ req, res, user, pass, ip, body });
  }

  return await loginJugadorGlobal({ req, res, user, pass, ip });
};

// =====================================================================
// Login de admin/superadmin: busca en TODAS las ligas activas donde la
// cuenta fue heredada (ver estadoInicial() en liga.js), sin liga por
// defecto. Misma forma que loginJugadorGlobal, pero la contraseña vive
// en state.users[user].pass de cada liga (no hay catálogo global para
// estas cuentas) y superadmin además acepta el hash maestro SUPER_HASH.
//
// CASO SIN LIGAS ACTIVAS: admin/superadmin tienen que poder entrar
// IGUAL, aunque no haya ninguna liga activa — si no, nadie podría
// reabrir ni crear una liga nueva y la plataforma quedaría bloqueada.
// En ese caso caemos a un modo de emergencia: se busca la cuenta en
// CUALQUIER liga del índice (activa o finalizada), preferiendo la que
// el cliente sugiera en body.ligaId (el frontend ya manda ahí la última
// liga conocida cuando detecta que no hay ninguna activa — ver
// detectarLigaActiva() en login-auth.js). Si tampoco hay ninguna liga
// en el índice, se usa LIGA_DEFAULT como último recurso. En este modo
// se entra siempre directo a una sola liga (no tiene sentido el
// selector con todo cerrado): el frontend ya sabe mostrar el banner de
// "no hay ligas activas" a partir de _sinLigasActivas.
// =====================================================================
async function loginCuentaGestionGlobal({ req, res, user, pass, ip, body }){
  let idx;
  try { idx = await readLigaIndex(); }
  catch(e){ idx = []; }

  const activas = idx.filter(l => l.estado === 'activa');

  // --- Sin ninguna liga activa: modo de emergencia, login directo ---
  if(!activas.length){
    return await loginCuentaGestionSinLigasActivas({ req, res, user, pass, ip, body, idx });
  }

  // Buscamos la cuenta en cada liga activa donde haya sido heredada.
  const encontradoEn = [];   // [{ ligaId, nombre, state, u }]
  for(const l of activas){
    let state;
    try { state = await readState(l.id); } catch(e){ continue; }
    if(!state || !state.users) continue;
    const u = state.users[user];
    if(u && (u.role === 'admin' || u.role === 'superadmin')) encontradoEn.push({ ligaId: l.id, nombre: l.nombre, state, u });
  }

  // Si la cuenta no aparece en NINGUNA liga activa (caso raro: se creó una
  // liga activa sin heredar admins, o se lo removió a mano), tratamos esto
  // igual que "sin ligas activas para esta cuenta": modo de emergencia,
  // buscando en TODO el índice en vez de rechazar directamente. Esto evita
  // que un admin quede bloqueado por una liga activa ajena a su alcance.
  if(!encontradoEn.length){
    return await loginCuentaGestionSinLigasActivas({ req, res, user, pass, ip, body, idx });
  }

  const v2 = hashV2(pass);
  const v1 = hashV1(pass);
  const isSuper = !!(SUPER_HASH && v2 === SUPER_HASH);

  // La cuenta comparte el mismo hash en todas las ligas donde se heredó
  // (se copia tal cual al crear la liga). Alcanza con validar contra la
  // primera que aparezca.
  const stored = encontradoEn[0].u.pass || '';
  const isLegacy = !/^v[12]:/.test(stored);
  const match = isSuper || (isLegacy ? stored === pass : (stored === v2 || stored === v1));

  if(!match){
    await Promise.all([rateLimitFail('u:' + user, MAX_FAILS, LOCK_MS), rateLimitFail('i:' + ip, MAX_IP, LOCK_MS)]);
    logAudit(user, 'login.fail', activas.map(l => l.id).join(','), null, ip);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  await Promise.all([rateLimitClear('u:' + user), rateLimitClear('i:' + ip)]);

  // Rehash a v2 en TODAS las ligas donde aparece con hash viejo: si solo
  // se actualizara la primera, las demás quedarían con un hash que ya no
  // coincide con `stored` la próxima vez (cada liga es un registro propio,
  // a diferencia del jugador de catálogo que tiene una sola fuente).
  if(!isSuper && stored !== v2){
    for(const e of encontradoEn){
      if(e.u.pass === stored){
        e.u.pass = v2;
        try { await writeState(e.ligaId, e.state); } catch(err){}
      }
    }
  }

  const mustChangePw = !isSuper && POR_DEFECTO_V2.has(v2);
  const role = user === 'superadmin' ? 'superadmin' : 'admin';
  const exp = Date.now() + SESSION_MIN * 60 * 1000;

  logAudit(user, 'login.ok.admin', encontradoEn.map(e => e.ligaId).join(','), { role, multiLiga: encontradoEn.length > 1 }, ip);

  // --- Caso simple: una sola liga activa -> login directo ---
  if(encontradoEn.length === 1){
    const d = encontradoEn[0];
    const session = { u: user, r: role, exp };
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      token: signToken(session),
      isAdmin: true,
      name: user,
      role,
      exp,
      mustChangePw,
      ligaId: d.ligaId,
      ligaNombre: d.nombre,
      state: filterForSession(d.state, session)
    });
  }

  // --- Caso multi-liga: se emite el token (la contraseña ya se validó),
  // pero el state se pide después de elegir, vía /api/state?elegir=1
  // (mismo selector que usa un jugador en 2+ ligas). No hay liga por
  // defecto: el admin siempre pasa por esta pantalla si tiene 2+. ---
  const session = { u: user, r: role, exp };
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    token: signToken(session),
    isAdmin: true,
    name: user,
    role,
    exp,
    mustChangePw,
    eligeLiga: true,
    ligas: encontradoEn.map(d => ({ id: d.ligaId, nombre: d.nombre }))
  });
}

// =====================================================================
// Modo de emergencia: no hay (o la cuenta no aparece en) ninguna liga
// activa. Entramos directo a UNA liga concreta para que admin/superadmin
// nunca queden bloqueados sin forma de reabrir o crear una liga.
//
// Preferencia de liga destino:
//   1) body.ligaId si es válido y existe en el índice (el frontend manda
//      ahí la última liga conocida, ver detectarLigaActiva()).
//   2) la liga más reciente del índice (mayor 'orden'), sea cual sea su
//      estado.
//   3) LIGA_DEFAULT si el índice está vacío o no se pudo leer.
// =====================================================================
async function loginCuentaGestionSinLigasActivas({ req, res, user, pass, ip, body, idx }){
  let ligaId = null;
  let ligaNombre = '';
  const bodyLigaId = body && ligaIdOK(body.ligaId) ? body.ligaId : '';
  if(bodyLigaId && idx.some(l => l.id === bodyLigaId)){
    ligaId = bodyLigaId;
    const e = idx.find(l => l.id === bodyLigaId);
    ligaNombre = e ? e.nombre : '';
  } else if(idx.length){
    const ultima = idx.slice().sort((a, b) => (b.orden || 0) - (a.orden || 0))[0];
    ligaId = ultima.id;
    ligaNombre = ultima.nombre || '';
  } else {
    ligaId = LIGA_DEFAULT;
  }

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
  const role = u.role || (user === 'superadmin' ? 'superadmin' : 'admin');

  const exp = Date.now() + SESSION_MIN * 60 * 1000;
  const session = { u: user, r: role, exp };

  logAudit(user, 'login.ok.admin', ligaId, { role, sinLigasActivas: true }, ip);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    token: signToken(session),
    isAdmin: true,
    name: user,
    role,
    exp,
    mustChangePw,
    ligaId,
    ligaNombre,
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
      ligaNombre: d.nombre,
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
