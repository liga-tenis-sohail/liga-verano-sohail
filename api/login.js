// =====================================================================
// POST /api/liga   (Authorization: Bearer <token> salvo 'listar')
//   { accion: 'listar' }                      -> lista de ligas (público)
//   { accion: 'crear', id, nombre, ... }      -> crea una liga (admin)
//   { accion: 'cerrar', id }                  -> finaliza (admin)
//   { accion: 'reabrir', id }                 -> vuelve a activa (admin)
//   { accion: 'eliminar', id, confirmar }     -> borra la liga (admin)
// =====================================================================
const {
  auth, envOK, sesionEsAdmin, readState, writeState,
  readLigaIndex, upsertLigaIndex, setEstadoLiga, borrarLiga,
  readCatalogo, buscarJugadorPorEmail, upsertJugador, borrarJugador, borrarPasskeysDeUsuario,
  ligaIdOK, hashV2, logAudit, clientIP
} = require('./_lib');

const crypto = require('crypto');

function idDeJugador(nombre){
  const norm = String(nombre).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return 'p_' + crypto.createHash('sha256').update(norm).digest('hex').slice(0, 10);
}

// Valida y limpia la lista de clubes que manda el frontend al crear una liga.
// Devuelve un array de {id,name,bg} o null si no hay ninguno válido (en ese
// caso el llamador conserva los clubes por defecto de estadoInicial).
function sanitizarClubs(clubsIn){
  if(!Array.isArray(clubsIn)) return null;
  const limpios = [];
  const vistos = new Set();
  for(const c of clubsIn){
    if(!c) continue;
    const nombre = String(c.name || '').trim().slice(0, 24);
    if(!nombre) continue;
    const key = nombre.toLowerCase();
    if(vistos.has(key)) continue;
    vistos.add(key);
    let bg = String(c.bg || '').trim();
    if(!/^#[0-9a-fA-F]{6}$/.test(bg)) bg = '#E5E7EB';
    const idOK = c.id && /^[a-z0-9_-]{1,40}$/i.test(String(c.id));
    limpios.push({ id: idOK ? String(c.id) : ('c' + crypto.randomBytes(4).toString('hex')), name: nombre, bg });
    if(limpios.length >= 30) break;
  }
  return limpios.length ? limpios : null;
}

// ESTADO INICIAL SINCRONIZADO CON EL FRONTEND
function estadoInicial(nombreLiga, numGrupos, numCiclos){
  const nG = Math.max(1, Math.min(30, parseInt(numGrupos, 10) || 1));
  const nC = Math.max(1, Math.min(12, parseInt(numCiclos, 10) || 1));
  const cycles = [];
  for(let i = 0; i < nC; i++){
    if(i === 0){
      cycles.push({ n: 1, status: 'active', groups: Array.from({ length: nG }, () => ({ players: [] })) });
    } else {
      cycles.push({ n: i + 1, status: 'locked', groups: null });
    }
  }
  return {
    _v: 1, users: {}, matches: [], matchId: 1, activeN: 1, cycles: cycles,
    playoff: { started: false, numTramos: 4, tramos: [], results: {}, viewT: 0, preview: false },
    DESTINO: {}, FECHAS: [], PO_FECHAS: {}, ALLNAMES: [], PUNTOS: {}, LOG: [],
    LEAGUE_NAME: nombreLiga || 'Liga nueva', LEAGUE_SUBTITLE: '',
    LEAGUE_COLOR_PRI: '#1B4F9C',
    LEAGUE_COLOR_ACC: '#F5C518',
    LEAGUE_COLOR_HL: '#FFEDD5',
    CLUBS: [
      { id: 'sohail', name: 'Sohail', bg: '#D6ECFB' },
      { id: 'haza', name: 'Haza', bg: '#FCE6CF' }
    ], 
    COLOR_DISPUTA: '#FDE68A', 
    RATING_ON: false, REGLAMENTO: ''
  };
}

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if(!envOK(res)) return;

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const accion = String(body.accion || '');

  if(accion === 'listar'){
    try {
      const idx = await readLigaIndex();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ligas: idx });
    } catch(e){ return res.status(503).json({ error: 'No se pudo leer la lista de ligas.' }); }
  }

  if(accion === 'ver'){
    const vid = String(body.id || '');
    if(!ligaIdOK(vid)) return res.status(400).json({ error: 'Identificador de liga inválido.' });
    let idx;
    try { idx = await readLigaIndex(); } catch(e){ return res.status(503).json({ error: 'No se pudo leer la lista de ligas.' }); }
    const entry = idx.find(l => l.id === vid);
    if(!entry) return res.status(404).json({ error: 'Esa liga no existe.' });
    if(entry.estado !== 'finalizada') return res.status(403).json({ error: 'Esa liga está activa: se entra con usuario y contraseña.' });
    let estado;
    try { estado = await readState(vid); } catch(e){ return res.status(503).json({ error: 'No se pudo leer la liga.' }); }
    if(!estado) return res.status(404).json({ error: 'Esa liga no tiene datos.' });
    if(estado.users){
      const limpios = {};
      for(const k of Object.keys(estado.users)){
        const u = estado.users[k] || {};
        const { pass, ...resto } = u; 
        limpios[k] = resto;
      }
      estado.users = limpios;
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, id: vid, nombre: entry.nombre, estado });
  }

  const session = auth(req);
  if(!session) return res.status(401).json({ error: 'Sesión inválida o expirada. Volvé a entrar.' });

  let sesionState, sesionStateErr = null;
  try { sesionState = await readState(body.ligaId || session.ligaId || undefined); }
  catch(e){ sesionState = null; sesionStateErr = e; }
  const esAdmin = sesionEsAdmin(session, sesionState && sesionState.users);
  if(!esAdmin) return res.status(403).json({ error: 'Solo un administrador puede gestionar ligas.' });

  if(accion === 'catalogo'){
    let cat = {};
    try { cat = await readCatalogo(); } catch(e){ cat = {}; }
    const jugadores = Object.keys(cat).map(id => ({
      jugadorId: id, nombre: (cat[id] && cat[id].nombre) || '', email: (cat[id] && cat[id].email) || ''
    })).sort((a,b)=> a.nombre.localeCompare(b.nombre));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ jugadores });
  }

  if(accion === 'jugadores'){
    let cat = {}; try { cat = await readCatalogo(); } catch(e){ cat = {}; }
    let idx = []; try { idx = await readLigaIndex(); } catch(e){ idx = []; }
    const porNombre = {};
    for(const l of idx){
      let est; try { est = await readState(l.id); } catch(e){ continue; }
      if(!est) continue;
      const ms = est.matches || [];
      const cuenta = {};
      ms.forEach(m => { if(m){ if(m.aName) cuenta[m.aName]=(cuenta[m.aName]||0)+1; if(m.bName) cuenta[m.bName]=(cuenta[m.bName]||0)+1; } });
      Object.keys(cuenta).forEach(nom => {
        if(!porNombre[nom]) porNombre[nom] = { ligas: new Set(), partidos: 0 };
        porNombre[nom].ligas.add(l.id);
        porNombre[nom].partidos += cuenta[nom];
      });
    }
    const jugadores = Object.keys(cat).map(id => {
      const nom = (cat[id] && cat[id].nombre) || '';
      const info = porNombre[nom] || { ligas: new Set(), partidos: 0 };
      return { jugadorId: id, nombre: nom, email: (cat[id] && cat[id].email) || '', ligas: info.ligas.size, partidos: info.partidos };
    }).sort((a,b)=> a.nombre.localeCompare(b.nombre));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ jugadores });
  }

  if(accion === 'eliminarJugador'){
    if(!(session && session.r === 'superadmin')) return res.status(403).json({ error: 'Solo el super administrador puede eliminar jugadores de la base.' });
    const jid = String(body.jugadorId || '');
    if(!jid) return res.status(400).json({ error: 'Falta el jugador.' });
    let nombreJug = null;
    try { const cat = await readCatalogo(); nombreJug = cat[jid] && cat[jid].nombre; } catch(_){}
    try { await borrarJugador(jid); } catch(e){ return res.status(503).json({ error: 'No se pudo eliminar: ' + e.message }); }
    if(nombreJug){ try { await borrarPasskeysDeUsuario(nombreJug); } catch(_){} }
    logAudit(session.u, 'jugador.eliminar', jid, { nombre: nombreJug }, clientIP(req));
    return res.status(200).json({ ok: true, jugadorId: jid });
  }

  const id = String(body.id || '');
  if(accion !== 'crear' && !ligaIdOK(id)){ return res.status(400).json({ error: 'Falta el identificador de la liga o es inválido.' }); }

  // ================= CREAR LIGA =================
  if(accion === 'crear'){
    const nombre = String(body.nombre || '').trim();
    const nuevoId = String(body.id || '').trim().toLowerCase();
    if(!nombre) return res.status(400).json({ error: 'Falta el nombre de la liga.' });
    if(!ligaIdOK(nuevoId)) return res.status(400).json({ error: 'El identificador de la liga es inválido.' });

    let idx; try { idx = await readLigaIndex(); } catch(e){ idx = []; }
    if(idx.some(l => l.id === nuevoId)) return res.status(409).json({ error: 'Ya existe una liga con ese identificador.' });
    if(!sesionState || !sesionState.users) return res.status(503).json({ error: 'No se pudo leer la liga actual para heredar administradores.' });

    const estado = estadoInicial(nombre, body.numGrupos, body.numCiclos);

    // Mantener el diseño (colores) de la liga desde la que se está creando,
    // para que las ligas nuevas no vuelvan al azul/amarillo por defecto.
    if(sesionState){
      if(sesionState.LEAGUE_COLOR_PRI) estado.LEAGUE_COLOR_PRI = sesionState.LEAGUE_COLOR_PRI;
      if(sesionState.LEAGUE_COLOR_ACC) estado.LEAGUE_COLOR_ACC = sesionState.LEAGUE_COLOR_ACC;
      if(sesionState.LEAGUE_COLOR_HL)  estado.LEAGUE_COLOR_HL  = sesionState.LEAGUE_COLOR_HL;
      if(sesionState.COLOR_DISPUTA)    estado.COLOR_DISPUTA    = sesionState.COLOR_DISPUTA;
    }

    // Clubes elegidos por el admin al crear la liga (nombre + color hex).
    // Si no manda ninguno válido, se quedan los clubes por defecto de estadoInicial.
    const clubsElegidos = sanitizarClubs(body.clubs);
    if(clubsElegidos) estado.CLUBS = clubsElegidos;

    // HEREDAR ADMINS CORRECTAMENTE
    if(sesionState && sesionState.users){
      for(const k of Object.keys(sesionState.users)){
        const su = sesionState.users[k];
        if(su && (su.role === 'superadmin' || su.role === 'admin' || su.isAdmin === true)){ 
            estado.users[k] = { ...su }; 
        }
      }
    }

    const jugadores = Array.isArray(body.jugadores) ? body.jugadores : [];
    let catalogo = {}; try { catalogo = await readCatalogo(); } catch(e){ catalogo = {}; }

    for(const j of jugadores){
      if(!j) continue;
      let perfil = null;

      if(j.jugadorId && catalogo[j.jugadorId]){
        perfil = catalogo[j.jugadorId];
      } else if(j.email){
        try { perfil = await buscarJugadorPorEmail(j.email); } catch(e){ perfil = null; }
        if(!perfil && j.nombre){
          perfil = { id: idDeJugador(j.nombre), nombre: String(j.nombre).trim(), email: String(j.email).trim().toLowerCase(), pass: null };
          try { await upsertJugador(perfil); } catch(e){}
        }
      } else if(j.nombre){
        perfil = { id: idDeJugador(j.nombre), nombre: String(j.nombre).trim(), email: null, pass: null };
        try { await upsertJugador(perfil); } catch(e){}
      }

      if(perfil && perfil.nombre){
        const nomNorm = perfil.nombre.trim().toLowerCase();
        if(nomNorm === 'admin' || nomNorm === 'superadmin') continue;
        
        if(!estado.ALLNAMES.includes(perfil.nombre)) {
          estado.ALLNAMES.push(perfil.nombre);
          
          const numGroups = estado.cycles[0].groups.length;
          let targetIndex = (parseInt(j.grupo, 10) || 1) - 1;
          if (targetIndex < 0 || targetIndex >= numGroups) targetIndex = 0; 
          
          if (numGroups > 0) {
            estado.cycles[0].groups[targetIndex].players.push(perfil.nombre);
          }
        }
        
        // GUARDADO EXPLÍCITO DE NAME Y EMAIL
        if(estado.users[perfil.nombre]) {
            estado.users[perfil.nombre].jugadorId = perfil.id;
            estado.users[perfil.nombre].name = perfil.nombre;
            if (perfil.email) estado.users[perfil.nombre].email = perfil.email;
        } else {
            estado.users[perfil.nombre] = { 
                role: 'player', 
                name: perfil.nombre, 
                email: perfil.email || null, 
                jugadorId: perfil.id 
            };
        }
      }
    }

    try {
      await writeState(nuevoId, estado);
      const orden = (idx.length ? Math.max(...idx.map(l => l.orden || 0)) : 0) + 1;
      await upsertLigaIndex({ id: nuevoId, nombre, estado: 'activa', orden });
    } catch(e){ return res.status(503).json({ error: 'No se pudo crear la liga: ' + e.message }); }

    logAudit(session.u, 'liga.crear', nuevoId, { nombre, jugadores: estado.ALLNAMES.length }, clientIP(req));
    return res.status(200).json({ ok: true, id: nuevoId, jugadores: estado.ALLNAMES.length });
  }

  // ================= AGREGAR JUGADORES A UNA LIGA YA CREADA =================
  // Permite al admin/superadmin sumar jugadores del catálogo (de ligas pasadas
  // o de otras ligas) a una liga ya existente, eligiendo a qué grupo del ciclo
  // activo va cada uno. { accion:'agregarJugadores', id, jugadores:[{jugadorId?|nombre?,email?,grupo}] }
  if(accion === 'agregarJugadores'){
    const jugadoresIn = Array.isArray(body.jugadores) ? body.jugadores : [];
    if(!jugadoresIn.length) return res.status(400).json({ error: 'No se especificaron jugadores para agregar.' });

    let estado;
    try { estado = await readState(id); } catch(e){ return res.status(503).json({ error: 'No se pudo leer la liga.' }); }
    if(!estado) return res.status(404).json({ error: 'Esa liga no tiene datos.' });

    const cicloActivo = (estado.cycles || []).find(c => c && c.n === estado.activeN) || (estado.cycles || [])[(estado.activeN || 1) - 1];
    if(!cicloActivo || !Array.isArray(cicloActivo.groups) || !cicloActivo.groups.length){
      return res.status(400).json({ error: 'La liga no tiene un ciclo activo con grupos para agregar jugadores.' });
    }
    const numGrupos = cicloActivo.groups.length;

    let catalogo = {}; try { catalogo = await readCatalogo(); } catch(e){ catalogo = {}; }
    if(!estado.ALLNAMES) estado.ALLNAMES = [];
    if(!estado.users) estado.users = {};

    const agregados = [];
    for(const j of jugadoresIn){
      if(!j) continue;
      let perfil = null;

      if(j.jugadorId && catalogo[j.jugadorId]){
        perfil = catalogo[j.jugadorId];
      } else if(j.email){
        try { perfil = await buscarJugadorPorEmail(j.email); } catch(e){ perfil = null; }
        if(!perfil && j.nombre){
          perfil = { id: idDeJugador(j.nombre), nombre: String(j.nombre).trim(), email: String(j.email).trim().toLowerCase(), pass: null };
          try { await upsertJugador(perfil); } catch(e){}
        }
      } else if(j.nombre){
        perfil = { id: idDeJugador(j.nombre), nombre: String(j.nombre).trim(), email: null, pass: null };
        try { await upsertJugador(perfil); } catch(e){}
      }

      if(!perfil || !perfil.nombre) continue;
      const nomNorm = perfil.nombre.trim().toLowerCase();
      if(nomNorm === 'admin' || nomNorm === 'superadmin') continue;

      // Ya está jugando el ciclo activo de esta liga: no duplicar.
      const yaEnCicloActivo = cicloActivo.groups.some(g => (g.players || []).includes(perfil.nombre));
      if(yaEnCicloActivo) continue;

      let targetIndex = (parseInt(j.grupo, 10) || 1) - 1;
      if(targetIndex < 0 || targetIndex >= numGrupos) targetIndex = 0;
      cicloActivo.groups[targetIndex].players.push(perfil.nombre);

      if(!estado.ALLNAMES.includes(perfil.nombre)) estado.ALLNAMES.push(perfil.nombre);

      if(estado.users[perfil.nombre]){
        estado.users[perfil.nombre].jugadorId = perfil.id;
        estado.users[perfil.nombre].name = perfil.nombre;
        if(perfil.email) estado.users[perfil.nombre].email = perfil.email;
        if(estado.users[perfil.nombre].inactive) delete estado.users[perfil.nombre].inactive;
      } else {
        estado.users[perfil.nombre] = {
          role: 'player', name: perfil.nombre, email: perfil.email || null, jugadorId: perfil.id
        };
      }
      agregados.push({ nombre: perfil.nombre, grupo: targetIndex + 1 });
    }

    if(!agregados.length){
      return res.status(400).json({ error: 'No se agregó ningún jugador (ya estaban en el ciclo activo o los datos no eran válidos).' });
    }

    try { await writeState(id, estado); }
    catch(e){ return res.status(503).json({ error: 'No se pudo guardar la liga: ' + e.message }); }

    logAudit(session.u, 'liga.agregarJugadores', id, { jugadores: agregados.map(a => a.nombre) }, clientIP(req));
    return res.status(200).json({ ok: true, id, agregados });
  }

  // ================= CERRAR, REABRIR, ELIMINAR =================
  if(accion === 'cerrar'){
    try { await setEstadoLiga(id, 'finalizada'); } catch(e){ return res.status(503).json({ error: 'No se pudo cerrar: ' + e.message }); }
    logAudit(session.u, 'liga.cerrar', id, null, clientIP(req));
    return res.status(200).json({ ok: true, id, estado: 'finalizada' });
  }

  if(accion === 'reabrir'){
    try { await setEstadoLiga(id, 'activa'); } catch(e){ return res.status(503).json({ error: 'No se pudo reabrir: ' + e.message }); }
    logAudit(session.u, 'liga.reabrir', id, null, clientIP(req));
    return res.status(200).json({ ok: true, id, estado: 'activa' });
  }

  if(accion === 'renombrar'){
    const nuevoNombre = String(body.nombre || '').trim();
    if(!nuevoNombre || nuevoNombre.length > 80) return res.status(400).json({ error: 'Nombre inválido.' });
    try {
      const idx = await readLigaIndex();
      const entry = idx.find(l => l.id === id);
      if(!entry) return res.status(404).json({ error: 'Esa liga no existe.' });
      await upsertLigaIndex({ id, nombre: nuevoNombre, estado: entry.estado, orden: entry.orden });
      const estado = await readState(id);
      if(estado){ estado.LEAGUE_NAME = nuevoNombre; await writeState(id, estado); }
    } catch(e){ return res.status(503).json({ error: 'No se pudo renombrar: ' + e.message }); }
    logAudit(session.u, 'liga.renombrar', id, { nuevo: nuevoNombre }, clientIP(req));
    return res.status(200).json({ ok: true, id, nombre: nuevoNombre });
  }

  if(accion === 'eliminar'){
    try { await borrarLiga(id); } catch(e){ return res.status(503).json({ error: 'No se pudo eliminar: ' + e.message }); }
    logAudit(session.u, 'liga.eliminar', id, {}, clientIP(req));
    return res.status(200).json({ ok: true, id, eliminada: true });
  }

  return res.status(400).json({ error: 'Acción desconocida: ' + accion });
};
