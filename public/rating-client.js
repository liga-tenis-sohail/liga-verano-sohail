/* No localStorage, sessionStorage, credentials in logs, or optimistic ratings.
   One in-flight complete snapshot per session; errors retain only the last
   complete snapshot of that SAME session and are shown to the user. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SohailRatingClient=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function create({getToken,fetcher,clock=()=>Date.now(),timeout=45000,ttl=120000}){
  let scope=null,cache=null,error=null,pending=null,controller=null,epoch=0,loaded=0;
  const token=()=>String(getToken()||'');
  function sync(){const now=token();if(now!==scope){scope=now;epoch++;controller?.abort();controller=null;pending=null;cache=null;error=null;loaded=0;}return now;}
  function peek(){sync();return {data:cache,error,busy:!!pending,stale:!!cache&&(!!error||clock()-loaded>ttl)};}
  function valid(d){return d&&d.complete===true&&d.window===50&&d.version==='sohail-rating-4.6.0'&&typeof d.snapshot==='string'&&d.info&&typeof d.info==='object'&&d.byLeague&&Array.isArray(d.leagues);}
  async function request(body,signal,key){
   const headers={'Content-Type':'application/json'};if(key)headers.Authorization='Bearer '+key;
   const r=await fetcher('/api/liga?operacion=rating',{method:'POST',headers,body:JSON.stringify(body),cache:'no-store',signal});
   const d=await r.json();if(!r.ok)throw Object.assign(new Error(d?.error||'No se pudo completar el rating.'),{status:r.status,code:d?.code});return d;
  }
  function load(force=false){
   const key=sync();if(pending)return pending;
   if(cache&&!force&&clock()-loaded<ttl&&!error)return Promise.resolve(cache);
   const started=epoch;controller=new AbortController();const ctl=controller;
   const timer=setTimeout(()=>ctl.abort(),timeout);
   const work=(async()=>{
    try{
     const d=await request({},ctl.signal,key);
     if(started!==epoch||token()!==key)return null;
     if(!valid(d))throw new Error('Respuesta incompleta o versión de rating incompatible.');
     cache=d;error=null;loaded=clock();return cache;
    }catch(e){
     if(started!==epoch||token()!==key)return null;
     error={message:e.name==='AbortError'?'La lectura tardó demasiado. Se conserva el cálculo completo anterior.':e.message,code:e.code||'RATING_UNAVAILABLE',status:e.status||0};
     if(e.status===401||e.status===403)cache=null;
     return cache;
    }finally{clearTimeout(timer);if(started===epoch){pending=null;controller=null;}}
   })();
   pending=work;return work;
  }
  async function details(playerKey,snapshot){
   const key=sync(),started=epoch,ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
   try{const d=await request({playerKey,snapshot},ctl.signal,key);if(started!==epoch||token()!==key)throw Error('La sesión cambió.');return d;}finally{clearTimeout(timer);}
  }
  function clear(){epoch++;controller?.abort();controller=null;pending=null;cache=null;error=null;loaded=0;}
  return Object.freeze({peek,load,details,clear});
 }
 return Object.freeze({create});
});
