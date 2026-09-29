'use strict';
const lib=require('./_lib'),history=require('../public/history-leagues');
const fail=(status,code,msg)=>Object.assign(new Error(msg),{status,code});
async function handler(req,res){
 const {name,id,currentId,signature,coherent}=req.body||{};
 if(coherent!==undefined&&coherent!==true)throw fail(400,'HISTORY_INPUT','Modo de historial inválido.');
 if(typeof name!=='string'||!name||name.length>120||typeof id!=='string'||(!id&&!coherent)||id.length>180||!lib.ligaIdOK(currentId))throw fail(400,'HISTORY_INPUT','Identidad de historial inválida.');
 if(signature!==undefined&&!/^[a-f0-9]{64}$/.test(signature))throw fail(400,'HISTORY_INPUT','Versión inválida.');
 const authenticated=!!req.headers?.authorization,session=authenticated?await lib.auth(req):null;
 if(authenticated&&!session)throw fail(401,'SESSION_EXPIRED','La sesión venció.');
 const source=await lib.rpc('sohail_perf_source',{p_private:!!session,p_snapshot:true,p_model:'',p_signature:signature||null});
 if(coherent&&(!source||!Array.isArray(source.index)||!source.index.some(l=>l.id===currentId)))throw fail(403,'HISTORY_SCOPE','La liga no forma parte del historial autorizado.');
 if(source&&signature&&source.signature===signature&&Array.isArray(source.index)){
  if(session&&!await lib.auth(req))throw fail(401,'SESSION_EXPIRED','La sesión venció durante la lectura.');
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
  return res.status(200).json({complete:true,notModified:true,signature,...(coherent?{coherent:true,currentId}: {})});
 }
 if(!source||!Array.isArray(source.index)||!Array.isArray(source.states))throw fail(503,'HISTORY_UNAVAILABLE','No se pudo leer el historial completo.');
 const index=history.uniqueIndex(source.index,{id:currentId}),states=new Map(source.states.map(s=>[s.id,s.data]));
 if(coherent){
  const currentState=states.get(currentId),u=currentState?.users?.[name];
  const currentIdentity=u?.historialId||u?.jugadorId||'';
  if(!u||currentIdentity!==id)throw fail(409,'HISTORY_IDENTITY_CHANGED','La identidad cambió. Volvé a abrir el perfil antes de consultar su historial.');
 }
 const out={records:[],leagues:[],index,issues:id?[]:[{reason:'no-global-id'}],total:index.length,linked:!!id,signature:source.signature,complete:true,...(coherent?{coherent:true,currentId}: {})};
 for(const entry of index){
  if((!coherent&&entry.id===currentId)||(!id&&entry.id!==currentId))continue;
  const state=states.get(entry.id);if(!state)throw fail(503,'HISTORY_UNAVAILABLE','Falta una liga del historial.');
  const p=history.project(state,entry,{name,id},{current:coherent&&entry.id===currentId});out.records.push(...p.records);
  out.leagues.push({...entry,count:p.records.length,cycles:(state.cycles||[]).filter(c=>Number.isSafeInteger(c.n)).map(c=>({n:c.n}))});
  p.issues.forEach(reason=>out.issues.push({id:entry.id,name:entry.nombre,reason}));
 }
 if(session&&!await lib.auth(req))throw fail(401,'SESSION_EXPIRED','La sesión venció durante la lectura.');
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');return res.status(200).json(out);
}
module.exports={handler};
