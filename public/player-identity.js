/* Sohail v4.2 — up to 300 selected profiles, all leagues and multi-profile groups.
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
  const bulkSelection=new Map(),S=root.SohailIdentitySelection;
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
     if(data.complete!==true)throw Error(text('La lista de ligas está incompleta. No se puede seleccionar ni fusionar hasta recargarla.','The league directory is incomplete. Reload before selecting or merging.'));
     d.body.replaceChildren();nav();
     d.body.append(el('p','identity-directory-scope',data.leagues.length+' '+text('ligas consultadas','leagues read')+' · '+data.records.length+' '+text('fichas de ligas y catálogo. Se incluyen activas, finalizadas y archivadas con acceso autorizado.','league and catalogue records. Includes authorised active, finished and archived leagues.')));
     d.body.append(el('p','dup-help',text('Revisá cada caso: un nombre parecido no prueba que sean la misma persona. Se conservan los datos y el historial; no se mezclan los accesos.','Review each case: similar names do not prove identity. Profile data and history are retained; account access remains separate.')));
     if(!data.superadmin)d.body.append(el('p','dup-help',text('Podés resolver fichas de tus ligas. Una fusión que alcance el catálogo global u otras ligas requiere al superadministrador.','You can resolve profiles in leagues you administer. A merge affecting the global catalogue or other leagues requires the superadministrator.')));
     if(which==='historical'){historical();return;}
     await duplicates();
    }catch(e){if(!d.closed&&seq===sequence&&e.code!=='SCAN_CANCELLED')status(e);}
   }
   async function duplicates(){
    const scanSeq=sequence;
    if(!S)throw Error(text('Falta identity-selection.js. Subí todos los archivos de la actualización.','identity-selection.js is missing. Upload every update file.'));
    const loading=el('p','dup-help',text('Comparando nombres de todas las ligas…','Comparing names across all leagues…'));d.body.append(loading);
    const report=await S.scanAsync(dir.records,root.SohailDuplicates,ctx.ligaId,dir.decisions,{
     cancelled:()=>d.closed||scanSeq!==sequence,
     progress:()=>{loading.textContent=text('Comparando todas las fichas; podés cerrar para cancelar…','Comparing all profiles; close to cancel…');}
    });
    if(d.closed||scanSeq!==sequence)return;loading.remove();
    // Resolved distinct pairs stay hidden unless the admin asks to review them.
    // A larger transitive group remains visible but blocked for explicit review.
    const cases=report.groups.filter(g=>showDecisions||g.nodes.length>2||!g.distinct.length),byKey=new Map(cases.map(g=>[g.key,g]));
    for(const [key]of bulkSelection){const fresh=byKey.get(key);if(!fresh||!fresh.eligible)bulkSelection.delete(key);else bulkSelection.set(key,fresh);}
    d.body.append(el('p','dup-summary',cases.length+' '+text('personas posibles para revisar. Cada caso puede reunir 2, 3 o más perfiles.','possible people to review. Each case can contain 2, 3 or more profiles.')));
    d.body.append(button(showDecisions?text('Ocultar decisiones de personas distintas','Hide distinct-person decisions'):text('Revisar decisiones de personas distintas','Review distinct-person decisions'),()=>{showDecisions=!showDecisions;directory('duplicates');}));
    const controls=new Map(),toolbar=el('div','identity-bulk-toolbar'),counter=el('strong','');counter.setAttribute('aria-live','polite');
    function updateSelection(){
     const count=S.count(bulkSelection);counter.textContent=count+' / '+S.MAX_PROFILES+' '+text('perfiles seleccionados','selected profiles')+' · '+bulkSelection.size+' '+text('personas','people');
     mergeSelected.disabled=!bulkSelection.size;
     for(const [key,{check,g,card}]of controls){
      check.checked=bulkSelection.has(key);check.disabled=!check.checked&&(!g.eligible||count+g.refs.length>S.MAX_PROFILES);
      card.classList.toggle('identity-bulk-selected',check.checked);
     }
    }
    function toggleCase(g,checked){
     if(!checked)bulkSelection.delete(g.key);
     else if(g.eligible&&S.count(bulkSelection)+g.refs.length<=S.MAX_PROFILES)bulkSelection.set(g.key,g);
     else d.status.textContent=text('El máximo es 300 perfiles por lote. Quitá un caso completo o revisá sus permisos.','A batch can contain at most 300 profiles. Remove a complete case or check its permissions.');
     updateSelection();
    }
    const mergeSelected=button(text('Revisar y fusionar seleccionados','Review and merge selected'),()=>bulkPreview(S.batches(bulkSelection)),true);
    mergeSelected.dataset.identityBulkReview='true';
    const all=button(text('Seleccionar todos','Select all'),()=>{
     const result=S.selectAll(cases,bulkSelection);bulkSelection.clear();for(const [key,g]of result.selection)bulkSelection.set(key,g);updateSelection();
     d.status.textContent=text('Se seleccionaron casos de toda la lista, incluidos los que todavía no se muestran. No se fusionó nada.','Selected cases across the entire list, including those not currently displayed. Nothing has been merged.')+
      (result.omitted?' '+result.omitted+' '+text('casos quedan para otro lote por el límite de 300 perfiles.','cases remain for another batch because of the 300-profile limit.'):'')+
      (result.blocked?' '+result.blocked+' '+text('casos excluidos por decisiones de personas distintas o permisos.','cases excluded due to distinct-person decisions or permissions.'):'');
    });all.dataset.identitySelectAll='true';
    toolbar.append(counter,all,button(text('Quitar selección','Clear selection'),()=>{bulkSelection.clear();updateSelection();}),mergeSelected);
    d.body.append(toolbar,el('p','dup-help',text('“Seleccionar todos” incluye toda la lista, hasta 300 perfiles. Cada caso es una persona diferente. Primero revisás la vista previa: seleccionar no fusiona.','“Select all” includes the entire list, up to 300 profiles. Each case is a different person. Review the preview first: selecting does not merge.')));
    if(!cases.length)d.body.append(el('p','dup-empty',text('No hay sugerencias con estos criterios. Podés elegir varios perfiles manualmente en Vincular jugadores históricos.','No suggestions match these criteria. You can choose multiple profiles manually under Link historical players.')));
    const list=el('div','dup-list');let shown=0;
    const more=button(text('Mostrar más','Show more'),add);d.body.append(list,more);
    function add(){
     for(const g of cases.slice(shown,shown+20)){
      const card=el('article','dup-card'),label=el('label','identity-bulk-choice'),check=el('input','');check.type='checkbox';check.dataset.identityBulkCase=g.key;
      label.append(check,el('span','',text('Son la misma persona · incluir los ','Same person · include ')+g.profiles+text(' perfiles en el lote',' profiles in the batch')));
      check.addEventListener('change',()=>toggleCase(g,check.checked));card.append(label);controls.set(g.key,{check,g,card});
      card.append(el('p','dup-summary',g.profiles+' '+text('perfiles para unificar','profiles to unify')+' · '+g.records.length+' '+text('registros de ligas y catálogo','league and catalogue records')));
      const members=el('div','identity-group-members');
      for(const n of g.nodes){const item=el('div','dup-match');item.append(el('strong','dup-name',n.name),el('p','dup-source',n.records.map(r=>r.leagueName||r.leagueId||text('Catálogo global','Global catalogue')).filter((v,i,a)=>a.indexOf(v)===i).join(' · ')));members.append(item);}card.append(members);
      const recordKeys=new Set(g.records.map(r=>r.key));
      if(Object.values(dir.decisions||{}).some(v=>v.status==='later'&&v.keys?.every(k=>recordKeys.has(k))))card.append(el('p','dup-help',text('Incluye fichas pendientes de revisión.','Includes profiles awaiting review.')));
      if(g.distinct.length)card.append(el('p','dup-warning',text('Este grupo contiene personas marcadas como distintas. No se incluye en Seleccionar todos; elegí solo las fichas correctas o revisá la decisión.','This group contains people marked as different. Select all excludes it; choose only the correct profiles or review the decision.')));
      if(g.nodes.some(n=>!n.editable))card.append(el('p','dup-warning',text('Este caso alcanza el catálogo global o ligas fuera de tus permisos. Requiere superadministrador.','This case reaches the global catalogue or leagues outside your permissions. A superadministrator is required.')));
      const actions=el('div','gap-sm'),merge=button(text('Revisar esta fusión','Review this merge'),()=>preview(g.refs,{},'merge'),true);merge.disabled=!g.eligible||g.refs.length>S.MAX_PROFILES;
      actions.append(merge,button(text('Elegir cuáles perfiles unir','Choose profiles to unify'),()=>{++sequence;footer();d.body.replaceChildren();nav();historical(g.records);}),
       button(text('Son personas distintas','Different people'),()=>decisionPair(g,'distinct')),button(text('Revisar más adelante','Review later'),()=>decisionPair(g,'later')));
      card.append(actions);list.append(card);
     }
     shown+=20;more.hidden=shown>=cases.length;updateSelection();
    }
    add();
    if(showDecisions){
     const saved=el('section','identity-decisions');saved.append(el('h3','dup-name',text('Personas distintas · decisiones guardadas','Different people · saved decisions')));
     for(const decision of Object.values(dir.decisions||{})){
      if(decision.status!=='distinct')continue;const people=decision.keys.map(k=>dir.records.find(r=>r.key===k));if(people.some(r=>!r))continue;
      const row=el('div','dup-card');row.append(el('p','dup-help',people.map(r=>r.name+' · '+r.leagueName).join(' / ')),button(text('Volver a revisar','Reopen review'),()=>decisionReview(people.map(r=>r.ref),'review')));saved.append(row);
     }d.body.append(saved);
    }
    d.status.textContent=text('Revisión completa. Seleccionar no guarda cambios; primero se muestra la vista previa.','Complete review. Selection does not save changes; a preview is shown first.');
   }
   function decisionPair(group,status){
    const people=group.nodes.map(n=>n.representative);
    if(people.length===2){decisionReview(people.map(r=>r.ref),status);return;}
    ++sequence;footer();d.body.replaceChildren(el('p','dup-help',text('Elegí las dos fichas a las que corresponde la decisión. No cambia las demás fichas del grupo.','Choose the two profiles this decision applies to. Other profiles in the group are unchanged.')));
    const a=select(text('Primera ficha','First profile'),people),b=select(text('Segunda ficha','Second profile'),people);
    const review=button(text('Revisar decisión','Review decision'),()=>decisionReview([a.value().ref,b.value().ref],status),true);
    const update=()=>{review.disabled=!a.value()||!b.value()||refKey(a.value().ref)===refKey(b.value().ref);};a.select.onchange=update;b.select.onchange=update;update();
    d.body.append(a.label,b.label,review);d.foot.append(button(text('Volver a los casos','Back to cases'),()=>directory('duplicates')));
   }
   function select(labelText,items){
    const label=el('label','identity-field',labelText),s=el('select','dup-decision');label.append(s);
    const blank=el('option','',text('Elegí una ficha…','Choose a profile…'));blank.value='';s.append(blank);
    for(const [i,r]of items.entries()){const o=el('option','',r.name+(r.leagueName?' · '+r.leagueName:''));o.value=String(i);s.append(o);}
    return {label,select:s,value:()=>s.value===''?null:items[Number(s.value)]};
   }
   function historical(records=dir.records){
    mode='historical';
    const candidates=S.nodes(records,ctx.ligaId),selected=new Map();let primary='',shown=50;
    d.body.append(el('h3','dup-summary',text('Unir varios perfiles de una misma persona','Unify multiple profiles of one person')),el('p','dup-warning',text('Elegí 2 o más perfiles de la MISMA persona, hasta 300. Podés combinar todas las temporadas, sin elegir solo dos ligas. No marques personas distintas en esta pantalla.','Choose 2 or more profiles of the SAME person, up to 300. Combine every season, not just two leagues. Do not select different people on this screen.')));
    const searchLabel=el('label','identity-field',text('Buscar por nombre o liga','Search by name or league')),search=el('input','');search.type='search';search.placeholder=text('Nombre, apellido o temporada','First name, surname or season');searchLabel.append(search);
    const counter=el('p','dup-summary');counter.setAttribute('aria-live','polite');
    const primaryLabel=el('label','identity-field',text('Perfil elegido como nombre principal','Profile chosen for the primary name')),primarySelect=el('select','dup-decision');primaryLabel.append(primarySelect);
    const list=el('div','identity-manual-list'),more=button(text('Mostrar más perfiles','Show more profiles'),()=>{shown+=50;render();});
    const action=button(text('Revisar vínculo y datos a conservar','Review link and retained data'),()=>{
     const ordered=[...selected.values()].sort((a,b)=>Number(b.id===primary)-Number(a.id===primary));preview(ordered.map(n=>n.representative.ref),{},'link');
    },true);action.dataset.identityManualReview='true';
    const normal=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    function update(){
     counter.textContent=selected.size+' / '+S.MAX_PROFILES+' '+text('perfiles seleccionados para una persona','profiles selected for one person');
     if(!selected.has(primary))primary=selected.keys().next().value||'';
     primarySelect.replaceChildren();for(const n of selected.values()){const o=el('option','',n.name+' · '+n.representative.leagueName);o.value=n.id;primarySelect.append(o);}primarySelect.value=primary;primarySelect.disabled=!selected.size;
     action.disabled=selected.size<2;
     for(const input of list.querySelectorAll('input[type="checkbox"]'))input.disabled=!input.checked&&(selected.size>=S.MAX_PROFILES||!candidates.find(n=>n.id===input.dataset.identityManualProfile)?.editable);
    }
    function render(){
     const q=normal(search.value),filtered=candidates.filter(n=>n.records.some(r=>normal(r.name+' '+r.leagueName+' '+(r.leagueId||'')).includes(q)));list.replaceChildren();
     for(const n of filtered.slice(0,shown)){
      const row=el('label','identity-manual-row'),check=el('input','');check.type='checkbox';check.dataset.identityManualProfile=n.id;check.checked=selected.has(n.id);
      const copy=el('span','');copy.append(el('strong','dup-name',n.name),el('span','dup-source',n.leagues.join(' · ')||text('Catálogo global','Global catalogue')));
      if(!n.editable)copy.append(el('small','dup-help',text('Requiere superadministrador','Superadministrator required')));
      check.onchange=()=>{if(!check.checked)selected.delete(n.id);else if(n.editable&&selected.size<S.MAX_PROFILES)selected.set(n.id,n);else check.checked=false;update();};row.append(check,copy);list.append(row);
     }
     if(!filtered.length)list.append(el('p','dup-help',text('No hay coincidencias para esta búsqueda.','No matching profiles.')));
     more.hidden=shown>=filtered.length;update();
    }
    const initial=candidates.find(n=>n.records.some(r=>r.leagueId===ctx.ligaId&&r.name===initialCurrentName));if(initial&&initial.editable){selected.set(initial.id,initial);primary=initial.id;}
    search.oninput=()=>{shown=50;render();};primarySelect.onchange=()=>{primary=primarySelect.value;};
    d.body.append(searchLabel,counter,button(text('Quitar selección','Clear selection'),()=>{selected.clear();render();}),list,more,primaryLabel,action);
    d.foot.append(button(text('Volver a todos los casos','Back to all cases'),()=>directory('duplicates')));render();
    d.status.textContent=text('La selección se mantiene al buscar o mostrar más. Todavía no se vinculó ningún perfil.','Selection survives search and pagination. No profiles have been linked yet.');
   }
   function primaryControl(refs,onChange){
    const field=el('label','identity-field',text('Nombre principal entre los perfiles seleccionados','Primary name among selected profiles')),select=el('select','dup-decision');
    refs.forEach((ref,i)=>{const r=dir?.records.find(r=>refKey(r.ref)===refKey(ref));const o=el('option','',(r?.name||ref.name||ref.id)+(r?.leagueName?' · '+r.leagueName:''));o.value=String(i);select.append(o);});
    select.value='0';select.onchange=()=>{const index=Number(select.value);onChange([refs[index],...refs.filter((_,i)=>i!==index)]);};field.append(select);return field;
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
     d.body.append(primaryControl(refs,next=>preview(next,{},kind)));
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
      el('p','dup-help',(p.summary.selectedProfiles||groups.reduce((n,g)=>n+g.refs.length,0))+' '+text('perfiles seleccionados','selected profiles')+' · '+p.summary.members+' '+text('registros conservados','records retained')+' · '+p.summary.leagues.length+' '+text('ligas','leagues')+' · '+p.summary.matches+' '+text('partidos conservados','matches retained')),
      el('p','dup-warning',text('Cada caso puede tener más de dos perfiles y conserva su propia identidad. Se combinan los campos completos y se guardan las variantes y su procedencia. Revisá el valor principal en los campos distintos. No se mezclan contraseñas, Face ID ni permisos. Todo el lote se confirma en una única operación.','Each case may contain more than two profiles and keeps its own identity. Completed fields are combined and every variant and its source is retained. Review the primary value for conflicting fields. Passwords, Face ID and permissions are not merged. The whole batch is confirmed in one operation.')));
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
      card.append(primaryControl(groups[c.index].refs,refs=>bulkPreview(groups.map((g,i)=>i===c.index?{refs,choices:{}}:g))));
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
     d.body.replaceChildren();nav();d.status.textContent='';d.body.append(el('p','dup-warning',text('Deshacer solo se permite si no hubo cambios posteriores en las ligas afectadas ni en las identidades. Nunca se pisan cambios posteriores automáticamente.','Undo is only allowed if affected leagues and identities have no later changes. Later work is never overwritten automatically.')));
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
