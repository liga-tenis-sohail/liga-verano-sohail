/* Sohail v4.3 — shared, explicit-save ordering of the public archive list. */
(function(root){
 'use strict';
 const doc=root.document,O=root.SohailLeagueOrder;
 if(!doc||!O)return;
 let active=null;
 const dictionary={
  es:{title:'Orden de ligas anteriores en el login',intro:'Elegí cómo aparecen las ligas cerradas para todos los visitantes. No cambia las ligas activas, las fechas ni los resultados.',open:'Reorganizar ligas cerradas',loading:'Cargando el orden guardado…',save:'Guardar orden',saving:'Guardando…',discard:'Descartar cambios',reload:'Volver a cargar',close:'Cerrar editor',up:'Subir',down:'Bajar',first:'Al principio',last:'Al final',empty:'Todavía no hay ligas cerradas.',clean:'Este es el orden publicado.',dirty:'Tenés cambios sin guardar. El login no cambia hasta que guardes.',saved:'Orden guardado. Ya se aplica al volver a cargar el login.',failed:'No se pudo leer el orden. Probá de nuevo.',uncertain:'No se pudo confirmar el guardado. Volvé a cargar el orden antes de reintentar: el servidor podría haberlo recibido.',confirm:'Hay cambios sin guardar. ¿Descartarlos y volver a cargar?',moved:'Posición',of:'de',session:'La sesión cambió. Volvé a abrir esta herramienta.',same:'No hay cambios para guardar.'},
  en:{title:'Past-league order on the sign-in page',intro:'Choose how closed leagues appear to all visitors. Active leagues, dates and results do not change.',open:'Reorder closed leagues',loading:'Loading saved order…',save:'Save order',saving:'Saving…',discard:'Discard changes',reload:'Reload',close:'Close editor',up:'Move up',down:'Move down',first:'Move to first',last:'Move to last',empty:'There are no closed leagues yet.',clean:'This is the published order.',dirty:'You have unsaved changes. The sign-in page changes only after you save.',saved:'Order saved. It applies when the sign-in page is reloaded.',failed:'The order could not be loaded. Try again.',uncertain:'The save could not be confirmed. Reload the order before retrying: the server may have received it.',confirm:'There are unsaved changes. Discard them and reload?',moved:'Position',of:'of',session:'Your session changed. Reopen this tool.',same:'There are no changes to save.'}
 };
 const text=k=>dictionary[typeof LANG!=='undefined'&&LANG==='en'?'en':'es'][k];
 function authView(){return typeof _token==='string'&&!!_token&&typeof currentUser!=='undefined'&&currentUser&&
   (['admin','superadmin'].includes(currentUser.role)||currentUser.isAdmin===true)&&!(typeof _ligaReadOnly!=='undefined'&&_ligaReadOnly);}
 function sessionKey(){return authView()?[_token,currentUser.key||currentUser.name,typeof _ligaActual==='undefined'?'':_ligaActual].join('\n'):null;}
 function el(tag,cls,content){const node=doc.createElement(tag);if(cls)node.className=cls;if(content!==undefined)node.textContent=content;return node;}
 function button(label,fn,cls='btn'){const b=el('button',cls,label);b.type='button';b.addEventListener('click',fn);return b;}
 function mount(host){
  if(!host)return;
  if(active)active.destroy();
  host.replaceChildren();host.hidden=!authView();if(!authView()){active=null;return;}
  const key=sessionKey();let disposed=false,serial=0,controller=null,leagues=[],ids=[],saved=[],version=0,busy=false,uncertain=false,opened=false;
  const valid=()=>!disposed&&host.isConnected&&sessionKey()===key;
  const dirty=()=>JSON.stringify(ids)!==JSON.stringify(saved);
  const section=el('section','lo-panel');section.setAttribute('aria-labelledby','lo-title');
  const title=el('h3','lo-title',text('title'));title.id='lo-title';
  section.append(title,el('p','lo-intro',text('intro')));
  const editor=el('div','lo-editor');editor.hidden=true;
  const status=el('p','lo-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const error=el('p','lo-error');error.setAttribute('role','alert');error.hidden=true;
  const list=el('ol','lo-list');list.setAttribute('aria-label',text('title'));
  const tools=el('div','lo-tools');
  const save=button(text('save'),saveOrder,'btn btn-primary'),discard=button(text('discard'),()=>{if(busy||!valid())return;ids=saved.slice();uncertain=false;error.hidden=true;render();});
  const reload=button(text('reload'),()=>{if(busy)return;if(dirty()&&!root.confirm(text('confirm')))return;load();});
  const close=button(text('close'),()=>{if(busy)return;if(dirty()&&!root.confirm(text('confirm')))return;editor.hidden=true;open.hidden=false;opened=false;});
  const open=button(text('open'),()=>{opened=true;editor.hidden=false;open.hidden=true;load();});
  tools.append(save,discard,reload,close);editor.append(status,error,list,tools);section.append(open,editor);host.append(section);
  function controls(){
   const n=ids.length;
   save.disabled=busy||uncertain||!dirty()||!n;save.textContent=text(busy?'saving':'save');
   discard.disabled=busy||uncertain||!dirty();reload.disabled=busy;close.disabled=busy;
   list.querySelectorAll('button').forEach(b=>{const i=ids.indexOf(b.dataset.league);b.disabled=busy||uncertain||((b.dataset.move==='up'||b.dataset.move==='first')?i===0:i===n-1);});
   section.setAttribute('aria-busy',String(busy));
  }
  function render(message,focus){
   list.replaceChildren();
   const map=new Map(leagues.map(l=>[l.id,l]));
   ids.forEach((id,i)=>{
    const row=el('li','lo-row');row.dataset.league=id;
    const number=el('span','lo-number',String(i+1));number.setAttribute('aria-hidden','true');
    const copy=el('div','lo-copy'),name=el('strong','',map.get(id)?.nombre||id);
    copy.append(name,el('small','',text('moved')+' '+(i+1)+' '+text('of')+' '+ids.length));
    const actions=el('div','lo-moves');
    for(const [move,symbol,target]of [['first','⇈',0],['up','↑',i-1],['down','↓',i+1],['last','⇊',ids.length-1]]){
     const b=button(symbol+' '+text(move),()=>{
      if(busy||uncertain||!valid())return;
      ids=O.move(ids,id,target);error.hidden=true;
      render(name.textContent+': '+text('moved')+' '+(ids.indexOf(id)+1)+' '+text('of')+' '+ids.length+'. '+text(dirty()?'dirty':'clean'),{id,move});
     });
     b.dataset.league=id;b.dataset.move=move;b.setAttribute('aria-label',text(move)+': '+name.textContent);actions.append(b);
    }
    row.append(number,copy,actions);list.append(row);
   });
   status.textContent=message||text(ids.length?(dirty()?'dirty':'clean'):'empty');controls();
   if(focus){const buttons=[...list.querySelectorAll('button')].filter(b=>b.dataset.league===focus.id);const b=buttons.find(b=>b.dataset.move===focus.move&&!b.disabled)||buttons.find(b=>!b.disabled);b?.focus({preventScroll:true});}
  }
  async function request(body){
   const token=typeof _token==='string'?_token:'';
   const r=await fetch('/api/liga?operacion=login-order',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),signal:controller.signal});
   const d=await r.json();
   if(!r.ok||!d.ok)throw Object.assign(new Error(d.error||text('failed')),{code:d.code,status:r.status});
   return d;
  }
  async function load(){
   if(!valid())return;
   controller?.abort();controller=new AbortController();const generation=++serial;
   busy=true;uncertain=true;error.hidden=true;status.textContent=text('loading');controls();
   const timerController=controller;const timer=setTimeout(()=>timerController.abort(),20000);
   try{
    const d=await request({accion:'leer'});
    if(!valid()||generation!==serial)return;
    if(!Array.isArray(d.ligas)||!Number.isSafeInteger(d.version)||d.version<0||d.ligas.some(l=>!l||typeof l.id!=='string')||new Set(d.ligas.map(l=>l.id)).size!==d.ligas.length)throw Error(text('failed'));
    leagues=d.ligas;ids=leagues.map(l=>l.id);saved=ids.slice();version=d.version;uncertain=false;render();
   }catch(e){if(valid()&&generation===serial){error.textContent=e.message||text('failed');error.hidden=false;status.textContent='';}}
   finally{clearTimeout(timer);if(valid()&&generation===serial){busy=false;controls();}}
  }
  async function saveOrder(){
   if(busy||uncertain||!dirty())return;if(!valid()){error.textContent=text('session');error.hidden=false;return;}
   controller=new AbortController();const generation=++serial,submitted=ids.slice();busy=true;error.hidden=true;controls();
   const timerController=controller;const timer=setTimeout(()=>timerController.abort(),25000);
   try{
    const d=await request({accion:'guardar',version,ids:submitted});
    if(!valid()||generation!==serial)return;
    if(!Number.isSafeInteger(d.version)||!Array.isArray(d.ids)||JSON.stringify(d.ids)!==JSON.stringify(submitted))throw Error(text('uncertain'));
    version=d.version;saved=submitted;ids=submitted.slice();uncertain=false;render(text('saved'));
    // Do not poll or reload the login's users. Update only its archive projection.
    if(typeof cargarLigasPasadas==='function')cargarLigasPasadas(O.apply(leagues,submitted),valid);
   }catch(e){if(valid()&&generation===serial){uncertain=true;error.textContent=e.status&&e.status<500?e.message:text('uncertain');error.hidden=false;status.textContent=text('dirty');}}
   finally{clearTimeout(timer);if(valid()&&generation===serial){busy=false;controls();}}
  }
  const unload=e=>{if(opened&&dirty()&&valid()){e.preventDefault();e.returnValue='';}};
  root.addEventListener('beforeunload',unload);
  active={destroy(){disposed=true;serial++;controller?.abort();root.removeEventListener('beforeunload',unload);}};
 }
 root.SohailLoginLeagueOrder=Object.freeze({mount});
})(window);
