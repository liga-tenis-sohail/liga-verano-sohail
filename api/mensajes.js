// =====================================================================
// POST /api/mensajes
//
// Mensajería de la liga, con dos hilos separados:
//   - 'admin'  → el administrador escribe, TODOS los jugadores de la liga
//                leen. Nadie puede responder (broadcast de una sola vía).
//   - 'grupo'  → chat privado entre los jugadores de un grupo, PARA UN
//                CICLO PUNTUAL (cuando el ciclo cambia y los grupos se
//                recomponen, el chat del grupo nuevo arranca vacío — el
//                historial viejo queda asociado al ciclo viejo).
//
// Los mensajes viven en una tabla aparte de Supabase (`mensajes`), no
// adentro del bloque grande de estado de la liga. Ver el comentario sobre
// insertarMensaje() en _lib.js para el motivo (evitar que dos mensajes
// casi simultáneos se pisen entre sí).
//
// Acciones:
//   listarAdmin   { ligaId }                      → últimos mensajes del hilo admin
//   enviarAdmin   { ligaId, texto }                → admin only
//   listarGrupo   { ligaId, ciclo, grupo }         → miembro del grupo, o admin
//   enviarGrupo   { ligaId, ciclo, grupo, texto }  → miembro del grupo
//   nuevosAdmin   { ligaId, desdeId }              → polling liviano (solo lo nuevo)
//   nuevosGrupo   { ligaId, ciclo, grupo, desdeId } → polling liviano (solo lo nuevo)
//   listarPlayoff { ligaId, tramo }                → miembro del cuadro (tramo), o admin
//   enviarPlayoff { ligaId, tramo, texto }         → miembro del cuadro
//   nuevosPlayoff { ligaId, tramo, desdeId }       → polling liviano (solo lo nuevo)
// =====================================================================
const { auth, readState, envOK, sesionEsAdmin, ligaIdOK, LIGA_DEFAULT,
        insertarMensaje, leerMensajes, leerMensajesDesde,
        logAudit, clientIP } = require('./_lib');

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if(!envOK(res)) return;

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const accion = String(body.accion || '');

  const session = auth(req);
  if(!session) return res.status(401).json({ error: 'Sesión inválida o expirada. Volvé a entrar.' });

  const ligaId = (body.ligaId && ligaIdOK(body.ligaId)) ? body.ligaId : LIGA_DEFAULT;

  // Toda acción necesita saber quién sos DENTRO de esta liga puntual (mismo
  // patrón que usan misLigas/solicitarAcceso en api/liga.js): el token no
  // sabe a qué liga pertenece, así que se verifica leyendo el estado real.
  let state;
  try { state = await readState(ligaId); }
  catch(e){ return res.status(503).json({ error: 'No se pudo leer la liga.' }); }
  if(!state || !state.users || !state.users[session.u]){
    return res.status(403).json({ error: 'Tu sesión no corresponde a esta liga.' });
  }
  const esAdmin = sesionEsAdmin(session, state.users);

  // ---- Lectura del hilo admin (cualquiera logueado en la liga) ----
  if(accion === 'listarAdmin'){
    try {
      const msgs = await leerMensajes({ ligaId, tipo: 'admin', limite: 200 });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ mensajes: msgs });
    } catch(e){ return res.status(503).json({ error: 'No se pudieron leer los mensajes.' }); }
  }

  if(accion === 'nuevosAdmin'){
    const desdeId = parseInt(body.desdeId, 10) || 0;
    try {
      const msgs = await leerMensajesDesde({ ligaId, tipo: 'admin', desdeId });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ mensajes: msgs });
    } catch(e){ return res.status(503).json({ error: 'No se pudieron leer los mensajes.' }); }
  }

  // ---- Envío al hilo admin (solo admin) ----
  if(accion === 'enviarAdmin'){
    if(!esAdmin) return res.status(403).json({ error: 'Solo un administrador puede escribir acá.' });
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
      const fila = await insertarMensaje({ ligaId, tipo: 'admin', autor: session.u, texto });
      logAudit(session.u, 'mensajes.enviarAdmin', ligaId, null, clientIP(req));
      return res.status(200).json({ ok: true, mensaje: fila });
    } catch(e){ return res.status(503).json({ error: 'No se pudo enviar el mensaje.' }); }
  }

  // ---- Lectura del hilo de grupo (miembro del grupo en ese ciclo, o admin) ----
  if(accion === 'listarGrupo' || accion === 'nuevosGrupo'){
    const ciclo = parseInt(body.ciclo, 10);
    const grupo = parseInt(body.grupo, 10);
    if(!ciclo || !grupo) return res.status(400).json({ error: 'Falta indicar ciclo y grupo.' });

    const c = Array.isArray(state.cycles) ? state.cycles[ciclo - 1] : null;
    const g = c && Array.isArray(c.groups) ? c.groups[grupo - 1] : null;
    const soyMiembro = !!(g && Array.isArray(g.players) && g.players.indexOf(session.u) >= 0);
    if(!soyMiembro && !esAdmin){
      return res.status(403).json({ error: 'No pertenecés a ese grupo en ese ciclo.' });
    }

    try {
      if(accion === 'listarGrupo'){
        const msgs = await leerMensajes({ ligaId, tipo: 'grupo', ciclo, grupo, limite: 200 });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ mensajes: msgs });
      } else {
        const desdeId = parseInt(body.desdeId, 10) || 0;
        const msgs = await leerMensajesDesde({ ligaId, tipo: 'grupo', ciclo, grupo, desdeId });
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

    const c = Array.isArray(state.cycles) ? state.cycles[ciclo - 1] : null;
    const g = c && Array.isArray(c.groups) ? c.groups[grupo - 1] : null;
    const soyMiembro = !!(g && Array.isArray(g.players) && g.players.indexOf(session.u) >= 0);
    // A propósito, un admin que NO es jugador de este grupo NO puede escribir
    // acá (el chat de grupo es de los jugadores; para avisos generales del
    // admin está el hilo 'admin'). Solo puede escribir quien juega ahí.
    if(!soyMiembro){
      return res.status(403).json({ error: 'No pertenecés a ese grupo en ese ciclo.' });
    }

    try {
      const fila = await insertarMensaje({ ligaId, tipo: 'grupo', ciclo, grupo, autor: session.u, texto });
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

    const tr = state.playoff && Array.isArray(state.playoff.tramos) ? state.playoff.tramos[tramo] : null;
    const soyMiembro = !!(tr && Array.isArray(tr.seeds) && tr.seeds.indexOf(session.u) >= 0);
    if(!soyMiembro && !esAdmin){
      return res.status(403).json({ error: 'No pertenecés a ese cuadro de Play Offs.' });
    }

    try {
      if(accion === 'listarPlayoff'){
        const msgs = await leerMensajes({ ligaId, tipo: 'playoff', ciclo: null, grupo: tramo, limite: 200 });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ mensajes: msgs });
      } else {
        const desdeId = parseInt(body.desdeId, 10) || 0;
        const msgs = await leerMensajesDesde({ ligaId, tipo: 'playoff', ciclo: null, grupo: tramo, desdeId });
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

    const tr = state.playoff && Array.isArray(state.playoff.tramos) ? state.playoff.tramos[tramo] : null;
    const soyMiembro = !!(tr && Array.isArray(tr.seeds) && tr.seeds.indexOf(session.u) >= 0);
    if(!soyMiembro){
      return res.status(403).json({ error: 'No pertenecés a ese cuadro de Play Offs.' });
    }

    try {
      const fila = await insertarMensaje({ ligaId, tipo: 'playoff', ciclo: null, grupo: tramo, autor: session.u, texto });
      return res.status(200).json({ ok: true, mensaje: fila });
    } catch(e){ return res.status(503).json({ error: 'No se pudo enviar el mensaje.' }); }
  }

  return res.status(400).json({ error: 'Acción no reconocida.' });
};
