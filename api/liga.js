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
  ligaIdOK, hashV2, logAudit, clientIP,
  insertarMensaje, leerMensajes, leerMensajesDesde
} = require('./_lib');

const crypto = require('crypto');

function idDeJugador(nombre){
  const norm = String(nombre).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return 'p_' + crypto.createHash('sha256').update(norm).digest('hex').slice(0, 10);
}

// Genera la escala de puntos por posición con la fórmula estándar de la liga:
// el último grupo SIEMPRE ancla el último puesto en 1 punto, subiendo de a 1
// por posición hacia el 1er puesto. Cada grupo hacia arriba (número menor)
// suma STEP puntos al 1er puesto. Así, sin importar cuántos grupos tenga la
// liga, la base (el último puesto del último grupo) siempre es 1.
//
// ppg (posiciones por grupo) se fija en 5 al crear la liga porque los grupos
// arrancan sin jugadores cargados (no se sabe su tamaño real todavía). Una vez
// que se cargan jugadores, el admin puede correr "Recalcular puntos" desde el
// panel para regenerar la escala ajustada al tamaño real de cada grupo.
function generarEscalaPuntos(numGrupos, ppg){
  const STEP = 3;
  const BASE = 5;
  const N = Math.max(1, numGrupos);
  const posiciones = Math.max(BASE, ppg || BASE);
  const PUNTOS = {};
  for(let gid = 1; gid <= N; gid++){
    const distanciaDesdeAbajo = N - gid;
    const ganador = BASE + distanciaDesdeAbajo * STEP;
    const arr = [];
    for(let pos = 0; pos < posiciones; pos++){
      const escalon = Math.min(pos, BASE - 1);
      arr.push(Math.max(1, ganador - escalon));
    }
    PUNTOS[gid] = arr;
  }
  return PUNTOS;
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
    DESTINO: {}, FECHAS: [], PO_FECHAS: {}, ALLNAMES: [], PUNTOS: generarEscalaPuntos(nG, 5), LOG: [],
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

  // ================= ACCIONES DE JUGADOR (no requieren ser admin) =================
  // Un jugador logueado en SU liga puede: ver el estado de todas las ligas
  // activas respecto de sí mismo (misLigas), y pedir entrar a otra (solicitarAcceso).
  // Ambas necesitan `body.ligaId` = la liga donde está logueado AHORA (para
  // verificar identidad: session.u tiene que existir como user real ahí).

  if(accion === 'misLigas'){
    const ligaOrigen = String(body.ligaId || '');
    if(!ligaIdOK(ligaOrigen)) return res.status(400).json({ error: 'Falta indicar tu liga actual.' });
    let origenState;
    try { origenState = await readState(ligaOrigen); } catch(e){ return res.status(503).json({ error: 'No se pudo leer tu liga.' }); }
    if(!origenState || !origenState.users || !origenState.users[session.u]){
      return res.status(403).json({ error: 'Tu sesión no corresponde a esa liga.' });
    }
    let idx;
    try { idx = await readLigaIndex(); } catch(e){ return res.status(503).json({ error: 'No se pudo leer la lista de ligas.' }); }
    const activas = idx.filter(l => l.estado === 'activa').sort((a,b)=>(b.orden||0)-(a.orden||0));
    // Nota de performance: esto lee el estado de CADA liga activa. Para el
    // tamaño esperado de esta plataforma (un club, pocas decenas de ligas
    // como mucho) es perfectamente aceptable. Si algún día hay cientos de
    // ligas activas simultáneas, esto se puede optimizar con un índice aparte.
    const resultado = [];
    for(const l of activas){
      let est;
      try { est = await readState(l.id); } catch(e){ continue; }
      if(!est) continue;
      const participo = !!(est.users && est.users[session.u]);
      let solicitudEstado = null;
      if(Array.isArray(est.JOIN_REQUESTS)){
        const propia = est.JOIN_REQUESTS
          .filter(r => r && r.nombre === session.u)
          .sort((a,b)=> String(b.fecha||'').localeCompare(String(a.fecha||'')))[0];
        if(propia) solicitudEstado = propia.status;
      }
      resultado.push({ id: l.id, nombre: l.nombre, esLigaActual: l.id === ligaOrigen, participo, solicitudEstado });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ligas: resultado });
  }

  if(accion === 'solicitarAcceso'){
    const ligaOrigen = String(body.ligaId || '');
    const ligaDestino = String(body.ligaDestino || '');
    if(!ligaIdOK(ligaOrigen) || !ligaIdOK(ligaDestino)){
      return res.status(400).json({ error: 'Falta indicar la liga de origen o destino.' });
    }
    if(ligaOrigen === ligaDestino){
      return res.status(400).json({ error: 'Ya estás en esa liga.' });
    }
    let origenState;
    try { origenState = await readState(ligaOrigen); } catch(e){ return res.status(503).json({ error: 'No se pudo leer tu liga.' }); }
    const yo = origenState && origenState.users && origenState.users[session.u];
    if(!yo){
      return res.status(403).json({ error: 'Tu sesión no corresponde a esa liga.' });
    }

    let idx;
    try { idx = await readLigaIndex(); } catch(e){ return res.status(503).json({ error: 'No se pudo leer la lista de ligas.' }); }
    const entryDestino = idx.find(l => l.id === ligaDestino);
    if(!entryDestino) return res.status(404).json({ error: 'Esa liga no existe.' });
    if(entryDestino.estado !== 'activa') return res.status(400).json({ error: 'Esa liga no está activa.' });

    let destinoState;
    try { destinoState = await readState(ligaDestino); } catch(e){ return res.status(503).json({ error: 'No se pudo leer la liga destino.' }); }
    if(!destinoState) return res.status(404).json({ error: 'Esa liga no tiene datos.' });

    if(destinoState.users && destinoState.users[session.u]){
      return res.status(400).json({ error: 'Ya participás en esa liga.' });
    }
    if(!Array.isArray(destinoState.JOIN_REQUESTS)) destinoState.JOIN_REQUESTS = [];
    const yaPendiente = destinoState.JOIN_REQUESTS.some(r => r && r.nombre === session.u && r.status === 'pending');
    if(yaPendiente){
      return res.status(400).json({ error: 'Ya tenés una solicitud pendiente para esa liga.' });
    }

    // Mismos caracteres que rechaza el resto del sistema (ver PELIGRO en save.js).
    // Esto viaja hacia el panel de OTRA liga, así que se sanea acá también.
    const PELIGRO = /[<>"`\\]/;
    const email = (yo.email && !PELIGRO.test(String(yo.email))) ? String(yo.email).slice(0, 120) : '';
    const tel   = (yo.tel   && !PELIGRO.test(String(yo.tel)))   ? String(yo.tel).slice(0, 40)   : '';

    destinoState.JOIN_REQUESTS.push({
      id: crypto.randomBytes(8).toString('hex'),
      nombre: session.u,
      email, tel,
      origenLigaId: ligaOrigen,
      origenLigaNombre: origenState.LEAGUE_NAME || '',
      fecha: new Date().toISOString(),
      status: 'pending'
    });
    // Límite defensivo: que la lista no crezca sin fin ante uso abusivo.
    if(destinoState.JOIN_REQUESTS.length > 500){
      destinoState.JOIN_REQUESTS = destinoState.JOIN_REQUESTS.slice(-500);
    }

    try { await writeState(ligaDestino, destinoState); }
    catch(e){ return res.status(503).json({ error: 'No se pudo guardar la solicitud: ' + e.message }); }

    logAudit(session.u, 'liga.solicitarAcceso', ligaDestino, { origenLigaId: ligaOrigen }, clientIP(req));
    return res.status(200).json({ ok: true });
  }

  const ligaIdMsg = (body.ligaId && ligaIdOK(body.ligaId)) ? body.ligaId : LIGA_DEFAULT;

  // Toda acción necesita saber quién sos DENTRO de esta liga puntual (mismo
  // patrón que usan misLigas/solicitarAcceso en api/liga.js): el token no
  // sabe a qué liga pertenece, así que se verifica leyendo el estado real.
  let stateMsg;
  try { stateMsg = await readState(ligaIdMsg); }
  catch(e){ return res.status(503).json({ error: 'No se pudo leer la liga.' }); }
  if(!stateMsg || !stateMsg.users || !stateMsg.users[session.u]){
    return res.status(403).json({ error: 'Tu sesión no corresponde a esta liga.' });
  }
  const esAdminMsg = sesionEsAdmin(session, stateMsg.users);

  // ---- Lectura del hilo admin (cualquiera logueado en la liga) ----
  if(accion === 'listarAdmin'){
    try {
      const msgs = await leerMensajes({ ligaId: ligaIdMsg, tipo: 'admin', limite: 200 });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ mensajes: msgs });
    } catch(e){ return res.status(503).json({ error: 'No se pudieron leer los mensajes.' }); }
  }

  if(accion === 'nuevosAdmin'){
    const desdeId = parseInt(body.desdeId, 10) || 0;
    try {
      const msgs = await leerMensajesDesde({ ligaId: ligaIdMsg, tipo: 'admin', desdeId });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ mensajes: msgs });
    } catch(e){ return res.status(503).json({ error: 'No se pudieron leer los mensajes.' }); }
  }

  // ---- Envío al hilo admin (solo admin) ----
  if(accion === 'enviarAdmin'){
    if(!esAdminMsg) return res.status(403).json({ error: 'Solo un administrador puede escribir acá.' });
    const texto = String(body.texto || '').trim();
    if(!texto) return res.status(400).json({ error: 'El mensaje está vacío.' });
    if(texto.length > 2000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 2000 caracteres).' });

    // Nota: sin límite de ritmo por ahora — la tabla rate_limits está pensada
    // para bloqueos de login (contador que no se resetea solo con el tiempo,
    // solo con un login exitoso) y no encaja bien para "N mensajes por
    // minuto". Para una liga chica y de confianza el riesgo de spam es bajo;
    // si hiciera falta más adelante, conviene un contador con ventana de
    // tiempo real (ej. Redis/KV con TTL), no esta tabla.
    try {
      const fila = await insertarMensaje({ ligaId: ligaIdMsg, tipo: 'admin', autor: session.u, texto });
      logAudit(session.u, 'mensajes.enviarAdmin', ligaIdMsg, null, clientIP(req));
      return res.status(200).json({ ok: true, mensaje: fila });
    } catch(e){ return res.status(503).json({ error: 'No se pudo enviar el mensaje.' }); }
  }

  // ---- Lectura del hilo de grupo (miembro del grupo en ese ciclo, o admin) ----
  if(accion === 'listarGrupo' || accion === 'nuevosGrupo'){
    const ciclo = parseInt(body.ciclo, 10);
    const grupo = parseInt(body.grupo, 10);
    if(!ciclo || !grupo) return res.status(400).json({ error: 'Falta indicar ciclo y grupo.' });

    const c = Array.isArray(stateMsg.cycles) ? stateMsg.cycles[ciclo - 1] : null;
    const g = c && Array.isArray(c.groups) ? c.groups[grupo - 1] : null;
    const soyMiembro = !!(g && Array.isArray(g.players) && g.players.indexOf(session.u) >= 0);
    if(!soyMiembro && !esAdminMsg){
      return res.status(403).json({ error: 'No pertenecés a ese grupo en ese ciclo.' });
    }

    try {
      if(accion === 'listarGrupo'){
        const msgs = await leerMensajes({ ligaId: ligaIdMsg, tipo: 'grupo', ciclo, grupo, limite: 200 });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ mensajes: msgs });
      } else {
        const desdeId = parseInt(body.desdeId, 10) || 0;
        const msgs = await leerMensajesDesde({ ligaId: ligaIdMsg, tipo: 'grupo', ciclo, grupo, desdeId });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ mensajes: msgs });
      }
    } catch(e){ return res.status(503).json({ error: 'No se pudieron leer los mensajes.' }); }
  }

  // ---- Envío al hilo de grupo (solo miembros del grupo en ese ciclo) ----
  if(accion === 'enviarGrupo'){
    const ciclo = parseInt(body.ciclo, 10);
    const grupo = parseInt(body.grupo, 10);
    const texto = String(body.texto || '').trim();
    if(!ciclo || !grupo) return res.status(400).json({ error: 'Falta indicar ciclo y grupo.' });
    if(!texto) return res.status(400).json({ error: 'El mensaje está vacío.' });
    if(texto.length > 2000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 2000 caracteres).' });

    const c = Array.isArray(stateMsg.cycles) ? stateMsg.cycles[ciclo - 1] : null;
    const g = c && Array.isArray(c.groups) ? c.groups[grupo - 1] : null;
    const soyMiembro = !!(g && Array.isArray(g.players) && g.players.indexOf(session.u) >= 0);
    // A propósito, un admin que NO es jugador de este grupo NO puede escribir
    // acá (el chat de grupo es de los jugadores; para avisos generales del
    // admin está el hilo 'admin'). Solo puede escribir quien juega ahí.
    if(!soyMiembro){
      return res.status(403).json({ error: 'No pertenecés a ese grupo en ese ciclo.' });
    }

    try {
      const fila = await insertarMensaje({ ligaId: ligaIdMsg, tipo: 'grupo', ciclo, grupo, autor: session.u, texto });
      return res.status(200).json({ ok: true, mensaje: fila });
    } catch(e){ return res.status(503).json({ error: 'No se pudo enviar el mensaje.' }); }
  }

  // ---- Hilo de Play Offs: uno por CUADRO (tramo), no por ciclo/grupo. ----
  // Reutilizamos la misma columna `grupo` de la tabla para guardar el índice
  // del tramo (0, 1, 2...) — evita agregar una columna nueva, y como el tipo
  // es distinto ('playoff' en vez de 'grupo'), no hay ambigüedad posible al
  // leer: nunca se mezclan mensajes de un cuadro con los de un grupo de liga.
  // Miembro = su nombre está en playoff.tramos[tramo].seeds (el roster
  // completo del cuadro, sea que esté jugando el cuadro principal o
  // consolación — es la misma gente, solo cambia el camino).
  if(accion === 'listarPlayoff' || accion === 'nuevosPlayoff'){
    const tramo = parseInt(body.tramo, 10);
    if(isNaN(tramo) || tramo < 0) return res.status(400).json({ error: 'Falta indicar el cuadro.' });

    const tr = stateMsg.playoff && Array.isArray(stateMsg.playoff.tramos) ? stateMsg.playoff.tramos[tramo] : null;
    const soyMiembro = !!(tr && Array.isArray(tr.seeds) && tr.seeds.indexOf(session.u) >= 0);
    if(!soyMiembro && !esAdminMsg){
      return res.status(403).json({ error: 'No pertenecés a ese cuadro de Play Offs.' });
    }

    try {
      if(accion === 'listarPlayoff'){
        const msgs = await leerMensajes({ ligaId: ligaIdMsg, tipo: 'playoff', ciclo: null, grupo: tramo, limite: 200 });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ mensajes: msgs });
      } else {
        const desdeId = parseInt(body.desdeId, 10) || 0;
        const msgs = await leerMensajesDesde({ ligaId: ligaIdMsg, tipo: 'playoff', ciclo: null, grupo: tramo, desdeId });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ mensajes: msgs });
      }
    } catch(e){ return res.status(503).json({ error: 'No se pudieron leer los mensajes.' }); }
  }

  if(accion === 'enviarPlayoff'){
    const tramo = parseInt(body.tramo, 10);
    const texto = String(body.texto || '').trim();
    if(isNaN(tramo) || tramo < 0) return res.status(400).json({ error: 'Falta indicar el cuadro.' });
    if(!texto) return res.status(400).json({ error: 'El mensaje está vacío.' });
    if(texto.length > 2000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 2000 caracteres).' });

    const tr = stateMsg.playoff && Array.isArray(stateMsg.playoff.tramos) ? stateMsg.playoff.tramos[tramo] : null;
    const soyMiembro = !!(tr && Array.isArray(tr.seeds) && tr.seeds.indexOf(session.u) >= 0);
    if(!soyMiembro){
      return res.status(403).json({ error: 'No pertenecés a ese cuadro de Play Offs.' });
    }

    try {
      const fila = await insertarMensaje({ ligaId: ligaIdMsg, tipo: 'playoff', ciclo: null, grupo: tramo, autor: session.u, texto });
      return res.status(200).json({ ok: true, mensaje: fila });
    } catch(e){ return res.status(503).json({ error: 'No se pudo enviar el mensaje.' }); }
  }

  // ---- Conteo de no leídos para la burbuja de la pestaña "Mensajes" ----
  // Un solo pedido en vez de 3 (uno por hilo): el cliente manda la lista de
  // hilos a los que tiene acceso, junto con el último id que ya leyó de cada
  // uno, y acá se resuelve todo junto. Cada hilo se valida con el MISMO
  // criterio de pertenencia que listarGrupo/listarPlayoff — si el cliente
  // pide un hilo al que no pertenece, simplemente se lo salteamos (no error,
  // para no interrumpir el conteo de los demás hilos válidos).
  if(accion === 'contarNoLeidos'){
    const hilos = Array.isArray(body.hilos) ? body.hilos : [];
    const resultado = [];
    for(const h of hilos.slice(0, 5)){ // tope defensivo: nunca son más de 3 hilos reales
      if(!h || !h.tipo) continue;
      try {
        if(h.tipo === 'admin'){
          const msgs = await leerMensajesDesde({ ligaId: ligaIdMsg, tipo: 'admin', desdeId: h.desdeId || 0 });
          resultado.push({ tipo: 'admin', count: msgs.length, ultimoId: msgs.length ? msgs[msgs.length - 1].id : (h.desdeId || 0) });
        } else if(h.tipo === 'grupo'){
          const ciclo = parseInt(h.ciclo, 10), grupo = parseInt(h.grupo, 10);
          if(!ciclo || !grupo) continue;
          const c = Array.isArray(stateMsg.cycles) ? stateMsg.cycles[ciclo - 1] : null;
          const g = c && Array.isArray(c.groups) ? c.groups[grupo - 1] : null;
          const soyMiembro = !!(g && Array.isArray(g.players) && g.players.indexOf(session.u) >= 0);
          if(!soyMiembro && !esAdminMsg) continue;
          const msgs = await leerMensajesDesde({ ligaId: ligaIdMsg, tipo: 'grupo', ciclo, grupo, desdeId: h.desdeId || 0 });
          resultado.push({ tipo: 'grupo', count: msgs.length, ultimoId: msgs.length ? msgs[msgs.length - 1].id : (h.desdeId || 0) });
        } else if(h.tipo === 'playoff'){
          const tramo = parseInt(h.tramo, 10);
          if(isNaN(tramo)) continue;
          const tr = stateMsg.playoff && Array.isArray(stateMsg.playoff.tramos) ? stateMsg.playoff.tramos[tramo] : null;
          const soyMiembro = !!(tr && Array.isArray(tr.seeds) && tr.seeds.indexOf(session.u) >= 0);
          if(!soyMiembro && !esAdminMsg) continue;
          const msgs = await leerMensajesDesde({ ligaId: ligaIdMsg, tipo: 'playoff', ciclo: null, grupo: tramo, desdeId: h.desdeId || 0 });
          resultado.push({ tipo: 'playoff', count: msgs.length, ultimoId: msgs.length ? msgs[msgs.length - 1].id : (h.desdeId || 0) });
        }
      } catch(e){ /* si falla un hilo puntual, seguimos con los demás */ }
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ hilos: resultado });
  }

  // ================= A PARTIR DE ACÁ: solo administradores =================
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
