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
//   (el jugador está en 2+ ligas activas), la contraseña YA se validó y
//   el token YA es válido, pero todavía no sabíamos a qué liga entrar.
//   El cliente llama acá con la liga elegida + el flag ?elegir=1: se
//   revalida que el jugador realmente pertenezca a esa liga (nunca se
//   confía ciegamente en lo que mande el cliente) y devuelve el state
//   igual que haría un login normal.
// =====================================================================
const { auth, readState, envOK, filterForSession, renewIfStale, blockedUser, ligaIdOK, LIGA_DEFAULT } = require('./_lib');

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

  // Paso 2 del login unificado: el jugador venía sin liga asignada todavía
  // (session.r === 'player' y recién eligió). Revalidamos que efectivamente
  // exista como player en ESTA liga antes de entregarle nada — el ?liga=
  // lo manda el cliente y no hay que confiar en él a ciegas.
  if(req.query && req.query.elegir){
    const u = (state.users || {})[session.u];
    if(!u || u.role !== 'player'){
      return res.status(403).json({ error: 'No pertenecés a esa liga.' });
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    state: filterForSession(state, session),
    role: session.r,
    name: session.u,
    ligaId,
    token: renewIfStale(session) || undefined
  });
};
