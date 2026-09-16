/* Sohail v3.7 — lectura deportiva entre ligas. No escribe ni cambia de sesión.
   Usa exclusivamente listar/ver y GET state (NUNCA elegir=1). La identidad
   entre temporadas se resuelve por jugadorId, no por similitud de nombres.
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
 const pid=u=>u&&typeof u.jugadorId==='string'&&u.jugadorId.trim()?u.jugadorId:null;
 const names=m=>m?.po?(Array.isArray(m.poNames)?m.poNames.slice(0,2):[]):[m?.aName,m?.bName];
 const fields=['id','po','cycle','g','sets','club','date','status','wo','np','winner','retiroDe','poNames','aName','bName','tLabel','which'];
 function recordKey(leagueId,m,index){return JSON.stringify([leagueId,m.id==null?'row:'+index:'id:'+String(m.id)]);}
 function uniqueIndex(rows,current){
  if(!Array.isArray(rows))throw new Error('invalid-index');
  const map=new Map();
  for(const row of rows){
   if(!row||!validId(row.id))throw new Error('invalid-index');
   // All retained editions, not just estado === activa.
   if(!map.has(row.id))map.set(row.id,{id:row.id,nombre:String(row.nombre||row.id),estado:String(row.estado||'')});
  }
  if(!map.has(current.id))map.set(current.id,{id:current.id,nombre:current.nombre||current.id,estado:current.estado||''});
  return Array.from(map.values());
 }
 function project(state,entry,target,{current=false}={}){
  if(!state||typeof state!=='object'||!Array.isArray(state.matches))throw new Error('invalid-state');
  const users=state.users&&typeof state.users==='object'?state.users:{},aliases=new Set(),issues=[];
  if(current)aliases.add(target.name);
  else if(target.id){
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
   Object.assign(out,{_mhKey:key,_mhLeagueId:entry.id,_mhLeagueName:entry.nombre||entry.id,_mhLeagueState:entry.estado||'',_mhSubject:found[0]});
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
 async function collect({current,name,token,signal,fetcher}){
  const target={name,id:pid(current.users?.[name])};
  if(!validId(current.id)||!name)throw new Error('invalid-context');
  const d=await jsonRequest(fetcher,'/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'listar'})},signal);
  const index=uniqueIndex(d.ligas,current),out={records:[],leagues:[],issues:[],total:index.length,linked:!!target.id};
  const others=index.filter(l=>l.id!==current.id);let cursor=0;
  // A global link is required; guessing by name can join two real people.
  if(!target.id){out.issues.push({reason:'no-global-id'});return out;}
  async function worker(){
   while(cursor<others.length){
    const entry=others[cursor++];if(signal?.aborted)throw new Error('aborted');
    try{
     let state;
     if(entry.estado==='finalizada'){
      const response=await jsonRequest(fetcher,'/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'ver',id:entry.id})},signal);state=response.estado;
     }else{
      const response=await jsonRequest(fetcher,'/api/state?liga='+encodeURIComponent(entry.id),{headers:{Authorization:'Bearer '+token}},signal);state=response.state;
     }
     const p=project(state,entry,target);
     out.records.push(...p.records);out.leagues.push({...entry,count:p.records.length});
     p.issues.forEach(reason=>out.issues.push({id:entry.id,name:entry.nombre,reason}));
    }catch(err){
     if(signal?.aborted)throw err;
     out.issues.push({id:entry.id,name:entry.nombre,reason:err.status===403?'unavailable':'read-error'});
    }
   }
  }
  await Promise.all(Array.from({length:Math.min(3,others.length)},worker));
  if(signal?.aborted)throw new Error('aborted');
  // Output order does not depend on network timing.
  out.leagues.sort((a,b)=>a.id.localeCompare(b.id));return out;
 }
 function createController({current,name,token,valid,fetcher}){
  let data=null,error=false,busy=false,controller=null,seq=0;
  async function load(){
   if(busy)return false;
   if(!valid())return false;
   const mine=++seq;controller=new AbortController();busy=true;error=false;
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
   return {records:p.records.concat(remote.filter(m=>m._mhLeagueId!==c.id)),issues:[...p.issues.map(reason=>({id:c.id,name:c.nombre,reason})),...(data?.issues||[])],leagues:[{id:c.id,nombre:c.nombre,count:p.records.length},...(data?.leagues||[]).filter(l=>l.id!==c.id)],total:data?.total||1,ready:!!data,error,busy};
  }
  return Object.freeze({load,snapshot,cancel:()=>{seq++;controller?.abort();busy=false;data=null;error=false;}});
 }
 return Object.freeze({validId,uniqueIndex,project,collect,createController,recordKey});
});
