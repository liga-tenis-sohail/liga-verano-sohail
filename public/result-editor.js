/* Carga unificada UI v3: la matriz, los cuadros y la sección Cargar usan este
   mismo editor. Reutiliza SohailScore y /api/save; no hay campos extra de TB.
   Solo se confirma visualmente después de _criticalSave(). */
(function(global){
 'use strict';
 Object.assign(TRANSLATIONS.es,{
 re_title:'Cargar resultado',re_edit:'Editar resultado',re_intro:'Elegí el club, revisá la fecha y cargá los dos sets.',re_club:'Club',re_choose_club:'Elegir club',re_club_help:'Obligatorio. Seleccionalo para este partido; no recordamos el anterior.',re_date:'Fecha del partido',re_players:'Jugadores',re_match:'Partido',re_a:'Jugador A',re_b:'Jugador B',re_choose_player:'Elegir jugador',re_choose_match:'Elegir partido',re_score:'Resultado del partido',re_format:'Dos sets. Si gana uno cada jugador, se define con supertiebreak.',re_stb:'Supertiebreak',re_stb_help:'Supertiebreak: se valida únicamente 1–0 o 0–1.',re_tb_help:'7–6 o 6–7 es suficiente: no se pide el tanteo del tiebreak.',re_stb_winner:'¿Quién ganó el supertiebreak?',re_choose_winner:'Elegir ganador',re_special:'Tipo de resultado',re_normal:'Partido completo',re_wo:'W.O. · no se jugó',re_ret:'RET · retirada',re_no_show:'¿Quién no se presentó?',re_retired:'¿Quién se retiró?',re_ret_help:'Se mantiene el formato de la liga: registrá los sets completos previos al retiro. Dejá vacíos los que no se jugaron.',re_wo_help:'No se registran sets. Elegí quién no se presentó; su rival será el ganador.',re_ret_error:'Revisá la retirada: solo sets completos anteriores al retiro, sin un tercer set normal.',re_special_need:'Elegí el jugador que no se presentó o se retiró.',re_review:'Revisar antes de guardar',re_save:'Guardar resultado',re_saving:'Guardando…',re_cancel:'Cancelar',re_reset:'Limpiar',re_confirmed:'Resultado guardado y validado.',re_pending:'Resultado guardado. Queda pendiente de validación.',re_failed:'No se pudo confirmar el guardado. El formulario conserva tus datos.',re_context_changed:'El partido o su contexto cambió. Cerrá y volvé a abrirlo antes de guardar.',re_session:'Tu sesión o la liga cambió. Volvé a abrir el formulario.',re_readonly:'Este ciclo o liga es de solo consulta. No se habilita edición desde este formulario.',re_not_yours:'Solo podés cargar tus propios partidos.',re_date_error:'Elegí una fecha de partido válida.',re_club_error:'Elegí un club para este partido.',re_discard:'Tenés un resultado sin enviar. ¿Descartar este borrador?',re_empty:'No hay partidos disponibles en este contexto.',re_scope:'Se guardará en {scope}.',re_different:'Los jugadores deben ser distintos y pertenecer al grupo.',re_disputed:'El resultado está en disputa. Solo un administrador puede resolverlo.',re_consolation:'Consolación',re_main:'Cuadro principal',re_saved_scope:'{scope} · {message}',re_field_error:'Revisá los campos señalados.',re_no_third:'Partido definido en dos sets. No se necesita supertiebreak.',re_pick_group:'Elegir grupo'
 });
 Object.assign(TRANSLATIONS.en,{
 re_title:'Report result',re_edit:'Edit result',re_intro:'Choose the club, check the date and enter the two sets.',re_club:'Club',re_choose_club:'Choose club',re_club_help:'Required. Choose it for this match; the previous selection is not reused.',re_date:'Match date',re_players:'Players',re_match:'Match',re_a:'Player A',re_b:'Player B',re_choose_player:'Choose player',re_choose_match:'Choose match',re_score:'Match result',re_format:'Two sets. If each player wins one, a match tiebreak decides the winner.',re_stb:'Match tiebreak',re_stb_help:'Match tiebreak: only 1–0 or 0–1 is accepted.',re_tb_help:'7–6 or 6–7 is sufficient; no separate tiebreak score is needed.',re_stb_winner:'Who won the match tiebreak?',re_choose_winner:'Choose winner',re_special:'Result type',re_normal:'Completed match',re_wo:'W.O. · not played',re_ret:'RET · retirement',re_no_show:'Who did not turn up?',re_retired:'Who retired?',re_ret_help:'Keep the league format: record completed sets before retirement. Leave unplayed sets blank.',re_wo_help:'No sets are recorded. Choose who did not turn up; their opponent wins.',re_ret_error:'Check the retirement: completed sets before retirement only, without a third full set.',re_special_need:'Choose the player who did not turn up or retired.',re_review:'Review before saving',re_save:'Save result',re_saving:'Saving…',re_cancel:'Cancel',re_reset:'Clear',re_confirmed:'Result saved and validated.',re_pending:'Result saved. Awaiting validation.',re_failed:'Saving could not be confirmed. Your entries remain in the form.',re_context_changed:'The match or its context changed. Close and reopen it before saving.',re_session:'Your session or league changed. Reopen the form.',re_readonly:'This cycle or league is read only. Editing is not enabled from this form.',re_not_yours:'You can only report your own matches.',re_date_error:'Choose a valid match date.',re_club_error:'Choose a club for this match.',re_discard:'You have an unsent result. Discard this draft?',re_empty:'There are no available matches in this context.',re_scope:'This will be saved in {scope}.',re_different:'Choose two different players in the same group.',re_disputed:'This result is disputed. Only an administrator can resolve it.',re_consolation:'Consolation',re_main:'Main draw',re_saved_scope:'{scope} · {message}',re_field_error:'Check the highlighted fields.',re_no_third:'The match ended in two sets. No match tiebreak is needed.',re_pick_group:'Choose group'
 });
 const e=s=>attr(s==null?'':s), copy=x=>JSON.parse(JSON.stringify(x));
 const instances=new Map();let serial=0;let activeModal=null;
 const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 const names=m=>m.po?m.poNames:[m.aName,m.bName];
 function scope(c){return c.po?t('playoffs')+' · '+(playoff.tramos[c.ti]?.label||'')+' · '+t(c.which==='cons'?'re_consolation':'re_main'):t('cycle')+' '+c.cycle+' · '+groupName(c.gid||1);}
 function existingFor(c){if(c.editId!=null)return matches.find(m=>m.id===c.editId);return matches.find(m=>c.po?m.po&&m.ti===c.ti&&m.which===c.which&&names(m)?.includes(c.a)&&names(m)?.includes(c.b):!m.po&&m.cycle===c.cycle&&m.g===c.gid&&names(m).includes(c.a)&&names(m).includes(c.b));}
 function context(c){
  c={...c};if(c.existing!=null){const m=matches.find(m=>m.id===c.existing);if(!m)return null;c={editId:m.id,cycle:m.cycle,gid:m.g,a:names(m)[0],b:names(m)[1],po:!!m.po,ti:m.ti,which:m.which,ri:m.ri,mi:m.mi};}
  if(c.po){const slot=playoff.tramos[c.ti]?.[c.which]?.[c.ri]?.[c.mi];if(slot){c.a=slot.a;c.b=slot.b;}else if(c.a||c.b)return null;}
  if(!c.po){c.cycle=c.cycle||((viewCycle!=='po'&&viewCycle)||activeN);const cy=cycles.find(x=>x.n===c.cycle);c.gid=Number(c.gid)||findLoc(currentUser?.name,c.cycle)?.g||Math.min(selGroup||1,cy?.groups?.length||1);if(!esAdmin(currentUser)&&!c.a)c.a=currentUser?.name;}
  return c;
 }
 function createModel(c,id){const ex=c.a&&c.b?existingFor(c):null;const stored=ex?copy(ex):null;const ns=ex?names(ex):[];let sets=ex?copy(ex.sets||[]):[];if(ns[0]===c.b&&ns[1]===c.a)sets=sets.map(([a,b])=>[b,a]);
  return{id,c:{...c,editId:ex?.id??c.editId},original:stored,league:_ligaActual,key:_saveSessionKey(),club:ex?.club||'',date:ex?.date||today(),sets:[sets[0]||['',''],sets[1]||['','']],stb:sets[2]?sets[2].slice(0,2):['',''],mode:ex?.wo?(ex.sets?.length?'ret':'wo'):'normal',loser:ex?.retiroDe||'',dirty:false,saving:false,host:null};}
 function readModel(m){if(!m.host)return;const q=n=>m.host.querySelector('[data-field="'+n+'"]');const checked=m.host.querySelector('[data-field="club"]:checked');m.club=checked?checked.value:'';for(const k of ['date','loser'])if(q(k))m[k]=q(k).value;for(let j=0;j<2;j++)if(q('stb'+j))m.stb[j]=q('stb'+j).value;for(let i=0;i<2;i++)for(let j=0;j<2;j++)if(q('s'+i+j))m.sets[i][j]=q('s'+i+j).value;}
 function slotOptions(){const out=[];for(let ti=0;ti<(playoff.tramos||[]).length;ti++){const tr=playoff.tramos[ti];for(const which of ['main','cons'])for(let ri=0;ri<(tr[which]||[]).length;ri++)for(let mi=0;mi<tr[which][ri].length;mi++){const s=tr[which][ri][mi];if(!s.a||!s.b)continue;if(!esAdmin(currentUser)&&(![s.a,s.b].includes(currentUser.name)||s.locked))continue;out.push({value:[ti,which,ri,mi].join(':'),label:tr.label+' · '+t(which==='main'?'re_main':'re_consolation')+' · '+s.a+' vs '+s.b});}}return out;}
 function opt(value,label,selected){return '<option value="'+e(value)+'" '+(String(value)===String(selected)?'selected':'')+'>'+e(label)+'</option>';}
 function validation(m){
  const c=m.c;if(m.league!==_ligaActual||m.key!==_saveSessionKey()||!currentUser)return{key:'re_session'};
  if(_ligaReadOnly||!_loadOK)return{key:'re_readonly'};
  if(!c.a||!c.b||c.a===c.b)return{key:'re_different',field:'b'};
  if(!esAdmin(currentUser)&&![c.a,c.b].includes(currentUser.name))return{key:'re_not_yours'};
  const ex=existingFor(c);if(ex&&!esAdmin(currentUser)&&(ex.locked||ex.status==='confirmed'||ex.status==='disputed'))return{key:ex.status==='disputed'?'re_disputed':'re_readonly'};
  if(c.po){const slot=playoff.tramos[c.ti]?.[c.which]?.[c.ri]?.[c.mi];if(!slot||slot.a!==c.a||slot.b!==c.b)return{key:'re_context_changed'};if(!playoff.started&&!(esAdmin(currentUser)&&playoff.preview))return{key:'re_readonly'};}
  else{const cy=cycles.find(x=>x.n===c.cycle),g=cy?.groups?.[c.gid-1];if(!g||![c.a,c.b].every(n=>g.players.includes(n)))return{key:'re_different',field:'b'};if(!(cy.status==='active'||esAdmin(currentUser)&&cy.editMode)||!esAdmin(currentUser)&&(c.cycle!==activeN||playoff.started))return{key:'re_readonly'};}
  if(!CLUBS.some(c=>c.name===m.club))return{key:'re_club_error',field:'club'};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||isNaN(Date.parse(m.date))||new Date(m.date).toISOString().slice(0,10)!==m.date)return{key:'re_date_error',field:'date'};
  if(m.mode!=='normal'&&![c.a,c.b].includes(m.loser))return{key:'re_special_need',field:'loser'};
  let sets=m.sets.map(s=>s.map(v=>v===''?NaN:Number(v)));
  if(m.mode==='wo')return{ok:true,sets:[],winner:m.loser===c.a?c.b:c.a};
  if(m.mode==='ret'){
   sets=m.sets.filter(s=>!s.every(v=>v===''||Number(v)===0)).map(s=>s.map(Number));if(!SohailScore.validRetirement(sets))return{key:'re_ret_error',field:'s00'};return{ok:true,sets,winner:m.loser===c.a?c.b:c.a};
  }
  const split=sets.every(s=>SohailScore.validSet(...s))&&(sets[0][0]>sets[0][1])!==(sets[1][0]>sets[1][1]);
  if(split){
   if(m.stb.some(v=>v===''))return{key:'valid_need_stb',field:'stb'+m.stb.findIndex(v=>v==='')};
   const tb=m.stb.map(Number);
   if(!(tb[0]===1&&tb[1]===0||tb[0]===0&&tb[1]===1))return{key:'valid_stb_only',field:'stb0'};
   sets.push(tb);
  }
  const v=SohailScore.validMatch(sets);if(!v.ok)return{key:v.key,field:v.key==='valid_set2'?'s10':'s00'};
  return{ok:true,sets,winner:[c.a,c.b][SohailScore.winnerIndex(sets)]};
 }
 function snapshotForReview(m){const v=validation(m);return{v,score:m.mode==='wo'?'W.O.':m.sets.map(s=>s.map(v=>v===''?'—':v).join('–')).join(' / ')+(m.mode==='normal'&&m.stb.some(v=>v!=='')?' / '+m.stb.map(v=>v===''?'—':v).join('–'):'')+(m.mode==='ret'?' · RET':'')};}
 function update(m){
  const root=m.host;if(!root?.isConnected)return;if(m.club){root.querySelector('.re-club-fieldset')?.removeAttribute('aria-invalid');root.querySelectorAll('[data-field=club]').forEach(el=>el.removeAttribute('aria-invalid'));}const ints=m.sets.map(s=>s.map(v=>v===''?NaN:Number(v)));const split=m.mode==='normal'&&ints.every(s=>SohailScore.validSet(...s))&&(ints[0][0]>ints[0][1])!==(ints[1][0]>ints[1][1]);
  const stb=root.querySelector('.re-stb');if(stb)stb.hidden=!split;
  const hint=root.querySelector('.re-stb-reference');if(hint)hint.hidden=!split;
  if(!split)m.stb=['',''];
  for(let j=0;j<2;j++){const el=root.querySelector('[data-field="stb'+j+'"]');if(el){el.disabled=!split||m.saving;el.required=split;if(!split){el.value='';el.removeAttribute('aria-invalid');}}}
  const score=root.querySelector('.re-score');if(score)score.hidden=m.mode==='wo';
  const special=root.querySelector('.re-special-person');if(special){special.hidden=m.mode==='normal';special.querySelector('label').textContent=t(m.mode==='wo'?'re_no_show':'re_retired');special.querySelector('p').textContent=t(m.mode==='wo'?'re_wo_help':'re_ret_help');}
  root.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===m.mode?'true':'false'));
  const info=root.querySelector('.re-two-complete');if(info)info.hidden=!(m.mode==='normal'&&!split&&ints.every(s=>SohailScore.validSet(...s)));
  const rev=snapshotForReview(m),summary=root.querySelector('.re-review-data');summary.replaceChildren();
  for(const [k,value]of [[t('re_club'),m.club||'—'],[t('re_date'),m.date||'—'],[t('re_match'),[m.c.a||t('re_a'),m.c.b||t('re_b')].join(' vs ')],[t('re_score'),rev.score]]){const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=value;summary.append(dt,dd);}
  const notice=root.querySelector('.re-scope');notice.textContent=tf('re_scope',{scope:scope(m.c)});
 }
 function clubButtons(m){
  return CLUBS.map((cl,i)=>{
   const id=m.id+'-club-'+i;
   const c=typeof cl.bg==='string'&&/^#[0-9a-f]{3,8}$/i.test(cl.bg)?cl.bg:'var(--action)';
   return '<label class="re-club-option" for="'+id+'"><input id="'+id+'" name="'+m.id+'-club" type="radio" data-field="club" value="'+e(cl.name)+'"'+(cl.name===m.club?' checked':'')+' required aria-describedby="'+m.id+'-club-help"><span class="re-club-button"><span class="re-club-dot" style="background:'+c+'" aria-hidden="true"></span><span class="re-club-name">'+e(cl.name)+'</span><span class="re-club-check" aria-hidden="true">✓</span></span></label>';
  }).join('');
 }
 function draw(m,host,isModal){
  m.host=host;host.dataset.editorId=m.id;host.classList.add('result-editor');const c=m.c,id=m.id;
  const cy=cycles.find(x=>x.n===c.cycle),pl=cy?.groups?.[c.gid-1]?.players?.filter(Boolean)||[];
  const choose=!isModal&&!m.original;
  let chooseHtml='';
  if(choose){if(c.po){chooseHtml='<div class="re-select-context"><label for="'+id+'-pair">'+e(t('re_choose_match'))+'</label><select id="'+id+'-pair" data-context="pair">'+opt('',t('re_choose_match'),'')+slotOptions().map(o=>opt(o.value,o.label,c.ti==null?'':[c.ti,c.which,c.ri,c.mi].join(':'))).join('')+'</select></div>';}
   else chooseHtml='<div class="re-select-context"><label for="'+id+'-group">'+e(t('re_pick_group'))+'</label><select id="'+id+'-group" data-context="group">'+(cy?.groups||[]).map((g,i)=>({g,n:i+1})).filter(v=>esAdmin(currentUser)||v.g.players.includes(currentUser.name)).map(v=>opt(v.n,groupName(v.n),c.gid)).join('')+'</select></div>';
  }
  const player=(side,name)=>choose&&!c.po&&(side==='b'||esAdmin(currentUser))?'<label for="'+id+'-'+side+'" class="ui-sr-only">'+e(t(side==='a'?'re_a':'re_b'))+'</label><select id="'+id+'-'+side+'" data-context="'+side+'" data-field="'+side+'">'+opt('',t('re_choose_player'),name)+pl.filter(n=>(!USERS[n]?.inactive||n===name)&&n!==c[side==='a'?'b':'a']).map(n=>opt(n,n,name)).join('')+'</select>':'<strong>'+e(name||t(side==='a'?'re_a':'re_b'))+'</strong>';
  const num=(i,j)=>'<label for="'+id+'-s'+i+j+'" class="ui-sr-only">'+e([c.a||t('re_a'),c.b||t('re_b')][j])+' · Set '+(i+1)+'</label><input id="'+id+'-s'+i+j+'" data-field="s'+i+j+'" type="number" min="0" max="7" step="1" inputmode="numeric" placeholder="—" value="'+e(m.sets[i][j])+'">';
  const tb=j=>'<label for="'+id+'-stb'+j+'" class="ui-sr-only">'+e(t('re_stb')+' · '+[c.a||t('re_a'),c.b||t('re_b')][j])+'</label><input id="'+id+'-stb'+j+'" data-field="stb'+j+'" type="number" min="0" max="1" step="1" inputmode="numeric" placeholder="—" aria-describedby="'+id+'-stb-help" value="'+e(m.stb[j])+'">';
  host.innerHTML='<div class="re-heading"><span class="ui-brand-mark">'+SohailUI.icon('matches')+'</span><div><h2 id="'+id+'-title">'+e(t(m.original?'re_edit':'re_title'))+'</h2><p>'+e(t('re_intro'))+'</p></div>'+(isModal?'<button type="button" class="re-close" data-close aria-label="'+e(t('close'))+'">'+SohailUI.icon('close')+'</button>':'')+'</div><p class="re-scope"></p>'+chooseHtml+
   '<div class="re-metadata"><fieldset class="re-club-fieldset" aria-describedby="'+id+'-club-help"><legend>'+e(t('re_club'))+' <span aria-hidden="true">*</span></legend><div class="re-club-buttons">'+clubButtons(m)+'</div><p id="'+id+'-club-help" class="re-help">'+e(t('re_club_help'))+'</p></fieldset><div><label for="'+id+'-date">'+e(t('re_date'))+' <span aria-hidden="true">*</span></label><input id="'+id+'-date" type="date" data-field="date" required value="'+e(m.date)+'"></div></div>'+
   '<div class="re-player-heading">'+e(t('re_players'))+'</div><div class="re-players"><div>'+SohailUI.icon('profile')+player('a',c.a)+'</div><span class="re-vs">vs</span><div>'+SohailUI.icon('profile')+player('b',c.b)+'</div></div>'+
   '<fieldset class="re-mode"><legend>'+e(t('re_special'))+'</legend><div>'+['normal','wo','ret'].map(k=>'<button type="button" data-mode="'+k+'" aria-pressed="'+(m.mode===k)+'">'+e(t('re_'+k))+'</button>').join('')+'</div></fieldset>'+
   '<div class="re-score"><h3>'+e(t('re_score'))+'</h3><p class="re-help">'+e(t('re_format'))+'</p><div class="re-score-board"><table class="re-score-table"><caption class="ui-sr-only">'+e(t('re_score'))+'</caption><thead><tr><th scope="col">Set</th><th scope="col" data-player="a">'+e(c.a||t('re_a'))+'</th><th scope="col" data-player="b">'+e(c.b||t('re_b'))+'</th></tr></thead><tbody><tr data-score-row="set1"><th scope="row">Set 1</th><td>'+num(0,0)+'</td><td>'+num(0,1)+'</td></tr><tr data-score-row="set2"><th scope="row">Set 2</th><td>'+num(1,0)+'</td><td>'+num(1,1)+'</td></tr><tr class="re-stb" data-score-row="stb" hidden><th scope="row">'+e(t('re_stb'))+'</th><td>'+tb(0)+'</td><td>'+tb(1)+'</td></tr></tbody></table></div><p id="'+id+'-stb-help" class="re-stb-reference" hidden>'+e(t('re_stb_help'))+'</p><p class="re-help re-tb-info">'+e(t('re_tb_help'))+'</p></div>'+
   '<p class="re-two-complete" hidden>'+SohailUI.icon('check')+e(t('re_no_third'))+'</p><section class="re-special-person" hidden><label for="'+id+'-loser"></label><select data-field="loser" id="'+id+'-loser">'+opt('',t('re_choose_player'),m.loser)+[c.a,c.b].filter(Boolean).map(n=>opt(n,n,m.loser)).join('')+'</select><p></p></section>'+
   '<section class="re-review"><h3>'+SohailUI.icon('check')+e(t('re_review'))+'</h3><dl class="re-review-data"></dl></section><div class="re-error" role="alert" tabindex="-1" hidden></div><div class="re-actions"><button type="button" class="btn" data-close>'+e(t(isModal?'re_cancel':'re_reset'))+'</button><button type="button" class="btn btn-primary" data-save>'+SohailUI.icon('check')+'<span>'+e(t('re_save'))+'</span></button></div>';
  if(isModal)host.closest('dialog').setAttribute('aria-labelledby',id+'-title');
  update(m);
  host.oninput=ev=>{if(ev.target.dataset.field){readModel(m);m.dirty=true;update(m);ev.target.removeAttribute('aria-invalid');}};
  host.onchange=ev=>{const what=ev.target.dataset.context;if(what){const value=ev.target.value;let cc={...m.c,editId:undefined};if(what==='group'){cc.gid=Number(value);cc.a=esAdmin(currentUser)?'':currentUser.name;cc.b='';}else if(what==='pair'){if(!value){cc={po:true};}else{const [ti,which,ri,mi]=value.split(':');cc={po:true,ti:Number(ti),which,ri:Number(ri),mi:Number(mi)};}}else{cc[what]=value;if(cc.a===cc.b)cc[what==='a'?'b':'a']='';}
    const fresh=createModel(context(cc),id);Object.assign(m,fresh);m.host=host;draw(m,host,isModal);return;}
   readModel(m);m.dirty=true;update(m);
  };
  host.onclick=ev=>{const btn=ev.target.closest('button');if(!btn||btn.disabled)return;if(btn.dataset.mode){readModel(m);m.mode=btn.dataset.mode;m.loser='';m.stb=['',''];const l=host.querySelector('[data-field="loser"]');if(l)l.value='';m.dirty=true;update(m);}if(btn.hasAttribute('data-close')){if(isModal)requestClose(m);else if(!m.dirty||confirm(t('re_discard')))reset(m,host);}if(btn.hasAttribute('data-save'))save(m,isModal);};
 }
 function showError(m,key,field){const error=m.host.querySelector('.re-error');error.hidden=false;error.textContent=t(key);if(field){if(field==='club')m.host.querySelector('.re-club-fieldset')?.setAttribute('aria-invalid','true');const el=m.host.querySelector('[data-field="'+field+'"]');if(el){el.setAttribute('aria-invalid','true');el.focus();return;}}error.focus();}
 function isSaving(){return [...instances.values()].some(m=>m.saving);}
 function canLeave(route){if(isSaving())return false;const m=instances.get('re-page');if(route==='cargar'||!m?.dirty||typeof isTutorialRunning==='function'&&isTutorialRunning())return true;if(!confirm(t('re_discard')))return false;instances.delete('re-page');return true;}
 function reset(m,host){const c={...m.c,editId:undefined};if(!c.po)c.b='';else{c.a='';c.b='';delete c.ti;delete c.ri;delete c.mi;}const fresh=createModel(context(c),m.id);Object.assign(m,fresh);draw(m,host,false);}
 function requestClose(m){if(m.saving)return;if(m.dirty&&!confirm(t('re_discard')))return;activeModal?.close();}
 function open(input){
  if(!_token||_ligaReadOnly||!currentUser||isSaving()||typeof isTutorialRunning==='function'&&isTutorialRunning())return;
  const c=context(input);if(!c||!c.a||!c.b){toast(t('re_empty'));return;}
  if(!esAdmin(currentUser)&&![c.a,c.b].includes(currentUser.name)){toast(t('re_not_yours'));return;}
  const existing=existingFor(c);if(existing&&!esAdmin(currentUser)&&['confirmed','disputed'].includes(existing.status)){openModal(existing.id);return;}
  if(activeModal){const old=instances.get(activeModal.dataset.instance);if(old?.dirty&&!confirm(t('re_discard')))return;activeModal.close();}
  closeM();const dlg=document.createElement('dialog'),id='re-modal-'+(++serial);dlg.className='result-dialog';dlg.dataset.instance=id;
  const host=document.createElement('div'),m=createModel(c,id);dlg.append(host);document.body.append(dlg);instances.set(id,m);activeModal=dlg;const previous=document.activeElement;
  draw(m,host,true);dlg.addEventListener('cancel',ev=>{ev.preventDefault();requestClose(m);});dlg.addEventListener('close',()=>{instances.delete(id);if(activeModal===dlg)activeModal=null;dlg.remove();if(previous?.isConnected)previous.focus({preventScroll:true});});
  dlg.showModal();(host.querySelector('[data-field="club"]:checked')||host.querySelector('[data-field="club"]'))?.focus({preventScroll:true});
 }
 function renderPage(input){
  const view=document.getElementById('view-cargar');if(!view)return;
  let host=document.getElementById('result-page');if(!host){host=document.createElement('div');host.id='result-page';view.append(host);}
  let c=context(input||{po:viewCycle==='po',cycle:viewCycle==='po'?undefined:viewCycle}),m=instances.get('re-page');
  if(!c)return;
  const inTour=typeof isTutorialRunning==='function'&&isTutorialRunning();
  if(inTour){m=createModel(c,'re-tour');draw(m,host,false);return;}
  const same=m&&m.league===_ligaActual&&m.key===_saveSessionKey()&&m.c.cycle===c.cycle&&!!m.c.po===!!c.po&&!input;
  if(!same){m=createModel(c,'re-page');instances.set('re-page',m);}else readModel(m);
  draw(m,host,false);
 }
 async function save(m,modal){
  if(m.saving||SohailUI.isBusy()||typeof isTutorialRunning==='function'&&isTutorialRunning())return;
  readModel(m);const valid=validation(m);if(!valid.ok){showError(m,valid.key,valid.field);return;}
  const c={...m.c},read=copy({club:m.club,date:m.date,mode:m.mode,loser:m.loser,sets:valid.sets,winner:valid.winner});const original=m.original?copy(m.original):null;
  m.saving=true;m.host.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);m.host.setAttribute('aria-busy','true');m.host.querySelector('[data-save] span').textContent=t('re_saving');
  let record;
  const saved=await SohailUI.mutation(()=>{
   if(m.key!==_saveSessionKey()||m.league!==_ligaActual)throw Error(t('re_session'));
   const current=existingFor(c);if((original&&!current)||(!original&&current)||original&&JSON.stringify(current)!==JSON.stringify(original))throw Error(t('re_context_changed'));
   const admin=validaAlCargar(c.a,c.b),id=current?.id??matchId++;
   record={...(current||{}),id,sets:copy(read.sets),wo:read.mode!=='normal',date:read.date,club:read.club,reporter:currentUser.name,status:admin?'confirmed':'pending',locked:admin};
   delete record.np;if(admin)record.vBy=currentUser.name;else delete record.vBy;
   if(read.mode!=='normal'){record.retiroDe=read.loser;record.winner=read.winner;}else{delete record.retiroDe;if(!c.po)delete record.winner;}
   if(c.po){Object.assign(record,{po:true,ti:c.ti,which:c.which,ri:c.ri,mi:c.mi,tLabel:playoff.tramos[c.ti].label,poNames:[c.a,c.b],winner:read.winner});delete record.aName;delete record.bName;delete record.cycle;delete record.g;}
   else Object.assign(record,{cycle:c.cycle,g:c.gid,aName:c.a,bName:c.b,po:false});
   const index=matches.findIndex(x=>x.id===id);if(index>=0)matches[index]=record;else matches.push(record);
   if(c.po)applyPoPending(record); // Pending redraws but never advances; confirmed rebuilds both draws.
   addLog(c.po?(admin?'Playoff: validado (admin)':'Playoff: cargado'):(admin?'Liga: validado (admin)':'Liga: cargado'),{a:c.a,b:c.b,sets:record.sets,wo:record.wo,po:!!c.po,grupo:c.gid,cuadro:record.tLabel,which:c.which});
  });
  m.saving=false;if(m.host.isConnected){m.host.removeAttribute('aria-busy');m.host.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);m.host.querySelector('[data-save] span').textContent=t('re_save');}
  if(saved){m.dirty=false;if(modal)activeModal?.close();else reset(m,m.host);const x=window.scrollX,y=window.scrollY;refreshAll();window.scrollTo({left:x,top:y,behavior:'auto'});toast(tf('re_saved_scope',{scope:scope(c),message:t(record.status==='confirmed'?'re_confirmed':'re_pending')}));}
  else if(m.host.isConnected){update(m);showError(m,_saveConflict?'fix_conflict':'re_failed');}
 }
 function translate(){for(const m of instances.values()){if(m.host?.isConnected){readModel(m);draw(m,m.host,m.id!=='re-page');}}}
 global.addEventListener('beforeunload',ev=>{if([...instances.values()].some(m=>m.dirty&&m.key===_saveSessionKey()&&m.league===_ligaActual)){ev.preventDefault();ev.returnValue='';}});
 global.SohailResults={open,renderPage,canLeave,isSaving,translate,validation,update};
})(window);
