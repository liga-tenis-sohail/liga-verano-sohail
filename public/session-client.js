/* Sohail v4.6 — persistent 24-hour login, with a server-only HttpOnly cookie.
 * Storage holds ONLY two non-sensitive booleans, never a token, user or password.
 * Restored data is accepted only after the server rechecks the account and role.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else {
  const storage=()=>{try{return root.localStorage;}catch(_){return null;}};
  const en=()=>document.documentElement.lang==='en';
  function translate(){
   const el=document.getElementById('session-note');if(el)el.textContent=en()?
    'Stay signed in for 24 hours on this browser. Sign out on shared devices. Clearing cookies or using private browsing can end the session sooner.':
    'La sesión se conserva 24 horas en este navegador. Salí al terminar en dispositivos compartidos. Borrar cookies o usar navegación privada puede cerrarla antes.';
  }
  const client=api.create({storage:storage(),fetcher:(...args)=>fetch(...args),
   accept:d=>{
    if(typeof cancelLoginInitialization==='function')cancelLoginInitialization();
    _ligaReadOnly=false;_sinLigasActivas=false;_sessionExpiring=false;
    const ok=entrarConToken(d);if(ok&&d.mustChangePw)forcePwChange(null);return ok;
   },
   busy:value=>{if(typeof setLoginBusy==='function')setLoginBusy(value);},
   getToken:()=>typeof _token==='string'?_token:'',
   error:()=>{const el=document.getElementById('login-err');if(el){el.textContent=en()?'Could not restore your session. Retry by reloading or sign in again.':'No se pudo recuperar la sesión. Recargá para reintentar o ingresá nuevamente.';el.style.display='block';}}
  });
  root.SohailSession={...client,expiry:api.expiry,translate};translate();
  new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  root.addEventListener('storage',event=>{
   if(event.key===api.DISABLED&&event.newValue==='1'){
    client.cancel();
    if(typeof currentUser!=='undefined'&&currentUser)doLogout();
   }
  });
 }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const HINT='sohail-session-present-v1',DISABLED='sohail-session-disabled-v1';
 function create({fetcher,storage=null,accept=()=>true,busy=()=>{},error=()=>{},timeout=15000,getToken=()=>''}){
  let generation=0,controller=null,pending=null,logoutPending=Promise.resolve({ok:true});
  const get=k=>{try{return storage?.getItem(k)??null;}catch(_){return null;}};
  const put=(k,v)=>{try{if(v==null)storage?.removeItem(k);else storage?.setItem(k,v);}catch(_){}};
  function enable(){put(DISABLED,null);put(HINT,'1');}
  function cancel(){generation++;controller?.abort();controller=null;pending=null;}
  async function request(action,signal){
   const res=await fetcher('/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Sohail-Session':'1',...(action==='session-logout'&&getToken()?{Authorization:'Bearer '+getToken()}:{})},
    credentials:'same-origin',cache:'no-store',body:JSON.stringify({accion:action}),signal,keepalive:action==='session-logout'});
   const data=await res.json();
   if(!res.ok){if(res.status===401&&action==='session-resume')return {authenticated:false};throw new Error(data.code||'SESSION_UNAVAILABLE');}
   return data;
  }
  function logout(){
   cancel();put(DISABLED,'1');put(HINT,null);
   const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
   logoutPending=request('session-logout',ctl.signal).catch(()=>({ok:false,code:'LOGOUT_UNCONFIRMED'})).finally(()=>clearTimeout(timer));
   return logoutPending;
  }
  async function beforeLogin(){cancel();let last=await logoutPending;if(last?.ok===false){last=await logout();if(!last?.ok)throw new Error('LOGOUT_UNCONFIRMED');}}
  function restore(){
   if(pending)return pending;
   // Existing deployments need one fresh login to create the HttpOnly cookie.
   // The hint avoids adding a network request to the ordinary guest login.
   if(get(DISABLED)==='1'||storage&&get(HINT)!=='1')return Promise.resolve(false);
   const version=generation,ctl=new AbortController();controller=ctl;busy(true);
   const timer=setTimeout(()=>ctl.abort(),timeout);
   pending=(async()=>{
    try{
     const data=await request('session-resume',ctl.signal);
     if(version!==generation||get(DISABLED)==='1')return false;
     if(!data.authenticated){put(HINT,null);return false;}
     if(!data.token||!data.state||!data.name||!data.ligaId)throw new Error('INCOMPLETE_SESSION');
     const ok=await accept(data);if(ok)enable();return !!ok;
    }catch(e){if(version===generation)error(e);return false;}
    finally{clearTimeout(timer);if(version===generation){pending=null;controller=null;busy(false);}}
   })();
   return pending;
  }
  return Object.freeze({enable,cancel,logout,beforeLogin,restore});
 }
 // Decoding is for expiry UX ONLY. It is not authentication or signature checking.
 function expiry(token){try{const raw=token.split('.')[0].replace(/-/g,'+').replace(/_/g,'/'),p=JSON.parse(atob(raw));return Number.isSafeInteger(p.exp)?p.exp:null;}catch(_){return null;}}
 return Object.freeze({create,expiry,HINT,DISABLED});
});
