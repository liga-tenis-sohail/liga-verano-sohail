/* Sohail: accessible operation feedback. Never retries a write or treats closing
   a notice as a rollback. Messages use textContent, not executable HTML. */
(function(root){
 'use strict';
 let serial=0,notice=null,suppressed=0;
 const seen=new Map();
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
 function button(text,handler,primary=false){const b=el('button','sop-button'+(primary?' sop-primary':''),text);b.type='button';b.addEventListener('click',()=>{Promise.resolve().then(handler).catch(e=>report(e?.message||'No se pudo completar la acción.'));});return b;}
 function dialog(title){
  const previous=document.activeElement,d=el('dialog','sop-dialog'),head=el('header','sop-head'),h=el('h2','',title),body=el('div','sop-body'),status=el('p','sop-status'),foot=el('footer','sop-foot');
  h.id='sop-title-'+(++serial);d.setAttribute('aria-labelledby',h.id);status.setAttribute('role','status');status.setAttribute('aria-live','polite');head.append(h);d.append(head,body,status,foot);document.body.append(d);
  let busy=false,closed=false,onClose=()=>{};const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  function close(){if(busy||closed)return;d.close();}
  d.addEventListener('cancel',e=>{e.preventDefault();close();});
  d.addEventListener('close',()=>{if(closed)return;closed=true;d.remove();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});onClose();});
  if(typeof d.showModal!=='function'){d.remove();document.body.style.overflow=overflow;throw Error('Actualizá el navegador para usar la revisión segura de resultados.');}
  d.showModal();
  return {dialog:d,body,status,foot,close,get closed(){return closed;},set onClose(fn){onClose=fn;},title(value){h.textContent=value;},busy(value){busy=!!value;d.setAttribute('aria-busy',String(busy));for(const n of d.querySelectorAll('button,input,select,textarea'))n.disabled=busy;}};
 }
 // SOHAIL_NETWORK_FEEDBACK_V1: error feedback is not a write retry layer.
 const budgets=new Map(),failures=[],now=()=>Date.now();
 let installedFetch=false,noticeTimer=null,recentRate=null;
 const reads=new Set(['listar','ver','misLigas','listarAdmin','nuevosAdmin','listarGrupo','nuevosGrupo','listarPlayoff','nuevosPlayoff','contarNoLeidos','duplicadosCatalogo','catalogo','jugadores']);
 const operations=new Set(['rating','history','storage','restore','identities','injuries','login-order','import-results']);
 const actions=new Set([...reads,'session-restore','session-logout','session-list','session-revoke','tutorial','leer']);
 const paths=new Set(['login','password','passkey','save','state','liga','users','login-header','audit','backup','health','notify-channels']);
 function requestInfo(input,options={}){
  let url;try{url=new URL(typeof input==='string'?input:input?.url||String(input),root.location.href);}catch(_){return {ours:false};}
  const ours=url.origin===root.location.origin&&url.pathname.startsWith('/api/');
  if(!ours)return {ours:false};
  const route=url.pathname.slice(5),method=String(options?.method||input?.method||'GET').toUpperCase();
  let body={};if(typeof options?.body==='string'){try{const b=JSON.parse(options.body);if(b&&typeof b==='object'&&!Array.isArray(b))body=b;}catch(_){}}
  const op=operations.has(url.searchParams.get('operacion'))?url.searchParams.get('operacion'):'',action=actions.has(body.accion)?body.accion:'';
  const tutorial=route==='password'&&url.searchParams.get('accion')==='tutorial';
  let write=!['GET','HEAD'].includes(method),category=write?'write':'read',label=write?'Enviar una operación':'Consultar datos';
  if(route==='login'||route==='password'||route==='passkey')category='auth';
  if(route==='backup')category='backup';
  if(route==='login'&&body.accion==='session-restore'){write=false;label='Recuperar sesión';}
  if(tutorial){write=method!=='GET';category=write?'write':'read';label=write?'Guardar preferencia del tutorial':'Consultar tutorial';}
  if(route==='liga'){
   if(!op&&reads.has(body.accion)){write=false;category='read';label=body.accion==='contarNoLeidos'?'Consultar mensajes no leídos':'Consultar información de la liga';}
   if(op==='rating'){write=false;category='heavy';label='Consultar rating';}
   if(op==='history'){write=false;category='read';label='Consultar historial';}
   if(op==='storage'){write=body.mode==='clean';category=write?'write':'read';label=write?'Limpiar almacenamiento':'Consultar almacenamiento';}
   if(op==='restore'){write=!['preview','status'].includes(body.mode);category=body.mode==='status'?'read':'heavy';label='Revisar o restaurar liga';}
   if(op==='identities'){write=!['preview','status','profile','operations'].includes(body.mode);category=['status','profile','operations'].includes(body.mode)?'read':'heavy';label='Revisar identidades';}
   if(op==='login-order'&&body.accion==='leer'){write=false;category='read';label='Consultar orden de ligas';}
   if(op==='import-results'){write=body.mode==='commit';category=write?'write':'read';label=write?'Guardar partidos importados':'Revisar importación de partidos';}
  }
  const header=options?.headers||input?.headers;
  let authenticated=false;try{authenticated=!!new Headers(header).get('authorization');}catch(_){}
  if(!authenticated&&!['auth','heavy','write'].includes(category)&&!tutorial&&!(route==='liga'&&['history','storage','restore','identities','import-results'].includes(op)))category='public';
  const safePath=paths.has(route)?'/api/'+route:'/api/(otra ruta)';
  return {ours,route:paths.has(route)?route:'other',method,path:safePath,op,action,write,category,label,managed:op==='import-results',detail:method+' '+safePath+(op?' · '+op:tutorial?' · tutorial':action?' · '+action:'')};
 }
 function retryDelay(value,fallback=30000){
  if(value==null||value==='')return fallback;
  const text=String(value).trim();
  if(/^\d+(?:\.\d+)?$/.test(text))return Math.max(1000,Math.min(3600000,Math.ceil(Number(text)*1000)));
  const date=Date.parse(text);return Number.isFinite(date)?Math.max(1000,Math.min(3600000,date-now())):fallback;
 }
 function activeBudget(category){const b=budgets.get(category);if(b&&b.until>now())return b;if(b)budgets.delete(category);return null;}
 function pause(info,response,data={}){
  const category=['public','auth','read','write','heavy','backup'].includes(data.rateCategory)?data.rateCategory:info.category;
  const delay=retryDelay(response.headers?.get?.('Retry-After')??data.retryAfter),old=activeBudget(category);
  const b=old||{category,until:0,reported:false,requestId:'',code:'REQUEST_RATE_LIMIT'};
  b.until=Math.max(b.until,now()+delay);b.requestId=String(data.requestId||response.headers?.get?.('X-Sohail-Request-Id')||b.requestId||'').slice(0,80);
  b.code=String(data.code||b.code||'REQUEST_RATE_LIMIT').slice(0,80);budgets.set(category,b);recentRate={budget:b,at:now()};return b;
 }
 function record(info,response,data){
  const row={at:new Date(now()).toISOString(),operation:info.label,request:info.detail,status:response.status,code:String(data.code||'HTTP_'+response.status).slice(0,80),reference:String(data.requestId||response.headers?.get?.('X-Sohail-Request-Id')||'').slice(0,80)};
  failures.push(row);if(failures.length>20)failures.shift();
 }
 function pending(){try{return typeof _hasPendingChanges==='function'&&_hasPendingChanges();}catch(_){return true;}}
 function report(message,options={}){
  if(suppressed&&!options.force)return null;
  const text=String(message||'No se pudo completar la operación.').slice(0,1800),code=String(options.code||'').slice(0,80),key=options.noticeKey||code+'|'+text;
  // Legacy toast/load handlers may repeat the rate message after fetch already
  // reported it. Keep one actionable notice, not a new modal per polling tick.
  if(!options.budget&&!options.force&&recentRate&&recentRate.budget.until>now()&&/demasiadas solicitudes|too many requests|la solicitud no se envi[oó]/i.test(text))return notice;
  if(!options.force&&seen.has(key)&&now()<seen.get(key))return notice;
  seen.set(key,options.budget?.until||now()+15000);if(seen.size>50)seen.delete(seen.keys().next().value);
  const d=notice&&!notice.closed?notice:dialog(options.title||'No se pudo completar la acción');notice=d;
  if(noticeTimer){clearTimeout(noticeTimer);noticeTimer=null;}
  d.title(options.title||'No se pudo completar la acción');d.body.replaceChildren();d.foot.replaceChildren();d.status.textContent='';
  d.body.append(el('p','sop-error',text));
  if(options.operation)d.body.append(el('p','sop-help','Operación: '+options.operation));
  if(options.detail)d.body.append(el('p','sop-help','Solicitud: '+options.detail));
  if(code)d.body.append(el('p','sop-help','Código: '+code));
  if(options.requestId)d.body.append(el('p','sop-help','Referencia: '+String(options.requestId).slice(0,80)));
  const help=options.rejected?'La solicitud fue rechazada antes de ejecutar la acción. Este rechazo no guardó cambios.':
   options.notSent?'Esta solicitud no se envió: sigue vigente la pausa del servidor. Este aviso no vuelve a enviarla.':
   options.write?'No se confirmó el guardado. Cerrar el aviso no deshace una petición enviada. Comprobá los datos antes de volver a guardar.':
   options.write===false?'Esta operación solo consulta datos: el aviso no indica un fallo al guardar partidos.':
   'Podés cerrar el aviso y revisar los datos. Cerrar no omite permisos ni fuerza la operación.';
  d.body.append(el('p','sop-help',help));
  d.foot.append(button('Cerrar aviso',()=>d.close()));
  if(typeof options.review==='function')d.foot.append(button('Volver a revisar',()=>{if(options.budget?.until>now())return;d.close();return options.review();},true));
  if(pending()&&typeof exportPendingChanges==='function')d.foot.append(button('Exportar cambios pendientes',()=>exportPendingChanges()));
  const reload=button('Recargar y comprobar',()=>{
   if(options.budget?.until>now())return;
   if(pending()&&!root.confirm('Hay cambios locales pendientes. Exportalos antes de recargar para no perderlos. ¿Recargar igualmente?'))return;
   root.location.reload();
  });d.foot.append(reload);
  if(options.budget){const b=options.budget;
   const tick=()=>{if(d.closed)return;const seconds=Math.max(0,Math.ceil((b.until-now())/1000));reload.disabled=seconds>0;
    reload.textContent=seconds?'Comprobar en '+seconds+' s':'Recargar y comprobar';
    d.status.textContent=seconds?'Pausa indicada por el servidor: '+seconds+' s. Las solicitudes de este tipo quedan detenidas en esta pestaña. Cerrar el aviso no elimina la pausa.':'La pausa terminó. Podés comprobar los datos; no se repitió ningún guardado desde este aviso.';
    if(seconds)noticeTimer=setTimeout(tick,1000);else noticeTimer=null;
   };tick();
  }
  d.onClose=()=>{if(notice===d){notice=null;if(noticeTimer)clearTimeout(noticeTimer);noticeTimer=null;}};return d;
 }
 function showRate(info,response,data,b){
  if(info.managed||b.reported||suppressed)return;
  b.reported=true;
  report(data.error||'El servidor aplicó una pausa temporal por demasiadas solicitudes.',{title:'Pausa temporal de solicitudes',code:data.code||'REQUEST_RATE_LIMIT',requestId:b.requestId,write:info.write,rejected:data.code==='REQUEST_RATE_LIMIT'&&!data.clientPaused,notSent:!!data.clientPaused,budget:b,noticeKey:'rate:'+b.category,operation:info.label,detail:info.detail});
 }
 function stamp(){try{return (typeof _saveSessionKey==='function'?_saveSessionKey():'')+'|'+(typeof _ligaActual==='undefined'?'':_ligaActual);}catch(_){return '';}}
 function install(){
  if(typeof root._showLoadError==='function'&&!root._showLoadError.sohailFeedback){
   const original=root._showLoadError;const wrapped=function(msg){const out=original.apply(this,arguments);report(msg,{write:/guard|save/i.test(String(msg||''))});return out;};wrapped.sohailFeedback=true;root._showLoadError=wrapped;
  }
  if(typeof root.toast==='function'&&!root.toast.sohailFeedback){
   const original=root.toast;const wrapped=function(msg){const out=original.apply(this,arguments);if(/^(?:error\b|no se pudo\b|no se puede\b|guardado no confirmado|la sesi[oó]n (?:venci[oó]|expir[oó])|failed\b|unable\b)/i.test(String(msg||'').trim()))report(msg);return out;};wrapped.sohailFeedback=true;root.toast=wrapped;
  }
  if(typeof root.fetch==='function'&&!installedFetch){
   const original=root.fetch;const wrapped=async function(input,options){
    const info=requestInfo(input,options),context=stamp(),signal=options?.signal||input?.signal;
    if(info.ours){const b=activeBudget(info.category);if(b){
     if(signal?.aborted)throw signal.reason||Object.assign(Error('Solicitud cancelada'),{name:'AbortError'});
     const seconds=Math.max(1,Math.ceil((b.until-now())/1000));
     const data={error:'La solicitud no se envió: esperá '+seconds+' segundos antes de volver a comprobar.',code:b.code,retryAfter:seconds,rateCategory:b.category,requestId:b.requestId,clientPaused:true};
     const r=new Response(JSON.stringify(data),{status:429,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(seconds),'X-Sohail-Client-Paused':'1'}});
     showRate(info,r,data,b);return r;
    }}
    try{
     const response=await original.apply(this,arguments);
     if(info.ours&&!response.ok&&context===stamp()){
      // The rate pause is installed synchronously before returning the response,
      // so polling cannot send again while a cloned body is being parsed.
      const b=response.status===429?pause(info,response):null;
      Promise.resolve().then(async()=>{let data={};try{data=await response.clone().json();}catch(_){}
       if(context!==stamp())return;record(info,response,data);
       if(b){if(data.requestId)b.requestId=String(data.requestId).slice(0,80);if(data.code)b.code=String(data.code).slice(0,80);
        if(['public','auth','read','write','heavy','backup'].includes(data.rateCategory)&&data.rateCategory!==b.category){if(budgets.get(b.category)===b)budgets.delete(b.category);b.category=data.rateCategory;budgets.set(b.category,b);}
        showRate(info,response,data,b);
       }else if(!info.managed)report(response.status>=500?'El servidor no pudo completar la operación. Revisá el estado antes de volver a enviarla.':data.error||'La operación fue rechazada por el servidor.',{code:data.code||'HTTP_'+response.status,requestId:data.requestId||response.headers?.get?.('X-Sohail-Request-Id'),write:info.write,operation:info.label,detail:info.detail});
      }).catch(()=>{});
     }
     return response;
    }catch(e){
     const cancelled=e?.name==='AbortError'||e?.code==='REQUEST_ABORTED';
     if(info.ours&&!info.managed&&context===stamp()&&(!cancelled||info.write))report('La conexión se interrumpió o venció el tiempo de espera. '+(info.write?'El guardado no está confirmado.':'No se pudieron leer los datos.'),{code:e?.code||'NETWORK_ERROR',write:info.write,operation:info.label,detail:info.detail});
     throw e;
    }
   };wrapped.sohailFeedback=true;root.fetch=wrapped;installedFetch=true;
  }
 }
 if(root.addEventListener){
  root.addEventListener('unhandledrejection',event=>{if(event.reason?.name!=='AbortError'&&event.reason?.code!=='REQUEST_ABORTED')report('Una operación de la pantalla terminó con un error inesperado. Revisá los datos antes de volver a guardar.',{code:'UNHANDLED_OPERATION',write:true});});
  root.addEventListener('error',event=>{if(event.error)report('Hubo un error inesperado en la pantalla. No se confirmó ninguna operación con este aviso.',{code:'SCREEN_ERROR'});});
 }
 root.SohailFeedback=Object.freeze({el,button,dialog,report,install,requestInfo,retryDelay,diagnostics:()=>failures.map(x=>({...x})),waitMs:category=>Math.max(0,(activeBudget(category)?.until||0)-now()),async quiet(fn){suppressed++;try{return await fn();}finally{suppressed--;}}});install();
})(typeof window!=='undefined'?window:globalThis);
