// Tutorial por usuario y por restablecimiento. Preferencia guardada SOLO por API.
let _tutorialBusy=false,_tutorialRecord=null,_tutorialStep=0,_tutorialSeenSession='';
function _tutorialSteps(){
 const admin=typeof esAdmin==='function'&&esAdmin(currentUser);
 return admin?['intro','admin','results','privacy','profile']:['intro','groups','results','messages','profile'];
}
async function maybeShowTutorial(manual){
 if(!_token||!currentUser||_ligaReadOnly||document.getElementById('_pwforce')||_tutorialBusy)return;
 const key=_saveSessionKey();if(!manual&&_tutorialSeenSession===key)return;
 _tutorialBusy=true;
 try{
  const r=await fetch('/api/password?accion=tutorial',{headers:{Authorization:'Bearer '+_token},cache:'no-store'}),d=await r.json();
  if(!r.ok||key!==_saveSessionKey()||!currentUser||document.getElementById('_pwforce'))return;
  _tutorialRecord=d;_tutorialSeenSession=key;
  if(!manual&&!d.pending)return;
  _tutorialStep=0;renderTutorial();
 }catch(_){if(manual)toast(t('guide_load_error'));}finally{_tutorialBusy=false;}
}
function renderTutorial(){
 if(!currentUser||!_tutorialRecord)return;
 let ov=document.getElementById('sohail-guide');
 if(!ov){
  ov=document.createElement('div');ov.id='sohail-guide';ov.className='guide-overlay';
  ov._previousFocus=document.activeElement;document.body.appendChild(ov);
  ov.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();finishTutorial('skipped');}if(e.key==='Tab')trapDialogFocus(e,ov);});
 }
 const steps=_tutorialSteps(),step=steps[_tutorialStep];
 const focusedId=ov.contains(document.activeElement)?document.activeElement.id:'';
 const wasLanguageButton=focusedId==='guide-language-es'||focusedId==='guide-language-en';
 ov.replaceChildren();
 const dialog=document.createElement('section');dialog.className='guide-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','guide-title');
 dialog.lang=LANG;dialog.setAttribute('aria-describedby','guide-copy');
 const language=createDialogLanguageSwitcher('guide-language');
 const progress=document.createElement('p');progress.className='guide-progress';progress.textContent=tf('guide_progress',{n:_tutorialStep+1,total:steps.length});
 const title=document.createElement('h2');title.id='guide-title';title.tabIndex=-1;title.textContent=t('guide_'+step+'_title');
 const text=document.createElement('p');text.id='guide-copy';text.className='guide-copy';text.textContent=t('guide_'+step+'_body');
 const error=document.createElement('p');error.id='guide-error';error.setAttribute('role','status');
 const actions=document.createElement('div');actions.className='guide-actions';
 function button(label,action,primary){const b=document.createElement('button');b.type='button';b.className='btn'+(primary?' btn-primary':'');b.textContent=label;b.onclick=action;return b;}
 const skip=button(t('guide_skip'),()=>finishTutorial('skipped'));skip.id='guide-skip';actions.appendChild(skip);
 if(_tutorialStep>0)actions.appendChild(button(t('guide_back'),()=>{_tutorialStep--;renderTutorial();}));
 const next=button(t(_tutorialStep===steps.length-1?'guide_finish':'guide_next'),()=>{if(_tutorialStep===steps.length-1)finishTutorial('completed');else{_tutorialStep++;renderTutorial();}},true);next.id='guide-next';actions.appendChild(next);
 dialog.append(language,progress,title,text,error,actions);ov.appendChild(dialog);
 // Un cambio de idioma externo durante el envío no habilita doble envío.
 if(ov.dataset.saving==='true')ov.querySelectorAll('button').forEach(b=>b.disabled=true);
 const focusTarget=wasLanguageButton?document.getElementById(focusedId):title;
 if(focusTarget&&!focusTarget.disabled)focusTarget.focus({preventScroll:wasLanguageButton});
}
async function finishTutorial(status){
 const ov=document.getElementById('sohail-guide');if(!ov||!_tutorialRecord||_tutorialBusy)return;
 _tutorialBusy=true;const key=_saveSessionKey(),record={..._tutorialRecord};
 ov.dataset.saving='true';
 ov.querySelectorAll('button').forEach(b=>b.disabled=true);
 let saved=false;
 try{const r=await fetch('/api/password?accion=tutorial',{method:'POST',headers:{Authorization:'Bearer '+_token,'Content-Type':'application/json'},body:JSON.stringify({status,version:record.version,epoch:record.epoch})});saved=r.ok;}catch(_){}
 finally{
   const previous=ov._previousFocus;ov.remove();_tutorialBusy=false;
   if(previous&&previous.isConnected)previous.focus();
   if(key===_saveSessionKey()){
     if(saved)_tutorialRecord.pending=false;
     else toast(t('guide_save_error'));
   }
 }
}
function trapDialogFocus(event,root){
 const items=Array.from(root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(e=>e.getClientRects().length);
 if(!items.length){event.preventDefault();return;}
 const first=items[0],last=items[items.length-1],active=document.activeElement;
 if(event.shiftKey&&(active===first||!items.includes(active))){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&(active===last||!items.includes(active))){event.preventDefault();first.focus();}
}
function guideHelpButton(container){
 if(!container||container.querySelector('[data-guide-help]')||!currentUser)return;
 const wrap=document.createElement('div');wrap.className='guide-help-inline';wrap.dataset.guideHelp='true';const b=document.createElement('button');b.type='button';b.className='btn btn-sm';b.textContent=t('guide_view');b.onclick=()=>openTutorialPopupFromHelp();wrap.appendChild(b);container.prepend(wrap);
}


function openTutorialPopupFromHelp(){
 const existing=document.getElementById('sohail-guide');
 if(existing) existing.remove();
 _tutorialBusy=false;
 _tutorialStep=0;
 maybeShowTutorial(true);
}
