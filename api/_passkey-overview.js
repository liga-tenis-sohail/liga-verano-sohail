'use strict';
// One authorized HTTP read for the device panel. Never exports keys/counters.
const lib=require('./_lib');
const SELECT='principal_key,credential_id,device_label,created_at,last_used_at';
const BATCH=50,PAGE=250,MAX_ROWS=20000;
function failure(message,code,status=503){return Object.assign(new Error(message),{code,status});}
function quoted(value){return '"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';}
async function overview(req,body){
 const session=await lib.auth(req);
 if(!session)throw failure('La sesión venció. Ingresá nuevamente.','SESSION_EXPIRED',401);
 const liga=body.ligaId||session.src;
 if(!lib.ligaIdOK(liga))throw failure('Identificador de liga inválido.','INVALID_LEAGUE',400);
 const state=await lib.readState(liga);
 if(!state||!lib.sesionEsAdmin(session,state.users))throw failure('Solo un administrador de esta liga.','FORBIDDEN',403);
 const members=Object.entries(state.users||{}).filter(([n,u])=>u&&!u.inactive&&(u.role||'player')==='player'&&
   (!u.isAdmin||lib.puedeGestionarAdmins(session))&&n!=='admin'&&n!=='superadmin');
 const keys=[...new Set(members.map(([n,u])=>lib.principalKey(n,u)))];
 const devices=new Map(keys.map(k=>[k,[]]));let rowsRead=0;
 for(let i=0;i<keys.length;i+=BATCH){
  const batch=keys.slice(i,i+BATCH),allowed=new Set(batch);
  for(let offset=0;;offset+=PAGE){
   const query=new URLSearchParams({select:SELECT,principal_key:'in.('+batch.map(quoted).join(',')+')',order:'credential_id.asc',limit:String(PAGE),offset:String(offset)});
   const response=await fetch(lib.SUPA_URL+'/rest/v1/passkeys?'+query,{headers:lib.supaHeaders(),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw failure('No se pudieron consultar los dispositivos.','PASSKEY_READ_FAILED');
   const rows=await response.json();if(!Array.isArray(rows))throw failure('Respuesta de dispositivos inválida.','PASSKEY_READ_FAILED');
   rowsRead+=rows.length;if(rowsRead>MAX_ROWS)throw failure('El listado requiere paginación adicional.','DATA_LIMIT',413);
   for(const p of rows){
    if(!p||!allowed.has(p.principal_key)||typeof p.credential_id!=='string')continue;
    devices.get(p.principal_key).push({credentialId:p.credential_id,deviceLabel:p.device_label||'Dispositivo',createdAt:p.created_at||null,lastUsedAt:p.last_used_at||null});
   }
   if(rows.length<PAGE)break;
  }
 }
 const jugadores=members.map(([nombre,u])=>({nombre,passkeys:devices.get(lib.principalKey(nombre,u))||[]}))
  .filter(j=>j.passkeys.length).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
 for(const j of jugadores)j.passkeys.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
 return {ok:true,totalJugadores:members.length,conPasskey:jugadores.length,totalPasskeys:[...devices.values()].reduce((s,x)=>s+x.length,0),
  pct:members.length?Math.round(100*jugadores.length/members.length):0,jugadores};
}
module.exports={overview};
