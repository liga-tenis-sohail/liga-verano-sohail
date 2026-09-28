'use strict';
// Existing three-day cron. A complete snapshot is encrypted before leaving
// the function. No automatic deletion: retain earlier copies until recovery
// has been tested and an independent copy exists.
const crypto=require('node:crypto');
const lib=require('./_lib'),B=require('./_backup-security');
const BUCKET='backups';
const storage=(path,options={})=>fetch(lib.SUPA_URL+'/storage/v1/'+path,{...options,headers:lib.supaHeaders(options.headers),signal:AbortSignal.timeout(20000)});
module.exports=async function(req,res){
 if(!lib.envOK(res))return;
 const bearer=String(req.headers.authorization||'').startsWith('Bearer ')?req.headers.authorization.slice(7):'';
 if(!B.sameSecret(bearer,process.env.CRON_SECRET)&&!B.sameSecret(req.headers['x-backup-secret'],process.env.BACKUP_SECRET))return res.status(401).json({error:'No autorizado.',code:'BACKUP_UNAUTHORIZED'});
 const secret=process.env.BACKUP_ENCRYPTION_KEY;
 B.key(secret); // Do not fall back to plaintext when the key is missing.
 await require('./_request-security').consume(req,'backup','shared-cron');
 const started=Date.now();
 try{
  const br=await storage('bucket/'+BUCKET);
  if(!br.ok)throw Object.assign(new Error('Backup bucket unavailable'),{code:'BACKUP_BUCKET_UNAVAILABLE'});
  const bucket=await br.json();
  if(bucket.id!==BUCKET||bucket.public!==false)throw Object.assign(new Error('Backup bucket must be private'),{code:'BACKUP_BUCKET_NOT_PRIVATE'});
  const snapshot=await lib.rpc('sohail_p3_backup_snapshot',{});
  const encrypted=await B.seal(snapshot,secret,process.env.BACKUP_KEY_ID||'primary');
  const name='backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex')+'.sohail.enc';
  const up=await storage('object/'+BUCKET+'/'+name,{method:'POST',headers:{'Content-Type':'application/octet-stream','x-upsert':'false'},body:encrypted});
  if(!up.ok)throw Object.assign(new Error('Backup upload failed'),{code:'BACKUP_UPLOAD_FAILED'});
  const check=await storage('object/'+BUCKET+'/'+name);
  if(!check.ok||Number(check.headers.get('content-length')||0)>B.MAX_FILE)throw Object.assign(new Error('Backup verification failed'),{code:'BACKUP_VERIFY_FAILED'});
  const downloaded=Buffer.from(await check.arrayBuffer());
  if(downloaded.length!==encrypted.length||B.digest(downloaded)!==B.digest(encrypted))throw Object.assign(new Error('Backup verification failed'),{code:'BACKUP_VERIFY_FAILED'});
  await B.open(downloaded,secret); // Confirms GCM integrity and bounded decompression.
  let cleanup='ok';
  try{await lib.rpc('sohail_p3_cleanup',{});await require('./_auth-security').sessionRPC('cleanup');}catch(_){cleanup='pending';}
  await lib.logAudit('system','backup.ok',name,{version:3,sizeBytes:encrypted.length,verified:true,ms:Date.now()-started},null);
  return res.status(200).json({ok:true,file:name,sizeBytes:encrypted.length,verified:true,encrypted:true,counts:snapshot.counts,cleanup,retention:'manual-no-deletion',totalMs:Date.now()-started});
 }catch(e){
  await lib.logAudit('system','backup.fail',null,{code:/^[A-Z_]+$/.test(e.code||'')?e.code:'BACKUP_FAILED'},null);
  throw Object.assign(new Error('Backup failed; earlier copies were not deleted.'),{status:503,code:/^[A-Z_]+$/.test(e.code||'')?e.code:'BACKUP_FAILED'});
 }
};
module.exports=require('./_http').wrap(module.exports,{route:'backup'});
