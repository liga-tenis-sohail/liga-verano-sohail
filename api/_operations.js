'use strict';
// Private transaction plumbing. No browser credentials or security snapshots are returned.
const crypto=require('node:crypto');
const lib=require('./_lib');
const {AppError,safeTree}=require('./_validation');
const clone=v=>structuredClone(v);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function stable(value){
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(object(value))return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
function digest(value){return crypto.createHmac('sha256',process.env.SESSION_SECRET).update(stable(value)).digest('base64url');}
async function tableRows(table,select='*',extra='',cap=10000){
 const rows=[];let offset=0;
 while(offset<=cap){
  const r=await fetch(lib.SUPA_URL+'/rest/v1/'+table+'?select='+select+'&order=id.asc&limit=250&offset='+offset+extra,{headers:lib.supaHeaders(),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new AppError(503,r.status===404?'SCHEMA_REQUIRED':'DATABASE_UNAVAILABLE',r.status===404?'Falta instalar 04_restore_identities.sql. No se modificó nada.':'No se pudo leer la base de datos. No se modificó nada.');
  const page=await r.json();if(!Array.isArray(page))throw new AppError(503,'DATABASE_UNAVAILABLE','Respuesta inválida de la base.');
  if(!page.length)return rows;rows.push(...page);offset+=page.length;
  if(rows.length>cap)throw new AppError(413,'DATA_LIMIT','El conjunto excede el límite de revisión. No se modificó nada.');
 }
 throw new AppError(413,'DATA_LIMIT','El conjunto excede el límite de revisión.');
}
async function registry(){
 const rows=await tableRows('sohail_identity_registry','*','&id=eq.1',1);
 const r=rows[0];if(!r||!object(r.data)||!Number.isSafeInteger(Number(r.version)))throw new AppError(503,'SCHEMA_REQUIRED','Falta inicializar 04_restore_identities.sql.');
 return {version:Number(r.version),data:clone(r.data)};
}
async function context(req){
 const session=await lib.auth(req);if(!session)throw new AppError(401,'UNAUTHENTICATED','Tu sesión venció. Volvé a entrar.');
 const source=await lib.readState(session.src);
 if(!source||lib.blockedUser(source,session))throw new AppError(403,'FORBIDDEN','La cuenta de origen ya no está autorizada.');
 return {session,source,superadmin:source.users[session.u].role==='superadmin'};
}
function authorised(ctx,state){return ctx.superadmin||lib.sesionEsAdmin(ctx.session,state?.users);}
function requireAdmin(ctx,state){if(!authorised(ctx,state))throw new AppError(403,'FORBIDDEN','Necesitás ser administrador de esta liga o superadministrador.');}
async function operation(id){
 if(!uuid(id))throw new AppError(400,'INVALID_OPERATION','Identificador de operación inválido.');
 return (await tableRows('sohail_data_operations','*','&id=eq.'+id,1))[0]||null;
}
function publicResult(row){return {...row.result,operationId:row.id,committed:true};}
async function replay(id,ctx,kind,proof){
 if(!id)return null;
 const row=await operation(id);if(!row)return null;
 if(row.actor_key!==ctx.session.pk||row.kind!==kind||row.request_digest!==proof)throw new AppError(409,'OPERATION_REUSED','Este identificador corresponde a otra operación. Volvé a abrir la revisión.');
 return publicResult(row);
}
function planProof(ctx,kind,states,reg,extra){return digest({kind,actor:ctx.session.pk,epoch:ctx.session.sv,source:ctx.session.src,sourceV:ctx.source._v||0,states,registry:reg,extra});}
async function commit(ctx,{kind,states,reg,newRegistry,proof,operationId,summary}){
 require('./_auth-security').ensureFresh(ctx.session);
 if(!uuid(operationId))throw new AppError(400,'INVALID_OPERATION','Falta identificar la operación.');
 const s=ctx.session,locks=states.map(clone);
 if(!locks.some(x=>x.id===s.src))locks.push({id:s.src,expected:ctx.source._v||0,write:false});
 const r=await lib.rpc('sohail_apply_data_operation',{
  p_id:operationId,p_kind:kind,p_actor:s.u,p_actor_key:s.pk,p_epoch:s.sv,p_source:s.src,
  p_digest:proof,p_states:locks,p_registry_version:reg.version,p_registry:newRegistry||null,p_summary:summary||{}
 });
 if(!r?.ok){const status=r?.code==='FORBIDDEN'?403:409;throw new AppError(status,r?.code||'CONFLICT',status===403?'Los permisos cambiaron. No se aplicó la operación.':'Los datos cambiaron después de la revisión. No se aplicó nada. Volvé a revisar.',{currentV:r?.currentV});}
 return {...r,operationId,committed:true};
}
module.exports={clone,own,object,uuid,stable,digest,tableRows,registry,context,authorised,requireAdmin,operation,publicResult,replay,planProof,commit,AppError,safeTree};
