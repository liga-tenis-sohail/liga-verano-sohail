'use strict';
// Immutable daily copies; verify new and retained objects BEFORE deleting old tracked copies.
const crypto=require('node:crypto'),lib=require('./_lib'),B=require('./_backup-security');
const BUCKET='backups',FILE=/^daily-v510-\d{4}-\d{2}-\d{2}-[a-f0-9]{32}\.sohail\.enc$/;
const storage=(path,options={})=>fetch(lib.SUPA_URL+'/storage/v1/'+path,{...options,headers:lib.supaHeaders(options.headers),signal:AbortSignal.timeout(20000)});
const problem=code=>Object.assign(new Error('Backup operation could not be verified.'),{status:503,code});
function utcDay(value){const stamp=Date.parse(value);if(!Number.isFinite(stamp))throw problem('BACKUP_DATE_MISMATCH');return new Date(stamp).toISOString().slice(0,10);}
async function verifyObject(record,secret){
 if(!FILE.test(record.file))throw problem('BACKUP_BAD_FILE');
 const response=await storage('object/'+BUCKET+'/'+record.file);
 if(!response.ok||Number(response.headers.get('content-length')||0)>B.MAX_FILE)throw problem('BACKUP_VERIFY_FAILED');
 const data=Buffer.from(await response.arrayBuffer());
 if(data.length>B.MAX_FILE||data.length!==Number(record.size_bytes)||B.digest(data)!==record.digest)throw problem('BACKUP_VERIFY_FAILED');
 const verified=await B.open(data,secret);if(utcDay(verified.snapshot.generated_at)!==record.day)throw problem('BACKUP_DATE_MISMATCH');return verified.snapshot;
}
module.exports=async function(req,res){
 if(!lib.envOK(res))return;
 const bearer=String(req.headers.authorization||'').startsWith('Bearer ')?req.headers.authorization.slice(7):'';
 if(!B.sameSecret(bearer,process.env.CRON_SECRET)&&!B.sameSecret(req.headers['x-backup-secret'],process.env.BACKUP_SECRET))return res.status(401).json({error:'No autorizado.',code:'BACKUP_UNAUTHORIZED'});
 const owner=crypto.randomUUID(),rpc=(action,data={})=>lib.rpc('sohail_perf_backup',{p_action:action,p_data:{...data,owner}});
 await require('./_request-security').consume(req,'backup','shared-cron');const lease=await rpc('acquire');
 if(!lease?.ok)return res.status(409).json({code:lease?.code||'BACKUP_BUSY',error:'Ya hay una copia en curso. No se eliminó nada.'});
 const started=Date.now(),secret=process.env.BACKUP_ENCRYPTION_KEY;let file,record,snapshot,cleanup='ok';
 try{
  try{await lib.rpc('sohail_p3_cleanup',{});await require('./_auth-security').sessionRPC('cleanup');}catch(_){cleanup='pending';}
  B.key(secret);const br=await storage('bucket/'+BUCKET);if(!br.ok)throw problem('BACKUP_BUCKET_UNAVAILABLE');
  const bucket=await br.json();if(bucket.id!==BUCKET||bucket.public!==false)throw problem('BACKUP_BUCKET_NOT_PRIVATE');
  if(lease.existing){record=lease.existing;file=record.file;snapshot=await verifyObject(record,secret);}
  else{
   snapshot=await lib.rpc('sohail_p3_backup_snapshot',{});if(utcDay(snapshot.generated_at)!==lease.day)throw problem('BACKUP_DATE_MISMATCH');
   const encrypted=await B.seal(snapshot,secret,process.env.BACKUP_KEY_ID||'primary');file='daily-v510-'+lease.day+'-'+crypto.randomBytes(16).toString('hex')+'.sohail.enc';
   record={file,day:lease.day,digest:B.digest(encrypted),size_bytes:encrypted.length};
   if(!(await rpc('register',{file,day:lease.day})).ok)throw problem('BACKUP_LOCK_LOST');
   const up=await storage('object/'+BUCKET+'/'+file,{method:'POST',headers:{'Content-Type':'application/octet-stream','x-upsert':'false'},body:encrypted});if(!up.ok)throw problem('BACKUP_UPLOAD_FAILED');
   await verifyObject(record,secret);if(!(await rpc('verified',{file,digest:record.digest,size:record.size_bytes})).ok)throw problem('BACKUP_LOCK_LOST');
  }
  const retention={ok:false,kept:[],removed:0,pending:0,legacy:'not-managed'};
  try{
   const plan=await rpc('plan');if(!plan.ok||!Array.isArray(plan.keep)||!plan.keep.length||plan.keep.length>3||!Array.isArray(plan.remove)||new Set(plan.keep.map(x=>x.day)).size!==plan.keep.length)throw problem('BACKUP_BAD_RETENTION');
   const keep=new Set(plan.keep.map(x=>x.file));if(!keep.has(file)||plan.remove.some(x=>!FILE.test(x)||keep.has(x)))throw problem('BACKUP_BAD_RETENTION');
   for(const item of plan.keep)if(item.file!==file)await verifyObject(item,secret);
   retention.kept=plan.keep.map(x=>({file:x.file,day:x.day}));const removing=plan.remove.slice(0,100);
   if(removing.length){
    const fresh=await rpc('plan');if(!fresh.ok||JSON.stringify(fresh.keep)!==JSON.stringify(plan.keep))throw problem('BACKUP_LOCK_LOST');
    if(Date.now()-started>45000)throw problem('BACKUP_RETENTION_DEFERRED');
    const removed=await storage('object/'+BUCKET,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:removing})});if(!removed.ok)throw problem('BACKUP_RETENTION_FAILED');
    if(!(await rpc('deleted',{files:removing})).ok)throw problem('BACKUP_LOCK_LOST');retention.removed=removing.length;
   }
   retention.pending=plan.remove.length-removing.length;retention.ok=retention.pending===0;
  }catch(e){retention.code=/^[A-Z_]+$/.test(e.code||'')?e.code:'BACKUP_RETENTION_FAILED';}
  await lib.logAudit('system','backup.ok',file,{version:3,sizeBytes:record.size_bytes,verified:true,retentionOk:retention.ok,removed:retention.removed},null);
  return res.status(200).json({ok:true,file,sizeBytes:record.size_bytes,encrypted:true,verified:true,reusedDaily:!!lease.existing,counts:snapshot.counts,cleanup,retention,totalMs:Date.now()-started});
 }catch(e){await lib.logAudit('system','backup.fail',null,{code:/^[A-Z_]+$/.test(e.code||'')?e.code:'BACKUP_FAILED'},null);throw Object.assign(new Error('Backup failed; previous copies were not intentionally removed.'),{status:503,code:/^[A-Z_]+$/.test(e.code||'')?e.code:'BACKUP_FAILED'});}
 finally{try{await rpc('release');}catch(_){/* Lease expires; never force unlock another worker. */}}
};
module.exports=require('./_http').wrap(module.exports,{route:'backup'});
