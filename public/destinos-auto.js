/* Sohail v3.4 · Destinos del armado inicial. Compartido por navegador y API.
 * Los datos de control viven DENTRO de DESTINO; no cambia el esquema SQL.
 * No mueve jugadores. No modifica ligas sin adhesión explícita a este formato.
 * La configuración manual y el primer resultado cierran el recálculo automático.
 */
(function(root, factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.SohailDestinos=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const KEY='_sohailAutoV1',SCHEME='sohail-5-6-2026';
 const copy=x=>JSON.parse(JSON.stringify(x));
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const object=o=>o&&typeof o==='object'&&!Array.isArray(o);
 const names=g=>(Array.isArray(g?.players)?g.players:[]).filter(n=>typeof n==='string'&&n.trim());
 function meta(state){const m=state?.DESTINO?.[KEY];return object(m)&&m.version===1&&m.scheme===SCHEME&&m.cycle===1&&object(m.groups)?m:null;}
 function initial(){return {[KEY]:{version:1,scheme:SCHEME,cycle:1,locked:false,groups:{}}};}
 function groupCycle(state){return (state?.cycles||[]).find(c=>c?.n===Number(state.activeN));}
 function hasResults(state){return (state?.matches||[]).some(m=>m&&!m.po&&Number(m.cycle)===1);}
 function setup(state){const c=(state?.cycles||[]).find(c=>c?.n===1);return !!c&&Number(state.activeN)===1&&c.status==='active'&&Array.isArray(c.groups)&&!state.playoff?.started&&!hasResults(state);}
 function validDestination(value,total){return typeof value==='string'&&/^G[1-9]\d*$/.test(value)&&Number(value.slice(1))<=total;}
 function template(gid,total,count){
  if(![gid,total,count].every(Number.isSafeInteger)||total<5||gid<1||gid>total)return null;
  let a;
  if(count===5){
   if(gid===1)a=[1,1,2,2,3];
   else if(gid===2)a=[1,1,2,3,4];
   else if(gid===total)a=[total-2,total-1,total-1,total,total];
   else if(gid===total-1)a=[total-3,total-2,total-1,total,total];
   else a=[gid-2,gid-1,gid,gid+1,gid+2];
  }else if(count===6){
   // Variantes documentadas y elegidas: G1 e interiores de Verano 2026,
   // último grupo de T9C3/T7C4. G2 y penúltimo de seis quedan por revisar:
   // las fuentes examinadas no establecen una plantilla para esos casos.
   if(gid===1)a=[1,1,1,2,2,3];
   else if(gid===total)a=[total-2,total-1,total-1,total,total,total];
   else if(gid>2&&gid<total-1)a=[gid-2,gid-1,gid,gid,gid+1,gid+2];
  }
  return a?a.map(n=>'G'+n):null;
 }
 function reconcile(state,previous,options={}){
  let m=meta(state);const old=meta(previous);
  if(!m&&old){
   // Un cliente anterior que omita la marca no vuelve a habilitar el armado.
   if(!object(state.DESTINO))state.DESTINO={};
   state.DESTINO[KEY]=copy(old);m=state.DESTINO[KEY];m.locked=true;
  }
  if(!m)return false;
  const before=JSON.stringify(state.DESTINO);
  if(old?.locked)m.locked=true;
  // El servidor confirma el bloqueo; el cliente no fija un cierre irreversible
  // por un resultado cuyo envío todavía podría fallar.
  if((options.commit!==false&&!setup(state))||(previous&&old&&!setup(previous)))m.locked=true;
  const c=(state.cycles||[]).find(c=>c?.n===m.cycle);
  if(!c||!Array.isArray(c.groups))return before!==JSON.stringify(state.DESTINO);
  const total=c.groups.length,open=!m.locked&&setup(state);
  // Después del armado inicial no se recorren ni rellenan los grupos.
  if(!open)return before!==JSON.stringify(state.DESTINO);
  for(let gi=0;gi<total;gi++){
   const gid=gi+1,count=names(c.groups[gi]).length;
   const arr=Array.isArray(state.DESTINO[gid])?state.DESTINO[gid]:[];
   let entry=object(m.groups[gid])?m.groups[gid]:null;
   if(!entry){
    entry=m.groups[gid]={mode:arr.some(Boolean)?'custom':'auto',applied:arr.slice(),count,total};
   }
   if(entry.mode!=='auto'&&entry.mode!=='custom')entry.mode='custom';
   // También protege cambios hechos desde herramientas antiguas/importaciones.
   if(entry.mode==='auto'&&!eq(arr,entry.applied||[]))entry.mode='custom';
   if(entry.mode==='custom')continue;
   const proposal=template(gid,total,count);
   const next=proposal||arr.slice(0,count);
   while(next.length<count)next.push('');
   state.DESTINO[gid]=next;entry.applied=next.slice();entry.count=count;entry.total=total;
   entry.supported=!!proposal;
  }
  // Solo las entradas automáticas desaparecidas se eliminan. Nunca las manuales.
  for(const k of Object.keys(m.groups))if(/^\d+$/.test(k)&&Number(k)>total&&m.groups[k]?.mode==='auto'){
   delete m.groups[k];delete state.DESTINO[k];
  }
  return before!==JSON.stringify(state.DESTINO);
 }
 function inspect(state,gid,cycle){
  const c=(state?.cycles||[]).find(c=>c?.n===Number(cycle??state.activeN));
  const total=c?.groups?.length||0,count=names(c?.groups?.[gid-1]).length;
  const m=meta(state),entry=m?.groups?.[gid],arr=Array.isArray(state?.DESTINO?.[gid])?state.DESTINO[gid]:[];
  if(!count)return {mode:'empty',count,total,review:false,canReset:false};
  const complete=Array.from({length:count},(_,i)=>validDestination(arr[i],total)).every(Boolean);
  const auto=entry?.mode==='auto';
  const mismatch=auto&&(entry.count!==count||entry.total!==total);
  const unsupported=auto&&!entry.supported;
  const review=!!m&&(!complete||mismatch||unsupported);
  return {mode:review?'review':auto?(m.locked||!setup(state)?'fixed':'auto'):'custom',count,total,review,
   canReset:!!m&&!m.locked&&setup(state)&&!!template(gid,total,count),complete};
 }
 function manual(state,gid,pos,value){
  const c=groupCycle(state),total=c?.groups?.length||0,count=names(c?.groups?.[gid-1]).length;
  if(!Number.isInteger(gid)||!Number.isInteger(pos)||pos<0||pos>=count||!validDestination(value,total))return false;
  if(!object(state.DESTINO))state.DESTINO={};
  const arr=Array.isArray(state.DESTINO[gid])?state.DESTINO[gid]:[];
  while(arr.length<count)arr.push('');
  arr[pos]=value;state.DESTINO[gid]=arr;
  const m=meta(state);if(m)m.groups[gid]={mode:'custom',applied:arr.slice(),count,total,supported:true};
  return true;
 }
 function reset(state,gid){
  const info=inspect(state,gid);if(!info.canReset)return false;
  const a=template(gid,info.total,info.count);state.DESTINO[gid]=a;
  meta(state).groups[gid]={mode:'auto',applied:a.slice(),count:info.count,total:info.total,supported:true};return true;
 }
 function check(state,cycle){
  const c=(state?.cycles||[]).find(c=>c?.n===Number(cycle??state.activeN));
  const problems=[],incoming=Array(c?.groups?.length||0).fill(0),seen=new Set();
  if(!meta(state))return {ok:true,problems,incoming}; // compatibilidad, no migración
  if(!c||!Array.isArray(c.groups))return {ok:false,problems:[{gid:0,reason:'structure'}],incoming};
  c.groups.forEach((g,i)=>{
   const info=inspect(state,i+1,c.n);if(info.review)problems.push({gid:i+1,reason:'review'});
   const arr=state.DESTINO[i+1]||[];
   names(g).forEach((n,pos)=>{
    if(seen.has(n))problems.push({gid:i+1,reason:'duplicate'});seen.add(n);
    if(validDestination(arr[pos],incoming.length))incoming[Number(arr[pos].slice(1))-1]++;
   });
  });return {ok:!problems.length,problems,incoming};
 }
 // v3.4.1: cálculo puntual solicitado por el administrador. No activa el
 // armado automático en una liga anterior, ni desbloquea un armado fijado.
 // Las plantillas son exactamente las de template(); no se inventan destinos.
 function updatePlan(state){
  const c=groupCycle(state),groups=Array.isArray(c?.groups)?c.groups:[];
  const plan={ok:false,reason:'closed',cycle:c?.n??null,total:groups.length,items:[],changed:0,unchanged:0,empty:0,review:0,
   hasResults:(state?.matches||[]).some(m=>m&&!m.po&&Number(m.cycle)===Number(c?.n))};
  if(!c||c.status!=='active'||state?.playoff?.started)return plan;
  if(!groups.length){plan.reason='structure';return plan;}
  const seen=new Set();
  for(let i=0;i<groups.length;i++){
   const ns=names(groups[i]);
   for(const name of ns){if(seen.has(name)){plan.reason='duplicate';return plan;}seen.add(name);}
   const before=Array.isArray(state?.DESTINO?.[i+1])?state.DESTINO[i+1].slice():[];
   const proposed=ns.length?template(i+1,groups.length,ns.length):null;
   const entry=meta(state)?.groups?.[i+1];
   const repair=proposed&&entry?.mode==='auto'&&(entry.count!==ns.length||entry.total!==groups.length||!entry.supported||!eq(entry.applied,proposed));
   const kind=!ns.length?'empty':!proposed?'review':eq(before,proposed)&&!repair?'unchanged':'changed';
   plan[kind==='changed'?'changed':kind]++;
   plan.items.push({gid:i+1,count:ns.length,before,proposed,kind});
  }
  plan.ok=true;plan.reason='';return plan;
 }
 function updatedDestinations(state){
  const plan=updatePlan(state);
  if(!plan.ok)return null;
  const next=object(state.DESTINO)?copy(state.DESTINO):{};
  const control=meta({DESTINO:next});
  for(const item of plan.items){
   if(item.kind!=='changed')continue;
   const a=item.proposed.slice();next[item.gid]=a;
   if(control){
    const mode=control.groups[item.gid]?.mode==='auto'?'auto':'custom';
    control.groups[item.gid]={mode,applied:a.slice(),count:item.count,total:plan.total,supported:true};
   }
  }
  return next;
 }
 return Object.freeze({KEY,initial,meta,names,template,reconcile,inspect,manual,reset,check,setup,validDestination,updatePlan,updatedDestinations});
});

// Interfaz mínima. No instala observadores ni reemplaza funciones de navegación.
if(typeof window!=='undefined'&&typeof TRANSLATIONS!=='undefined'){
 Object.assign(TRANSLATIONS.es,{
  da_auto:'Automático',da_custom:'Personalizado',da_fixed:'Automático · fijado',da_review:'Revisar destinos',da_empty:'Sin jugadores',da_choose:'Elegir destino',
  da_hint:'Durante el armado inicial, los destinos automáticos se ajustan al incorporar jugadores. Si editás un grupo, sus destinos quedan personalizados. Con el primer resultado se detiene el recálculo.',
  da_legacy:'Se conservan los destinos de esta liga. Podés aplicar la plantilla una vez con Actualizar destinos, sin habilitar recálculos automáticos posteriores.',
  da_rules:'Plantilla de 5 jugadores: extremos específicos. Para 6: G1, interiores y último grupo según los casos elegidos. Los tamaños y posiciones sin plantilla requieren revisión; los cupos vacíos no cuentan como jugadores.',
  da_reset:'Restablecer automático',da_confirm:'Restablecer los destinos de {group}:\n\n{rows}\n\nSolo se modifica este grupo. ¿Continuar?',
  da_saved:'Destinos guardados.',da_failed:'No se pudo confirmar el guardado. Revisá el aviso antes de continuar.',
  da_blocked:'Hay destinos por revisar en los grupos {groups}. Configuralos en Ascensos y descensos antes de cerrar el ciclo.',
  da_incoming:'Jugadores por grupo de destino (proyección por puestos):',da_note:'La proyección no mueve jugadores ni garantiza grupos del mismo tamaño. Las bajas y los puestos finales se aplican al cierre.',da_phase:'Los destinos ya están fijados. Podés personalizarlos; no se recalculan automáticamente.',da_forbidden:'Solo la administración autorizada puede cambiar destinos.'
 });
 Object.assign(TRANSLATIONS.en,{
  da_auto:'Automatic',da_custom:'Custom',da_fixed:'Automatic · fixed',da_review:'Review destinations',da_empty:'No players',da_choose:'Choose destination',
  da_hint:'During initial setup, automatic destinations adjust when players are added. Editing a group makes its destinations custom. Automatic updates stop after the first recorded result.',
  da_legacy:'This league keeps its existing destinations. Use Update destinations to apply the template once, without enabling automatic updates afterwards.',
  da_rules:'Five-player template: specific edge groups. For six: first, interior and last groups from the selected examples. Other sizes or positions require review; empty slots do not count as players.',
  da_reset:'Reset to automatic',da_confirm:'Reset destinations for {group}:\n\n{rows}\n\nOnly this group will change. Continue?',
  da_saved:'Destinations saved.',da_failed:'Saving could not be confirmed. Check the notice before continuing.',
  da_blocked:'Review destinations for groups {groups} in Promotions and relegations before closing this cycle.',
  da_incoming:'Players per destination group (projection by position):',da_note:'This projection does not move players or guarantee equal group sizes. Inactive players and final standings are handled at cycle closure.',da_phase:'Destinations are now fixed. You can customise them; they will not update automatically.',da_forbidden:'Only authorised administrators can change destinations.'
 });
}
function destinoAutoState(){return {DESTINO,cycles,matches,activeN,playoff};}
function syncDestinosAuto(){
 if(typeof SohailDestinos==='undefined'||typeof puedeGestionarAdmins!=='function'||!puedeGestionarAdmins(currentUser)||_ligaReadOnly||!_loadOK)return;
 if(typeof isTutorialRunning==='function'&&isTutorialRunning())return;
 let previous;try{previous=_lastSaved?JSON.parse(_lastSaved):null;}catch(_){return;}
 SohailDestinos.reconcile(destinoAutoState(),previous,{commit:false});
}
async function resetDestinosAutoUI(gid){
 if(!puedeGestionarAdmins(currentUser)||_ligaReadOnly){toast(t('da_forbidden'));return;}
 if(_saveInFlight||_saving||_prioritySave){toast(t('ui_busy'));return;}
 const state=destinoAutoState(),info=SohailDestinos.inspect(state,gid);if(!info.canReset)return;
 const proposal=SohailDestinos.template(gid,info.total,info.count);
 const rows=proposal.map((g,i)=>(i+1)+'º → '+groupName(Number(g.slice(1)))).join('\n');
 if(!confirm(tf('da_confirm',{group:groupName(gid),rows})))return;
 if(!SohailDestinos.reset(state,gid))return;
 renderAdmin();const ok=await persist(true);toast(t(ok?'da_saved':'da_failed'));
}
function destinosAutoBeforeClose(){
 if(typeof SohailDestinos==='undefined'||!SohailDestinos.meta(destinoAutoState()))return true;
 syncDestinosAuto();const checked=SohailDestinos.check(destinoAutoState());
 if(checked.ok)return true;
 toast(tf('da_blocked',{groups:[...new Set(checked.problems.map(x=>x.gid))].join(', ')}));return false;
}

/* v3.4.1 · Actualizar destinos: previsualización local, confirmación y guardado.
 * Usa la API existente y la misma autorización estructural de la edición manual.
 * Nunca escribe al abrir/cancelar ni guarda sobre una previsualización obsoleta.
 */
if(typeof window!=='undefined'&&typeof TRANSLATIONS!=='undefined'){
 Object.assign(TRANSLATIONS.es,{
  da_update:'Actualizar destinos',da_update_hint:'Calcula una propuesta para el ciclo activo con las plantillas actuales. Revisá y confirmá antes de reemplazar los destinos.',
  da_update_title:'Actualizar destinos · Ciclo {n}',da_update_scope:'Se usan los {n} grupos configurados y la cantidad de jugadores de cada grupo. Los grupos vacíos no se eliminan.',
  da_update_changes:'Grupos con cambios: {n}',da_update_same:'Sin cambios: {n}',da_update_empty:'Grupos vacíos: {n}',da_update_review:'Sin plantilla: {n}',
  da_update_warning:'Se reemplazarán los destinos actuales de los grupos mostrados como «Con cambios», incluidos los ajustes personalizados. No se mueven jugadores ni se modifican resultados.',
  da_update_played:'Este ciclo ya tiene resultados. Actualizar destinos cambia la distribución prevista al cierre, no los partidos ni su puntuación.',
  da_update_skip:'Sin plantilla para esta combinación. Sus destinos se conservan; revisalos manualmente.',
  da_update_before:'Actual',da_update_after:'Propuesta',da_update_group:'{group} · {n} jugadores',da_update_none:'No hay destinos que actualizar con las plantillas disponibles.',
  da_update_accept:'Revisé la propuesta y acepto reemplazar los destinos indicados.',da_update_apply:'Aplicar y guardar',da_update_saving:'Guardando…',
  da_update_closed:'Disponible solo para el ciclo activo en fase de grupos. No recalcula ciclos finalizados ni playoffs.',
  da_update_structure:'No hay grupos disponibles para calcular destinos.',da_update_duplicate:'Hay jugadores repetidos entre los grupos. Revisá la distribución antes de actualizar destinos.',
  da_update_dirty:'Hay cambios sin confirmar. Esperá a que termine su guardado y volvé a abrir Actualizar destinos.',
  da_update_stale:'La liga, los jugadores o sus destinos cambiaron desde que abriste la propuesta. Cerrá y volvé a calcular; no se aplicó esta propuesta.',
  da_update_failed:'No se pudo confirmar el guardado. Se retiró la propuesta de la pantalla y no se volverá a enviar automáticamente. Revisá el aviso de guardado antes de continuar.',
  da_update_saved:'Destinos actualizados y guardados.',da_update_saved_hint:'Podés seguir ajustando cada puesto con los selectores.',
  da_update_manual:'Los grupos vacíos o sin plantilla conservan sus destinos. Esta acción no habilita recálculos silenciosos en ligas anteriores ni desbloquea el armado fijado.',
  da_update_compat:'Este navegador no pudo abrir la previsualización. No se modificó nada; probá con un navegador actualizado.',
  da_update_changed_tag:'Con cambios',da_update_missing:'Sin destino',da_update_no_value:'—',da_update_previous_extra:'La lista actual contiene puestos adicionales sin jugador. La propuesta los retira de este grupo.'
 });
 Object.assign(TRANSLATIONS.en,{
  da_update:'Update destinations',da_update_hint:'Calculate a proposal for the active cycle using the current templates. Review and confirm before replacing destinations.',
  da_update_title:'Update destinations · Cycle {n}',da_update_scope:'Uses all {n} configured groups and the number of players in each. Empty groups are not removed.',
  da_update_changes:'Groups with changes: {n}',da_update_same:'Unchanged: {n}',da_update_empty:'Empty groups: {n}',da_update_review:'No template: {n}',
  da_update_warning:'Current destinations in groups marked “Changes” will be replaced, including custom settings. No players are moved and no results are modified.',
  da_update_played:'This cycle already has results. Updating destinations changes the planned distribution at closure, not matches or their points.',
  da_update_skip:'No template for this combination. Existing destinations are kept; review them manually.',
  da_update_before:'Current',da_update_after:'Proposed',da_update_group:'{group} · {n} players',da_update_none:'There are no destinations to update with the available templates.',
  da_update_accept:'I have reviewed the proposal and agree to replace the indicated destinations.',da_update_apply:'Apply and save',da_update_saving:'Saving…',
  da_update_closed:'Available only for the active group-stage cycle. Finished cycles and playoffs are not recalculated.',
  da_update_structure:'There are no groups available for destination calculation.',da_update_duplicate:'Some players appear more than once in the groups. Review their allocation before updating destinations.',
  da_update_dirty:'Some changes have not been confirmed. Wait for them to finish saving, then reopen Update destinations.',
  da_update_stale:'The league, players or destinations changed after this proposal was opened. Close and recalculate; this proposal was not applied.',
  da_update_failed:'Saving could not be confirmed. The proposal was removed from the screen and will not be sent again automatically. Check the save notice before continuing.',
  da_update_saved:'Destinations updated and saved.',da_update_saved_hint:'You can still edit each position using the selectors.',
  da_update_manual:'Empty groups and groups without a template keep their destinations. This action does not enable silent updates in older leagues or unlock fixed setup.',
  da_update_compat:'This browser could not open the preview. Nothing was changed; try an up-to-date browser.',
  da_update_changed_tag:'Changes',da_update_missing:'No destination',da_update_no_value:'—',da_update_previous_extra:'The current list has additional positions without players. The proposal removes those positions from this group.'
 });
}
let _destinosUpdateDialog=null;
function destinosUpdateBusy(){
 return !!(_saveInFlight||_saving||_prioritySave||
  (typeof _resultSubmitting!=='undefined'&&_resultSubmitting)||
  (typeof SohailUI!=='undefined'&&SohailUI.isBusy&&SohailUI.isBusy()));
}
function destinosUpdateAllowed(){
 return !!(currentUser&&puedeGestionarAdmins(currentUser)&&!_ligaReadOnly&&_token&&_loadOK&&!_saveConflict&&
  !document.getElementById('_pwforce')&&!(typeof isTutorialRunning==='function'&&isTutorialRunning()));
}
function destinosUpdateStyles(){
 if(document.getElementById('destinos-update-styles'))return;
 const style=document.createElement('style');style.id='destinos-update-styles';
 style.textContent=`
 #destinos-update-dialog{box-sizing:border-box;width:min(780px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);padding:0;border:1px solid var(--border2,#cad3df);border-radius:18px;background:var(--surface,#fff);color:var(--text,#182435);box-shadow:0 20px 60px rgba(0,0,0,.32);margin:auto;overflow:hidden;font-family:inherit}
 #destinos-update-dialog::backdrop{background:rgba(7,16,30,.64)}
 #destinos-update-dialog[open]{display:flex;flex-direction:column}
 #destinos-update-dialog .da-head{padding:20px 22px 14px;border-top:4px solid var(--acc,#e1b73a);border-bottom:1px solid var(--border,#dbe1e9);flex:0 0 auto}
 #destinos-update-dialog h2{font-size:20px;line-height:1.3;margin:0 0 8px;color:var(--text,#182435)}
 #destinos-update-dialog p{font-size:13px;line-height:1.5;margin:0 0 12px;overflow-wrap:anywhere}
 #destinos-update-dialog .da-body{padding:18px 22px;min-height:0;overflow:auto;overscroll-behavior:contain;flex:1 1 auto}
 #destinos-update-dialog .da-counts{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
 #destinos-update-dialog .da-count{font-size:12px;padding:6px 9px;border-radius:8px;background:var(--surface2,#eff2f6);color:var(--text,#182435)}
 #destinos-update-dialog .da-warning{background:var(--warnBg,#fff1cf);color:var(--warnT,#674b09);padding:12px;border-radius:10px}
 #destinos-update-dialog .da-error{background:var(--dangerBg,#ffebeb);color:var(--dangerT,#8a1e1e);padding:12px;border-radius:10px}
 #destinos-update-dialog [hidden]{display:none!important}
 #destinos-update-dialog .da-proposal{border:1px solid var(--border,#dbe1e9);border-radius:12px;padding:14px;margin-bottom:12px;min-width:0}
 #destinos-update-dialog .da-proposal h3{font-size:14px;line-height:1.4;margin:0 0 8px;overflow-wrap:anywhere;color:var(--text,#182435)}
 #destinos-update-dialog .da-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
 #destinos-update-dialog .da-compare h4{font-size:12px;margin:0 0 6px;color:var(--text2,#576379)}
 #destinos-update-dialog ol{padding:0 0 0 24px;margin:0;font-size:13px;line-height:1.7;color:var(--text,#182435)}
 #destinos-update-dialog li{overflow-wrap:anywhere}
 #destinos-update-dialog .da-unchanged{font-size:13px;color:var(--text2,#576379);margin:14px 0}
 #destinos-update-dialog .da-unchanged summary{cursor:pointer;padding:6px 0}
 #destinos-update-dialog .da-footer{padding:14px 22px max(16px,env(safe-area-inset-bottom));border-top:1px solid var(--border,#dbe1e9);background:var(--surface,#fff);flex:0 0 auto}
 #destinos-update-dialog .da-accept{display:flex;align-items:flex-start;gap:10px;margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--text,#182435)}
 #destinos-update-dialog .da-accept input{width:18px;height:18px;flex:0 0 18px;margin:2px 0 0}
 #destinos-update-dialog .da-actions{display:flex;gap:10px;justify-content:flex-end}
 #destinos-update-dialog button{font:inherit;font-size:13px;white-space:normal;min-height:44px;justify-content:center;max-width:100%}
 #destinos-update-dialog :is(button,input,summary):focus-visible{outline:3px solid var(--ring-color,#3882d6);outline-offset:2px}
 @media(max-width:520px){#destinos-update-dialog .da-head{padding:16px 14px 10px}#destinos-update-dialog h2{font-size:18px}#destinos-update-dialog .da-body{padding:12px 14px}#destinos-update-dialog .da-footer{padding:12px 14px max(12px,env(safe-area-inset-bottom))}#destinos-update-dialog .da-actions button{flex:1 1 0;min-width:0}#destinos-update-dialog .da-proposal{padding:12px}}
 @media(max-height:460px){#destinos-update-dialog .da-head{padding:10px 14px}#destinos-update-dialog .da-head p{display:none}#destinos-update-dialog .da-body{padding:10px 14px}#destinos-update-dialog .da-footer{padding:8px 14px}#destinos-update-dialog .da-accept{margin-bottom:6px}}
 `;
 document.head.appendChild(style);
}
function actualizarDestinosUI(){
 if(_destinosUpdateDialog?.isConnected){_destinosUpdateDialog.querySelector('button')?.focus();return;}
 if(!destinosUpdateAllowed()){toast(t(_saveConflict||!_loadOK?'da_failed':'da_forbidden'));return;}
 if(destinosUpdateBusy()){toast(t('ui_busy'));return;}
 // No mezclar esta acción puntual con ediciones estructurales aún sin confirmar.
 if(!_lastSaved||_serialize()!==_lastSaved){toast(t('da_update_dirty'));return;}
 if(document.querySelector('dialog[open],#modal-bg.open,.cm-ov'))return;
 const plan=SohailDestinos.updatePlan(destinoAutoState());
 if(!plan.ok){toast(t('da_update_'+plan.reason));return;}
 const snapshot={key:_saveSessionKey(),liga:_ligaActual,json:_serialize()},e=v=>attr(String(v??''));
 const label=v=>SohailDestinos.validDestination(v,plan.total)?groupName(Number(v.slice(1))):v?String(v):t('da_update_missing');
 const rows=(values,count)=>'<ol>'+Array.from({length:count},(_,i)=>'<li>'+e(label(values[i]))+'</li>').join('')+'</ol>';
 destinosUpdateStyles();
 const dialog=document.createElement('dialog');dialog.id='destinos-update-dialog';dialog.lang=LANG;
 dialog.setAttribute('aria-labelledby','da-update-title');dialog.setAttribute('aria-describedby','da-update-warning');
 dialog.innerHTML='<header class="da-head"><h2 id="da-update-title">'+e(tf('da_update_title',{n:plan.cycle}))+'</h2><p>'+e(tf('da_update_scope',{n:plan.total}))+'</p></header>'+
  '<div class="da-body"><div class="da-counts">'+[['da_update_changes',plan.changed],['da_update_same',plan.unchanged],['da_update_empty',plan.empty],['da_update_review',plan.review]].map(([k,n])=>'<span class="da-count">'+e(tf(k,{n}))+'</span>').join('')+'</div>'+
  '<p id="da-update-warning" class="da-warning">'+e(t('da_update_warning'))+'</p>'+(plan.hasResults?'<p class="da-warning">'+e(t('da_update_played'))+'</p>':'')+
  plan.items.filter(i=>i.kind==='changed'||i.kind==='review').map(i=>'<section class="da-proposal" data-da-group="'+i.gid+'"><h3>'+e(tf('da_update_group',{group:groupName(i.gid),n:i.count}))+' · '+e(t(i.kind==='changed'?'da_update_changed_tag':'da_review'))+'</h3>'+(i.kind==='review'?'<p class="da-warning">'+e(t('da_update_skip'))+'</p>':'')+'<div class="da-compare"><div><h4>'+e(t('da_update_before'))+'</h4>'+rows(i.before,i.count)+'</div><div><h4>'+e(t('da_update_after'))+'</h4>'+rows(i.proposed||i.before,i.count)+'</div></div>'+(i.kind==='changed'&&i.before.length>i.count?'<p>'+e(t('da_update_previous_extra'))+'</p>':'')+'</section>').join('')+
  (plan.unchanged?'<details class="da-unchanged"><summary>'+e(tf('da_update_same',{n:plan.unchanged}))+'</summary><p>'+e(plan.items.filter(i=>i.kind==='unchanged').map(i=>groupName(i.gid)).join(' · '))+'</p></details>':'')+
  (!plan.changed?'<p>'+e(t('da_update_none'))+'</p>':'')+'<p>'+e(t('da_update_manual'))+'</p><p class="da-error" role="alert" hidden></p></div>'+
  '<footer class="da-footer">'+(plan.changed?'<label class="da-accept"><input type="checkbox" data-da-accept><span>'+e(t('da_update_accept'))+'</span></label>':'')+'<div class="da-actions"><button type="button" class="btn" data-da-cancel>'+e(t('cancel'))+'</button>'+(plan.changed?'<button type="button" class="btn btn-primary" data-da-apply disabled>'+e(t('da_update_apply'))+'</button>':'')+'</div></footer>';
 const apply=dialog.querySelector('[data-da-apply]'),accept=dialog.querySelector('[data-da-accept]'),cancel=dialog.querySelector('[data-da-cancel]'),error=dialog.querySelector('.da-error');
 const origin=document.activeElement;let saving=false,monitor,invalidated=false;
 function sameContext(){return snapshot.key===_saveSessionKey()&&snapshot.liga===_ligaActual;}
 function validSnapshot(){return sameContext()&&destinosUpdateAllowed()&&snapshot.json===_serialize();}
 function message(key){error.textContent=t(key);error.hidden=false;error.scrollIntoView({block:'nearest'});}
 function invalidate(){if(invalidated)return;invalidated=true;if(apply)apply.disabled=true;if(accept)accept.disabled=true;message('da_update_stale');}
 dialog.addEventListener('close',()=>{
  clearInterval(monitor);if(_destinosUpdateDialog===dialog)_destinosUpdateDialog=null;dialog.remove();
  if(sameContext())(origin?.isConnected?origin:document.querySelector('[data-da-update]'))?.focus({preventScroll:true});
 });
 dialog.addEventListener('cancel',ev=>{if(saving)ev.preventDefault();});
 cancel.onclick=()=>{if(!saving)dialog.close();};
 if(accept)accept.onchange=()=>{apply.disabled=!accept.checked||saving;};
 if(apply)apply.onclick=async()=>{
  if(saving||!accept.checked)return;
  if(!validSnapshot()){invalidate();return;}
  if(destinosUpdateBusy()){message('ui_busy');return;}
  const next=SohailDestinos.updatedDestinations(destinoAutoState());if(!next){invalidate();return;}
  const previous=JSON.parse(JSON.stringify(DESTINO));
  saving=true;dialog.setAttribute('aria-busy','true');apply.disabled=true;accept.disabled=true;cancel.disabled=true;apply.textContent=t('da_update_saving');error.hidden=true;
  DESTINO=next;
  let ok=false;
  try{ok=await _criticalSave();}catch(_){ok=false;}
  // La sesión puede expirar/cambiar mientras se espera la respuesta. No restaurar
  // datos de la liga anterior encima del estado de la sesión nueva.
  if(!ok&&sameContext()&&JSON.stringify(DESTINO)===JSON.stringify(next))DESTINO=previous;
  saving=false;dialog.removeAttribute('aria-busy');cancel.disabled=false;
  if(!sameContext()){dialog.close();return;}
  if(ok){
   const panel=document.getElementById('destinos-config');if(panel)panel.outerHTML=destinoCard();
   dialog.close();toast(t('da_update_saved'));return;
  }
  apply.textContent=t('da_update_apply');accept.checked=false;
  const retry=validSnapshot();accept.disabled=!retry;apply.disabled=true;
  message('da_update_failed');
 };
 document.body.appendChild(dialog);_destinosUpdateDialog=dialog;
 try{dialog.showModal();cancel.focus({preventScroll:true});}
 catch(_){dialog.remove();_destinosUpdateDialog=null;toast(t('da_update_compat'));return;}
 monitor=setInterval(()=>{
  if(saving)return;
  if(!sameContext()||!destinosUpdateAllowed()){dialog.close();return;}
  if(snapshot.json!==_serialize())invalidate();
 },750);
}
