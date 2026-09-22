'use strict';
// Sporting identity is separate from the authentication principal (jugadorId).
// Names in match/draw records are immutable aliases; no historical record is deleted.
const O=require('./_operations'),lib=require('./_lib');
const forbidden=new Set(['pass','password','pass_hash','role','isAdmin','inactive','jugadorId','historialId','historialNombre','_credentialId','identityRef','passwordDefault','key','id','name','actualizado','created_at','updated_at','perfilUnificado','perfilAlternativas']);
const notEmpty=v=>v!==undefined&&v!==null&&(typeof v!=='string'||v.trim()!=='')&&(!Array.isArray(v)||v.length>0)&&(!O.object(v)||Object.keys(v).length>0);
function refKey(ref){
 if(!O.object(ref))throw new O.AppError(400,'INVALID_REFERENCE','Falta identificar la ficha.');
 if(ref.type==='league'&&lib.ligaIdOK(ref.ligaId)&&typeof ref.name==='string'&&ref.name.trim()&&ref.name.length<=120&&!['admin','superadmin','__proto__','constructor','prototype'].includes(ref.name))return JSON.stringify(['league',ref.ligaId,ref.name]);
 if(ref.type==='catalog'&&typeof ref.id==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(ref.id))return JSON.stringify(['catalog',ref.id]);
 throw new O.AppError(400,'INVALID_REFERENCE','Referencia de jugador inválida.');
}
const pairKey=(a,b)=>JSON.stringify([typeof a==='string'?a:refKey(a),typeof b==='string'?b:refKey(b)].sort());
const binding=r=>r.ref.type==='catalog'?'g:'+r.ref.id:lib.principalKey(r.ref.name,r.user);
function decisionApplies(d,records){return Array.isArray(d.keys)&&d.keys.every(k=>{const r=records.find(r=>r.key===k);return !!r&&(!d.bindings||d.bindings[k]===binding(r));});}
function effective(rec,reg){return rec.user?.historialId||(rec.jugadorId&&reg.data.links?.[JSON.stringify(['catalog',rec.jugadorId])])||rec.jugadorId||'';}
function fields(record){
 const out={};for(const [k,v]of Object.entries(record.user||{})){
  if(forbidden.has(k)||k.startsWith('_')||record.ref.type==='catalog'&&k==='nombre')continue;
  out[k]=O.clone(v);
 }
 return out;
}
// Merge objects recursively, union arrays, keep zero/false and every non-empty variant.
// Choice values are indexes into server-derived alternatives, never arbitrary data.
function mergeFields(sources,choices={}){
 const alternatives={};
 function walk(values,path){
  const nonempty=values.filter(x=>notEmpty(x.value));
  if(!nonempty.length)return values.find(x=>x.value!==undefined)?.value;
  if(nonempty.every(x=>O.object(x.value))){
   const out={};for(const k of [...new Set(nonempty.flatMap(x=>Object.keys(x.value)))].sort()){
    const v=walk(nonempty.filter(x=>O.own(x.value,k)).map(x=>({value:x.value[k],from:x.from})),path.concat(k));if(v!==undefined)out[k]=v;
   }return out;
  }
  if(nonempty.every(x=>Array.isArray(x.value))){const map=new Map();for(const x of nonempty)for(const v of x.value)map.set(O.stable(v),O.clone(v));return [...map.values()];}
  const valuesByKey=new Map();for(const x of nonempty){const key=O.stable(x.value);if(!valuesByKey.has(key))valuesByKey.set(key,{value:O.clone(x.value),from:[]});valuesByKey.get(key).from.push(x.from);}
  const variants=[...valuesByKey.values()],key=JSON.stringify(path);
  if(variants.length>1)alternatives[key]={path,values:variants};
  const index=O.own(choices,key)?choices[key]:0;
  if(!Number.isSafeInteger(index)||index<0||index>=variants.length)throw new O.AppError(400,'INVALID_CHOICE','La elección de campo no es válida. Volvé a revisar.');
  return O.clone(variants[index].value);
 }
 const merged=walk(sources.map(x=>({value:x.fields,from:x.label})),[])||{};
 for(const k of Object.keys(choices))if(!O.own(alternatives,k))throw new O.AppError(400,'INVALID_CHOICE','La selección contiene un campo desconocido.');
 return {fields:merged,alternatives};
}
async function universe(ctx,reg){
 const index=await lib.readLigaIndex(),states=new Map(),records=[];
 // Paginate even with a server-side row cap. An incomplete read is not an empty league.
 const all=await O.tableRows('liga_state','id,data');
 for(const row of all){
  const entry=index.find(x=>x.id===row.id);if(!entry)continue;
  const state=typeof row.data==='string'?JSON.parse(row.data):row.data;
  if(!O.object(state)||!O.object(state.users))throw new O.AppError(503,'INVALID_STORED_STATE','Hay un estado de liga ilegible. No se modificó nada.');
  states.set(row.id,{state,entry});
  for(const [name,u]of Object.entries(state.users)){
   if(['admin','superadmin'].includes(name)||!O.object(u)||u.role==='superadmin')continue;
   const ref={type:'league',ligaId:row.id,name},key=refKey(ref);
   const rec={ref,key,name,source:'league',leagueId:row.id,leagueName:entry.nombre,estado:entry.estado,user:u,jugadorId:u.jugadorId||'',editable:O.authorised(ctx,state)};
   rec.sportId=effective(rec,reg);records.push(rec);
  }
 }
 const catalog=await O.tableRows('jugadores','*');
 for(const j of catalog){
  if(!j||typeof j.id!=='string'||typeof j.nombre!=='string')throw new O.AppError(503,'INVALID_CATALOG','El catálogo tiene datos ilegibles.');
  if(['admin','superadmin'].includes(j.nombre)||j.role==='superadmin')continue;
  const ref={type:'catalog',id:j.id},rec={ref,key:refKey(ref),name:j.nombre,source:'catalog',leagueName:'Catálogo global',user:j,jugadorId:j.id,editable:ctx.superadmin};
  rec.sportId=effective(rec,reg);records.push(rec);
 }
 return {index,states,records};
}
function pick(universe,ref){const key=refKey(ref),rec=universe.records.find(r=>r.key===key);if(!rec)throw new O.AppError(404,'PROFILE_NOT_FOUND','Una ficha ya no existe. Volvé a abrir la revisión.');return rec;}
function expand(universe,selected,reg){
 const keys=new Set(selected.map(r=>r.key)),ids=new Set(selected.map(r=>r.sportId).filter(Boolean));
 return universe.records.filter(r=>keys.has(r.key)||(r.sportId&&ids.has(r.sportId)));
}
function requireEditable(ctx,records,universe){
 // Sharing a catalogue account affects every league using it. Local admins never
 // gain permission in a foreign league simply because a spelling happens to match.
 if(!ctx.superadmin&&records.some(r=>r.ref.type==='catalog'))throw new O.AppError(403,'GLOBAL_IDENTITY_REQUIRED','Esta fusión afecta al catálogo global. Debe confirmarla el superadministrador.');
 for(const r of records)if(r.ref.type==='league')O.requireAdmin(ctx,universe.states.get(r.leagueId)?.state);
}
function planMerge(ctx,universe,reg,refs,choices={},kind='merge'){
 if(!Array.isArray(refs)||refs.length!==2)throw new O.AppError(400,'INVALID_REFERENCE','Elegí exactamente dos fichas.');
 const selected=refs.map(r=>pick(universe,r));
 if(selected[0].key===selected[1].key||selected[0].sportId&&selected[0].sportId===selected[1].sportId)throw new O.AppError(409,'ALREADY_LINKED','Las fichas ya pertenecen a la misma identidad deportiva.');
 const members=expand(universe,selected,reg);requireEditable(ctx,members,universe);
 const memberKeys=new Set(members.map(r=>r.key));
 for(const decision of Object.values(reg.data.decisions||{}))if(decision.status==='distinct'&&decisionApplies(decision,members)&&decision.keys.every(k=>memberKeys.has(k)))throw new O.AppError(409,'DISTINCT_PLAYERS','Estas fichas están marcadas como personas distintas. Reabrí esa decisión antes de fusionar.');
 const priorIds=[...new Set(selected.map(r=>r.sportId).filter(id=>reg.data.profiles?.[id]))];
 const canonical=priorIds[0]||'sport_'+O.digest({keys:selected.map(r=>r.key).sort()}).slice(0,24);
 const bySource=new Map();
 // Current values first. Prior variants remain retained, even after a later edit.
 for(const r of [selected[0],...members.filter(r=>r.key!==selected[0].key)]){
  const f=fields(r),key=r.key+':'+O.digest(f);bySource.set(key,{key:r.key,label:r.name+' · '+r.leagueName,fields:f});
 }
 for(const id of priorIds)for(const s of reg.data.profiles[id].sources||[])bySource.set(s.key+':'+O.digest(s.fields),O.clone(s));
 const sources=[...bySource.values()],merged=mergeFields(sources,choices),nextReg=O.clone(reg.data);
 const label=reg.data.profiles?.[selected[0].sportId]?.name||selected[0].name;
 const aliases=[...new Set([...members.map(r=>r.name),...priorIds.flatMap(id=>reg.data.profiles[id].aliases||[])])];
 const allKeys=new Set([...members.map(r=>r.key),...priorIds.flatMap(id=>reg.data.profiles[id].members||[])]);
 for(const [key,id] of Object.entries(nextReg.links||{}))if(priorIds.includes(id))allKeys.add(key);
 nextReg.links||={};nextReg.profiles||={};nextReg.decisions||={};
 for(const key of allKeys)nextReg.links[key]=canonical;
 const profile={id:canonical,name:label,aliases,members:[...allKeys].sort(),fields:merged.fields,alternatives:merged.alternatives,sources};
 nextReg.profiles[canonical]=profile;
 for(const id of priorIds)if(id!==canonical)nextReg.profiles[id]={...nextReg.profiles[id],mergedInto:canonical};
 nextReg.decisions[pairKey(selected[0].key,selected[1].key)]={status:'merged',keys:selected.map(r=>r.key).sort(),profile:canonical};
 const states=[];let matchCount=0;
 for(const [id,{state,entry}] of universe.states){
  const names=new Set(members.filter(r=>r.leagueId===id).map(r=>r.ref.name));if(!names.size)continue;
  const next=O.clone(state);
  // Prevent an invalid merge turning a real match into a player against themselves.
  for(const m of state.matches||[]){const ps=m.po?m.poNames:[m.aName,m.bName];if(!Array.isArray(ps))continue;
   if(ps.length===2&&ps.every(n=>names.has(n))&&ps[0]!==ps[1])throw new O.AppError(409,'SELF_MATCH','Las fichas jugaron entre sí en '+entry.nombre+' (partido '+m.id+'). Revisá ese resultado antes de afirmar que son la misma persona.');
   if(ps.some(n=>names.has(n)))matchCount++;
  }
  for(const name of names){
   const u=next.users[name];Object.assign(u,O.clone(merged.fields));u.historialId=canonical;u.historialNombre=label;
   // No name/key/role/inactivity/credential changes. Their complete source values
   // remain in the private profile sources and the transactional prior snapshot.
  }
  states.push({id,expected:state._v||0,data:next,write:true});
 }
 const summary={profileId:canonical,name:label,aliases,members:members.length,leagues:states.map(s=>({id:s.id,name:universe.states.get(s.id).entry.nombre})),matches:matchCount,conflicts:Object.keys(merged.alternatives).length};
 return {states,newRegistry:nextReg,summary,profile:{name:label,fields:merged.fields,alternatives:merged.alternatives,aliases},kind};
}
function planDecision(ctx,universe,reg,refs,status){
 if(!Array.isArray(refs)||refs.length!==2||!['distinct','later','review'].includes(status))throw new O.AppError(400,'INVALID_DECISION','Decisión inválida.');
 const selected=refs.map(r=>pick(universe,r));
 if(selected[0].key===selected[1].key)throw new O.AppError(400,'INVALID_DECISION','Elegí dos fichas distintas.');
 // Marking a pair does not alter the profiles; admins need at least one own league
 // record, while global catalogue-vs-catalogue decisions belong to superadmin.
 if(!ctx.superadmin&&!selected.some(r=>r.ref.type==='league'&&r.editable))throw new O.AppError(403,'FORBIDDEN','No administrás ninguna de las fichas de esta decisión.');
 if(selected[0].sportId&&selected[0].sportId===selected[1].sportId)throw new O.AppError(409,'ALREADY_LINKED','Ya están vinculadas. Deshacé la fusión antes de marcarlas como distintas.');
 const newRegistry=O.clone(reg.data);newRegistry.decisions||={};
 const key=pairKey(selected[0].key,selected[1].key);
 if(status==='review')delete newRegistry.decisions[key];else newRegistry.decisions[key]={keys:selected.map(r=>r.key).sort(),bindings:Object.fromEntries(selected.map(r=>[r.key,binding(r)])),status};
 return {states:[],newRegistry,summary:{status,pair:key}};
}
function annotateState(state,id,reg){
 for(const [name,u]of Object.entries(state.users||{})){
  const key=JSON.stringify(['league',id,name]),catKey=u.jugadorId&&JSON.stringify(['catalog',u.jugadorId]);
  const sport=u.historialId||(catKey&&reg.data.links?.[catKey]);
  if(sport){u.historialId=sport;u.historialNombre=reg.data.profiles?.[sport]?.name||name;}
 }
 return state;
}
module.exports={binding,decisionApplies,refKey,pairKey,effective,mergeFields,universe,pick,expand,planMerge,planDecision,annotateState};
