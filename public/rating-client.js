/* Sohail v5.1.1 — fresh checked reads; no stale-on-error or positive auth cache.
 * Concurrent callers share ONLY a pending request. No automatic retries.
 */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.SohailRatingClient=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const requests=()=>typeof module==='object'&&module.exports&&typeof require==='function'?require('./request-task'):root.SohailRequest;
 const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
 function valid(d){
  if(!object(d)||d.complete!==true||d.window!==50||d.version!=='sohail-rating-4.6.0'||typeof d.snapshot!=='string'||!d.snapshot||!object(d.info)||!object(d.byLeague)||!Array.isArray(d.leagues))return false;
  if(!d.leagues.every(l=>object(l)&&typeof l.id==='string'))return false;
  for(const info of Object.values(d.info)){
   if(!object(info)||!['ratingCalculado','prior','effectiveMatches'].every(k=>Number.isFinite(info[k]))||!Number.isInteger(info.partidos)||info.partidos<0||info.partidos>50)return false;
   if(info.ratingCalculado<0.01||info.ratingCalculado>16)return false;
   for(const k of ['pctGames','nivelRivales'])if(info[k]!=null&&!Number.isFinite(info[k]))return false;
  }
  return Object.values(d.byLeague).every(l=>object(l)&&Object.values(l).every(k=>typeof k==='string'&&Object.prototype.hasOwnProperty.call(d.info,k)));
 }
 function create({getToken,fetcher,clock=()=>Date.now(),timeout=45000,ttl=120000,getLanguage=()=> 'es'}){
  let scope=null,cache=null,error=null,pending=null,controller=null,epoch=0,loaded=0,detailController=null,retryAt=0;
  const token=()=>String(getToken()||'');
  function clear(){epoch++;controller?.abort();detailController?.abort();controller=null;detailController=null;pending=null;cache=null;error=null;loaded=0;retryAt=0;}
  function sync(){const now=token();if(now!==scope){clear();scope=now;}return now;}
  function peek(){sync();const expired=!!cache&&clock()-loaded>=ttl;return {data:expired?null:cache,error,busy:!!pending,stale:expired,retryAt};}
  async function request(body,signal,key){
   const headers={'Content-Type':'application/json'};if(key)headers.Authorization='Bearer '+key;
   const {response:r,data:d}=await requests().json(fetcher,'/api/liga?operacion=rating',{method:'POST',headers,body:JSON.stringify(body),cache:'no-store'},{signal,timeout});
   if(!r.ok){const value=r.headers?.get?.('Retry-After'),seconds=Number(value);throw Object.assign(new Error('RATING_UNAVAILABLE'),{status:r.status,code:d?.code,retryAfter:Number.isFinite(seconds)&&seconds>0?seconds*1000:0});}
   return d;
  }
  function load(force=false){
   const key=sync();if(pending)return pending;
   // A previous answer is never evidence of current freshness. Server-side
   // derived caches still avoid recalculation after checking sporting versions.
   if(retryAt>clock())return Promise.resolve(null);
   const started=epoch,ctl=new AbortController();controller=ctl;cache=null;error=null;
   const work=(async()=>{
    try{
     const d=await request({},ctl.signal,key);
     if(started!==epoch||token()!==key)return null;
     if(!valid(d))throw Object.assign(new Error('Invalid rating response'),{code:'RATING_INVALID_RESPONSE'});
     cache=d;error=null;loaded=clock();retryAt=0;return cache;
    }catch(e){
     if(started!==epoch||token()!==key)return null;
     const en=getLanguage()==='en';
     error={message:en?'The rating could not be verified. Retry; no previous or partial rating is shown.':'No se pudo comprobar el rating. Reintentá; no se muestra un cálculo anterior ni parcial.',code:e.code||'RATING_UNAVAILABLE',status:e.status||0};
     cache=null;
     if(e.status===429){retryAt=clock()+Math.max(1000,e.retryAfter||30000);error.message=en?'Too many requests. Wait before retrying.':'Demasiadas solicitudes. Esperá antes de reintentar.';}
     return null;
    }finally{if(started===epoch){pending=null;controller=null;}}
   })();pending=work;return work;
  }
  async function details(playerKey,snapshot){
   const key=sync(),started=epoch,ctl=new AbortController();detailController?.abort();detailController=ctl;
   try{
    const d=await request({playerKey,snapshot},ctl.signal,key);
    if(started!==epoch||token()!==key)throw Object.assign(new Error('Session changed'),{code:'REQUEST_ABORTED'});
    if(d.snapshot!==snapshot||!Array.isArray(d.selected)||!Array.isArray(d.leagues))throw Object.assign(new Error('Invalid detail response'),{code:'RATING_INVALID_RESPONSE'});
    return d;
   }finally{if(detailController===ctl)detailController=null;}
  }
  return Object.freeze({peek,load,details,clear});
 }
 return Object.freeze({create,valid});
});
