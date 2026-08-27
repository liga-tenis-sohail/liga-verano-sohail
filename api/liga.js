// =====================================================================
// POST /api/liga   (Authorization: Bearer <token> salvo 'listar')
//   { accion: 'listar' }                      -> lista de ligas (público)
//   { accion: 'crear', id, nombre, ... }      -> crea una liga (admin)
//   { accion: 'cerrar', id }                  -> finaliza (admin)
//   { accion: 'reabrir', id }                 -> vuelve a activa (admin)
//   { accion: 'eliminar', id, confirmar }     -> borra la liga (admin)
//
// El ciclo de vida completo de una liga. Todo lo estructural (crear/cerrar/
// reabrir/borrar) pasa por acá; la carga de resultados sigue en /api/save.
// =====================================================================
const {
  auth, envOK, sesionEsAdmin, readState, writeState,
  readLigaIndex, upsertLigaIndex, setEstadoLiga, borrarLiga,
  readCatalogo, buscarJugadorPorEmail, upsertJugador, borrarJugador, borrarPasskeysDeUsuario,
  ligaIdOK, hashV2, logAudit, clientIP
} = require('./_lib');

const crypto = require('crypto');

// id de jugador estable a partir del nombre (mismo criterio que la migración).
function idDeJugador(nombre){
  const norm = String(nombre).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return 'p_' + crypto.createHash('sha256').update(norm).digest('hex').slice(0, 10);
}

// Estado inicial de una liga nueva: mismo formato que el resto del sistema.
// Un ciclo activo vacío, sin playoff. Los grupos se arman después en la app.
function estadoInicial(nombreLiga, numGrupos, numCiclos){
  // Cantidad de grupos y ciclos elegida por el admin (con topes razonables).
  const nG = Math.max(1, Math.min(30, parseInt(numGrupos, 10) || 1));
  const nC = Math.max(1, Math.min(12, parseInt(numCiclos, 10) || 1));
  // El primer ciclo arranca activo con nG grupos vacíos; el resto quedan bloqueados.
  const cycles = [];
  for(let i = 0; i < nC; i++){
    if(i === 0){
      cycles.push({ n: 1, status: 'active', groups: Array.from({ length: nG }, () => ({ players: [] })) });
    } else {
      cycles.push({ n: i + 1, status: 'locked', groups: null });
    }
  }
  return {
    _v: 1,
    users: {},
    matches: [],
    matchId: 1,
    activeN: 1,
    cycles: cycles,
    playoff: { started: false, numTramos: 4, tramos: [], results: {}, viewT: 0, preview: false },
    DESTINO: {}, FECHAS: [], PO_FECHAS: {},
    ALLNAMES: [],
    PUNTOS: {},
    LOG: [],
    LEAGUE_NAME: nombreLiga || 'Liga nueva',
    LEAGUE_SUBTITLE: '',
    CLUBS: [{ id: 'sohail', name: 'Sohail', bg: '#D6ECFB' }],
    COLOR_DISPUTA: '#FAEEDA',
    RATING_ON: false,
    REGLAMENTO: ''
  };
}

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if(!envOK(res)) return;

  const body   = (req.body && typeof req.body === 'object') ? req.body : {};
  const accion = String(body.accion || '');

  // ---- LISTAR: público (lo usa el login para el desplegable de ligas) ----
  if(accion === 'listar'){
    try {
      const idx = await readLigaIndex();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ligas: idx });
    } catch(e){
      return res.status(503).json({ error: 'No se pudo leer la lista de ligas.' });
    }
  }

  // ---- VER: público, SOLO ligas finalizadas (consulta de ligas pasadas) ----
  // Las ligas activas son privadas (se entra con login). Las finalizadas son
  // públicas y de solo lectura. El estado se devuelve sin hashes de contraseñas.
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
    // Filtrar: sacar los hashes de contraseña de los usuarios (consulta pública).
    if(estado.users){
      const limpios = {};
      for(const k of Object.keys(estado.users)){
        const u = estado.users[k] || {};
        const { pass, ...resto } = u;   // sin pass
        limpios[k] = resto;
      }
      estado.users = limpios;
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, id: vid, nombre: entry.nombre, estado });
  }

  // ---- El resto requiere sesión de admin ----
  const session = auth(req);
  if(!session) return res.status(401).json({ error: 'Sesión inválida o expirada. Volvé a entrar.' });

  // El permiso se lee del estado de la liga donde está logueado el admin.
  // Para 'crear' es crítico: sesionState alimenta también la herencia de
  // admin/superadmin a la liga nueva. Si acá falla la lectura, seguir con
  // sesionState=null dejaría la liga nueva SIN admins, huérfana.
  let sesionState;
  let sesionStateErr = null;
  try { sesionState = await readState(body.ligaId || session.ligaId || undefined); }
  catch(e){ sesionState = null; sesionStateErr = e; }
  const esAdmin = sesionEsAdmin(session, sesionState && sesionState.users);
  if(!esAdmin) return res.status(403).json({ error: 'Solo un administrador puede gestionar ligas.' });

  // ---- CATALOGO: devuelve los jugadores del catálogo global (para el selector) ----
  // Solo datos públicos: id, nombre, email. Nunca el hash de contraseña.
  if(accion === 'catalogo'){
    let cat = {};
    try { cat = await readCatalogo(); } catch(e){ cat = {}; }
    const jugadores = Object.keys(cat).map(id => ({
      jugadorId: id,
      nombre: (cat[id] && cat[id].nombre) || '',
      email: (cat[id] && cat[id].email) || ''
    })).sort((a,b)=> a.nombre.localeCompare(b.nombre));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ jugadores });
  }

  // ---- JUGADORES: lista completa + en cuántas ligas y partidos aparece cada uno ----
  // Para el tab de gestión de jugadores del superadmin.
  if(accion === 'jugadores'){
    let cat = {};
    try { cat = await readCatalogo(); } catch(e){ cat = {}; }
    let idx = [];
    try { idx = await readLigaIndex(); } catch(e){ idx = []; }
    // Contar en cuántas ligas juega cada nombre y cuántos partidos tiene en total.
    const porNombre = {};   // nombre -> { ligas:Set, partidos:n }
    for(const l of idx){
      let est;
      try { est = await readState(l.id); } catch(e){ continue; }
      if(!est) continue;
      const ms = est.matches || [];
      const nombresConPartido = new Set();
      ms.forEach(m => { if(m){ if(m.aName) nombresConPartido.add(m.aName); if(m.bName) nombresConPartido.add(m.bName); } });
      // partidos por nombre
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
      return {
        jugadorId: id,
        nombre: nom,
        email: (cat[id] && cat[id].email) || '',
        ligas: info.ligas.size,
        partidos: info.partidos
      };
    }).sort((a,b)=> a.nombre.localeCompare(b.nombre));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ jugadores });
  }

  // ---- ELIMINAR JUGADOR: solo superadmin. Borra del catálogo, NO toca partidos ----
  if(accion === 'eliminarJugador'){
    if(!(session && session.r === 'superadmin')){
      return res.status(403).json({ error: 'Solo el super administrador puede eliminar jugadores de la base.' });
    }
    const jid = String(body.jugadorId || '');
    if(!jid) return res.status(400).json({ error: 'Falta el jugador.' });
    // Antes de borrar el perfil, ubicamos su nombre para poder limpiar sus
    // passkeys. Si no lo encontramos, seguimos: la limpieza es best-effort.
    let nombreJug = null;
    try {
      const cat = await readCatalogo();
      nombreJug = cat[jid] && cat[jid].nombre;
    } catch(_){ /* seguimos: la limpieza de passkeys es best-effort */ }
    try { await borrarJugador(jid); }
    catch(e){ return res.status(503).json({ error: 'No se pudo eliminar: ' + e.message }); }
    // Limpieza de passkeys huérfanas: si mañana se crea otro jugador con el
    // mismo nombre, no debería heredar las Face ID del anterior.
    if(nombreJug){
      try { await borrarPasskeysDeUsuario(nombreJug); } catch(_){ /* best-effort */ }
    }
    logAudit(session.u, 'jugador.eliminar', jid, { nombre: nombreJug }, clientIP(req));
    return res.status(200).json({ ok: true, jugadorId: jid });
  }

  const id = String(body.id || '');
  if(accion !== 'crear' && !ligaIdOK(id)){
    return res.status(400).json({ error: 'Falta el identificador de la liga o es inválido.' });
  }

  // ================= CREAR =================
  if(accion === 'crear'){
    const nombre = String(body.nombre || '').trim();
    const nuevoId = String(body.id || '').trim().toLowerCase();
    if(!nombre) return res.status(400).json({ error: 'Falta el nombre de la liga.' });
    if(!ligaIdOK(nuevoId)) return res.status(400).json({ error: 'El identificador de la liga es inválido (solo minúsculas, números y guiones).' });

    // ¿Ya existe una liga con ese id?
    let idx;
    try { idx = await readLigaIndex(); } catch(e){ idx = []; }
    if(idx.some(l => l.id === nuevoId)){
      return res.status(409).json({ error: 'Ya existe una liga con ese identificador.' });
    }

    // La liga nueva DEBE heredar al admin/superadmin actuales; si no se pudo
    // leer el estado de la liga desde donde estás logueado, abortamos: crear
    // una liga sin admin la deja huérfana y sin forma de recuperarla desde la app.
    if(!sesionState || !sesionState.users){
      return res.status(503).json({ error: 'No se pudo leer la liga actual para heredar los administradores. Probá de nuevo en unos segundos.' });
    }

    const estado = estadoInicial(nombre, body.numGrupos, body.numCiclos);

    // Preservar las cuentas de sistema: la liga nueva hereda al superadmin Y al
    // admin actuales (con sus contraseñas), para no quedar sin dueño y para que
    // la clave del admin sea la misma en todas las ligas.
    if(sesionState && sesionState.users){
      for(const k of Object.keys(sesionState.users)){
        const su = sesionState.users[k];
        if(su && (su.role === 'superadmin' || su.role === 'admin')){
          estado.users[k] = { ...su };
        }
      }
    }

    // --- Armar el plantel: jugadores del catálogo + nuevos ---
    const jugadores = Array.isArray(body.jugadores) ? body.jugadores : [];
    let catalogo = {};
    try { catalogo = await readCatalogo(); } catch(e){ catalogo = {}; }

    // CORRECCIÓN: Contadores para repartir automáticamente los jugadores en los grupos.
    let currentGroupIndex = 0;
    const numGroups = estado.cycles[0].groups.length;

    for(const j of jugadores){
      if(!j) continue;
      let perfil = null;

      if(j.jugadorId && catalogo[j.jugadorId]){
        // Ya existe en el catálogo: se trae tal cual (con su historial y clave).
        perfil = catalogo[j.jugadorId];
      } else if(j.email){
        // Buscar por email: quizás ya existe con otra grafía de nombre.
        try { perfil = await buscarJugadorPorEmail(j.email); } catch(e){ perfil = null; }
        if(!perfil && j.nombre){
          // Nuevo con email: crear perfil en el catálogo.
          perfil = { id: idDeJugador(j.nombre), nombre: String(j.nombre).trim(), email: String(j.email).trim().toLowerCase(), pass: null };
          try { await upsertJugador(perfil); } catch(e){ /* si falla, se agrega igual a la liga */ }
        }
      } else if(j.nombre){
        // Nuevo sin email: crear perfil sin vincular (se vincula manual después).
        perfil = { id: idDeJugador(j.nombre), nombre: String(j.nombre).trim(), email: null, pass: null };
        try { await upsertJugador(perfil); } catch(e){ /* idem */ }
      }

      if(perfil && perfil.nombre){
        const nomNorm = perfil.nombre.trim().toLowerCase();
        if(nomNorm === 'admin' || nomNorm === 'superadmin') continue;
        
        estado.users[perfil.nombre] = { role: 'player', jugadorId: perfil.id };
        if(!estado.ALLNAMES.includes(perfil.nombre)) {
          estado.ALLNAMES.push(perfil.nombre);
          
          // LA MAGIA ESTÁ ACÁ: Asignamos el jugador al grupo y avanzamos al siguiente
          if (numGroups > 0) {
            estado.cycles[0].groups[currentGroupIndex].players.push(perfil.nombre);
            currentGroupIndex = (currentGroupIndex + 1) % numGroups;
          }
        }
      }
    }

    // Guardar la liga nueva + registrarla en el índice como activa.
    try {
      await writeState(nuevoId, estado);
      const orden = (idx.length ? Math.max(...idx.map(l => l.orden || 0)) : 0) + 1;
      await upsertLigaIndex({ id: nuevoId, nombre, estado: 'activa', orden });
    } catch(e){
      return res.status(503).json({ error: 'No se pudo crear la liga: ' + e.message });
    }

    logAudit(session.u, 'liga.crear', nuevoId, { nombre, jugadores: estado.ALLNAMES.length }, clientIP(req));
    return res.status(200).json({ ok: true, id: nuevoId, jugadores: estado.ALLNAMES.length });
  }

  // ================= CERRAR =================
  if(accion === 'cerrar'){
    try { await setEstadoLiga(id, 'finalizada'); }
    catch(e){ return res.status(503).json({ error: 'No se pudo cerrar la liga: ' + e.message }); }
    logAudit(session.u, 'liga.cerrar', id, null, clientIP(req));
    return res.status(200).json({ ok: true, id, estado: 'finalizada' });
  }

  // ================= REABRIR =================
  if(accion === 'reabrir'){
    try { await setEstadoLiga(id, 'activa'); }
    catch(e){ return res.status(503).json({ error: 'No se pudo reabrir la liga: ' + e.message }); }
    logAudit(session.u, 'liga.reabrir', id, null, clientIP(req));
    return res.status(200).json({ ok: true, id, estado: 'activa' });
  }

  // ================= RENOMBRAR =================
  if(accion === 'renombrar'){
    const nuevoNombre = String(body.nombre || '').trim();
    if(!nuevoNombre) return res.status(400).json({ error: 'Falta el nombre nuevo.' });
    if(nuevoNombre.length > 80) return res.status(400).json({ error: 'El nombre es demasiado largo (máximo 80).' });
    let idx;
    try { idx = await readLigaIndex(); } catch(e){ return res.status(503).json({ error: 'No se pudo leer el índice.' }); }
    const entry = idx.find(l => l.id === id);
    if(!entry) return res.status(404).json({ error: 'Esa liga no existe.' });
    try {
      await upsertLigaIndex({ id, nombre: nuevoNombre, estado: entry.estado, orden: entry.orden });
      const estado = await readState(id);
      if(estado){ estado.LEAGUE_NAME = nuevoNombre; await writeState(id, estado); }
    } catch(e){ return res.status(503).json({ error: 'No se pudo renombrar: ' + e.message }); }
    logAudit(session.u, 'liga.renombrar', id, { anterior: entry.nombre, nuevo: nuevoNombre }, clientIP(req));
    return res.status(200).json({ ok: true, id, nombre: nuevoNombre });
  }

  // ================= ELIMINAR =================
  if(accion === 'eliminar'){
    let estado = null;
    try { estado = await readState(id); } catch(e){ estado = null; }
    const tienePartidos = !!(estado && Array.isArray(estado.matches) && estado.matches.length);

    if(tienePartidos){
      const confirmar = String(body.confirmar || '');
      const nombreLiga = (estado.LEAGUE_NAME || '').trim();
      if(confirmar !== nombreLiga && confirmar !== id){
        return res.status(400).json({
          error: 'Esta liga tiene ' + estado.matches.length + ' partidos. Para borrarla, confirmá escribiendo su nombre exacto.',
          requiereConfirmacion: true,
          nombre: nombreLiga
        });
      }
    }

    try { await borrarLiga(id); }
    catch(e){ return res.status(503).json({ error: 'No se pudo eliminar la liga: ' + e.message }); }
    logAudit(session.u, 'liga.eliminar', id, { nombre: estado && estado.LEAGUE_NAME, partidos: estado && estado.matches ? estado.matches.length : 0 }, clientIP(req));
    return res.status(200).json({ ok: true, id, eliminada: true });
  }

  return res.status(400).json({ error: 'Acción desconocida: ' + accion });
};
