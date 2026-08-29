// =====================================================================
// GET /api/state    (Authorization: Bearer <token>)  ->  { state }
// Devuelve el estado FILTRADO según quién pregunta.
// Sin token válido no devuelve absolutamente nada.
//
// El login ya trae el estado en su propia respuesta, así que esto queda
// para recargas y para cualquier refresco posterior.
//
// GET /api/state?liga=xxx&elegir=1
//   Paso 2 del LOGIN UNIFICADO: cuando /api/login devolvió eligeLiga:true
//   (el jugador o el admin están en 2+ ligas activas), la contraseña YA
//   se validó y el token YA es válido, pero todavía no sabíamos a qué
//   liga entrar. El cliente llama acá con la liga elegida + el flag
//   ?elegir=1: se revalida que la sesión realmente pertenezca a esa liga
//   (nunca se confía ciegamente en lo que mande el cliente) y devuelve
//   el state igual que haría un login normal. También lo usa
//   cambiarLigaDesdeMenu() en el header para cambiar de liga ya logueado,
//   sin importar el rol de la sesión — por eso el chequeo de pertenencia
//   ya NO exige role==='player' (ver más abajo).
//
// ligaNombre: además de state.LEAGUE_NAME, se devuelve el nombre OFICIAL
// de la liga tal como figura en liga_index (lo mismo que "Gestión de
// ligas"). El cliente lo usa para el header y el título del login, para
// que ese nombre visible no dependa de lo que haya quedado guardado en
// LEAGUE_NAME desde el formulario de "Apariencia de la liga".
// =====================================================================
const { auth, readState, readLigaIndex, envOK, filterForSession, renewIfStale, blockedUser, ligaIdOK, LIGA_DEFAULT } = require('./_lib');

module.exports = async function handler(req, res){
  if(!envOK(res)) return;

  const session = auth(req);
  if(!session) return res.status(401).json({ error: 'Sesión inválida o expirada. Volvé a entrar.' });

  // Qué liga: viene por query (?liga=anual-2026). Si no, la liga por defecto.
  const q = (req.query && req.query.liga) ? String(req.query.liga) : '';
  const ligaId = ligaIdOK(q) ? q : LIGA_DEFAULT;

  let state;
  try { state = await readState(ligaId); }
  catch(e){ return res.status(503).json({ error: 'No se pudo leer la base de datos.' }); }

  if(!state) return res.status(200).json({ empty: true });

  const blocked = blockedUser(state, session);
  if(blocked) return res.status(403).json({ error: blocked });

  // Paso 2 del login unificado / cambio de liga desde el header ya logueado:
  // revalidamos que la sesión realmente pertenezca a ESTA liga antes de
  // entregarle nada — el ?liga= lo manda el cliente y no hay que confiar
  // en él a ciegas. Solo se chequea que exista como user ahí, sin importar
  // el rol: un admin/superadmin también participa de varias ligas y
  // necesita poder cambiar entre ellas con este mismo endpoint.
  if(req.query && req.query.elegir){
    const u = (state.users || {})[session.u];
    if(!u){
      return res.status(403).json({ error: 'No pertenecés a esa liga.' });
    }
  }

  let ligaNombre = '';
  try {
    const idx = await readLigaIndex();
    const entry = idx.find(l => l.id === ligaId);
    if(entry) ligaNombre = entry.nombre;
  } catch(e){ /* si falla, el cliente cae a LEAGUE_NAME como antes */ }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    state: filterForSession(state, session),
    role: session.r,
    name: session.u,
    ligaId,
    ligaNombre,
    token: renewIfStale(session) || undefined
  });
};
