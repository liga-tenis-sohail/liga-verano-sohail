// ============================================================================
// public/jugadores-perfiles.js — perfiles, H2H, altas/bajas/renombrados/roles/passwords
// Extraído del index.html original (líneas del script: 4795..5853).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
function renderCargarDisputas(){ }

function resolveD(mid){
  const m=matches.find(x=>x.id===mid);
  if(!m)return;
  m.vBy=currentUser.name;
  m.status='confirmed';
  m.locked=true;
  if(m.po){applyPoPending(m);const tr=playoff.tramos[m.ti];addLog('Playoff: disputa resuelta',{a:m.poNames[0],b:m.poNames[1],sets:m.sets,winner:m.winner,po:true,cuadro:tr?tr.label:'',which:m.which});}
  else{addLog('Liga: disputa resuelta',{a:m.aName,b:m.bName,sets:m.sets,grupo:m.g,po:false});}
  persist(true);
  refreshAll();
  toast('Resultado validado correctamente.');
}

function forceConfirmAll(){
  // Los partidos propios se saltean: si no, este botón desarma de un click todas
  // las reglas de arbitraje propio. Los resuelve el rival u otro administrador.
  matches.forEach(m=>{
    if(m.status!=='pending')return;
    m.vBy=currentUser.name;m.status='confirmed';m.locked=true;if(m.po)applyPoPending(m);
  });
  persist(true);
  refreshAll();
  toast(t('toast_pending_confirmed'));
}

function demoFillUI(){
  if(!demoBackup)demoBackup=JSON.stringify({cycles,activeN,playoff});
  demoFill();
  persist(true);
  refreshAll();
  toast(t('toast_simulated'));
}

function undoDemoUI(){
  if(!confirm(t('confirm_undo_demo')))return;
  matches=matches.filter(m=>!m.isDemo);
  if(demoBackup){
    try{
      const b=JSON.parse(demoBackup);
      cycles=b.cycles;
      activeN=b.activeN;
      playoff=b.playoff;
      viewCycle=activeN;
      demoBackup=null;
    }catch(e){}
  }
  persist(true);
  refreshAll();
  toast(t('toast_demo_undone'));
}

function startNextCycle(){
  const c=getActive();
  if(!c||!c.groups)return;
  const need=pairsNeeded(c);
  const done=matches.filter(m=>m.cycle===activeN&&!m.po&&m.status==='confirmed').length;
  const notC=matches.filter(m=>m.cycle===activeN&&!m.po&&m.status!=='confirmed').length;
  const faltanJugar=need-done-notC;  // partidos que ni siquiera se cargaron
  // Los partidos CARGADOS pero sin validar (pendientes/en disputa) hay que resolverlos
  // primero: no se puede cerrar dejando un resultado a medias sin decidir.
  if(notC>0){toast(t('close_pending_first'));return;}
  // Si faltan partidos por JUGAR (nunca se cargaron), el admin puede cerrar igual —
  // puede pasar que no se jueguen todos. Se pide confirmación con el detalle.
  if(faltanJugar>0){
    if(!confirm(t('close_force_confirm').replace('{n}',faltanJugar)))return;
  }
  _doStartNextCycle(c);
}
// Ejecuta el cierre real del ciclo y el armado del siguiente. Separado de startNextCycle
// para poder llamarlo tras la confirmación cuando se fuerza el cierre.
function _doStartNextCycle(c){
  const totalG=c.groups.length;
  const buckets={};for(let k=1;k<=totalG;k++)buckets[k]=[];
  c.groups.forEach((g,gi)=>{
    const gid=gi+1;const st=computeStats(activeN,gid);ensureDestino(gid,st.length);
    const dest=DESTINO[gid];
    st.forEach((s,pos)=>{
      if(USERS[s.name]&&USERS[s.name].inactive)return; // inactivos no se redistribuyen
      const d=dest[pos]||('G'+Math.min(gid+1,totalG));
      let dn=parseInt(d.replace('G',''));
      if(!buckets[dn])dn=Math.min(Math.max(dn,1),totalG);
      buckets[dn].push({name:s.name,total:ptsForPos(gid,pos)+(pos===0?2:0)});
    });
  });
  const ng=[];for(let k=1;k<=totalG;k++)ng.push({players:buckets[k].sort((a,b)=>b.total-a.total).map(x=>x.name)});
  c.status='finished';
  let switched = false;
  if(activeN<cycles.length){
    const nx=cycles[activeN];
    nx.groups=ng;
    nx.status='active';
    activeN=nx.n;
    viewCycle=nx.n;
    switched = true;
    if(currentUser&&currentUser.role==='player'){const loc=findLoc(currentUser.name,activeN);if(loc)selGroup=loc.g;}
    toast(tf('cycle_closed_next',{n:c.n,nx:nx.n}));
  }else{
    toast(t('cycle3_closed'));
  }
  
  persist(true);
  refreshAll();
  if(switched) showSub('grupos');
}

function finishLastCycle(){
  const c=getActive();
  if(!c||!c.groups)return;
  const need=pairsNeeded(c);
  const done=matches.filter(m=>m.cycle===activeN&&!m.po&&m.status==='confirmed').length;
  const notC=matches.filter(m=>m.cycle===activeN&&!m.po&&m.status!=='confirmed').length;
  const faltanJugar=need-done-notC;
  // Igual que al cerrar un ciclo intermedio: los pendientes sin validar hay que
  // resolverlos primero; los partidos no jugados se pueden dejar y forzar el cierre.
  if(notC>0){toast(t('close_pending_first'));return;}
  if(faltanJugar>0){
    if(!confirm(t('close_force_confirm_last').replace('{n}',faltanJugar)))return;
  }
  c.status='finished';
  persist(true);
  renderShell();
  showSub('admin');
  toast(t('last_cycle_finished'));
}

function editPuntosUI(gid){
  const c=cycles[viewCycle-1];
  if(!c||!c.groups)return;
  const grp=c.groups[gid-1];
  const len=Math.max(1,(grp.players||[]).length);
  if(!PUNTOS[gid])PUNTOS[gid]=[];
  let h=`<p class="legend-txt" style="margin-top:0;margin-bottom:.8rem">Ajustá los puntos que otorga cada posición en este grupo (0 a 100).</p>`;
  h+=`<div class="form-row" style="grid-template-columns: 1fr;">`;
  for(let i=0;i<len;i++){
    let v=PUNTOS[gid][i]!==undefined?PUNTOS[gid][i]:0;
    h+=`<div class="set-row"><label>${i+1}º Puesto</label><input type="number" id="pt-pos-${i}" value="${v}" min="0" max="100" class="po-in" style="width:70px"></div>`;
  }
  h+=`</div>`;
  document.getElementById('modal-title').textContent=`Editar Puntos · ${groupName(gid)}`;
  document.getElementById('modal-body').innerHTML=h;
  document.getElementById('modal-actions').innerHTML=`<button class="btn btn-primary" onclick="savePuntos(${gid},${len})"><i class="ti ti-device-floppy"></i> Guardar</button><button class="btn" onclick="closeM()">Cancelar</button>`;
  document.getElementById('modal-bg').classList.add('open');
}
// Genera la escala de puntos de TODOS los grupos con un patrón regular, para no tener
// que editar cada grupo a mano en una liga nueva. Toma el puntaje del ganador del
// grupo 1 y cuánto baja el ganador entre grupos consecutivos; dentro de cada grupo
// baja de a 1 punto por posición (el patrón que ya usa la liga). Nunca baja de 1.
function autoGenerarEscala(){
  const stepEl=document.getElementById('autoscale-step');
  const step=parseInt(stepEl&&stepEl.value,10);
  if(!Number.isFinite(step)||step<1){toast(t('autoscale_bad_step'));return;}
  const c=cycles[activeN-1];
  const numGrupos=(c&&c.groups)?c.groups.length:12;
  const ppg=(c&&c.groups&&c.groups[0]&&c.groups[0].players)?Math.max(2,c.groups[0].players.length):5;
  // Confirmar porque sobrescribe cualquier escala editada a mano.
  if(!confirm(tf('autoscale_confirm',{n:numGrupos,step})))return;
  const nueva={};
  const BASE=5;  // la escala por posición tiene 5 escalones; del 6º en adelante se repite el 5º
  // Se construye DESDE ABAJO: el grupo más bajo (el de mayor número) ancla en 5-4-3-2-1,
  // y cada grupo hacia arriba suma 'step' al puntaje del ganador. Así no hay techo fijo:
  // el ganador del grupo 1 crece solo según cuántos grupos haya, y el último grupo
  // siempre queda 5-4-3-2-1 sin importar el tamaño de la liga.
  for(let g=1;g<=numGrupos;g++){
    const distanciaDesdeAbajo = numGrupos - g;   // el último grupo está a 0
    const ganador = 5 + distanciaDesdeAbajo * step;
    const arr=[];
    for(let pos=0;pos<ppg;pos++){
      // 1º a 5º bajan de a 1. Del 6º en adelante se repite el valor del 5º puesto.
      const escalon=Math.min(pos, BASE-1);
      arr.push(Math.max(1, ganador-escalon));
    }
    nueva[g]=arr;
  }
  PUNTOS=nueva;
  persist(true);
  renderAdmin();
  toast(tf('autoscale_done',{n:numGrupos}));
}
function savePuntos(gid,len){
  const newPts=[];
  for(let i=0;i<len;i++){
    let v=parseInt(document.getElementById(`pt-pos-${i}`).value);
    if(isNaN(v))v=0;
    if(v<0)v=0;if(v>100)v=100;
    newPts.push(v);
  }
  PUNTOS[gid]=newPts;
  persist(true);
  closeM();
  refreshAll();
  toast('Puntos actualizados.');
}

// ===== Historial de partidos por jugador =====
function _histRow(rival,sc,won,extra,base){
  const badge=won?`<span class="badge badge-ok">${t('hist_won')}</span>`:`<span class="badge badge-disp">${t('hist_lost')}</span>`;
  const rivalCell = base
    ? `<span class="h2h-link" style="flex:1;min-width:0;font-size:13px" onclick="abrirH2H('${jsq(base)}','${jsq(rival)}')" title="${t('h2h_title')}">${rival} <i class="ti ti-arrows-left-right" style="font-size:11px;opacity:.6"></i></span>`
    : `<span style="flex:1;min-width:0;font-size:13px">${rival}</span>`;
  return `<div class="hist-row" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">${badge}<span class="avatar">${getInitials(rival)}</span>${rivalCell}<strong style="font-variant-numeric:tabular-nums;font-size:13px;white-space:nowrap">${sc}</strong>${extra}</div>`;
}
function _histCard(title,g,p,rows){
  return `<div class="card" style="margin-bottom:.6rem"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem"><div class="section-lbl" style="margin:0">${title}</div><div style="font-size:13px"><span style="color:#085041;font-weight:700">${g}</span><span style="color:var(--text2)"> – </span><span style="color:#791F1F;font-weight:700">${p}</span></div></div>${rows}</div>`;
}
function playerHistoryHTML(name){
  let out='',any=false;
  cycles.slice().sort((a,b)=>b.n-a.n).forEach(cy=>{
    if(!cy.groups)return;
    const ms=matches.filter(m=>!m.po&&m.cycle===cy.n&&m.status==='confirmed'&&!m.np&&(m.aName===name||m.bName===name)).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.id-a.id));
    if(!ms.length)return;
    any=true;let g=0,p=0;
    const rows=ms.map(m=>{
      const isA=m.aName===name,rival=isA?m.bName:m.aName;
      const mine=m.sets.map(([a,b])=>isA?[a,b]:[b,a]);
      let w=0,l=0;mine.forEach(([a,b])=>{if(a>b)w++;else l++;});
      const won=w>l;if(won)g++;else p++;
      const sc=mine.map(([a,b])=>a+'-'+b).join('  ');
      const club=m.club?`<span class="badge" style="${clubStyle(m.club)}">${m.club}</span>`:'';
      return _histRow(rival,sc,won,club,name);
    }).join('');
    const loc=findLoc(name,cy.n);
    out+=_histCard(t('cycle')+' '+cy.n+(loc?' · '+groupName(loc.g):''),g,p,rows);
  });
  const poMs=matches.filter(m=>m.po&&m.status==='confirmed'&&m.poNames&&(m.poNames[0]===name||m.poNames[1]===name)).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.id-a.id));
  if(poMs.length){
    any=true;let g=0,p=0;
    const rows=poMs.map(m=>{
      const isA=m.poNames[0]===name,rival=isA?m.poNames[1]:m.poNames[0];
      const mine=(m.sets||[]).map(([a,b])=>isA?[a,b]:[b,a]);
      const sc=m.wo?'W.O.':mine.map(([a,b])=>a+'-'+b).join('  ');
      const won=m.winner===name;if(won)g++;else p++;
      const cuadro=m.tLabel?`<span class="badge badge-tag">${m.tLabel}</span>`:'';
      const club=m.club?`<span class="badge" style="${clubStyle(m.club)}">${m.club}</span>`:'';
      return _histRow(rival,sc,won,cuadro+club,name);
    }).join('');
    out=_histCard('Play Offs',g,p,rows)+out;
  }
  if(!any)return `<div class="lock-note" style="padding:.5rem 0">${t('hist_no_matches')}</div>`;
  return out;
}
// Bloque de rating (estilo UTR) para la ficha del jugador.


function showPlayerHistory(name){
  if(!name)return;
  document.getElementById('modal-title').textContent=t('hist_title')+' · '+name;
  document.getElementById('modal-body').innerHTML=(RATING_ON?ratingFichaHTML(name):'')+playerHistoryHTML(name)
    + '<div id="pm-past-wrap"></div>';   // acá se despliegan las ligas pasadas del jugador
  // En modo consulta de una liga pasada no ofrecemos "ver otras pasadas" (ya estás en una).
  const btnPast = _ligaReadOnly ? '' :
    `<button class="btn btn-past" onclick="togglePlayerPast('${String(name).replace(/'/g,"\\'")}')"><i class="ti ti-history"></i> ${t('past_player_btn')}</button>`;
  document.getElementById('modal-actions').innerHTML=
    btnPast + `<button class="btn" onclick="closeM()">${t('close')}</button>`;
  document.getElementById('modal-bg').classList.add('open');
}
// Despliega/oculta las ligas pasadas donde jugó esa persona, dentro de la ficha.
let _pmPastOpen=null;
async function togglePlayerPast(name){
  const wrap=document.getElementById('pm-past-wrap');
  if(!wrap) return;
  if(_pmPastOpen===name){ wrap.innerHTML=''; _pmPastOpen=null; return; }
  _pmPastOpen=name;
  wrap.innerHTML='<div class="pm-past-load">'+t('past_loading')+'</div>';
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'listar'})});
    const d=await r.json().catch(()=>({}));
    const otras=(d.ligas||[]).filter(l=>l.id!==(_ligaActual||'liga-actual'));
    if(!otras.length){ wrap.innerHTML='<div class="pm-past-empty">'+t('past_player_none')+'</div>'; return; }
    wrap.innerHTML='<div class="pm-past-box"><div class="pm-past-lbl">'+t('past_player_lbl')+'</div>'
      +'<div class="pm-past-seasons" id="pm-past-seasons">'
      + otras.map((l,i)=>'<button class="pm-season-btn'+(i===0?' on':'')+'" onclick="verJugadorEnLiga(\''+String(name).replace(/'/g,"\\'")+'\',\''+String(l.id).replace(/'/g,"\\'")+'\',this)">'+escPast(l.nombre)+'</button>').join('')
      +'</div><div class="pm-season-results" id="pm-season-results"></div></div>';
    verJugadorEnLiga(name, otras[0].id, null);
  }catch(_){ wrap.innerHTML='<div class="pm-past-empty">'+t('past_loading_err')+'</div>'; }
}

async function verJugadorEnLiga(name, ligaId, btn){
  if(btn){ document.querySelectorAll('#pm-past-seasons .pm-season-btn').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); }
  const box=document.getElementById('pm-season-results');
  if(box) box.innerHTML='<div class="pm-past-load">'+t('past_loading')+'</div>';
  try{
    let est=null;
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'ver',id:ligaId})});
    if(r.ok){ const d=await r.json().catch(()=>({})); est=d.estado; }
    else if(_token){
      const r2=await fetch('/api/state?liga='+encodeURIComponent(ligaId),{headers:{Authorization:'Bearer '+_token},cache:'no-store'});
      if(r2.ok){ const d2=await r2.json().catch(()=>({})); est=d2.state; }
    }
    if(!est){ if(box)box.innerHTML='<div class="pm-past-empty">'+t('past_loading_err')+'</div>'; return; }
    if(box) box.innerHTML=resultadosJugadorEnEstado(name, est);
  }catch(_){ if(box)box.innerHTML='<div class="pm-past-empty">'+t('past_loading_err')+'</div>'; }
}
// Trae los resultados de esa persona en una liga pasada específica.
async function verJugadorEnLiga(name, ligaId, btn){
  if(btn){ document.querySelectorAll('#pm-past-seasons .pm-season-btn').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); }
  const box=document.getElementById('pm-season-results');
  if(box) box.innerHTML='<div class="pm-past-load">'+t('past_loading')+'</div>';
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'ver',id:ligaId})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.estado){ if(box)box.innerHTML='<div class="pm-past-empty">'+t('past_loading_err')+'</div>'; return; }
    if(box) box.innerHTML=resultadosJugadorEnEstado(name, d.estado);
  }catch(_){ if(box)box.innerHTML='<div class="pm-past-empty">'+t('past_loading_err')+'</div>'; }
}
// Arma la lista de partidos de un jugador dado el estado de una liga.
function resultadosJugadorEnEstado(name, estado){
  const matches=(estado.matches||[]).filter(m=>m&&(m.aName===name||m.bName===name)&&m.status==='confirmed');
  if(!matches.length) return '<div class="pm-past-empty">'+t('past_player_nomatch')+'</div>';
  let g=0,p=0, rows='';
  matches.forEach(m=>{
    const yoA=m.aName===name; const rival=yoA?m.bName:m.aName;
    const sets=(m.sets||[]).map(s=>Array.isArray(s)?(yoA?s[0]+'-'+s[1]:s[1]+'-'+s[0]):'').filter(Boolean).join(' ');
    // ganador: quien tiene más sets ganados
    let sgA=0,sgB=0; (m.sets||[]).forEach(s=>{if(Array.isArray(s)){if(s[0]>s[1])sgA++;else if(s[1]>s[0])sgB++;}});
    const gane = yoA? sgA>sgB : sgB>sgA;
    if(gane)g++;else p++;
    rows+='<div class="pm-res-row"><span class="pm-wl '+(gane?'w':'l')+'">'+(gane?t('win_short'):t('loss_short'))+'</span>'
      +'<span class="pm-res-rival">'+escPast(rival)+'</span><span class="pm-res-sc">'+escPast(sets)+'</span></div>';
  });
  return '<div class="pm-res-stats">'+g+' '+t('won_lc')+' · '+p+' '+t('lost_lc')+'</div>'+rows;
}

// ==================== H2H · CARA A CARA / HEAD 2 HEAD ====================
// Extrae los partidos entre dos jugadores de un estado (liga), desde la
// perspectiva de A. Devuelve {gA, gB, filas:[{sc, ganoA, ligaNombre}]}.
function partidosEntre(a, b, estado, ligaNombre){
  const ms=(estado&&estado.matches||[]).filter(m=>m&&m.status==='confirmed'&&!m.np&&(
    (m.aName===a&&m.bName===b)||(m.aName===b&&m.bName===a)||
    (m.po&&m.poNames&&((m.poNames[0]===a&&m.poNames[1]===b)||(m.poNames[0]===b&&m.poNames[1]===a)))
  ));
  let gA=0,gB=0; const filas=[];
  ms.forEach(m=>{
    const esPO=!!m.po;
    const aEsA = esPO ? (m.poNames&&m.poNames[0]===a) : (m.aName===a);
    let ganoA;
    if(esPO && m.winner){ ganoA = (m.winner===a); }
    else {
      let sa=0,sb=0;(m.sets||[]).forEach(s=>{if(Array.isArray(s)){const x=aEsA?s[0]:s[1],y=aEsA?s[1]:s[0];if(x>y)sa++;else if(y>x)sb++;}});
      ganoA = sa>sb;
    }
    if(ganoA)gA++;else gB++;
    // Marcador orientado desde A
    const sc = (esPO&&m.wo)?'W.O.':(m.sets||[]).map(s=>Array.isArray(s)?(aEsA?s[0]+'-'+s[1]:s[1]+'-'+s[0]):'').filter(Boolean).join('  ');
    filas.push({sc, ganoA, ligaNombre: ligaNombre||'', fecha: m.date||'', mid: m.id||0});
  });
  return {gA, gB, filas};
}
// Abre el modal H2H entre dos jugadores, sumando la liga actual + las pasadas.
async function abrirH2H(a, b){
  document.getElementById('modal-title').textContent=t('h2h_title');
  document.getElementById('modal-body').innerHTML='<div class="pm-past-load">'+t('past_loading')+'</div>';
  document.getElementById('modal-actions').innerHTML='<button class="btn" onclick="closeM()">'+t('close')+'</button>';
  document.getElementById('modal-bg').classList.add('open');
  let gA=0,gB=0; let filasHTML='';
  const todasLasFilas=[];
  const actual=partidosEntre(a,b,{matches:matches}, LEAGUE_NAME||t('past_current'));
  gA+=actual.gA; gB+=actual.gB;
  actual.filas.forEach(f=>todasLasFilas.push(f));
  
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'listar'})});
    const d=await r.json().catch(()=>({}));
    const otras=(d.ligas||[]).filter(l=>l.id!==(_ligaActual||'liga-actual'));
    for(const l of otras){
      try{
        let est=null;
        const rv=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'ver',id:l.id})});
        if(rv.ok){ const dv=await rv.json().catch(()=>({})); est=dv.estado; }
        else if(_token){
          const r2=await fetch('/api/state?liga='+encodeURIComponent(l.id),{headers:{Authorization:'Bearer '+_token},cache:'no-store'});
          if(r2.ok){ const d2=await r2.json().catch(()=>({})); est=d2.state; }
        }
        if(est){
          const res=partidosEntre(a,b,est, l.nombre);
          if(res.filas.length){ gA+=res.gA; gB+=res.gB; res.filas.forEach(f=>todasLasFilas.push(f)); }
        }
      }catch(_){}
    }
    todasLasFilas.sort((x,y)=>{
      const fx=x.fecha||'', fy=y.fecha||'';
      if(fx!==fy) return fy.localeCompare(fx);
      return (y.mid||0)-(x.mid||0);
    });
    filasHTML='<div class="h2h-list">'+todasLasFilas.map(f=>
      '<div class="h2h-row"><span class="h2h-wl '+(f.ganoA?'w':'l')+'">'+(f.ganoA?t('win_short'):t('loss_short'))+'</span>'
      +'<span class="h2h-sc">'+escPast(f.sc)+'</span>'
      +(f.ligaNombre?'<span class="h2h-liga-tag">'+escPast(f.ligaNombre)+'</span>':'')
      +'</div>').join('')+'</div>';
  }catch(_){}
  
  const body=document.getElementById('modal-body');
  if(gA+gB===0){ body.innerHTML='<div class="pm-past-empty">'+t('h2h_none').replace('{a}',escPast(a)).replace('{b}',escPast(b))+'</div>'; return; }
  let h='<div class="h2h-head">';
  h+='<div class="h2h-side"><span class="avatar h2h-av">'+getInitials(a)+'</span><b>'+escPast(a)+'</b></div>';
  h+='<div class="h2h-score"><span class="'+(gA>gB?'h2h-win':'')+'">'+gA+'</span><i>–</i><span class="'+(gB>gA?'h2h-win':'')+'">'+gB+'</span></div>';
  h+='<div class="h2h-side"><span class="avatar h2h-av">'+getInitials(b)+'</span><b>'+escPast(b)+'</b></div>';
  h+='</div>';
  h+='<div class="h2h-caption">'+t('h2h_balance').replace('{a}',escPast(a)).replace('{b}',escPast(b)).replace('{ga}',gA).replace('{gb}',gB)+'</div>';
  h+=filasHTML;
  body.innerHTML=h;
}
function renderPerfil(){
  const u = currentUser;
  if(u.role === 'admin' || u.role === 'superadmin') {
    // Se filtra por CLAVE, no por rol: 'admin' y 'superadmin' son cuentas del sistema,
    // no personas. Un jugador ascendido a admin tiene que SEGUIR apareciendo acá,
    // si no no habría forma de quitarle el rol después.
    const players = Object.entries(USERS).filter(([k,u])=>u&&k!=='admin'&&k!=='superadmin').map(([k,u])=>u).sort((a,b)=>(a.name||'').localeCompare(b.name||'','es'));
    let h = `<div class="card"><div class="section-lbl">${t('admin_profile')}</div>`;
    h += `<div class="prof-row"><span>${t('full_name')}</span><span>${u.name}</span></div>`;
    h += `<div class="prof-row"><span>${t('role_admin')}</span><span>${t('role_admin')}</span></div></div>`;
    
    h += renderThemeCard();
        h += `<div class="card" id="pk-card" style="display:none"><div class="section-lbl"><i class="ti ti-face-id"></i> ${t('pk_section')}</div>`;
    h += `<div id="pk-body"><p class="legend-txt" style="margin:.35rem 0 .75rem">${t('pk_section_hint')}</p>`;
    h += `<button class="btn btn-primary btn-sm" onclick="activarPasskey()"><i class="ti ti-face-id"></i> ${t('pk_activate_btn')}</button></div></div>`;
    h += `<div class="card"><div class="section-lbl">${t('change_password')}</div><div id="pw-alert"></div>`;
    h += `<div class="form-row"><div class="form-group"><label>${t('current_pass')}</label><input type="password" id="pw-old"></div>`;
    h += `<div class="form-group"><label>${t('new_pass')}</label><input type="password" id="pw-new" autocomplete="new-password"></div></div>`;
    h += `<div class="form-row"><div class="form-group"><label>${t('repeat_pass')}</label><input type="password" id="pw-new2"></div>`;
    h += `<div class="form-group" style="align-self:end"><button class="btn btn-accent" onclick="changePw()"><i class="ti ti-lock"></i> ${t('save_pass')}</button></div></div></div>`;
    // APARIENCIA: nombre, subtítulo, colores y clubes. Antes era exclusivo del
    // superadmin; ahora cualquier admin puede cambiar la parte cosmética. Lo
    // estructural (puntos, grupos, ciclos) sigue gateado aparte, más abajo.
    if(esAdmin(currentUser)){
      h += `<div class="card"><div class="section-lbl" style="color:var(--pri)">${t('appearance_title')}</div>
        <div class="form-row" style="margin-bottom:.75rem">
          <div class="form-group">
            <label style="font-size:13px;color:var(--text2);margin-bottom:4px;display:block">Nombre de la liga</label>
            <input id="sa-league-name" type="text" value="${attr(LEAGUE_NAME)}" style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--border2);background:var(--surface);font-size:14px">
          </div>
          <div class="form-group">
            <label style="font-size:13px;color:var(--text2);margin-bottom:4px;display:block">Subtítulo</label>
            <input id="sa-league-sub" type="text" value="${attr(LEAGUE_SUBTITLE)}" style="width:100%;padding:8px 12px;border-radius:8px;border:1.5px solid var(--border2);background:var(--surface);font-size:14px">
          </div>
        </div>
        <div class="form-row" style="margin-bottom:.75rem">
          <div class="form-group">
            <label style="font-size:13px;color:var(--text2);margin-bottom:4px;display:block">Color primario</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input id="sa-color-pri" type="color" value="${LEAGUE_COLOR_PRI}" oninput="syncHex('pri','picker')" style="width:48px;height:36px;border:1.5px solid var(--border2);border-radius:8px;cursor:pointer;padding:2px">
              <input id="sa-pri-hex" type="text" value="${LEAGUE_COLOR_PRI}" maxlength="7" spellcheck="false" oninput="syncHex('pri')" style="width:92px;font-size:13px;font-family:monospace;padding:6px 8px;border:1.5px solid var(--border2);border-radius:8px;background:var(--surface);color:var(--text)">
            </div>
          </div>
          <div class="form-group">
            <label style="font-size:13px;color:var(--text2);margin-bottom:4px;display:block">Color acento</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input id="sa-color-acc" type="color" value="${LEAGUE_COLOR_ACC}" oninput="syncHex('acc','picker')" style="width:48px;height:36px;border:1.5px solid var(--border2);border-radius:8px;cursor:pointer;padding:2px">
              <input id="sa-acc-hex" type="text" value="${LEAGUE_COLOR_ACC}" maxlength="7" spellcheck="false" oninput="syncHex('acc')" style="width:92px;font-size:13px;font-family:monospace;padding:6px 8px;border:1.5px solid var(--border2);border-radius:8px;background:var(--surface);color:var(--text)">
            </div>
          </div>
        </div>
        <div class="form-row" style="margin-bottom:.75rem">
          <div class="form-group">
            <label style="font-size:13px;color:var(--text2);margin-bottom:4px;display:block">Color de resaltado <span style="font-size:11px">(fondo de "No jugado" y "W.O.")</span></label>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <input id="sa-color-hl" type="color" value="${LEAGUE_COLOR_HL}" oninput="syncHex('hl','picker')" style="width:48px;height:36px;border:1.5px solid var(--border2);border-radius:8px;cursor:pointer;padding:2px">
              <input id="sa-hl-hex" type="text" value="${LEAGUE_COLOR_HL}" maxlength="7" spellcheck="false" oninput="syncHex('hl')" style="width:92px;font-size:13px;font-family:monospace;padding:6px 8px;border:1.5px solid var(--border2);border-radius:8px;background:var(--surface);color:var(--text)">
              <span id="sa-hl-demo" style="font-size:12px;font-weight:600;padding:5px 12px;border-radius:6px;background:${LEAGUE_COLOR_HL};color:var(--priD);border:1px solid var(--priD)">No jugado</span>
            </div>
          </div>
        </div>
        <div class="form-row" style="margin-bottom:.75rem">
          <div class="form-group">
            <label style="font-size:13px;color:var(--text2);margin-bottom:4px;display:block">${t('dispute_color')} <span style="font-size:11px">(${t('dispute_color_hint')})</span></label>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <input id="sa-color-disp" type="color" value="${COLOR_DISPUTA}" oninput="syncHex('disp','picker')" style="width:48px;height:36px;border:1.5px solid var(--border2);border-radius:8px;cursor:pointer;padding:2px">
              <input id="sa-disp-hex" type="text" value="${COLOR_DISPUTA}" maxlength="7" spellcheck="false" oninput="syncHex('disp')" style="width:92px;font-size:13px;font-family:monospace;padding:6px 8px;border:1.5px solid var(--border2);border-radius:8px;background:var(--surface);color:var(--text)">
              <span id="sa-disp-demo" style="font-size:12px;font-weight:600;padding:5px 12px;border-radius:6px;background:${COLOR_DISPUTA};color:${autoTxt(COLOR_DISPUTA)}">${t('dispute_short')}</span>
            </div>
          </div>
        </div>
        <div class="section-lbl" style="color:var(--pri);margin-top:1rem">${t('clubs_title')}</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:.6rem">${t('clubs_hint')}</div>
        <div id="clubs-editor">${clubsEditorHTML()}</div>
        <div class="section-lbl" style="color:var(--pri);margin-top:1.5rem">${t('rating_feature')}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;padding:.85rem 1rem;border:1px solid var(--border2);border-radius:10px;background:var(--surface)">
          <div style="flex:1;min-width:200px">
            <div style="font-weight:600;font-size:.9rem">${t('rating_toggle_label')}</div>
            <div style="font-size:.8rem;color:var(--text2);margin-top:2px">${t('rating_toggle_hint')}</div>
          </div>
          <button id="rating-toggle-btn" class="btn ${RATING_ON?'btn-success':''}" onclick="toggleRating()">
            <i class="ti ${RATING_ON?'ti-eye':'ti-eye-off'}"></i> ${RATING_ON?t('rating_on'):t('rating_off')}
          </button>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:.25rem;margin-top:1rem">
          <button class="btn btn-primary" onclick="previewLeagueColors()"><i class="ti ti-eye"></i> ${t('preview')}</button>
          <button class="btn btn-success" onclick="saveLeagueName()"><i class="ti ti-device-floppy"></i> ${t('save_all')}</button>
          <button class="btn" onclick="resetLeagueColors()"><i class="ti ti-refresh"></i> ${t('reset_colors')}</button>
        </div>
        <div id="sa-league-alert" style="margin-top:6px;font-size:12px"></div>
      </div>`;
    }
    const grps = (getActive() && getActive().groups) ? getActive().groups : [];
    h += `<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap;margin-bottom:.25rem">
      <div class="section-lbl" style="margin:0">${t('add_player')}</div>
      <button class="btn btn-sm" onclick="abrirAgregarJugadores()"><i class="ti ti-users"></i> ${t('aj_open_btn')}</button>
    </div>`;
    h += `<div class="form-row" style="grid-template-columns:1fr 1fr 1fr auto;align-items:end">`;
    h += `<div class="form-group"><label>${t('first_name')}</label><input id="ap-nom" placeholder="${t('first_name')}"></div>`;
    h += `<div class="form-group"><label>${t('last_name')}</label><input id="ap-ape" placeholder="${t('last_name')}"></div>`;
    h += `<div class="form-group"><label>${t('group')}</label><select id="ap-grp">${grps.map((_,k)=>`<option value="${k+1}">${groupName(k+1)}</option>`).join('')}</select></div>`;
    h += `<div class="form-group"><button class="btn btn-primary" onclick="addPlayerUI()"><i class="ti ti-user-plus"></i> ${t('add_btn')}</button></div>`;
    h += `</div></div>`;

    h += `<div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">
        <div class="section-lbl" style="margin:0">${t('player_mgmt')}</div>
        <div class="gap-sm">
          <button class="btn btn-sm" onclick="renderPerfil()"><i class="ti ti-refresh"></i> ${t('refresh_list')}</button>
        </div>
      </div>
      <p class="legend-txt" style="margin-top:0">${t('player_mgmt_hint')}</p>
      ${(currentUser&&currentUser.role==='superadmin')?`<div class="gap-sm mt-sm" style="flex-wrap:wrap;margin-bottom:.75rem">
        <button class="btn btn-sm" onclick="descargarPlantillaImport()"><i class="ti ti-file-download"></i> Descargar plantilla</button>
        <label class="btn btn-sm" style="cursor:pointer"><i class="ti ti-file-upload"></i> Importar jugadores (Excel)
          <input type="file" accept=".xlsx,.xls" style="display:none" onchange="importarJugadoresExcel(this)">
        </label>
        <button class="btn btn-sm btn-danger" onclick="limpiarJugadoresUI()"><i class="ti ti-eraser"></i> Limpiar jugadores</button>
      </div>`:''}
      ${esAdmin(currentUser) ? `<div style="border:1.5px solid var(--border2);border-radius:10px;padding:.65rem .8rem;margin-bottom:.75rem;background:var(--surface)">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--text2);margin-bottom:.5rem"><i class="ti ti-shield-check"></i> ${t('admins_section')}</div>
        <p class="legend-txt" style="margin:0 0 .5rem">${t('admins_hint')}</p>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          <span class="badge" style="background:var(--pri);color:#fff">Organización</span>
          ${Object.entries(USERS).filter(([k,u])=>u&&u.isAdmin===true&&k!=='admin'&&k!=='superadmin').map(([k,u])=>`<span class="badge" style="background:var(--hl);color:var(--priD)">${u.name||k}</span>`).join('') || `<span class="legend-txt">${t('admins_none')}</span>`}
        </div>
      </div>` : ''}
      <input type="text" id="player-search" placeholder="${t('search_player')}" oninput="filterPlayerList()" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border2);background:var(--surface);color:var(--text);font-size:13px;margin-bottom:.75rem">
      <div id="player-list">${renderPlayerList(players)}</div></div>`;
    if(u.role==='superadmin'){
      h += `<div class="card" id="cat-jugadores-card"><div class="section-lbl"><i class="ti ti-users"></i> ${t('cj_title')}</div>`;
      h += `<p class="legend-txt" style="margin-top:0">${t('cj_desc')}</p>`;
      h += `<div class="cj-search"><i class="ti ti-search"></i><input id="cj-search" placeholder="${t('cj_search')}" oninput="filtrarCatJugadores()"></div>`;
      h += `<div id="cat-jugadores-list"><div class="pm-past-load">${t('past_loading')}</div></div></div>`;
    }
    document.getElementById('view-perfil').innerHTML = h; try{ if(typeof passkeySoportada==='function'&&passkeySoportada()){ const pc=document.getElementById('pk-card'); if(pc){pc.style.display=''; if(typeof refrescarListaPasskeys==='function') refrescarListaPasskeys();} } }catch(_){}
    if(u.role==='superadmin') cargarCatJugadores();
  } else {
    const loc = findLoc(u.name, activeN);
    let h = misLigasHeaderHTML();
    h += statsPerfilHTML(u.name);
    h += `<div class="card"><div class="section-lbl">${t('my_profile')}</div>`;
    h += `<div class="prof-row"><span>${t('full_name')}</span><span>${u.name}</span></div>`;
    h += `<div class="prof-row"><span>${t('email')}</span><span>${u.email||'—'}</span></div>`;
    h += `<div class="prof-row"><span>${t('phone')}</span><span>${u.tel||'—'}</span></div>`;
    if(loc) h += `<div class="prof-row"><span>${t('current_group_label')}</span><span>${groupName(loc.g)}</span></div>`;
    h += `</div>`;
    h += renderThemeCard();
        h += `<div class="card" id="pk-card" style="display:none"><div class="section-lbl"><i class="ti ti-face-id"></i> ${t('pk_section')}</div>`;
    h += `<div id="pk-body"><p class="legend-txt" style="margin:.35rem 0 .75rem">${t('pk_section_hint')}</p>`;
    h += `<button class="btn btn-primary btn-sm" onclick="activarPasskey()"><i class="ti ti-face-id"></i> ${t('pk_activate_btn')}</button></div></div>`;
    h += `<div class="card"><div class="section-lbl">${t('change_password')}</div><div id="pw-alert"></div>`;
    h += `<div class="form-row"><div class="form-group"><label>${t('current_pass')}</label><input type="password" id="pw-old"></div>`;
    h += `<div class="form-group"><label>${t('new_pass')}</label><input type="password" id="pw-new" autocomplete="new-password"></div></div>`;
    h += `<div class="form-row"><div class="form-group"><label>${t('repeat_pass')}</label><input type="password" id="pw-new2"></div>`;
    h += `<div class="form-group" style="align-self:end"><button class="btn btn-accent" onclick="changePw()"><i class="ti ti-lock"></i> ${t('save_pass')}</button></div></div></div>`;
    h += `<div class="card"><div class="section-lbl">${t('my_history')}</div>${playerHistoryHTML(u.name)}</div>`;
    document.getElementById('view-perfil').innerHTML = h; try{ if(typeof passkeySoportada==='function'&&passkeySoportada()){ const pc=document.getElementById('pk-card'); if(pc){pc.style.display=''; if(typeof refrescarListaPasskeys==='function') refrescarListaPasskeys();} } }catch(_){}
    cargarMisLigasHeader();
  }
}

function renderPlayerList(players, filter) {
  const f = (filter||'').toLowerCase();
  const visible = players.filter(p => p && p.name && (!f || p.name.toLowerCase().includes(f)));
  if (!visible.length) return `<div class="empty">${t('no_results')}</div>`;

  // Particionar en 3 buckets: activos-sin-grupo, activos-con-grupo, inactivos.
  // Los inactivos siempre van al final. Dentro de activos, primero los sin
  // grupo (que necesitan atención del admin para asignarles uno).
  const activosSinGrupo = [];
  const activosConGrupo = [];
  const inactivos       = [];
  for(const p of visible){
    if(p.inactive){ inactivos.push(p); continue; }
    const loc = findLoc(p.name, activeN);
    if(!loc) activosSinGrupo.push(p);
    else activosConGrupo.push(p);
  }
  // Orden dentro de cada bucket:
  //  - activosSinGrupo: alfabético (no hay otro criterio útil).
  //  - activosConGrupo: por número de grupo asc y, dentro del grupo, alfabético.
  //  - inactivos: alfabético.
  // Localización 'es' para que las tildes ordenen bien (Ávila antes que Bar).
  const _cmpNombre = (a,b) => (a.name||'').localeCompare(b.name||'', 'es');
  activosSinGrupo.sort(_cmpNombre);
  inactivos.sort(_cmpNombre);
  activosConGrupo.sort((a,b) => {
    const la = findLoc(a.name, activeN); const lb = findLoc(b.name, activeN);
    const ga = la ? la.g : 999, gb = lb ? lb.g : 999;
    if(ga !== gb) return ga - gb;
    return _cmpNombre(a,b);
  });

  // Renderea una tarjeta de jugador. Extraído para no duplicar el HTML masivo.
  const renderOne = (p) => {
    const loc = findLoc(p.name, activeN);
    const curG = loc ? loc.g : '';
    const c = getActive();
    const gOpts = (c && c.groups) ? c.groups.map((_,k) => `<option value="${k+1}" ${curG===k+1?'selected':''}>${groupName(k+1)}</option>`).join('') : '';
    const isInactive = !!(p.inactive);
    const sinGrupoBadge = (!loc && !isInactive) ? ' <span style="font-size:10px;background:var(--warnBg,#fef3c7);color:var(--warnT,#854d0e);border-radius:4px;padding:1px 5px;font-weight:700">Sin grupo</span>' : '';
    return `<div class="ge-group" style="margin-bottom:.5rem;${isInactive?'opacity:.6':''}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="ge-gtitle">${p.name}${loc ? ` <span class="badge badge-tag">${groupName(loc.g)}</span>` : ''}${sinGrupoBadge}${isInactive?' <span style="font-size:10px;background:#e55;color:#fff;border-radius:4px;padding:1px 5px;font-weight:700">INACTIVO</span>':''}</div>
        <button class="btn btn-sm" onclick="togglePlayerEdit('${jsq(p.name)}')"><i class="ti ti-edit"></i> ${t('edit')}</button>
      </div>
      __PLAYER_CARD_BODY_${attr(p.name)}__
    </div>`;
  };

  // Genera el body editable del jugador (se pega en el placeholder de arriba).
  // Este bloque estaba antes en el mismo return del map, lo movemos acá para
  // que la estructura de tarjeta se pueda envolver en secciones.
  const renderBody = (p) => {
    const loc = findLoc(p.name, activeN);
    const curG = loc ? loc.g : '';
    const c = getActive();
    const gOpts = (c && c.groups) ? c.groups.map((_,k) => `<option value="${k+1}" ${curG===k+1?'selected':''}>${groupName(k+1)}</option>`).join('') : '';
    // El body del bloque editable — copiado sin cambios del renderizado original.
    // Se completa en la envolvente al reemplazar el marcador.
    return renderPlayerBodyHTML(p, gOpts);
  };

  // Ensamblado: por cada jugador, tarjeta + body inyectado en su marcador.
  const cardOf = (p) => renderOne(p).replace('__PLAYER_CARD_BODY_'+attr(p.name)+'__', renderBody(p));

  // Estados de apertura de las secciones:
  // - Sin filtro: Activos abiertos por defecto, Inactivos cerrados.
  // - Con filtro: cualquier sección con matches se abre.
  const filtering = !!f;
  const openActivos   = filtering ? (activosSinGrupo.length + activosConGrupo.length > 0) : true;
  const openInactivos = filtering ? inactivos.length > 0 : false;

  const nAct = activosSinGrupo.length + activosConGrupo.length;
  const nIna = inactivos.length;

  // Estilo compartido del summary — cursor de mano, padding, semibold.
  const sumStyle = 'cursor:pointer;padding:.55rem .75rem;font-weight:700;font-size:.9rem;border:1px solid var(--border2);border-radius:8px;background:var(--surface);margin-bottom:.4rem;user-select:none;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:.5rem';
  const countStyle = 'font-size:.75rem;font-weight:600;color:var(--text2);background:var(--surface2);border-radius:999px;padding:2px 8px';

  let out = '';

  // ---- SECCIÓN ACTIVOS ----
  if(nAct > 0){
    out += `<details ${openActivos?'open':''} style="margin-bottom:.5rem"><summary style="${sumStyle}"><span><i class="ti ti-user-check"></i> ${t('pl_active')}</span><span style="${countStyle}">${nAct}</span></summary><div style="margin-top:.4rem">`;
    // Primero los sin grupo (piden atención del admin)
    if(activosSinGrupo.length){
      out += activosSinGrupo.map(cardOf).join('');
    }
    // Después los con grupo (ya ordenados)
    if(activosConGrupo.length){
      out += activosConGrupo.map(cardOf).join('');
    }
    out += `</div></details>`;
  }

  // ---- SECCIÓN INACTIVOS ----
  if(nIna > 0){
    out += `<details ${openInactivos?'open':''} style="margin-bottom:.5rem"><summary style="${sumStyle}"><span><i class="ti ti-user-off"></i> ${t('pl_inactive')}</span><span style="${countStyle}">${nIna}</span></summary><div style="margin-top:.4rem">`;
    out += inactivos.map(cardOf).join('');
    out += `</div></details>`;
  }

  return out;
}

// Extraído de renderPlayerList: HTML del panel editable de un jugador. Se
// separó para poder envolver las tarjetas en secciones sin duplicar código.
function renderPlayerBodyHTML(p, gOpts){
  const isInactive = !!(p.inactive);
  return `<div id="pe-${attr(p.name)}" style="display:none;margin-top:.5rem;border:2px solid var(--pri);border-radius:12px;padding:.6rem;background:var(--soft)">
        <div style="border:1.5px solid var(--border2);border-radius:10px;padding:.65rem .8rem;margin-bottom:.55rem;background:var(--surface)">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--text2);margin-bottom:.55rem"><i class="ti ti-user"></i> Perfil del jugador</div>
        <div class="form-row">
          <div class="form-group"><label>Nombre</label><input type="text" id="pe-nombre-${attr(p.name)}" value="${attr(p.nombre!=null?p.nombre:_splitNom(p.name).nombre)}"></div>
          <div class="form-group"><label>Apellido</label><input type="text" id="pe-apellido-${attr(p.name)}" value="${attr(p.apellido!=null?p.apellido:_splitNom(p.name).apellido)}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Email</label><input type="email" id="pe-email-${attr(p.name)}" value="${attr(p.email||'')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Teléfono</label><input type="tel" id="pe-tel-${attr(p.name)}" value="${attr(p.tel||'')}"></div>
          <div class="form-group"><label>Grupo (Ciclo Activo)</label><select id="pe-grp-${attr(p.name)}"><option value="">Sin grupo</option>${gOpts}</select></div>
        </div>
        <div style="text-align:right;margin-top:.5rem">
          <button class="btn btn-success btn-sm" onclick="savePlayerAdmin('${jsq(p.name)}')"><i class="ti ti-device-floppy"></i> Guardar perfil</button>
        </div>
        </div>
        ${(p.role==='superadmin'||p.role==='admin'||!puedeGestionarAdmins(currentUser)) ? '' : `
        <div style="border:1.5px solid var(--border2);border-radius:10px;padding:.65rem .8rem;margin-bottom:.55rem;background:var(--surface)">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--text2);margin-bottom:.55rem"><i class="ti ti-shield-lock"></i> ${t('role_section')}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap">
            <span class="badge" style="background:${esAdmin(p)?'var(--pri)':'var(--surface2)'};color:${esAdmin(p)?'#fff':'var(--text2)'}">${esAdmin(p)?t('role_is_admin'):t('role_is_player')}</span>
            <button class="btn btn-sm" style="background:var(--hl);color:var(--priD)" onclick="toggleAdminRole('${jsq(p.name)}')">
              <i class="ti ti-shield-${esAdmin(p)?'off':'check'}"></i> ${esAdmin(p)?t('role_make_player'):t('role_make_admin')}
            </button>
          </div>
        </div>`}
        <div style="border:1.5px solid var(--border2);border-radius:10px;padding:.65rem .8rem;margin-bottom:.55rem;background:var(--surface)">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--text2);margin-bottom:.55rem"><i class="ti ti-lock"></i> Contraseña</div>
        <div class="form-group">
          <label>Poner una nueva contraseña</label>
          <div style="display:flex;gap:6px">
            <input type="text" id="pe-pass-${attr(p.name)}" placeholder="Mín. 4 caracteres" autocomplete="new-password" style="flex:1">
            <button class="btn btn-sm" style="white-space:nowrap" onclick="setPlayerPwd('${jsq(p.name)}')"><i class="ti ti-key"></i> Aplicar</button>
          </div>
        </div>
        <div style="margin-top:.55rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--text2)">o restablecer a la clave por defecto:</span>
          <button class="btn btn-sm" onclick="resetPwd('${jsq(p.name)}')"><i class="ti ti-refresh"></i> Reset PSWD - tenis</button>
        </div>
        </div>
        <div class="pe-danger-box" style="border:1.5px solid #e9b8b8;border-radius:10px;padding:.65rem .8rem;background:#fdf5f5">
        <div class="pe-danger-title" style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#b91c1c;margin-bottom:.55rem"><i class="ti ti-alert-triangle"></i> Estado en la liga</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-sm" style="${isInactive?'background:var(--success)':'background:#f59e0b'};color:#fff" onclick="toggleInactive('${jsq(p.name)}')"><i class="ti ti-${isInactive?'user-check':'user-off'}"></i> ${isInactive?'Reactivar jugador':'Marcar inactivo'}</button>
          <button class="btn btn-danger btn-sm" onclick="deletePlayerAdmin('${jsq(p.name)}')"><i class="ti ti-trash"></i> Eliminar de la liga</button>
        </div>
        </div>
      </div>`;
}
function filterPlayerList(){const f=document.getElementById('player-search').value;/* Mismo criterio que renderPerfil: se filtra por CLAVE. Si filtrara por rol,
   un jugador ascendido desaparecería apenas escribís en el buscador. */const players=Object.entries(USERS).filter(([k,u])=>u&&k!=='admin'&&k!=='superadmin').map(([k,u])=>u).sort((a,b)=>(a.name||'').localeCompare(b.name||'','es'));document.getElementById('player-list').innerHTML=renderPlayerList(players,f);}
function togglePlayerEdit(name){const el=document.getElementById('pe-'+name);if(el)el.style.display=el.style.display==='none'?'block':'none';}

// Renombra un jugador en TODO el estado (liga + playoffs). Un solo lugar para no olvidar ninguna referencia.
function renamePlayerEverywhere(oldName,newName){
  if(!oldName||!newName||oldName===newName)return;
  // USERS (la clave ES el nombre) — conserva pass, email, tel, rol, inactive, etc.
  if(USERS[oldName]){USERS[newName]={...USERS[oldName],name:newName};delete USERS[oldName];}
  // ALLNAMES
  const idx=ALLNAMES.indexOf(oldName);if(idx>=0)ALLNAMES[idx]=newName;
  // Grupos de cada ciclo
  cycles.forEach(c=>{if(!c.groups)return;c.groups.forEach(g=>{if(!g.players)return;const pi=g.players.indexOf(oldName);if(pi>=0)g.players[pi]=newName;});});
  // Partidos (liga y playoff): todos los campos que guardan un nombre
  matches.forEach(m=>{
    if(m.aName===oldName)m.aName=newName;
    if(m.bName===oldName)m.bName=newName;
    if(m.reporter===oldName)m.reporter=newName;
    if(m.vBy===oldName)m.vBy=newName;  // el validador también se renombra
    if(m.winner===oldName)m.winner=newName;
    if(m.poNames){if(m.poNames[0]===oldName)m.poNames[0]=newName;if(m.poNames[1]===oldName)m.poNames[1]=newName;}
  });
  // Playoffs
  if(playoff){
    if(Array.isArray(playoff.qualified)){const qi=playoff.qualified.indexOf(oldName);if(qi>=0)playoff.qualified[qi]=newName;}
    if(playoff._autoJumped===oldName)playoff._autoJumped=newName;
    if(Array.isArray(playoff.tramos)){
      playoff.tramos.forEach(tr=>{
        if(!tr)return;
        if(Array.isArray(tr.seeds)){const si=tr.seeds.indexOf(oldName);if(si>=0)tr.seeds[si]=newName;}
        ['main','cons'].forEach(which=>{
          if(!Array.isArray(tr[which]))return;
          tr[which].forEach(rd=>rd.forEach(m=>{if(!m)return;if(m.a===oldName)m.a=newName;if(m.b===oldName)m.b=newName;if(m.w===oldName)m.w=newName;}));
        });
      });
    }
    // playoff.results: la CLAVE lleva los dos nombres ordenados + el ganador está en .w
    if(playoff.results&&typeof playoff.results==='object'){
      const nr={};
      Object.keys(playoff.results).forEach(k=>{
        const hi=k.indexOf('#');
        if(hi<0){nr[k]=playoff.results[k];return;}
        const pre=k.slice(0,hi+1);
        const pair=k.slice(hi+1).split('|').map(n=>n===oldName?newName:n).sort();
        const v=playoff.results[k];
        if(v&&v.w===oldName)v.w=newName;
        nr[pre+pair.join('|')]=v;
      });
      playoff.results=nr;
    }
  }
  // LOG (registro de actividad): actualizar el actor y los nombres dentro del detalle.
  // Solo se reemplaza cuando el valor coincide EXACTO con el nombre viejo,
  // así nunca se tocan nombres de liga, números ni etiquetas (cuadro, ronda, etc.).
  if(Array.isArray(LOG)){
    LOG.forEach(e=>{
      if(!e)return;
      if(e.who===oldName)e.who=newName;
      const d=e.detail;
      if(d&&typeof d==='object'){
        if(d.a===oldName)d.a=newName;
        if(d.b===oldName)d.b=newName;
        if(d.winner===oldName)d.winner=newName;
        if(d.reporter===oldName)d.reporter=newName;
      }
    });
  }
}

// Separa un nombre completo en {nombre, apellido} para jugadores que ya existen
// (los que se crearon antes de tener campos separados). La primera palabra es el
// nombre; el resto, el apellido. Es solo un valor inicial editable por el admin.
function _splitNom(full){
  const partes=(full||'').trim().split(/\s+/);
  if(partes.length<=1) return { nombre: partes[0]||'', apellido: '' };
  return { nombre: partes[0], apellido: partes.slice(1).join(' ') };
}

function savePlayerAdmin(oldName){
  if(esCuentaSistema(oldName)){toast('No se puede editar al administrador desde aquí.');return;}
  const nombre=(document.getElementById('pe-nombre-'+oldName).value||'').trim();
  const apellido=(document.getElementById('pe-apellido-'+oldName).value||'').trim();
  // El nombre completo (identidad del jugador) es la unión de ambos.
  const newName=(nombre+' '+apellido).trim().replace(/\s+/g,' ');
  const email=(document.getElementById('pe-email-'+oldName).value||'').trim();
  const tel=(document.getElementById('pe-tel-'+oldName).value||'').trim();
  const grpEl=document.getElementById('pe-grp-'+oldName);
  const newGrp=grpEl?parseInt(grpEl.value):NaN;
  if(!newName){toast(t('name_empty'));return;}
  const u=USERS[oldName];if(!u)return;
  const loc=findLoc(oldName,activeN);
  if(loc&&!isNaN(newGrp)&&loc.g!==newGrp){movePlayer(oldName,loc.g,newGrp);}
  else if(!loc&&!isNaN(newGrp)){addPlayerToCycle(oldName,newGrp);}
  u.email=email;u.tel=tel;u.nombre=nombre;u.apellido=apellido;
  if(newName!==oldName){
    if(USERS[newName]){toast('Ya existe un jugador llamado "'+newName+'". Elegí otro nombre.');renderPerfil();return;}
    renamePlayerEverywhere(oldName,newName);
  }
  persist(true);renderPerfil();toast(tf('save_done',{name:newName}));
}

function deletePlayerAdmin(name){
  if(esCuentaSistema(name)){toast('No se puede eliminar al administrador.');return;}
  if(!confirm(`¿Seguro que querés eliminar a ${name} de la liga? Se borrará de los grupos actuales.`))return;
  delete USERS[name];
  const idx=ALLNAMES.indexOf(name);
  if(idx>=0)ALLNAMES.splice(idx,1);
  cycles.forEach(c=>{if(!c.groups)return;c.groups.forEach(g=>{const pi=(g.players||[]).indexOf(name);if(pi>=0)g.players.splice(pi,1);});});
  persist(true);renderPerfil();toast(name+' ha sido eliminado.');
}

// Asciende un jugador a administrador o lo devuelve a jugador.
// El super admin no aparece nunca acá: es único y el servidor lo blinda aparte.
// ¿Esta persona puede administrar la liga?
// OJO con el modelo: 'role' dice QUÉ SOS en la liga (jugador, cuenta del sistema);
// 'isAdmin' dice si PODÉS ADMINISTRARLA. Son dos cosas distintas: un jugador
// ascendido sigue siendo role:'player' —con su grupo, su fila, sus partidos—
// y además lleva isAdmin:true. Si le pisáramos el role, desaparecería de la liga.
// ¿Es una de las dos cuentas del sistema? Se pregunta por la CLAVE, nunca por el
// rol ni por esAdmin(). 'admin' y 'superadmin' no son personas: no juegan, no se
// editan ni se borran desde el panel de jugadores.
// Un jugador ascendido SÍ es una persona: se le edita el perfil, se le resetea la
// clave y se lo puede dar de baja como a cualquiera. Preguntar esAdmin() acá lo
// dejaba a mitad de camino: editable y borrable, pero sin poder resetearle la clave.
function esCuentaSistema(k){ return k==='admin' || k==='superadmin'; }

function esAdmin(u){
  return !!u && (u.role==='admin' || u.role==='superadmin' || u.isAdmin===true);
}
// Solo la cuenta original y el super admin reparten el rol: un admin ascendido
// no puede crear más admins ni dejarse una puerta trasera.
function puedeGestionarAdmins(u){
  // Se compara por CLAVE, igual que el servidor (session.u === 'admin').
  // Antes se aceptaba también name==='Organización': un jugador renombrado así
  // veía el botón de repartir roles y se comía un 403 sin entender por qué.
  return !!u && (u.role==='superadmin' || u.key==='admin');
}

function toggleAdminRole(name){
  const u=USERS[name];
  if(!u)return;
  if(u.role==='superadmin'||u.role==='admin'){toast(t('reset_not_here'));return;}
  if(!puedeGestionarAdmins(currentUser)){toast(t('role_only_owner'));return;}
  const sube = !u.isAdmin;
  if(!confirm(t(sube?'role_confirm_up':'role_confirm_down').replace('{n}',name)))return;
  // Se mueve el FLAG. El role sigue en 'player': mantiene su grupo, su fila en la
  // clasificación y sus partidos. Es jugador Y administrador a la vez.
  if(sube) u.isAdmin=true; else delete u.isAdmin;
  addLog(sube?'Alta de administrador':'Baja de administrador', name);
  persist(true);
  toast(t('role_done').replace('{n}',name));
  renderPerfil();
}

async function resetPwd(name){
  const u=USERS[name];if(!u)return;
  if(esCuentaSistema(name)){toast(t('reset_not_here')||'No se puede desde aquí.');return;}
  if(!confirm(t('reset_confirm').replace('{n}',name)))return;
  // Va por /api/password, NO por /api/save: los hashes ya no viajan en el estado.
  // El servidor lo hashea y, al ser la clave por defecto, en su próximo login
  // el jugador queda obligado a cambiarla.
  try{
    const r=await fetch('/api/password',{method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},
      body:JSON.stringify({target:name,newPass:'tenis',ligaId:_ligaActual||undefined})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){toast(d.error||t('reset_err'));return;}
    toast(t('reset_ok').replace('{n}',name));
  }catch(e){toast(t('reset_err'));}
}
// El admin le pone una contraseña personalizada a un jugador (hasheada con PBKDF2 v2).
async function setPlayerPwd(name){
  const u=USERS[name];if(!u){toast('Jugador no encontrado.');return;}
  if(esCuentaSistema(name)){toast('No se puede cambiar la contraseña del administrador desde aquí.');return;}
  const inp=document.getElementById('pe-pass-'+name);
  const pw=inp?(inp.value||'').trim():'';
  if(!pw||pw.length<4){toast('La contraseña debe tener al menos 4 caracteres.');return;}
  if(!confirm('¿Cambiar la contraseña de '+name+' a "'+pw+'"?'))return;
  try{
    const r=await fetch('/api/password',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},
      body:JSON.stringify({target:name,newPass:pw,ligaId:_ligaActual||undefined})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok){toast(d.error||'No se pudo cambiar la contraseña.');return;}
  }catch(e){toast('No se pudo conectar con el servidor.');return;}
  if(inp)inp.value='';
  toast(name+': contraseña actualizada.');
}
function toggleInactive(name){
  const u=USERS[name];if(!u)return;
  u.inactive=!u.inactive;
  let sacado=false;
  if(u.inactive){
    // Al marcarlo inactivo, se intenta liberar su lugar en el grupo del ciclo activo.
    // Solo se lo saca si aún no jugó partidos ese ciclo (si jugó, se queda para no
    // romper los puntos de sus rivales). Sus partidos nunca se borran.
    sacado=quitarDeGrupoActivo(name);
  }
  persist(true);
  renderPerfil();
  if(subView==='grupos')renderGrupos();
  if(subView==='general')renderGeneral();
  if(u.inactive){
    toast(name+(sacado?' marcado como inactivo y quitado del ciclo actual.':' marcado como inactivo. (Ya jugó este ciclo, así que sigue en su grupo para no alterar los puntos; queda oculto en las vistas.)'));
  }else{
    toast(name+' activado. Si querés que vuelva a competir, agregalo a un grupo del ciclo.');
  }
}
// Quita a un jugador del grupo que ocupe en el ciclo activo, PERO solo si todavía no
// jugó ningún partido en ese ciclo. Si ya jugó, se lo deja en el array (el filtro de
// inactivos lo oculta igual en las vistas), porque sacarlo haría que sus rivales
// perdieran los puntos que le ganaron: computeStats cuenta los partidos recorriendo
// los jugadores del grupo, y un partido contra alguien que ya no está se ignora.
// Devuelve true si se lo pudo sacar del grupo.
function quitarDeGrupoActivo(name){
  const c=cycles[activeN-1];
  if(!c||!c.groups)return false;
  const jugoEnCiclo=matches.some(m=>!m.po && m.cycle===activeN && (m.aName===name||m.bName===name));
  if(jugoEnCiclo)return false;  // ya jugó: se queda en el array para no romper la tabla
  for(let gi=0;gi<c.groups.length;gi++){
    const g=c.groups[gi];
    if(g&&Array.isArray(g.players)){
      const idx=g.players.indexOf(name);
      if(idx>=0){ g.players.splice(idx,1); return true; }
    }
  }
  return false;
}
// ============================================================================
// "Olvidé mi contraseña" — muestra un aviso al usuario para que contacte al
// administrador. Se optó por NO hacer reset por email porque si un atacante
// tiene el móvil de la víctima, muy probablemente también tenga acceso al
// email (sesión abierta en Gmail, Apple Mail, etc.) y podría usar el link
// para tomar la cuenta. El reset manual por parte del admin es más seguro:
// requiere contacto humano y una decisión activa.
// ============================================================================
async function mostrarResetRequest(){
  await confirmarModal(t('forgot_msg'), {
    titulo: t('forgot_title'),
    okTxt: t('forgot_ok'),
    cancelTxt: ''
  });
}

// Cambio de contraseña obligatorio. Aparece cuando el servidor avisa que se
// entró con una clave por defecto. No se puede cerrar ni saltear desde la UI.
// oldPass puede ser null si el usuario entró con Face ID: en ese caso el
// servidor acepta el cambio sin la clave anterior (el token ya prueba identidad
// y la clave guardada es de la lista pública POR_DEFECTO_V2).
function forcePwChange(oldPass){
  const viaPasskey = (oldPass === null || oldPass === undefined);
  const ov=document.createElement('div');
  ov.id='_pwforce';
  ov.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.92);display:flex;align-items:center;justify-content:center;padding:16px';
  // Ofrecemos activar Face ID acá SOLO si el dispositivo lo soporta Y el usuario
  // no acaba de entrar con Face ID (en ese caso ya está activado, no tiene sentido).
  const soporta = (typeof passkeySoportada==='function' && passkeySoportada()) && !viaPasskey;
  const pkCheck = soporta
    ? '<label style="display:flex;gap:8px;align-items:flex-start;margin:2px 0 4px;font-size:12.5px;line-height:1.4;color:var(--text2,#64748b);cursor:pointer">'+
        '<input id="_pwfpk" type="checkbox" checked style="margin-top:2px;flex-shrink:0">'+
        '<span>'+t('pwf_pk_offer')+'</span>'+
      '</label>'+
      '<p id="_pwfpkhint" style="margin:0 0 12px 26px;font-size:11.5px;line-height:1.35;color:var(--text2,#64748b);opacity:.85">'+t('pwf_pk_offer_after')+'</p>'
    : '';
  ov.innerHTML='<div style="background:var(--surface,#fff);border-radius:14px;padding:22px;max-width:380px;width:100%;box-shadow:0 18px 50px rgba(0,0,0,.4)">'+
    '<h3 style="margin:0 0 6px;font-size:17px">'+t('pwf_title')+'</h3>'+
    '<p style="margin:0 0 14px;font-size:13px;line-height:1.45;color:var(--text2,#64748b)">'+t('pwf_why')+'</p>'+
    '<input id="_pwf1" type="password" autocomplete="new-password" placeholder="'+t('pwf_new')+'" style="width:100%;padding:9px;margin-bottom:8px;border:1px solid var(--border,#e2e8f0);border-radius:8px;font-size:14px">'+
    '<input id="_pwf2" type="password" autocomplete="new-password" placeholder="'+t('pwf_rep')+'" style="width:100%;padding:9px;margin-bottom:10px;border:1px solid var(--border,#e2e8f0);border-radius:8px;font-size:14px">'+
    pkCheck +
    '<div id="_pwfe" style="display:none;font-size:12px;color:var(--danger);margin-bottom:8px"></div>'+
    '<button id="_pwfb" style="width:100%;padding:10px;border:none;border-radius:8px;background:var(--pri,#1e3a8a);color:#fff;font-weight:600;font-size:14px;cursor:pointer">'+t('pwf_save')+'</button>'+
  '</div>';
  document.body.appendChild(ov);
  // Si el usuario desmarca el checkbox de Face ID, ocultamos el hint sobre
  // el prompt biométrico: ya no aplica y confunde.
  if(soporta){
    const chk = document.getElementById('_pwfpk');
    const hintEl = document.getElementById('_pwfpkhint');
    if(chk && hintEl){
      chk.addEventListener('change', () => { hintEl.style.display = chk.checked ? '' : 'none'; });
    }
  }
  const err=m=>{const e=document.getElementById('_pwfe');e.textContent=m;e.style.display='block';};
  document.getElementById('_pwfb').onclick=async function(){
    const a=document.getElementById('_pwf1').value, b=document.getElementById('_pwf2').value;
    if(!a||a.length<6) return err(t('pwf_short'));
    // No comparar contra oldPass si vinimos por Face ID (no la tenemos, oldPass=null).
    if(!viaPasskey && a===oldPass) return err(t('pwf_same'));
    if(a!==b)          return err(t('pwf_nomatch'));
    this.disabled=true;
    try{
      // Body: si entramos por Face ID, no mandamos oldPass. El servidor lo permite
      // porque la clave actual está en POR_DEFECTO_V2 y ya tenemos token válido.
      const payload = { newPass: a, ligaId: _ligaActual || undefined };
      if(!viaPasskey) payload.oldPass = oldPass;
      const r=await fetch('/api/password',{method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},
        body:JSON.stringify(payload)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok){this.disabled=false;return err(d.error||t('pwf_err'));}
      // ¿El usuario pidió activar Face ID/Touch ID? Lo hacemos ahora, antes de cerrar
      // el modal, para que quede claro qué ventana de biometría le va a aparecer.
      const wantPk = soporta && document.getElementById('_pwfpk') && document.getElementById('_pwfpk').checked;
      ov.remove();
      if(typeof toast==='function')toast(t('pass_changed')||'OK');
      if(wantPk && typeof activarPasskey==='function'){
        // Pequeña espera para que el toast/re-render no compita con el prompt biométrico.
        setTimeout(()=>{ try{ activarPasskey(); }catch(_){} }, 250);
      }
    }catch(e){this.disabled=false;err(t('pwf_err'));}
  };
  document.getElementById('_pwf1').focus();
}

async function changePw(){
  const o=document.getElementById('pw-old').value,n=document.getElementById('pw-new').value,n2=document.getElementById('pw-new2').value,a=document.getElementById('pw-alert');
  function al(m,cl){a.className='alert alert-'+cl;a.textContent=m;}
  if(!n||n.length<4){al(t('pass_short'),'err');return;}
  if(n!==n2){al(t('pass_no_match'),'err');return;}
  // La contraseña anterior la verifica el servidor: acá ya no hay ningún hash.
  try{
    const r=await fetch('/api/password',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},
      body:JSON.stringify({oldPass:o,newPass:n,ligaId:_ligaActual||undefined})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok){al(d.error||t('pass_wrong'),'err');return;}
  }catch(e){al('No se pudo conectar con el servidor.','err');return;}
  al(t('pass_ok'),'ok');
  ['pw-old','pw-new','pw-new2'].forEach(id=>document.getElementById(id).value='');
}


// ============================================================================
// "Mis Ligas" — header en el perfil del jugador que muestra todas las ligas
// activas de la plataforma, marcando en cuál está parado, en cuáles ya
// participa, y dejándolo pedir acceso a las demás. El admin de la liga
// destino ve la solicitud en su panel y la acepta o rechaza.
// ============================================================================

// Pinta la card vacía (loading) — el fetch real lo hace cargarMisLigasHeader(),
// llamado después de inyectar el HTML en el DOM (mismo patrón que otras cards
// asincrónicas de este archivo, como el catálogo de superadmin).
function misLigasHeaderHTML(){
  return `<div class="card" id="mis-ligas-card">
    <div class="section-lbl"><i class="ti ti-trophy"></i> Mis Ligas</div>
    <p class="legend-txt" style="margin-top:.15rem;margin-bottom:.6rem">Estas son las ligas activas de la plataforma. Podés pedir acceso a otra sin perder tu lugar acá.</p>
    <div id="mis-ligas-body" class="liga-tabs"><div class="legend-txt">Cargando ligas activas…</div></div>
  </div>`;
}

async function cargarMisLigasHeader(){
  const body = document.getElementById('mis-ligas-body');
  if(!body) return;
  if(!_token || !_ligaActual){
    body.innerHTML = '<div class="legend-txt">No se pudo determinar tu liga actual.</div>';
    return;
  }
  try{
    const r = await fetch('/api/liga', {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer '+_token},
      body: JSON.stringify({ accion:'misLigas', ligaId:_ligaActual })
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok){ body.innerHTML = '<div class="legend-txt">'+attr(d.error||'No se pudo cargar.')+'</div>'; return; }
    const ligas = Array.isArray(d.ligas) ? d.ligas : [];
    if(!ligas.length){ body.innerHTML = '<div class="legend-txt">No hay ligas activas por el momento.</div>'; return; }
    body.innerHTML = ligas.map(l => {
      const nombreSafe = attr(l.nombre || '');
      const nombreJs = String(l.nombre || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      if(l.esLigaActual){
        return '<div class="liga-tab liga-tab-here"><i class="ti ti-map-pin"></i> '+nombreSafe+' <span class="liga-tab-cta">estás acá</span></div>';
      }
      if(l.participo){
        return '<button class="liga-tab liga-tab-ok" onclick="entrarAOtraLiga(\''+l.id+'\',\''+nombreJs+'\')"><i class="ti ti-login-2"></i> '+nombreSafe+' <span class="liga-tab-cta">participando</span></button>';
      }
      if(l.solicitudEstado === 'pending'){
        return '<div class="liga-tab liga-tab-pending"><i class="ti ti-clock"></i> '+nombreSafe+' <span class="liga-tab-cta">pendiente</span></div>';
      }
      // Sin relación todavía, o una solicitud previa fue rechazada (puede reintentar).
      const label = l.solicitudEstado === 'rejected' ? 'Reintentar' : 'Solicitar acceso';
      return '<button class="liga-tab liga-tab-ask" onclick="solicitarAccesoUI(\''+l.id+'\',\''+nombreJs+'\')"><i class="ti ti-send"></i> '+nombreSafe+' <span class="liga-tab-cta">'+label+'</span></button>';
    }).join('');
  } catch(e){
    body.innerHTML = '<div class="legend-txt">No se pudo conectar con el servidor.</div>';
  }
}

// Pide acceso a otra liga. El backend valida que no esté ya participando ahí
// y que no tenga otra solicitud pendiente para esa misma liga.
async function solicitarAccesoUI(ligaId, nombre){
  if(!confirm('¿Solicitar acceso a "'+nombre+'"? El administrador de esa liga va a tener que aprobarlo antes de que puedas entrar.')) return;
  try{
    const r = await fetch('/api/liga', {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer '+_token},
      body: JSON.stringify({ accion:'solicitarAcceso', ligaId:_ligaActual, ligaDestino:ligaId })
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok){ toast(d.error || 'No se pudo enviar la solicitud.'); return; }
    toast('Solicitud enviada. El administrador de "'+nombre+'" la va a revisar.');
    cargarMisLigasHeader();
  }catch(e){ toast('No se pudo conectar con el servidor.'); }
}

// El jugador ya participa en la otra liga (fue aceptado en algún momento):
// lo mandamos al selector de login de esa liga para que entre con su usuario
// y contraseña de ahí (cada liga tiene sus propias credenciales).
async function entrarAOtraLiga(ligaId, nombre){
  if(!confirm('Vas a salir de esta sesión para entrar a "'+nombre+'". ¿Continuar?')) return;
  doLogout();
  // Pequeño delay para dejar terminar el detectarLigaActiva() que dispara
  // initLogin() (llamado dentro de doLogout), y recién ahí forzar la liga
  // elegida + traer su lista de usuarios para pintar el selector de login.
  setTimeout(function(){ try{ elegirLigaLogin(ligaId); }catch(_){} }, 300);
}
