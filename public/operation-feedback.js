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
 function pending(){try{return typeof _hasPendingChanges==='function'&&_hasPendingChanges();}catch(_){return true;}}
 function report(message,options={}){
  if(suppressed&&!options.force)return null;
  const text=String(message||'No se pudo completar la operación.').slice(0,1800),code=String(options.code||'').slice(0,80),key=code+'|'+text;
  const now=Date.now();if(!options.force&&seen.has(key)&&now-seen.get(key)<15000)return notice;
  seen.set(key,now);if(seen.size>50)seen.delete(seen.keys().next().value);
  if(notice&&!notice.closed){notice.status.textContent=text;return notice;}
  const d=dialog(options.title||'No se pudo completar la acción');notice=d;
  d.body.append(el('p','sop-error',text));
  if(code)d.body.append(el('p','sop-help','Código: '+code));
  if(options.requestId)d.body.append(el('p','sop-help','Referencia: '+String(options.requestId).slice(0,80)));
  d.body.append(el('p','sop-help',options.write?'No se confirmó el guardado. Cerrar este aviso no deshace una petición enviada. Comprobá los datos antes de volver a guardar.':'Podés cerrar el aviso y revisar los datos. Continuar no omite permisos ni fuerza la operación.'));
  d.foot.append(button('Cerrar aviso',()=>d.close()));
  if(typeof options.review==='function')d.foot.append(button('Volver a revisar',()=>{d.close();return options.review();},true));
  if(pending()&&typeof exportPendingChanges==='function')d.foot.append(button('Exportar cambios pendientes',()=>exportPendingChanges()));
  d.foot.append(button('Recargar y comprobar',()=>{
   if(pending()&&!root.confirm('Hay cambios locales pendientes. Exportalos antes de recargar para no perderlos. ¿Recargar igualmente?'))return;
   root.location.reload();
  }));
  d.onClose=()=>{if(notice===d)notice=null;};return d;
 }
 function stamp(){try{return (typeof _saveSessionKey==='function'?_saveSessionKey():'')+'|'+(typeof _ligaActual==='undefined'?'':_ligaActual);}catch(_){return '';}}
 function install(){
  if(typeof root._showLoadError==='function'&&!root._showLoadError.sohailFeedback){
   const original=root._showLoadError;const wrapped=function(msg){const out=original.apply(this,arguments);report(msg,{write:/guard|save/i.test(String(msg||''))});return out;};wrapped.sohailFeedback=true;root._showLoadError=wrapped;
  }
  if(typeof root.toast==='function'&&!root.toast.sohailFeedback){
   const original=root.toast;const wrapped=function(msg){const out=original.apply(this,arguments);if(/^(?:error\b|no se pudo\b|no se puede\b|guardado no confirmado|la sesi[oó]n (?:venci[oó]|expir[oó])|failed\b|unable\b)/i.test(String(msg||'').trim()))report(msg);return out;};wrapped.sohailFeedback=true;root.toast=wrapped;
  }
  if(typeof root.fetch==='function'&&!root.fetch.sohailFeedback){
   const original=root.fetch;const wrapped=async function(input,options){
    let url;try{url=new URL(typeof input==='string'?input:input.url,root.location.href);}catch(_){}
    const ours=url&&url.origin===root.location.origin&&url.pathname.startsWith('/api/');
    const managed=ours&&url.searchParams.get('operacion')==='import-results';
    const context=stamp(),write=String(options?.method||input?.method||'GET').toUpperCase()!=='GET';
    try{
     const response=await original.apply(this,arguments);
     if(ours&&!managed&&!response.ok&&context===stamp()){
      // Read a clone, preserving the original response for existing handlers.
      Promise.resolve().then(async()=>{let data={};try{data=await response.clone().json();}catch(_){}
       if(context!==stamp())return;
       report(response.status>=500?'El servidor no pudo confirmar la operación. Revisá el estado antes de volver a enviarla.':data.error||'La operación fue rechazada por el servidor.',{code:data.code||'HTTP_'+response.status,requestId:data.requestId,write});
      }).catch(()=>{});
     }
     return response;
    }catch(e){if(ours&&!managed&&context===stamp())report('La conexión se interrumpió o venció el tiempo de espera. '+(write?'El guardado no está confirmado.':'No se pudieron leer los datos.'),{code:e?.code||'NETWORK_ERROR',write});throw e;}
   };wrapped.sohailFeedback=true;root.fetch=wrapped;
  }
 }
 if(root.addEventListener){
  root.addEventListener('unhandledrejection',()=>report('Una operación de la pantalla terminó con un error inesperado. Revisá los datos antes de volver a guardar.',{code:'UNHANDLED_OPERATION',write:true}));
  root.addEventListener('error',event=>{if(event.error)report('Hubo un error inesperado en la pantalla. No se confirmó ninguna operación con este aviso.',{code:'SCREEN_ERROR'});});
 }
 root.SohailFeedback=Object.freeze({el,button,dialog,report,install,async quiet(fn){suppressed++;try{return await fn();}finally{suppressed--;}}});install();
})(typeof window!=='undefined'?window:globalThis);
