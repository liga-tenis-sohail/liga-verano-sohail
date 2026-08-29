// =====================================================================
// POST /api/save    (Authorization: Bearer <token>)   { state }
// Sin token no se escribe nada. Y lo que un jugador nunca vio,
// tampoco lo puede pisar: se reinyecta desde la base.
// =====================================================================
const { auth, readState, writeState, envOK, sesionEsAdmin, puedeGestionarAdmins, renewIfStale, blockedUser, ligaIdOK, LIGA_DEFAULT, readLigaIndex } = require('./_lib');
const { notifyAdmins, fmtFecha, fmtSets } = require('./_lib_whatsapp');

module.exports = async function handler(req, res){
  try {
    return await _handlerSave(req, res);
  } catch(err){
    console.error('❌ save.js crash:', err && err.stack ? err.stack : err);
    if(!res.headersSent){
      return res.status(500).json({ error: 'Error interno al guardar: ' + (err && err.message ? err.message : String(err)) });
    }
  }
};

async function _handlerSave(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if(!envOK(res)) return;

  const session = auth(req);
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

  try {
    const idx = await readLigaIndex();
    const entry = idx.find(l => l.id === ligaId);
    if(entry && entry.estado === 'finalizada'){
      return res.status(403).json({ error: 'Esta liga está finalizada: es de solo lectura. Reabrila para poder cargar resultados.' });
    }
  } catch(e){ }

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

  const supers = o => Object.keys(o || {})
    .filter(n => o[n] && o[n].role === 'superadmin')
    .sort().join('|');

  const superAntes = supers(curUsers), superAhora = supers(incoming.users);
  if(superAntes !== superAhora){
    const esMigracion = superAntes === '' && superAhora === 'superadmin';
    if(!esMigracion){
      return res.status(403).json({
        error: 'El super administrador es único: no se puede crear, duplicar, transferir ni eliminar.'
      });
    }
  }

  for(const n of Object.keys(incoming.users)){
    const cu = curUsers[n];
    if(cu && incoming.users[n]) incoming.users[n].pass = cu.pass;
  }

  for(const n of Object.keys(incoming.users)){
    const r = incoming.users[n] && incoming.users[n].role;
    if(r !== 'player' && r !== 'admin' && r !== 'superadmin'){
      return res.status(400).json({ error: 'Rol inválido para "' + n.slice(0, 40) + '".' });
    }
  }

  const flags = o => Object.keys(o || {}).filter(n => o[n] && o[n].isAdmin === true).sort().join('|');
  if(flags(curUsers) !== flags(incoming.users) && !puedeGestionarAdmins(session)){
    const borrados = Object.keys(curUsers).filter(n => curUsers[n] && curUsers[n].isAdmin === true && !incoming.users[n]);
    if(borrados.length){
      return res.status(403).json({ error: 'No podés eliminar a ' + borrados[0].slice(0, 40) + ': tiene rol de administrador. Quitáselo primero, o pedíselo al administrador original.' });
    }
    return res.status(403).json({ error: 'Solo el administrador original y el super admin pueden repartir el rol de administrador.' });
  }

  const cuentaAdmins = o => Object.keys(o || {}).filter(n => o[n] && (o[n].role === 'admin' || o[n].isAdmin === true)).length;
  if(cuentaAdmins(curUsers) > 0 && cuentaAdmins(incoming.users) === 0){
    return res.status(403).json({ error: 'Tiene que quedar al menos un administrador.' });
  }

  // JOIN_REQUESTS: aceptar/rechazar solicitudes de acceso es una decisión de
  // administración. Un jugador común nunca las ve — filterForSession se las
  // vacía al cargar el estado — así que su copia local SIEMPRE va a diferir
  // de la real si hay alguna pendiente en la base. Por eso NO se compara
  // (comparar rompería el guardado de cualquier jugador común apenas hubiera
  // una solicitud pendiente): directamente se reconcilia con lo que ya había,
  // igual que se hace con "pass" más arriba. Solo un admin (que sí ve el
  // array completo) puede efectivamente cambiarlo.
  if(!admin){
    incoming.JOIN_REQUESTS = current.JOIN_REQUESTS || [];
  }

  if(!admin){
    const COSMETICO = ['LEAGUE_NAME','LEAGUE_SUBTITLE','LOGIN_TITLE','LEAGUE_COLOR_PRI',
                       'LEAGUE_COLOR_ACC','LEAGUE_COLOR_HL','CLUBS','COLOR_DISPUTA','RATING_ON',
                         'RATING_SEEDS','RATING_OVERRIDES'];
    for(const k of COSMETICO){
      if(JSON.stringify(incoming[k]) !== JSON.stringify(current[k])){
        return res.status(403).json({ error: 'Solo un administrador puede cambiar la apariencia de la liga.' });
      }
    }
  }

  if(!puedeGestionarAdmins(session)){
    const CONFIG = ['cycles','activeN','DESTINO','FECHAS','PO_FECHAS',
                    'ALLNAMES','PUNTOS'];
    for(const k of CONFIG){
      if(JSON.stringify(incoming[k]) !== JSON.stringify(current[k])){
        return res.status(403).json({ error: 'La configuración estructural (puntos, grupos, ciclos, playoff) solo la cambia el administrador original o el super admin.' });
      }
    }
  }

  if(!admin){
    const before = Object.keys(curUsers).sort().join('|');
    const after  = Object.keys(incoming.users).sort().join('|');
    if(before !== after){
      return res.status(403).json({ error: 'No tenés permiso para modificar los jugadores.' });
    }
    for(const name of Object.keys(incoming.users)){
      const inU = incoming.users[name], curU = curUsers[name];
      if(!inU || !curU) continue;
      inU.role = curU.role;
      if('email' in curU) inU.email = curU.email; else delete inU.email;
      if('tel'   in curU) inU.tel   = curU.tel;   else delete inU.tel;
    }

    // CONGELADO: campos cosméticos/estructurales que un jugador SIEMPRE
    // recibe tal cual están en el servidor, nunca lo que traiga su copia
    // local. Sin esto, un jugador con el estado desactualizado (por
    // ejemplo, todavía no recargó la página después de que el admin
    // cambió el título del login) pisaba silenciosamente el valor nuevo
    // en cada autosave — pasó justo con LOGIN_TITLE: el admin lo guardaba
    // bien, pero el próximo autosave de cualquier jugador (cada 12s) lo
    // devolvía a como estaba antes.
    const CONGELADO = ['cycles','activeN','DESTINO','FECHAS','PO_FECHAS',
                       'ALLNAMES','PUNTOS','LEAGUE_NAME','LEAGUE_SUBTITLE','LOGIN_TITLE',
                       'LEAGUE_COLOR_PRI','LEAGUE_COLOR_ACC','LEAGUE_COLOR_HL'];
    for(const k of CONGELADO){
      if(k in current) incoming[k] = current[k]; else delete incoming[k];
    }

    if(!admin){
      const poOld = JSON.stringify(current.playoff || {});
      const poNew = JSON.stringify(incoming.playoff || {});
      if(poOld !== poNew) incoming.playoff = current.playoff;
    }

    const _norm = s => String(s || '')
      .trim()
      .toLocaleLowerCase('es')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    const _me = _norm(session.u);
    const soyYo = m => {
      if(!m) return false;
      if(_norm(m.aName) === _me) return true;
      if(_norm(m.bName) === _me) return true;
      if(Array.isArray(m.poNames) && m.poNames.some(n => _norm(n) === _me)) return true;
      if(m.reporter && _norm(m.reporter) === _me) return true;
      return false;
    };
    const curM  = new Map((current.matches  || []).map(m => [m.id, m]));
    const inM   = new Map((incoming.matches || []).map(m => [m.id, m]));

    for(const [id, m] of curM){
      if(inM.has(id)) continue;
      if(!soyYo(m)) return res.status(403).json({ error: 'No podés borrar partidos de otros jugadores.' });
      if(m.status === 'confirmed'){
        return res.status(403).json({ error: 'No podés borrar un resultado ya confirmado. Pedíselo al administrador.' });
      }
    }

    for(const [id, m] of inM){
      const antes = curM.get(id);
      if(!antes){
        if(!soyYo(m)) return res.status(403).json({ error: 'No podés cargar partidos de otros jugadores.' });
        if(m.status === 'confirmed') return res.status(403).json({ error: 'Solo el administrador confirma resultados.' });
        continue;
      }
      if(JSON.stringify(antes) === JSON.stringify(m)) continue;
      if(!soyYo(antes) || !soyYo(m)){
        return res.status(403).json({ error: 'No podés modificar partidos de otros jugadores.' });
      }
      if(antes.status === 'confirmed'){
        const soloDisputa = m.status === 'disputed' &&
          JSON.stringify(Object.assign({}, antes, { status: 0 })) ===
          JSON.stringify(Object.assign({}, m,    { status: 0 }));
        if(!soloDisputa){
          return res.status(403).json({ error: 'Un resultado confirmado solo lo cambia el administrador. Podés disputarlo.' });
        }
      }else if(m.status === 'confirmed'){
        return res.status(403).json({ error: 'Solo el administrador confirma resultados.' });
      }
    }
  }

  // 1. PRIMERO guardamos en la base de datos para asegurar el partido
  try { 
    await writeState(ligaId, incoming); 
  } catch(e) { 
    return res.status(503).json({ error: 'No se pudo guardar: ' + e.message }); 
  }

  // 2. SEGUNDO disparamos las notificaciones CON AWAIT.
  // Así evitamos que Vercel "congele" la función antes de que salga el mensaje.
  await _dispararNotificaciones(current, incoming, session).catch(() => {});

  // 3. FINALMENTE devolvemos la respuesta al cliente
  return res.status(200).json({ ok: true, token: renewIfStale(session) || undefined });
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
