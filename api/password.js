// =====================================================================
// POST /api/password   (Authorization: Bearer <token>)
//   { oldPass, newPass }            -> el usuario cambia SU contraseña
//   { target, newPass }             -> un admin le fija la contraseña a otro
//
// Existe porque el jugador ya no recibe ningún hash: la verificación de la
// contraseña anterior tiene que ocurrir del lado del servidor.
// =====================================================================
const { hashV1, hashV2, auth, readState, writeState, envOK, isAdminRole, sesionEsAdmin, SUPER_HASH,
        readCatalogo, upsertJugador, ligaIdOK, LIGA_DEFAULT } = require('./_lib');

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if(!envOK(res)) return;

  const session = auth(req);
  if(!session) return res.status(401).json({ error: 'Sesión inválida o expirada. Volvé a entrar.' });

  const body    = (req.body && typeof req.body === 'object') ? req.body : {};
  const newPass = String(body.newPass || '');
  const target  = body.target ? String(body.target) : null;

  if(newPass.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });

  // Qué liga: viene en el body. Si no, la liga por defecto.
  const ligaId = ligaIdOK(body.ligaId) ? body.ligaId : LIGA_DEFAULT;

  let state;
  try { state = await readState(ligaId); }
  catch(e){ return res.status(503).json({ error: 'No se pudo leer la base de datos.' }); }

  if(!state || !state.users) return res.status(503).json({ error: 'La base de datos no tiene datos.' });

  // Se decide DESPUÉS de leer la base: el permiso sale del estado, no del token.
  const admin = sesionEsAdmin(session, state.users);

  // Este chequeo TIENE que ir después de declarar admin. Estuvo arriba y, como
  // 'target && !admin' cortocircuita, solo reventaba cuando había target: o sea,
  // justo en el reset del administrador. node --check no lo ve porque la sintaxis
  // es válida; es un ReferenceError de runtime (temporal dead zone).
  if(target && !admin) return res.status(403).json({ error: 'No tenés permiso para cambiar la contraseña de otro jugador.' });

  const name = target || session.u;
  const u = state.users[name];
  if(!u) return res.status(404).json({ error: 'No se encontró ese usuario.' });

  // La contraseña del super administrador solo la cambia él mismo. Antes acá
  // solo se chequeaba que quien pedía fuera admin, no A QUIÉN apuntaba: un
  // admin podía fijarle la clave al super y entrar como él.
  if(u.role === 'superadmin' && session.u !== name){
    return res.status(403).json({ error: 'La contraseña del super administrador solo la puede cambiar él mismo.' });
  }

  // ¿El jugador tiene perfil en el catálogo global? Entonces su contraseña vive
  // ahí y es única para todas sus ligas. Se cambia en el catálogo, no en la liga.
  let jugGlobal = null;
  if(u.jugadorId){
    try {
      const cat = await readCatalogo();
      jugGlobal = cat[u.jugadorId] || null;
    } catch(e){ /* si el catálogo falla, cae al método viejo (la liga) */ }
  }

  // De dónde sale la contraseña actual: el catálogo si hay perfil, si no la liga.
  const passActual = (jugGlobal && jugGlobal.pass != null) ? jugGlobal.pass : (u.pass || '');

  // Cambiando la propia: hay que probar que sabés la anterior.
  if(!target){
    const oldPass  = String(body.oldPass || '');
    const stored   = passActual;
    const isLegacy = !/^v[12]:/.test(stored);
    const oldV2    = hashV2(oldPass);
    const oldOK    = (SUPER_HASH && oldV2 === SUPER_HASH)
                  || (isLegacy ? stored === oldPass : (stored === oldV2 || stored === hashV1(oldPass)));
    if(!oldOK) return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
  }

  // Guardar la contraseña nueva en la fuente correcta.
  if(jugGlobal){
    // Catálogo global: afecta TODAS las ligas de esa persona.
    jugGlobal.pass = hashV2(newPass);
    try { await upsertJugador(jugGlobal); }
    catch(e){ return res.status(503).json({ error: 'No se pudo guardar la contraseña nueva.' }); }
  } else {
    // Sin perfil global (jugador sin migrar, o admin/superadmin): en la liga.
    u.pass = hashV2(newPass);
    try { await writeState(ligaId, state); }
    catch(e){ return res.status(503).json({ error: 'No se pudo guardar la contraseña nueva.' }); }
  }

  return res.status(200).json({ ok: true });
};
