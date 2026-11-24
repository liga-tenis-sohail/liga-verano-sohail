/* Sohail player experience. Read-only presentation on top of existing sporting rules.
 * No fetch, tokens, new write paths, service worker or personal-data storage.
 * All result/validation actions delegate to the established authorised controls. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports){module.exports=api;return;}
 root.SohailPlayerExperienceData=api;
 if(root.document)mount(root,api);
 function mount(global,D){
  const doc=global.document,ui=global.SohailUI,H=global.SohailHistoryData;
  if(!ui||!H)return;
  const T=(es,en)=>doc.documentElement.lang==='en'?en:es;
  const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe=(fn,fallback)=>{try{return fn();}catch(_){return fallback;}};
  const sportSession=()=>safe(()=>!!currentUser&&!!_token&&!(typeof isTutorialRunning==='function'&&isTutorialRunning()),false);
  const session=()=>sportSession()&&safe(()=>!_ligaReadOnly,false);
  const player=()=>session()&&safe(()=>currentUser.role==='player'&&!esAdmin(currentUser),false);
  const admin=()=>session()&&safe(()=>ui.activeAdmin(),false);
  const name=()=>safe(()=>currentUser.name,'');
  const league=()=>safe(()=>String(LIGA_NOMBRE_OFICIAL||LEAGUE_NAME||'Sohail'),'Sohail');
  const group=n=>Number.isSafeInteger(n)&&n>0?T('Grupo ','Group ')+n:'—';
  const cyc=n=>T('Ciclo ','Cycle ')+n;
  const button=(label,action,value='',primary=false)=>'<button type="button" class="btn'+(primary?' btn-primary':'')+'" data-px-action="'+e(action)+'" data-px-value="'+e(value)+'">'+e(label)+'</button>';
  const route=(label,id,primary=false)=>'<button type="button" class="btn'+(primary?' btn-primary':'')+'" data-ui-route="'+e(id)+'">'+e(label)+'</button>';
  const metric=(label,value)=>'<div class="px-metric"><strong>'+e(value)+'</strong><span>'+e(label)+'</span></div>';
  const title=(heading,sub='')=>'<header class="px-heading"><h2>'+e(heading)+'</h2>'+(sub?'<p>'+e(sub)+'</p>':'')+'</header>';
  const note=s=>'<p class="px-note">'+e(s)+'</p>';
  const card=(cls,content)=>'<section class="card px-card '+cls+'">'+content+'</section>';
  const meter=(done,total)=>'<div class="px-progress" role="progressbar" aria-label="'+e(T('Cruces confirmados','Confirmed fixtures'))+'" aria-valuemin="0" aria-valuemax="'+Math.max(1,total)+'" aria-valuenow="'+done+'"><span style="width:'+Math.round(total?100*done/total:0)+'%"></span></div>';
  const current=()=>safe(()=>({cycles,matches,users:USERS,activeN,playoff,dates:FECHAS,destinations:DESTINO}),null);
  const cycleObj=(s,n)=>s?.cycles?.find(c=>c.n===n);
  function cardAt(host,key,html,where='prepend'){
   if(!host)return null;let box=host.querySelector(':scope > [data-px-slot="'+key+'"]');
   if(!box){box=doc.createElement('div');box.dataset.pxSlot=key;box.className='px-slot';host[where](box);}
   if(box._pxHTML!==html){box.innerHTML=html;box._pxHTML=html;}return box;
  }
  const stats=(list,n)=>H.summarize(H.records(list,n),n);
  function groupStats(s,n,cy){
   const g=D.membership(s.cycles,n,cy);if(!g)return null;
   const rows=safe(()=>computeStats(cy,g),[]);const raw=rows.findIndex(r=>r.name===n);if(raw<0)return null;
   // Match the displayed group table: the original ranking determines positional
   // points/destinations; inactive rows with no record are omitted from display.
   const visible=rows.filter(r=>!s.users[r.name]?.inactive||s.matches.some(m=>!m.po&&m.cycle===cy&&m.g===g&&[m.aName,m.bName].includes(r.name)));
   const position=visible.findIndex(r=>r.name===n)+1;
   const dest=s.destinations?.[g]?.[raw];const destination=/^G[1-9]\d*$/.test(dest||'')?Number(dest.slice(1)):null;
   return {g,position,points:rows[raw].pts,destination:destination<=cycleObj(s,cy)?.groups?.length?destination:null};
  }
  function stateRows(s,n){const c=cycleObj(s,s.activeN),g=D.membership(s.cycles,n,s.activeN);return c&&g&&!s.playoff?.started?D.fixtures(c,g,s.matches,s.users,n):[];}
  const prettyDate=key=>key?key.split('-').reverse().join('/'):'—';
  function score(m,n){const flip=H.players(m)[1]===n;return m.np?T('No jugado','Not played'):H.kind(m)==='wo'?'W.O.':H.pairs(m).map(a=>a[flip?1:0]+'–'+a[flip?0:1]).join(' / ')+(m.wo?' · RET':'');}
  function groupRow(s,n,row){
   const m=row.match,rival=row.rival,valid=m?.status==='confirmed',active=cycleObj(s,s.activeN)?.status==='active';
   const who=valid?H.winner(m):null,label=row.conflict?T('Revisar registro','Check record'):!m?T('Sin resultado','No result'):valid?(m.np?T('No jugado','Not played'):H.kind(m)==='wo'?'W.O.':who===n?T('Victoria','Win'):who?T('Derrota','Loss'):T('Confirmado','Confirmed')):m.status==='disputed'?T('En disputa','Disputed'):T('Por validar','Awaiting review');
   const pill=valid&&who===n?'is-win':valid&&who&&who!==n?'is-loss':m&&!valid?'is-pending':'';
   const rivalButton=button(rival,'rival',rival);
   const action=row.conflict?'':m?button(T('Ver partido','View match'),'match',String(m.id)):active&&!s.users[n]?.inactive&&!s.users[rival]?.inactive?button(T('Cargar resultado','Report score'),'report',rival,true):'';
   const share=valid&&who&&Number.isSafeInteger(m.id)?button(T('Compartir','Share'),'share-match',String(m.id)):'';
   return '<article class="px-fixture"><div class="px-fixture-head"><div>'+rivalButton+'<span class="px-note">'+e(m?[m.club,prettyDate(H.dateKey(m.date))].filter(Boolean).join(' · '):cyc(s.activeN))+'</span></div><span class="px-pill '+pill+'">'+e(label)+'</span></div>'+(m?'<strong class="px-score">'+e(score(m,n)||'—')+'</strong>':'')+'<div class="px-actions">'+action+share+'</div></article>';
  }
  let filter={key:'',tab:'todo'};
  function mountMatches(host){
   if(!player()||!host)return;const s=current();if(!s||s.playoff?.started)return;const n=name(),g=D.membership(s.cycles,n,s.activeN);if(!g)return;
   const rows=stateRows(s,n),p=D.progress(rows),c=cycleObj(s,s.activeN),key=JSON.stringify([safe(()=>_ligaActual,''),n,s.activeN]);
   if(filter.key!==key)filter={key,tab:c?.status==='finished'?'done':'todo'};
   const tabs=[['todo',T('Sin resultado','No result'),p.todo],['review',T('Por revisar','To review'),p.review],['done',T('Confirmados','Confirmed'),p.done]];
   const wanted=rows.filter(r=>D.bucket(r)===filter.tab);
   const html=card('px-matches',title(T('Mis cruces del ciclo','My cycle fixtures'),cyc(s.activeN)+' · '+group(g))+'<div class="px-segments" role="group" aria-label="'+e(T('Estado de partidos','Fixture status'))+'">'+tabs.map(([id,l,v])=>'<button type="button" aria-pressed="'+(id===filter.tab)+'" data-px-action="filter" data-px-value="'+id+'">'+e(l)+' <b>'+v+'</b></button>').join('')+'</div><div class="px-fixtures">'+(wanted.length?wanted.map(r=>groupRow(s,n,r)).join(''):note(T('No hay cruces en esta categoría.','No fixtures in this category.')))+'</div>'+note(T('Historial de todas las temporadas ↓','All-season history ↓')));
   const box=cardAt(host,'fixtures',html);const head=host.querySelector(':scope > .mh-page-head');if(head&&box&&head.nextElementSibling!==box)head.after(box);
  }
  function closure(s,n){
   const past=(s.cycles||[]).filter(c=>c?.status==='finished'&&D.membership(s.cycles,n,c.n)).slice().sort((a,b)=>b.n-a.n)[0];if(!past)return null;
   const row=groupStats(s,n,past.n),next=cycleObj(s,past.n+1);if(!row)return null;
   const target=next&&['active','finished'].includes(next.status)?D.membership(s.cycles,n,next.n):null;
   const list=s.matches.filter(m=>!m.po&&m.cycle===past.n&&[m.aName,m.bName].includes(n)),st=stats(list,n);
   return {cycle:past.n,from:row.g,to:target,played:st.played,wins:st.wins,losses:st.losses,points:row.points,position:row.position};
  }
  function closureHTML(s,n){const c=closure(s,n);if(!c)return '';
   const movement=c.to==null?T('Ciclo finalizado','Cycle completed'):c.to<c.from?T('Ascenso confirmado','Promotion confirmed'):c.to>c.from?T('Descenso confirmado','Relegation confirmed'):T('Permanencia confirmada','Stayed in group');
   return card('px-cycle-card',title(T('Resumen del último cierre','Last completed cycle'),cyc(c.cycle))+'<div class="px-move"><span>'+e(movement)+'</span><strong>'+e(group(c.from)+(c.to?' → '+group(c.to):''))+'</strong></div><div class="px-metrics">'+metric(T('Jugados reales','Played'),c.played)+metric(T('Victorias reales','Wins'),c.wins)+metric(T('Puntos de grupo','Group points'),c.points)+'</div>'+note(T('El destino se toma del grupo realmente habilitado. Los partidos sin juego no se cuentan como disputados.','Destination comes from the actual opened group. Unplayed fixtures are excluded from played matches.'))+button(T('Guardar / compartir imagen','Save / share image'),'share-cycle'));
  }
  function dashboard(){
   const host=doc.getElementById('view-inicio');if(!host)return;host.classList.remove('px-enhanced-home');if(!player())return;const s=current();if(!s||s.playoff?.started)return;
   const n=name(),r=groupStats(s,n,s.activeN),c=cycleObj(s,s.activeN);if(!r||!c)return;
   const rows=stateRows(s,n),p=D.progress(rows),list=s.matches.filter(m=>!m.po&&m.cycle===s.activeN&&m.g===r.g&&[m.aName,m.bName].includes(n)),st=stats(list,n),end=D.endDate(s.dates?.[s.activeN-1]),remaining=c.status==='active'?D.daysLeft(end,new Date()):null;
   const movement=c.status==='active'&&r.destination&&!s.users[n]?.inactive?(r.destination<r.g?T('Ascenso provisional','Provisional promotion'):r.destination>r.g?T('Descenso provisional','Provisional relegation'):T('Permanencia provisional','Provisional stay'))+' · '+group(r.destination):T('Consultá la clasificación del ciclo','See cycle standings');
   const countdown=remaining==null?'':remaining<0?T('Fecha prevista superada · el ciclo sigue abierto','Scheduled end passed · cycle remains open'):remaining===0?T('Último día previsto del ciclo','Scheduled last day'):remaining+' '+T('días hasta el cierre previsto','days until scheduled end');
   const headline='<section class="px-hero"><div class="px-hero-top"><span>'+e(T('Hola, ','Hi, ')+n.split(' ')[0]+' · '+cyc(s.activeN))+'</span><span class="px-ball" aria-hidden="true">◉</span></div><h2>'+e(T('Tu ciclo, de un vistazo','Your cycle at a glance'))+'</h2><div class="px-metrics">'+metric(T('Grupo','Group'),r.g)+metric(T('Posición','Position'),r.position>0&&!s.users[n]?.inactive?r.position+'º':'—')+metric(T('Puntos','Points'),r.points)+'</div><p class="px-destination">'+e(movement)+'</p></section>';
   const progress=card('px-overview',title(T('Progreso del ciclo','Cycle progress'),p.done+' '+T('de','of')+' '+p.total+' '+T('cruces confirmados','confirmed fixtures'))+meter(p.done,p.total)+'<div class="px-metrics">'+metric(T('Victorias reales','Wins'),st.wins)+metric(T('Derrotas reales','Losses'),st.losses)+metric(T('Sin resultado','No result'),p.todo)+'</div>'+note(countdown||T('Los cruces confirmados incluyen W.O. y no jugados.','Confirmed fixtures include W.O. and not played.'))+'<div class="px-actions">'+(c.status==='active'&&rows.some(v=>D.bucket(v)==='todo'&&!s.users[n]?.inactive&&!s.users[v.rival]?.inactive)?'<button type="button" class="btn btn-primary" data-ui-home-load>'+e(T('Cargar resultado','Report score'))+'</button>':'')+button(T('Mi grupo','My group'),'my-group','',false)+route(T('Mis partidos','My matches'),'partidos')+button(T('Mi evolución','My progress'),'rival',n)+'</div>');
   const activity=s.matches.filter(m=>!m.po&&m.cycle===s.activeN&&m.g===r.g&&m.status==='confirmed').slice().sort(H.newest).slice(0,4);
   const recent=card('px-activity',title(T('Actividad reciente de tu grupo','Recent group activity'))+(activity.length?activity.map(m=>'<div class="px-activity-row"><span>'+e(m.aName+' · '+m.bName)+'</span><strong>'+e(score(m,m.aName))+'</strong>'+button(T('Ver','View'),'match',String(m.id))+'</div>').join(''):note(T('Todavía no hay resultados confirmados.','No confirmed results yet.'))));
   const review=p.review?card('px-attention',title(T('Resultados por revisar','Results to review'),p.review+' '+T('cruces pendientes, en disputa o con conflicto','pending, disputed or conflicting fixtures'))+button(T('Ir a revisión','Go to review'),'review-active','',true)):'';
   const dashboardBox=cardAt(host,'dashboard',headline+progress+review);const greeting=host.querySelector(':scope > .ui-home-hero');if(greeting&&dashboardBox&&greeting.nextElementSibling!==dashboardBox)greeting.after(dashboardBox);cardAt(host,'cycle-summary',closureHTML(s,n)+recent,'append');
   host.classList.add('px-enhanced-home');
  }
  function evolutionHTML(options){
   const local=D.timeline(options.cycles,options.name),archived=D.archiveTimeline(options.records,options.leagueId),first=local[0],last=local.at(-1),best=local.length?Math.min(...local.map(x=>x.group)):null;
   const chart=(rows)=>{
    if(!rows.length)return note(T('Sin asignaciones de grupo disponibles.','No group assignments available.'));
    const min=Math.min(...rows.map(x=>x.group)),max=Math.max(...rows.map(x=>x.group));
    const steps=rows.map((r,i)=>({x:rows.length===1?160:25+i*270/(rows.length-1),y:22+(r.group-min)*67/Math.max(1,max-min),...r}));
    const dots=steps.map(v=>'<circle cx="'+v.x+'" cy="'+v.y+'" r="4.5" fill="currentColor"/><text x="'+v.x+'" y="'+(v.y-9)+'" text-anchor="middle">G'+v.group+'</text><text class="px-axis" x="'+v.x+'" y="108" text-anchor="middle">C'+v.cycle+'</text>').join('');
    const line=steps.slice(1).map((v,i)=>v.cycle===steps[i].cycle+1?'<line x1="'+steps[i].x+'" y1="'+steps[i].y+'" x2="'+v.x+'" y2="'+v.y+'" stroke="currentColor" stroke-width="2.5"/>':'').join('');
    // Many cycles use an accessible list rather than overlapping chart labels.
    return (rows.length<=8?'<svg class="px-evolution-chart" viewBox="0 0 320 116" role="img" aria-label="'+e(rows.map(v=>cyc(v.cycle)+': '+group(v.group)).join('; '))+'"><line class="px-chart-grid" x1="15" y1="89" x2="305" y2="89"/>'+line+dots+'</svg>':'')+'<div class="px-history-chips">'+rows.map((v,i)=>'<span><small>'+e(cyc(v.cycle))+'</small><b>'+e(group(v.group))+'</b>'+(i&&v.cycle===rows[i-1].cycle+1?'<small>'+e(v.group<rows[i-1].group?'↑':v.group>rows[i-1].group?'↓':'=')+'</small>':'')+'</span>').join('')+'</div>';
   };
   let html=title(T('Evolución de grupos','Group progression'),options.leagueName||T('Liga seleccionada','Selected league'));
   if(local.length)html+='<div class="px-metrics">'+metric(T('Inicial','Initial'),group(first.group))+metric(T('Último asignado','Last assigned'),group(last.group))+metric(T('Mejor grupo','Best group'),group(best))+'</div>';
   html+=chart(local)+note(T('Asignaciones reales de ciclos abiertos o finalizados. Menor número = grupo superior.','Actual assignments in opened or completed cycles. Lower number = higher group.'));
   if(archived.length)html+='<details class="px-archive"><summary>'+e(T('Otras temporadas vinculadas','Other linked seasons'))+'</summary>'+archived.map(a=>'<section>'+title(a.leagueName)+chart(a.rows)+'</section>').join('')+note(T('En otras temporadas, solo grupos acreditados por resultados confirmados. No se inventan ciclos sin registros ni se enlazan homónimos.','For other seasons, groups are evidenced by confirmed records only. Missing cycles and name-only matches are not inferred.'))+'</details>';
   if(local.length&&options.includeStats){const st=stats(options.localRecords||[],options.name),ascents=local.slice(1).filter((v,i)=>v.cycle===local[i].cycle+1&&v.group<local[i].group).length;html+='<div class="px-sport-stats">'+title(T('Hitos en esta liga','Milestones in this league'))+'<div class="px-metrics">'+metric(T('Victorias reales','Wins'),st.wins)+metric(T('Victorias %','Win rate'),st.pct==null?'—':st.pct+'%')+metric(T('Mejor racha real','Best streak'),D.streak(H.records(options.localRecords||[],options.name),options.name,H))+metric(T('Ascensos reales','Actual promotions'),ascents)+'</div></div>';}
   return card('px-evolution',html);
  }
  function mountEvolution(host,options){
   if(!host||!options?.name||!sportSession())return;safe(palette,null);
   // Only the established sporting profile view may call this. No extra request.
   const target=host.querySelector(':scope > [data-mhp-panel=summary]')||host;
   const html=evolutionHTML(options),box=cardAt(target,'evolution',html);
   const context=host.querySelector(':scope > .mh-player-context');if(target===host&&context&&box&&context.nextElementSibling!==box)context.after(box);
  }
  function mountSummary(host,options){if(!player()||options?.name!==name())return;mountEvolution(host,options);}
  function profile(){const host=doc.getElementById('view-perfil');if(!player()||!host)return;
   const size=safe(()=>doc.documentElement.getAttribute('data-sohail-table-size')||'85','85');
   cardAt(host,'profile-head',card('px-profile',title(T('Mi perfil','My profile'),name())+'<div class="px-actions">'+button(T('Ficha deportiva','Sporting profile'),'rival',name(),true)+route(T('Más opciones','More options'),'mas')+'</div>'+ '<div class="px-pref"><span>'+e(T('Tamaño de tablas','Table size'))+'</span>'+['85','100'].map(v=>'<button type="button" class="btn" data-px-action="size" data-px-value="'+v+'" aria-pressed="'+(size===v)+'">'+v+' %</button>').join('')+'</div>'+note(T('El tema y los dispositivos se gestionan en las tarjetas de abajo.','Theme and devices are managed in the cards below.'))));
  }
  function notices(){const host=doc.getElementById('view-mensajes');if(!player()||!host)return;const s=current();if(!s)return;
   const own=H.records(s.matches,name()).filter(m=>s.playoff?.started?m.po:!m.po&&m.cycle===s.activeN);const pend=own.filter(m=>m.status==='pending').length,disp=own.filter(m=>m.status==='disputed').length;
   const latest=closure(s,name());cardAt(host,'notices',card('px-notices',title(T('Avisos y mensajes','Notices and messages'),T('Lo que necesita tu atención','What needs your attention'))+'<div class="px-metrics">'+metric(T('Por validar','Awaiting review'),pend)+metric(T('En disputa','Disputed'),disp)+'</div><div class="px-actions">'+button(T('Revisar resultados','Review results'),'review-active','',!!(pend+disp))+(latest?button(T('Ver resumen de cierre','View closing summary'),'closure'):'')+'</div>'+note(T('Los comunicados y el chat de grupo se mantienen debajo.','Announcements and group chat remain below.'))));}
  function adminOverview(){const host=doc.getElementById('view-resumen');if(!admin()||!host)return;const s=current(),c=cycleObj(s,s?.activeN);if(!c||s.playoff?.started)return;
   const rows=(c.groups||[]).map((_,i)=>({g:i+1,...D.progress(D.fixtures(c,i+1,s.matches,s.users))})).sort((a,b)=>b.todo+b.review-a.todo-a.review||a.g-b.g);
   const totals=rows.reduce((a,r)=>({done:a.done+r.done,todo:a.todo+r.todo,review:a.review+r.review,total:a.total+r.total}),{done:0,todo:0,review:0,total:0});
   const html=card('px-admin',title(T('Control del ciclo','Cycle control'),cyc(s.activeN))+'<div class="px-metrics">'+metric(T('Confirmados','Confirmed'),totals.done)+metric(T('Sin resultado','No result'),totals.todo)+metric(T('Por revisar','To review'),totals.review)+'</div>'+meter(totals.done,totals.total)+'<div class="px-actions">'+button(T('Revisar resultados','Review results'),'review-active','',true)+route(T('Gestionar jugadores','Manage players'),'jugadores')+route(T('Administrar liga','League admin'),'admin')+(global.SohailCycleClose&&safe(()=>puedeGestionarAdmins(currentUser),false)?button(T('Previsualizar destinos','Preview destinations'),'preview-close'):'')+'</div>'+title(T('Grupos con más trabajo pendiente','Groups with most outstanding fixtures'))+rows.slice(0,8).map(r=>'<div class="px-admin-group"><strong>'+e(group(r.g))+'</strong><span>'+r.done+'/'+r.total+'</span>'+meter(r.done,r.total)+button(T('Ver','View'),'admin-group',r.g)+'</div>').join('')+note(T('Solo cruces entre jugadores activos. El cierre sigue utilizando la revisión oficial de destinos y los controles del servidor.','Active-player fixtures only. Official closing checks and server permissions remain unchanged.')));
   cardAt(host,'admin',html);
  }
  function previewClose(s){
   if(!admin()||!global.SohailCycleClose||!safe(()=>puedeGestionarAdmins(currentUser),false))return;
   let plan,error='';try{plan=global.SohailCycleClose.plan({_v:safe(()=>_stateV,0),cycles:s.cycles,matches:s.matches,activeN:s.activeN,playoff:s.playoff,DESTINO:s.destinations,PUNTOS:safe(()=>PUNTOS,{}),users:s.users});}catch(err){error=String(err?.message||T('No se pudo calcular la revisión.','Could not prepare the review.'));}
   const old=doc.getElementById('px-preview-close');if(old){old.close();old.remove();}
   const d=doc.createElement('dialog');d.id='px-preview-close';d.className='px-preview-dialog';d._pxContext=receiptKey();d.setAttribute('aria-labelledby','px-preview-title');
   const tied=new Set((plan?.ties||[]).flatMap(t=>t.players.map(r=>JSON.stringify([r.group,r.name]))));
   const rows=plan?.entries||[];
   d.innerHTML='<header><h2 id="px-preview-title">'+e(T('Previsión de destinos','Destination preview'))+'</h2><p class="px-note">'+e(T('Solo simulación. No guarda ni cierra el ciclo.','Preview only. Nothing is saved or closed.'))+'</p></header>'+(error?'<p role="alert" class="px-note">'+e(error)+'</p>':!plan?.to?note(T('No hay un ciclo siguiente para repartir jugadores.','There is no next cycle for reassignment.')):'<div class="px-preview-list">'+rows.map(r=>'<div><strong>'+e(r.name)+'</strong><span>'+e(group(r.group))+'</span><b>'+e(tied.has(JSON.stringify([r.group,r.name]))?T('Revisión de empate','Tie review'):group(Number(r.destination.slice(1))))+'</b></div>').join('')+'</div>'+note(T('Los empates a cero requieren la decisión oficial del administrador.','Zero-point ties require the official administrator decision.')))+'<footer><button type="button" class="btn btn-primary" data-px-preview-close>'+e(T('Cerrar','Close'))+'</button></footer>';
   d.querySelector('[data-px-preview-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove(),{once:true});doc.body.append(d);d.showModal();
  }
  function groupProgress(){if(!session())return;const s=current(),c=cycleObj(s,safe(()=>viewCycle,null));if(!s||!c||!['active','finished'].includes(c.status))return;
   for(const section of doc.querySelectorAll('#view-grupos .ui-group-card')){const g=Number(section.id.replace('ui-group-',''));if(!c.groups?.[g-1])continue;const panel=section.querySelector('.ui-standings-section');if(!panel)continue;const p=D.progress(D.fixtures(c,g,s.matches,s.users));const box=cardAt(panel,'group-progress','<div class="px-group-progress"><strong>'+e(T('Cruces confirmados entre activos','Confirmed active-player fixtures'))+' · '+p.done+'/'+p.total+'</strong>'+meter(p.done,p.total)+'<span>'+p.todo+' '+e(T('sin resultado','no result'))+' · '+p.review+' '+e(T('por revisar','to review'))+'</span></div>');const head=panel.querySelector('.ui-muted');if(head&&box&&head.nextElementSibling!==box)head.after(box);}
  }
  function rankingSearch(){const host=doc.getElementById('view-general');if(!session()||!host)return;const table=host.querySelector('.gen-table');if(!table)return;
   const box=cardAt(host,'ranking-find','<div class="px-ranking-find"><label for="px-rank-query">'+e(T('Buscar en clasificación','Find in standings'))+'</label><input id="px-rank-query" type="search" autocomplete="off" placeholder="'+e(T('Nombre o apellido','Name or surname'))+'"><div class="px-actions">'+button(T('Buscar','Find'),'rank-find')+(player()?button(T('Mi posición','My position'),'rank-self'):'')+'</div><p role="status" class="px-note" data-px-rank-status></p></div>');
   if(box)box.onkeydown=ev=>{if(ev.key==='Enter'&&ev.target.id==='px-rank-query'){ev.preventDefault();findRanking(ev.target.value);}};
  }
  function findRanking(query){const normalized=D.normalized(query),rows=[...doc.querySelectorAll('#gen-body tr')];let first=null,count=0;
   rows.forEach(r=>{const text=r.querySelector('.nm-link')?.textContent||'',hit=!!normalized&&D.normalized(text).includes(normalized);r.classList.toggle('px-rank-hit',hit);if(hit){count++;if(!first)first=r;}});
   const status=doc.querySelector('[data-px-rank-status]');if(status)status.textContent=normalized?count+' '+T('coincidencias; posiciones sin cambios.','matches; ranks unchanged.'):' ';first?.scrollIntoView({block:'center',behavior:'auto'});
  }
  function nav(){if(!player())return;const bottom=doc.getElementById('ui-bottom');if(!bottom)return;const last=bottom.querySelector('[data-ui-route="mas"],[data-px-profile-nav]');if(last){last.dataset.uiRoute='perfil';last.dataset.pxProfileNav='1';last.innerHTML=ui.icon('profile')+'<span data-ui-nav-label>'+e(T('Perfil','Profile'))+'</span>';const on=['perfil','mas'].includes(subView);last.classList.toggle('is-active',on);if(on)last.setAttribute('aria-current','page');else last.removeAttribute('aria-current');}
   for(const b of doc.querySelectorAll('#ui-bottom [data-ui-route="mensajes"],#ui-side [data-ui-route="mensajes"]')){const label=b.querySelector('[data-ui-nav-label]');if(label)label.textContent=T('Avisos','Notices');}
  }
  function shareImage(titleText,main,lines){
   // Generated locally from confirmed sporting data only, never profile contacts.
   const canvas=doc.createElement('canvas');canvas.width=1080;canvas.height=1080;const ctx=canvas.getContext('2d');if(!ctx)return;
   const theme=global.SohailAppearance,p=safe(()=>theme?.hex?.(LEAGUE_COLOR_PRI)||'#1b4f9c','#1b4f9c');
   const ink=safe(()=>theme?.textOn?.(p)||'#ffffff','#ffffff');ctx.fillStyle=p;ctx.fillRect(0,0,1080,1080);ctx.fillStyle='#f5c518';ctx.fillRect(64,60,100,12);ctx.fillStyle=ink;
   function write(text,y,size,weight='600'){ctx.font=weight+' '+size+'px sans-serif';ctx.textAlign='left';ctx.fillText(String(text).slice(0,180),64,y,952);}
   write('SOHAIL  /  TENIS',140,40);write(league(),210,31,'400');write(titleText,320,52);write(main,458,76);let y=570;for(const line of lines){write(line,y,44,'500');y+=82;}write(T('Resumen deportivo · Datos confirmados','Sporting summary · Confirmed data'),1000,26,'400');
   const a=doc.createElement('a');a.download='sohail-resumen.png';a.href=canvas.toDataURL('image/png');a.click();
   // Keep the choice to send the image with the user; never send to WhatsApp automatically.
   if(typeof toast==='function')toast(T('Imagen preparada. Podés compartirla por WhatsApp.','Image ready. You can share it on WhatsApp.'));
  }
  function palette(){const a=global.SohailAppearance;if(!a)return;const p=a.hex(safe(()=>LEAGUE_COLOR_PRI,''),'#1b4f9c'),ink=a.textOn(p),action=getComputedStyle(doc.documentElement).getPropertyValue('--action').trim()||a.actionFor(p),surface=getComputedStyle(doc.documentElement).getPropertyValue('--surface').trim()||'#ffffff';const chart=a.contrast(p,surface)>=4.5?p:a.textOn(surface);doc.documentElement.style.setProperty('--px-hero-bg',p);doc.documentElement.style.setProperty('--px-hero-ink',ink);doc.documentElement.style.setProperty('--px-action',action);doc.documentElement.style.setProperty('--px-chart-ink',chart);}
  let pendingSize=null,sizeObserver=null,receipt=null;
  function syncPendingSize(){if(!pendingSize)return;const b=doc.querySelector('[data-sohail-size="'+pendingSize+'"]');if(b){pendingSize=null;sizeObserver?.disconnect();sizeObserver=null;b.click();}}
  function selectSize(val){const existing=doc.querySelector('[data-sohail-size="'+val+'"]');if(existing){pendingSize=null;sizeObserver?.disconnect();sizeObserver=null;existing.click();}else{pendingSize=val;doc.documentElement.setAttribute('data-sohail-table-size',val);safe(()=>localStorage.setItem('sohail-tables-size-v1',val));if(!sizeObserver&&typeof MutationObserver==='function'){sizeObserver=new MutationObserver(syncPendingSize);sizeObserver.observe(doc.body,{childList:true,subtree:true});}}}

  const receiptKey=()=>safe(()=>JSON.stringify([_ligaActual,currentUser?.name,_saveSessionKey()]),'');
  const confirmedState=()=>safe(()=>JSON.parse(_lastSaved||'{}'),{});
  function showReceipt(){
   const key=receiptKey(),v=safe(()=>subView,'');if(!receipt||receipt.key!==key||!player()){receipt=null;doc.querySelectorAll('[data-px-slot=receipt]').forEach(el=>el.remove());return;}
   const hosts=doc.querySelectorAll('[data-px-slot=receipt]');for(const el of hosts)if(el.parentElement?.id!=='view-'+v)el.remove();
   const host=doc.getElementById('view-'+v);if(!host||!['inicio','grupos','partidos','cargar','pendientes'].includes(v))return;
   const stored=(confirmedState().matches||[]).find(m=>String(m.id)===receipt.id&&H.players(m).includes(name()));if(!stored){receipt=null;return;}
   cardAt(host,'receipt',card('px-receipt',title(T('Guardado en el servidor','Saved on server'),H.players(stored).join(' · '))+'<div class="px-receipt-score"><strong>'+e(score(stored,name())||'—')+'</strong><span class="px-pill '+(stored.status==='confirmed'?'is-win':'is-pending')+'">'+e(stored.status==='confirmed'?T('Confirmado','Confirmed'):stored.status==='disputed'?T('En disputa','Disputed'):T('Pendiente de validación','Awaiting validation'))+'</span></div><div class="px-actions">'+button(T('Ver partido','View match'),'match',stored.id)+button(T('Cerrar comprobante','Dismiss receipt'),'dismiss-receipt')+'</div>'));
  }
  const previousMutation=ui.mutation;
  if(typeof previousMutation==='function')ui.mutation=async function(...args){
   const key=player()?receiptKey():'',before=key?safe(()=>new Set((confirmedState().matches||[]).map(m=>String(m.id))),null):null;
   const ok=await previousMutation.apply(this,args);
   if(ok&&key&&before&&key===receiptKey()&&player())safe(()=>{const stored=(confirmedState().matches||[]).filter(m=>!before.has(String(m.id))&&H.players(m).includes(name())&&m.reporter===name()&&['confirmed','pending'].includes(m.status));if(stored.length===1){receipt={key,id:String(stored[0].id)};showReceipt();}},null);
   return ok;
  };
  function after(){const preview=doc.getElementById('px-preview-close');if(preview&&(!admin()||preview._pxContext!==receiptKey()))preview.close();if(!session()){receipt=null;doc.querySelectorAll('[data-px-slot=receipt]').forEach(el=>el.remove());return;}safe(palette,null);nav();const v=safe(()=>subView,'');if(v==='inicio')dashboard();else if(v==='resumen')adminOverview();else if(v==='perfil')profile();else if(v==='mensajes')notices();else if(v==='partidos')mountMatches(doc.getElementById('view-partidos'));else if(v==='general')rankingSearch();else if(v==='grupos')groupProgress();showReceipt();}
  function wrap(obj,k,fn){const old=obj[k];if(typeof old!=='function')return;obj[k]=function(...args){const ret=old.apply(this,args);safe(fn,null);return ret;};}
  wrap(ui,'afterView',after);wrap(ui,'renderNav',nav);wrap(ui,'renderHome',()=>{if(admin())adminOverview();else dashboard();});wrap(global,'renderGrupos',groupProgress);
  doc.addEventListener('click',ev=>{
   const b=ev.target.closest('[data-px-action]');if(!b||b.disabled||!session())return;const action=b.dataset.pxAction,val=b.dataset.pxValue,n=name(),s=current();if(!s)return;
   if(action==='dismiss-receipt'){receipt=null;doc.querySelectorAll('[data-px-slot=receipt]').forEach(el=>el.remove());}
   else if(action==='filter'&&player()&&['todo','review','done'].includes(val)){filter.tab=val;mountMatches(doc.getElementById('view-partidos'));doc.querySelector('[data-px-action="filter"][data-px-value="'+val+'"]')?.focus({preventScroll:true});}
   else if(action==='rival'&&player()&&typeof val==='string'&&D.timeline(s.cycles,val).length&&Object.prototype.hasOwnProperty.call(s.users,val)&&!['admin','superadmin'].includes(val)){if(ui.canLeave(subView))global.SohailHistory.openPlayer(val);}
   else if(action==='my-group'&&player())ui.openCompetition();
   else if(action==='review-active'&&(player()||admin())&&ui.canLeave('pendientes')){const target=s.playoff?.started?'po':s.activeN;if(viewCycle!==target)ui.chooseCycle(target);if(viewCycle===target)ui.go('pendientes');}
   else if(action==='closure'&&player()){ui.go('inicio');if(subView==='inicio')doc.querySelector('.px-cycle-card')?.scrollIntoView({block:'start',behavior:'auto'});}
   else if(action==='match'&&(player()||admin())){const m=s.matches.find(x=>String(x.id)===val);if(m&&(admin()||H.players(m).includes(n)||!m.po&&m.status==='confirmed'&&m.cycle===s.activeN&&m.g===D.membership(s.cycles,n,s.activeN))&&ui.canLeave(subView))openModal(m.id);}
   else if(action==='report'&&player()){const c=cycleObj(s,s.activeN),g=D.membership(s.cycles,n,s.activeN);if(!g||c?.status!=='active'||s.playoff?.started||s.users[n]?.inactive||s.users[val]?.inactive||!stateRows(s,n).some(r=>r.rival===val&&D.bucket(r)==='todo')||!ui.canLeave('cargar'))return;global.SohailResults.open({cycle:s.activeN,gid:g,a:n,b:val});}
   else if(action==='share-cycle'&&player()){const c=closure(s,n);if(c)shareImage(T('Ciclo cerrado','Completed cycle')+' · '+c.cycle,n,[group(c.from)+(c.to?' → '+group(c.to):''),c.played+' '+T('partidos disputados','matches played'),c.wins+' '+T('victorias reales','wins'),c.points+' '+T('puntos de grupo','group points')]);}
   else if(action==='share-match'&&player()){const m=s.matches.find(x=>String(x.id)===val&&x.status==='confirmed'&&H.players(x).includes(n));if(m&&H.winner(m))shareImage(T('Resultado confirmado','Confirmed result'),score(m,n),[n+' · '+H.players(m).find(x=>x!==n),m.club||'',prettyDate(H.dateKey(m.date))]);}
   else if(action==='size'&&player()&&['85','100'].includes(val)){selectSize(val);profile();}
   else if(action==='rank-self'&&player()){const inp=doc.getElementById('px-rank-query');if(inp)inp.value=n;findRanking(n);}
   else if(action==='rank-find')findRanking(doc.getElementById('px-rank-query')?.value||'');
   else if(action==='preview-close'&&admin()&&ui.canLeave(subView))previewClose(s);
   else if(action==='admin-group'&&admin()){const g=Number(val);if(cycleObj(s,s.activeN)?.groups?.[g-1]&&ui.canLeave('grupos')){ui.chooseCycle(s.activeN);if(safe(()=>viewCycle===s.activeN&&subView==='grupos',false))ui.setGroup(g);}}
  });
  // Existing language and save events rerender the UI. Never poll or fetch.
  doc.addEventListener('sohail-theme-change',()=>safe(after,null));
  global.SohailPlayerUX=Object.freeze({mountEvolution,mountSummary,mountMatches,after});
 }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const published=c=>c&&['active','finished'].includes(c.status)&&Number.isSafeInteger(c.n)&&c.n>0&&Array.isArray(c.groups);
 function membership(cycles,name,n){const foundCycles=(cycles||[]).filter(x=>published(x)&&x.n===n),c=foundCycles.length===1?foundCycles[0]:null;if(!c||typeof name!=='string'||!name)return null;const found=c.groups.flatMap((g,i)=>Array.isArray(g?.players)&&g.players.includes(name)?[i+1]:[]);return found.length===1?found[0]:null;}
 function timeline(cycles,name){return (cycles||[]).filter(published).map(c=>({cycle:c.n,group:membership(cycles,name,c.n)})).filter(x=>x.group).sort((a,b)=>a.cycle-b.cycle);}
 function archiveTimeline(records,localId){const seasons=new Map();for(const m of Array.isArray(records)?records:[]){if(!m||m.po||m.status!=='confirmed'||typeof m._mhLeagueId!=='string'||!m._mhLeagueId||m._mhLeagueId===localId||typeof m._mhSubject!=='string'||![m.aName,m.bName].includes(m._mhSubject)||!Number.isSafeInteger(m.cycle)||m.cycle<1||!Number.isSafeInteger(m.g)||m.g<1)continue;let s=seasons.get(m._mhLeagueId);if(!s){s={leagueName:String(m._mhLeagueName||m._mhLeagueId),groups:new Map()};seasons.set(m._mhLeagueId,s);}let set=s.groups.get(m.cycle);if(!set)s.groups.set(m.cycle,set=new Set());set.add(m.g);}
  return [...seasons.values()].map(s=>({leagueName:s.leagueName,rows:[...s.groups].filter(([,g])=>g.size===1).map(([cycle,g])=>({cycle,group:[...g][0]})).sort((a,b)=>a.cycle-b.cycle)})).filter(s=>s.rows.length);}
 function fixtures(c,g,records,users,name){if(!published(c)||!Number.isSafeInteger(g)||g<1||!Array.isArray(c.groups[g-1]?.players))return[];const all=[...new Set(c.groups[g-1].players.filter(x=>typeof x==='string'&&x&&Object.prototype.hasOwnProperty.call(users||{},x)))];if(name&&!all.includes(name))return[];const out=[],byPair=new Map();const key=(a,b)=>JSON.stringify([a,b].sort());
  for(const m of Array.isArray(records)?records:[]){if(m&&!m.po&&m.cycle===c.n&&m.g===g&&m.aName!==m.bName&&all.includes(m.aName)&&all.includes(m.bName)){const k=key(m.aName,m.bName),old=byPair.get(k)||[];old.push(m);byPair.set(k,old);}}
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j];if(name&&a!==name&&b!==name)continue;const ms=byPair.get(key(a,b))||[];if(!name&&(users[a]?.inactive||users[b]?.inactive))continue;if(name&&(users[a]?.inactive||users[b]?.inactive)&&!ms.length)continue;out.push({a,b,rival:name?a===name?b:a:null,match:ms.length===1?ms[0]:null,conflict:ms.length>1});}return out;}
 function bucket(r){return r.conflict?'review':!r.match?'todo':r.match.status==='confirmed'?'done':'review';}
 function progress(rows){const p={total:rows.length,todo:0,review:0,done:0};for(const r of rows)p[bucket(r)]++;return p;}
 function endDate(value){if(typeof value!=='string')return null;const m=[...value.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g)];let y,mo,d;if(m.length===2){[,d,mo,y]=m[1].map(Number);if(y<100)y+=2000;}else{const iso=[...value.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)];if(iso.length!==2)return null;[,y,mo,d]=iso[1].map(Number);}const dt=new Date(Date.UTC(y,mo-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d?dt.toISOString().slice(0,10):null;}
 function daysLeft(end,now){if(!end||!(now instanceof Date)||!Number.isFinite(now.valueOf()))return null;const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());return Math.round((Date.parse(end+'T00:00:00Z')-today)/86400000);}
 function streak(list,name,H){let best=0,n=0;for(const m of list.slice().sort((a,b)=>H.newest(b,a))){if(m.status!=='confirmed'||m.np||H.kind(m)==='wo')continue;const w=H.winner(m);if(!w)continue;n=w===H.subject(m,name)?n+1:0;best=Math.max(best,n);}return best;}
 const normalized=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
 return Object.freeze({membership,timeline,archiveTimeline,fixtures,bucket,progress,endDate,daysLeft,streak,normalized});
});
