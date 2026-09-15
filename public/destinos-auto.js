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
 return Object.freeze({KEY,initial,meta,names,template,reconcile,inspect,manual,reset,check,setup,validDestination});
});

// Interfaz mínima. No instala observadores ni reemplaza funciones de navegación.
if(typeof window!=='undefined'&&typeof TRANSLATIONS!=='undefined'){
 Object.assign(TRANSLATIONS.es,{
  da_auto:'Automático',da_custom:'Personalizado',da_fixed:'Automático · fijado',da_review:'Revisar destinos',da_empty:'Sin jugadores',da_choose:'Elegir destino',
  da_hint:'Durante el armado inicial, los destinos automáticos se ajustan al incorporar jugadores. Si editás un grupo, sus destinos quedan personalizados. Con el primer resultado se detiene el recálculo.',
  da_legacy:'Se conservan los destinos de esta liga. La asignación automática se activa en las ligas nuevas creadas con esta versión.',
  da_rules:'Plantilla de 5 jugadores: extremos específicos. Para 6: G1, interiores y último grupo según los casos elegidos. Los tamaños y posiciones sin plantilla requieren revisión; los cupos vacíos no cuentan como jugadores.',
  da_reset:'Restablecer automático',da_confirm:'Restablecer los destinos de {group}:\n\n{rows}\n\nSolo se modifica este grupo. ¿Continuar?',
  da_saved:'Destinos guardados.',da_failed:'No se pudo confirmar el guardado. Revisá el aviso antes de continuar.',
  da_blocked:'Hay destinos por revisar en los grupos {groups}. Configuralos en Ascensos y descensos antes de cerrar el ciclo.',
  da_incoming:'Jugadores por grupo de destino (proyección por puestos):',da_note:'La proyección no mueve jugadores ni garantiza grupos del mismo tamaño. Las bajas y los puestos finales se aplican al cierre.',da_phase:'Los destinos ya están fijados. Podés personalizarlos; no se recalculan automáticamente.',da_forbidden:'Solo la administración autorizada puede cambiar destinos.'
 });
 Object.assign(TRANSLATIONS.en,{
  da_auto:'Automatic',da_custom:'Custom',da_fixed:'Automatic · fixed',da_review:'Review destinations',da_empty:'No players',da_choose:'Choose destination',
  da_hint:'During initial setup, automatic destinations adjust when players are added. Editing a group makes its destinations custom. Automatic updates stop after the first recorded result.',
  da_legacy:'This league keeps its existing destinations. Automatic assignment is enabled for new leagues created with this version.',
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
