/* Sohail UI v3 — navegación y presentación. No cambia el modelo deportivo.
   Depende de los módulos originales, se carga antes de bootstrap.js.
   Nunca guardar contraseñas ni borradores privados en localStorage. */
(function(global){
 'use strict';
 const es={
 ui_home:'Inicio',ui_matches:'Partidos',ui_league:'Liga',ui_more:'Más',ui_players:'Jugadores',ui_summary:'Resumen',ui_settings:'Configuración',ui_review:'Revisión',ui_profile:'Mi perfil',ui_help:'Ayuda y tutorial',ui_competition:'Ciclos y grupos',ui_your_league:'Tu competición',ui_overview:'Todo listo para tu próximo partido',ui_welcome:'Hola, {name}',ui_admin_welcome:'La liga, bajo control',ui_admin_intro:'Revisá lo pendiente y seguí el progreso de la competición.',ui_home_intro:'Tu grupo, tus resultados y lo que necesita tu atención.',ui_table_results:'Tabla y resultados',ui_view_all:'Ver todos',ui_all_groups:'Todos los grupos',ui_group_search:'Buscar grupo o jugador',ui_previous_group:'Grupo anterior',ui_next_group:'Grupo siguiente',ui_my_group:'Mi grupo',ui_group_count:'{n} grupos',ui_no_group:'No tenés grupo en este ciclo.',ui_visited_cycle:'Ciclo consultado',ui_active:'En juego',ui_finished:'Finalizado',ui_locked:'Bloqueado',ui_readonly:'Solo consulta',ui_positions:'Posiciones',ui_results:'Resultados',ui_sets_balance:'Sets y balance',ui_final_points:'Puntos finales',ui_scroll_hint:'Deslizá la tabla para ver todas las columnas. El nombre queda fijo.',ui_row_hint:'Tu fila permanece identificada',ui_group_legend:'Puntuación y desempates',ui_back_positions:'Posiciones ↑',ui_to_results:'Resultados ↓',ui_choose_match:'Elegí el partido que querés cargar',ui_pending_count:'Por revisar',ui_disputes_count:'En disputa',ui_confirmed_count:'Validados',ui_players_count:'Jugadores activos',ui_unplayed:'Rivales pendientes',ui_no_rivals:'No tenés cruces sin cargar en este ciclo.',ui_no_tasks:'No hay resultados pendientes de revisión.',ui_waiting:'Esperando validación',ui_attention:'Necesita atención',ui_recent:'Últimos resultados',ui_no_matches:'Todavía no hay resultados para este contexto.',ui_current_context:'Contexto actual',ui_config_title:'Configuración de la liga',ui_config_hint:'Todas las opciones están disponibles. Abrí una sección para trabajar sin perder el contexto.',ui_config_search:'Buscar opción de configuración',ui_profile_link:'Gestionar jugadores',ui_back_profile:'Volver a mi perfil',ui_choose_group:'Elegir grupo',ui_no_results:'No hay coincidencias.',ui_select_pending:'Seleccionar partidos para validar',ui_selected:'{n} seleccionados',ui_validate_selected:'Validar selección',ui_bulk_confirm:'Vas a validar {n} partidos seleccionados. Revisá sus jugadores, ciclo y marcador antes de continuar.',ui_busy:'Hay un guardado en curso. Esperá a que termine.',ui_saved:'Guardado en el servidor',ui_save_failed:'No se pudo confirmar el guardado. No se anunció éxito; podés revisar e intentar de nuevo.',ui_session_changed:'Cambió la sesión o la liga. Volvé a abrir la operación.',ui_simulation_warning:'SIMULACIÓN SOBRE DATOS REALES. Esta acción crea resultados ficticios en la liga actual. No es una prueba aislada. Escribí SIMULAR para continuar.',ui_simulation_label:'Herramientas de demostración — no usar en una liga real',ui_profile_discard:'Hay campos de contraseña sin enviar. ¿Salir y descartarlos?',ui_clear_selection:'Limpiar selección',ui_filters:'Filtros',ui_all:'Todos',ui_open_match:'Ver partido',ui_search_players:'Buscar jugador',ui_participation:'Participación',ui_members:'{n} jugadores',ui_my_matches:'Mis partidos',ui_status:'Estado',ui_view_cycle:'Ver ciclo',ui_start:'Cargar resultado',ui_signed_in:'Sesión iniciada',ui_scoped:'La revisión se limita al ciclo o cuadro consultado.',ui_warning_readonly:'Este contexto es de consulta. La edición sigue las autorizaciones de la liga.',ui_guide_intro:'Usá ciclos y grupos sin perder la tabla ni la matriz. Durante la guía no se modifican datos.'
 };
 const en={
 ui_home:'Home',ui_matches:'Matches',ui_league:'League',ui_more:'More',ui_players:'Players',ui_summary:'Overview',ui_settings:'Settings',ui_review:'Review',ui_profile:'My profile',ui_help:'Help and tutorial',ui_competition:'Cycles and groups',ui_your_league:'Your competition',ui_overview:'Ready for your next match',ui_welcome:'Hi, {name}',ui_admin_welcome:'Your league at a glance',ui_admin_intro:'Review outstanding items and follow the competition.',ui_home_intro:'Your group, results and items that need attention.',ui_table_results:'Standings and results',ui_view_all:'View all',ui_all_groups:'All groups',ui_group_search:'Find a group or player',ui_previous_group:'Previous group',ui_next_group:'Next group',ui_my_group:'My group',ui_group_count:'{n} groups',ui_no_group:'You do not have a group in this cycle.',ui_visited_cycle:'Selected cycle',ui_active:'In progress',ui_finished:'Finished',ui_locked:'Locked',ui_readonly:'Read only',ui_positions:'Standings',ui_results:'Results',ui_sets_balance:'Sets and balance',ui_final_points:'Final points',ui_scroll_hint:'Scroll across for all columns. Player names stay visible.',ui_row_hint:'Your row stays highlighted',ui_group_legend:'Points and tiebreak rules',ui_back_positions:'Standings ↑',ui_to_results:'Results ↓',ui_choose_match:'Choose the match to report',ui_pending_count:'To review',ui_disputes_count:'Disputed',ui_confirmed_count:'Validated',ui_players_count:'Active players',ui_unplayed:'Remaining opponents',ui_no_rivals:'You have no unreported matches in this cycle.',ui_no_tasks:'No results are waiting for review.',ui_waiting:'Awaiting validation',ui_attention:'Needs attention',ui_recent:'Latest results',ui_no_matches:'No results in this context yet.',ui_current_context:'Current context',ui_config_title:'League settings',ui_config_hint:'All settings remain available. Open a section to work without losing context.',ui_config_search:'Find a setting',ui_profile_link:'Manage players',ui_back_profile:'Back to my profile',ui_choose_group:'Choose group',ui_no_results:'No matches found.',ui_select_pending:'Select results to validate',ui_selected:'{n} selected',ui_validate_selected:'Validate selected',ui_bulk_confirm:'You are about to validate {n} selected matches. Check their players, cycle and score before continuing.',ui_busy:'A save is in progress. Please wait.',ui_saved:'Saved on the server',ui_save_failed:'Saving could not be confirmed. No success was reported; review and try again.',ui_session_changed:'Your session or league changed. Reopen this action.',ui_simulation_warning:'SIMULATION ON REAL DATA. This action creates fictional results in the current league. It is not an isolated test. Type SIMULAR to continue.',ui_simulation_label:'Demo tools — do not use in a real league',ui_profile_discard:'You have unsent password fields. Leave and discard them?',ui_clear_selection:'Clear selection',ui_filters:'Filters',ui_all:'All',ui_open_match:'View match',ui_search_players:'Find player',ui_participation:'Participation',ui_members:'{n} players',ui_my_matches:'My matches',ui_status:'Status',ui_view_cycle:'View cycle',ui_start:'Report result',ui_signed_in:'Signed in',ui_scoped:'Review is limited to the selected cycle or draw.',ui_warning_readonly:'This context is read only. Editing still follows league permissions.',ui_guide_intro:'Switch cycles and groups without losing standings or the results matrix. The guide never changes league data.'
 };
 Object.assign(TRANSLATIONS.es,es,{admin_profile:'Mi perfil — Administrador'});
 Object.assign(TRANSLATIONS.en,en,{admin_profile:'My profile — Administrator'});
 Object.assign(TRANSLATIONS.es,{
  tour_intro_body:'Usá Siguiente para recorrer las pantallas. Los ciclos y grupos siguen a mano y el recuadro dorado muestra dónde mirar. Al salir volvés a tu pantalla, sin modificar datos.',
  tour_results_body:'Revisá los nombres de cada fila, elegí club y fecha y cargá dos sets. Solo con un set para cada jugador aparece el supertiebreak 1–0 o 0–1. Para 7–6 no hay campos extra. Esta guía no envía resultados.',
  tour_admin_body:'El Resumen reúne lo pendiente; Jugadores está separado de tu Perfil. Desde Configuración abrís las opciones de ciclos y gestión. Durante este recorrido no se puede editar.'
 });
 Object.assign(TRANSLATIONS.en,{
  tour_intro_body:'Select Next to explore. Cycles and groups stay within reach and the gold outline shows where to look. Leaving the tour restores your screen without changing data.',
  tour_results_body:'Check the name on each row, choose a club and date, and enter two sets. The 1–0 or 0–1 match tiebreak appears only at one set each. No extra fields are needed for 7–6. This tour submits no results.',
  tour_admin_body:'Overview brings together outstanding items; Players is separate from your Profile. Open cycle and management options in Settings. Editing is blocked during this tour.'
 });
 const e=s=>attr(s==null?'':s);
 const paths={home:'M3 10l9-7 9 7v11H3z M9 21v-7h6v7',league:'M8 3h8v5c0 5-8 5-8 0z M8 5H4v3q0 4 5 4 M16 5h4v3q0 4-5 4 M12 12v6 M7 21h10 M9 18h6',matches:'M4 5h16v16H4z M7 3v4 M17 3v4 M4 10h16 M8 14h3 M8 17h7',messages:'M4 4h16v13H8l-4 4z',profile:'M16 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',more:'M5 11v2 M12 11v2 M19 11v2',check:'M5 12l4 4L19 6',arrow:'M5 12h14 M14 7l5 5-5 5',search:'M16 10a6 6 0 1 1-12 0a6 6 0 1 1 12 0 M15 15l6 6',settings:'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M6 6l2 2 M16 16l2 2 M6 18l2-2 M16 8l2-2 M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0',help:'M12 17h.01 M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3 M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0',close:'M6 6l12 12 M6 18L18 6'};
 function icon(n){return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[n]||paths.league)+'"/></svg>';}
 const leagueName=()=>document.getElementById('hdr-title')?.textContent?.trim()||LEAGUE_NAME;
 function activeArea(){if(['inicio','resumen'].includes(subView))return'home';if(['partidos','cargar','pendientes'].includes(subView))return'matches';if(['grupos','general','rating','po','playoff','reglamento'].includes(subView))return'league';if(subView==='mensajes')return'messages';return'more';}
 const memory=new Map();let mutationBusy=false;let navResize=null;
 function activeAdmin(){return !!currentUser&&esAdmin(currentUser)&&!_ligaReadOnly;}
 function currentCycle(){return cycles.find(c=>c.n===viewCycle)||cycles.find(c=>c.n===activeN)||cycles.find(c=>c.groups);}
 function contextLabel(){return viewCycle==='po'?t('playoffs'):t('cycle')+' '+viewCycle;}
 function contextMatches(){return matches.filter(m=>viewCycle==='po'?m.po:m.cycle===viewCycle&&!m.po);}
 function ownMatch(m){return !!currentUser&&(m.po?m.poNames||[]:[m.aName,m.bName]).includes(currentUser.name);}
 function canNavigate(){return !mutationBusy&&!(global.SohailResults&&SohailResults.isSaving());}
 function canLeave(name){
  if(!canNavigate()){toast(t('ui_busy'));return false;}
  if(global.SohailResults&&!SohailResults.canLeave(name))return false;
  if(subView==='perfil'&&name!=='perfil'&&!(typeof isTutorialRunning==='function'&&isTutorialRunning())){
   const dirty=['pw-old','pw-new','pw-new2'].some(id=>document.getElementById(id)?.value);
   if(dirty&&!confirm(t('ui_profile_discard')))return false;
   if(dirty)['pw-old','pw-new','pw-new2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  }
  return true;
 }
 function allowed(name){if(['admin','jugadores','resumen','historial'].includes(name))return activeAdmin();if(_ligaReadOnly&&['inicio','partidos','cargar','pendientes','mensajes','perfil','mas'].includes(name))return false;return true;}
 function go(name){if(!allowed(name)||!canLeave(name))return; if(name==='po'||name==='playoff')viewCyc('po');else showSub(name);}
 function chooseCycle(n){
  if(!canLeave(n==='po'?'po':'grupos'))return;
  if(viewCycle!=='po'&&!(typeof isTutorialRunning==='function'&&isTutorialRunning()))memory.set(_ligaActual+':'+currentUser?.name+':'+viewCycle,selGroup);
  if(n==='po'){if(!(playoff.started||playoff.preview&&activeAdmin()))return;}else if(!cycles.find(c=>c.n===n&&c.groups))return;
  viewCyc(n);
 }
 function remembered(n){return memory.get(_ligaActual+':'+currentUser?.name+':'+n);}
 function setGroup(n){const c=currentCycle();if(!c?.groups?.[n-1])return;selGroup=n;if(!(typeof isTutorialRunning==='function'&&isTutorialRunning()))memory.set(_ligaActual+':'+currentUser?.name+':'+viewCycle,n);renderGrupos();groupControls();if(LAYOUT!=='selector')document.getElementById('ui-group-'+n)?.scrollIntoView({block:'start',behavior:'auto'});}
 function myGroup(){const loc=findLoc(currentUser?.name,viewCycle);if(loc)setGroup(loc.g);else toast(t('ui_no_group'));}
 function navButton(id,label,ic,active,extra=''){return '<button type="button" class="ui-nav-item '+(active?'is-active':'')+'" data-ui-route="'+id+'" '+(active?'aria-current="page"':'')+'>'+icon(ic)+'<span>'+e(label)+'</span>'+extra+'</button>';}
 function mount(){
  const root=document.getElementById('main-app');if(!root)return;
  root.classList.add('ui-v3');document.body.classList.add('sohail-ui-modern');
  for(const id of ['inicio','resumen','partidos','jugadores','mas'])if(!document.getElementById('view-'+id)){const d=document.createElement('div');d.id='view-'+id;d.className='ui-page';d.style.display='none';root.appendChild(d);}
  if(!document.getElementById('ui-side')){const side=document.createElement('aside');side.id='ui-side';side.className='ui-sidebar';root.prepend(side);}
  if(!document.getElementById('ui-bottom')){const nav=document.createElement('nav');nav.id='ui-bottom';nav.className='ui-bottom';root.appendChild(nav);}
  if(!document.getElementById('ui-group-controls')){const d=document.createElement('div');d.id='ui-group-controls';d.className='ui-group-controls';document.querySelector('.app-sticky-nav')?.appendChild(d);}
  const sticky=document.querySelector('.app-sticky-nav');if(sticky&&!navResize&&typeof ResizeObserver==='function'){navResize=new ResizeObserver(()=>document.documentElement.style.setProperty('--ui-sticky-h',Math.ceil(sticky.getBoundingClientRect().height)+'px'));navResize.observe(sticky);}
 }
 function renderNav(){
  mount();const root=document.getElementById('main-app');if(!root||!currentUser&&!_ligaReadOnly)return;
  const admin=activeAdmin(),area=activeArea(),home=admin?'resumen':'inicio';
  const opts=_ligaReadOnly?[[ 'grupos',t('ui_league'),'league'],['general',t('tab_general'),'matches']]:[
   [home,admin?t('ui_summary'):t('ui_home'),'home'],['partidos',admin?t('ui_matches'):t('ui_my_matches'),'matches'],['grupos',t('ui_league'),'league'],['mensajes',t('tab_mensajes'),'messages'],['perfil',t('ui_profile'),'profile']];
  let nav=opts.map(([id,lab,ic])=>navButton(id,lab,ic,id==='grupos'?area==='league':id===subView)).join('');
  if(admin)nav+='<div class="ui-nav-label">'+e(t('role_admin'))+'</div>'+[['pendientes','ui_review','check'],['jugadores','ui_players','profile'],['admin','ui_settings','settings'],['historial','hist_title','matches']].map(([id,key,ic])=>navButton(id,t(key),ic,subView===id)).join('');
  document.getElementById('ui-side').innerHTML='<div class="ui-brand"><span class="ui-brand-mark">'+icon('league')+'</span><div><strong>SOHAIL</strong><small>'+e(t('ui_your_league'))+'</small></div></div><div class="ui-side-league"><span>'+e(t('ui_current_context'))+'</span><strong>'+e(leagueName())+'</strong></div><nav aria-label="'+e(t('ui_more'))+'">'+nav+'</nav><div class="ui-sidebar-bottom">'+(!_ligaReadOnly?'<button class="ui-nav-item" type="button" data-ui-help>'+icon('help')+'<span>'+e(t('ui_help'))+'</span></button>':'')+'<span class="ui-user-name">'+e(currentUser?.name||t('ui_readonly'))+'</span></div>';
  const bottom=document.getElementById('ui-bottom');bottom.setAttribute('aria-label',t('ui_more'));
  bottom.innerHTML=_ligaReadOnly?'':[[home,t('ui_home'),'home'],['partidos',t('ui_matches'),'matches'],['grupos',t('ui_league'),'league'],['mensajes',t('tab_mensajes'),'messages'],['mas',t('ui_more'),'more']].map(([id,lab,ic])=>navButton(id,lab,ic,area===ic)).join('');
  const mark=root.querySelector('.hdr-logo');if(mark&&!mark.querySelector('svg'))mark.innerHTML=icon('league');root.dataset.uiArea=area;groupControls();
 }
 function tabDefs(){
  let defs=[];const area=activeArea();
  if(area==='league'){
   defs=[['grupos','tab_grupos'],['general','tab_general']];if(RATING_ON)defs.push(['rating','rating_title']);
   if(playoff.started||playoff.preview&&activeAdmin())defs.push(['po','playoffs']);
   if(REGLAMENTO?.trim()||activeAdmin())defs.push(['reglamento','rg_tab']);
  }else if(area==='matches')defs=[['partidos','ui_matches'],['cargar','ui_start'],['pendientes','ui_review']];
  else if(subView==='jugadores')defs=[['jugadores','ui_players'],['perfil','ui_profile']];
  const tabs=document.getElementById('tabs');tabs.style.display=defs.length?'flex':'none';
  tabs.innerHTML=defs.map(([id,key])=>'<button type="button" id="tab-'+id+'" class="tab '+(subView===id?'active':'')+'" data-ui-route="'+id+'" '+(subView===id?'aria-current="page"':'')+'>'+e(t(key))+(id==='pendientes'?' <span class="tab-n" id="pend-n" style="display:none">0</span>':'')+'</button>').join('');
 }
 function groupControls(){
  const host=document.getElementById('ui-group-controls');if(!host)return;
  const c=currentCycle();if(subView!=='grupos'||viewCycle==='po'||!c?.groups){host.hidden=true;host.replaceChildren();return;}host.hidden=false;
  if(selGroup<1||selGroup>c.groups.length)selGroup=1;
  const my=findLoc(currentUser?.name,viewCycle)?.g;
  const desktop='<div class="ui-group-buttons">'+c.groups.map((g,i)=>'<button type="button" data-ui-group="'+(i+1)+'" class="ui-group '+(selGroup===i+1?'is-active':'')+'" '+(selGroup===i+1?'aria-current="true"':'')+'>'+e(groupName(i+1))+(my===i+1?'<small> · '+e(t('mine_label'))+'</small>':'')+'</button>').join('')+'</div>';
  const mob='<div class="ui-group-mobile"><button type="button" data-ui-group="'+(selGroup-1)+'" aria-label="'+e(t('ui_previous_group'))+'" '+(selGroup===1?'disabled':'')+'>‹</button><button type="button" data-ui-group-picker aria-haspopup="dialog">'+e(groupName(selGroup))+(my===selGroup?' · '+e(t('mine_label')):'')+' <span aria-hidden="true">⌄</span></button><button type="button" data-ui-group="'+(selGroup+1)+'" aria-label="'+e(t('ui_next_group'))+'" '+(selGroup===c.groups.length?'disabled':'')+'>›</button></div>';
  host.innerHTML=desktop+mob+'<div class="ui-group-shortcuts">'+(my?'<button type="button" data-ui-my-group>'+e(t('ui_my_group'))+'</button>':'')+'<button type="button" data-ui-group-picker aria-haspopup="dialog">'+e(t('ui_all'))+' · '+c.groups.length+'</button></div>';
 }
 function groupPicker(){
  const c=currentCycle();if(!c?.groups)return;
  const dlg=document.createElement('dialog');dlg.className='ui-picker';dlg.setAttribute('aria-labelledby','ui-picker-title');
  dlg.innerHTML='<div class="ui-picker-head"><h2 id="ui-picker-title">'+e(t('ui_all_groups'))+'</h2><button type="button" aria-label="'+e(t('close'))+'" data-ui-close>'+icon('close')+'</button></div><label for="ui-picker-search" class="ui-sr-only">'+e(t('ui_group_search'))+'</label><input id="ui-picker-search" type="search" placeholder="'+e(t('ui_group_search'))+'"><div class="ui-picker-list"></div>';
  const draw=()=>{const q=dlg.querySelector('input').value.toLocaleLowerCase(LANG);const rows=c.groups.map((g,i)=>({n:i+1,players:(g.players||[]).filter(Boolean)})).filter(g=>(groupName(g.n)+' '+g.players.join(' ')).toLocaleLowerCase(LANG).includes(q));dlg.querySelector('.ui-picker-list').innerHTML=rows.map(g=>'<button type="button" data-pick="'+g.n+'" class="'+(g.n===selGroup?'is-active':'')+'"><strong>'+e(groupName(g.n))+'</strong><span>'+e(g.players.join(' · '))+'</span></button>').join('')||'<p>'+e(t('ui_no_results'))+'</p>';};
  document.body.appendChild(dlg);draw();const previous=document.activeElement;dlg.addEventListener('input',draw);dlg.addEventListener('click',ev=>{const b=ev.target.closest('[data-pick]');if(b){setGroup(Number(b.dataset.pick));dlg.close();}if(ev.target.closest('[data-ui-close]'))dlg.close();});dlg.addEventListener('close',()=>{dlg.remove();if(previous?.isConnected)previous.focus({preventScroll:true});});dlg.showModal();dlg.querySelector('input').focus();
 }
 function jump(gid,kind){
  const root=document.getElementById('ui-group-'+gid);if(!root)return;
  if(kind==='results'||kind==='positions'){root.querySelector(kind==='results'?'.ui-matrix-section':'.ui-standings-section')?.scrollIntoView({block:'start',behavior:'auto'});return;}
  const area=root.querySelector('.ui-standings-scroll'),th=root.querySelector('[data-ui-stat="'+kind+'"]');
  if(area&&th)area.scrollTo({left:Math.max(0,th.offsetLeft-(root.querySelector('.cls-table tbody td:nth-child(2)')?.offsetWidth||150)-12),behavior:'auto'});
 }
 function card(title,body,action=''){return '<section class="card ui-section"><div class="ui-section-heading"><h2>'+e(title)+'</h2>'+action+'</div>'+body+'</section>';}
 function matchCard(m,selection=false){
  const [a,b]=m.po?m.poNames:[m.aName,m.bName];const tag=m.po?t('playoffs')+' · '+m.tLabel+' · '+(m.which==='cons'?t('re_consolation'):'') : t('cycle')+' '+m.cycle+' · '+groupName(m.g);
  const score=m.np?'NJ':m.wo&&!m.sets?.length?'W.O.':(m.sets||[]).map(s=>s.join('–')).join(' / ')+(m.wo?' · RET':'');
  return '<article class="ui-match"><div class="ui-match-meta">'+(selection?'<input type="checkbox" class="ui-pending-select" value="'+m.id+'" aria-label="'+e(a+' vs '+b)+'">':'')+'<span>'+e(tag)+'</span><span class="badge '+(m.status==='confirmed'?'badge-ok':m.status==='disputed'?'badge-disp':'badge-pend')+'">'+e(t(m.status==='confirmed'?'validated_result':m.status==='disputed'?'disputed_result':'legend_pending'))+'</span></div><div class="ui-match-main"><strong>'+e(a)+' <span class="ui-vs">vs</span> '+e(b)+'</strong><b>'+e(score||'—')+'</b></div><div class="ui-match-meta"><span>'+e(m.club||'—')+' · '+e(m.date||'—')+'</span><button type="button" class="ui-link-button" data-ui-match="'+m.id+'">'+e(t('ui_open_match'))+' '+icon('arrow')+'</button></div></article>';
 }
 function pageTitle(title,sub,actions=''){return '<header class="ui-page-head"><div><p class="ui-eyebrow">'+e(leagueName())+'</p><h1>'+e(title)+'</h1><p>'+e(sub)+'</p></div>'+actions+'</header>';}
 function renderHome(){
  const admin=activeAdmin(),root=document.getElementById(admin?'view-resumen':'view-inicio');if(!root)return;
  const relevant=contextMatches().filter(m=>admin||ownMatch(m)),pending=relevant.filter(m=>m.status==='pending'),disputes=relevant.filter(m=>m.status==='disputed'),confirmed=relevant.filter(m=>m.status==='confirmed');
  const loc=findLoc(currentUser?.name,activeN),cy=cycles.find(c=>c.n===activeN),peers=loc?(cy?.groups?.[loc.g-1]?.players||[]).filter(n=>n&&n!==currentUser.name&&!USERS[n]?.inactive&&!findMatch(activeN,loc.g,currentUser.name,n)):[];
  let h=pageTitle(admin?t('ui_admin_welcome'):tf('ui_welcome',{name:(currentUser?.name||'').split(' ')[0]}),t(admin?'ui_admin_intro':'ui_home_intro'),'<button type="button" class="btn btn-primary" data-ui-route="cargar">'+icon('matches')+e(t('ui_start'))+'</button>');
  h+='<div class="ui-metrics">'+[[pending.length,'ui_pending_count','pendientes'],[disputes.length,'ui_disputes_count','pendientes'],[confirmed.length,'ui_confirmed_count','partidos']].map(([v,k,to])=>'<button type="button" class="ui-metric" data-ui-route="'+to+'"><b>'+v+'</b><span>'+e(t(k))+'</span><small>'+e(contextLabel())+'</small></button>').join('')+'</div>';
  h+='<div class="ui-home-grid">'+card(t('ui_your_league'),'<p class="ui-context-name">'+e(t('cycle')+' '+activeN)+(loc?' · '+e(groupName(loc.g)):'')+'</p><p>'+e(cy?.status==='finished'?t('ui_finished'):t('ui_active'))+'</p><button type="button" class="btn" data-ui-route="grupos">'+icon('league')+e(t('ui_table_results'))+'</button>');
  if(admin)h+=card(t('ui_attention'),pending.concat(disputes).slice(0,4).map(m=>matchCard(m)).join('')||'<p>'+e(t('ui_no_tasks'))+'</p>','<button class="ui-link-button" data-ui-route="pendientes">'+e(t('ui_view_all'))+'</button>');
  else h+=card(t('ui_unplayed'),(cy?.status==='active'&&!playoff.started?peers:[]).map(n=>'<div class="ui-opponent"><span>'+e(n)+'</span><button type="button" class="ui-link-button" data-ui-opponent="'+e(n)+'">'+e(t('ui_start'))+'</button></div>').join('')||'<p>'+e(t('ui_no_rivals'))+'</p>');
  h+='</div>'+card(t('ui_recent'),relevant.slice().sort((a,b)=>b.id-a.id).slice(0,5).map(m=>matchCard(m)).join('')||'<p>'+e(t('ui_no_matches'))+'</p>');root.innerHTML=h;
 }
 function renderMatches(){const root=document.getElementById('view-partidos');const list=contextMatches().filter(m=>activeAdmin()||ownMatch(m));root.innerHTML=pageTitle(t(activeAdmin()?'ui_matches':'ui_my_matches'),contextLabel(),'<button class="btn btn-primary" data-ui-route="cargar">'+icon('matches')+e(t('ui_start'))+'</button>')+card(t('ui_recent'),list.slice().sort((a,b)=>b.id-a.id).map(m=>matchCard(m)).join('')||'<p>'+e(t('ui_no_matches'))+'</p>');}
 function renderPending(){
  const root=document.getElementById('pend-list');if(!root)return;
  const admin=activeAdmin(),list=contextMatches().filter(m=>['pending','disputed'].includes(m.status)&&(admin||ownMatch(m)));
  document.getElementById('pend-title').textContent=t('ui_review')+' · '+contextLabel();
  root.innerHTML='<p class="ui-muted">'+e(t('ui_scoped'))+'</p>'+(admin&&list.some(m=>m.status==='pending')?'<div class="ui-bulk-tools"><button type="button" class="btn btn-primary" data-ui-bulk disabled>'+e(t('ui_validate_selected'))+' <span id="ui-selected-count">0</span></button><button type="button" class="btn" data-ui-clear-checks>'+e(t('ui_clear_selection'))+'</button></div>':'')+(list.length?list.sort((a,b)=>b.id-a.id).map(m=>matchCard(m,admin&&m.status==='pending')).join(''):'<div class="empty">'+e(t('ui_no_tasks'))+'</div>');updateBadge();
 }
 async function mutation(run){
  if(mutationBusy||_resultSubmitting||_ligaReadOnly||!_token)return false;
  mutationBusy=true;const key=_saveSessionKey(),liga=_ligaActual;let before=null;
  try{
   if(_saveInFlight)await _saveInFlight;
   if(!_loadOK||_saveConflict)throw Error(t('fix_pending_first'));
   if(_serialize()!==_lastSaved&&!await _criticalSave())throw Error(t('fix_pending_first'));
   if(key!==_saveSessionKey()||liga!==_ligaActual)throw Error(t('ui_session_changed'));
   before={matches,playoff,LOG,matchId};matches=JSON.parse(JSON.stringify(matches));playoff=JSON.parse(JSON.stringify(playoff));LOG=LOG.slice();
   run();
   if(!await _criticalSave()){
    if(key===_saveSessionKey()&&liga===_ligaActual){matches=before.matches;playoff=before.playoff;LOG=before.LOG;matchId=before.matchId;}
    return false;
   }
   return key===_saveSessionKey()&&liga===_ligaActual;
  }catch(err){if(before&&key===_saveSessionKey()&&liga===_ligaActual){matches=before.matches;playoff=before.playoff;LOG=before.LOG;matchId=before.matchId;}toast(err.message||t('ui_save_failed'));return false;}
  finally{mutationBusy=false;}
 }
 async function validateSelected(ids){
  if(!activeAdmin())return false;
  const selected=new Set(ids.map(Number)),eligible=contextMatches().filter(m=>m.status==='pending'&&selected.has(m.id));if(!eligible.length)return false;
  const ok=await confirmarModal(tf('ui_bulk_confirm',{n:eligible.length}));if(!ok)return false;
  const btn=document.querySelector('[data-ui-bulk]');if(btn)btn.disabled=true;
  const saved=await mutation(()=>{for(const old of eligible){const m=matches.find(x=>x.id===old.id);if(!m||m.status!=='pending')throw Error(t('err_conflict'));m.status='confirmed';m.locked=true;m.vBy=currentUser.name;if(m.po)applyPoPending(m);addLog('Resultado validado',{a:m.po?m.poNames[0]:m.aName,b:m.po?m.poNames[1]:m.bName,sets:m.sets,po:!!m.po});}});
  if(saved){refreshAll();toast(t('ui_saved'));}else{renderPending();toast(t('ui_save_failed'));}return saved;
 }
 function forceConfirm(){go('pendientes');document.querySelector('.ui-pending-select')?.focus();toast(t('ui_select_pending'));}
 async function resolve(id){if(!activeAdmin())return;const m=matches.find(m=>m.id===id);if(!m)return;if(!await confirmarModal((m.po?m.poNames:[m.aName,m.bName]).join(' vs ')+'\n'+(m.sets||[]).map(s=>s.join('–')).join(' / ')+'\n'+t('save_validate')))return;const ok=await mutation(()=>{const rec=matches.find(x=>x.id===id);rec.vBy=currentUser.name;rec.locked=true;rec.status='confirmed';if(rec.po)applyPoPending(rec);addLog('Disputa resuelta',{po:!!rec.po});});if(ok){closeM();refreshAll();toast(t('ui_saved'));}else toast(t('ui_save_failed'));}
 function organizeAdmin(){
  const root=document.getElementById('view-admin');if(!root||root.querySelector('.ui-admin-index'))return;
  const cards=Array.from(root.children).filter(e=>e.classList.contains('card')||e.classList.contains('form-row'));
  if(!cards.length)return;
  const head=document.createElement('div');head.className='ui-admin-index';head.innerHTML=pageTitle(t('ui_config_title'),t('ui_config_hint'))+'<label class="ui-sr-only" for="ui-admin-find">'+e(t('ui_config_search'))+'</label><input type="search" id="ui-admin-find" placeholder="'+e(t('ui_config_search'))+'">';root.prepend(head);
  cards.forEach((node,i)=>{const title=node.querySelector('.section-lbl,h2,h3')?.textContent?.trim()||t('ui_settings')+' '+(i+1);const details=document.createElement('details');details.className='ui-admin-section';details.open=i===0;const summary=document.createElement('summary');summary.textContent=title;node.before(details);details.append(summary,node);});
  const find=root.querySelector('#ui-admin-find');find.oninput=()=>{const q=find.value.toLocaleLowerCase(LANG);root.querySelectorAll('.ui-admin-section').forEach(d=>{d.hidden=!d.textContent.toLocaleLowerCase(LANG).includes(q);if(q&&!d.hidden)d.open=true;});};
  root.querySelectorAll('[onclick*="demoFillUI"]').forEach(btn=>{const d=document.createElement('details');d.className='ui-danger-details';const s=document.createElement('summary');s.textContent=t('ui_simulation_label');btn.before(d);d.append(s,btn);});
 }
 function organizeProfile(){
  const root=document.getElementById('view-perfil'),dest=document.getElementById('view-jugadores');if(!root||!dest)return;
  if(root.querySelector('.ui-profile-management'))return;dest.replaceChildren();if(!activeAdmin())return;
  const manage=Array.from(root.children).filter(n=>n.querySelector?.('#ap-nom,#player-list,#cat-jugadores-list'));
  const header=document.createElement('div');header.innerHTML=pageTitle(t('ui_players'),t('player_mgmt_hint'));dest.append(header);
  manage.forEach(n=>{dest.append(n);});
  const link=document.createElement('div');link.className='card ui-profile-management';link.innerHTML='<button class="btn" data-ui-route="jugadores">'+icon('profile')+e(t('ui_profile_link'))+'</button>';root.append(link);
 }
 function renderMore(){const root=document.getElementById('view-mas');root.innerHTML=pageTitle(t('ui_more'),currentUser?.name||'')+'<div class="ui-more-grid">'+[['perfil','ui_profile','profile'],['pendientes','ui_review','check'],...(activeAdmin()?[['resumen','ui_summary','home'],['jugadores','ui_players','profile'],['admin','ui_settings','settings'],['historial','hist_title','matches']]:[]),['reglamento','rg_tab','help']].map(([id,k,ic])=>navButton(id,t(k),ic,false)).join('')+'<button type="button" class="ui-nav-item" data-ui-help>'+icon('help')+e(t('ui_help'))+'</button></div>';}
 function afterView(){renderNav();if(subView==='admin')organizeAdmin();if(subView==='perfil'||subView==='jugadores')organizeProfile();if(['inicio','resumen'].includes(subView))renderHome();if(subView==='partidos')renderMatches();if(subView==='mas')renderMore();}
 document.addEventListener('click',ev=>{
  const target=ev.target.closest('button');if(!target||target.disabled)return;
  if(target.dataset.uiRoute){go(target.dataset.uiRoute);return;}
  if(target.hasAttribute('data-ui-help')){openTutorialPopupFromHelp();return;}
  if(target.hasAttribute('data-ui-group')){setGroup(Number(target.dataset.uiGroup));return;}
  if(target.hasAttribute('data-ui-my-group')){myGroup();return;}
  if(target.hasAttribute('data-ui-group-picker')){groupPicker();return;}
  if(target.dataset.uiJump){jump(Number(target.dataset.gid),target.dataset.uiJump);return;}
  if(target.dataset.uiMatch){openModal(Number(target.dataset.uiMatch));return;}
  if(target.dataset.uiOpponent){const loc=findLoc(currentUser?.name,activeN);if(loc&&cycles.find(c=>c.n===activeN)?.status==='active'&&!playoff.started)SohailResults.open({cycle:activeN,gid:loc.g,a:currentUser.name,b:target.dataset.uiOpponent});return;}
  if(target.hasAttribute('data-ui-bulk')){validateSelected([...document.querySelectorAll('.ui-pending-select:checked')].map(el=>Number(el.value)));return;}
  if(target.hasAttribute('data-ui-clear-checks')){document.querySelectorAll('.ui-pending-select').forEach(el=>el.checked=false);updateSelection();}
 });
 function updateSelection(){const n=document.querySelectorAll('.ui-pending-select:checked').length;const span=document.getElementById('ui-selected-count'),btn=document.querySelector('[data-ui-bulk]');if(span)span.textContent=n;if(btn)btn.disabled=!n;}
 document.addEventListener('change',e=>{if(e.target.matches('.ui-pending-select'))updateSelection();});
 document.addEventListener('keydown',ev=>{const el=ev.target;if((ev.key==='Enter'||ev.key===' ')&&el.matches('td[role="button"]')){ev.preventDefault();el.click();}});
 global.SohailUI={icon,e,go,canLeave,allowed,chooseCycle,remembered,setGroup,myGroup,renderNav,tabDefs,groupControls,jump,renderHome,renderMatches,renderPending,afterView,organizeProfile,organizeAdmin,forceConfirm,validateSelected,resolve,mutation,currentCycle,activeAdmin,contextLabel,contextMatches,ownMatch,isBusy:()=>mutationBusy};
 mount();
})(window);
