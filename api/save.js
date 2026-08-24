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
    // Cualquier error no previsto se reporta con detalle en vez de un 500 mudo.
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

  // Qué liga: viene en el body. Si no (cliente viejo), la liga por defecto.
  const ligaId = (req.body && ligaIdOK(req.body.ligaId)) ? req.body.ligaId : LIGA_DEFAULT;

  // Techo de tamaño: sin esto, cualquiera con sesión puede inflar la base.
  const bytes = JSON.stringify(incoming).length;
  if(bytes > 8 * 1024 * 1024){
    return res.status(413).json({ error: 'El estado es demasiado grande. No se guardó.' });
  }

  // Los nombres se concatenan dentro de innerHTML en todo el cliente. La función
  // esc() del cliente SOLO escapa apóstrofos (para los onclick), no HTML: por eso
  // se filtra acá, en la puerta, en vez de en 61 sitios distintos.
  // El apóstrofo NO se bloquea: esc() ya lo maneja y apellidos como O'Brien son reales.
  const PELIGRO = /[<>"`\\]/;
  for(const name of Object.keys(incoming.users)){
    if(PELIGRO.test(name)){
      return res.status(400).json({ error: 'El nombre "' + name.slice(0, 40) + '" tiene caracteres no permitidos: < > " ` \\' });
    }
    // email y tel también se dibujan en la pantalla, dentro de value="...".
    // esc() no escapa la comilla doble, así que un email como  " onfocus="...
    // rompía el atributo. Se cierra acá, en la puerta, igual que el nombre.
    const u = incoming.users[name] || {};
    for(const campo of ['email', 'tel']){
      if(u[campo] && PELIGRO.test(String(u[campo]))){
        return res.status(400).json({ error: 'El campo ' + campo + ' de "' + name.slice(0, 40) + '" tiene caracteres no permitidos: < > " ` \\' });
      }
    }
  }

  // Los clubes también se dibujan en pantalla (nombre en badges, color en style=).
  // Mismo filtro que los nombres de jugador, más un chequeo de que el color sea un
  // hex válido: si no, un club podría inyectar CSS o romper el atributo style.
  if(Array.isArray(incoming.CLUBS)){
    // Tope razonable: una liga real tiene un puñado de clubes. Más de 50 es señal
    // de error o abuso, y aunque el tope de 8MB del estado lo contendría, un límite
    // explícito da un error claro en vez de dejar crecer el estado sin sentido.
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
      // Nombres únicos (case-insensitive): dos clubes con el mismo nombre romperían
      // clubByName, que resuelve el color por nombre.
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

  // Nunca sobrescribimos una base que no pudimos leer: misma protección que ya
  // tenía el cliente contra el incidente de "liga vacía".
  if(!current) return res.status(409).json({ error: 'La base respondió vacía; no se sobrescribe.' });

  // Una liga FINALIZADA es de solo lectura: no se cargan ni editan resultados,
  // ni siquiera un admin. Se valida en el servidor (no solo ocultando botones).
  try {
    const idx = await readLigaIndex();
    const entry = idx.find(l => l.id === ligaId);
    if(entry && entry.estado === 'finalizada'){
      return res.status(403).json({ error: 'Esta liga está finalizada: es de solo lectura. Reabrila para poder cargar resultados.' });
    }
  } catch(e){ /* si el índice no se puede leer, no bloqueamos: la liga por defecto sigue funcionando */ }

  const blocked = blockedUser(current, session);
  if(blocked) return res.status(403).json({ error: blocked });

  // BLOQUEO OPTIMISTA. Todo el estado es un único bloque y cada guardado lo
  // reescribe entero: si dos personas tienen la app abierta, la segunda en
  // guardar pisaba el resultado de la primera y NADIE se enteraba.
  // Ahora, si la versión no coincide, se rechaza y el cliente recarga.
  const curV = current._v || 0;
  const inV  = incoming._v || 0;
  if(inV !== curV){
    return res.status(409).json({
      error: 'Otra persona guardó un cambio mientras cargabas el tuyo. Recargá la página y volvé a cargarlo.',
      conflict: true,
      currentV: curV   // el cliente puede usar esto para sincronizar sin hacer otro fetch
    });
  }
  incoming._v = curV + 1;

  const curUsers = current.users || {};
  const admin    = sesionEsAdmin(session, curUsers);

  // =====================================================================
  // EL SUPER ADMINISTRADOR ES ÚNICO E INTRANSFERIBLE
  // Esto va FUERA del if(!admin) a propósito: aplica también a los admins.
  // Sin esto un admin podía (a) darse el rol a sí mismo, (b) borrar al super
  // y crear otro, o (c) pisarle el hash y entrar como él. Las tres vías
  // esquivaban la validación, porque toda vivía dentro de if(!admin).
  // =====================================================================
  const supers = o => Object.keys(o || {})
    .filter(n => o[n] && o[n].role === 'superadmin')
    .sort().join('|');

  const superAntes = supers(curUsers), superAhora = supers(incoming.users);
  if(superAntes !== superAhora){
    // Única excepción: una base vieja que no tiene superadmin y el cliente crea
    // el primero (la migración de _hydrate). Solo con la clave canónica: así un
    // admin no puede aprovechar el hueco para coronarse a sí mismo.
    const esMigracion = superAntes === '' && superAhora === 'superadmin';
    if(!esMigracion){
      return res.status(403).json({
        error: 'El super administrador es único: no se puede crear, duplicar, transferir ni eliminar.'
      });
    }
  }

  // =====================================================================
  // LAS CONTRASEÑAS NUNCA VIAJAN EN /api/save
  // Se cambian ÚNICAMENTE por /api/password. Acá el hash de cualquier usuario
  // que ya exista se reinyecta desde la base, para TODOS los roles.
  // =====================================================================
  for(const n of Object.keys(incoming.users)){
    const cu = curUsers[n];
    if(cu && incoming.users[n]) incoming.users[n].pass = cu.pass;
  }

  // Los roles válidos son solo estos tres. Y 'superadmin' ya está blindado arriba,
  // así que un admin solo puede mover gente entre 'player' y 'admin'.
  for(const n of Object.keys(incoming.users)){
    const r = incoming.users[n] && incoming.users[n].role;
    if(r !== 'player' && r !== 'admin' && r !== 'superadmin'){
      return res.status(400).json({ error: 'Rol inválido para "' + n.slice(0, 40) + '".' });
    }
  }

  // El rol de administrador solo lo reparte la cuenta original o el super admin.
  const flags = o => Object.keys(o || {}).filter(n => o[n] && o[n].isAdmin === true).sort().join('|');
  if(flags(curUsers) !== flags(incoming.users) && !puedeGestionarAdmins(session)){
    const borrados = Object.keys(curUsers).filter(n => curUsers[n] && curUsers[n].isAdmin === true && !incoming.users[n]);
    if(borrados.length){
      return res.status(403).json({ error: 'No podés eliminar a ' + borrados[0].slice(0, 40) + ': tiene rol de administrador. Quitáselo primero, o pedíselo al administrador original.' });
    }
    return res.status(403).json({ error: 'Solo el administrador original y el super admin pueden repartir el rol de administrador.' });
  }

  // Siempre tiene que quedar al menos un admin
  const cuentaAdmins = o => Object.keys(o || {}).filter(n => o[n] && (o[n].role === 'admin' || o[n].isAdmin === true)).length;
  if(cuentaAdmins(curUsers) > 0 && cuentaAdmins(incoming.users) === 0){
    return res.status(403).json({ error: 'Tiene que quedar al menos un administrador.' });
  }

  if(!admin){
    const COSMETICO = ['LEAGUE_NAME','LEAGUE_SUBTITLE','LEAGUE_COLOR_PRI',
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

    const CONGELADO = ['cycles','activeN','DESTINO','FECHAS','PO_FECHAS',
                       'ALLNAMES','PUNTOS','LEAGUE_NAME','LEAGUE_SUBTITLE',
                       'LEAGUE_COLOR_PRI','LEAGUE_COLOR_ACC','LEAGUE_COLOR_HL'];
    for(const k of CONGELADO){
      if(k in current) incoming[k] = current[k]; else delete incoming[k];
    }

    if(!admin){
      const poOld = JSON.stringify(current.playoff || {});
      const poNew = JSON.stringify(incoming.playoff || {});
      if(poOld !== poNew) incoming.playoff = current.playoff;
    }

    // "soyYo" reconoce partidos propios en los DOS formatos que usa la app:
    //   - Liga regular: los nombres viven en m.aName / m.bName (strings sueltos).
    //   - Playoffs:     los nombres viven en m.poNames (array [nombreA, nombreB]).
    //
    // Comparación con normalización defensiva: trim + lowercase + sin tildes.
    // Esto tolera diferencias sutiles entre el nombre guardado en el match
    // (que puede venir con o sin tilde según cómo se creó) y el session.u
    // del token (que es el nombre display del usuario logueado).
    // Sin esto un jugador "Víctor Oliveira" no podía cargar su match si
    // el bracket guardó su nombre como "Victor Oliveira" o viceversa.
    const _norm = s => String(s || '')
      .trim()
      .toLocaleLowerCase('es')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const _me = _norm(session.u);
    const soyYo = m => {
      if(!m) return false;
      if(_norm(m.aName) === _me) return true;
      if(_norm(m.bName) === _me) return true;
      if(Array.isArray(m.poNames) && m.poNames.some(n => _norm(n) === _me)) return true;
      // Extra: en playoffs se guarda también m.reporter con el nombre de quien
      // cargó. Si el jugador es el reporter, es su match (aunque el nombre
      // display en poNames sea distinto por un desajuste histórico).
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

  try { await writeState(ligaId, incoming); }
  catch(e){ return res.status(503).json({ error: 'No se pudo guardar: ' + e.message }); }

  // =====================================================================
  // NOTIFICACIONES WHATSAPP a los admins — FIRE-AND-FORGET.
  //
  // NO usamos await: el usuario no debe esperar a que CallMeBot responda,
  // porque es un servicio gratuito que a veces demora 10-30s. Con await:
  //   - El usuario ve la app colgada mientras carga un partido.
  //   - En peor caso Vercel corta la función a los 60s con 504, aunque el
  //     partido SÍ se haya guardado. Usuario asume fallo → recarga →
  //     duplicados.
  //
  // Con fire-and-forget la promise queda corriendo en background.
  // En serverless Vercel Node, el runtime espera a que las promises
  // pendientes se completen antes de matar el proceso, hasta el límite
  // total de la función (60s en Hobby). Con 45s de timeout en el helper
  // hay margen de sobra.
  //
  // El .catch() vacío previene "unhandled promise rejection" — el helper
  // ya loguea internamente cada fallo a audit_log con detalle.
  // =====================================================================
  _dispararNotificaciones(current, incoming, session).catch(() => {});

  return res.status(200).json({ ok: true, token: renewIfStale(session) || undefined });
};

// ---------------------------------------------------------------------
// Detecta eventos notificables comparando el estado previo vs el nuevo,
// y dispara la notificación WhatsApp correspondiente a cada uno.
// ---------------------------------------------------------------------
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

    const jugA = String(m.aName || '(?)').slice(0, 60);
    const jugB = String(m.bName || '(?)').slice(0, 60);

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
