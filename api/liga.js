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
  // Colapsa espacios múltiples ("Juan  Pérez" -> "Juan Pérez") además de
  // sacar mayúsculas/tildes/bordes: sin esto, una variante con doble
  // espacio generaba un hash distinto y duplicaba el perfil del jugador.
  const norm = String(nombre).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  return 'p_' + crypto.createHash('sha256').update(norm).digest('hex').slice(0, 10);
}

// Valida un adjunto de imagen para mensajes (solo admin puede mandar uno,
// ver los 3 puntos que llaman esto: enviarAdmin/enviarGrupo/enviarPlayoff).
// El cliente ya comprime la imagen antes de mandarla (mismo criterio que
// rgComprimirImg en reglamento.js — máx 1200px, JPEG calidad 0.75), así que
// acá solo se revalida el formato y un tope de tamaño duro, por si acaso
// (un cliente modificado, o un adjunto que igual quedó pesado). No se
// re-comprime del lado del servidor: hacerlo bien requeriría una librería
// de imágenes que este proyecto no tiene, y el tope ya cubre el caso real.
const IMAGEN_MSG_MAX_CHARS = 700000;   // ~500KB de imagen en base64
function imagenValida(v){
  if(v == null || v === '') return { ok: true, valor: null };   // sin adjunto, válido
  if(typeof v !== 'string' || !v.startsWith('data:image/')){
    return { ok: false, error: 'El adjunto tiene que ser una imagen.' };
  }
  if(v.length > IMAGEN_MSG_MAX_CHARS){
    return { ok: false, error: 'La imagen es demasiado grande (máximo ~500KB una vez comprimida).' };
  }
  return { ok: true, valor: v };
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
//
// heredarDe: el state de la liga desde la que se está creando esta nueva
// (sesionState en el flujo de 'crear', más abajo). Antes esta función SIEMPRE
// hardcodeaba LOGIN_TITLE vacío, los colores por defecto (#1B4F9C/#F5C518/
// #FFEDD5) y los clubes Sohail/Haza, sin importar qué tuviera configurado la
// liga actual — cada liga nueva "reseteaba" el formato al default original en
// vez de partir del de la liga anterior, y el "Nombre del login" se perdía
// cada vez (quedaba en blanco, cayendo al nombre de la liga nueva en vez de
// mantenerse estable entre ligas). Ahora se hereda todo lo cosmético de
// heredarDe cuando está disponible, y solo cae al default de fábrica si no
// hay ninguna liga anterior de la que heredar (primera liga del sistema).
//
// clubsOverride: los clubes tal como quedaron en el modal "Crear liga" tras
// que el admin los edite (agregar/quitar/renombrar) — vienen en body.clubs
// desde el frontend. Si el admin no tocó nada, coinciden con los de
// heredarDe; si los cambió, se respeta lo que el admin eligió explícitamente
// en el modal por sobre lo heredado.
function estadoInicial(nombreLiga, numGrupos, numCiclos, heredarDe, clubsOverride){
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
  const h = heredarDe || {};
  const clubsHeredados = Array.isArray(clubsOverride) && clubsOverride.length
    ? clubsOverride
    : (Array.isArray(h.CLUBS) && h.CLUBS.length ? h.CLUBS : [
        { id: 'sohail', name: 'Sohail', bg: '#D6ECFB' },
        { id: 'haza', name: 'Haza', bg: '#FCE6CF' }
      ]);
  return {
    _v: 1, users: {}, matches: [], matchId: 1, activeN: 1, cycles: cycles,
    playoff: { started: false, numTramos: 4, tramos: [], results: {}, viewT: 0, preview: false },
    DESTINO: {}, FECHAS: [], PO_FECHAS: {}, ALLNAMES: [], PUNTOS: generarEscalaPuntos(nG, 5), LOG: [],
    // LEAGUE_NAME siempre es el nombre nuevo que puso el admin (no se hereda:
    // cada liga tiene su propio nombre). LOGIN_TITLE, en cambio, SÍ se hereda:
    // es el mismo texto para todas las ligas del club (ver comentario arriba).
    LEAGUE_NAME: nombreLiga || 'Liga nueva', LEAGUE_SUBTITLE: '',
    LOGIN_TITLE: (typeof h.LOGIN_TITLE === 'string' && h.LOGIN_TITLE) ? h.LOGIN_TITLE : '',
    LEAGUE_COLOR_PRI: h.LEAGUE_COLOR_PRI || '#1B4F9C',
    LEAGUE_COLOR_ACC: h.LEAGUE_COLOR_ACC || '#F5C518',
    LEAGUE_COLOR_HL: h.LEAGUE_COLOR_HL || '#FFEDD5',
    CLUBS: clubsHeredados,
    COLOR_DISPUTA: h.COLOR_DISPUTA || '#FDE68A',
    RATING_ON: h.RATING_ON === true, REGLAMENTO: ''
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
    // El adjunto de imagen es exclusivo admin (ya se validó esAdminMsg
    // arriba): permite avisar algo con una captura o documento sin
    // depender de WhatsApp aparte. Un mensaje puede llevar SOLO imagen,
    // sin texto — por eso el chequeo de "vacío" ahora contempla ambos.
    const imgCheck = imagenValida(body.imagen);
    if(!imgCheck.ok) return res.status(400).json({ error: imgCheck.error });
    if(!texto && !imgCheck.valor) return res.status(400).json({ error: 'El mensaje está vacío.' });
    if(texto.length > 2000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 2000 caracteres).' });

    // Nota: sin límite de ritmo por ahora — la tabla rate_limits está pensada
    // para bloqueos de login (contador que no se resetea solo con el tiempo,
    // solo con un login exitoso) y no encaja bien para "N mensajes por
    // minuto". Para una liga chica y de confianza el riesgo de spam es bajo;
    // si hiciera falta más adelante, conviene un contador con ventana de
    // tiempo real (ej. Redis/KV con TTL), no esta tabla.
    try {
      const fila = await insertarMensaje({ ligaId: ligaIdMsg, tipo: 'admin', autor: session.u, texto, imagen: imgCheck.valor });
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
    if(texto.length > 2000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 2000 caracteres).' });

    // Una vez arrancados los Play Offs, el chat de grupo queda de solo
    // lectura (la conversación pasa al cuadro de Play Offs). Esto es un
    // candado real, no solo visual: si alguien pega directo contra la API
    // saltándose la interfaz, igual se lo rechaza acá.
    if(stateMsg.playoff && stateMsg.playoff.started){
      return res.status(403).json({ error: 'El chat de grupo se cerró: los Play Offs ya arrancaron.' });
    }

    const c = Array.isArray(stateMsg.cycles) ? stateMsg.cycles[ciclo - 1] : null;
    const g = c && Array.isArray(c.groups) ? c.groups[grupo - 1] : null;
    const soyMiembro = !!(g && Array.isArray(g.players) && g.players.indexOf(session.u) >= 0);
    // El admin (o superadmin) puede escribir en CUALQUIER grupo, sea o no
    // jugador ahí — mismo criterio que ya usan listarGrupo/listarPlayoff
    // para lectura. Antes solo podía escribir quien jugaba en el grupo;
    // ahora el admin también puede, por ejemplo para avisar algo puntual
    // a ese grupo sin tener que usar el hilo general.
    if(!soyMiembro && !esAdminMsg){
      return res.status(403).json({ error: 'No pertenecés a ese grupo en ese ciclo.' });
    }

    // El adjunto de imagen es exclusivo admin — un jugador que manda a su
    // propio grupo no puede adjuntar nada (solo texto), igual que antes.
    const imgCheck = esAdminMsg ? imagenValida(body.imagen) : { ok: true, valor: null };
    if(!imgCheck.ok) return res.status(400).json({ error: imgCheck.error });
    if(!texto && !imgCheck.valor) return res.status(400).json({ error: 'El mensaje está vacío.' });

    try {
      const fila = await insertarMensaje({ ligaId: ligaIdMsg, tipo: 'grupo', ciclo, grupo, autor: session.u, texto, imagen: imgCheck.valor });
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
    if(texto.length > 2000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 2000 caracteres).' });

    const tr = stateMsg.playoff && Array.isArray(stateMsg.playoff.tramos) ? stateMsg.playoff.tramos[tramo] : null;
    const soyMiembro = !!(tr && Array.isArray(tr.seeds) && tr.seeds.indexOf(session.u) >= 0);
    // Mismo criterio que en enviarGrupo: el admin puede escribir en
    // cualquier cuadro de Play Offs, sea o no jugador ahí.
    if(!soyMiembro && !esAdminMsg){
      return res.status(403).json({ error: 'No pertenecés a ese cuadro de Play Offs.' });
    }

    // El adjunto de imagen es exclusivo admin — mismo criterio que enviarGrupo.
    const imgCheck = esAdminMsg ? imagenValida(body.imagen) : { ok: true, valor: null };
    if(!imgCheck.ok) return res.status(400).json({ error: imgCheck.error });
    if(!texto && !imgCheck.valor) return res.status(400).json({ error: 'El mensaje está vacío.' });

    try {
      const fila = await insertarMensaje({ ligaId: ligaIdMsg, tipo: 'playoff', ciclo: null, grupo: tramo, autor: session.u, texto, imagen: imgCheck.valor });
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

  // ================= FUSIONAR JUGADORES (login unificado) =================
  // Un mismo jugador real puede haber quedado como DOS filas del catálogo
  // (dos jugadorId distintos) si se lo cargó con nombres de usuario
  // distintos en dos ligas (ej: "Juan Pérez" en una, "jperez" en otra) sin
  // que hubiera email para vincularlos automáticamente. Esta acción los
  // une: recorre TODAS las ligas y, donde encuentre users[x].jugadorId
  // apuntando al descartado, lo reapunta al que se mantiene. El nombre de
  // usuario de cada liga NO se toca (sigue siendo "Juan Pérez" en una y
  // "jperez" en la otra) — solo se unifica la identidad/contraseña, que
  // es lo que hacía falta para el login único.
  if(accion === 'fusionarJugadores'){
    if(!(session && session.r === 'superadmin')) return res.status(403).json({ error: 'Solo el super administrador puede fusionar jugadores.' });
    const mantener   = String(body.jugadorIdMantener || '');
    const descartar   = String(body.jugadorIdDescartar || '');
    if(!mantener || !descartar) return res.status(400).json({ error: 'Faltan los dos jugadores a fusionar.' });
    if(mantener === descartar) return res.status(400).json({ error: 'Elegí dos jugadores distintos.' });

    let cat = {};
    try { cat = await readCatalogo(); } catch(e){ return res.status(503).json({ error: 'No se pudo leer el catálogo.' }); }
    const jMantener  = cat[mantener];
    const jDescartar = cat[descartar];
    if(!jMantener || !jDescartar) return res.status(404).json({ error: 'Alguno de los dos jugadores no existe en el catálogo.' });

    // La contraseña que sobrevive es la del que se mantiene. Si no tiene
    // (nunca la cambió) pero el descartado sí, se hereda esa — mejor que
    // perder una contraseña que la persona ya conoce.
    if(!jMantener.pass && jDescartar.pass){
      jMantener.pass = jDescartar.pass;
      try { await upsertJugador(jMantener); } catch(e){ return res.status(503).json({ error: 'No se pudo actualizar la contraseña unificada.' }); }
    }

    let idx = [];
    try { idx = await readLigaIndex(); } catch(e){ idx = []; }

    const ligasTocadas = [];
    for(const l of idx){
      let est;
      try { est = await readState(l.id); } catch(e){ continue; }
      if(!est || !est.users) continue;
      let tocada = false;
      for(const nombre of Object.keys(est.users)){
        const u = est.users[nombre];
        if(u && u.jugadorId === descartar){
          u.jugadorId = mantener;
          tocada = true;
        }
      }
      if(tocada){
        try { await writeState(l.id, est); ligasTocadas.push(l.id); }
        catch(e){ return res.status(503).json({ error: 'Se fusionó parcialmente: falló al guardar la liga ' + l.id + '. Volvé a intentar.' }); }
      }
    }

    try { await borrarJugador(descartar); }
    catch(e){ return res.status(503).json({ error: 'Se re-vincularon las ligas pero no se pudo borrar el perfil sobrante: ' + e.message }); }
    if(jDescartar.nombre && jDescartar.nombre !== jMantener.nombre){
      try { await borrarPasskeysDeUsuario(jDescartar.nombre); } catch(_){}
    }

    logAudit(session.u, 'jugador.fusionar', mantener, { descartado: descartar, nombreDescartado: jDescartar.nombre, ligas: ligasTocadas }, clientIP(req));
    return res.status(200).json({ ok: true, jugadorId: mantener, ligasActualizadas: ligasTocadas });
  }

  const id = String(body.id || '');
  if(accion !== 'crear' && !ligaIdOK(id)){ return res.status(400).json({ error: 'Falta el identificador de la liga o es inválido.' }); }

  // ================= AGREGAR JUGADORES A UNA LIGA YA EXISTENTE =================
  // Usado por "Agregar de ligas anteriores" (botón en Perfil & Jugadores):
  // el admin elige jugadores del catálogo global que no están en esta liga
  // todavía y los suma, indicando a qué grupo va cada uno (o "Sin grupo",
  // grupo:0, igual que al crear una liga — ver estadoInicial()/'crear' más
  // abajo). Esta acción NUNCA existió en el backend: el frontend
  // (agregarJugadoresConfirmar en login-auth.js) la llama desde hace
  // tiempo, pero como no había ningún `if(accion === 'agregarJugadores')`
  // acá, el fetch fallaba silenciosamente (probablemente con algún error
  // genérico de acción no reconocida) y el botón nunca sumó a nadie.
  //
  // Reusa el mismo criterio de asignación que 'crear' un poco más abajo:
  // por jugadorId de catálogo si viene, si no por email, si no por nombre
  // (reusando un perfil existente con el mismo nombre normalizado antes de
  // crear uno nuevo — mismo criterio que idDeJugador()). grupo===0 es
  // "Sin grupo": el jugador se da de alta en la liga pero no se lo empuja
  // a ningún cycles[activeN-1].groups[i].players.
  if(accion === 'agregarJugadores'){
    if(!sesionState) return res.status(503).json({ error: 'No se pudo leer la liga' + (sesionStateErr ? (': ' + sesionStateErr.message) : '.') });
    const jugadoresIn = Array.isArray(body.jugadores) ? body.jugadores : [];
    if(!jugadoresIn.length) return res.status(400).json({ error: 'No se indicó ningún jugador para agregar.' });

    const estado = sesionState;
    if(!Array.isArray(estado.ALLNAMES)) estado.ALLNAMES = [];
    if(!estado.users) estado.users = {};
    // Grupo destino: el ciclo ACTIVO de esta liga (activeN), no siempre el
    // primero — a diferencia de 'crear', acá la liga ya puede llevar varios
    // ciclos jugados. Si por algún motivo no hay ciclo activo con grupos
    // (todos bloqueados), el jugador igual se da de alta en estado.users,
    // solo que no se lo puede asignar a ningún grupo (queda "Sin grupo"
    // de hecho, aunque no lo haya pedido así).
    const cicloActivo = estado.cycles && estado.cycles[(estado.activeN || 1) - 1];
    const numGroups = (cicloActivo && Array.isArray(cicloActivo.groups)) ? cicloActivo.groups.length : 0;

    let catalogo = {}; try { catalogo = await readCatalogo(); } catch(e){ catalogo = {}; }
    const agregados = [];

    for(const j of jugadoresIn){
      if(!j) continue;
      let perfil = null;

      if(j.jugadorId && catalogo[j.jugadorId]){
        perfil = catalogo[j.jugadorId];
      } else if(j.email){
        try { perfil = await buscarJugadorPorEmail(j.email); } catch(e){ perfil = null; }
        if(!perfil && j.nombre){
          const idPorNombre = idDeJugador(j.nombre);
          if(catalogo[idPorNombre]){
            perfil = catalogo[idPorNombre];
            if(!perfil.email){
              perfil.email = String(j.email).trim().toLowerCase();
              try { await upsertJugador(perfil); } catch(e){}
            }
          } else {
            perfil = { id: idPorNombre, nombre: String(j.nombre).trim(), email: String(j.email).trim().toLowerCase(), pass: null };
            try { await upsertJugador(perfil); } catch(e){}
          }
        }
      } else if(j.nombre){
        const idPorNombre = idDeJugador(j.nombre);
        if(catalogo[idPorNombre]){
          perfil = catalogo[idPorNombre];
        } else {
          perfil = { id: idPorNombre, nombre: String(j.nombre).trim(), email: null, pass: null };
          try { await upsertJugador(perfil); } catch(e){}
        }
      }

      if(!perfil || !perfil.nombre) continue;
      const nomNorm = perfil.nombre.trim().toLowerCase();
      if(nomNorm === 'admin' || nomNorm === 'superadmin') continue;
      // Ya está en esta liga: no se duplica (silenciosamente se saltea, el
      // frontend ya filtra esto de antemano al armar _addLigaCat, pero se
      // revalida acá por si el catálogo cambió entre que se abrió el modal
      // y se confirmó).
      if(estado.ALLNAMES.includes(perfil.nombre)) continue;

      estado.ALLNAMES.push(perfil.nombre);

      const grupoPedido = parseInt(j.grupo, 10);
      const sinGrupo = grupoPedido === 0;
      if(!sinGrupo && cicloActivo && numGroups > 0){
        let targetIndex = (grupoPedido || 1) - 1;
        if(targetIndex < 0 || targetIndex >= numGroups) targetIndex = 0;
        cicloActivo.groups[targetIndex].players.push(perfil.nombre);
      }

      if(estado.users[perfil.nombre]){
        estado.users[perfil.nombre].jugadorId = perfil.id;
        estado.users[perfil.nombre].name = perfil.nombre;
        if(perfil.email) estado.users[perfil.nombre].email = perfil.email;
      } else {
        // pass: perfil.pass — mismo fix que en 'crear' (ver comentario ahí):
        // sin esto, un jugador agregado a una liga existente vía "Agregar de
        // ligas anteriores" quedaba con u.pass undefined, y el punto
        // verde/rojo lo pintaba siempre verde sin importar su estado real.
        estado.users[perfil.nombre] = {
          role: 'player', name: perfil.nombre, email: perfil.email || null, jugadorId: perfil.id,
          pass: perfil.pass || null
        };
      }
      agregados.push(perfil.nombre);
    }

    if(!agregados.length) return res.status(200).json({ ok: true, agregados: [] });

    try { await writeState(id, estado); }
    catch(e){ return res.status(503).json({ error: 'No se pudo guardar: ' + e.message }); }

    logAudit(session.u, 'liga.agregarJugadores', id, { agregados }, clientIP(req));
    return res.status(200).json({ ok: true, agregados });
  }

  // ================= CREAR LIGA =================
  if(accion === 'crear'){
    const nombre = String(body.nombre || '').trim();
    const nuevoId = String(body.id || '').trim().toLowerCase();
    if(!nombre) return res.status(400).json({ error: 'Falta el nombre de la liga.' });
    if(!ligaIdOK(nuevoId)) return res.status(400).json({ error: 'El identificador de la liga es inválido.' });

    let idx; try { idx = await readLigaIndex(); } catch(e){ idx = []; }
    if(idx.some(l => l.id === nuevoId)) return res.status(409).json({ error: 'Ya existe una liga con ese identificador.' });
    if(!sesionState || !sesionState.users) return res.status(503).json({ error: 'No se pudo leer la liga actual para heredar administradores.' });

    // Se hereda el formato (colores, clubes, LOGIN_TITLE) de sesionState: el
    // state de la liga desde la que el admin está creando esta nueva (ya
    // leído más arriba para heredar admins). body.clubs, si viene, gana por
    // sobre lo heredado — es lo que el admin dejó configurado en el modal.
    const estado = estadoInicial(nombre, body.numGrupos, body.numCiclos, sesionState, Array.isArray(body.clubs) ? body.clubs : null);

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
          // Antes de crear un perfil nuevo, ver si ya existe uno con el MISMO
          // nombre normalizado (aunque nunca haya tenido email). Sin este
          // chequeo, cargar al mismo "Juan Pérez" en dos ligas sin pasar
          // jugadorId explícito generaba DOS filas de catálogo -> el jugador
          // aparecía duplicado en el login unificado.
          const idPorNombre = idDeJugador(j.nombre);
          if(catalogo[idPorNombre]){
            perfil = catalogo[idPorNombre];
            // Si no tenía email todavía, aprovechamos para completarlo.
            if(!perfil.email){
              perfil.email = String(j.email).trim().toLowerCase();
              try { await upsertJugador(perfil); } catch(e){}
            }
          } else {
            perfil = { id: idPorNombre, nombre: String(j.nombre).trim(), email: String(j.email).trim().toLowerCase(), pass: null };
            try { await upsertJugador(perfil); } catch(e){}
          }
        }
      } else if(j.nombre){
        // Mismo chequeo que arriba: reusar el perfil existente por nombre
        // normalizado en vez de crear uno nuevo a ciegas.
        const idPorNombre = idDeJugador(j.nombre);
        if(catalogo[idPorNombre]){
          perfil = catalogo[idPorNombre];
        } else {
          perfil = { id: idPorNombre, nombre: String(j.nombre).trim(), email: null, pass: null };
          try { await upsertJugador(perfil); } catch(e){}
        }
      }

      if(perfil && perfil.nombre){
        const nomNorm = perfil.nombre.trim().toLowerCase();
        if(nomNorm === 'admin' || nomNorm === 'superadmin') continue;
        
        if(!estado.ALLNAMES.includes(perfil.nombre)) {
          estado.ALLNAMES.push(perfil.nombre);

          // grupo === 0 (o no numérico) significa "Sin grupo": el jugador
          // queda dado de alta en la liga (existe en estado.users) pero no
          // se lo empuja a ningún cycles[0].groups[i].players. El admin lo
          // asigna después a mano desde el panel (mismo estado que ya
          // reconoce el resto de la app para "Sin grupo": ver findLoc() y
          // el badge correspondiente en jugadores-perfiles.js). Antes, un
          // grupo inválido o ausente caía SIEMPRE en Grupo 1 por fallback;
          // ahora ese fallback solo aplica si el grupo pedido no es 0 pero
          // tampoco es válido (fuera de rango), para no romper compatibilidad
          // con llamadas viejas que no mandan grupo en absoluto.
          const grupoPedido = parseInt(j.grupo, 10);
          const sinGrupo = grupoPedido === 0;
          const numGroups = estado.cycles[0].groups.length;

          if(!sinGrupo){
            let targetIndex = (grupoPedido || 1) - 1;
            if (targetIndex < 0 || targetIndex >= numGroups) targetIndex = 0;
            if (numGroups > 0) {
              estado.cycles[0].groups[targetIndex].players.push(perfil.nombre);
            }
          }
        }
        
        // GUARDADO EXPLÍCITO DE NAME Y EMAIL
        if(estado.users[perfil.nombre]) {
            estado.users[perfil.nombre].jugadorId = perfil.id;
            estado.users[perfil.nombre].name = perfil.nombre;
            if (perfil.email) estado.users[perfil.nombre].email = perfil.email;
        } else {
            // pass: perfil.pass — CRÍTICO. Antes este objeto se armaba sin
            // campo pass en absoluto, así que quedaba undefined en la liga
            // nueva. El punto verde/rojo de contraseña (tienePasswordDefault
            // en jugadores-perfiles.js) chequea exactamente este campo:
            // undefined es falsy, así que SIEMPRE pintaba verde acá, sin
            // importar que en la liga vieja el jugador tuviera la clave por
            // defecto (rojo) o una propia. perfil.pass es el hash REAL y
            // vigente del catálogo global — la misma fuente que ya usa el
            // login (loginJugadorGlobal prioriza jugGlobal.pass sobre
            // cualquier u.pass de una liga puntual), así que copiarlo acá
            // simplemente mantiene ambos lados consistentes entre sí.
            estado.users[perfil.nombre] = { 
                role: 'player', 
                name: perfil.nombre, 
                email: perfil.email || null, 
                jugadorId: perfil.id,
                pass: perfil.pass || null
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
