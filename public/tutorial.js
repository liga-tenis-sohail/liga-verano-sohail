// Recorrido guiado v2.4. Reutiliza las pantallas y la API del tutorial existente.
// La navegación se representa en una copia temporal del DOM: los formularios
// originales (incluidos los inputs de contraseña/archivo) no se destruyen.
// No escribe resultados, no marca mensajes como leídos ni cambia el contador del reset.
let _tutorialBusy=false,_tutorialRecord=null,_tutorialStep=0,_tutorialSeenSession='';
let _tutorialTour=null,_tutorialRequest=0;

function isTutorialRunning(){return !!_tutorialTour;}
function tutorialHasUnsavedState(){return !!(_tutorialTour&&_tutorialTour.unsavedBefore);}
function _guideSameSession(tour){
 return !!tour&&!!_token&&!!currentUser&&tour.key===_saveSessionKey()&&tour.liga===_ligaActual;
}
function _guideClone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function _guideAvailableSteps(){
 const admin=esAdmin(currentUser),steps=['intro'];
 if(cycles.some(c=>c&&Array.isArray(c.groups)&&c.groups.length))steps.push('groups');
 steps.push('standings');
 if(RATING_ON)steps.push('rating');
 steps.push('results','pending');
 if(playoff.started||(playoff.preview&&admin))steps.push('playoffs');
 steps.push('messages');
 if(typeof REGLAMENTO==='string'&&REGLAMENTO.trim()||admin)steps.push('rules');
 if(admin)steps.push('admin');
 steps.push('profile');return steps;
}
// Mantener esta función pública: la usan la navegación y las pruebas del tutorial.
function _tutorialSteps(){return _tutorialTour?_tutorialTour.steps:_guideAvailableSteps();}
function _guideOtherDialog(){
 return !!document.getElementById('_pwforce')||!!document.querySelector('#modal-bg.open,.cm-ov');
}
function _guideWriteInProgress(){
 return (typeof _saveInFlight!=='undefined'&&!!_saveInFlight)||
  (typeof _saving!=='undefined'&&_saving)||(typeof _prioritySave!=='undefined'&&_prioritySave)||
  (typeof _resultSubmitting!=='undefined'&&_resultSubmitting);
}
async function maybeShowTutorial(manual){
 if(_tutorialTour){document.getElementById('guide-title')?.focus({preventScroll:true});return;}
 if(!_token||!currentUser||_ligaReadOnly||!_loadOK||_guideOtherDialog()||_tutorialBusy)return;
 if(_guideWriteInProgress()){if(manual)toast(t('tour_wait_save'));return;}
 const key=_saveSessionKey(),liga=_ligaActual,request=++_tutorialRequest;
 if(!manual&&_tutorialSeenSession===key)return;
 _tutorialBusy=true;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch('/api/password?accion=tutorial',{headers:{Authorization:'Bearer '+_token},cache:'no-store',signal:controller.signal});
  const d=await r.json();
  if(request!==_tutorialRequest||key!==_saveSessionKey()||liga!==_ligaActual||!currentUser||_guideOtherDialog())return;
  if(!r.ok||!Number.isSafeInteger(d.version)||!Number.isSafeInteger(d.epoch))throw new Error('guide');
  if(_guideWriteInProgress()){if(manual)toast(t('tour_wait_save'));return;}
  _tutorialRecord=d;
  if(!manual&&!d.pending){_tutorialSeenSession=key;return;}
  _tutorialStep=0;_guideBegin(key,liga);_tutorialSeenSession=key;renderTutorial();
 }catch(_){
  if(_tutorialTour&&_tutorialTour.key===key)_guideClose(false);
  if(manual&&key===_saveSessionKey())toast(t('guide_load_error'));
 }finally{clearTimeout(timeout);if(request===_tutorialRequest)_tutorialBusy=false;}
}
function _guideBegin(key,liga){
 const original=document.getElementById('main-app');
 if(!original||getComputedStyle(original).display==='none')throw new Error('No active app');
 const preview=original.cloneNode(true);
 const tour={key,liga,original,preview,steps:_guideAvailableSteps(),lang:LANG,unsavedBefore:_serialize()!==_lastSaved,bodyScroll:[document.body.scrollTop,document.body.scrollLeft],
  focus:document.activeElement,scrollX:window.scrollX,scrollY:window.scrollY,
  inert:[],frame:0,stepId:'',lastLang:'',observer:null,timer:null,
  nav:{viewCycle,subView,selGroup,formClub,poContext,adminMode,_formCycleN},
  refs:{cycles,matches,playoff,DESTINO,PUNTOS,AJUSTES_PUNTOS,ALLNAMES},
  msg:{sub:_msgSubTab,last:_msgLastId,group:_msgGrupoCtx,tramo:_msgTramoCtx,
   level:_msgExplorarNivel1,explore:_msgExplorarCtx,image:_msgImagenPendiente,poll:!!_msgPollTimer},
  rulesEdit:_rgEdit,
  innerScroll:Array.from(original.querySelectorAll('*')).filter(e=>e.scrollTop||e.scrollLeft).map(e=>[e,e.scrollTop,e.scrollLeft])};
 // Evita que los renderers legacy (ensureDestino, viewT, _autoJumped) conviertan
 // la visita guiada en una edición. Se conservan las referencias originales.
 _tutorialTour=tour;
 cycles=_guideClone(cycles);matches=_guideClone(matches);playoff=_guideClone(playoff);
 DESTINO=_guideClone(DESTINO);PUNTOS=_guideClone(PUNTOS);AJUSTES_PUNTOS=_guideClone(AJUSTES_PUNTOS);ALLNAMES=ALLNAMES.slice();
 _msgLastId={..._msgLastId};_rgEdit=false;poContext=null;
 detenerPollingMensajes();
 original.replaceWith(preview);preview.dataset.guidePreview='true';
 document.body.classList.add('sohail-tour-active');
 const ov=document.createElement('div');ov.id='sohail-guide';ov.className='guide-overlay guide-tour';
 ov._previousFocus=tour.focus;
 const ring=document.createElement('div');ring.id='guide-spotlight';ring.className='guide-spotlight';ring.setAttribute('aria-hidden','true');
 ov.appendChild(ring);document.body.appendChild(ov);
 // La pantalla se ve, pero solo se puede actuar en los controles de la guía.
 for(const element of document.body.children){
  if(element===ov||['SCRIPT','STYLE','LINK'].includes(element.tagName))continue;
  tour.inert.push([element,element.hasAttribute('inert')]);element.setAttribute('inert','');
 }
 ov.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();finishTutorial('skipped');}
  else if(e.key==='Tab')trapDialogFocus(e,ov);
 });
 tour.layout=()=>_guideScheduleLayout();
 window.addEventListener('resize',tour.layout,{passive:true});
 window.addEventListener('scroll',tour.layout,{passive:true,capture:true});
 if(window.visualViewport){visualViewport.addEventListener('resize',tour.layout,{passive:true});visualViewport.addEventListener('scroll',tour.layout,{passive:true});}
 tour.observer=new MutationObserver(()=>{
  if(!_guideSameSession(tour)||!document.getElementById('sohail-guide')||document.getElementById('_pwforce'))_guideClose(false);
  else _guideScheduleLayout();
 });
 tour.observer.observe(document.body,{childList:true,subtree:true});
 // También detecta expiración o cambio de cuenta aunque no haya un cambio DOM.
 tour.timer=setInterval(()=>{if(!_guideSameSession(tour))_guideClose(false);},1000);
}
function _guideGroupCycle(){
 const usable=cycles.filter(c=>c&&Array.isArray(c.groups)&&c.groups.length);
 return usable.find(c=>c.n===activeN)?.n||usable.at(-1)?.n||activeN;
}
function _guideNavigate(step){
 const tour=_tutorialTour;if(!_guideSameSession(tour))return;
 // Exclusivamente navegación/render. No se simulan clics de guardar/confirmar.
 if(step==='intro'){
  renderShell();updateHdr();
 }else if(step==='groups')viewCyc(_guideGroupCycle());
 else if(step==='playoffs')viewCyc('po');
 else{
  if(step==='results'||step==='pending'||step==='messages')viewCycle=playoff.started?'po':_guideGroupCycle();
  const views={standings:'general',rating:'rating',results:'cargar',pending:'pendientes',messages:'mensajes',rules:'reglamento',admin:'admin',profile:'perfil'};
  showSub(views[step]);renderCycleBar();
 }
 if(typeof applyStaticTranslations==='function')applyStaticTranslations();
 tour.preview.querySelectorAll('.view-fade').forEach(e=>e.classList.remove('view-fade'));
}
function _guideTarget(step){
 const selectors={intro:'.app-sticky-nav',groups:'#view-grupos .grp-card',standings:'#view-general .gen-table',rating:'#view-rating .rt-table',
  results:'#names-score-wrap',pending:'#view-pendientes .card',playoffs:'#view-playoff .po-bracket-outer',
  messages:'#view-mensajes .msg-card .tabs',rules:'#view-reglamento .card',admin:'#view-admin .card',profile:'#view-perfil .prof-row'};
 let el=document.querySelector(selectors[step]);
 if(step==='profile'&&el)el=el.closest('.card')||el;
 if(!el||!el.getClientRects().length){
  const views={groups:'grupos',standings:'general',rating:'rating',results:'cargar',pending:'pendientes',playoffs:'playoff',messages:'mensajes',rules:'reglamento',admin:'admin',profile:'perfil'};
  el=document.getElementById('view-'+views[step])||document.querySelector('.app-sticky-nav');
 }
 return el;
}
function _guideGo(delta){
 if(!_tutorialTour||_tutorialBusy)return;
 _tutorialStep=Math.max(0,Math.min(_tutorialSteps().length-1,_tutorialStep+delta));renderTutorial();
}
function renderTutorial(translate){
 const tour=_tutorialTour;if(!tour||!_guideSameSession(tour))return;
 const ov=document.getElementById('sohail-guide');if(!ov){_guideClose(false);return;}
 const step=tour.steps[_tutorialStep],changed=tour.stepId!==step||tour.lastLang!==LANG;
 const focusId=ov.contains(document.activeElement)?document.activeElement.id:'';
 if(changed){
  try{_guideNavigate(step);tour.stepId=step;tour.lastLang=LANG;tour.viewError=false;}
  catch(_){tour.viewError=true;}
 }
 ov.dataset.step=step;
 ov.querySelector('.guide-dialog')?.remove();
 const dialog=document.createElement('section');dialog.className='guide-dialog guide-tour-dialog';dialog.lang=LANG;
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','guide-title');dialog.setAttribute('aria-describedby','guide-copy');
 const header=document.createElement('div');header.className='guide-tour-header';
 const label=document.createElement('p');label.className='guide-tour-label';label.textContent=t('tour_label');
 const language=createDialogLanguageSwitcher('guide-language');header.append(label,language);
 const content=document.createElement('div');content.className='guide-tour-content';
 const progress=document.createElement('p');progress.className='guide-progress';progress.textContent=tf('guide_progress',{n:_tutorialStep+1,total:tour.steps.length});
 const title=document.createElement('h2');title.id='guide-title';title.tabIndex=-1;title.textContent=t('tour_'+step+'_title');
 const copy=document.createElement('p');copy.id='guide-copy';copy.className='guide-copy';copy.textContent=t('tour_'+step+'_body');
 const error=document.createElement('p');error.id='guide-error';error.setAttribute('role','status');error.textContent=tour.viewError?t('tour_view_error'):'';
 content.append(progress,title,copy,error);
 const footer=document.createElement('div');footer.className='guide-tour-footer';
 const track=document.createElement('div');track.className='guide-tour-track';track.setAttribute('aria-hidden','true');
 tour.steps.forEach((_,i)=>{const bar=document.createElement('span');bar.className=i<=_tutorialStep?'is-done':'';track.appendChild(bar);});
 const actions=document.createElement('div');actions.className='guide-actions';
 const make=(id,key,fn,primary)=>{const b=document.createElement('button');b.type='button';b.id=id;b.className='btn'+(primary?' btn-primary':'');b.textContent=t(key);b.onclick=fn;return b;};
 actions.appendChild(make('guide-skip','guide_skip',()=>finishTutorial('skipped')));
 if(_tutorialStep>0)actions.appendChild(make('guide-back','guide_back',()=>_guideGo(-1)));
 const last=_tutorialStep===tour.steps.length-1;
 actions.appendChild(make('guide-next',last?'guide_finish':'guide_next',()=>last?finishTutorial('completed'):_guideGo(1),true));
 footer.append(track,actions);dialog.append(header,content,footer);ov.appendChild(dialog);
 if(ov.dataset.saving==='true')dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
 if(changed&&!translate)_guideScrollToTarget(step);
 _guideLayout();
 const focused=focusId.startsWith('guide-language-')?document.getElementById(focusId):title;
 if(focused&&!focused.disabled)focused.focus({preventScroll:true});
}
function _guideScrollToTarget(step){
 const target=_guideTarget(step);if(!target)return;
 const nav=document.querySelector('.app-sticky-nav');
 // scrollIntoView también resuelve el contenedor body de la hoja CSS legacy.
 const short=(window.visualViewport?.height||innerHeight)<700;
 const inset=step==='intro'||short?18:Math.min(190,(nav?.getBoundingClientRect().height||0)+22);
 target.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});
 const top=Math.max(0,window.scrollY+target.getBoundingClientRect().top-inset);
 window.scrollTo({top,left:0,behavior:'instant'});
 if(target.getBoundingClientRect().top<inset&&document.body.scrollTop>0)document.body.scrollTop=Math.max(0,document.body.scrollTop-inset);
 const tab=document.getElementById('tab-'+(step==='playoffs'?'po':subView));
 if(tab?.parentElement){const bar=tab.parentElement;bar.scrollLeft=Math.max(0,tab.offsetLeft-bar.clientWidth/2+tab.clientWidth/2);}
}
function _guideScheduleLayout(){
 const tour=_tutorialTour;if(!tour||tour.frame)return;
 tour.frame=requestAnimationFrame(()=>{if(_tutorialTour!==tour)return;tour.frame=0;_guideLayout();});
}
function _guideLayout(){
 const tour=_tutorialTour;if(!tour)return;
 const ov=document.getElementById('sohail-guide'),dialog=ov?.querySelector('.guide-dialog'),ring=document.getElementById('guide-spotlight');
 if(!dialog||!ring)return;
 const vv=window.visualViewport,w=vv?.width||innerWidth,h=vv?.height||innerHeight,x=vv?.offsetLeft||0,y=vv?.offsetTop||0;
 const mobile=w<760,margin=mobile?10:22,gap=mobile?10:14;
 const width=Math.min(mobile?Math.max(280,w-20):400,w-20);
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 dialog.style.width=width+'px';dialog.style.maxHeight=Math.max(180,h*(mobile?0.5:0.72))+'px';
 const dh=dialog.getBoundingClientRect().height;
 const fallbackX=clamp(x+w-width-margin,x+margin,x+w-width-margin);
 const fallbackY=clamp(y+h-dh-margin,y+margin,y+h-dh-margin);
 let dx=fallbackX,dy=fallbackY,placement='floating';
 const target=_guideTarget(tour.steps[_tutorialStep]);
 if(target&&target.getClientRects().length){
  const r=target.getBoundingClientRect();
  const pad=6;
  let left=Math.max(x+8,r.left-pad),top=Math.max(y+8,r.top-pad),right=Math.min(x+w-8,r.right+pad),bottom=Math.min(y+h-8,r.bottom+pad);
  const tW=right-left,tH=bottom-top;
  const large=tW>w*(mobile?0.86:0.55)||tH>h*(mobile?0.28:0.4);
  const rightSpace=x+w-right-gap-margin,leftSpace=left-x-gap-margin,belowSpace=y+h-bottom-gap-margin,aboveSpace=top-y-gap-margin;
  const centeredX=clamp(left+tW/2-width/2,x+margin,x+w-width-margin);
  const alignedLeft=clamp(left,x+margin,x+w-width-margin);
  if(mobile){
   if(!large&&belowSpace>=dh){placement='bottom';dx=alignedLeft;dy=bottom+gap;}
   else if(!large&&aboveSpace>=dh){placement='top';dx=alignedLeft;dy=top-dh-gap;}
   else {placement='side-center';dx=clamp(x+w-width-margin,x+margin,x+w-width-margin);dy=clamp(top+tH/2-dh/2,y+margin,y+h-dh-margin);}
  }else{
   if(rightSpace>=width){placement='right';dx=right+gap;dy=clamp(top+tH/2-dh/2,y+margin,y+h-dh-margin);}
   else if(leftSpace>=width){placement='left';dx=left-width-gap;dy=clamp(top+tH/2-dh/2,y+margin,y+h-dh-margin);}
   else if(!large&&belowSpace>=dh){placement='bottom';dx=centeredX;dy=bottom+gap;}
   else if(!large&&aboveSpace>=dh){placement='top';dx=centeredX;dy=top-dh-gap;}
   else {placement='side-center';dx=clamp(x+w-width-margin,x+margin,x+w-width-margin);dy=clamp(top+tH/2-dh/2,y+margin,y+h-dh-margin);}
  }
  dialog.dataset.placement=placement;
  // Posición final del panel
  dx=clamp(dx,x+margin,x+w-width-margin);dy=clamp(dy,y+margin,y+h-dh-margin);
  dialog.style.left=dx+'px';dialog.style.top=dy+'px';
  // Highlight: evita superposición fuerte con el panel cuando haga falta.
  if(right>dx&&left<dx+width&&bottom>dy&&top<dy+dh){
   if(placement==='right')right=Math.min(right,dx-gap);
   else if(placement==='left')left=Math.max(left,dx+width+gap);
   else if(placement==='bottom')bottom=Math.min(bottom,dy-gap);
   else if(placement==='top')top=Math.max(top,dy+dh+gap);
   else if(dy>top+tH/2)bottom=Math.min(bottom,dy-gap);
   else top=Math.max(top,dy+dh+gap);
  }
  if(bottom-top<24||right-left<24){
   ring.hidden=true;ov.classList.add('guide-tour-no-target');return;
  }
  ring.hidden=false;ov.classList.remove('guide-tour-no-target');
  Object.assign(ring.style,{left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
  return;
 }
 dialog.dataset.placement='floating';
 dialog.style.left=dx+'px';dialog.style.top=dy+'px';
 ring.hidden=true;ov.classList.add('guide-tour-no-target');
}
// Traduce la pantalla de origen al volver sin perder entradas locales. Los
// nodos de archivo/contenteditable se conservan; nunca se registran sus valores.
function _guideTranslateRestoredView(){
 const root=document.getElementById('main-app');if(!root)return;
 const fields=Array.from(root.querySelectorAll('input[id],select[id],textarea[id],[contenteditable="true"][id]')).map(el=>({
  id:el.id,el,value:el.value,checked:el.checked,selected:el instanceof HTMLSelectElement?Array.from(el.selectedOptions).map(o=>({value:o.value,text:o.textContent})):null,
  editable:el.isContentEditable,top:el.scrollTop,left:el.scrollLeft}));
 const displays=['s3-row','ret-panel','wo-panel'].map(id=>[id,document.getElementById(id)?.style.display]);
 const form={formClub,poContext,_formCycleN};
 try{
  if(viewCycle==='po'&&(subView==='po'||subView==='playoff')){renderShell();showPlayoffView();updateLangUI();}
  else renderAll();
  applyStaticTranslations();
 }finally{
  formClub=form.formClub;poContext=form.poContext;_formCycleN=form._formCycleN;
  fields.forEach(f=>{const el=document.getElementById(f.id);if(!el)return;
   if(f.editable||f.el.type==='file'){if(el!==f.el)el.replaceWith(f.el);return;}
   if(f.selected){
    f.selected.forEach(s=>{if(!Array.from(el.options).some(o=>o.value===s.value))el.add(new Option(s.text,s.value));});
    Array.from(el.options).forEach(o=>{o.selected=f.selected.some(s=>s.value===o.value);});
   }else if(f.value!==undefined)el.value=f.value;
   if(f.checked!==undefined)el.checked=f.checked;el.scrollTop=f.top;el.scrollLeft=f.left;
  });
  displays.forEach(([id,value])=>{const el=document.getElementById(id);if(el&&value!==undefined)el.style.display=value;});
  if(document.getElementById('club-pick'))renderClubButtons();
 }
}
function _guideClose(restoreFocus){
 const tour=_tutorialTour;if(!tour)return;
 const same=_guideSameSession(tour);
 tour.observer?.disconnect();clearInterval(tour.timer);cancelAnimationFrame(tour.frame);
 window.removeEventListener('resize',tour.layout);window.removeEventListener('scroll',tour.layout,true);
 if(window.visualViewport){visualViewport.removeEventListener('resize',tour.layout);visualViewport.removeEventListener('scroll',tour.layout);}
 detenerPollingMensajes();
 document.getElementById('sohail-guide')?.remove();
 tour.inert.forEach(([el,had])=>{if(!had)el.removeAttribute('inert');});
 document.body.classList.remove('sohail-tour-active');
 if(same){
  cycles=tour.refs.cycles;matches=tour.refs.matches;playoff=tour.refs.playoff;DESTINO=tour.refs.DESTINO;
  PUNTOS=tour.refs.PUNTOS;AJUSTES_PUNTOS=tour.refs.AJUSTES_PUNTOS;ALLNAMES=tour.refs.ALLNAMES;
  ({viewCycle,subView,selGroup,formClub,poContext,adminMode,_formCycleN}=tour.nav);
  _msgSubTab=tour.msg.sub;_msgLastId=tour.msg.last;_msgGrupoCtx=tour.msg.group;_msgTramoCtx=tour.msg.tramo;
  _msgExplorarNivel1=tour.msg.level;_msgExplorarCtx=tour.msg.explore;_msgImagenPendiente=tour.msg.image;_rgEdit=tour.rulesEdit;
  if(tour.preview.isConnected)tour.preview.replaceWith(tour.original);
  // Mantener pausa del autoguardado durante el repintado de idioma.
  if(tour.lang!==LANG)try{_guideTranslateRestoredView();}catch(_){updateLangUI();}
  tour.innerScroll.forEach(([el,top,left])=>{if(el.isConnected){el.scrollTop=top;el.scrollLeft=left;}});
  window.scrollTo({left:tour.scrollX,top:tour.scrollY,behavior:'instant'});
  document.body.scrollTop=tour.bodyScroll[0];document.body.scrollLeft=tour.bodyScroll[1];
 }
 _tutorialTour=null;_tutorialBusy=false;
 if(same){
  if(tour.msg.poll&&subView==='mensajes')reiniciarPollingMensajes();
  if(restoreFocus){const target=tour.focus?.isConnected?tour.focus:document.querySelector('[data-guide-help] button')||document.getElementById('tab-'+subView);target?.focus({preventScroll:true});}
 }
}
async function finishTutorial(status){
 const tour=_tutorialTour,ov=document.getElementById('sohail-guide');
 if(!tour||!ov||!_tutorialRecord||_tutorialBusy||!['completed','skipped'].includes(status))return;
 if(!_guideSameSession(tour)){_guideClose(false);return;}
 _tutorialBusy=true;ov.dataset.saving='true';ov.querySelectorAll('button').forEach(b=>b.disabled=true);
 const record={..._tutorialRecord},controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
 let saved=false;
 try{
  const r=await fetch('/api/password?accion=tutorial',{method:'POST',headers:{Authorization:'Bearer '+_token,'Content-Type':'application/json'},
   body:JSON.stringify({status,version:record.version,epoch:record.epoch}),signal:controller.signal});saved=r.ok;
 }catch(_){}finally{
  clearTimeout(timeout);
  if(_tutorialTour===tour){
   const same=_guideSameSession(tour);_guideClose(true);
   if(same){if(saved&&_tutorialRecord)_tutorialRecord.pending=false;else toast(t('guide_save_error'));}
  }
 }
}
// Compartido con el modal existente de la app y el cambio obligatorio de contraseña.
function trapDialogFocus(event,root){
 const items=Array.from(root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(e=>e.getClientRects().length);
 if(!items.length){event.preventDefault();return;}
 const first=items[0],last=items[items.length-1],active=document.activeElement;
 if(event.shiftKey&&(active===first||!items.includes(active))){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&(active===last||!items.includes(active))){event.preventDefault();first.focus();}
}
function guideHelpButton(container){
 if(!container||container.querySelector('[data-guide-help]')||!currentUser)return;
 const wrap=document.createElement('div');wrap.className='guide-help-inline';wrap.dataset.guideHelp='true';
 const b=document.createElement('button');b.type='button';b.className='btn btn-sm';b.textContent=t('guide_view');b.onclick=openTutorialPopupFromHelp;
 wrap.appendChild(b);container.prepend(wrap);
}
function openTutorialPopupFromHelp(){return maybeShowTutorial(true);}
