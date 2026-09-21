/* Sohail v3.7.1 — historial y estadísticas de la liga seleccionada.
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
 const subject=(m,name)=>name&&typeof m?._mhSubject==='string'?m._mhSubject:name;
 const players=m=>m?.po?(Array.isArray(m.poNames)&&m.poNames.length===2?m.poNames.slice():[]):[m?.aName,m?.bName];
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
  return String(b?._mhKey??b?.id??'').localeCompare(String(a?._mhKey??a?.id??''));
 }
 function records(source,name,scope='all'){
  return (Array.isArray(source)?source:[]).filter(m=>m&&players(m).length===2&&players(m)[0]!==players(m)[1]&&players(m).every(n=>typeof n==='string'&&n.length)&&
   (!name||players(m).includes(subject(m,name)))&&(scope==='all'||scope==='groups'&&!m.po||scope==='po'&&m.po||scope==='main'&&m.po&&m.which!=='cons'||scope==='cons'&&m.po&&m.which==='cons'||scope.startsWith('cycle:')&&!m.po&&String(m.cycle)===scope.slice(6))).slice().sort(newest);
 }
 const validSet=s=>{const hi=Math.max(...s),lo=Math.min(...s);return hi===6&&lo<=4||hi===7&&(lo===5||lo===6);};
 function winner(m){
  const ns=players(m),ss=pairs(m),type=kind(m);
  if(ns.length!==2||ns[0]===ns[1]||ns.some(n=>typeof n!=='string'||!n)||!Array.isArray(m.sets)||ss.length!==m.sets.length||type==='np')return null;
  if(type==='wo'||type==='ret'){
   if(ss.length>2||!ss.every(validSet)||(ss.length===2&&((ss[0][0]>ss[0][1])===(ss[1][0]>ss[1][1]))))return null;
   if(m.winner!=null&&!ns.includes(m.winner)||m.retiroDe!=null&&!ns.includes(m.retiroDe))return null;
   if(m.winner&&m.retiroDe&&m.winner===m.retiroDe)return null;
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
   out.played++;const target=subject(m,name);if(name){if(who===target)out.wins++;else out.losses++;}
   const isB=name&&players(m)[1]===target,ss=pairs(m);
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

 // H2H identity is a profile ID across leagues, or a name scoped to ONE league.
 // Equal names without a shared ID are never merged across seasons.
 function person(name,context={}){
  const u=context.users&&Object.prototype.hasOwnProperty.call(context.users,name)?context.users[name]:null;
  const id=typeof u?.jugadorId==='string'&&u.jugadorId.trim()?u.jugadorId:null;
  return {name,id,leagueId:String(context.id||''),key:JSON.stringify(id?['profile',id]:['league',String(context.id||''),name])};
 }
 function opponent(m,name,context={}){
  const ns=players(m),i=ns.indexOf(subject(m,name));
  if(i<0||ns.length!==2||ns[0]===ns[1])return null;
  const j=1-i,leagueId=String(m._mhLeagueId||context.id||'');
  const stored=Array.isArray(m._mhPlayerIds)?m._mhPlayerIds[j]:null;
  const local=!m._mhLeagueId||leagueId===String(context.id||'');
  const id=typeof stored==='string'&&stored.trim()?stored:(local?person(ns[j],context).id:null);
  return {name:ns[j],id,leagueId,leagueName:m._mhLeagueName||context.nombre||leagueId,
   key:JSON.stringify(id?['profile',id]:['league',leagueId,ns[j]])};
 }
 function headToHead(source,name,rivalKey,context={}){
  const list=records(source,name).filter(m=>opponent(m,name,context)?.key===rivalKey);
  let wins=0,losses=0,wo=0,pending=0,disputed=0,np=0,unresolved=0;
  for(const m of list){
   if(m.status!=='confirmed'){if(m.status==='disputed')disputed++;else pending++;continue;}
   const k=kind(m);if(k==='np'){np++;continue;}
   const w=winner(m);if(!w){unresolved++;continue;}
   if(w===subject(m,name))wins++;else losses++;
   if(k==='wo')wo++;
  }
  return {list,wins,losses,decided:wins+losses,wo,pending,disputed,np,unresolved};
 }
 return Object.freeze({players,subject,pairs,kind,dateKey,newest,records,winner,summarize,person,opponent,headToHead});
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
 let state={key:'',tab:'history',scope:'all',player:'',query:'',limit:30,filtersOpen:false,leagueScope:'all',rival:'',beforeH2H:'history'};
 const skey=()=>_saveSessionKey()+'|'+_ligaActual+'|'+(currentUser?.key||currentUser?.name||'guest')+'|'+_ligaReadOnly;
 function ensure(){if(state.key!==skey()){pageArchive?.cancel();pageArchive=null;pageArchiveKey='';state={key:skey(),tab:'history',scope:'all',player:'',query:'',limit:30,filtersOpen:false,leagueScope:'all',rival:'',beforeH2H:'history'};}return state;}
 function selectedPlayer(){return esAdmin(currentUser)?state.player:currentUser?.name||'';}
 const option=(value,label,selected)=>'<option value="'+e(value)+'"'+(String(value)===String(selected)?' selected':'')+'>'+e(label)+'</option>';
 function formatDate(value){const key=D.dateKey(value);if(!key)return t('mh_unknown_date');return new Intl.DateTimeFormat(LANG==='en'?'en-GB':'es-ES',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(key+'T12:00:00Z'));}
 function dateGroup(value){const key=D.dateKey(value);return key?new Intl.DateTimeFormat(LANG==='en'?'en-GB':'es-ES',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(key+'T12:00:00Z')):t('mh_unknown_date');}
 function phase(m,groupLabel=groupName){return m.po?(m.tLabel?t('draw')+' '+m.tLabel+' · ':'')+t(m.which==='cons'?'mh_cons':'mh_main'):t('cycle')+' '+m.cycle+' · '+groupLabel(m.g);}
 function score(m,name){const isB=D.players(m)[1]===D.subject(m,name);return D.pairs(m).map(s=>s[isB?1:0]+'–'+s[isB?0:1]).join(' / ');}
 function badge(m,name){
  const k=D.kind(m);if(m.status!=='confirmed')return '<span class="badge '+(m.status==='disputed'?'badge-disp':'badge-pend')+'">'+e(t(m.status==='disputed'?'disputed_result':'legend_pending'))+'</span>';
  if(k==='np')return '<span class="badge badge-tag">'+e(t('mh_np'))+'</span>';
  const win=D.winner(m);if(!name||!win)return '<span class="badge badge-tag">'+e(t(win?'validated_result':'mh_review'))+'</span>';
  const won=win===D.subject(m,name);return '<span class="badge '+(won?'badge-ok':'badge-disp')+'">'+e(t(k==='wo'?(won?'mh_by_wo_win':'mh_by_wo_loss'):(won?'mh_win':'mh_loss')))+'</span>';
 }
 function matchHTML(m,name,options={}){
  const ns=D.players(m),rival=ns.find(n=>n!==D.subject(m,name)),title=name?rival:ns.join(' vs '),type=D.kind(m),key=D.dateKey(m.date);
  return '<article class="mh-match" data-history-id="'+e(m.id)+'"><div class="mh-row"><span class="mh-phase">'+e((m._mhLeagueName?m._mhLeagueName+' · ':'')+phase(m,options.groupLabel))+'</span>'+badge(m,name)+'</div><div class="mh-match-players"><div><small>'+e(name?t('mh_vs'):t('re_match'))+'</small><h3>'+e(title)+'</h3></div><strong class="mh-score">'+e(score(m,name)||'—')+'</strong></div>'+(type!=='normal'?'<p class="mh-special">'+e(t('mh_'+type))+'</p>':'')+'<div class="mh-row mh-match-footer"><div class="mh-details"><time'+(key?' datetime="'+key+'"':'')+'>'+e(formatDate(m.date))+'</time><span>'+e(m.club||'—')+'</span></div>'+'<div class="mh-match-actions">'+(options.h2hKey?'<button class="ui-link-button" type="button" data-mh-h2h="'+e(options.h2hKey)+'" aria-label="'+e(tf('hh_between',{a:name,b:rival}))+'">'+e(t('hh_short'))+' '+SohailUI.icon('arrow')+'</button>':'')+(!options.readOnly?'<button class="ui-link-button" type="button" data-mh-open="'+e(m.id)+'">'+e(t('ui_open_match'))+' '+SohailUI.icon('arrow')+'</button>':'')+'</div>'+'</div></article>';
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
   const last=list.slice().sort(D.newest).filter(m=>m.status==='confirmed'&&!['wo','np'].includes(D.kind(m))&&D.winner(m)).slice(0,5);
   const form=last.length?'<div class="mh-form">'+last.map(m=>{
    const target=D.subject(m,name),won=D.winner(m)===target,readonly=options.readOnly||!!m._mhKey;
    const label=t(won?'mh_win':'mh_loss')+' · '+D.players(m).find(n=>n!==target)+' · '+formatDate(m.date)+(m._mhLeagueName?' · '+m._mhLeagueName:'');
    return (readonly?'<span role="img"':'<button type="button" data-mh-open="'+e(m.id)+'"')+' class="'+(won?'mh-form-win':'mh-form-loss')+'" aria-label="'+e(label)+'" title="'+e(label)+'">'+e(t(won?'win_short':'loss_short'))+(readonly?'</span>':'</button>');
   }).join('')+'</div>':'<p class="mh-empty-form" role="status">'+e(t('mh_stat_empty'))+'</p>';
   h+=section('mh_form',form+'<p class="mh-note">'+e(t('mh_newest'))+'</p>');
  }else h+='<p class="mh-note">'+e(t('mh_all_stats'))+'</p>';
  h+=section('mh_summary','<div class="mh-phase-grid">'+[['mh_groups',m=>!m.po],['mh_main',m=>m.po&&m.which!=='cons'],['mh_cons',m=>m.po&&m.which==='cons']].map(([k,fn])=>{const v=D.summarize(list.filter(fn),name);return '<div><h3>'+e(t(k))+'</h3><strong>'+v.played+'</strong><span>'+e(t('mh_played'))+'</span>'+(name?'<small>'+v.wins+' '+e(t('mh_won'))+' · '+v.losses+' '+e(t('mh_lost'))+'</small>':'')+'</div>';}).join('')+'</div>');
  h+=section('mh_registers','<dl class="mh-numbers">'+[['ui_pending_count',s.pending],['ui_disputes_count',s.disputed],['mh_wo',s.wo],['mh_np',s.np]].map(([k,v])=>'<div><dt>'+e(t(k))+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>');return h;
 }

 Object.assign(TRANSLATIONS.es,{
  mha_range:'Historial a consultar',mha_current:'Liga actual',mha_all:'Todas las ligas',
  mha_includes:'Incluye ligas activas y finalizadas. No cambia la liga de tu sesión.',
  mha_loading:'Consultando el historial de las ligas…',mha_error:'No se pudo consultar el historial completo. No se muestran totales como si la carga hubiera terminado.',
  mha_retry:'Volver a consultar',mha_coverage:'{read} de {total} ligas consultadas · {played} con partidos',
  mha_partial:'Historial parcial. Los totales incluyen solo los registros identificados y disponibles.',
  mha_unlinked:'Este jugador no tiene un vínculo global. Se conserva el historial de la liga actual; el administrador debe vincular su perfil antes de unir otras ligas.',
  mha_issue_link:'Perfil histórico sin vincular',mha_issue_access:'Liga no disponible para esta consulta',mha_issue_read:'No se pudo leer esta liga',mha_issue_data:'Registros ambiguos: requieren revisión',
  mha_player_required:'Elegí un jugador en Filtros para consultar su historial entre ligas.',
  mha_scope_all:'Todas las ligas · Activas y finalizadas',mha_all_note:'Consulta conjunta del jugador. Los partidos se distinguen por liga; no se modifican resultados ni se cambia de cuenta.',
  mha_current_note:'Todos los ciclos y playoffs de la liga actual. Usá el selector para incluir otras ligas.',
  mha_viewonly:'Solo consulta',mha_phase:'Fase',mha_link_notice:'No se unen personas solo porque sus nombres coincidan.'
 });
 Object.assign(TRANSLATIONS.en,{
  mha_range:'History to include',mha_current:'Current league',mha_all:'All leagues',
  mha_includes:'Includes active and finished leagues. Your session stays in the current league.',
  mha_loading:'Loading match history across leagues…',mha_error:'The complete history could not be loaded. Totals are not presented as though loading had succeeded.',
  mha_retry:'Reload history',mha_coverage:'{read} of {total} leagues checked · {played} with matches',
  mha_partial:'Partial history. Totals include only identified, available records.',
  mha_unlinked:'This player has no global profile link. Current-league history is retained; an administrator needs to link the profile before other leagues can be combined.',
  mha_issue_link:'Historical profile not linked',mha_issue_access:'League unavailable for this request',mha_issue_read:'This league could not be read',mha_issue_data:'Ambiguous records need review',
  mha_player_required:'Choose a player in Filters to view their history across leagues.',
  mha_scope_all:'All leagues · Active and finished',mha_all_note:'Combined player history. Matches are identified by league; no results or account settings are changed.',
  mha_current_note:'All cycles and playoffs in the current league. Use the selector to include other leagues.',
  mha_viewonly:'Read only',mha_phase:'Stage',mha_link_notice:'Matching names alone are not used to join different people.'
 });

 Object.assign(TRANSLATIONS.es,{
  hh_short:'Cara a cara',hh_between:'Cara a cara: {a} contra {b}',hh_mine:'Mi cara a cara con {name}',
  hh_pick:'Comparar a {name} con',hh_choose:'Elegir rival',hh_intro:'Elegí un rival para ver sus enfrentamientos directos.',
  hh_player:'Elegí un jugador en Filtros para comparar sus enfrentamientos.',hh_empty:'No hay enfrentamientos registrados entre estos jugadores con este filtro.',
  hh_balance:'Victorias en enfrentamientos validados',hh_method:'El balance incluye las decisiones validadas por W.O. Los pendientes, las disputas y No jugado no deciden el balance.',
  hh_totals:'{n} resultados con ganador confirmado · {wo} por W.O.',hh_list:'Partidos entre ambos',hh_back:'Volver a la ficha',
  hh_records:'Pendientes: {pending} · En disputa: {disputed} · No jugados: {np} · Por revisar: {unresolved}',
  hh_local:'Vínculo local',hh_identity:'Los rivales sin perfil global se separan por liga; no se unen por coincidencia de nombre.',
  hh_stale:'El rival seleccionado ya no está disponible en este contexto. Elegí otro rival.'
 });
 Object.assign(TRANSLATIONS.en,{
  hh_short:'Head-to-head',hh_between:'Head-to-head: {a} versus {b}',hh_mine:'My head-to-head with {name}',
  hh_pick:'Compare {name} with',hh_choose:'Choose opponent',hh_intro:'Choose an opponent to view their head-to-head matches.',
  hh_player:'Choose a player in Filters to compare their head-to-head matches.',hh_empty:'No head-to-head matches recorded for these players with this filter.',
  hh_balance:'Wins in validated head-to-head results',hh_method:'The balance includes validated W.O. decisions. Pending, disputed and Not played records do not decide the balance.',
  hh_totals:'{n} results with a confirmed winner · {wo} by W.O.',hh_list:'Matches between both players',hh_back:'Back to player',
  hh_records:'{pending} pending · {disputed} disputed · {np} not played · {unresolved} to review',
  hh_local:'Local link',hh_identity:'Opponents without a global profile are kept separate by league; matching names are not merged.',
  hh_stale:'The selected opponent is no longer available in this context. Choose another opponent.'
 });
 Object.assign(TRANSLATIONS.es,{
  mha_choose_league:'Elegir una liga',mha_specific:'Una liga en particular',mha_active:'Activa',mha_finished:'Finalizada',
  mha_issue_login:'Iniciá sesión para consultar las ligas activas',mha_unavailable:'No se pudo consultar esta liga. No se muestra un total de cero como si no hubiera partidos.',
  mha_includes:'Carga automática de las ligas activas y finalizadas. Los filtros no cambian la liga ni la cuenta de tu sesión.',
  mha_public_includes:'Consulta pública: incluye las ligas finalizadas. Para las activas necesitás iniciar sesión.'
 });
 Object.assign(TRANSLATIONS.en,{
  mha_choose_league:'Choose a league',mha_specific:'One specific league',mha_active:'Active',mha_finished:'Finished',
  mha_issue_login:'Sign in to view active leagues',mha_unavailable:'This league could not be read. A zero total is not shown as though there were no matches.',
  mha_includes:'Automatically loads active and finished leagues. Filtering does not change your session league or account.',
  mha_public_includes:'Public view: includes finished leagues. Sign in to view active leagues.'
 });
 const historyTabs=['history','stats','h2h'];
 function moveTab(current,key){const i=historyTabs.indexOf(current);return key==='Home'?historyTabs[0]:key==='End'?historyTabs.at(-1):historyTabs[(Math.max(0,i)+(key==='ArrowRight'?1:historyTabs.length-1))%historyTabs.length];}
 function h2hContext(options={}){return options.otherLeague?{id:options.leagueId,nombre:options.leagueName,users:options.users||{},cycles:options.cycles||[],matches:typeof options.records==='function'?options.records():options.records||[],estado:options.leagueState||''}:currentSnapshot();}
 function opponents(source,name,context){
  const mine=D.person(name,context),map=new Map();
  for(const m of D.records(source,name)){
   const r=D.opponent(m,name,context);if(r&&r.key!==mine.key&&!map.has(r.key))map.set(r.key,r);
  }
  // Include known players even without previous meetings, but never system accounts.
  for(const [n,u]of Object.entries(context.users||{})){
   if(!u||typeof u!=='object'||n==='admin'||n==='superadmin'||n===name)continue;
   const r=D.person(n,context);if(r.key!==mine.key)map.set(r.key,{...r,leagueName:context.nombre});
  }
  const all=Array.from(map.values()).sort((a,b)=>a.name.localeCompare(b.name,LANG)||a.key.localeCompare(b.key));
  return all.map(r=>({...r,label:r.name+(!r.id&&r.leagueId!==context.id?' · '+r.leagueName+' ('+t('hh_local')+')':all.some(x=>x.key!==r.key&&x.name===r.name)?' · '+(r.leagueName||t('mha_current')):'')}));
 }
 function h2hPanel(list,name,rivalKey,context,id,limit=30){
  if(!name)return '<p class="mh-note mh-empty-form">'+e(t('hh_player'))+'</p>';
  const opts=opponents(list,name,context),selected=opts.find(r=>r.key===rivalKey);
  let h='<div class="mh-h2h-controls"><label for="'+id+'-rival">'+e(tf('hh_pick',{name}))+'</label><select id="'+id+'-rival" data-mh-rival>'+option('',t('hh_choose'),rivalKey)+opts.map(r=>option(r.key,r.label,rivalKey)).join('')+'</select></div>';
  if(!selected)return h+'<p class="mh-note mh-empty-form">'+e(t(rivalKey?'hh_stale':'hh_intro'))+'</p>';
  const total=D.headToHead(list,name,selected.key,context),rows=total.list;
  h+='<section class="mh-h2h-summary" aria-label="'+e(t('hh_balance'))+'"><p class="mh-h2h-caption">'+e(t('hh_balance'))+'</p><div class="mh-h2h-score"><div><strong>'+e(name)+'</strong><b>'+total.wins+'</b></div><span aria-hidden="true">—</span><div><strong>'+e(selected.name)+'</strong><b>'+total.losses+'</b></div></div><p class="mh-note">'+e(tf('hh_totals',{n:total.decided,wo:total.wo}))+'</p><p class="mh-note">'+e(t('hh_method'))+'</p></section>';
  if(total.pending||total.disputed||total.np||total.unresolved)h+='<p class="mh-note">'+e(tf('hh_records',total))+'</p>';
  if(rows.some(m=>m._mhLeagueId&&m._mhLeagueId!==context.id&&!D.opponent(m,name,context)?.id))h+='<p class="mh-note">'+e(t('hh_identity'))+'</p>';
  h+='<h2 class="mh-h2h-title">'+e(t('hh_list'))+'</h2>';
  if(!rows.length)return h+'<p class="mh-note mh-empty-form">'+e(t('hh_empty'))+'</p>';
  h+='<p class="mh-note">'+e(t('mh_newest'))+'</p>'+rows.slice(0,limit).map(m=>matchHTML(m,name,{readOnly:true,groupLabel:context.groupLabel||groupName})).join('');
  h+='<div class="mh-more"><span>'+e(tf('mh_showing',{shown:Math.min(limit,rows.length),total:rows.length}))+'</span>'+(limit<rows.length?'<button type="button" class="btn" data-hh-more>'+e(t('mh_load_more'))+'</button>':'')+'</div>';
  return h;
 }
 function ownOpponent(name,context){
  const own=currentUser?.name;
  if(!own||own===name||!Object.prototype.hasOwnProperty.call(context.users||{},own)||['admin','superadmin'].includes(own))return null;
  const me=D.person(own,context),other=D.person(name,context);return me.key===other.key?null:me;
 }

 let pageArchive=null,pageArchiveKey='';
 function currentSnapshot(){return {id:_ligaActual,nombre:document.getElementById('hdr-title')?.textContent?.trim()||LEAGUE_NAME,estado:_ligaReadOnly?'finalizada':'activa',users:USERS,matches,cycles};}
 function canAggregate(name,context=currentSnapshot()){return !!name&&!!global.SohailLeagueHistory&&SohailLeagueHistory.validId(context.id)&&!!(currentUser||_ligaReadOnly);}
 function archiveController(name,valid,current=currentSnapshot){return SohailLeagueHistory.createController({name,current,token:()=>_token,valid,fetcher:(...args)=>fetch(...args)});}
 function forPage(){
  const name=selectedPlayer(),key=skey()+'|'+name+'|'+(USERS[name]?.jugadorId||'');
  if(pageArchiveKey!==key){pageArchive?.cancel();pageArchiveKey=key;pageArchive=canAggregate(name)?archiveController(name,()=>!!currentUser&&pageArchiveKey===key&&skey()+'|'+selectedPlayer()+'|'+(USERS[selectedPlayer()]?.jugadorId||'')===key):null;}
  return pageArchive;
 }
 const isRemoteScope=value=>value!=='current';
 function scopeLabel(value,snapshot,context){
  if(value==='all')return t('mha_scope_all');
  if(value==='current')return context.nombre||t('mha_current');
  const id=value.slice(7);return snapshot?.index?.find(l=>l.id===id)?.nombre||id;
 }
 function leagueControl(id,value,enabled=true,snapshot=null,context=currentSnapshot()){
  const entries=snapshot?.index||[{id:context.id,nombre:context.nombre,estado:context.estado}];
  const selected=value.startsWith('league:')?value.slice(7):'';
  return '<fieldset class="mh-league-scope"><legend>'+e(t('mha_range'))+'</legend><div class="mh-league-options">'+[['all','mha_all'],['current','mha_current']].map(([v,k])=>'<button type="button" id="'+id+'-'+v+'" data-history-leagues="'+v+'" aria-pressed="'+(value===v)+'"'+(v==='all'&&!enabled?' disabled':'')+'>'+e(t(k))+'</button>').join('')+'</div><label class="mh-specific-league" for="'+id+'-specific">'+e(t('mha_specific'))+'<select id="'+id+'-specific" data-history-league'+(!enabled?' disabled':'')+'>'+option('',t('mha_choose_league'),selected)+entries.map(l=>option(l.id,l.nombre+(l.estado?' · '+t(l.estado==='finalizada'?'mha_finished':'mha_active'):''),selected)).join('')+'</select></label><p class="mh-note">'+e(t(!enabled?'mha_player_required':_token?'mha_includes':'mha_public_includes'))+'</p></fieldset>';
 }
 function chosenSnapshot(snapshot,value,context){return snapshot&&isRemoteScope(value)?SohailLeagueHistory.selectScope(snapshot,value,context.id):null;}
 function scopeChoices(value,snapshot,context){
  if(value==='all')return aggregateScopes();
  const cs=value==='current'?context.cycles:snapshot?.leagues?.find(l=>l.id===value.slice(7))?.cycles;
  return [['all',t('mh_all')],...(cs||[]).filter(c=>c?.n!=null).map(c=>['cycle:'+c.n,t('cycle')+' '+c.n]),['po',t('playoffs')],['main',t('mh_main')],['cons',t('mh_cons')]];
 }
 function archiveStatus(snapshot){
  if(!snapshot)return '';
  if(snapshot.busy)return '<p class="mh-archive-status" role="status">'+e(t('mha_loading'))+'</p>';
  if(snapshot.error||!snapshot.ready)return '<div class="mh-archive-status mh-archive-warning" role="status"><p>'+e(t('mha_error'))+'</p><button type="button" class="btn" data-history-retry>'+e(t('mha_retry'))+'</button></div>';
  const count= snapshot.leagues.filter(l=>l.count>0).length;
  const lines=snapshot.issues.map(i=>i.reason==='no-global-id'?t('mha_unlinked'):(i.name||i.id||'')+' — '+t(i.reason==='unlinked'?'mha_issue_link':i.reason==='login-required'?'mha_issue_login':i.reason==='unavailable'?'mha_issue_access':i.reason==='read-error'?'mha_issue_read':'mha_issue_data'));
  return '<div class="mh-archive-status'+(lines.length?' mh-archive-warning':'')+'" role="status"><p>'+e(snapshot.unavailable?t('mha_unavailable'):tf('mha_coverage',{read:snapshot.leagues.length,total:snapshot.total,played:count}))+'</p>'+(lines.length?'<strong>'+e(t('mha_partial'))+'</strong><ul>'+lines.map(v=>'<li>'+e(v)+'</li>').join('')+'</ul><button type="button" class="btn" data-history-retry>'+e(t('mha_retry'))+'</button>':'<button type="button" class="btn" data-history-retry>'+e(t('mha_retry'))+'</button>')+'</div>';
 }
 const aggregateScopes=()=>[['all',t('mh_all')],['groups',t('mh_groups')],['po',t('playoffs')],['main',t('mh_main')],['cons',t('mh_cons')]];
 function redrawPage(){const focus=document.activeElement?.id,scroll=window.scrollY;render();if(focus)document.getElementById(focus)?.focus({preventScroll:true});window.scrollTo({top:scroll,behavior:'auto'});}
 function loadPageArchive(){const c=forPage();if(!c)return;const job=c.load();redrawPage();job.finally(()=>{if(pageArchive===c&&currentUser&&subView==='partidos')redrawPage();});}
 function dataset(){
  const name=selectedPlayer(),c=forPage(),snap=chosenSnapshot(c?.snapshot(),state.leagueScope,currentSnapshot());
  const base=D.records(snap?snap.records:matches,name,state.scope);
  const list=!state.query?base:base.filter(m=>(D.players(m).join(' ')+' '+(m._mhLeagueName||'')+' '+(m.club||'')+' '+(m.date||'')+' '+score(m,name).replace(/–/g,'-')).toLocaleLowerCase(LANG).includes(state.query.toLocaleLowerCase(LANG).replace(/–/g,'-')));
  return {name,base,list,snap};
 }
 function paint(){
  const host=document.getElementById('mh-panel');if(!host||!currentUser)return;
  const {name,base,list,snap}=dataset();
  const filterLabel=document.getElementById('mh-filter-label'),sel=document.getElementById('mh-scope');if(filterLabel)filterLabel.textContent=(sel?.selectedOptions[0]?.textContent||t('mh_all'))+(name&&esAdmin(currentUser)?' · '+name:'')+(state.query&&state.tab==='history'?' · '+t('mh_search_active'):'');
  host.setAttribute('aria-labelledby','mh-tab-'+state.tab);
  document.querySelectorAll('[data-mh-tab]').forEach(b=>{const on=b.dataset.mhTab===state.tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
  const search=document.getElementById('mh-search-wrap');if(search)search.hidden=state.tab!=='history';
  const notice=archiveStatus(snap);
  if(snap&&(snap.busy||snap.error||!snap.ready||snap.unavailable)){host.innerHTML=notice;return;}
  if(state.tab==='h2h'){host.innerHTML=notice+h2hPanel(base,name,state.rival,currentSnapshot(),'mh-h2h',state.limit);return;}
  if(state.tab==='stats'){host.innerHTML=notice+statHTML(base,name,{readOnly:!!snap});return;}
  const visible=list.slice(0,state.limit);let group='',rows='';
  for(const m of visible){const label=dateGroup(m.date);if(label!==group){rows+='<h2 class="mh-month">'+e(label)+'</h2>';group=label;}rows+=matchHTML(m,name,{readOnly:!!snap,h2hKey:name?D.opponent(m,name,currentSnapshot())?.key:null});}
  host.innerHTML=notice+'<div class="mh-list-heading"><p>'+e(tf('mh_found',{n:list.length}))+'</p><small>'+e(t('mh_newest'))+'</small></div>'+(rows||'<div class="card empty">'+e(t(state.scope!=='all'||state.query?'mh_no_filter':'mh_empty'))+'</div>')+'<div class="mh-more"><span>'+e(tf('mh_showing',{shown:visible.length,total:list.length}))+'</span>'+(visible.length<list.length?'<button type="button" class="btn" data-mh-more>'+e(t('mh_load_more'))+'</button>':'')+'</div>';
 }
 function render(){
  if(!currentUser||_ligaReadOnly)return;
  ensure();const host=document.getElementById('view-partidos');if(!host)return;
  const admin=esAdmin(currentUser),cy=(cycles||[]).filter(c=>c?.n!=null);
  if(!selectedPlayer())state.leagueScope='current';
  const fullSnapshot=forPage()?.snapshot(),scopes=scopeChoices(state.leagueScope,fullSnapshot,currentSnapshot());
  const people=[...new Set([...Object.keys(USERS||{}).filter(n=>!['admin','superadmin'].includes(n)),...(matches||[]).flatMap(m=>D.players(m))].filter(Boolean))].sort((a,b)=>a.localeCompare(b,LANG));
  if(!scopes.some(s=>s[0]===state.scope))state.scope='all';if(admin&&state.player&&!people.includes(state.player))state.player='';
  host.innerHTML='<header class="ui-page-head mh-page-head"><div><p class="ui-eyebrow">'+e(document.getElementById('hdr-title')?.textContent?.trim()||(typeof LEAGUE_NAME==='string'?LEAGUE_NAME:''))+'</p><h1>'+e(t(admin?'ui_matches':'ui_my_matches'))+'</h1><p>'+e(scopeLabel(state.leagueScope,fullSnapshot,currentSnapshot()))+'</p></div><button type="button" class="btn btn-primary" data-ui-route="cargar">'+SohailUI.icon('matches')+e(t('ui_start'))+'</button></header><div class="mh-tabs" role="tablist" aria-label="'+e(t('ui_matches'))+'"><button type="button" id="mh-tab-history" role="tab" data-mh-tab="history" aria-controls="mh-panel">'+SohailUI.icon('matches')+e(t('mh_history'))+'</button><button type="button" id="mh-tab-stats" role="tab" data-mh-tab="stats" aria-controls="mh-panel">'+SohailUI.icon('league')+e(t('mh_stats'))+'</button><button type="button" id="mh-tab-h2h" role="tab" data-mh-tab="h2h" aria-controls="mh-panel">'+e(t('hh_short'))+'</button></div>'+leagueControl('mh-leagues',state.leagueScope,canAggregate(selectedPlayer()),fullSnapshot)+'<details class="mh-filter-panel"'+(state.filtersOpen?' open':'')+'><summary><span>'+e(t('ui_filters'))+'</span><small id="mh-filter-label"></small></summary><div class="mh-filters"><label for="mh-scope">'+e(t('mh_filter'))+'<select id="mh-scope">'+scopes.map(([v,n])=>option(v,n,state.scope)).join('')+'</select></label>'+(admin?'<label for="mh-player">'+e(t('mh_player'))+'<select id="mh-player">'+option('',t('mh_everyone'),state.player)+people.map(n=>option(n,n,state.player)).join('')+'</select></label>':'')+'<label id="mh-search-wrap" for="mh-search">'+e(t('mh_search'))+'<input type="search" id="mh-search" value="'+e(state.query)+'" autocomplete="off"></label><button type="button" class="ui-link-button" data-mh-clear>'+e(t('mh_reset'))+'</button></div></details><div id="mh-panel" role="tabpanel" tabindex="0"></div><p class="mh-note mh-league-note">'+e(t(isRemoteScope(state.leagueScope)?'mha_all_note':'mha_current_note'))+'</p>';
  const filters=host.querySelector('.mh-filter-panel');filters.ontoggle=()=>state.filtersOpen=filters.open;
  host.onclick=ev=>{const b=ev.target.closest('button');if(!b)return;
   if(b.hasAttribute('data-history-leagues')){const mode=b.dataset.historyLeagues;if(mode==='all'&&!canAggregate(selectedPlayer()))return;state.leagueScope=mode;state.scope='all';state.query='';state.limit=30;if(isRemoteScope(mode)&&!forPage()?.snapshot().attempted)loadPageArchive();else redrawPage();}
   else if(b.hasAttribute('data-history-retry'))loadPageArchive();
   else if(b.dataset.mhTab){state.tab=b.dataset.mhTab;paint();}
   else if(b.hasAttribute('data-mh-h2h')){const d=dataset();if(!opponents(d.base,d.name,currentSnapshot()).some(r=>r.key===b.dataset.mhH2h))return;state.rival=b.dataset.mhH2h;state.tab='h2h';state.limit=30;paint();document.getElementById('mh-tab-h2h')?.focus({preventScroll:true});}
   else if(b.hasAttribute('data-hh-more')){state.limit+=30;paint();}
   else if(b.hasAttribute('data-mh-more')){state.limit+=30;const scroll=window.scrollY;paint();window.scrollTo({top:scroll,behavior:'auto'});host.querySelector('[data-mh-more]')?.focus({preventScroll:true});}
   else if(b.hasAttribute('data-mh-open')){const m=dataset().base.find(m=>String(m.id)===b.dataset.mhOpen);if(m)openModal(m.id);}
   else if(b.hasAttribute('data-mh-clear')){state.scope='all';state.query='';state.player='';state.leagueScope='all';state.limit=30;forPage();render();document.getElementById('mh-scope')?.focus({preventScroll:true});}
  };
  host.oninput=ev=>{if(ev.target.id==='mh-search'){state.query=ev.target.value;state.limit=30;paint();}};
  host.onchange=ev=>{if(ev.target.hasAttribute('data-history-league')){const id=ev.target.value,c=forPage();if(!c||!c.snapshot().index.some(l=>l.id===id))return;state.leagueScope=id===_ligaActual?'current':'league:'+id;state.scope='all';state.query='';state.limit=30;if(!c.snapshot().attempted)loadPageArchive();else redrawPage();return;}if(ev.target.hasAttribute('data-mh-rival')){state.rival=ev.target.value;state.limit=30;paint();document.getElementById('mh-h2h-rival')?.focus({preventScroll:true});return;}if(ev.target.id==='mh-scope')state.scope=ev.target.value;else if(ev.target.id==='mh-player'){state.player=ev.target.value;state.rival='';forPage();state.leagueScope=canAggregate(selectedPlayer())?'all':'current';render();return;}else return;state.limit=30;paint();};
  host.onkeydown=ev=>{const b=ev.target.closest('[data-mh-tab]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;ev.preventDefault();state.tab=moveTab(state.tab,ev.key);paint();document.getElementById('mh-tab-'+state.tab)?.focus({preventScroll:true});};
  paint();
  const archive=forPage();if(isRemoteScope(state.leagueScope)&&archive&&!archive.snapshot().attempted)loadPageArchive();
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
  const view={tab:historyTabs.includes(options.startTab)?options.startTab:'history',scope:'all',limit:30,leagueScope:'all',rival:options.rivalKey||'',beforeH2H:'history',beforeLimit:30,beforeScroll:0};
  const groupLabel=options.groupLabel||groupName;
  // Capture only match records and cycle descriptors supplied by existing readers.
  // No fetch is needed to inspect somebody in the currently selected league.
  const source=()=>typeof options.records==='function'?options.records():options.records||[];
  const valid=()=>host.isConnected&&key===_saveSessionKey()&&league===_ligaActual;
  const cyclesList=Array.isArray(options.cycles)?options.cycles:[];
  const context=()=>({...h2hContext(options),groupLabel});
  const aggregateAllowed=canAggregate(name,context());
  const archive=aggregateAllowed?archiveController(name,()=>valid()&&host._mhPlayerDispose===dispose,context):null;
  if(!aggregateAllowed||options.startLeagueScope==='current')view.leagueScope='current';
  const scopeOptions=()=>scopeChoices(view.leagueScope,archive?.snapshot(),context());
  function loadPlayerArchive(){
   if(!archive)return;
   const job=archive.load();redraw();job.finally(()=>{if(valid()&&host._mhPlayerDispose===dispose)redraw();});
  }
  function redraw(){const f=host.contains(document.activeElement)?document.activeElement?.id:'',sc=host.closest('.modal')?.scrollTop;draw();if(f)document.getElementById(f)?.focus({preventScroll:true});const modal=host.closest('.modal');if(modal&&sc!=null)modal.scrollTop=sc;}
  host.classList.add('mh-player-view');host.dataset.playerName=name;
  function paintPanels(){
   if(!valid())return;
   const snapshot=chosenSnapshot(archive?.snapshot(),view.leagueScope,context());
   const list=D.records(snapshot?snapshot.records:source(),name,view.scope),notice=archiveStatus(snapshot);
   host.querySelectorAll('[data-mhp-tab]').forEach(b=>{const on=b.dataset.mhpTab===view.tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
   const history=host.querySelector('[data-mhp-panel=history]'),stats=host.querySelector('[data-mhp-panel=stats]'),h2h=host.querySelector('[data-mhp-panel=h2h]');
   history.hidden=view.tab!=='history';stats.hidden=view.tab!=='stats';h2h.hidden=view.tab!=='h2h';
   if(snapshot&&(snapshot.busy||snapshot.error||!snapshot.ready||snapshot.unavailable)){(view.tab==='h2h'?h2h:view.tab==='stats'?stats:history).innerHTML=notice;return;}
   if(view.tab==='h2h'){h2h.innerHTML='<button type="button" class="ui-link-button mh-h2h-back" data-hh-back>'+e(t('hh_back'))+'</button>'+notice+h2hPanel(list,name,view.rival,context(),id+'-h2h',view.limit);return;}
   if(view.tab==='stats'){stats.innerHTML=notice+statHTML(list,name,{readOnly:true});return;}
   let month='',rows='';
   for(const m of list.slice(0,view.limit)){
    const label=dateGroup(m.date);
    if(label!==month){rows+='<h2 class="mh-month">'+e(label)+'</h2>';month=label;}
    rows+=matchHTML(m,name,{readOnly:true,h2hKey:D.opponent(m,name,context())?.key,groupLabel});
   }
   history.innerHTML=notice+'<div class="mh-list-heading"><p>'+e(tf('mh_found',{n:list.length}))+'</p><small>'+e(t('mh_newest'))+'</small></div>'+
    (rows||'<p class="mh-note mh-player-empty">'+e(t('mhp_empty'))+'</p>')+
    '<div class="mh-more"><span>'+e(tf('mh_showing',{shown:Math.min(view.limit,list.length),total:list.length}))+'</span>'+
    (view.limit<list.length?'<button type="button" class="btn" data-mhp-more>'+e(t('mh_load_more'))+'</button>':'')+'</div>';
  }
  function draw(){
   if(!valid())return;
   host.lang=LANG;
   const rating=options.rating&&typeof ratingFichaHTML==='function'?ratingFichaHTML(name):'';
   host.innerHTML='<div class="mh-player-context"><span class="mh-player-caption">'+e(t(view.leagueScope==='all'?'mha_range':options.otherLeague?'mhp_past':'mhp_current'))+'</span><strong>'+e(scopeLabel(view.leagueScope,archive?.snapshot(),context()))+'</strong><p>'+e(tf('mhp_context',{name}))+'</p><small>'+e(t('mhp_scope'))+'</small></div>'+
    '<div class="mh-tabs mh-player-tabs" role="tablist" aria-label="'+e(t('mhp_title')+' · '+name)+'">'+
    [['history','mh_history','matches'],['stats','mh_stats','league'],['h2h','hh_short','matches']].map(([tab,label,ic])=>'<button type="button" id="'+id+'-tab-'+tab+'" role="tab" data-mhp-tab="'+tab+'" aria-controls="'+id+'-panel-'+tab+'">'+SohailUI.icon(ic)+e(t(label))+'</button>').join('')+'</div>'+
    (ownOpponent(name,context())?'<button type="button" class="btn mh-my-h2h" data-hh-mine>'+e(tf('hh_mine',{name}))+'</button>':'')+
    (aggregateAllowed?leagueControl(id+'-leagues',view.leagueScope,true,archive?.snapshot(),context()):'')+
    '<label class="mh-player-filter" for="'+id+'-scope">'+e(t('mh_filter'))+'<select id="'+id+'-scope" data-mhp-scope>'+scopeOptions().map(([v,lab])=>option(v,lab,view.scope)).join('')+'</select></label>'+
    (rating?'<details class="mh-player-rating"><summary>'+e(t('mhp_rating'))+'</summary>'+rating+'</details>':'')+
    '<div id="'+id+'-panel-history" role="tabpanel" tabindex="0" aria-labelledby="'+id+'-tab-history" data-mhp-panel="history"></div>'+
    '<div id="'+id+'-panel-stats" role="tabpanel" tabindex="0" aria-labelledby="'+id+'-tab-stats" data-mhp-panel="stats" hidden></div>'+
    '<div id="'+id+'-panel-h2h" role="tabpanel" tabindex="0" aria-labelledby="'+id+'-tab-h2h" data-mhp-panel="h2h" hidden></div>';
   paintPanels();
  }
  host.onclick=ev=>{
   const b=ev.target.closest('button');if(!valid()||!b||!host.contains(b))return;
   if(b.hasAttribute('data-history-leagues')&&aggregateAllowed){view.leagueScope=b.dataset.historyLeagues;view.scope='all';view.limit=30;if(isRemoteScope(view.leagueScope)&&!archive.snapshot().attempted)loadPlayerArchive();else redraw();}
   else if(b.hasAttribute('data-history-retry'))loadPlayerArchive();
   else if(b.dataset.mhpTab){if(b.dataset.mhpTab==='h2h')selectH2H(view.rival);else{view.tab=b.dataset.mhpTab;paintPanels();}}
   else if(b.hasAttribute('data-hh-back')){view.tab=view.beforeH2H||'history';view.limit=view.beforeLimit||30;paintPanels();host.querySelector('[data-mhp-tab="'+view.tab+'"]')?.focus({preventScroll:true});const scroller=host.closest('#modal-body');if(scroller)scroller.scrollTop=view.beforeScroll||0;}
   else if(b.hasAttribute('data-hh-mine')){const me=ownOpponent(name,context());if(me)selectH2H(me.key);}
   else if(b.hasAttribute('data-hh-more')){view.limit+=30;paintPanels();}
   else if(b.hasAttribute('data-mhp-more')){
    view.limit+=30;paintPanels();host.querySelector('[data-mhp-more]')?.focus({preventScroll:true});
   }else if(b.hasAttribute('data-mh-h2h')){const data=chosenSnapshot(archive?.snapshot(),view.leagueScope,context())?.records||source();if(opponents(data,name,context()).some(r=>r.key===b.dataset.mhH2h))selectH2H(b.dataset.mhH2h);}
  
  };
  function selectH2H(key){if(view.tab!=='h2h'){view.beforeH2H=view.tab;view.beforeLimit=view.limit;view.beforeScroll=host.closest('#modal-body')?.scrollTop||0;}view.rival=key;view.tab='h2h';view.limit=30;paintPanels();host.querySelector('[data-mhp-tab=h2h]')?.focus({preventScroll:true});const scroller=host.closest('#modal-body');if(scroller)scroller.scrollTop=0;}
  host.onchange=ev=>{if(!valid())return;if(ev.target.hasAttribute('data-history-league')){const leagueId=ev.target.value;if(!archive||!archive.snapshot().index.some(l=>l.id===leagueId))return;view.leagueScope=leagueId===context().id?'current':'league:'+leagueId;view.scope='all';view.limit=30;redraw();return;}if(ev.target.matches('[data-mh-rival]')){view.rival=ev.target.value;view.limit=30;paintPanels();document.getElementById(id+'-h2h-rival')?.focus({preventScroll:true});}else if(ev.target.matches('[data-mhp-scope]')){view.scope=ev.target.value;view.limit=30;paintPanels();}};
  host.onkeydown=ev=>{
   const tab=ev.target.closest('[data-mhp-tab]');
   if(!valid()||!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;
   ev.preventDefault();if(view.tab!=='h2h')view.beforeH2H=view.tab;view.tab=moveTab(view.tab,ev.key);
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
  function dispose(){archive?.cancel();languageObserver.disconnect();lifecycleObserver.disconnect();if(host._mhPlayerDispose===dispose)delete host._mhPlayerDispose;}
  host._mhPlayerDispose=dispose;
  languageObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  if(modal){lifecycleObserver.observe(modal,{attributes:true,attributeFilter:['class']});if(body)lifecycleObserver.observe(body,{childList:true,subtree:true});}
  if(isRemoteScope(view.leagueScope)&&archive)loadPlayerArchive();
  return true;
 }
 function openPlayer(name,initial={}){
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
  mountPlayer(current,{name,leagueName,cycles,records:()=>matches,rating:RATING_ON,startTab:initial.tab,rivalKey:initial.rival,startLeagueScope:initial.leagueScope});
  overlay.querySelector('.modal').scrollTop=0;
  return true;
 }

 // Compact profile statistics use the same identities and league filters as the
 // detailed viewer. Never fall back to summing equal names in unrelated leagues.
 function mountSummary(host,name){
  if(!host||!canAggregate(name))return false;
  host._historySummaryDispose?.();
  const key=skey();let scope='all';
  const valid=()=>host.isConnected&&skey()===key;
  const archive=archiveController(name,valid);
  const id='profile-history-'+(++playerViewId);
  function draw(){
   if(!valid())return;
   const all=archive.snapshot(),snapshot=chosenSnapshot(all,scope,currentSnapshot());
   let html=leagueControl(id,scope,true,all)+archiveStatus(snapshot);
   if(!snapshot||(!snapshot.busy&&!snapshot.error&&snapshot.ready&&!snapshot.unavailable)){
    const list=D.records(snapshot?snapshot.records:matches,name),stats=D.summarize(list,name);
    html+=bloqueStatsHTML(e(scopeLabel(scope,all,currentSnapshot())),{pj:stats.played,pg:stats.wins,pp:stats.losses},false);
    html+='<p class="mh-note">'+e(t('mh_short_note'))+'</p>';
   }
   host.innerHTML=html+'<button type="button" class="btn" data-profile-details>'+e(t('mhp_title'))+'</button>';
  }
  function load(){const job=archive.load();draw();job.finally(()=>{if(valid())draw();});}
  host.onclick=ev=>{
   const b=ev.target.closest('button');if(!b||!valid())return;
   if(b.hasAttribute('data-history-leagues')){scope=b.dataset.historyLeagues;draw();}
   else if(b.hasAttribute('data-history-retry'))load();
   else if(b.hasAttribute('data-profile-details'))openPlayer(name,{tab:'stats'});
  };
  host.onchange=ev=>{if(!valid()||!ev.target.hasAttribute('data-history-league'))return;const id=ev.target.value;if(!archive.snapshot().index.some(l=>l.id===id))return;scope=id===_ligaActual?'current':'league:'+id;draw();};
  const lang=new MutationObserver(()=>{if(valid())draw();else dispose();});
  const life=new MutationObserver(()=>{if(!valid())dispose();});
  function dispose(){archive.cancel();lang.disconnect();life.disconnect();if(host._historySummaryDispose===dispose)delete host._historySummaryDispose;}
  host._historySummaryDispose=dispose;
  lang.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  const parent=document.getElementById('view-perfil');if(parent)life.observe(parent,{childList:true});
  load();return true;
 }

 function openH2H(a,b){
  if(typeof a!=='string'||typeof b!=='string'||!a.trim()||!b.trim()||a===b)return false;
  const ctx=currentSnapshot(),me=D.person(a,ctx),rival=D.person(b,ctx);if(me.key===rival.key)return false;
  return openPlayer(a,{tab:'h2h',rival:rival.key,leagueScope:'all'});
 }
 global.SohailHistory=Object.freeze({render,openPlayer,mountPlayer,openH2H,mountSummary});
})(typeof window!=='undefined'?window:globalThis);
