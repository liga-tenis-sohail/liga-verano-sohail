/* v5.2 — review first, persist atomically, only then expose the next cycle. */
(function(global){
 'use strict';
 Object.assign(TRANSLATIONS.es,{
  zc_title:'Revisar cierre del ciclo {n}',zc_hint:'Los jugadores empatados en 0 puntos necesitan una decisión del administrador. Elegí sus destinos antes de abrir el siguiente ciclo.',zc_slots:'Plazas disponibles',zc_choose:'Elegir destino',zc_accept:'Revisé los destinos. Confirmo el cierre y la apertura del siguiente ciclo.',zc_last_accept:'Confirmo la finalización del último ciclo.',zc_save:'Confirmar cierre',zc_saving:'Guardando cierre…',zc_cancel:'Cancelar',zc_fail:'No se confirmó el cierre. No se habilitó el siguiente ciclo en esta pantalla. Revisá el aviso de guardado antes de reintentar.',zc_stale:'Los datos, permisos o la sesión cambiaron. Cancelá y abrí de nuevo la revisión.',zc_dirty:'Guardá o resolvé los cambios pendientes antes de cerrar.',zc_forbidden:'El cierre de ciclos lo realiza el administrador original de la liga o el superadministrador.',zc_automatic:'Los demás jugadores mantienen los destinos por posición configurados. Esta decisión no modifica puntos, posiciones ni rating.',zc_none:'No hay empates a 0 puntos que requieran asignación. Se aplicarán los destinos configurados.',zc_capacity:'Repartí exactamente las plazas indicadas en cada grupo, sin repetir ni omitir jugadores.',zc_pending:'Resolvé los resultados pendientes o en disputa antes de cerrar.',zc_zero:'0 puntos · {n} partidos computados',zc_last:'Este es el último ciclo: se finaliza sin repartir jugadores a otro ciclo.',zc_required:'Falta elegir un destino para cada jugador y confirmar la revisión.',zc_saved:'Ciclo cerrado y destinos guardados.',zc_review_needed:'Empate a 0: destino pendiente de revisión al cerrar.'
 });
 Object.assign(TRANSLATIONS.en,{
  zc_title:'Review closing cycle {n}',zc_hint:'Players tied on 0 points need an administrator decision. Choose their destinations before opening the next cycle.',zc_slots:'Available places',zc_choose:'Choose destination',zc_accept:'I reviewed the destinations and confirm closing this cycle and opening the next.',zc_last_accept:'I confirm completion of the final cycle.',zc_save:'Confirm closure',zc_saving:'Saving closure…',zc_cancel:'Cancel',zc_fail:'Closure was not confirmed. This screen has not enabled the next cycle. Check the save warning before retrying.',zc_stale:'The data, permissions or session changed. Cancel and reopen this review.',zc_dirty:'Save or resolve pending changes before closing.',zc_forbidden:'Only the league owner administrator or superadministrator can close cycles.',zc_automatic:'Other players retain their configured position-based destinations. This decision does not alter points, standings or rating.',zc_none:'No ties on 0 points require assignment. Configured destinations will be used.',zc_capacity:'Allocate exactly the available places in each group, without duplicating or omitting players.',zc_pending:'Resolve pending or disputed results before closing.',zc_zero:'0 points · {n} credited matches',zc_last:'This is the final cycle: it will finish without reallocating players to another cycle.',zc_required:'Choose a destination for every player and confirm the review.',zc_saved:'Cycle closed and destinations saved.',zc_review_needed:'Tied on 0: destination awaits review at closing.'
 });
 let dialog=null,opening=false;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const state=()=>({_v:_stateV,cycles,matches,activeN,playoff,DESTINO,PUNTOS,users:USERS});
 const allowed=()=>!!(currentUser&&puedeGestionarAdmins(currentUser)&&!_ligaReadOnly&&_token&&_loadOK&&!_saveConflict&&!_saveUnconfirmed)&&!(typeof isTutorialRunning==='function'&&isTutorialRunning());
 function review(finalCycle){
  const p=SohailCycleClose.plan(state());
  if(!!finalCycle!==!p.to)throw Error(t('zc_stale'));
  const snapshot=_serialize(),key=_saveSessionKey(),league=_ligaActual,origin=document.activeElement;
  const e=x=>attr(String(x??''));let saving=false,invalid=false,monitor;
  const d=document.createElement('dialog');d.className='cycle-close-dialog';d.setAttribute('aria-labelledby','zc-title');
  d.innerHTML='<header><h2 id="zc-title">'+e(tf('zc_title',{n:p.from}))+'</h2><p>'+e(t(p.to?(p.ties.length?'zc_hint':'zc_none'):'zc_last'))+'</p></header><div class="zc-body">'+p.ties.map(tie=>{
   const counts=new Map();tie.slots.forEach(x=>counts.set(x,(counts.get(x)||0)+1));
   return '<section class="zc-group"><h3>'+e(groupName(tie.group))+'</h3><p>'+e(t('zc_slots'))+': '+[...counts].map(([g,n])=>e(groupName(Number(g.slice(1)))+' × '+n)).join(' · ')+'</p>'+tie.players.map((r,i)=>'<div class="zc-row"><label for="zc-'+tie.group+'-'+i+'"><strong>'+e(r.name)+'</strong><small>'+e(tf('zc_zero',{n:r.played}))+'</small></label><select id="zc-'+tie.group+'-'+i+'" data-zc-group="'+tie.group+'" data-zc-name="'+e(r.name)+'" required><option value="">'+e(t('zc_choose'))+'</option>'+[...counts.keys()].map(g=>'<option value="'+g+'">'+e(groupName(Number(g.slice(1))))+'</option>').join('')+'</select></div>').join('')+'</section>';
  }).join('')+(p.to?'<p class="re-help">'+e(t('zc_automatic'))+'</p>':'')+'<p role="alert" class="zc-error" hidden></p></div><footer><label class="zc-accept"><input type="checkbox" data-zc-accept><span>'+e(t(p.to?'zc_accept':'zc_last_accept'))+'</span></label><div class="zc-actions"><button type="button" class="btn" data-zc-cancel>'+e(t('zc_cancel'))+'</button><button type="button" class="btn btn-primary" data-zc-save disabled>'+e(t('zc_save'))+'</button></div></footer>';
  const save=d.querySelector('[data-zc-save]'),cancel=d.querySelector('[data-zc-cancel]'),accept=d.querySelector('[data-zc-accept]'),error=d.querySelector('.zc-error');
  const sameSession=()=>key===_saveSessionKey()&&league===_ligaActual;
  const sameSnapshot=()=>sameSession()&&allowed()&&snapshot===_serialize();
  const rows=()=>Array.from(d.querySelectorAll('[data-zc-name]'),el=>({group:Number(el.dataset.zcGroup),name:el.dataset.zcName,destination:el.value}));
  const showError=message=>{error.textContent=message;error.hidden=false;};
  function update(){
   let valid=false;try{SohailCycleClose.assignments(p,SohailCycleClose.decision(p,rows()));valid=true;}catch(_){}
   save.disabled=saving||invalid||!accept.checked||!valid;
   const allChosen=rows().every(r=>r.destination);
   if(allChosen&&!valid)showError(t('zc_capacity'));else if(!invalid)error.hidden=true;
  }
  d.addEventListener('change',update);
  d.addEventListener('cancel',ev=>{if(saving)ev.preventDefault();});
  d.addEventListener('close',()=>{clearInterval(monitor);if(dialog===d)dialog=null;d.remove();if(sameSession()&&origin?.isConnected)origin.focus({preventScroll:true});});
  cancel.onclick=()=>{if(!saving)d.close();};
  save.onclick=async()=>{
   if(saving||save.disabled)return;
   if(!sameSnapshot()){invalid=true;update();showError(t('zc_stale'));return;}
   const chosen=SohailCycleClose.decision(p,rows());
   try{SohailCycleClose.assignments(p,chosen);}catch(_){showError(t('zc_capacity'));return;}
   saving=true;d.setAttribute('aria-busy','true');d.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);save.textContent=t('zc_saving');
   const ok=await SohailUI.mutation(()=>{
    if(!sameSnapshot())throw Error(t('zc_stale'));
    const currentPlan=SohailCycleClose.plan(state());
    const current=cycles[currentPlan.from-1];
    if(p.to){
     const groups=SohailCycleClose.nextGroups(currentPlan,chosen);
     if(p.ties.length)current.zeroPointDecision=clone(chosen);else delete current.zeroPointDecision;
     const next=cycles[p.to-1];next.groups=groups;next.status='active';activeN=next.n;viewCycle=next.n;
     if(currentUser.role==='player'){const loc=findLoc(currentUser.name,activeN);if(loc)selGroup=loc.g;}
    }
    current.status='finished';
    addLog('Ciclo: cierre confirmado',{cycle:p.from,next:p.to,zeroPointAssignments:chosen.assignments});
   });
   saving=false;d.removeAttribute('aria-busy');
   if(!sameSession()){d.close();return;}
   if(ok){d.close();refreshAll();showSub(p.to?'grupos':'admin');toast(t(p.to?'zc_saved':'last_cycle_finished'));return;}
   d.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);save.textContent=t('zc_save');
   invalid=!sameSnapshot();update();showError(t('zc_fail'));
  };
  document.body.append(d);dialog=d;
  try{d.showModal();cancel.focus({preventScroll:true});}catch(_){d.remove();dialog=null;toast(t('zc_fail'));return;}
  monitor=setInterval(()=>{if(saving)return;if(!sameSession()){d.close();return;}if(!sameSnapshot()&&!invalid){invalid=true;update();showError(t('zc_stale'));}},750);
 }
 async function start(finalCycle){
  if(dialog){dialog.querySelector('[data-zc-cancel]')?.focus();return;}
  if(opening||SohailUI.isBusy()||global.SohailResults?.isSaving())return;
  if(!allowed()){toast(t('zc_forbidden'));return;}
  opening=true;const key=_saveSessionKey(),league=_ligaActual;
  try{
   if(_saveInFlight)await _saveInFlight;
   if(_serialize()!==_lastSaved&&!await _criticalSave()){toast(t('zc_dirty'));return;}
   if(key!==_saveSessionKey()||league!==_ligaActual||!allowed())return;
   if(typeof destinosAutoBeforeClose==='function'&&!finalCycle&&!destinosAutoBeforeClose())return;
   const c=getActive();if(!c||c.status!=='active')return;
   const pending=matches.some(m=>!m.po&&m.cycle===activeN&&m.status!=='confirmed');if(pending){toast(t('zc_pending'));return;}
   const done=matches.filter(m=>!m.po&&m.cycle===activeN&&m.status==='confirmed').length;
   const missing=Math.max(0,pairsNeeded(c)-done);
   if(missing&&!confirm(t(finalCycle?'close_force_confirm_last':'close_force_confirm').replace('{n}',missing)))return;
   review(finalCycle);
  }catch(err){toast(err.message||t('zc_fail'));}finally{opening=false;}
 }
 global.SohailCycleCloseUI={start};
})(window);
