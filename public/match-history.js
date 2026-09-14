/* Sohail v3.2 — historial y estadísticas de la liga seleccionada.
   SOLO lectura de matches: no cambia puntuación, rating, permisos ni estado.
   Se incluyen todos los ciclos y ambos cuadros, independientes de viewCycle.
   El historial conserva W.O./NJ; las estadísticas de juego los separan.
   Ningún dato ni preferencia personal se escribe en almacenamiento persistente. */
(function(root,factory){
 'use strict';
 const data=factory();
 if(typeof module==='object'&&module.exports)module.exports=data;
 else root.SohailHistoryData=data;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const players=m=>m?.po?(Array.isArray(m.poNames)?m.poNames.slice(0,2):[]):[m?.aName,m?.bName];
 const pairs=m=>(Array.isArray(m?.sets)?m.sets:[]).filter(s=>Array.isArray(s)&&s.length===2&&s.every(v=>Number.isSafeInteger(v)&&v>=0));
 const kind=m=>m?.np?'np':m?.wo?(pairs(m).some(s=>s[0]||s[1])?'ret':'wo'):'normal';
 function dateKey(value){
  // ISO date is a local calendar date, not an instant. Never shift it by timezone.
  if(typeof value!=='string')return '';
  const a=value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/),b=value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!a&&!b)return '';
  const y=Number(a?a[1]:b[3]),m=Number(a?a[2]:b[2]),d=Number(a?a[3]:b[1]);
  if(y<1000||m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate())return '';
  return String(y)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
 }
 function newest(a,b){
  const ad=dateKey(a?.date),bd=dateKey(b?.date);
  if(ad!==bd)return bd.localeCompare(ad);
  const ai=Number(a?.id),bi=Number(b?.id);
  if(Number.isFinite(ai)&&Number.isFinite(bi)&&ai!==bi)return bi-ai;
  return String(b?.id??'').localeCompare(String(a?.id??''));
 }
 function records(source,name,scope='all'){
  return (Array.isArray(source)?source:[]).filter(m=>m&&players(m).length===2&&players(m).every(n=>typeof n==='string'&&n.length)&&
   (!name||players(m).includes(name))&&(scope==='all'||scope==='po'&&m.po||scope==='main'&&m.po&&m.which!=='cons'||scope==='cons'&&m.po&&m.which==='cons'||scope.startsWith('cycle:')&&!m.po&&String(m.cycle)===scope.slice(6))).slice().sort(newest);
 }
 const validSet=s=>{const hi=Math.max(...s),lo=Math.min(...s);return hi===6&&lo<=4||hi===7&&(lo===5||lo===6);};
 function winner(m){
  const ns=players(m),ss=pairs(m),type=kind(m);
  if(type==='np')return null;
  if(type==='wo'||type==='ret'){
   if(ns.includes(m.winner))return m.winner;
   if(ns.includes(m.retiroDe))return ns.find(n=>n!==m.retiroDe)||null;
   return null;
  }
  if(ss.length<2||ss.length>3||!ss.slice(0,2).every(validSet))return null;
  const split=(ss[0][0]>ss[0][1])!==(ss[1][0]>ss[1][1]);
  if(split){if(ss.length!==3||!((ss[2][0]===1&&ss[2][1]===0)||(ss[2][0]===0&&ss[2][1]===1)))return null;return ns[ss[2][0]>ss[2][1]?0:1];}
  if(ss.length!==2)return null;return ns[ss[0][0]>ss[0][1]?0:1];
 }
 function summarize(list,name){
  const out={registered:list.length,played:0,wins:0,losses:0,pending:0,disputed:0,wo:0,np:0,unresolved:0,setsFor:0,setsAgainst:0,gamesFor:0,gamesAgainst:0,stbFor:0,stbAgainst:0,fullSets:0,games:0,stb:0};
  for(const m of list){
   if(m.status!=='confirmed'){if(m.status==='disputed')out.disputed++;else out.pending++;continue;}
   const type=kind(m);if(type==='np'){out.np++;continue;}if(type==='wo'){out.wo++;continue;}
   const who=winner(m);if(!who){out.unresolved++;continue;}
   out.played++;if(name){if(who===name)out.wins++;else out.losses++;}
   const isB=name&&players(m)[1]===name,ss=pairs(m);
   for(const s of ss.slice(0,2)){
    if(!validSet(s))continue;
    const a=s[isB?1:0],b=s[isB?0:1];out.fullSets++;out.games+=a+b;
    if(name){out.gamesFor+=a;out.gamesAgainst+=b;if(a>b)out.setsFor++;else out.setsAgainst++;}
   }
   if(type==='normal'&&ss.length===3){out.stb++;if(name){const s=ss[2];if(s[isB?1:0]>s[isB?0:1])out.stbFor++;else out.stbAgainst++;}}
  }
  out.pct=name&&out.wins+out.losses?Math.round(100*out.wins/(out.wins+out.losses)):null;
  return out;
 }
 return Object.freeze({players,pairs,kind,dateKey,newest,records,winner,summarize});
});
(function(global){
 'use strict';if(typeof document==='undefined')return;
 const D=global.SohailHistoryData,e=v=>attr(String(v??''));
 const dictionaries={es:{
 mh_history:'Historial',mh_stats:'Estadísticas',mh_scope:'Liga seleccionada · Todos los ciclos y playoffs',mh_league_note:'Este historial pertenece a la liga seleccionada. Para otra liga, usá el selector de ligas.',mh_all:'Todos los ciclos y playoffs',mh_filter:'Competición',mh_player:'Jugador',mh_everyone:'Todos los jugadores',mh_search:'Buscar rival, club o marcador',mh_found:'{n} resultados registrados',mh_empty:'Todavía no hay resultados registrados en esta liga.',mh_no_filter:'No hay partidos para estos filtros.',mh_newest:'Del más reciente al más antiguo, por fecha del partido.',mh_unknown_date:'Sin fecha registrada',mh_load_more:'Mostrar más partidos',mh_showing:'Mostrando {shown} de {total}',mh_vs:'contra',mh_played:'Jugados validados',mh_won:'Ganados',mh_lost:'Perdidos',mh_pct:'Victorias',mh_win:'Ganado',mh_loss:'Perdido',mh_review:'Resultado por revisar',mh_wo:'W.O. · no disputado',mh_ret:'RET · retirada',mh_np:'No jugado',mh_by_wo_win:'Ganado por W.O.',mh_by_wo_loss:'Perdido por W.O.',mh_stats_note:'Las estadísticas de juego usan solo resultados validados. W.O. y No jugado se muestran aparte; pendientes y disputas no cuentan como victorias o derrotas. Los supertiebreaks 1–0 / 0–1 no se suman como juegos ni como sets normales.',mh_stat_empty:'Todavía no hay partidos jugados y validados para este filtro.',mh_sets:'Sets y juegos',mh_sf:'Sets ganados',mh_sa:'Sets perdidos',mh_balance:'Balance de sets',mh_gf:'Juegos ganados',mh_ga:'Juegos perdidos',mh_tbw:'Supertiebreaks ganados',mh_tbl:'Supertiebreaks perdidos',mh_summary:'Resumen por fase',mh_groups:'Fase de grupos',mh_main:'Cuadro principal',mh_cons:'Consolación',mh_registers:'Estado de los registros',mh_fullsets:'Sets normales',mh_games:'Juegos disputados',mh_tbs:'Supertiebreaks',mh_form:'Últimos 5 partidos validados',mh_missing:'Registros con marcador incompleto: {n}. Se muestran en el historial pero no se les inventa un ganador.',mh_reset:'Limpiar filtros',mh_all_stats:'Elegí un jugador para ver victorias, derrotas y balances personales.',mh_validation:'Validación',mh_none:'Sin partidos',mh_method:'Cómo se calculan',mh_short_note:'Solo partidos jugados y validados. W.O. y No jugado, aparte.',mh_search_active:'Búsqueda activa'
 },en:{
 mh_history:'History',mh_stats:'Statistics',mh_scope:'Selected league · All cycles and playoffs',mh_league_note:'This history belongs to the selected league. Use the league selector to view another league.',mh_all:'All cycles and playoffs',mh_filter:'Competition',mh_player:'Player',mh_everyone:'All players',mh_search:'Find opponent, club or score',mh_found:'{n} recorded results',mh_empty:'No results have been recorded in this league yet.',mh_no_filter:'No matches for these filters.',mh_newest:'Newest first, ordered by match date.',mh_unknown_date:'No match date recorded',mh_load_more:'Show more matches',mh_showing:'Showing {shown} of {total}',mh_vs:'vs',mh_played:'Validated matches played',mh_won:'Won',mh_lost:'Lost',mh_pct:'Win rate',mh_win:'Won',mh_loss:'Lost',mh_review:'Result needs review',mh_wo:'W.O. · not played',mh_ret:'RET · retirement',mh_np:'Not played',mh_by_wo_win:'Won by W.O.',mh_by_wo_loss:'Lost by W.O.',mh_stats_note:'Playing statistics use validated results only. W.O. and Not played are shown separately; pending and disputed results do not count as wins or losses. A 1–0 / 0–1 match tiebreak does not add games or regular sets.',mh_stat_empty:'No played, validated matches for this filter yet.',mh_sets:'Sets and games',mh_sf:'Sets won',mh_sa:'Sets lost',mh_balance:'Set balance',mh_gf:'Games won',mh_ga:'Games lost',mh_tbw:'Match tiebreaks won',mh_tbl:'Match tiebreaks lost',mh_summary:'Breakdown by stage',mh_groups:'Group stage',mh_main:'Main draw',mh_cons:'Consolation',mh_registers:'Record status',mh_fullsets:'Regular sets',mh_games:'Games played',mh_tbs:'Match tiebreaks',mh_form:'Last 5 validated matches',mh_missing:'Records with incomplete scores: {n}. They remain in the history without an invented winner.',mh_reset:'Clear filters',mh_all_stats:'Choose a player for personal wins, losses and balances.',mh_validation:'Validation',mh_none:'No matches',mh_method:'How these are calculated',mh_short_note:'Played and validated matches only. W.O. and Not played are separate.',mh_search_active:'Search active'
 }};
 Object.keys(dictionaries).forEach(lang=>Object.assign(TRANSLATIONS[lang],dictionaries[lang]));
 let state={key:'',tab:'history',scope:'all',player:'',query:'',limit:30,filtersOpen:false};
 const skey=()=>_saveSessionKey()+'|'+_ligaActual;
 function ensure(){if(state.key!==skey())state={key:skey(),tab:'history',scope:'all',player:'',query:'',limit:30,filtersOpen:false};return state;}
 function selectedPlayer(){return esAdmin(currentUser)?state.player:currentUser?.name||'';}
 const option=(value,label,selected)=>'<option value="'+e(value)+'"'+(String(value)===String(selected)?' selected':'')+'>'+e(label)+'</option>';
 function formatDate(value){const key=D.dateKey(value);if(!key)return t('mh_unknown_date');return new Intl.DateTimeFormat(LANG==='en'?'en-GB':'es-ES',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(key+'T12:00:00Z'));}
 function dateGroup(value){const key=D.dateKey(value);return key?new Intl.DateTimeFormat(LANG==='en'?'en-GB':'es-ES',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(key+'T12:00:00Z')):t('mh_unknown_date');}
 function phase(m,groupLabel=groupName){return m.po?(m.tLabel?t('draw')+' '+m.tLabel+' · ':'')+t(m.which==='cons'?'mh_cons':'mh_main'):t('cycle')+' '+m.cycle+' · '+groupLabel(m.g);}
 function score(m,name){const isB=D.players(m)[1]===name;return D.pairs(m).map(s=>s[isB?1:0]+'–'+s[isB?0:1]).join(' / ');}
 function badge(m,name){
  const k=D.kind(m);if(m.status!=='confirmed')return '<span class="badge '+(m.status==='disputed'?'badge-disp':'badge-pend')+'">'+e(t(m.status==='disputed'?'disputed_result':'legend_pending'))+'</span>';
  if(k==='np')return '<span class="badge badge-tag">'+e(t('mh_np'))+'</span>';
  const win=D.winner(m);if(!name||!win)return '<span class="badge badge-tag">'+e(t(win?'validated_result':'mh_review'))+'</span>';
  const won=win===name;return '<span class="badge '+(won?'badge-ok':'badge-disp')+'">'+e(t(k==='wo'?(won?'mh_by_wo_win':'mh_by_wo_loss'):(won?'mh_win':'mh_loss')))+'</span>';
 }
 function matchHTML(m,name,options={}){
  const ns=D.players(m),rival=ns.find(n=>n!==name),title=name?rival:ns.join(' vs '),type=D.kind(m),key=D.dateKey(m.date);
  return '<article class="mh-match" data-history-id="'+e(m.id)+'"><div class="mh-row"><span class="mh-phase">'+e(phase(m,options.groupLabel))+'</span>'+badge(m,name)+'</div><div class="mh-match-players"><div><small>'+e(name?t('mh_vs'):t('re_match'))+'</small><h3>'+e(title)+'</h3></div><strong class="mh-score">'+e(score(m,name)||'—')+'</strong></div>'+(type!=='normal'?'<p class="mh-special">'+e(t('mh_'+type))+'</p>':'')+'<div class="mh-row mh-match-footer"><div class="mh-details"><time'+(key?' datetime="'+key+'"':'')+'>'+e(formatDate(m.date))+'</time><span>'+e(m.club||'—')+'</span></div>'+(options.readOnly?(options.h2h&&rival?'<button class="ui-link-button" type="button" data-mhp-rival="'+e(rival)+'">'+e(t('h2h_title'))+' '+SohailUI.icon('arrow')+'</button>':''):'<button class="ui-link-button" type="button" data-mh-open="'+e(m.id)+'">'+e(t('ui_open_match'))+' '+SohailUI.icon('arrow')+'</button>')+'</div></article>';
 }
 function metric(label,value,cls=''){return '<div class="mh-stat '+cls+'"><strong>'+e(value)+'</strong><span>'+e(t(label))+'</span></div>';}
 function section(title,body){return '<section class="card mh-section"><h2>'+e(t(title))+'</h2>'+body+'</section>';}
 function statHTML(list,name,options={}){
  const s=D.summarize(list,name);
  let h='<div class="mh-stat-grid">'+metric('mh_played',s.played)+(name?metric('mh_won',s.wins,'mh-win')+metric('mh_lost',s.losses,'mh-loss')+metric('mh_pct',s.pct===null?'—':s.pct+'%'):metric('mh_fullsets',s.fullSets)+metric('mh_games',s.games)+metric('mh_tbs',s.stb))+'</div><details class="mh-method"><summary>'+e(t('mh_method'))+'</summary><p class="mh-note">'+e(t('mh_stats_note'))+'</p></details><p class="mh-note">'+e(t('mh_short_note'))+'</p>';
  if(!s.played)h+='<p class="mh-note">'+e(t('mh_stat_empty'))+'</p>';
  if(s.unresolved)h+='<p class="alert alert-warn">'+e(tf('mh_missing',{n:s.unresolved}))+'</p>';
  if(name){
   const values=[['mh_sf',s.setsFor],['mh_sa',s.setsAgainst],['mh_balance',s.setsFor-s.setsAgainst],['mh_gf',s.gamesFor],['mh_ga',s.gamesAgainst],['mh_tbw',s.stbFor],['mh_tbl',s.stbAgainst]];
   h+=section('mh_sets','<dl class="mh-numbers">'+values.map(([k,v])=>'<div><dt>'+e(t(k))+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>');
   const last=list.filter(m=>m.status==='confirmed'&&!['wo','np'].includes(D.kind(m))&&D.winner(m)).slice(0,5);
   h+=section('mh_form','<div class="mh-form">'+(last.map(m=>(options.readOnly?'<span role="img"':'<button type="button" data-mh-open="'+e(m.id)+'"')+' class="'+(D.winner(m)===name?'mh-form-win':'mh-form-loss')+'" aria-label="'+e(t(D.winner(m)===name?'mh_win':'mh_loss')+' · '+D.players(m).find(n=>n!==name)+' · '+formatDate(m.date))+'">'+e(t(D.winner(m)===name?'win_short':'loss_short'))+(options.readOnly?'</span>':'</button>')).join('')||'<span>'+e(t('mh_none'))+'</span>')+'</div><p class="mh-note">'+e(t('mh_newest'))+'</p>');
  }else h+='<p class="mh-note">'+e(t('mh_all_stats'))+'</p>';
  h+=section('mh_summary','<div class="mh-phase-grid">'+[['mh_groups',m=>!m.po],['mh_main',m=>m.po&&m.which!=='cons'],['mh_cons',m=>m.po&&m.which==='cons']].map(([k,fn])=>{const v=D.summarize(list.filter(fn),name);return '<div><h3>'+e(t(k))+'</h3><strong>'+v.played+'</strong><span>'+e(t('mh_played'))+'</span>'+(name?'<small>'+v.wins+' '+e(t('mh_won'))+' · '+v.losses+' '+e(t('mh_lost'))+'</small>':'')+'</div>';}).join('')+'</div>');
  h+=section('mh_registers','<dl class="mh-numbers">'+[['ui_pending_count',s.pending],['ui_disputes_count',s.disputed],['mh_wo',s.wo],['mh_np',s.np]].map(([k,v])=>'<div><dt>'+e(t(k))+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>');return h;
 }
 function dataset(){const name=selectedPlayer(),base=D.records(matches,name,state.scope);return{base,name,list:!state.query?base:base.filter(m=>(D.players(m).join(' ')+' '+(m.club||'')+' '+(m.date||'')+' '+score(m,name).replace(/–/g,'-')).toLocaleLowerCase(LANG).includes(state.query.toLocaleLowerCase(LANG).replace(/–/g,'-')))};}
 function paint(){
  const host=document.getElementById('mh-panel');if(!host||!currentUser)return;
  const {name,base,list}=dataset();
  const filterLabel=document.getElementById('mh-filter-label'),sel=document.getElementById('mh-scope');if(filterLabel)filterLabel.textContent=(sel?.selectedOptions[0]?.textContent||t('mh_all'))+(name&&esAdmin(currentUser)?' · '+name:'')+(state.query&&state.tab==='history'?' · '+t('mh_search_active'):'');
  host.setAttribute('aria-labelledby','mh-tab-'+state.tab);
  document.querySelectorAll('[data-mh-tab]').forEach(b=>{const on=b.dataset.mhTab===state.tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
  const search=document.getElementById('mh-search-wrap');if(search)search.hidden=state.tab!=='history';
  if(state.tab==='stats'){host.innerHTML=statHTML(base,name);return;}
  const visible=list.slice(0,state.limit);let group='',rows='';
  for(const m of visible){const label=dateGroup(m.date);if(label!==group){rows+='<h2 class="mh-month">'+e(label)+'</h2>';group=label;}rows+=matchHTML(m,name);}
  host.innerHTML='<div class="mh-list-heading"><p>'+e(tf('mh_found',{n:list.length}))+'</p><small>'+e(t('mh_newest'))+'</small></div>'+(rows||'<div class="card empty">'+e(t(state.scope!=='all'||state.query?'mh_no_filter':'mh_empty'))+'</div>')+'<div class="mh-more"><span>'+e(tf('mh_showing',{shown:visible.length,total:list.length}))+'</span>'+(visible.length<list.length?'<button type="button" class="btn" data-mh-more>'+e(t('mh_load_more'))+'</button>':'')+'</div>';
 }
 function render(){
  if(!currentUser||_ligaReadOnly)return;
  ensure();const host=document.getElementById('view-partidos');if(!host)return;
  const admin=esAdmin(currentUser),cy=(cycles||[]).filter(c=>c?.n!=null);
  const scopes=[['all',t('mh_all')],...cy.map(c=>['cycle:'+c.n,t('cycle')+' '+c.n]),['po',t('playoffs')],['main',t('mh_main')],['cons',t('mh_cons')]];
  const people=[...new Set((matches||[]).flatMap(m=>D.players(m)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,LANG));
  if(!scopes.some(s=>s[0]===state.scope))state.scope='all';if(admin&&state.player&&!people.includes(state.player))state.player='';
  host.innerHTML='<header class="ui-page-head mh-page-head"><div><p class="ui-eyebrow">'+e(document.getElementById('hdr-title')?.textContent?.trim()||(typeof LEAGUE_NAME==='string'?LEAGUE_NAME:''))+'</p><h1>'+e(t(admin?'ui_matches':'ui_my_matches'))+'</h1><p>'+e(t('mh_scope'))+'</p></div><button type="button" class="btn btn-primary" data-ui-route="cargar">'+SohailUI.icon('matches')+e(t('ui_start'))+'</button></header><div class="mh-tabs" role="tablist" aria-label="'+e(t('ui_matches'))+'"><button type="button" id="mh-tab-history" role="tab" data-mh-tab="history" aria-controls="mh-panel">'+SohailUI.icon('matches')+e(t('mh_history'))+'</button><button type="button" id="mh-tab-stats" role="tab" data-mh-tab="stats" aria-controls="mh-panel">'+SohailUI.icon('league')+e(t('mh_stats'))+'</button></div><details class="mh-filter-panel"'+(state.filtersOpen?' open':'')+'><summary><span>'+e(t('ui_filters'))+'</span><small id="mh-filter-label"></small></summary><div class="mh-filters"><label for="mh-scope">'+e(t('mh_filter'))+'<select id="mh-scope">'+scopes.map(([v,n])=>option(v,n,state.scope)).join('')+'</select></label>'+(admin?'<label for="mh-player">'+e(t('mh_player'))+'<select id="mh-player">'+option('',t('mh_everyone'),state.player)+people.map(n=>option(n,n,state.player)).join('')+'</select></label>':'')+'<label id="mh-search-wrap" for="mh-search">'+e(t('mh_search'))+'<input type="search" id="mh-search" value="'+e(state.query)+'" autocomplete="off"></label><button type="button" class="ui-link-button" data-mh-clear>'+e(t('mh_reset'))+'</button></div></details><div id="mh-panel" role="tabpanel" tabindex="0"></div><p class="mh-note mh-league-note">'+e(t('mh_league_note'))+'</p>';
  const filters=host.querySelector('.mh-filter-panel');filters.ontoggle=()=>state.filtersOpen=filters.open;
  host.onclick=ev=>{const b=ev.target.closest('button');if(!b)return;
   if(b.dataset.mhTab){state.tab=b.dataset.mhTab;paint();}
   else if(b.hasAttribute('data-mh-more')){state.limit+=30;const scroll=window.scrollY;paint();window.scrollTo({top:scroll,behavior:'auto'});host.querySelector('[data-mh-more]')?.focus({preventScroll:true});}
   else if(b.hasAttribute('data-mh-open')){const m=dataset().base.find(m=>String(m.id)===b.dataset.mhOpen);if(m)openModal(m.id);}
   else if(b.hasAttribute('data-mh-clear')){state.scope='all';state.query='';state.player='';state.limit=30;render();document.getElementById('mh-scope')?.focus({preventScroll:true});}
  };
  host.oninput=ev=>{if(ev.target.id==='mh-search'){state.query=ev.target.value;state.limit=30;paint();}};
  host.onchange=ev=>{if(ev.target.id==='mh-scope')state.scope=ev.target.value;else if(ev.target.id==='mh-player')state.player=ev.target.value;else return;state.limit=30;paint();};
  host.onkeydown=ev=>{const b=ev.target.closest('[data-mh-tab]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;ev.preventDefault();state.tab=ev.key==='Home'?'history':ev.key==='End'?'stats':state.tab==='history'?'stats':'history';paint();document.getElementById('mh-tab-'+state.tab)?.focus({preventScroll:true});};
  paint();
 }
 // v3.3 — per-player sporting card. Uses the same read-only data engine and
 // statHTML as My matches, with independent DOM/filters and NO account switching.
 Object.assign(TRANSLATIONS.es,{
  mhp_title:'Historial y estadísticas',mhp_scope:'Información deportiva · Solo consulta',
  mhp_context:'Estás viendo a {name}',mhp_empty:'No hay resultados registrados para este jugador en esta competición.',
  mhp_back:'Volver a la ficha',mhp_rating:'Rating / nivel',mhp_current:'Liga seleccionada',
  mhp_past:'Otra liga · Solo consulta'
 });
 Object.assign(TRANSLATIONS.en,{
  mhp_title:'Match history and statistics',mhp_scope:'Sporting information · Read only',
  mhp_context:'Viewing {name}',mhp_empty:'There are no recorded results for this player in this competition.',
  mhp_back:'Back to player',mhp_rating:'Rating / level',mhp_current:'Selected league',
  mhp_past:'Other league · Read only'
 });
 let playerViewId=0;
 function mountPlayer(host,options){
  if(!host||!options||typeof options.name!=='string'||!options.name.trim())return false;
  if(typeof host._mhPlayerDispose==='function')host._mhPlayerDispose();
  const name=options.name,id='mhp-'+(++playerViewId),key=_saveSessionKey(),league=_ligaActual;
  const view={tab:'history',scope:'all',limit:30};
  const groupLabel=options.groupLabel||groupName;
  // Capture only match records and cycle descriptors supplied by existing readers.
  // No fetch is needed to inspect somebody in the currently selected league.
  const source=()=>typeof options.records==='function'?options.records():options.records||[];
  const valid=()=>host.isConnected&&key===_saveSessionKey()&&league===_ligaActual;
  const cyclesList=Array.isArray(options.cycles)?options.cycles:[];
  const scopeOptions=()=>[['all',t('mh_all')],...cyclesList.filter(c=>c&&c.n!=null).map(c=>['cycle:'+c.n,t('cycle')+' '+c.n]),['po',t('playoffs')],['main',t('mh_main')],['cons',t('mh_cons')]];
  host.classList.add('mh-player-view');host.dataset.playerName=name;
  function paintPanels(){
   if(!valid())return;
   const list=D.records(source(),name,view.scope);
   host.querySelectorAll('[data-mhp-tab]').forEach(b=>{const on=b.dataset.mhpTab===view.tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
   const history=host.querySelector('[data-mhp-panel=history]'),stats=host.querySelector('[data-mhp-panel=stats]');
   history.hidden=view.tab!=='history';stats.hidden=view.tab!=='stats';
   if(view.tab==='stats'){stats.innerHTML=statHTML(list,name,{readOnly:true});return;}
   let month='',rows='';
   for(const m of list.slice(0,view.limit)){
    const label=dateGroup(m.date);
    if(label!==month){rows+='<h2 class="mh-month">'+e(label)+'</h2>';month=label;}
    rows+=matchHTML(m,name,{readOnly:true,h2h:!!options.h2h,groupLabel});
   }
   history.innerHTML='<div class="mh-list-heading"><p>'+e(tf('mh_found',{n:list.length}))+'</p><small>'+e(t('mh_newest'))+'</small></div>'+
    (rows||'<p class="mh-note mh-player-empty">'+e(t('mhp_empty'))+'</p>')+
    '<div class="mh-more"><span>'+e(tf('mh_showing',{shown:Math.min(view.limit,list.length),total:list.length}))+'</span>'+
    (view.limit<list.length?'<button type="button" class="btn" data-mhp-more>'+e(t('mh_load_more'))+'</button>':'')+'</div>';
  }
  function draw(){
   if(!valid())return;
   host.lang=LANG;
   const rating=options.rating&&typeof ratingFichaHTML==='function'?ratingFichaHTML(name):'';
   host.innerHTML='<div class="mh-player-context"><span class="mh-player-caption">'+e(t(options.otherLeague?'mhp_past':'mhp_current'))+'</span><strong>'+e(options.leagueName||'—')+'</strong><p>'+e(tf('mhp_context',{name}))+'</p><small>'+e(t('mhp_scope'))+'</small></div>'+
    '<div class="mh-tabs mh-player-tabs" role="tablist" aria-label="'+e(t('mhp_title')+' · '+name)+'">'+
    [['history','mh_history','matches'],['stats','mh_stats','league']].map(([tab,label,ic])=>'<button type="button" id="'+id+'-tab-'+tab+'" role="tab" data-mhp-tab="'+tab+'" aria-controls="'+id+'-panel-'+tab+'">'+SohailUI.icon(ic)+e(t(label))+'</button>').join('')+'</div>'+
    '<label class="mh-player-filter" for="'+id+'-scope">'+e(t('mh_filter'))+'<select id="'+id+'-scope" data-mhp-scope>'+scopeOptions().map(([v,lab])=>option(v,lab,view.scope)).join('')+'</select></label>'+
    (rating?'<details class="mh-player-rating"><summary>'+e(t('mhp_rating'))+'</summary>'+rating+'</details>':'')+
    '<div id="'+id+'-panel-history" role="tabpanel" tabindex="0" aria-labelledby="'+id+'-tab-history" data-mhp-panel="history"></div>'+
    '<div id="'+id+'-panel-stats" role="tabpanel" tabindex="0" aria-labelledby="'+id+'-tab-stats" data-mhp-panel="stats" hidden></div>';
   paintPanels();
  }
  host.onclick=ev=>{
   const b=ev.target.closest('button');if(!valid()||!b||!host.contains(b))return;
   if(b.dataset.mhpTab){view.tab=b.dataset.mhpTab;paintPanels();}
   else if(b.hasAttribute('data-mhp-more')){
    view.limit+=30;paintPanels();host.querySelector('[data-mhp-more]')?.focus({preventScroll:true});
   }else if(b.hasAttribute('data-mhp-rival')&&options.h2h){
    const rival=b.dataset.mhpRival;
    if(D.records(source(),name).some(m=>D.players(m).includes(rival)))options.h2h(name,rival);
   }
  };
  host.onchange=ev=>{if(valid()&&ev.target.matches('[data-mhp-scope]')){view.scope=ev.target.value;view.limit=30;paintPanels();}};
  host.onkeydown=ev=>{
   const tab=ev.target.closest('[data-mhp-tab]');
   if(!valid()||!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;
   ev.preventDefault();view.tab=ev.key==='Home'?'history':ev.key==='End'?'stats':view.tab==='history'?'stats':'history';
   paintPanels();host.querySelector('[data-mhp-tab="'+view.tab+'"]')?.focus({preventScroll:true});
  };
  draw();
  // Refresh only this viewer for language changes; never repaint the user's page.
  const languageObserver=new MutationObserver(()=>{
   if(!valid()){dispose();return;}
   const focused=host.contains(document.activeElement)?document.activeElement:null;
   const suffix=focused?.id?.startsWith(id)?focused.id.slice(id.length):'';
   draw();if(suffix)document.getElementById(id+suffix)?.focus({preventScroll:true});
  });
  const modal=document.getElementById('modal-bg'),body=document.getElementById('modal-body');
  const lifecycleObserver=new MutationObserver(()=>{if(!valid()||!modal.classList.contains('open'))dispose();});
  function dispose(){languageObserver.disconnect();lifecycleObserver.disconnect();if(host._mhPlayerDispose===dispose)delete host._mhPlayerDispose;}
  host._mhPlayerDispose=dispose;
  languageObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  if(modal){lifecycleObserver.observe(modal,{attributes:true,attributeFilter:['class']});if(body)lifecycleObserver.observe(body,{childList:true,subtree:true});}
  return true;
 }
 function openPlayer(name){
  if(typeof name!=='string'||!name.trim())return false;
  const overlay=document.getElementById('modal-bg'),body=document.getElementById('modal-body'),actions=document.getElementById('modal-actions'),title=document.getElementById('modal-title');
  if(!overlay||!body||!actions||!title)return false;
  // Derive a sporting view only; do not project email, phone or credentials.
  if(!currentUser&&!_ligaReadOnly)return false;
  const leagueName=document.getElementById('hdr-title')?.textContent?.trim()||LEAGUE_NAME;
  body.replaceChildren();actions.replaceChildren();
  title.textContent=name;
  const sheet=document.createElement('div');sheet.className='mh-player-sheet';
  const current=document.createElement('div'),past=document.createElement('div');past.id='pm-past-wrap';
  sheet.append(current,past);body.append(sheet);
  if(!_ligaReadOnly){const button=document.createElement('button');button.type='button';button.className='btn btn-past';button.textContent=t('past_player_btn');button.onclick=()=>togglePlayerPast(name);actions.appendChild(button);}
  const close=document.createElement('button');close.type='button';close.className='btn';close.textContent=t('close');close.onclick=()=>closeM();actions.appendChild(close);
  overlay.classList.add('open');
  mountPlayer(current,{name,leagueName,cycles,records:()=>matches,rating:RATING_ON,h2h:(a,b)=>{
   // Reuse the existing head-to-head reader, keeping an explicit way back.
   abrirH2H(a,b);
   const back=document.createElement('button');back.type='button';back.className='btn';back.textContent=t('mhp_back');back.onclick=()=>showPlayerHistory(name);actions.prepend(back);
  }});
  overlay.querySelector('.modal').scrollTop=0;
  return true;
 }

 global.SohailHistory=Object.freeze({render,openPlayer,mountPlayer});
})(typeof window!=='undefined'?window:globalThis);
