// =====================================================================
// GET /api/backup   -> { ok, size, uploaded, keptOld }
//
// Endpoint disparado por el cron de Vercel (vercel.json → crons). Lee todas
// las tablas del sistema, empaqueta un JSON, lo comprime (gzip) y lo sube al
// bucket 'backups' de Supabase Storage.
//
// Seguridad: se protege con un token en el header 'x-backup-secret'. Vercel
// lo pasa configurando el header en el cron. Sin token válido, 401.
// (Sin secreto adicional Vercel cron podría llamarse desde afuera.)
//
// Retención: borra backups > 90 días.
// =====================================================================
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);

const { SUPA_URL, supaHeaders, envOK, logAudit } = require('./_lib');

// Nombre del bucket. Debe crearse manualmente desde Supabase Dashboard →
// Storage → New bucket → nombre "backups" → PRIVATE.
const BUCKET = 'backups';
const RETENTION_DAYS = 90;

async function fetchAll(tabla, extra){
  const q = extra ? '?' + extra : '';
  const r = await fetch(SUPA_URL + '/rest/v1/' + tabla + q, { headers: supaHeaders() });
  if(!r.ok) throw new Error('Supabase read ' + tabla + ' ' + r.status);
  return r.json();
}

module.exports = async function handler(req, res){
  if(!envOK(res)) return;

  // Autorización: aceptamos DOS mecanismos:
  //  a) Vercel Cron estándar: header Authorization: Bearer <CRON_SECRET>
  //     (Vercel lo agrega automáticamente si la env var CRON_SECRET está seteada)
  //  b) Header custom x-backup-secret con BACKUP_SECRET (para llamadas manuales)
  const cronSecret = process.env.CRON_SECRET;
  const backupSecret = process.env.BACKUP_SECRET;
  if(!cronSecret && !backupSecret){
    return res.status(500).json({ error: 'Faltan CRON_SECRET y BACKUP_SECRET en Vercel.' });
  }
  const authHeader = req.headers['authorization'] || '';
  const gotBearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const gotCustom = req.headers['x-backup-secret'] || '';
  const ok = (cronSecret && gotBearer === cronSecret) || (backupSecret && gotCustom === backupSecret);
  if(!ok){
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const started = Date.now();
  try {
    // 1) Leer todas las tablas relevantes. audit_log solo últimos 180 días para
    //    que no crezca el backup indefinidamente.
    const hace180 = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
    const [liga_state, liga_index, jugadores, passkeys, audit_log] = await Promise.all([
      fetchAll('liga_state'),
      fetchAll('liga_index', 'order=orden.asc'),
      fetchAll('jugadores'),
      fetchAll('passkeys'),
      fetchAll('audit_log', 'at=gte.' + encodeURIComponent(hace180) + '&order=at.desc')
    ]);

    const snapshot = {
      version: 1,
      generated_at: new Date().toISOString(),
      tables: { liga_state, liga_index, jugadores, passkeys, audit_log }
    };

    const json = JSON.stringify(snapshot);
    const gz = await gzip(Buffer.from(json, 'utf8'));

    // 2) Subir a Storage. El nombre incluye fecha y hora ISO para orden natural.
    const now = new Date();
    const fname = 'backup-' + now.toISOString().replace(/[:.]/g, '-') + '.json.gz';
    const upR = await fetch(SUPA_URL + '/storage/v1/object/' + BUCKET + '/' + fname, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/gzip',
        'x-upsert': 'false'
      },
      body: gz
    });
    if(!upR.ok){
      const txt = await upR.text().catch(()=>'');
      throw new Error('Storage upload ' + upR.status + ' ' + txt.slice(0, 200));
    }

    // 3) Retención: listar objetos y borrar los > RETENTION_DAYS.
    let keptOld = 0;
    try {
      const listR = await fetch(SUPA_URL + '/storage/v1/object/list/' + BUCKET, {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ limit: 1000, sortBy: { column: 'name', order: 'desc' } })
      });
      if(listR.ok){
        const files = await listR.json();
        const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
        const toDelete = [];
        for(const f of files){
          // Parseamos la fecha del nombre: "backup-YYYY-MM-DDTHH-MM-SS-mmmZ.json.gz"
          const m = f.name && f.name.match(/^backup-(\d{4})-(\d{2})-(\d{2})T/);
          if(!m) continue;
          const d = new Date(m[1] + '-' + m[2] + '-' + m[3]);
          if(d.getTime() < cutoff) toDelete.push(f.name);
        }
        keptOld = files.length - toDelete.length;
        if(toDelete.length){
          await fetch(SUPA_URL + '/storage/v1/object/' + BUCKET, {
            method: 'DELETE',
            headers: {
              apikey: process.env.SUPABASE_SERVICE_KEY,
              Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prefixes: toDelete })
          }).catch(()=>{});
        }
      }
    } catch(_){ /* la retención es best-effort */ }

    logAudit('system', 'backup.ok', fname, { sizeBytes: gz.length, ms: Date.now() - started }, null);

    return res.status(200).json({
      ok: true,
      file: fname,
      sizeBytes: gz.length,
      totalMs: Date.now() - started,
      keptOld
    });
  } catch(e){
    logAudit('system', 'backup.fail', null, { error: String(e.message || e).slice(0, 300) }, null);
    return res.status(500).json({ error: 'Backup failed: ' + (e.message || 'desconocido') });
  }
};
