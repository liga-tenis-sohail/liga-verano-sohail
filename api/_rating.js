'use strict';
// Read-only sports snapshot. Same visibility as /api/state?historial=1:
// authenticated, non-revoked source accounts can read all registered sporting
// editions; guests only finalized editions. No credentials or contact data.
const crypto=require('node:crypto');
const lib=require('./_lib');
const E=require('./_rating-engine');
const cache=new Map();
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
function error(status,code,message){return Object.assign(new Error(message),{status,code});}
async function rows(table,select){
 const out=[];let offset=0;
 for(;;){
  const r=await fetch(lib.SUPA_URL+'/rest/v1/'+table+'?select='+select+'&order=id.asc&limit=250&offset='+offset,{headers:lib.supaHeaders(),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw error(503,'RATING_SOURCE_UNAVAILABLE','No se pudo leer todo el historial. No se publicó un rating parcial.');
  const page=await r.json();if(!Array.isArray(page))throw error(503,'RATING_SOURCE_UNAVAILABLE','Respuesta de historial inválida.');
  if(!page.length)return out;
  out.push(...page);offset+=page.length;
  if(offset>10000)throw error(413,'RATING_SOURCE_LIMIT','El historial supera el límite operativo de ligas. No se descartó ningún partido para calcular.');
 }
}
function project(index,states,authenticated){
 const selected=index.filter(l=>authenticated||l.estado==='finalizada').sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 const map=new Map(states.map(r=>[r.id,r.data]));
 return selected.map(l=>{
  if(!lib.ligaIdOK(l.id))throw error(503,'INVALID_LEAGUE_INDEX','El índice de ligas tiene un identificador inválido.');
  let s=map.get(l.id);if(typeof s==='string'){try{s=JSON.parse(s);}catch(_){s=null;}}
  if(!s||!Array.isArray(s.matches)||!s.users||typeof s.users!=='object')throw error(503,'RATING_SOURCE_INCOMPLETE','Falta el estado deportivo de una liga. Se conserva el cálculo completo anterior.');
  const users=Object.create(null),seeds=Object.create(null),overrides=Object.create(null);
  for(const [n,u]of Object.entries(s.users)){
   if(!u||typeof u!=='object')continue;
   const x={};for(const k of ['jugadorId','historialId','historialNombre'])if(typeof u[k]==='string')x[k]=u[k];users[n]=x;
   for(const [source,target,low]of [[s.RATING_SEEDS,seeds,1],[s.RATING_OVERRIDES,overrides,0.01]]){
    const v=own(source,n)?source[n]:null;if(typeof v==='number'&&Number.isFinite(v)&&v>=low&&v<=16)target[n]=v;
   }
  }
  // Retain the number of groups per historical cycle, but no extra user fields.
  const cycles=(s.cycles||[]).map(c=>({n:c.n,groups:Array.isArray(c.groups)?c.groups.map(()=>({})):null}));
  const matches=s.matches.map(m=>{
   const x={};for(const k of ['id','po','cycle','g','sets','date','status','wo','np','winner','retiroDe','poNames','aName','bName'])if(m&&own(m,k))x[k]=m[k];return x;
  });
  return {id:l.id,name:String(l.nombre||l.id),state:String(l.estado||''),order:Number(l.orden)||0,v:Number(s._v)||0,users,matches,cycles,seeds,overrides};
 });
}
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function stableSnapshot(authenticated){
 // Two equal complete projections guard multi-page/concurrent saves/restores.
 // _v is part of the proof; no "best effort" subset is ever returned.
 async function read(){const index=await rows('liga_index','id,nombre,estado,orden');const states=await rows('liga_state','id,data');return project(index,states,authenticated);}
 for(let attempt=0;attempt<2;attempt++){
  const a=await read(),b=await read();if(digest(a)===digest(b))return b;
 }
 throw error(409,'RATING_SOURCE_CHANGED','El historial cambió durante el cálculo. Volvé a actualizar el rating.');
}
async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({code:'METHOD_NOT_ALLOWED',error:'Método no permitido.'});
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
 try{
  const header=req.headers?.authorization;
  const session=header?await lib.auth(req):null;
  if(header&&!session)throw error(401,'UNAUTHENTICATED','Tu sesión venció. Volvé a entrar.');
  const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  if(Object.keys(body).some(k=>!['playerKey','snapshot'].includes(k)))throw error(400,'INVALID_RATING_REQUEST','El rating usa únicamente resultados guardados, no datos enviados desde el navegador.');
  if(body.playerKey!==undefined&&(typeof body.playerKey!=='string'||body.playerKey.length>600))throw error(400,'INVALID_PLAYER','Perfil inválido.');
  const fast=await fastSnapshot(!!session,body.playerKey);
  // Mandatory fresh authorization, including on persistent cache hits.
  if(session&&!await lib.auth(req))throw error(401,'UNAUTHENTICATED','Tu sesión venció durante la lectura.');
  const {computed,manifest,snapshot,asOf}=fast;
  res.setHeader('X-Sohail-Rating-Cache',fast.hit);
  if(body.playerKey!==undefined){
   if(body.snapshot!==snapshot)throw error(409,'RATING_SOURCE_CHANGED','El cálculo cambió. Actualizá la tabla antes de consultar los partidos.');
   const info=computed.info[body.playerKey];if(!info)throw error(404,'PLAYER_NOT_FOUND','El perfil no forma parte del historial autorizado.');
   return res.status(200).json({snapshot,version:E.VERSION,asOf,selected:info.selected,leagues:manifest});
  }
  const info=Object.create(null),people=Object.create(null),overrides=Object.create(null);
  for(const [k,v]of Object.entries(computed.info)){const {selected,...summary}=v;info[k]=summary;const p=computed.people[k];people[k]={label:p.label,aliases:p.aliases};}
  Object.assign(overrides,fast.overrides);
  return res.status(200).json({ok:true,complete:true,version:E.VERSION,snapshot,asOf,ts:new Date().toISOString(),scope:session?'all-registered':'finalized-public',
   window:50,method:{...E.DEFAULTS,provisionalMatches:E.PROVISIONAL_MATCHES},weakBridgeCount:computed.weakBridgeCount,info,people,byLeague:computed.byLeague,overrides,leagues:manifest,matchCount:computed.matchCount,componentCount:computed.componentCount,
   issueCounts:computed.issues.reduce((o,x)=>{o[x.code]=(o[x.code]||0)+1;return o;},{}),iterations:computed.iterations});
 }catch(e){return res.status(e.status||e instanceof E.RatingError&&422||503).json({code:e.code||'RATING_UNAVAILABLE',error:e.code?e.message:'No se pudo calcular el rating completo. Probá de nuevo.'});}
}
const inflight=new Map();
async function fastSnapshot(priv,playerKey){
 const read=full=>lib.rpc('sohail_perf_source',{p_private:priv,p_snapshot:full,p_model:E.VERSION,p_player:playerKey??null});
 const source=await read(false);
 if(!source||!Array.isArray(source.index)||typeof source.signature!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(source.asOf||''))throw error(503,'RATING_SOURCE_UNAVAILABLE','No se pudo leer el rating completo.');
 const snapshot=digest({model:E.VERSION,asOf:source.asOf,signature:source.signature,private:priv});
 const finish=(payload,hit)=>({computed:payload.computed,overrides:payload.overrides,snapshot,asOf:source.asOf,hit,manifest:payload.manifest.map(l=>({...l,version:source.index.find(x=>x.id===l.id)?.version??l.version}))});
 if(source.cache)return finish(source.cache,'persistent');
 if(cache.has(snapshot))return finish(cache.get(snapshot),'memory');
 if(!inflight.has(snapshot)){
  const work=(async()=>{
   const full=await read(true);
   if(full.signature!==source.signature||full.asOf!==source.asOf)throw error(409,'RATING_SOURCE_CHANGED','El historial cambió. Actualizá el rating.');
   if(!Array.isArray(full.states))throw error(503,'RATING_SOURCE_INCOMPLETE','Falta el historial completo.');
   const leagues=project(full.index,full.states,priv),computed=E.calculate(E.prepare(leagues),{asOf:full.asOf});
   const payload={computed,overrides:Object.fromEntries(leagues.map(l=>[l.id,l.overrides])),manifest:leagues.map(l=>({id:l.id,name:l.name,state:l.state,version:l.v,matches:l.matches.filter(m=>m.status==='confirmed'&&!m.np).length}))};
   const stored=await lib.rpc('sohail_perf_cache_put',{p_private:priv,p_signature:full.signature,p_model:E.VERSION,p_as_of:full.asOf,p_payload:payload});
   if(!stored){const current=await read(false);if(current.signature!==full.signature||current.asOf!==full.asOf)throw error(409,'RATING_SOURCE_CHANGED','El historial cambió. Actualizá el rating.');}
   cache.set(snapshot,payload);while(cache.size>2)cache.delete(cache.keys().next().value);return payload;
  })();inflight.set(snapshot,work);work.finally(()=>inflight.delete(snapshot)).catch(()=>{});
 }
 return finish(await inflight.get(snapshot),'computed');
}
module.exports={handler,project,stableSnapshot,fastSnapshot};
