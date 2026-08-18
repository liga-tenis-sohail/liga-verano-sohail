// =====================================================================
// GET /api/audit   (Authorization: Bearer <token>)
//   ?limit=50&action=liga.eliminar&actor=marcos
// Devuelve los últimos N eventos del audit log. Solo superadmin puede ver.
//
// Filtros opcionales: action (prefix), actor (exact), target (exact), since ISO.
// =====================================================================
const { SUPA_URL, supaHeaders, auth, envOK } = require('./_lib');

module.exports = async function handler(req, res){
  if(!envOK(res)) return;

  const session = auth(req);
  if(!session) return res.status(401).json({ error: 'Sesión inválida.' });
  if(session.r !== 'superadmin') return res.status(403).json({ error: 'Solo el super administrador puede ver el log.' });

  const q = req.query || {};
  const limit = Math.min(500, Math.max(1, parseInt(q.limit, 10) || 100));
  const params = ['select=id,at,actor,actor_ip,action,target,details', 'order=at.desc', 'limit=' + limit];

  if(q.action) params.push('action=like.' + encodeURIComponent(String(q.action) + '%'));
  if(q.actor)  params.push('actor=eq.' + encodeURIComponent(String(q.actor)));
  if(q.target) params.push('target=eq.' + encodeURIComponent(String(q.target)));
  if(q.since && /^\d{4}-\d{2}-\d{2}/.test(String(q.since))){
    params.push('at=gte.' + encodeURIComponent(String(q.since)));
  }

  try {
    const r = await fetch(SUPA_URL + '/rest/v1/audit_log?' + params.join('&'), { headers: supaHeaders() });
    if(!r.ok) return res.status(503).json({ error: 'No se pudo leer el log.' });
    const events = await r.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ events, count: events.length });
  } catch(e){
    return res.status(503).json({ error: 'Error de lectura.' });
  }
};
