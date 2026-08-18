// =====================================================================
// GET /api/health   -> { ok, db, at }
// Chequeo de salud simple. Devuelve 200 si el servidor responde y puede
// alcanzar Supabase, 503 si Supabase falla. Útil para monitores externos
// (UptimeRobot, Better Stack, etc.).
// =====================================================================
const { SUPA_URL, supaHeaders, envOK } = require('./_lib');

module.exports = async function handler(req, res){
  if(!envOK(res)) return;
  const started = Date.now();
  let dbOk = false;
  let dbLatency = null;
  try {
    // Query mínima: pedir 1 fila de liga_index. Es más liviano que leer
    // liga_state. Timeout implícito de fetch (Vercel corta la function).
    const dbStart = Date.now();
    const r = await fetch(SUPA_URL + '/rest/v1/liga_index?select=id&limit=1', {
      headers: supaHeaders()
    });
    dbLatency = Date.now() - dbStart;
    dbOk = r.ok;
  } catch(_){ dbOk = false; }

  const status = dbOk ? 200 : 503;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({
    ok: dbOk,
    db: dbOk ? 'ok' : 'down',
    dbLatencyMs: dbLatency,
    totalMs: Date.now() - started,
    at: new Date().toISOString()
  });
};
