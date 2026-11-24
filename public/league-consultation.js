/* Sohail: anonymous sporting viewer. No login, hydration, editing or polling. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports){module.exports=api;return;}
 root.SohailConsultation=api;
 api.mount(root);
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 function score(result,name){
  if(result.kind==='not-played')return '—';
  if(result.kind==='walkover')return 'W.O.';
  const flip=name===result.b;
  return result.sets.map(s=>flip?s[1]+'–'+s[0]:s[0]+'–'+s[1]).join(' / ')+(result.kind==='retired'?' · RET':'');
 }
 function retrySeconds(value,now=Date.now()){
  if(/^\d+$/.test(String(value||'')))return Math.min(300,Math.max(1,Number(value)));
  const at=Date.parse(value);return Number.isFinite(at)?Math.min(300,Math.max(1,Math.ceil((at-now)/1000))):30;
 }
 function createReader(fetcher,now=()=>Date.now()){
  let until=0;
  return {remaining:()=>Math.max(0,Math.ceil((until-now())/1000)),async read(mode,id,signal){
   if(!['ligas','resultados'].includes(mode)||mode==='resultados'&&!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id||''))throw Error('INVALID_PUBLIC_QUERY');
   if(now()<until)throw Object.assign(new Error('REQUEST_RATE_LIMIT'),{code:'REQUEST_RATE_LIMIT',retryAfter:Math.ceil((until-now())/1000)});
   const url='/api/users?consulta='+mode+(mode==='resultados'?'&liga='+encodeURIComponent(id):'');
   const response=await fetcher(url,{method:'GET',credentials:'omit',cache:'no-store',headers:{Accept:'application/json'},signal});
   const d=await response.json().catch(()=>null);
   if(!response.ok){
    if(response.status===429)until=now()+retrySeconds(response.headers.get('Retry-After'),now())*1000;
    throw Object.assign(new Error(d?.error||'No se pudo cargar la consulta.'),{code:d?.code||'PUBLIC_READ_ERROR',requestId:d?.requestId||response.headers.get('X-Sohail-Request-Id')||'',retryAfter:Math.max(0,Math.ceil((until-now())/1000))});
   }
   if(d?.readOnly!==true||(mode==='ligas'?!Array.isArray(d.leagues):d.schema!==1||d.league?.id!==id||!Array.isArray(d.cycles)||!Array.isArray(d.standings)||!Array.isArray(d.playoffResults)))throw Error('INVALID_PUBLIC_RESPONSE');
   return d;
  }};
 }
 function mount(root){
  const doc=root.document;if(!doc||!doc.getElementById('login-consult-league'))return;
  const T=(es,en)=>doc.documentElement.lang==='en'?en:es;
  const node=(tag,txt,cls)=>{const n=doc.createElement(tag);if(txt!==undefined&&txt!==null)n.textContent=String(txt);if(cls)n.className=cls;return n;};
  const button=(label,fn,cls='btn')=>{const b=node('button',label,cls);b.type='button';b.addEventListener('click',fn);return b;};
  const key='sohail-tables-size-v1';
  let size='85';try{if(root.localStorage.getItem(key)==='100')size='100';}catch(_){}
  function setSize(value){size=value==='100'?'100':'85';doc.documentElement.setAttribute('data-sohail-table-size',size);
   try{root.localStorage.setItem(key,size);}catch(_){}
   doc.querySelectorAll('[data-sohail-size]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sohailSize===size)));
  }
  function sizeControl(){const wrap=node('div',null,'sohail-table-size');wrap.setAttribute('role','group');wrap.setAttribute('aria-label',T('Tamaño de la tabla','Table size'));
   const label=node('span',T('Tabla','Table'));wrap.append(label);
   for(const value of ['85','100']){const b=button(value+' %',()=>setSize(value));b.dataset.sohailSize=value;b.setAttribute('aria-pressed',String(value===size));wrap.append(b);}return wrap;
  }
  function compactControls(){for(const h of doc.querySelectorAll('#view-grupos .ui-standings-section .ui-section-heading'))if(!h.querySelector('.sohail-table-size'))h.append(sizeControl());}
  setSize(size);compactControls();
  const groups=doc.getElementById('view-grupos');if(groups)new MutationObserver(compactControls).observe(groups,{childList:true,subtree:true});
  // Capture the existing transport before the optional global error feedback.
  // This viewer explains errors in its own dialog, without duplicate pop-ups.
  const reader=createReader(root.fetch.bind(root));
  const launch=doc.getElementById('login-consult-league');
  let dialog=null,content=null,status=null,select=null,refresh=null,controller=null,timer=null,version=0;
  let data=null,leagues=[],selected='',cycle=null,group=1,tab='results',busy=false,returnFocus=null;
  function labelLaunch(){launch.textContent=T('Consultar liga','View league');const hint=doc.getElementById('login-consult-hint');if(hint)hint.textContent=T('Sin iniciar sesión · Resultados y clasificación · Solo lectura','No sign-in · Results and standings · Read-only');}
  function close(){version++;busy=false;controller?.abort();controller=null;if(timer)clearTimeout(timer);timer=null;const old=dialog;dialog=null;old?.close();old?.remove();data=null;leagues=[];returnFocus?.focus?.({preventScroll:true});}
  function showError(error){
   if(!dialog)return;status.replaceChildren();status.setAttribute('role','alert');
   status.append(node('p',error.code==='REQUEST_RATE_LIMIT'?T('La consulta está en pausa por unos segundos. No hace falta recargar la página.','Requests are paused briefly. You do not need to reload the page.'):T('No se pudo cargar la consulta. Podés reintentar o volver al login.','Could not load the view. Retry or return to sign-in.')));
   if(error.message&&error.message!==error.code&&error.message!=='INVALID_PUBLIC_RESPONSE')status.append(node('p',error.message));
   if(error.code)status.append(node('p',T('Código: ','Code: ')+error.code));if(error.requestId)status.append(node('p',T('Referencia: ','Reference: ')+error.requestId));
  }
  function controls(){
   if(!dialog)return;const seconds=reader.remaining();refresh.disabled=busy||seconds>0;
   refresh.textContent=seconds?T('Consultar en ','Retry in ')+seconds+' s':T('Actualizar','Refresh');select.disabled=busy;
   if(timer)clearTimeout(timer);timer=seconds?setTimeout(controls,1000):null;
  }
  async function load(initial=false){
   if(!dialog||busy)return;if(reader.remaining()){controls();return;}
   busy=true;controls();status.setAttribute('role','status');status.textContent=T('Cargando…','Loading…');
   const stamp=++version,dlg=dialog;controller?.abort();const ctl=new AbortController();controller=ctl;const timeout=setTimeout(()=>ctl.abort(),15000);
   const valid=()=>dialog===dlg&&version===stamp&&!ctl.signal.aborted;
   try{
    if(initial||!leagues.length){const d=await reader.read('ligas',null,ctl.signal);if(!valid())return;leagues=d.leagues;select.replaceChildren();
     for(const l of leagues){const o=node('option',l.name+(l.status==='finalizada'?T(' · Finalizada',' · Finished'):''));o.value=l.id;select.append(o);}
     const preferred=typeof _ligaActual==='string'?_ligaActual:'';
     selected=leagues.some(l=>l.id===selected)?selected:leagues.some(l=>l.id===preferred)?preferred:leagues[0]?.id||'';select.value=selected;
    }
    if(!selected){data=null;content.replaceChildren(node('p',T('Todavía no hay ligas disponibles para consultar.','No leagues are available yet.')));status.textContent='';return;}
    const d=await reader.read('resultados',selected,ctl.signal);if(!valid())return;data=d;
    if(!d.cycles.some(c=>c.n===cycle))cycle=d.activeCycle||d.cycles[0]?.n||null;
    const c=d.cycles.find(c=>c.n===cycle);if(!c?.groups.some(g=>g.number===group))group=c?.groups[0]?.number||1;
    render();status.textContent=T('Solo resultados confirmados. Consulta: ','Confirmed results only. Retrieved: ')+new Date(d.consultedAt).toLocaleTimeString(doc.documentElement.lang==='en'?'en-GB':'es-ES',{hour:'2-digit',minute:'2-digit'});
   }catch(e){if(dialog===dlg&&version===stamp){data=null;content.replaceChildren();showError(e.name==='AbortError'?{code:'PUBLIC_READ_TIMEOUT',message:T('La conexión tardó demasiado.','The connection timed out.')}:e);}}
   finally{clearTimeout(timeout);if(dialog===dlg&&version===stamp){busy=false;controls();}}
  }
  function table(headings,rows,label,cls=''){
   const wrap=node('div',null,'consult-table-scroll');wrap.setAttribute('role','region');wrap.setAttribute('aria-label',label);wrap.tabIndex=0;
   const tbl=node('table',null,'consult-table '+cls),caption=node('caption',label,'ui-sr-only'),thead=node('thead'),tr=node('tr');
   for(const h of headings){const th=node('th',Array.isArray(h)?h[0]:h);th.scope='col';if(Array.isArray(h))th.title=h[1];tr.append(th);}thead.append(tr);tbl.append(caption,thead);
   const tbody=node('tbody');for(const row of rows){const r=node('tr');row.forEach((v,i)=>{const td=node('td',v);if(i===1)td.title=String(v??'');r.append(td);});tbody.append(r);}tbl.append(tbody);wrap.append(tbl);return wrap;
  }
  function heading(title){const h=node('div',null,'consult-section-title');h.append(node('h3',title));return h;}
  function destination(row,gid){const d=row.destination;return d==null?'—':(d<gid?'↑ ':d>gid?'↓ ':'= ')+'G'+d;}
  function renderGroup(c,g){
   const section=node('section',null,'consult-card');section.append(heading(T('Clasificación del grupo ','Group standings ')+g.number));
   section.append(table([T('Destino','Next group'),T('Jugador','Player'),'Pts','PJ',T('Gan.','Won'),T('Perd.','Lost'),['NJ',T('No jugados','Not played')],['SG',T('Sets ganados','Sets won')],['SP',T('Sets perdidos','Sets lost')],['± Sets',T('Balance de sets','Set difference')],T('Puesto','Position pts'),'Extra',T('Ajuste','Adjustment'),'Total'],g.rows.map(r=>[destination(r,g.number),r.name,r.points,r.played,r.wins,r.losses,r.notPlayed,r.setsWon,r.setsLost,r.setsBalance,r.base,r.extra,r.adjustment,r.total]),T('Clasificación del grupo ','Group standings ')+g.number,'consult-group-table'));
   section.append(node('p',T('Pts: puntos de partidos. Total: puntos que este grupo aporta a la clasificación general.','Pts: match points. Total: points contributed by this group to the overall standings.'),'consult-hint'));return section;
  }
  function renderResults(c,g){
   const section=node('section',null,'consult-card');section.append(heading(T('Resultados · Grupo ','Results · Group ')+g.number));
   const names=g.rows.map(r=>r.name),wrap=node('div',null,'consult-table-scroll');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',T('Cuadro de resultados','Results matrix'));
   const matrix=node('table',null,'consult-table consult-matrix');matrix.append(node('caption',T('Marcador desde la perspectiva del jugador de la fila.','Score from the row player’s perspective.'),'consult-matrix-caption'));
   const thead=node('thead'),header=node('tr');for(const name of [T('Jugador','Player'),...names]){const th=node('th',name);th.scope='col';header.append(th);}thead.append(header);matrix.append(thead);
   const tbody=node('tbody');for(let i=0;i<names.length;i++){const tr=node('tr'),th=node('th',names[i]);th.scope='row';tr.append(th);
    for(let j=0;j<names.length;j++){const td=node('td');if(i===j){td.textContent='—';td.className='consult-diagonal';}
     else if(j>i){td.className='consult-upper';td.setAttribute('aria-label',T('Ver la casilla simétrica','See the mirrored cell'));}
     else{const m=g.results.find(m=>m.a===names[i]&&m.b===names[j]||m.b===names[i]&&m.a===names[j]);td.textContent=m?score(m,names[i]):'·';if(m){td.className='consult-result';td.title=[m.winner?T('Ganador: ','Winner: ')+m.winner:'',m.club,m.date].filter(Boolean).join(' · ');}}
     tr.append(td);
    }tbody.append(tr);
   }matrix.append(tbody);wrap.append(matrix);section.append(wrap);
   section.append(node('p',T('· Sin resultado confirmado. W.O.: no se jugó. RET: retiro. —: no jugado o diagonal.','· No confirmed result. W.O.: walkover. RET: retirement. —: not played or diagonal.'),'consult-hint'));
   if(!g.results.length)section.append(node('p',T('Este grupo todavía no tiene resultados confirmados.','This group has no confirmed results yet.')));
   else section.append(table([T('Jugador A','Player A'),T('Jugador B','Player B'),T('Resultado','Score'),T('Ganador','Winner'),'Club',T('Fecha','Date')],g.results.map(r=>[r.a,r.b,score(r,r.a),r.winner||'—',r.club||'—',r.date||'—']),T('Partidos confirmados','Confirmed matches'),'consult-match-list'));
   return section;
  }
  function render(){
   if(!content||!data)return;content.replaceChildren();
   const title=node('h2',data.league.name,'consult-league-name');content.append(title);
   const nav=node('div',null,'consult-tabs');nav.setAttribute('role','tablist');nav.setAttribute('aria-label',T('Consulta deportiva','Sporting view'));
   for(const [value,label]of [['results',T('Resultados','Results')],['standings',T('Clasificación','Standings')]]){const b=button(label,()=>{tab=value;render();},'btn consult-tab');b.id='consult-tab-'+value;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(tab===value));b.setAttribute('aria-controls','consult-sporting-panel');b.tabIndex=tab===value?0:-1;b.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();tab=tab==='results'?'standings':'results';render();doc.getElementById('consult-tab-'+tab)?.focus();}});nav.append(b);}content.append(nav);
   const panel=node('div');panel.id='consult-sporting-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','consult-tab-'+tab);content.append(panel);
   if(data.cycles.length){const filters=node('div',null,'consult-filters'),cyLabel=node('label',T('Ciclo','Cycle')),cy=node('select'),gLabel=node('label',T('Grupo','Group')),gs=node('select');cy.id='consult-cycle';gs.id='consult-group';cyLabel.htmlFor=cy.id;gLabel.htmlFor=gs.id;
    for(const c of data.cycles){const o=node('option',T('Ciclo ','Cycle ')+c.n+(c.status==='finished'?T(' · Cerrado',' · Closed'):T(' · En curso',' · Active')));o.value=String(c.n);cy.append(o);}cy.value=String(cycle);
    const c=data.cycles.find(c=>c.n===cycle)||data.cycles[0];cycle=c.n;
    for(const g of c.groups){const o=node('option',T('Grupo ','Group ')+g.number);o.value=String(g.number);gs.append(o);}gs.value=String(group);
    cy.addEventListener('change',()=>{cycle=Number(cy.value);group=1;render();});gs.addEventListener('change',()=>{group=Number(gs.value);render();});
    const a=node('div'),b=node('div');a.append(cyLabel,cy);b.append(gLabel,gs);filters.append(a,b,sizeControl());panel.append(filters);
    const g=c.groups.find(g=>g.number===group)||c.groups[0];if(g)panel.append(tab==='results'?renderResults(c,g):renderGroup(c,g));
   }
   if(tab==='standings'){
    const section=node('section',null,'consult-card');section.append(heading(T('Clasificación general acumulada','Overall standings')));
    if(data.standings.length)section.append(table(['#',T('Jugador','Player'),T('Grupo','Group'),...data.cycles.map(c=>'C'+c.n),'Total'],data.standings.map(r=>[r.position,r.name,r.group?'G'+r.group:'—',...data.cycles.map(c=>r.cycles.find(p=>p.n===c.n)?.points||0),r.total]),T('Clasificación general','Overall standings'),'consult-general'));
    else section.append(node('p',T('Todavía no hay clasificación disponible.','No standings available yet.')));panel.append(section);
   }
   if(tab==='results'&&data.playoffResults.length){const section=node('section',null,'consult-card');section.append(heading(T('Resultados confirmados de playoffs','Confirmed playoff results')));section.append(table([T('Jugador A','Player A'),T('Jugador B','Player B'),T('Resultado','Score'),T('Ganador','Winner')],data.playoffResults.map(r=>[r.a,r.b,score(r,r.a),r.winner||'—']),T('Resultados de playoffs','Playoff results'),'consult-match-list'));panel.append(section);}
   if(tab==='results'&&!data.cycles.length&&!data.playoffResults.length)panel.append(node('p',T('Todavía no hay resultados publicados.','No published results yet.')));
  }
  function open(){
   if(dialog)return;
   if(typeof _loginBusy!=='undefined'&&_loginBusy)return; // Do not race a sign-in/session restoration.
   returnFocus=doc.activeElement;dialog=node('dialog',null,'sohail-consultation');dialog.setAttribute('aria-labelledby','consult-title');
   const head=node('header',null,'consult-head'),copy=node('div'),h=node('h1',T('Consultar liga','View league'));h.id='consult-title';copy.append(h,node('p',T('Solo lectura · Sin iniciar sesión','Read-only · No sign-in'),'consult-badge'));
   head.append(copy,button(T('Volver al login','Back to sign-in'),close));dialog.append(head);
   const body=node('div',null,'consult-body'),tools=node('div',null,'consult-top-tools'),field=node('div'),label=node('label',T('Liga','League'));select=node('select');select.id='consult-league';label.htmlFor=select.id;field.append(label,select);select.addEventListener('change',()=>{selected=select.value;cycle=null;group=1;data=null;content.replaceChildren();load();});
   refresh=button(T('Actualizar','Refresh'),()=>load(!leagues.length));tools.append(field,refresh);status=node('div',null,'consult-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');content=node('div',null,'consult-content');body.append(tools,status,content);dialog.append(body);
   dialog.addEventListener('cancel',e=>{e.preventDefault();close();});doc.body.append(dialog);dialog.showModal();load(true);
  }
  launch.addEventListener('click',open);labelLaunch();
  new MutationObserver(()=>{labelLaunch();if(dialog&&data)render();}).observe(doc.documentElement,{attributes:true,attributeFilter:['lang']});
 }
 return Object.freeze({mount,score,retrySeconds,createReader});
});
