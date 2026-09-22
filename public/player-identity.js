/* Sohail v4.0 — reviewed profile merges, distinct-person decisions and historical links.
 * Account keys, passwords, permissions and passkeys are deliberately NOT merged.
 */
(function(root){
 'use strict';
 const ui=()=>root.SohailDataUI;
 const refKey=r=>JSON.stringify(r.type==='league'?['league',r.ligaId,r.name]:['catalog',r.id]);
 const pairKey=(a,b)=>JSON.stringify([refKey(a),refKey(b)].sort());
 const valueText=v=>typeof v==='string'?v:JSON.stringify(v);
 async function open(mode='duplicates',initialRefs=null,initialCurrentName=''){
  const U=ui(),{el,button,text}=U;let ctx,d,dir,showDecisions=false,sequence=0;
  const bulkSelection=new Map();
  try{
   ctx=await U.begin();d=U.modal(text('Jugadores · Identidad e historial','Players · Identity and history'));d.onClose=U.end;
   function status(error){if(!d.closed)d.status.textContent=error.message||String(error);}
   function footer(){d.foot.replaceChildren(button(text('Cerrar sin cambios','Close without changes'),d.close));}
   function nav(){
    const n=el('div','gap-sm');
    n.append(button(text('Posibles duplicados','Possible duplicates'),()=>directory('duplicates')),button(text('Vincular jugadores históricos','Link historical players'),()=>directory('historical')));
    if(dir?.superadmin)n.append(button(text('Operaciones y deshacer','Operations and undo'),operations));
    d.body.append(n);
   }
   async function directory(which=mode){
    mode=which;const seq=++sequence;footer();d.body.replaceChildren(el('p','dup-help',text('Leyendo fichas y decisiones…','Reading profiles and decisions…')));
    try{
     const data=await U.post('/api/liga?operacion=identities',{mode:'directory',ligaId:ctx.ligaId},ctx);if(d.closed||seq!==sequence)return;dir=data;
     d.body.replaceChildren();nav();
     d.body.append(el('p','dup-help',text('Las sugerencias no prueban identidad. Las fusiones se revisan campo por campo; se conservan las variantes, los nombres históricos y todos los partidos. Las cuentas mantienen sus accesos independientes.','Suggestions are not proof of identity. Merges are reviewed field by field; variants, historical names and every match are retained. Accounts keep their independent access.')));
     if(!data.superadmin)d.body.append(el('p','dup-help',text('Podés resolver fichas de tus ligas. Una fusión que alcance el catálogo global u otras ligas requiere al superadministrador.','You can resolve profiles in leagues you administer. A merge affecting the global catalogue or other leagues requires the superadministrator.')));
     if(which==='historical'){historical();return;}
     duplicates();
    }catch(e){status(e);}
   }
   function duplicates(){
    d.body.append(button(showDecisions?text('Ocultar personas distintas','Hide distinct people'):text('Revisar decisiones de personas distintas','Review distinct-person decisions'),()=>{showDecisions=!showDecisions;directory('duplicates');}));
    // The existing engine supplies suggestions; its source:index key points to this
    // read-only directory. It never chooses a canonical identity automatically.
    const report=SohailDuplicates.scanData(dir.records),indexFor=r=>Number(r.key.slice(r.key.lastIndexOf(':')+1));
    const pairs=report.pairs.map(p=>({a:dir.records[indexFor(p.a)],b:dir.records[indexFor(p.b)],reason:p.reason})).filter(p=>p.a&&p.b);
    const logicalKey=p=>JSON.stringify([p.a.globalId?'profile:'+p.a.globalId:p.a.key,p.b.globalId?'profile:'+p.b.globalId:p.b.key].sort());
    const decisionFor=p=>Object.values(dir.decisions||{}).find(d=>{
     const a=dir.records.find(r=>r.key===d.keys?.[0]),b=dir.records.find(r=>r.key===d.keys?.[1]);
     return a&&b&&logicalKey({a,b})===logicalKey(p)&&d.status!=='merged';
    });
    const seen=new Set(pairs.map(p=>pairKey(p.a.ref,p.b.ref)));
    if(showDecisions)for(const decision of Object.values(dir.decisions||{})){
     if(decision.status!=='distinct')continue;const a=dir.records.find(r=>r.key===decision.keys[0]),b=dir.records.find(r=>r.key===decision.keys[1]);
     if(a&&b&&!seen.has(pairKey(a.ref,b.ref)))pairs.push({a,b,reason:'exact'});
    }
    // An account listed in the catalogue and in several seasons is one side
    // of the SAME case, not a fresh alert for every alias of that identity.
    const unique=new Map();
    const priority=p=>Number(p.a.leagueId===ctx.ligaId||p.b.leagueId===ctx.ligaId)*2+Number(p.a.ref.type==='league'&&p.b.ref.type==='league');
    for(const p of pairs){const k=logicalKey(p);if(!unique.has(k)||priority(p)>priority(unique.get(k)))unique.set(k,p);}
    const visible=[...unique.values()].filter(p=>showDecisions||decisionFor(p)?.status!=='distinct');
    d.body.append(el('p','dup-summary',`${visible.length} ${text('casos para revisar','cases to review')}`));
    if(report.limited)d.body.append(el('p','dup-warning',text('Revisión parcial: se alcanzó el límite de comparaciones. Usá Vincular jugadores históricos para elegir fichas concretas.','Partial review: the comparison limit was reached. Use historical linking to choose specific profiles.')));
    if(!visible.length)d.body.append(el('p','dup-empty',text('No hay sugerencias pendientes con estos criterios. También podés elegir manualmente las dos fichas.','No pending suggestions with these criteria. You can also choose two profiles manually.')));
    const selectable=new Map(visible.filter(p=>decisionFor(p)?.status!=='distinct').map(p=>[logicalKey(p),p]));
    for(const key of bulkSelection.keys())if(!selectable.has(key))bulkSelection.delete(key);
    const controls=new Map(),toolbar=el('div','identity-bulk-toolbar'),counter=el('strong','');
    const identities=p=>[p.a,p.b].map(r=>r.globalId?'sport:'+r.globalId:refKey(r.ref));
    const overlaps=(key,p)=>[...bulkSelection].some(([k,other])=>k!==key&&identities(p).some(id=>identities(other).includes(id)));
    function updateSelection(){
      counter.textContent=bulkSelection.size+' / 20 '+text('casos seleccionados','selected cases');
      mergeSelected.disabled=!bulkSelection.size;
      for(const [key,{check,p,card}]of controls){
        check.checked=bulkSelection.has(key);
        check.disabled=!check.checked&&(bulkSelection.size>=20||overlaps(key,p));
        card.classList.toggle('identity-bulk-selected',check.checked);
      }
    }
    function toggleCase(key,p,checked){
      if(!checked)bulkSelection.delete(key);
      else if(bulkSelection.size<20&&!overlaps(key,p))bulkSelection.set(key,p);
      else d.status.textContent=text('Un máximo de 20 casos independientes: la misma persona no puede estar en dos casos del lote.','At most 20 independent cases: the same person cannot appear in two cases in a batch.');
      updateSelection();
    }
    const mergeSelected=button(text('Revisar y fusionar seleccionados','Review and merge selected'),()=>{
      const groups=[...bulkSelection.values()].map(p=>{
        const ordered=p.b.leagueId===ctx.ligaId&&p.a.leagueId!==ctx.ligaId?[p.b,p.a]:[p.a,p.b];
        return {refs:ordered.map(r=>r.ref),choices:{}};
      });
      bulkPreview(groups);
    },true);
    mergeSelected.dataset.identityBulkReview='true';
    toolbar.append(counter,button(text('Marcar visibles para revisar','Select visible cases for review'),()=>{
      for(const [key,c] of controls)if(bulkSelection.size<20&&!overlaps(key,c.p))bulkSelection.set(key,c.p);
      updateSelection();
      d.status.textContent=text('Revisá las casillas: se omitieron los cruces y el exceso del límite. No se fusionó nada.','Review the selections: overlapping cases and cases beyond the limit were excluded. Nothing was merged.');
    }),button(text('Quitar selección','Clear selection'),()=>{bulkSelection.clear();updateSelection();}),mergeSelected);
    d.body.append(toolbar,el('p','dup-help',text('Marcá solo los casos que confirmás. Cada pareja es una persona distinta de las otras parejas. Una única confirmación guarda el lote completo; si algo falla, no se aplica ninguna fusión.','Select only cases you confirm. Each pair is independent from the other pairs. One confirmation saves the complete batch; if anything fails, no merge is applied.')));
    let shown=0;const list=el('div','dup-list'),more=button(text('Mostrar más','Show more'),add);d.body.append(list,more);
    function add(){
     for(const p of visible.slice(shown,shown+20)){
      const card=el('article','dup-card'),pair=el('div','dup-pair');
      for(const r of [p.a,p.b]){const item=el('div','dup-match');item.append(el('strong','dup-name',r.name),el('p','dup-source',r.leagueName));pair.append(item);}
      card.append(pair,el('p','dup-help',SohailDuplicates.label(p.reason)));
      const savedDecision=decisionFor(p),decision=savedDecision?.status,actions=el('div','gap-sm');
      if(decision!=='distinct'){
       const key=logicalKey(p),label=el('label','identity-bulk-choice'),check=el('input','');check.type='checkbox';
       check.dataset.identityBulkCase=key;
       label.append(check,el('span','',text('Son la misma persona · incluir en el lote','Same person · include in batch')));
       check.addEventListener('change',()=>toggleCase(key,p,check.checked));
       card.prepend(label);controls.set(key,{check,p,card});
      }
      if(decision==='later')card.append(el('p','dup-help',text('Pendiente de revisión','Pending review')));
      if(decision==='distinct'){
       card.append(el('p','dup-help',text('Marcadas como personas distintas','Marked as different people')));
       actions.append(button(text('Volver a revisar','Reopen review'),()=>decisionReview(savedDecision.keys.map(k=>dir.records.find(r=>r.key===k).ref),'review')));
      }else actions.append(button(text('Fusionar · misma persona','Merge · same person'),()=>preview([p.a.ref,p.b.ref],{},'merge'),true),button(text('Son personas distintas','Different people'),()=>decisionReview([p.a.ref,p.b.ref],'distinct')),button(text('Revisar más adelante','Review later'),()=>decisionReview([p.a.ref,p.b.ref],'later')));
      card.append(actions);list.append(card);
     }shown+=20;more.hidden=shown>=visible.length;updateSelection();
    }add();d.status.textContent=text('Elegí una acción. Todavía no se cambió ningún perfil.','Choose an action. No profile has been changed.');
   }
   function select(labelText,items){
    const label=el('label','identity-field',labelText),s=el('select','dup-decision');label.append(s);
    const blank=el('option','',text('Elegí una ficha…','Choose a profile…'));blank.value='';s.append(blank);
    for(const [i,r]of items.entries()){const o=el('option','',r.name+(r.leagueName?' · '+r.leagueName:''));o.value=String(i);s.append(o);}
    return {label,select:s,value:()=>s.value===''?null:items[Number(s.value)]};
   }
   function historical(){
    d.body.append(el('h3','dup-summary',text('Unificar un nombre histórico con un jugador actual','Unify a historical name with a current player')));
    const current=dir.records.filter(r=>r.leagueId===ctx.ligaId),others=dir.records.filter(r=>r.leagueId!==ctx.ligaId),a=select(text('Jugador de esta liga (nombre principal)','Player in this league (primary name)'),current),b=select(text('Nombre de otra temporada o ficha del catálogo','Name from another season or catalogue profile'),others);
    d.body.append(a.label,b.label,el('p','dup-help',text('Este selector elige el registro a vincular; no cambia la liga de tu sesión. Los partidos seguirán mostrando su nombre original y se sumarán bajo la identidad unificada.','This selector chooses the record to link; it does not switch your session league. Matches retain their original names and aggregate under the unified identity.')));
    const action=button(text('Revisar vínculo y datos a conservar','Review link and retained data'),()=>{const aa=a.value(),bb=b.value();if(aa&&bb)preview([aa.ref,bb.ref],{},'link');},true);action.disabled=true;
    const update=()=>{action.disabled=!a.value()||!b.value();};a.select.onchange=update;b.select.onchange=update;const initial=current.findIndex(r=>r.name===initialCurrentName);if(initial>=0)a.select.value=String(initial);update();d.body.append(action);
    // Also allow two current-league aliases to be chosen without a name-similarity hit.
    const details=el('details','identity-manual'),summary=el('summary','',text('Elegir dos fichas manualmente','Choose two profiles manually'));details.append(summary);
    const c=select(text('Primera ficha','First profile'),dir.records),e=select(text('Segunda ficha','Second profile'),dir.records);
    const manual=button(text('Revisar fusión','Review merge'),()=>{if(c.value()&&e.value())preview([c.value().ref,e.value().ref],{},'merge');});details.append(c.label,e.label,manual);d.body.append(details);
    d.status.textContent=text('No se vincula por parecido de nombre ni por correo automáticamente.','No automatic linking by name similarity or email.');
   }
   async function preview(refs,choices={},kind='merge'){
    const seq=++sequence;footer();d.body.replaceChildren(el('p','dup-help',text('Preparando la ficha unificada…','Preparing the unified profile…')));
    try{
     const p=await U.post('/api/liga?operacion=identities',{mode:'preview',kind,ligaId:ctx.ligaId,refs,choices},ctx);if(d.closed||seq!==sequence)return;
     d.body.replaceChildren(el('h3','dup-summary',p.profile.name),el('p','dup-help',text('Nombres conservados: ','Retained names: ')+p.profile.aliases.join(' · ')),el('p','dup-summary',`${p.summary.members} ${text('fichas','profiles')} · ${p.summary.leagues.length} ${text('ligas','leagues')} · ${p.summary.matches} ${text('partidos conservados','matches retained')}`));
     d.body.append(el('p','dup-warning',text('Se unifica la ficha deportiva, no las credenciales. No se borran partidos ni nombres históricos, ni se trasladan contraseñas, Face ID o permisos. Un cero, un “no” o un campo completo no se trata como vacío.','This unifies the sporting profile, not credentials. Matches and historical names are not deleted; passwords, Face ID and permissions are not transferred. Zero, false and completed fields are not treated as empty.')));
     const data=el('dl','identity-values');for(const [k,v]of Object.entries(p.profile.fields)){data.append(el('dt','',k),el('dd','',valueText(v)));}d.body.append(data);
     for(const [key,conflict]of Object.entries(p.profile.alternatives)){
      const field=el('label','identity-field',conflict.path.join(' · ')+text(' · Valor principal',' · Primary value')),s=el('select','dup-decision');
      conflict.values.forEach((v,i)=>{const o=el('option','',valueText(v.value)+' — '+v.from.join('; '));o.value=String(i);s.append(o);});s.value=String(choices[key]||0);
      s.onchange=()=>preview(refs,{...choices,[key]:Number(s.value)},kind);field.append(s,el('small','dup-help',text('Todas las variantes se conservan con su procedencia, también las que no elijas como principal.','Every variant and its source is retained, including values not selected as primary.')));d.body.append(field);
     }
     d.body.append(button(text('Usar el otro nombre como principal','Use the other name as primary'),()=>preview([...refs].reverse(),{},kind)));
     d.foot.append(button(text('Volver a las fichas','Back to profiles'),()=>directory(mode)));
     const confirm=button(text('Confirmar fusión sin borrar historial','Confirm merge without deleting history'),async()=>{
      d.busy(true);d.status.textContent=text('Guardando la fusión completa…','Saving the complete merge…');
      try{const r=await U.committed('/api/liga?operacion=identities',{mode:'commit',kind,ligaId:ctx.ligaId,refs,choices,digest:p.digest,operationId:crypto.randomUUID()},ctx);U.applied(d,r);}catch(e){d.busy(false);confirm.disabled=true;status(e);}
     },true);d.foot.append(confirm);d.status.textContent=text('Vista previa. Revisá los campos antes de confirmar.','Preview. Review the fields before confirming.');
    }catch(e){status(e);d.foot.append(button(text('Volver a las fichas','Back to profiles'),()=>directory(mode)));}
   }
   async function bulkPreview(groups){
    if(!groups.length)return;
    const seq=++sequence;footer();d.status.textContent='';
    d.body.replaceChildren(el('p','dup-help',text('Comprobando todos los casos y sus permisos…','Checking every case and its permissions…')));
    try{
     const p=await U.post('/api/liga?operacion=identities',{mode:'bulk-preview',ligaId:ctx.ligaId,groups},ctx);
     if(d.closed||seq!==sequence)return;
     d.body.replaceChildren(el('h3','dup-summary',p.summary.cases+' '+text('fusiones independientes','independent merges')),
      el('p','dup-help',p.summary.members+' '+text('fichas','profiles')+' · '+p.summary.leagues.length+' '+text('ligas','leagues')+' · '+p.summary.matches+' '+text('partidos conservados','matches retained')),
      el('p','dup-warning',text('Cada caso conserva su propia identidad. Se combinan los campos completos y se guardan las variantes y su procedencia. Revisá el valor principal en los campos distintos. No se mezclan contraseñas, Face ID ni permisos. Todo el lote se confirma en una única operación.','Each case keeps its own identity. Completed fields are combined and every variant and its source is retained. Review the primary value for conflicting fields. Passwords, Face ID and permissions are not merged. The whole batch is confirmed in one operation.')));
     for(const c of p.cases){
      const card=el('section','identity-bulk-case');
      card.append(el('h3','dup-name',(c.index+1)+'. '+c.profile.name),el('p','dup-help',c.profile.aliases.join(' · ')));
      const details=el('details',''),label=el('summary','',text('Ver toda la información que se conserva','View all retained information'));
      const values=el('dl','identity-values');
      for(const [k,v]of Object.entries(c.profile.fields))values.append(el('dt','',k),el('dd','',valueText(v)));
      details.append(label,values);card.append(details);
      for(const [key,conflict]of Object.entries(c.profile.alternatives)){
       const field=el('label','identity-field',conflict.path.join(' · ')+text(' · Valor principal',' · Primary value')),select=el('select','dup-decision');
       conflict.values.forEach((v,i)=>{const o=el('option','',valueText(v.value)+' — '+v.from.join('; '));o.value=String(i);select.append(o);});
       select.value=String(groups[c.index].choices?.[key]||0);
       select.onchange=()=>{
        const next=groups.map((g,i)=>i===c.index?{...g,choices:{...g.choices,[key]:Number(select.value)}}:g);bulkPreview(next);
       };
       field.append(select,el('small','dup-help',text('Las otras variantes también se conservan.','All other variants are also retained.')));card.append(field);
      }
      card.append(button(text('Usar el otro nombre como principal','Use the other primary name'),()=>bulkPreview(groups.map((g,i)=>i===c.index?{refs:[...g.refs].reverse(),choices:{}}:g))));
      d.body.append(card);
     }
     d.foot.append(button(text('Volver a la selección','Back to selection'),()=>directory('duplicates')));
     const confirm=button(text('Confirmar las ','Confirm ')+p.summary.cases+text(' fusiones',' merges'),async()=>{
      if(d.closed)return;d.busy(true);d.status.textContent=text('Guardando el lote completo… No cierres esta ventana.','Saving the complete batch… Keep this window open.');
      try{
       const result=await U.committed('/api/liga?operacion=identities',{mode:'bulk-commit',ligaId:ctx.ligaId,groups,digest:p.digest,operationId:crypto.randomUUID()},ctx);
       bulkSelection.clear();U.applied(d,result);
       d.body.prepend(el('p','dup-summary',p.summary.cases+' '+text('fusiones guardadas en una única operación.','merges saved in one operation.')));
      }catch(e){d.busy(false);confirm.disabled=true;status(e);}
     },true);confirm.dataset.identityBulkConfirm='true';d.foot.append(confirm);
     d.status.textContent=text('Vista previa completa. Todavía no se fusionó ningún perfil.','Complete preview. No profiles have been merged yet.');
    }catch(e){
     if(d.closed||seq!==sequence)return;
     d.body.replaceChildren(el('p','dup-warning',text('No se pudo preparar el lote. Ninguna fusión fue aplicada.','The batch could not be prepared. No merge was applied.')));
     status(e);d.foot.append(button(text('Volver a la selección','Back to selection'),()=>directory('duplicates')));
    }
   }
   async function decisionReview(refs,statusValue){
    const seq=++sequence;footer();d.body.replaceChildren(el('p','dup-help',text('Preparando la decisión…','Preparing the decision…')));
    try{
     const p=await U.post('/api/liga?operacion=identities',{mode:'preview',kind:'decision',ligaId:ctx.ligaId,refs,status:statusValue},ctx);if(d.closed||seq!==sequence)return;
     const copy=statusValue==='distinct'?text('Son personas distintas. Esta pareja no volverá a aparecer como sugerencia pendiente.','These are different people. This pair will not reappear as a pending suggestion.'):statusValue==='later'?text('El caso queda pendiente. No se modifica ningún perfil.','This case stays pending. No profile is modified.'):text('La pareja volverá a estar disponible para revisión.','This pair becomes available for review again.');
     d.body.replaceChildren(el('p','dup-summary',copy));d.foot.append(button(text('Volver','Back'),()=>directory(mode)));
     const confirm=button(text('Guardar decisión','Save decision'),async()=>{
      d.busy(true);
      try{await U.committed('/api/liga?operacion=identities',{mode:'commit',kind:'decision',ligaId:ctx.ligaId,refs,status:statusValue,digest:p.digest,operationId:crypto.randomUUID()},ctx);d.busy(false);await directory(mode);d.status.textContent=text('Decisión guardada en el servidor.','Decision saved on the server.');}catch(e){d.busy(false);confirm.disabled=true;status(e);}
     },true);d.foot.append(confirm);
    }catch(e){status(e);d.foot.append(button(text('Volver','Back'),()=>directory(mode)));}
   }
   async function operations(){
    const seq=++sequence;footer();d.body.replaceChildren(el('p','dup-help',text('Leyendo operaciones…','Reading operations…')));
    try{
     const out=await U.post('/api/liga?operacion=identities',{mode:'operations',ligaId:ctx.ligaId},ctx);if(d.closed||seq!==sequence)return;
     d.body.replaceChildren();nav();d.body.append(el('p','dup-warning',text('Deshacer solo se permite si no hubo cambios posteriores en las ligas afectadas ni en las identidades. Nunca se pisan cambios posteriores automáticamente.','Undo is only allowed if affected leagues and identities have no later changes. Later work is never overwritten automatically.')));
     for(const r of out.operations){const card=el('article','dup-card');card.append(el('strong','dup-name',(r.summary?.bulk?text('Fusión masiva · ','Bulk merge · ')+r.summary.cases:r.kind)+' · '+r.createdAt),el('p','dup-help',r.id),button(text('Revisar cómo deshacer','Review undo'),()=>undo(r.id)));d.body.append(card);}
     if(!out.operations.length)d.body.append(el('p','dup-empty',text('Todavía no hay operaciones de esta versión.','No operations from this release yet.')));
    }catch(e){status(e);}
   }
   async function undo(id){
    try{
     const p=await U.post('/api/liga?operacion=identities',{mode:'undo-preview',ligaId:ctx.ligaId,undoId:id},ctx);if(d.closed)return;footer();
     d.body.replaceChildren(el('p','dup-summary',text('Se restaurará la copia previa de esta operación: ','The prior snapshot of this operation will be restored: ')+id),el('p','dup-help',text('Las contraseñas, los permisos y los dispositivos no se restablecen.','Passwords, permissions and devices are not reset.')));
     d.foot.append(button(text('Volver','Back'),operations));const confirm=button(text('Confirmar deshacer','Confirm undo'),async()=>{
      d.busy(true);try{const r=await U.committed('/api/liga?operacion=identities',{mode:'undo-commit',ligaId:ctx.ligaId,undoId:id,digest:p.digest,operationId:crypto.randomUUID()},ctx);U.applied(d,r);}catch(e){d.busy(false);confirm.disabled=true;status(e);}
     },true);d.foot.append(confirm);
    }catch(e){status(e);}
   }
   if(initialRefs)await preview(initialRefs);else await directory(mode);
  }catch(e){if(d&&!d.closed)d.status.textContent=e.message;else{U.end();toast(e.message);}}
 }
 async function profile(name){
  const U=ui();let ctx,d;
  try{
   ctx=await U.begin();d=U.modal(U.text('Ficha unificada y variantes','Unified profile and variants'));d.onClose=U.end;
   const out=await U.post('/api/liga?operacion=identities',{mode:'profile',ligaId:ctx.ligaId,name},ctx);if(d.closed)return;
   if(!out.profile){d.body.append(U.el('p','dup-help',U.text('Esta ficha todavía no tiene una fusión deportiva.','This profile has no sporting merge yet.')));return;}
   const p=out.profile;d.body.append(U.el('h3','dup-summary',p.name),U.el('p','dup-help',p.aliases.join(' · ')));
   const list=U.el('dl','identity-values');for(const [k,v]of Object.entries(p.fields||{}))list.append(U.el('dt','',k),U.el('dd','',valueText(v)));d.body.append(list);
   for(const v of Object.values(p.alternatives||{})){d.body.append(U.el('h4','dup-name',v.path.join(' · ')));for(const x of v.values)d.body.append(U.el('p','dup-help',valueText(x.value)+' — '+x.from.join('; ')));}
  }catch(e){if(d&&!d.closed)d.status.textContent=e.message;else{U.end();toast(e.message);}}
 }
 root.SohailIdentity=Object.freeze({open,historical:name=>open('historical',null,name||''),pair:refs=>open('duplicates',refs),profile,refKey,pairKey});
})(typeof window!=='undefined'?window:globalThis);
