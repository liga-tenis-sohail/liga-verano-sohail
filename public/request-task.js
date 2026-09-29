/* Sohail v5.1.1 — bounded I/O, not a retry layer and not an authorization cache.
 * The deadline includes response-body consumption. Cancelling a request never
 * means that a server-side write was rolled back. No automatic write retries.
 */
(function(root,factory){
 'use strict';const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.SohailRequest=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 function failure(code,name='Error'){return Object.assign(new Error(code),{code,name});}
 async function run(work,{timeout=15000,signal}={}){
  if(typeof work!=='function'||!Number.isFinite(timeout)||timeout<1||timeout>120000)throw failure('REQUEST_OPTIONS');
  if(signal?.aborted)throw failure('REQUEST_ABORTED','AbortError');
  const ctl=new AbortController();let rejectStop,timer;
  const stop=new Promise((_,reject)=>{rejectStop=reject;});
  const cancel=()=>{const e=failure('REQUEST_ABORTED','AbortError');rejectStop(e);ctl.abort();};
  signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>{const e=failure('REQUEST_TIMEOUT','TimeoutError');rejectStop(e);ctl.abort();},timeout);
  try{
   // Attach a rejection observer even when an adapter ignores AbortSignal.
   // A late completion is never returned after cancellation/deadline.
   let resolveJob,rejectJob;const job=new Promise((a,b)=>{resolveJob=a;rejectJob=b;});
   const settled=Promise.race([job,stop]);
   try{resolveJob(work(ctl.signal));}catch(e){rejectJob(e);}
   const result=await settled;
   if(signal?.aborted)throw failure('REQUEST_ABORTED','AbortError');
   return result;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 }
 async function json(fetcher,url,options={},control={}){
  const signal=control.signal||options.signal;
  return run(async inner=>{
   const response=await fetcher(url,{...options,signal:inner});
   if(!response||typeof response.ok!=='boolean'||typeof response.json!=='function')throw failure('REQUEST_INVALID_RESPONSE');
   let data;
   try{data=await response.json();}catch(e){
    // HTTP authorization/rate errors remain such even with a non-JSON body.
    if(!response.ok&&e?.name==='SyntaxError')data={};else throw e;
   }
   if(!data||typeof data!=='object'||Array.isArray(data))throw failure('REQUEST_INVALID_RESPONSE');
   return {response,data};
  },{...control,signal});
 }
 function stateValid(value){
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&
   Number.isSafeInteger(value._v)&&value._v>=0&&Array.isArray(value.matches)&&Array.isArray(value.cycles)&&
   !!value.users&&typeof value.users==='object'&&!Array.isArray(value.users);
 }
 function notice(host,retry){
  if(!host||!root.document)return;
  const en=root.document.documentElement.lang==='en';
  const box=root.document.createElement('div');box.className='card';box.setAttribute('role','alert');
  const text=root.document.createElement('p');text.textContent=en?
   'This section could not be loaded. Your other sections remain available. No action was confirmed by this message.':
   'No se pudo cargar esta sección. Las demás secciones siguen disponibles. Este aviso no confirma ninguna operación.';
  box.append(text);
  if(typeof retry==='function'){
   const b=root.document.createElement('button');b.type='button';b.className='btn';b.textContent=en?'Retry section':'Reintentar sección';
   b.onclick=()=>{b.disabled=true;Promise.resolve().then(retry).catch(()=>notice(host,retry));};box.append(b);
  }
  host.replaceChildren(box);
 }
 // Signals prompt a new authorized read, never assert freshness themselves.
 // No polling, no timer when idle, no reloads, no changes to draft fields.
 function watch(refresh,visible=()=>true){
  if(!root.addEventListener||!root.document)return ()=>{};
  let timer=null,stopped=false;
  const schedule=()=>{if(stopped||root.document.visibilityState==='hidden'||!visible()||timer)return;
   timer=setTimeout(()=>{timer=null;if(!stopped&&root.document.visibilityState!=='hidden'&&visible())Promise.resolve().then(refresh).catch(()=>{});},300);
  };
  const events=['online','pageshow','sohail-data-saved'];
  events.forEach(e=>root.addEventListener(e,schedule));root.document.addEventListener('visibilitychange',schedule);
  return ()=>{stopped=true;clearTimeout(timer);events.forEach(e=>root.removeEventListener(e,schedule));root.document.removeEventListener('visibilitychange',schedule);};
 }
 return Object.freeze({run,json,stateValid,notice,watch});
});
