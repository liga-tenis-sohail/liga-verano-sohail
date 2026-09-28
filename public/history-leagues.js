/* Sohail v3.9.8 — lectura deportiva entre ligas activas y archivadas. No escribe ni cambia de sesión.
   Usa una proyección deportiva del servidor (NUNCA elegir=1). La identidad
   entre temporadas se resuelve por historialId (o jugadorId sin fusión), nunca por parecido del nombre.
   No se guardan estados, credenciales ni historiales en localStorage. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.SohailLeagueHistory=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const validId=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,63}$/.test(v);
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
 const pid=u=>{const id=u?.historialId||u?.jugadorId;return typeof id==='string'&&id.trim()?id:null;};
 const names=m=>m?.po?(Array.isArray(m.poNames)?m.poNames.slice():[]):[m?.aName,m?.bName];
 const fields=['id','po','cycle','g','sets','club','date','status','wo','np','npReason','injurySide','winner','retiroDe','poNames','aName','bName','tLabel','which'];
 function recordKey(leagueId,m,index){return JSON.stringify([leagueId,m.id==null?'row:'+index:'id:'+String(m.id)]);}
 function uniqueIndex(rows,current){
  if(!Array.isArray(rows))throw new Error('invalid-index');
  const map=new Map();
  for(const row of rows){
   if(!row||!validId(row.id))throw new Error('invalid-index');
   // All retained editions, not just estado === activa.
   if(!map.has(row.id))map.set(row.id,{id:row.id,nombre:String(row.nombre||row.id),estado:String(row.estado||''),orden:Number.isFinite(row.orden)?row.orden:null});
  }
  if(!map.has(current.id))map.set(current.id,{id:current.id,nombre:current.nombre||current.id,estado:current.estado||''});
  return Array.from(map.values()).sort((a,b)=>(b.orden??-Infinity)-(a.orden??-Infinity)||0);
 }
 function project(state,entry,target,{current=false}={}){
  if(!state||typeof state!=='object'||!Array.isArray(state.matches))throw new Error('invalid-state');
  const users=state.users&&typeof state.users==='object'?state.users:{},aliases=new Set(),issues=[];
  if(current)aliases.add(target.name);
  if(target.id){
   for(const [name,user]of Object.entries(users))if(pid(user)===target.id){
    aliases.add(name);
    // Match names normally use the users key. Accept the display name only
    // when no other user owns it; never join two catalog identities.
    if(typeof user.name==='string'&&(!own(users,user.name)||pid(users[user.name])===target.id))aliases.add(user.name);
   }
  }
  // An equal name with a different ID is NOT the same person. Missing IDs,
  // on the other hand, leave an unresolved legacy link that must be visible.
  const legacyName=state.matches.some(m=>names(m).includes(target.name));
  if(!current&&legacyName&&!aliases.has(target.name)&&(!own(users,target.name)||!pid(users[target.name])))issues.push('unlinked');
  const byKey=new Map(),conflicts=new Set();
  state.matches.forEach((m,i)=>{
   if(!m||typeof m!=='object')return;
   const ns=names(m),found=ns.filter(n=>aliases.has(n));
   if(!found.length)return;
   if(ns.length!==2||ns.some(n=>typeof n!=='string'||!n)||found.length!==1){issues.push('ambiguous');return;}
   const out={};for(const k of fields)if(own(m,k)&&m[k]!==undefined)out[k]=JSON.parse(JSON.stringify(m[k]));
   const key=recordKey(entry.id,m,i),signature=JSON.stringify(out);
   if(byKey.has(key)){
    if(byKey.get(key).signature!==signature){conflicts.add(key);issues.push('duplicate-conflict');}
    return;
   }
   Object.assign(out,{_mhKey:key,_mhLeagueId:entry.id,_mhLeagueName:entry.nombre||entry.id,_mhLeagueState:entry.estado||'',_mhSubject:found[0],_mhPlayerIds:ns.map(n=>pid(users[n]))});
   byKey.set(key,{signature,record:out});
  });
  return {records:Array.from(byKey).filter(([k])=>!conflicts.has(k)).map(([,v])=>v.record),issues:Array.from(new Set(issues))};
 }
 async function jsonRequest(fetcher,url,options,signal){
  const controller=new AbortController(),abort=()=>controller.abort();
  if(signal?.aborted)throw new Error('aborted');
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,12000);
  try{
   const r=await fetcher(url,{...options,cache:'no-store',signal:controller.signal});
   if(!r.ok){const err=new Error('http-'+r.status);err.status=r.status;throw err;}
   const data=await r.json();if(!data||typeof data!=='object')throw new Error('invalid-response');return data;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 const memory=new Map();let cacheToken=null;
 function clearCache(){memory.clear();cacheToken=null;}
 async function collect({current,name,token,signal,fetcher}){
  const id=pid(current.users?.[name]);if(!validId(current.id)||!name)throw new Error('invalid-context');
  if(!id)return {records:[],leagues:[],index:uniqueIndex([],current),issues:[{reason:'no-global-id'}],total:1,linked:false};
  if(cacheToken!==token){memory.clear();cacheToken=token;}
  const key=JSON.stringify([current.id,id,name]),cached=memory.get(key);
  const body={name,id,currentId:current.id};if(cached)body.signature=cached.signature;
  const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
  const d=await jsonRequest(fetcher,'/api/liga?operacion=history',{method:'POST',headers,body:JSON.stringify(body)},signal);
  if(signal?.aborted)throw new Error('aborted');
  if(d.complete!==true||typeof d.signature!=='string')throw new Error('incomplete-history');
  if(d.notModified){if(!cached||cached.signature!==d.signature)throw new Error('invalid-cache');return structuredClone(cached);}
  if(!Array.isArray(d.records)||!Array.isArray(d.index)||!Array.isArray(d.leagues)||!Array.isArray(d.issues))throw new Error('invalid-history');
  if(cacheToken===token&&JSON.stringify(d).length<1000000){memory.set(key,structuredClone(d));while(memory.size>8)memory.delete(memory.keys().next().value);}
  return d;
 }
 function createController({current,name,token,valid,fetcher}){
  let data=null,error=false,busy=false,attempted=false,controller=null,seq=0;
  async function load(){
   if(busy)return false;
   if(!valid())return false;
   const mine=++seq;controller=new AbortController();busy=true;error=false;attempted=true;
   try{
    const value=await collect({current:current(),name,token:token(),signal:controller.signal,fetcher});
    if(mine!==seq||!valid())return false;
    data=value;return true;
   }catch(_){if(mine===seq&&valid()){data=null;error=true;}return false;}
   finally{if(mine===seq)busy=false;}
  }
  function snapshot(){
   const c=current(),p=project({users:c.users,matches:c.matches},c,{name,id:pid(c.users?.[name])},{current:true});
   const remote=data?.records||[];
   return {records:p.records.concat(remote.filter(m=>m._mhLeagueId!==c.id)),issues:[...p.issues.map(reason=>({id:c.id,name:c.nombre,reason})),...(data?.issues||[])],index:data?.index||[{id:c.id,nombre:c.nombre,estado:c.estado||''}],leagues:[{id:c.id,nombre:c.nombre,estado:c.estado||'',cycles:c.cycles||[],count:p.records.length},...(data?.leagues||[]).filter(l=>l.id!==c.id)],total:data?.total||1,ready:!!data,error,busy,attempted};
  }
  return Object.freeze({load,snapshot,cancel:()=>{seq++;controller?.abort();busy=false;data=null;error=false;attempted=false;}});
 }
 function selectScope(snapshot,scope,currentId){
  if(!snapshot||scope==='all')return snapshot;
  const id=scope==='current'?currentId:scope.startsWith('league:')?scope.slice(7):'';
  if(!validId(id))throw new Error('invalid-league-scope');
  const leagues=snapshot.leagues.filter(l=>l.id===id);
  return {...snapshot,records:snapshot.records.filter(m=>m._mhLeagueId===id),leagues,total:1,
   issues:snapshot.issues.filter(i=>!i.id||i.id===id),unavailable:snapshot.ready&&!leagues.length};
 }
 return Object.freeze({validId,uniqueIndex,project,collect,createController,recordKey,selectScope,clearCache});
});
