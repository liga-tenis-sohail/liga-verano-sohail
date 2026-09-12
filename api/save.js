// =====================================================================
// POST /api/save    (Authorization: Bearer <token>)   { state }
// Sin token no se escribe nada. Y lo que un jugador nunca vio,
// tampoco lo puede pisar: se reinyecta desde la base.
// =====================================================================
const { auth, readState, writeState, envOK, sesionEsAdmin, puedeGestionarAdmins, renewIfStale, blockedUser, ligaIdOK, LIGA_DEFAULT, readLigaIndex, upsertLigaIndex } = require('./_lib');
const { protectState, AppError } = require('./_validation');
const { notifyAdmins, fmtFecha, fmtSets } = require('./_lib_whatsapp');

module.exports = async function handler(req, res){
  try {
    return await _handlerSave(req, res);
  } catch(err){
    console.error('❌ save.js crash:', err && err.stack ? err.stack : err);
    if(!res.headersSent){
      return res.status(err.status || 500).json({ error: err.status ? err.message : 'No se pudo completar el guardado.', code:err.code || 'INTERNAL_ERROR' });
    }
  }
};

async function _handlerSave(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if(!envOK(res)) return;

  const session = await auth(req);
  if(!session) return res.status(401).json({ error: 'Sesión inválida o expirada. Volvé a entrar.' });

  const incoming = req.body && req.body.state;
  if(!incoming || typeof incoming !== 'object' || !incoming.users || !incoming.cycles){
    return res.status(400).json({ error: 'Estado inválido: no se guarda.' });
  }

  const ligaId = (req.body && ligaIdOK(req.body.ligaId)) ? req.body.ligaId : LIGA_DEFAULT;

  const bytes = JSON.stringify(incoming).length;
  if(bytes > 8 * 1024 * 1024){
    return res.status(413).json({ error: 'El estado es demasiado grande. No se guardó.' });
  }

  const PELIGRO = /[<>"`\\]/;
  for(const name of Object.keys(incoming.users)){
    if(PELIGRO.test(name)){
      return res.status(400).json({ error: 'El nombre "' + name.slice(0, 40) + '" tiene caracteres no permitidos: < > " ` \\' });
    }
    const u = incoming.users[name] || {};
    for(const campo of ['email', 'tel']){
      if(u[campo] && PELIGRO.test(String(u[campo]))){
        return res.status(400).json({ error: 'El campo ' + campo + ' de "' + name.slice(0, 40) + '" tiene caracteres no permitidos: < > " ` \\' });
      }
    }
  }

  if(Array.isArray(incoming.CLUBS)){
    if(incoming.CLUBS.length > 50){
      return res.status(400).json({ error: 'Demasiados clubes (máximo 50).' });
    }
    const HEX = /^#[0-9a-fA-F]{6}$/;
    const vistos = new Set();
    for(const c of incoming.CLUBS){
      if(!c || typeof c.name !== 'string' || PELIGRO.test(c.name)){
        return res.status(400).json({ error: 'Un club tiene un nombre inválido o con caracteres no permitidos.' });
      }
      if(c.name.length > 40){
        return res.status(400).json({ error: 'El nombre de un club es demasiado largo (máx. 40 caracteres).' });
      }
      if(typeof c.bg !== 'string' || !HEX.test(c.bg)){
        return res.status(400).json({ error: 'El color de "' + String(c.name).slice(0, 40) + '" no es un hex válido (#rrggbb).' });
      }
      const clave = c.name.trim().toLowerCase();
      if(!clave){
        return res.status(400).json({ error: 'Un club quedó sin nombre.' });
      }
      if(vistos.has(clave)){
        return res.status(400).json({ error: 'Hay dos clubes con el mismo nombre: "' + c.name.slice(0, 40) + '".' });
      }
      vistos.add(clave);
    }
    if(incoming.CLUBS.length < 1){
      return res.status(400).json({ error: 'Tiene que haber al menos un club.' });
    }
  }
  if(incoming.COLOR_DISPUTA !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(incoming.COLOR_DISPUTA))){
    return res.status(400).json({ error: 'El color de disputa no es un hex válido (#rrggbb).' });
  }

  let current;
  try { current = await readState(ligaId); }
  catch(e){ return res.status(503).json({ error: 'No se pudo leer la base de datos; no se guardó nada.' }); }

  if(!current) return res.status(409).json({ error: 'La base respondió vacía; no se sobrescribe.' });

  // ligaEntry se reutiliza más abajo para sincronizar liga_index si el admin
  // cambia LEAGUE_NAME desde "Apariencia de la liga" (ver bloque después de
  // writeState). Antes solo se leía acá para chequear "finalizada" y se
  // descartaba; ese cambio de nombre nunca se propagaba al índice, así que
  // el nombre listado en "Gestión de ligas" quedaba desincronizado del que
  // el admin veía en el header y en el formulario de apariencia.
  let ligaEntry = null;
  try {
    const idx = await readLigaIndex();
    ligaEntry = idx.find(l => l.id === ligaId) || null;
    if(ligaEntry && ligaEntry.estado === 'finalizada'){
      return res.status(403).json({ error: 'Esta liga está finalizada: es de solo lectura. Reabrila para poder cargar resultados.' });
    }
  } catch(e){ return res.status(503).json({error:'No se pudo comprobar si la liga está abierta.'}); }

  const blocked = blockedUser(current, session);
  if(blocked) return res.status(403).json({ error: blocked });

  const curV = current._v || 0;
  const inV  = incoming._v || 0;
  if(inV !== curV){
    return res.status(409).json({
      error: 'Otra persona guardó un cambio mientras cargabas el tuyo. Recargá la página y volvé a cargarlo.',
      conflict: true,
      currentV: curV
    });
  }
  incoming._v = curV + 1;

  const curUsers = current.users || {};
  const admin    = sesionEsAdmin(session, curUsers);

  try { protectState(current, incoming, session, admin, puedeGestionarAdmins(session)); }
  catch(e){ return res.status(e.status || 400).json({ error:e.message, code:e.code || 'INVALID_STATE' }); }

  // 1. PRIMERO guardamos en la base de datos para asegurar el partido
  try { 
    await writeState(ligaId, incoming, {expectedVersion:curV}); 
  } catch(e) { 
    return res.status(e.status||503).json({error:e.message,code:e.code||'DATABASE_UNAVAILABLE',conflict:e.status===409,currentV:e.currentV}); 
  }

  // 1.5. Si el admin cambió LEAGUE_NAME (por ejemplo desde "Apariencia de la
  // liga"), propagamos el nombre nuevo también a liga_index — el mismo
  // registro que alimenta "Gestión de ligas" y el nombre que se ve ANTES de
  // elegir liga en el login. Sin esto, el nombre quedaba correcto en el
  // header/state pero desactualizado en esos otros dos lugares, que solo se
  // sincronizaban cuando el admin usaba el botón "Renombrar" de Gestión de
  // Ligas (una acción distinta, 'renombrar', que si actualiza ambos lados).
  // Fire-and-forget con try/catch propio: si esto falla, el guardado
  // principal del estado ya se hizo y no se pierde nada importante.
  if(admin && ligaEntry && incoming.LEAGUE_NAME && incoming.LEAGUE_NAME !== ligaEntry.nombre){
    try {
      await upsertLigaIndex({
        id: ligaId,
        nombre: incoming.LEAGUE_NAME,
        estado: ligaEntry.estado,
        orden: ligaEntry.orden
      });
    } catch(e){ /* no bloquea el guardado del estado, que ya se hizo bien */ }
  }

  // 2. SEGUNDO disparamos las notificaciones CON AWAIT.
  // Así evitamos que Vercel "congele" la función antes de que salga el mensaje.
  await _dispararNotificaciones(current, incoming, session).catch(() => {});

  // 3. FINALMENTE devolvemos la respuesta al cliente
  return res.status(200).json({ ok: true, version:incoming._v, token: renewIfStale(session) || undefined });
};

async function _dispararNotificaciones(current, incoming, session){
  const curMatches = Array.isArray(current.matches)  ? current.matches  : [];
  const inMatches  = Array.isArray(incoming.matches) ? incoming.matches : [];
  const curM = new Map(curMatches.map(m => [m && m.id, m]));

  const ligaNombre = String(incoming.LEAGUE_NAME || current.LEAGUE_NAME || '(sin nombre)').slice(0, 60);
  const actor = String(session && session.u || 'desconocido').slice(0, 60);

  for(const m of inMatches){
    if(!m || !m.id) continue;
    const antes = curM.get(m.id);

    const club = _clubDeMatch(m, incoming) || '-';
    const fecha = fmtFecha(m.date || m.playedAt || m.d || m.fecha || Date.now());

    // Nombres extraídos considerando la estructura de Play Offs
    const jugA = String((m.poNames && m.poNames[0]) || m.aName || '(?)').slice(0, 60);
    const jugB = String((m.poNames && m.poNames[1]) || m.bName || '(?)').slice(0, 60);

    // ===== Evento 1: match nuevo con status pending =====
    if(!antes && m.status === 'pending'){
      await notifyAdmins('resultado_cargado', [
        ligaNombre,
        actor,
        club,
        fecha,
        jugA,
        jugB,
        fmtSets(m)
      ]);
      continue;
    }

    // ===== Evento 2: match existente que pasa a disputed =====
    if(antes && antes.status !== 'disputed' && m.status === 'disputed'){
      await notifyAdmins('partido_disputado', [
        ligaNombre,
        actor,
        club,
        fecha,
        jugA,
        jugB
      ]);
    }
  }
}

function _clubDeMatch(m, state){
  if(!m) return '';
  if(typeof m.club === 'string' && m.club.trim()) return m.club.trim().slice(0, 40);
  if(typeof m.clubName === 'string' && m.clubName.trim()) return m.clubName.trim().slice(0, 40);
  if(m.clubId != null && Array.isArray(state && state.CLUBS)){
    const c = state.CLUBS.find(x => x && (x.id === m.clubId || x.name === m.clubId));
    if(c && c.name) return String(c.name).slice(0, 40);
  }
  if(Array.isArray(state && state.CLUBS) && state.CLUBS.length && state.CLUBS[0] && state.CLUBS[0].name){
    return String(state.CLUBS[0].name).slice(0, 40);
  }
  return '';
}
