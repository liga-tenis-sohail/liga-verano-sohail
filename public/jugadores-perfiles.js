// ============================================================================
// public/jugadores-perfiles.js — perfiles, H2H, altas/bajas/renombrados/roles/passwords
// Extraído del index.html original (líneas del script: 4795..5853).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================

// Hashes de contraseñas PÚBLICAS conocidas (mismo criterio que POR_DEFECTO_V2
// en api/_lib.js — no se puede importar ese módulo del servidor acá, así que
// se replican los valores). "tenis" es la clave por defecto de un jugador
// nuevo o recién reseteado (ver DEFAULT_PASS_HASH en core-estado.js, que es
// el mismo valor en formato v1); "admin123" quedó pública en el repo en algún
// momento y también se trata como default. Sirve para pintar el punto
// verde/rojo junto al nombre en la lista de jugadores del admin: rojo si
// u.pass coincide con alguno de estos, verde en cualquier otro caso (ya la
// cambió, o el admin le puso una personalizada).
const HASHES_PASS_DEFAULT = new Set([
  'v1:8f5e91d22e332be45d55724423baad250490285a4e302b9eec0e6fd482164b83',   // tenis (v1, hash legacy previo al rehash automático)
  'v2:7afc817d4013c0e9740356ad09b7e4094ee6678df855c5869aaad97dd4d2f3eb',   // tenis (v2)
  'v2:e7fd5acfb9cbb0449ad3abe3c0f3436559af8cf74a09cdbee1a29a41bb394d12'    // admin123 (v2)
]);
function tienePasswordDefault(u){
  return !!(u && (u.passwordDefault===true || (u.pass && HASHES_PASS_DEFAULT.has(u.pass))));
}

function renderCargarDisputas(){ }

function resolveD(mid){return SohailUI.resolve(mid);}

function forceConfirmAll(){if(window.SohailUI)SohailUI.forceConfirm();}

function demoFillUI(){
if(!esAdmin(currentUser)||prompt(t('ui_simulation_warning'))!=='SIMULAR')return;

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
  if(typeof destinosAutoBeforeClose==='function'&&!destinosAutoBeforeClose())return;
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
  let h=`<p class="legend-txt" style="margin-top:0;margin-bottom:.8rem">${t('ui36_text_169')}</p>`;
  h+=`<div class="form-row" style="grid-template-columns: 1fr;">`;
  for(let i=0;i<len;i++){
    let v=PUNTOS[gid][i]!==undefined?PUNTOS[gid][i]:0;
    h+=`<div class="set-row"><label>${i+1}${t('ui36_text_170')}</label><input type="number" id="pt-pos-${i}" value="${v}" min="0" max="100" class="po-in" style="width:70px"></div>`;
  }
  h+=`</div>`;
  document.getElementById('modal-title').textContent=`${t('ui36_text_171')}${groupName(gid)}`;
  document.getElementById('modal-body').innerHTML=h;
  document.getElementById('modal-actions').innerHTML=`<button class="btn btn-primary" onclick="savePuntos(${gid},${len})"><i class="ti ti-device-floppy"></i> ${t('ui36_text_172')}</button><button class="btn" onclick="closeM()">${t('ui36_text_093')}</button>`;
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
  toast((""+t('ui36_text_174')+""));
}

// ===== Ajuste manual de puntos por jugador (bonus/penalidad) =====
// Distinto de editPuntosUI/savePuntos (que edita la ESCALA por posición,
// aplica a quien sea que termine en ese puesto): esto es un ajuste puntual
// para UN jugador específico en UN ciclo/grupo específico, típicamente para
// sumar o restar puntos por una penalidad disciplinaria o un reconocimiento
// discrecional del admin — no depende de en qué posición terminó.
function editAjustePuntosUI(ciclo, gid, nombre){
  if(!esAdmin(currentUser)) return;
  const actual = (AJUSTES_PUNTOS[ciclo] && AJUSTES_PUNTOS[ciclo][gid] && AJUSTES_PUNTOS[ciclo][gid][nombre]) || 0;
  document.getElementById('modal-title').textContent = t('pts_ajuste_title').replace('{n}', nombre);
  document.getElementById('modal-body').innerHTML = `
    <p class="legend-txt" style="margin-top:0">${t('pts_ajuste_hint')}</p>
    <div class="form-group">
      <label style="font-size:13px;color:var(--text2);margin-bottom:4px;display:block">${t('pts_ajuste_lbl')}</label>
      <input type="number" id="pts-ajuste-input" value="${actual}" step="1" class="po-in" style="width:100px;font-size:16px">
    </div>`;
  document.getElementById('modal-actions').innerHTML = `
    <button class="btn btn-primary" onclick="saveAjustePuntos(${ciclo},${gid},'${jsq(nombre)}')"><i class="ti ti-device-floppy"></i> ${t('save')}</button>
    ${actual ? `<button class="btn" onclick="saveAjustePuntos(${ciclo},${gid},'${jsq(nombre)}',true)">${t('pts_ajuste_clear')}</button>` : ''}
    <button class="btn" onclick="closeM()">${t('close')}</button>`;
  document.getElementById('modal-bg').classList.add('open');
  setTimeout(()=>document.getElementById('pts-ajuste-input')?.focus(), 50);
}
function saveAjustePuntos(ciclo, gid, nombre, limpiar){
  let v = 0;
  if(!limpiar){
    v = parseInt(document.getElementById('pts-ajuste-input').value, 10);
    if(isNaN(v)) v = 0;
    // Sin tope numérico duro: una penalidad o bonus real puede ser
    // cualquier valor razonable que el admin decida — a diferencia de
    // PUNTOS (la escala por posición, 0-100), esto no compone una fórmula
    // automática que dependa de un rango fijo.
  }
  if(!AJUSTES_PUNTOS[ciclo]) AJUSTES_PUNTOS[ciclo] = {};
  if(!AJUSTES_PUNTOS[ciclo][gid]) AJUSTES_PUNTOS[ciclo][gid] = {};
  if(v === 0){
    // Limpiar la entrada en vez de guardar un 0 explícito: mantiene el
    // objeto liviano y evita que "sin ajuste" y "ajuste de 0" se confundan
    // en el guardado.
    delete AJUSTES_PUNTOS[ciclo][gid][nombre];
  } else {
    AJUSTES_PUNTOS[ciclo][gid][nombre] = v;
  }
  persist(true);
  closeM();
  refreshAll();
  toast(t('pts_ajuste_saved').replace('{n}', nombre));
}

// ===== Editor de ajustes desde Clasificación General: TODOS los ciclos =====
// A diferencia de editAjustePuntosUI (un solo ciclo/grupo fijo, usado desde
// la tabla de un grupo puntual), este editor lista cada ciclo donde el
// jugador tiene un grupo asignado, con su propio campo editable, y guarda
// todos los cambios juntos en un solo click.
//
// Encuentra, para cada ciclo de la liga, el gid (grupo) donde jugó `nombre`
// — necesario porque AJUSTES_PUNTOS se guarda por ciclo+grupo+jugador, y la
// Clasificación General no expone ese gid por ciclo (solo el total ya
// sumado). Un jugador juega en un único grupo por ciclo, así que alcanza
// con findLoc(nombre, cicloN) por cada ciclo.
//
// TODOS los ciclos se incluyen, no solo los que jugó: si no tiene grupo ahí
// (loc es null), se usa gid:0 — la misma convención de "Sin grupo" que ya
// usa el resto del sistema — para que el admin pueda darle puntos en un
// ciclo donde nunca participó (por ejemplo, se sumó tarde a la liga, o
// falta por otro motivo pero igual se le reconoce algo). computeGeneral()
// (core-estado.js) tiene una segunda pasada específica que suma estos
// ajustes "sueltos" (gid:0) al Total, ya que el loop principal de esa
// función solo recorre jugadores con partidos reales en algún grupo.
function _ajustesDelJugadorPorCiclo(nombre){
  return cycles.map(c=>{
    const loc=findLoc(nombre, c.n);
    const gid=loc?loc.g:0;
    const actual=(AJUSTES_PUNTOS[c.n]&&AJUSTES_PUNTOS[c.n][gid]&&AJUSTES_PUNTOS[c.n][gid][nombre])||0;
    return {ciclo:c.n, gid, actual, sinGrupo:!loc};
  });
}
function editAjustePuntosGeneralUI(nombre){
  if(!esAdmin(currentUser)) return;
  // Ya no se filtra por "jugó este ciclo": _ajustesDelJugadorPorCiclo
  // devuelve TODOS los ciclos de la liga siempre (con gid:0 para los que
  // el jugador no tiene grupo asignado), así que filas.length nunca es 0
  // salvo que la liga no tenga NINGÚN ciclo — caso que no debería llegar
  // acá (el botón ni se muestra sin ciclos).
  const filas=_ajustesDelJugadorPorCiclo(nombre);
  document.getElementById('modal-title').textContent = t('pts_ajuste_title').replace('{n}', nombre);
  const rowsHtml = filas.map(f=>
    `<div class="form-group" style="margin-bottom:.6rem">
      <label style="font-size:13px;color:var(--text2);margin-bottom:4px;display:block">${t('cycle')} ${f.ciclo} · ${f.sinGrupo?t('pts_ajuste_sin_grupo'):groupName(f.gid)}</label>
      <input type="number" id="pts-ajuste-c${f.ciclo}" data-gid="${f.gid}" value="${f.actual}" step="1" class="po-in" style="width:100px;font-size:16px">
    </div>`
  ).join('');
  document.getElementById('modal-body').innerHTML = `
    <p class="legend-txt" style="margin-top:0">${t('pts_ajuste_hint_gen')}</p>
    ${rowsHtml}`;
  document.getElementById('modal-actions').innerHTML = `
    <button class="btn btn-primary" onclick="saveAjustesPuntosGeneral('${jsq(nombre)}')"><i class="ti ti-device-floppy"></i> ${t('save')}</button>
    <button class="btn" onclick="closeM()">${t('close')}</button>`;
  document.getElementById('modal-bg').classList.add('open');
}
function saveAjustesPuntosGeneral(nombre){
  const filas=_ajustesDelJugadorPorCiclo(nombre);
  filas.forEach(f=>{
    const inp=document.getElementById('pts-ajuste-c'+f.ciclo);
    if(!inp) return;
    let v=parseInt(inp.value,10);
    if(isNaN(v)) v=0;
    if(!AJUSTES_PUNTOS[f.ciclo]) AJUSTES_PUNTOS[f.ciclo]={};
    if(!AJUSTES_PUNTOS[f.ciclo][f.gid]) AJUSTES_PUNTOS[f.ciclo][f.gid]={};
    if(v===0){
      delete AJUSTES_PUNTOS[f.ciclo][f.gid][nombre];
    } else {
      AJUSTES_PUNTOS[f.ciclo][f.gid][nombre]=v;
    }
  });
  persist(true);
  closeM();
  refreshAll();
  toast(t('pts_ajuste_saved').replace('{n}', nombre));
}
// Punto de entrada desde el panel de Admin ("✏️ Editar puntos de un
// jugador"): a diferencia del lápiz en la fila de Clasificación General,
// este NO depende de que el jugador ya tenga una fila ahí — sirve
// justamente para el caso pedido de "dar puntos a alguien que todavía no
// participó en ningún ciclo" (Clasificación General solo muestra
// jugadores con al menos un punto; este panel llega a cualquiera). Lee el
// nombre del input con datalist (mismo patrón que "Reparar jugador en un
// ciclo") y abre el mismo modal que ya usa el lápiz.
function editAjustePuntosDesdeAdminUI(){
  const inp=document.getElementById('pts-ajuste-jugador');
  const nombre=(inp?inp.value:'').trim();
  if(!nombre){ toast(t('pts_ajuste_panel_empty')); return; }
  if(!USERS[nombre]){ toast(t('pts_ajuste_panel_notfound')); return; }
  editAjustePuntosGeneralUI(nombre);
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
  return `<div class="card" style="margin-bottom:.6rem"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem"><div class="section-lbl" style="margin:0">${title}</div><div style="font-size:13px"><span class="history-count-win" style="font-weight:700">${g}</span><span style="color:var(--text2)"> – </span><span class="history-count-loss" style="font-weight:700">${p}</span></div></div>${rows}</div>`;
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
      const setsStr=mine.map(([a,b])=>a+'-'+b).join('  ');
      const sc=m.wo?(setsStr?(setsStr+' RET'):'RET'):setsStr;
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
  // v3.3: same read-only sporting data, same calculations as My matches.
  _pmPastOpen=null;
  if(window.SohailHistory&&typeof SohailHistory.openPlayer==='function'&&SohailHistory.openPlayer(name))return;
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
  const wrap=document.getElementById('pm-past-wrap');if(!wrap)return;
  if(_pmPastOpen===name){wrap.replaceChildren();_pmPastOpen=null;return;}
  _pmPastOpen=name;
  const request={},key=_saveSessionKey(),league=_ligaActual;
  wrap._playerPastRequest=request;
  const current=()=>wrap.isConnected&&document.getElementById('modal-bg')?.classList.contains('open')&&wrap._playerPastRequest===request&&_pmPastOpen===name&&key===_saveSessionKey()&&league===_ligaActual;
  wrap.innerHTML='<div class="pm-past-load" role="status">'+t('past_loading')+'</div>';
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'listar'})});
    if(!r.ok)throw new Error('league-list');
    const d=await r.json();if(!current())return;
    const others=(Array.isArray(d.ligas)?d.ligas:[]).filter(l=>l&&l.id!==(_ligaActual||'liga-actual'));
    if(!others.length){wrap.innerHTML='<div class="pm-past-empty">'+t('past_player_none')+'</div>';return;}
    wrap.innerHTML='<div class="pm-past-box"><div class="pm-past-lbl">'+t('past_player_lbl')+'</div><div class="pm-past-seasons" id="pm-past-seasons"></div><div class="pm-season-results" id="pm-season-results"></div></div>';
    const seasons=wrap.querySelector('#pm-past-seasons');
    others.forEach((l,i)=>{const b=document.createElement('button');b.type='button';b.className='pm-season-btn'+(i===0?' on':'');b.textContent=l.nombre||l.id;b.onclick=()=>verJugadorEnLiga(name,l.id,b);seasons.appendChild(b);});
    verJugadorEnLiga(name,others[0].id,seasons.firstElementChild);
  }catch(_){if(current())wrap.innerHTML='<div class="pm-past-empty" role="status">'+t('past_loading_err')+'</div>';}
}
// Same read endpoints and server permissions as before. No elegir=1, no hydration,
// no switch of identity or active league. Discard stale replies when a new card opens.
async function verJugadorEnLiga(name,ligaId,btn){
  const box=document.getElementById('pm-season-results');if(!box)return;
  if(btn){document.querySelectorAll('#pm-past-seasons .pm-season-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');}
  if(typeof box._mhPlayerDispose==='function')box._mhPlayerDispose();
  const request={},key=_saveSessionKey(),league=_ligaActual;
  box._playerSeasonRequest=request;
  const current=()=>box.isConnected&&document.getElementById('modal-bg')?.classList.contains('open')&&box._playerSeasonRequest===request&&key===_saveSessionKey()&&league===_ligaActual;
  box.innerHTML='<div class="pm-past-load" role="status">'+t('past_loading')+'</div>';
  try{
    let state=null,label=btn?.textContent||ligaId;
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'ver',id:ligaId})});
    if(!current())return;
    if(r.ok){const d=await r.json();state=d.estado;}
    else if(_token){
      const r2=await fetch('/api/state?liga='+encodeURIComponent(ligaId)+'&historial=1',{headers:{Authorization:'Bearer '+_token},cache:'no-store'});
      if(!current())return;
      if(r2.ok){const d2=await r2.json();state=d2.state;if(d2.ligaNombre)label=d2.ligaNombre;}
    }
    if(!current())return;
    if(!state){box.innerHTML='<div class="pm-past-empty">'+t('past_loading_err')+'</div>';return;}
    // A season button must retain the selected person's global identity. An
    // equal display name in another league is never proof of that identity.
    const profileId=USERS[name]?.jugadorId;
    if(!profileId){box.innerHTML='<div class="pm-past-empty">'+t('mha_unlinked')+'</div>';return;}
    const aliases=Object.entries(state.users||{}).filter(([,u])=>u?.jugadorId===profileId).map(([n])=>n);
    if(!aliases.length){box.innerHTML='<div class="pm-past-empty">'+t('past_player_nomatch')+'</div>';return;}
    const seasonName=aliases.includes(name)?name:aliases[0];
    if(window.SohailHistory&&typeof SohailHistory.mountPlayer==='function'){
      SohailHistory.mountPlayer(box,{name:seasonName,leagueId:ligaId,leagueName:label,users:state.users,otherLeague:true,cycles:state.cycles,records:state.matches,groupLabel:g=>t('group')+' '+g});
    }else box.innerHTML=resultadosJugadorEnEstado(seasonName,state);
  }catch(_){if(current())box.innerHTML='<div class="pm-past-empty" role="status">'+t('past_loading_err')+'</div>';}
}

// Arma la lista de partidos de un jugador dado el estado de una liga.
// Incluye TANTO partidos de liga regular (aName/bName) COMO de Play Offs
// (po:true, poNames array) — antes solo miraba aName/bName, así que los
// partidos de playoff de otras ligas quedaban completamente invisibles acá
// (statsJugadorEnEstado, en jugadores-perfiles-catalogo.js, ya tenía este
// mismo fix para el conteo total; esta función lo necesitaba también para
// el LISTADO partido por partido).
function resultadosJugadorEnEstado(name, estado){
  const matches=(estado.matches||[]).filter(m=>{
    if(!m || m.status!=='confirmed') return false;
    if(m.aName===name || m.bName===name) return true;
    if(m.po && Array.isArray(m.poNames) && m.poNames.indexOf(name)!==-1) return true;
    return false;
  });
  if(!matches.length) return '<div class="pm-past-empty">'+t('past_player_nomatch')+'</div>';
  let g=0,p=0, rows='';
  matches.forEach(m=>{
    const esPO = !!m.po;
    const yoA = esPO ? (m.poNames && m.poNames[0]===name) : (m.aName===name);
    const rival = esPO ? (yoA ? m.poNames[1] : m.poNames[0]) : (yoA ? m.bName : m.aName);
    const sets=(m.sets||[]).map(s=>Array.isArray(s)?(yoA?s[0]+'-'+s[1]:s[1]+'-'+s[0]):'').filter(Boolean).join(' ');
    // En playoffs y en retiros de grupo se prioriza m.winner (más confiable
    // que recalcular por sets: puede haber W.O./retiro, con sets vacíos o
    // incompletos) — mismo criterio que statsJugadorEnEstado. Antes esto
    // solo aplicaba a playoff (esPO), así que un retiro en liga regular
    // caía al cálculo por sets con sgA=sgB=0 y contaba como derrota para
    // AMBOS jugadores, sin importar quién ganó realmente por retiro.
    let gane;
    if(m.winner && (esPO || m.wo)){ gane = (m.winner===name); }
    else {
      let sgA=0,sgB=0; (m.sets||[]).forEach(s=>{if(Array.isArray(s)){if(s[0]>s[1])sgA++;else if(s[1]>s[0])sgB++;}});
      gane = yoA? sgA>sgB : sgB>sgA;
    }
    if(gane)g++;else p++;
    // Antes: un retiro reemplazaba TODO el marcador por "W.O.", incluso si
    // había sets/games reales jugados antes de retirarse. Ahora se muestran
    // los sets que sí se jugaron (si los hay) y "RET" se agrega como
    // indicador aparte, no como reemplazo — un retiro antes de jugar ningún
    // set muestra solo "RET".
    const marcador = m.wo ? (sets ? (sets+' RET') : 'RET') : sets;
    rows+='<div class="pm-res-row"><span class="pm-wl '+(gane?'w':'l')+'">'+(gane?t('win_short'):t('loss_short'))+'</span>'
      +'<span class="pm-res-rival">'+escPast(rival||'')+'</span><span class="pm-res-sc">'+escPast(marcador)+'</span></div>';
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
    // Marcador orientado desde A. m.wo ya no está limitado a playoff (esPO)
    // — un retiro en liga regular también debe mostrar RET + los sets
    // reales jugados, no solo los de playoff.
    const setsStrH2H=(m.sets||[]).map(s=>Array.isArray(s)?(aEsA?s[0]+'-'+s[1]:s[1]+'-'+s[0]):'').filter(Boolean).join('  ');
    const sc = m.wo?(setsStrH2H?(setsStrH2H+' RET'):'RET'):setsStrH2H;
    filas.push({sc, ganoA, ligaNombre: ligaNombre||'', fecha: m.date||'', mid: m.id||0});
  });
  return {gA, gB, filas};
}
// Abre el modal H2H entre dos jugadores, sumando la liga actual + las pasadas.
async function abrirH2H(a,b){
  if(window.SohailHistory?.openH2H(a,b))return;
  toast(LANG==='en'?'Choose two different sporting profiles. Reload if the history module is unavailable.':'Elegí dos fichas deportivas distintas. Recargá si falta el módulo de historial.');
}

function renderPerfil(){
  const u = currentUser;
  if(esAdmin(u)) {
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
    h += `<div class="form-row"><div class="form-group"><label for="pw-old">${t('current_pass')}</label><input type="password" id="pw-old"></div>`;
    h += `<div class="form-group"><label for="pw-new">${t('new_pass')}</label><input type="password" id="pw-new" autocomplete="new-password"></div></div>`;
    h += `<div class="form-row"><div class="form-group"><label for="pw-new2">${t('repeat_pass')}</label><input type="password" id="pw-new2"></div>`;
    h += `<div class="form-group" style="align-self:end"><button class="btn btn-accent" onclick="changePw()"><i class="ti ti-lock"></i> ${t('save_pass')}</button></div></div></div>`;
    const grps = (getActive() && getActive().groups) ? getActive().groups : [];
    h += `<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap;margin-bottom:.25rem">
      <div class="section-lbl" style="margin:0">${t('add_player')}</div>
      <div class="gap-sm" style="display:flex;flex-wrap:wrap;gap:.35rem">
        <button class="btn btn-sm" onclick="exportarListaJugadores()" title="${attr(t('ui36_text_221'))}"><i class="ti ti-file-download"></i> ${t('fix_export_list')}</button>
        <label class="btn btn-sm" style="cursor:pointer;margin:0" title="${attr(t('ui36_text_222'))}"><i class="ti ti-file-upload"></i> ${t('fix_import_list')}
          <input type="file" accept=".xlsx,.xls" style="display:none" onchange="importarListaJugadores(this)">
        </label>
        <button class="btn btn-sm" onclick="abrirAgregarJugadores()"><i class="ti ti-users"></i> ${t('aj_open_btn')}</button>
        <button class="btn btn-sm" type="button" onclick="SohailDuplicates.show()"><i class="ti ti-user-search" aria-hidden="true"></i> ${SohailDuplicates.label('button')}</button> <button type="button" class="btn btn-sm" onclick="SohailIdentity.historical()"><i class="ti ti-link"></i> ${LANG==='en'?'Link historical players':'Vincular jugadores históricos'}</button>
      </div>
    </div>`;
    h += `<div class="form-row" style="grid-template-columns:1fr 1fr 1fr auto;align-items:end">`;
    h += `<div class="form-group"><label>${t('first_name')}</label><input id="ap-nom" placeholder="${t('first_name')}"></div>`;
    h += `<div class="form-group"><label>${t('last_name')}</label><input id="ap-ape" placeholder="${t('last_name')}"></div>`;
    h += `<div class="form-group"><label>${t('group')}</label><select id="ap-grp"><option value="0">${t('cl_sin_grupo')}</option>${grps.map((_,k)=>`<option value="${k+1}">${groupName(k+1)}</option>`).join('')}</select></div>`;
    h += `<div class="form-group"><button class="btn btn-primary" onclick="addPlayerUI()"><i class="ti ti-user-plus"></i> ${t('add_btn')}</button></div>`;
    h += `</div></div>`;

    h += `<div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:.5rem">
        <div class="section-lbl" style="margin:0">${t('player_mgmt')}</div>
        <div class="gap-sm">
          <button class="btn btn-sm" onclick="renderPerfil()"><i class="ti ti-refresh"></i> ${t('refresh_list')}</button>
          <button class="btn btn-sm" type="button" onclick="SohailDuplicates.show()"><i class="ti ti-user-search" aria-hidden="true"></i> ${SohailDuplicates.label('button')}</button> <button type="button" class="btn btn-sm" onclick="SohailIdentity.historical()"><i class="ti ti-link"></i> ${LANG==='en'?'Link historical players':'Vincular jugadores históricos'}</button>
        </div>
      </div>
      <p class="legend-txt" style="margin-top:0">${t('player_mgmt_hint')}</p>
      ${(currentUser&&currentUser.role==='superadmin')?`<div class="gap-sm mt-sm" style="flex-wrap:wrap;margin-bottom:.75rem">
        <button class="btn btn-sm" onclick="descargarPlantillaImport()"><i class="ti ti-file-download"></i> ${t('fix_template')}</button>
        <label class="btn btn-sm" style="cursor:pointer"><i class="ti ti-file-upload"></i> ${t('fix_import_players')}
          <input type="file" accept=".xlsx,.xls" style="display:none" onchange="importarJugadoresExcel(this)">
        </label>
        <button class="btn btn-sm btn-danger" onclick="limpiarJugadoresUI()"><i class="ti ti-eraser"></i> ${t('fix_clear_players')}</button>
      </div>`:''}
      ${esAdmin(currentUser) ? `<div style="border:1.5px solid var(--border2);border-radius:10px;padding:.65rem .8rem;margin-bottom:.75rem;background:var(--surface)">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--text2);margin-bottom:.5rem"><i class="ti ti-shield-check"></i> ${t('admins_section')}</div>
        <p class="legend-txt" style="margin:0 0 .5rem">${t('admins_hint')}</p>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          <span class="badge" style="background:var(--pri);color:#fff">${t('org_label')}</span>
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
    if(window.SohailSecurity)h+=SohailSecurity.cardHTML();
    document.getElementById('view-perfil').innerHTML = h; guideHelpButton(document.getElementById('view-perfil')); if(window.SohailUI)SohailUI.organizeProfile(); try{ if(typeof passkeySoportada==='function'&&passkeySoportada()){ const pc=document.getElementById('pk-card'); if(pc){pc.style.display=''; if(typeof refrescarListaPasskeys==='function') refrescarListaPasskeys();} } }catch(_){}
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
    h += `<div class="form-row"><div class="form-group"><label for="pw-old">${t('current_pass')}</label><input type="password" id="pw-old"></div>`;
    h += `<div class="form-group"><label for="pw-new">${t('new_pass')}</label><input type="password" id="pw-new" autocomplete="new-password"></div></div>`;
    h += `<div class="form-row"><div class="form-group"><label for="pw-new2">${t('repeat_pass')}</label><input type="password" id="pw-new2"></div>`;
    h += `<div class="form-group" style="align-self:end"><button class="btn btn-accent" onclick="changePw()"><i class="ti ti-lock"></i> ${t('save_pass')}</button></div></div></div>`;
    h += `<div class="card"><div class="section-lbl">${t('my_history')}</div>${playerHistoryHTML(u.name)}</div>`;
    if(window.SohailSecurity)h+=SohailSecurity.cardHTML();
    document.getElementById('view-perfil').innerHTML = h; guideHelpButton(document.getElementById('view-perfil')); if(window.SohailUI)SohailUI.organizeProfile(); try{ if(typeof passkeySoportada==='function'&&passkeySoportada()){ const pc=document.getElementById('pk-card'); if(pc){pc.style.display=''; if(typeof refrescarListaPasskeys==='function') refrescarListaPasskeys();} } }catch(_){}
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
  // Orden dentro de cada bucket: puramente alfabético en los 3 — el número
  // de grupo ya NO determina el orden de activosConGrupo (antes se ordenaba
  // primero por grupo asc y recién dentro del grupo por nombre); el badge
  // de grupo se sigue mostrando en la tarjeta, solo cambia el orden de la lista.
  // Localización 'es' para que las tildes ordenen bien (Ávila antes que Bar).
  const _cmpNombre = (a,b) => (a.name||'').localeCompare(b.name||'', 'es');
  activosSinGrupo.sort(_cmpNombre);
  activosConGrupo.sort(_cmpNombre);
  inactivos.sort(_cmpNombre);

  // Renderea una tarjeta de jugador. Extraído para no duplicar el HTML masivo.
  const renderOne = (p) => {
    const loc = findLoc(p.name, activeN);
    const curG = loc ? loc.g : '';
    const c = getActive();
    const gOpts = (c && c.groups) ? c.groups.map((_,k) => `<option value="${k+1}" ${curG===k+1?'selected':''}>${groupName(k+1)}</option>`).join('') : '';
    const isInactive = !!(p.inactive);
    const sinGrupoBadge = (!loc && !isInactive) ? (" <span style=\"font-size:10px;background:var(--warnBg,#fef3c7);color:var(--warnT,#854d0e);border-radius:4px;padding:1px 5px;font-weight:700\">"+t('ui36_text_209')+"</span>") : '';
    // Punto verde/rojo: rojo si sigue con una contraseña pública conocida
    // (la default "tenis", o "admin123" que en algún momento quedó pública),
    // verde si ya la cambió por una propia. Se recalcula en cada render a
    // partir de p.pass, así que un reset de contraseña (que vuelve a dejar
    // el hash en HASHES_PASS_DEFAULT) se refleja solo con volver a pintar
    // la lista — no hace falta ningún estado aparte.
    const esDefault = tienePasswordDefault(p);
    const pwDot = ` <span title="${esDefault?(""+t('ui36_text_223')+""):(""+t('ui36_text_224')+"")}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esDefault?'#e5484d':'#2f9e44'};flex-shrink:0"></span>`;
    return `<div class="ge-group" style="margin-bottom:.5rem;${isInactive?'opacity:.6':''}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="ge-gtitle">${pwDot} ${p.name}${loc ? ` <span class="badge badge-tag">${groupName(loc.g)}</span>` : ''}${sinGrupoBadge}${p.injured?` <span class="badge badge-warn">${LANG==='en'?'Injured':'Lesionado'}</span>`:''}${isInactive?(" <span style=\"font-size:10px;background:#e55;color:#fff;border-radius:4px;padding:1px 5px;font-weight:700\">"+t('ui36_text_166')+"</span>"):''}</div>
        <button class="btn btn-sm" onclick="togglePlayerEdit('${jsq(p.name)}')"><i class="ti ti-edit"></i> ${t('edit')}</button>
      </div>
      ${p.historialId?`<div class="dup-help">${LANG==='en'?'Unified sporting profile':'Ficha deportiva unificada'}: ${escPast(p.historialNombre||p.name)} <button type="button" class="btn btn-sm" onclick="SohailIdentity.profile('${escJsAttr(p.name)}')">${LANG==='en'?'View retained information':'Ver información conservada'}</button></div>`:''}
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
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--text2);margin-bottom:.55rem"><i class="ti ti-user"></i> ${t('ui36_text_204')}</div>
        <div class="form-row">
          <div class="form-group"><label>${t('ui36_text_205')}</label><input type="text" id="pe-nombre-${attr(p.name)}" value="${attr(p.nombre!=null?p.nombre:_splitNom(p.name).nombre)}"></div>
          <div class="form-group"><label>${t('ui36_text_206')}</label><input type="text" id="pe-apellido-${attr(p.name)}" value="${attr(p.apellido!=null?p.apellido:_splitNom(p.name).apellido)}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Email</label><input type="email" id="pe-email-${attr(p.name)}" value="${attr(p.email||'')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${t('ui36_text_207')}</label><input type="tel" id="pe-tel-${attr(p.name)}" value="${attr(p.tel||'')}"></div>
          <div class="form-group"><label>${t('ui36_text_208')}</label><select id="pe-grp-${attr(p.name)}"><option value="">${t('ui36_text_209')}</option>${gOpts}</select></div>
        </div>
        <div style="text-align:right;margin-top:.5rem">
          <button class="btn btn-success btn-sm" onclick="savePlayerAdmin('${jsq(p.name)}')"><i class="ti ti-device-floppy"></i> ${t('ui36_text_210')}</button>
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
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--text2);margin-bottom:.55rem"><i class="ti ti-lock"></i> ${t('ui36_text_211')}</div>
        <div class="form-group">
          <label>${t('ui36_text_212')}</label>
          <div style="display:flex;gap:6px">
            <input type="password" maxlength="128" id="pe-pass-${attr(p.name)}" placeholder="${attr(t('ui36_text_213'))}" autocomplete="new-password" style="flex:1">
            <button class="btn btn-sm" style="white-space:nowrap" onclick="setPlayerPwd('${jsq(p.name)}')"><i class="ti ti-key"></i> ${t('ui36_text_214')}</button>
          </div>
        </div>
        <p class="legend-txt">${t('p2_temporary')}</p>
        <label class="p2-revoke-keys"><input type="checkbox" id="pe-revoke-keys-${attr(p.name)}"><span>${t('p2_revoke_keys')}</span></label>
        <div style="margin-top:.55rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--text2)">${t('ui36_text_215')}</span>
          <button class="btn btn-sm" onclick="resetPwd('${jsq(p.name)}')"><i class="ti ti-refresh"></i> ${t('ui36_text_216')}</button>
        </div>
        </div>
        <div class="pe-danger-box" style="border:1.5px solid #e9b8b8;border-radius:10px;padding:.65rem .8rem;background:#fdf5f5">
        <div class="pe-danger-title" style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#b91c1c;margin-bottom:.55rem"><i class="ti ti-alert-triangle"></i> ${t('ui36_text_217')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-sm" style="${isInactive?'background:var(--success)':'background:#f59e0b'};color:#fff" onclick="toggleInactive('${jsq(p.name)}')"><i class="ti ti-${isInactive?'user-check':'user-off'}"></i> ${isInactive?(""+t('ui36_text_218')+""):(""+t('ui36_text_219')+"")}</button>
          <button class="btn btn-danger btn-sm" onclick="deletePlayerAdmin('${jsq(p.name)}')"><i class="ti ti-trash"></i> ${t('ui36_text_220')}</button>
        </div>
        </div>
      </div>`;
}
function filterPlayerList(){const f=document.getElementById('player-search').value;/* Mismo criterio que renderPerfil: se filtra por CLAVE. Si filtrara por rol,
   un jugador ascendido desaparecería apenas escribís en el buscador. */const players=Object.entries(USERS).filter(([k,u])=>u&&k!=='admin'&&k!=='superadmin').map(([k,u])=>u).sort((a,b)=>(a.name||'').localeCompare(b.name||'','es'));document.getElementById('player-list').innerHTML=renderPlayerList(players,f);}
// Repinta SOLO la lista de jugadores (no todo el perfil): se usa después de
// resetear o cambiar una contraseña, para que el punto verde/rojo se
// actualice al instante sin cerrar de paso la tarjeta editable que el admin
// tenía abierta (renderPerfil() completo reconstruye todo el HTML y esa
// tarjeta vuelve a su estado inicial cerrado).
function refreshPlayerList(){
  const cont=document.getElementById('player-list');
  if(!cont) return;
  const f=document.getElementById('player-search')?.value || '';
  const players=Object.entries(USERS).filter(([k,u])=>u&&k!=='admin'&&k!=='superadmin').map(([k,u])=>u).sort((a,b)=>(a.name||'').localeCompare(b.name||'','es'));
  cont.innerHTML=renderPlayerList(players,f);
}
function togglePlayerEdit(name){const el=document.getElementById('pe-'+name);if(el)el.style.display=el.style.display==='none'?'block':'none';}

// Renombra un jugador en TODO el estado (liga + playoffs). Un solo lugar para no olvidar ninguna referencia.
function renamePlayerEverywhere(oldName,newName){
  if(!oldName||!newName||oldName===newName)return;
  // USERS (la clave ES el nombre) — conserva pass, email, tel, rol, inactive, etc.
  if(USERS[oldName]){USERS[newName]={...USERS[oldName],name:newName};delete USERS[oldName];}
  // Referencias deportivas por nombre: nunca perder bonus ni rating al renombrar.
  [RATING_SEEDS,RATING_OVERRIDES].forEach(map=>{if(map&&Object.prototype.hasOwnProperty.call(map,oldName)){map[newName]=map[oldName];delete map[oldName];}});
  Object.values(AJUSTES_PUNTOS||{}).forEach(c=>Object.values(c||{}).forEach(g=>{if(g&&Object.prototype.hasOwnProperty.call(g,oldName)){g[newName]=g[oldName];delete g[oldName];}}));
  if(Array.isArray(JOIN_REQUESTS))JOIN_REQUESTS.forEach(r=>{if(r.nombre===oldName)r.nombre=newName;});
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
    if(m.retiroDe===oldName)m.retiroDe=newName;
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

async function savePlayerAdmin(oldName){
  if(esCuentaSistema(oldName)){toast((""+t('ui36_text_239')+""));return;}
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
  if(newName!==oldName&&USERS[newName]){toast(t('name_exists'));return;}
  const loc=findLoc(oldName,activeN);
  if(loc&&!isNaN(newGrp)&&loc.g!==newGrp){movePlayer(oldName,loc.g,newGrp);}
  else if(!loc&&!isNaN(newGrp)){addPlayerToCycle(oldName,newGrp);}
  u.email=email;u.tel=tel;u.nombre=nombre;u.apellido=apellido;
  if(newName!==oldName){
    if(USERS[newName]){toast('Ya existe un jugador llamado "'+newName+'". Elige otro nombre.');renderPerfil();return;}
    renamePlayerEverywhere(oldName,newName);
  }
  if(!await _criticalSave()){toast(t('fix_save_failed'));return;}
  renderPerfil();toast(tf('save_done',{name:newName}));
}

async function deletePlayerAdmin(name){
  if(esCuentaSistema(name)){toast('No se puede eliminar al administrador.');return;}
  if(!confirm(`${t('ui36_text_240')}${name}${t('ui36_text_241')}`))return;
  delete USERS[name];
  const idx=ALLNAMES.indexOf(name);
  if(idx>=0)ALLNAMES.splice(idx,1);
  cycles.forEach(c=>{if(!c.groups)return;c.groups.forEach(g=>{const pi=(g.players||[]).indexOf(name);if(pi>=0)g.players.splice(pi,1);});});
  if(!await _criticalSave()){toast(t('fix_save_failed'));return;}
  renderPerfil();toast(tf('fix_player_deleted',{n:name}));
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

async function toggleAdminRole(name){
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
  if(!await _criticalSave()){toast(t('fix_save_failed'));return;}
  toast(t('role_done').replace('{n}',name));
  renderPerfil();
}

async function _flushBeforeCredentialChange(){
  if(_saveConflict)return false;
  if(_serialize()!==_lastSaved)return await _criticalSave();
  return true;
}
async function _refreshAfterCredentialChange(d){
  if(d.requiresLogin){await doLogout();if(window.SohailSecurity)SohailSecurity.loginAgain();return false;}
  if(d.token){_token=d.token;window.SohailSession?.enable();}
  await loadState();
  if(currentUser){const k=currentUser.key||currentUser.name;const fresh=USERS[k];if(fresh){currentUser=fresh;currentUser.key=k;}}
  if(typeof refreshAll==='function')refreshAll();
  return true;
}
async function resetPwd(name){
  if(!USERS[name]||esCuentaSistema(name))return;
  if(!confirm(tf('reset_confirm',{n:name})))return;
  if(!await _flushBeforeCredentialChange()){toast(t('fix_pending_first'));return;}
  try{
    const r=await fetch('/api/password',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({target:name,newPass:'tenis',revokePasskeys:document.getElementById('pe-revoke-keys-'+name)?.checked===true,ligaId:_ligaActual||undefined})});
    const d=await r.json();if(!r.ok){toast(apiError(d));return;}
    await _refreshAfterCredentialChange(d);
    toast(tf('reset_ok',{n:name}));refreshPlayerList();
  }catch(_){toast(t('reset_err'));}
}
async function setPlayerPwd(name){
  if(!USERS[name]||esCuentaSistema(name))return;
  const inp=document.getElementById('pe-pass-'+name),pw=inp?inp.value:'';
  if(pw!=='tenis'&&([...pw].length<6||pw.length>128)){toast(t('pass_short'));return;}
  // Nunca mostrar ni registrar la contraseña en una confirmación.
  if(!confirm(tf('fix_change_password_for',{n:name})))return;
  if(!await _flushBeforeCredentialChange()){toast(t('fix_pending_first'));return;}
  try{
    const rr=await fetch('/api/password',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({target:name,newPass:pw,revokePasskeys:document.getElementById('pe-revoke-keys-'+name)?.checked===true,ligaId:_ligaActual||undefined})});
    const d=await rr.json();if(!rr.ok){toast(apiError(d));return;}
    if(inp)inp.value='';await _refreshAfterCredentialChange(d);toast(t('p2_reset_done'));refreshPlayerList();
  }catch(_){toast(t('fix_network_pending'));}
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
    toast(name+(sacado?' marcado como inactivo y quitado del ciclo actual.':(""+t('ui36_text_225')+"")));
  }else{
    toast(name+(""+t('ui36_text_226')+""));
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
// requiere contacto humano y una decisión activa. No es por sí solo una
// garantía superior al correo: el administrador debe verificar quién pide el reset.
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
// Traducir EN EL MISMO DOM: no se borran contraseñas, checkbox ni validaciones.
function updateForcedPasswordLanguage(){
 const ov=document.getElementById('_pwforce');if(!ov)return;
 const panel=ov.firstElementChild;if(panel)panel.lang=LANG;
 ov.querySelectorAll('[data-pwf-i18n]').forEach(e=>e.textContent=t(e.dataset.pwfI18n));
 ov.querySelectorAll('[data-pwf-placeholder]').forEach(e=>e.placeholder=t(e.dataset.pwfPlaceholder));
 updateDialogLanguageSwitchers(ov);
 const save=ov.querySelector('#_pwfb');
 if(save)save.textContent=t(ov.dataset.saving==='true'?'pwf_saving':'pwf_save');
 if(typeof ov._translateError==='function')ov._translateError();
}

function forcePwChange(oldPass){
  if(document.getElementById('_pwforce'))return;
  document.getElementById('sohail-guide')?.remove();
  const viaPasskey = (oldPass === null || oldPass === undefined);
  const ov=document.createElement('div');
  ov.id='_pwforce';
  ov.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.92);display:flex;align-items:center;justify-content:center;padding:16px';
  // La elección de Face ID no cambia al traducir el diálogo.
  const soporta = (typeof passkeySoportada==='function' && passkeySoportada()) && !viaPasskey;
  const pkCheck = soporta
    ? '<label style="display:flex;gap:8px;align-items:flex-start;margin:2px 0 4px;font-size:12.5px;line-height:1.4;color:var(--text2,#64748b);cursor:pointer">'+
        '<input id="_pwfpk" type="checkbox" checked style="margin-top:2px;flex-shrink:0">'+
        '<span data-pwf-i18n="pwf_pk_offer">'+t('pwf_pk_offer')+'</span>'+
      '</label>'+
      '<p id="_pwfpkhint" data-pwf-i18n="pwf_pk_offer_after" style="margin:0 0 12px 26px;font-size:11.5px;line-height:1.35;color:var(--text2,#64748b);opacity:.85">'+t('pwf_pk_offer_after')+'</p>'
    : '';
  ov.innerHTML='<div class="pwforce-dialog" style="background:var(--surface,#fff);border-radius:14px;padding:22px;max-width:380px;width:100%;box-shadow:0 18px 50px rgba(0,0,0,.4)">'+
    '<h3 data-pwf-i18n="pwf_title" style="margin:0 0 6px;font-size:17px">'+t('pwf_title')+'</h3>'+
    '<p id="pwforce-why" data-pwf-i18n="pwf_why" style="margin:0 0 14px;font-size:13px;line-height:1.45;color:var(--text2,#64748b)">'+t('pwf_why')+'</p>'+
    '<label class="sr-only" for="_pwf1" data-pwf-i18n="pwf_new">'+t('pwf_new')+'</label><input id="_pwf1" type="password" maxlength="128" autocomplete="new-password" data-pwf-placeholder="pwf_new" placeholder="'+t('pwf_new')+'" style="width:100%;padding:9px;margin-bottom:8px;border:1px solid var(--border,#e2e8f0);border-radius:8px;font-size:14px">'+
    '<label class="sr-only" for="_pwf2" data-pwf-i18n="pwf_rep">'+t('pwf_rep')+'</label><input id="_pwf2" type="password" maxlength="128" autocomplete="new-password" data-pwf-placeholder="pwf_rep" placeholder="'+t('pwf_rep')+'" style="width:100%;padding:9px;margin-bottom:10px;border:1px solid var(--border,#e2e8f0);border-radius:8px;font-size:14px">'+
    pkCheck +
    '<div id="_pwfe" role="alert" style="display:none;font-size:12px;color:var(--danger);margin-bottom:8px"></div>'+
    '<button id="_pwfb" type="button" class="btn btn-primary" style="width:100%;justify-content:center;min-height:44px">'+t('pwf_save')+'</button>'+
  '</div>';
  const panel=ov.firstElementChild;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','pwforce-title');panel.setAttribute('aria-describedby','pwforce-why');panel.querySelector('h3').id='pwforce-title';
  panel.prepend(createDialogLanguageSwitcher('pwforce-language'));
  ov.addEventListener('keydown',e=>{if(e.key==='Tab')trapDialogFocus(e,ov);});
  const quit=document.createElement('button');quit.type='button';quit.className='btn';quit.style.marginTop='12px';quit.dataset.pwfI18n='exit';quit.textContent=t('exit');quit.onclick=()=>doLogout();panel.append(quit);
  document.body.appendChild(ov);
  if(soporta){
    const chk = ov.querySelector('#_pwfpk');
    const hintEl = ov.querySelector('#_pwfpkhint');
    if(chk && hintEl){
      chk.addEventListener('change', () => { hintEl.style.display = chk.checked ? '' : 'none'; });
    }
  }
  // Conservar la CLAVE del error (o respuesta de API), no el texto traducido.
  // No se guardan contraseñas en atributos, logs ni localStorage.
  let errorKey=null,errorResponse=null;
  ov._translateError=()=>{
    const e=ov.querySelector('#_pwfe');
    if(!errorKey&&!errorResponse){e.textContent='';e.style.display='none';return;}
    e.textContent=errorResponse?apiError(errorResponse):t(errorKey);e.style.display='block';
  };
  const err=(key,response)=>{errorKey=key;errorResponse=response||null;ov._translateError();};
  const busy=value=>{
    ov.dataset.saving=String(value);panel.setAttribute('aria-busy',String(value));
    ov.querySelectorAll('button,input').forEach(e=>e.disabled=value);
    updateForcedPasswordLanguage();
  };
  ov.querySelector('#_pwfb').onclick=async function(){
    if(ov.dataset.saving==='true')return;
    const a=ov.querySelector('#_pwf1').value, b=ov.querySelector('#_pwf2').value;
    if(!a||[...a].length<6||a.length>128) return err('pwf_short');
    // No comparar contra oldPass si vinimos por Face ID (no la tenemos).
    if(!viaPasskey && a===oldPass) return err('pwf_same');
    if(a!==b) return err('pwf_nomatch');
    errorKey=null;errorResponse=null;busy(true);
    try{
      // La sesión temporal autoriza únicamente elegir una contraseña personal.
      const payload = { newPass: a, ligaId: _ligaActual || undefined };
      if(!viaPasskey) payload.oldPass = oldPass;
      const r=await fetch('/api/password',{method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},
        body:JSON.stringify(payload)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok){busy(false);return err(null,d);}
      if(d.token)_token=d.token;
      const wantPk = soporta && ov.querySelector('#_pwfpk') && ov.querySelector('#_pwfpk').checked;
      ov.remove();
      if(!await _refreshAfterCredentialChange(d))return;
      if(typeof toast==='function')toast(t('pass_changed')||'OK');
      if(wantPk && typeof activarPasskey==='function'){
        try{await activarPasskey();}catch(_){}
      }
      maybeShowTutorial(false);
    }catch(e){busy(false);err('pwf_err');}
  };
  updateForcedPasswordLanguage();
  ov.querySelector('#_pwf1').focus();
}

async function changePw(){
  const o=document.getElementById('pw-old').value,n=document.getElementById('pw-new').value,n2=document.getElementById('pw-new2').value,a=document.getElementById('pw-alert');
  function al(m,cl){a.className='alert alert-'+cl;a.textContent=m;}
  if(!n||[...n].length<6||n.length>128){al(t('pass_short'),'err');return;}
  if(n!==n2){al(t('pass_no_match'),'err');return;}
  // La contraseña anterior la verifica el servidor.
  if(!await _flushBeforeCredentialChange()){al(t('fix_pending_first'),'err');return;}
  try{
    const r=await fetch('/api/password',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},
      body:JSON.stringify({oldPass:o,newPass:n,ligaId:_ligaActual||undefined})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok){al(apiError(d),'err');return;}
    ['pw-old','pw-new','pw-new2'].forEach(id=>document.getElementById(id)&&(document.getElementById(id).value=''));
    if(!await _refreshAfterCredentialChange(d))return;
  }catch(e){al(t('err_no_server'),'err');return;}
  al(t('pass_ok'),'ok');
  ['pw-old','pw-new','pw-new2'].forEach(id=>document.getElementById(id)&&(document.getElementById(id).value=''));
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
    <div class="section-lbl"><i class="ti ti-trophy"></i> ${t('ml_title')}</div>
    <p class="legend-txt" style="margin-top:.15rem;margin-bottom:.6rem">${t('ml_desc')}</p>
    <div id="mis-ligas-body" class="liga-tabs"><div class="legend-txt">${t('past_loading')}</div></div>
  </div>`;
}

let _misLigasPaintRequest=0;
async function cargarMisLigasHeader(){
  const body=document.getElementById('mis-ligas-body');if(!body)return;
  const key=_saveSessionKey(),liga=_ligaActual,request=++_misLigasPaintRequest;
  const current=()=>body.isConnected&&body===document.getElementById('mis-ligas-body')&&key===_saveSessionKey()&&liga===_ligaActual&&request===_misLigasPaintRequest;
  const message=text=>{body.replaceChildren();const p=document.createElement('p');p.className='legend-txt';p.textContent=text;body.append(p);};
  if(!_token||!liga){message(t('ml_no_league_id'));return;}
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({accion:'misLigas',ligaId:liga})});
    const d=await r.json().catch(()=>({}));if(!current())return;
    if(!r.ok){message(d.error||t('ml_load_err'));return;}
    const ligas=Array.isArray(d.ligas)?d.ligas:[];
    if(!ligas.length){message(t('ml_no_leagues'));return;}
    body.replaceChildren();
    for(const l of ligas){
      const here=!!l.esLigaActual,available=!!l.participo,waiting=l.solicitudEstado==='pending';
      const mode=here?'here':available?'ok':waiting?'pending':'ask';
      const row=document.createElement(here||waiting?'div':'button');row.className='liga-tab liga-tab-'+mode;
      if(row.tagName==='BUTTON')row.type='button';if(here)row.setAttribute('aria-current','true');
      const icon=document.createElement('i');icon.className='ti ti-'+(here?'map-pin':available?'login-2':waiting?'clock':'send');icon.setAttribute('aria-hidden','true');
      const name=document.createElement('span');name.className='liga-tab-name';name.textContent=String(l.nombre||'');
      const label=here?'ml_here':available?'ml_ok':waiting?'ml_pending':l.solicitudEstado==='rejected'?'ml_retry':'ml_ask';
      const cta=document.createElement('span');cta.className='liga-tab-cta';cta.textContent=t(label);
      row.append(icon,name,cta);body.append(row);
      if(row.tagName==='BUTTON')row.addEventListener('click',()=>{
        if(!body.isConnected||body!==document.getElementById('mis-ligas-body')||key!==_saveSessionKey()||liga!==_ligaActual)return;
        if(available)entrarAOtraLiga(l.id,l.nombre);else solicitarAccesoUI(l.id,l.nombre);
      });
    }
  }catch(_){if(current())message(t('ml_conn_err'));}
}

// Pide acceso a otra liga. El backend valida que no esté ya participando ahí
// y que no tenga otra solicitud pendiente para esa misma liga.
async function solicitarAccesoUI(ligaId, nombre){
  if(!confirm(t('ml_ask_confirm').replace('{n}', nombre))) return;
  try{
    const r = await fetch('/api/liga', {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer '+_token},
      body: JSON.stringify({ accion:'solicitarAcceso', ligaId:_ligaActual, ligaDestino:ligaId })
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok){ toast(d.error || t('ml_ask_err')); return; }
    toast(t('ml_ask_sent').replace('{n}', nombre));
    cargarMisLigasHeader();
  }catch(e){ toast(t('ml_conn_err')); }
}

// El jugador ya participa en la otra liga (fue aceptado en algún momento):
// cambiamos de liga en caliente, mismo mecanismo que el selector de liga del
// header (cambiarLigaDesdeMenu, en core-estado.js) — /api/state?elegir=1
// revalida la pertenencia del lado del servidor e hidrata el estado nuevo
// sin pasar por el login. Antes esto hacía doLogout() + reabría la pantalla
// de login para que el jugador tipeara usuario y contraseña de nuevo: una
// interrupción innecesaria, ya que la sesión (el token) sigue siendo
// perfectamente válida para la liga destino — el jugador solo necesitaba
// cambiar de contexto, no volver a autenticarse.
// No confirma acá: cambiarLigaDesdeMenu() ya pide confirmación con el mismo
// texto (t('ml_switch_confirm')) — un segundo confirm() encima sería
// redundante.
async function entrarAOtraLiga(ligaId, nombre){
  if(typeof cambiarLigaDesdeMenu === 'function'){
    await cambiarLigaDesdeMenu(ligaId);
  }
}

// ==================== IMPORTAR / EXPORTAR LISTA DE JUGADORES ====================
// Funciones para que el admin pueda descargar la lista actual de jugadores
// como Excel, editarla afuera (sumar filas, cambiar grupos, etc.) y volver
// a subirla en batch. Diferente y complementario de las herramientas
// existentes ("Descargar plantilla" / "Importar jugadores (Excel)" / "Limpiar
// jugadores") que viven en Gestión de jugadores y son SOLO para superadmin:
// estas están disponibles para cualquier admin y viven al lado del botón
// "Agregar de ligas anteriores" — mismo formato (Nombre / Apellido / Grupo)
// que el formulario manual de arriba, con la particularidad de que "Grupo"
// puede quedar VACÍO — en ese caso el jugador se da de alta en el catálogo
// (USERS/ALLNAMES) sin ubicarlo en ningún grupo del ciclo activo, tal como
// si el admin luego lo asignara a mano desde Gestión de jugadores.
//
// Formato Excel: 3 columnas — Nombre (primera palabra), Apellido (el resto),
// Grupo (número entero 1..N, o vacío). El "nombre completo" internamente es
// (Nombre + " " + Apellido).trim() — misma convención que addPlayerUI y el
// resto del proyecto.
function exportarListaJugadores(){
  if(typeof XLSX === 'undefined'){ toast('No se pudo cargar el módulo de Excel. Recargá la página.'); return; }
  // Fuente: todos los nombres del catálogo (ALLNAMES) + los USERS conocidos,
  // excepto las cuentas de sistema ('admin' y 'superadmin'). Se toma el
  // UNION para no perder a nadie por si algún alta antigua dejó a alguien
  // solo en uno de los dos lados.
  const nombresSet = new Set();
  (ALLNAMES||[]).forEach(n=>{ if(n) nombresSet.add(n); });
  Object.keys(USERS||{}).forEach(k=>{ if(k && k!=='admin' && k!=='superadmin' && USERS[k]) nombresSet.add(USERS[k].name || k); });
  const nombres = Array.from(nombresSet).sort((a,b)=>a.localeCompare(b,'es'));
  const filas = nombres.map(full=>{
    const partes = String(full).trim().split(/\s+/);
    const nom = partes[0] || '';
    const ape = partes.slice(1).join(' ');
    const loc = (typeof findLoc==='function') ? findLoc(full, activeN) : null;
    return { Nombre: nom, Apellido: ape, Grupo: loc ? loc.g : '' };
  });
  const ws = XLSX.utils.json_to_sheet(filas, { header: ['Nombre','Apellido','Grupo'] });
  // Un ancho razonable para las 3 columnas para que se lean sin ajustar a mano.
  ws['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Jugadores');
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth()+1).padStart(2,'0');
  const dd = String(hoy.getDate()).padStart(2,'0');
  XLSX.writeFile(wb, 'jugadores_'+yyyy+'-'+mm+'-'+dd+'.xlsx');
  toast('Lista de jugadores exportada.');
}

// Import: lee el archivo, parsea con XLSX, valida cabeceras esperadas, e
// itera fila por fila reutilizando el patrón de addPlayerUI (chequeo de
// existencia en el ciclo activo + alta en USERS/ALLNAMES + optionalmente
// addPlayerToCycle si viene grupo). Al final, un único persist(true) para
// no golpear /api/save por cada jugador — importar 30 filas hace 1 sola
// request al server, no 30.
async function importarListaJugadores(inputEl){
  if(!esAdmin(currentUser))return;
  if(!window.SohailDuplicates){toast(LANG==='en'?'Reload before importing.':'Recargá antes de importar.');return;}
  if(!inputEl || !inputEl.files || !inputEl.files[0]) return;
  if(typeof XLSX === 'undefined'){ toast('No se pudo cargar el módulo de Excel. Recargá la página.'); return; }
  const file = inputEl.files[0];
  if(!SohailDuplicates.canReadFile(file)){toast(SohailDuplicates.label('tooMany'));inputEl.value='';return;}
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if(!ws){ toast('El archivo no tiene ninguna hoja de cálculo.'); inputEl.value=''; return; }
    // defval:'' para que las celdas vacías vengan como cadena vacía en vez
    // de undefined — evita chequeos extra en el loop de abajo.
    const filas = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if(!filas.length){ toast('El archivo está vacío.'); inputEl.value=''; return; }
    // Detectar las columnas de forma tolerante: acepta cabeceras en ES o EN,
    // con o sin mayúscula/tildes, para que un Excel copiado a mano no se
    // rechace por diferencias cosméticas.
    const norm = s => String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const primerFila = filas[0];
    const claves = Object.keys(primerFila);
    const claveNom = claves.find(k=>{ const n=norm(k); return n==='nombre' || n==='first name' || n==='name'; });
    const claveApe = claves.find(k=>{ const n=norm(k); return n==='apellido' || n==='last name' || n==='surname'; });
    const claveGrp = claves.find(k=>{ const n=norm(k); return n==='grupo' || n==='group' || n==='g'; });
    if(!claveNom || !claveApe){
      toast('El archivo tiene que tener las columnas Nombre y Apellido (Grupo opcional).');
      inputEl.value='';
      return;
    }
    // Confirmar antes de aplicar (import puede pisar/duplicar): mostrar
    // cuántas filas se leyeron y darle una salida al admin si abrió el
    // archivo equivocado. En Sohail (~60 jugadores) esto tarda un segundo.
    // Suggestions are read-only. Nothing in USERS, groups or credentials changes
    // until the administrator has reviewed the rows and confirmed the import.
    if(filas.length>SohailDuplicates.LIMITS.rows){toast(SohailDuplicates.label('tooMany'));inputEl.value='';return;}
    const duplicateReview=await SohailDuplicates.reviewRows(filas.map((f,i)=>({
      name:(String(f[claveNom]||'').trim()+' '+String(f[claveApe]||'').trim()).trim(),
      group:claveGrp?f[claveGrp]:'',row:i+2
    })));
    if(!duplicateReview){inputEl.value='';return;}
    const allowedRows=new Set(duplicateReview.keepIndexes);
    const totalFilas = allowedRows.size;
    if(typeof confirmarModal === 'function'){
      const ok = await confirmarModal('Se van a procesar '+totalFilas+' filas del archivo. Los jugadores que ya estén en un grupo del ciclo activo se omiten (no se duplican). ¿Continuar?', { titulo: 'Importar jugadores', okTxt: 'Importar' });
      if(!ok){ inputEl.value=''; return; }
    } else if(!confirm('Se van a procesar '+totalFilas+' filas. Los jugadores que ya estén en un grupo del ciclo activo se omiten. ¿Continuar?')){
      inputEl.value=''; return;
    }
    if(!duplicateReview.isCurrent()){toast(SohailDuplicates.label('changed'));inputEl.value='';return;}
    // Total de grupos válidos en el ciclo activo — se usa para validar el
    // número que trae la columna Grupo. Fuera de rango se trata como "sin
    // grupo" (mismo destino que dejar la celda vacía).
    const nGrupos = (getActive() && getActive().groups) ? getActive().groups.length : 0;
    let sumConGrupo = 0, sumSinGrupo = 0, sumSaltados = 0, sumInvalidos = 0;
    const detalleErrores = [];
    filas.forEach((f, idx)=>{
      if(!allowedRows.has(idx))return;
      const nom = String(f[claveNom]||'').trim();
      const ape = String(f[claveApe]||'').trim();
      const full = (nom+' '+ape).trim();
      if(!full){ sumInvalidos++; detalleErrores.push('Fila '+(idx+2)+': sin nombre.'); return; }
      // Duplicado: si ya está en algún grupo de algún ciclo activo, saltar
      // como hace addPlayerUI. La comparación es exact-match por nombre
      // completo (no case-insensitive) — igual criterio que el resto.
      const yaEstaEnGrupo = cycles.some(c=>c.groups && c.groups.some(g=>(g.players||[]).includes(full)));
      if(yaEstaEnGrupo){ sumSaltados++; return; }
      // Preserve existing ungrouped profiles: a name-review choice must NEVER
      // drop jugadorId, credentials, contacts or roles. addPlayerToCycle only
      // creates USERS[full] when it is absent; no cross-league linking here.
      // Grupo: puede venir como número, como string numérico, o vacío.
      // Cualquier cosa que no sea un entero entre 1..nGrupos cae a "sin grupo".
      const raw = f[claveGrp];
      let gid = 0;
      if(raw !== '' && raw !== null && raw !== undefined){
        const n = parseInt(String(raw).trim(), 10);
        if(!isNaN(n) && n>=1 && n<=nGrupos) gid = n;
      }
      if(gid){
        addPlayerToCycle(full, gid);
        sumConGrupo++;
      } else {
        // Alta sin grupo: mismo efecto interno que addPlayerToCycle (registrar
        // en ALLNAMES + USERS) pero SIN empujarlo a ningún grupo del ciclo
        // activo. Sirve para dar de alta a alguien que se va a asignar
        // manualmente después desde Gestión de jugadores.
        if(ALLNAMES.indexOf(full)<0) ALLNAMES.push(full);
        if(!USERS[full]) USERS[full] = { role:'player', pass:null, name: full };
        sumSinGrupo++;
      }
    });
    inputEl.value = '';   // Permitir seleccionar el mismo archivo de nuevo
    if(sumConGrupo===0 && sumSinGrupo===0){
      let msg = 'No se agregó ningún jugador nuevo.';
      if(sumSaltados) msg += ' '+sumSaltados+' ya estaba(n) en el ciclo activo.';
      if(sumInvalidos) msg += ' '+sumInvalidos+' fila(s) sin nombre.';
      toast(msg);
      return;
    }
    let resumen = 'Se agregaron '+(sumConGrupo+sumSinGrupo)+' jugadores';
    const partes = [];
    if(sumConGrupo) partes.push(sumConGrupo+' con grupo');
    if(sumSinGrupo) partes.push(sumSinGrupo+' sin grupo');
    if(partes.length) resumen += ' ('+partes.join(', ')+')';
    if(sumSaltados) resumen += '. '+sumSaltados+' ya estaba(n) en el ciclo activo';
    if(sumInvalidos) resumen += '. '+sumInvalidos+' fila(s) sin nombre omitida(s)';
    resumen += '.';
    renderPerfil();
    toast(resumen);
    // Persistir primero, después refrescar la lista del login (initLogin lee
    // /api/users, que a su vez lee de la base — si initLogin corriera antes
    // que persist, no vería a los recién agregados).
    persist(true).then(()=>{ if(typeof initLogin==='function') initLogin(); });
  }catch(e){
    console.error('importarListaJugadores ERROR:', e);
    toast('No se pudo leer el archivo: '+(e && e.message ? e.message : 'formato inválido'));
    inputEl.value = '';
  }
}

/* v4.8 — selected injury absences. No medical details; no automatic walkovers. */
(function(global){
 'use strict';
 const copy={
 es:{title:'Lesiones',hint:'Marcá la disponibilidad actual y los cruces no jugados por lesión. Solo fase de grupos: no adjudica victorias ni puntos y no altera playoffs.',player:'Jugador',choose:'Elegí un jugador',cycle:'Ciclo',none:'Sin ciclo con grupo asignado',flag:'Lesionado actualmente',flagHelp:'Esta marca no bloquea el acceso, no da de baja al jugador ni modifica todos sus partidos. Quitarla no borra las ausencias anteriores.',opponents:'Cruces no jugados por lesión',empty:'Este jugador no tiene rivales disponibles en el ciclo seleccionado.',all:'Seleccionar disponibles',clear:'Quitar selección',savedRow:'Ausencia guardada',freeRow:'Sin resultado registrado',lockedRow:'Ya tiene un registro: no se reemplaza',own:'Tu propio partido: lo gestiona otro administrador',save:'Guardar lesión y cruces',saving:'Guardando…',saved:'Cambios de lesión guardados.',unchanged:'No había cambios para guardar.',summary:'Seleccionados: {n}. Se agregan {a} ausencias y se quitan {r}.',explain:'No se suman PJ, victorias, derrotas, games ni rating. Ambos quedan con 0 puntos por ese cruce y se registra como no jugado por lesión. Los puntos por posición del grupo mantienen sus reglas.',remove:'Desmarcar una ausencia guardada vuelve a dejar ese cruce sin resultado. No borra partidos disputados.',discard:'Hay cambios sin guardar. ¿Descartarlos para cambiar de jugador o ciclo?',confirm:'¿Guardar estos cambios?\n{summary}\nNo se asignarán victorias ni puntos por estas ausencias.',pending:'Primero guardá o resolvé los otros cambios pendientes de la liga.',reload:'No se confirmó el estado final. Recargá antes de volver a editar o reintentar.',reloadBtn:'Recargar datos',changed:'La liga o la sesión cambió. Volvé a abrir Lesiones.',closed:'La liga es de solo lectura.',marker:'Lesionado',noChange:'Sin cambios pendientes.',conflict:'Los datos cambiaron. Recargá antes de guardar.',unavailable:'No se pudo guardar. Revisá la conexión antes de reintentar.'},
 en:{title:'Injuries',hint:'Mark current availability and matches not played due to injury. Group stage only: no wins or points are awarded and playoffs are unchanged.',player:'Player',choose:'Choose a player',cycle:'Cycle',none:'No cycle with an assigned group',flag:'Currently injured',flagHelp:'This flag does not block sign-in, deactivate the player or change all their matches. Clearing it does not remove past absences.',opponents:'Matches not played due to injury',empty:'This player has no available opponents in the selected cycle.',all:'Select available',clear:'Clear selection',savedRow:'Absence saved',freeRow:'No result recorded',lockedRow:'Already recorded: will not be replaced',own:'Your own match: another administrator must manage it',save:'Save injury and matches',saving:'Saving…',saved:'Injury changes saved.',unchanged:'There were no changes to save.',summary:'Selected: {n}. Add {a} absences and remove {r}.',explain:'No matches played, wins, losses, games or rating are added. Both receive 0 points for this fixture and it is recorded as not played due to injury. Group position points keep their existing rules.',remove:'Clearing a saved absence leaves that fixture without a result again. Played matches are never deleted.',discard:'There are unsaved changes. Discard them to switch player or cycle?',confirm:'Save these changes?\n{summary}\nNo wins or points will be awarded for these absences.',pending:'Save or resolve the league’s other pending changes first.',reload:'The final state could not be confirmed. Reload before editing or retrying.',reloadBtn:'Reload data',changed:'The league or session changed. Reopen Injuries.',closed:'This league is read-only.',marker:'Injured',noChange:'No pending changes.',conflict:'The data changed. Reload before saving.',unavailable:'Could not save. Check the connection before retrying.'}
 };
 let draftMemory=null,injuryDialog=null,dialogSerial=0;
 const text=k=>copy[LANG==='en'?'en':'es'][k]||k;
 const format=(k,v)=>text(k).replace(/\{(\w+)\}/g,(_,x)=>String(v[x]??''));
 const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=value;return n;};
 const btn=(v,fn)=>{const b=el('button','btn',v);b.type='button';b.onclick=fn;return b;};
 const injury=m=>m?.np===true&&m.npReason==='injury'&&[0,1].includes(m.injurySide);
 const ctx=()=>String(_ligaActual)+'|'+_saveSessionKey();
 const available=()=>!!currentUser&&esAdmin(currentUser)&&!_ligaReadOnly;
 function choices(name,cycle){
  const c=cycles.find(c=>c.n===cycle),groups=(c?.groups||[]).map((g,i)=>g?.players?.includes(name)?i+1:0).filter(Boolean);
  if(groups.length!==1)return [];
  const g=groups[0];return c.groups[g-1].players.filter(n=>n!==name).sort((a,b)=>a.localeCompare(b,LANG==='en'?'en':'es')).map(n=>{
   const records=matches.filter(m=>!m.po&&m.cycle===cycle&&m.g===g&&[m.aName,m.bName].includes(name)&&[m.aName,m.bName].includes(n));
   const selected=records.length===1&&injury(records[0])&&[records[0].aName,records[0].bName][records[0].injurySide]===name;
   const own=name===currentUser?.name||n===currentUser?.name;
   return {name:n,selected,disabled:own||records.length>0&&!selected,reason:own?'own':selected?'savedRow':records.length?'lockedRow':'freeRow'};
  });
 }
 function createPanel(options={}){
  const panel=el('section','card inj-panel'),stamp=ctx(),remembered=options.fresh?null:draftMemory?.stamp===ctx()?draftMemory:null;
  const prefix=options.idPrefix||'inj';
  const translated=(tag,cls,key)=>{const n=el(tag,cls,text(key));n.dataset.injText=key;return n;};
  let name='',cycle=null,rows=[],baseSelected=new Set(),selected=new Set(),baseFlag=false,flag=false,version=_stateV,busy=false,uncertain=false;
  const head=translated('h2','section-lbl','title'),ps=el('select'),cs=el('select'),flagBox=el('input'),list=el('div','inj-list'),summary=el('p','inj-summary'),status=el('p','inj-status');
  head.id=prefix+'-title';ps.id=prefix+'-player';cs.id=prefix+'-cycle';flagBox.type='checkbox';flagBox.id=prefix+'-flag';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const selectLabel=(key,input)=>{const n=el('label','inj-field');n.append(translated('span','',key),input);return n;};
  ps.add(new Option(text('choose'),''));for(const n of ALLNAMES.filter(n=>USERS[n]&&!['admin','superadmin'].includes(n)).sort((a,b)=>a.localeCompare(b)))ps.add(new Option(n,n));
  const flagLabel=el('label','inj-flag');flagLabel.append(flagBox,translated('span','','flag'));
  const fieldset=el('fieldset','inj-opponents');fieldset.append(translated('legend','','opponents'));
  const tools=el('div','gap-sm');tools.append(btn(text('all'),()=>{for(const r of rows)if(!r.disabled)selected.add(r.name);paint();}),btn(text('clear'),()=>{for(const r of rows)if(!r.disabled)selected.delete(r.name);paint();}));
  tools.children[0].dataset.injText='all';tools.children[1].dataset.injText='clear';
  fieldset.append(tools,list,summary,translated('p','inj-help','remove'));
  const save=btn(text('save'),submit);save.classList.add('btn-primary');
  panel.append(head,selectLabel('player',ps),selectLabel('cycle',cs),flagLabel,translated('p','inj-help','flagHelp'),fieldset,translated('p','inj-help','explain'),save,status);
  const changes=()=>({n:selected.size,a:[...selected].filter(n=>!baseSelected.has(n)).length,r:[...baseSelected].filter(n=>!selected.has(n)).length});
  const dirty=()=>{const c=changes();return flag!==baseFlag||c.a>0||c.r>0;};
  function choose(){
   rows=choices(name,cycle);baseSelected=new Set(rows.filter(r=>r.selected).map(r=>r.name));selected=new Set(baseSelected);baseFlag=!!USERS[name]?.injured;flag=baseFlag;version=_stateV;paint();
  }
  ps.onchange=()=>{if(dirty()&&!confirm(text('discard'))){ps.value=name;return;}name=ps.value;cs.replaceChildren();const opts=cycles.filter(c=>['active','finished'].includes(c.status)&&c.groups?.some(g=>g?.players?.includes(name)));for(const c of opts)cs.add(new Option(text('cycle')+' '+c.n,String(c.n)));cycle=opts.some(c=>c.n===options.cycle)?options.cycle:opts.some(c=>c.n===activeN)?activeN:opts.at(-1)?.n??null;if(cycle===null)cs.add(new Option(text('none'),''));else cs.value=String(cycle);choose();};
  cs.onchange=()=>{if(dirty()&&!confirm(text('discard'))){cs.value=String(cycle??'');return;}cycle=Number(cs.value)||null;choose();};
  flagBox.onchange=()=>{flag=flagBox.checked;paint();};
  function paint(){
   const focused=list.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
   list.replaceChildren();
   for(const r of rows){const l=el('label','inj-row'),check=el('input');check.type='checkbox';check.checked=selected.has(r.name);check.disabled=busy||uncertain||r.disabled;check.setAttribute('aria-label',r.name);check.onchange=()=>{if(check.checked)selected.add(r.name);else selected.delete(r.name);paint();};const info=el('span');info.append(el('strong','',r.name),el('small','',text(r.reason)));if(r.name===options.opponent)l.classList.add('inj-row-context');l.append(check,info);list.append(l);}
   if(!rows.length)list.append(el('p','inj-help',text('empty')));
   flagBox.checked=flag;flagBox.disabled=busy||uncertain||!name;ps.disabled=busy||uncertain;cs.disabled=busy||uncertain||!name||cycle===null;
   tools.querySelectorAll('button').forEach(b=>b.disabled=busy||uncertain||!rows.some(r=>!r.disabled));
   summary.textContent=format('summary',changes());save.disabled=busy||uncertain||!available()||!name||!dirty();save.textContent=text(busy?'saving':'save');panel.setAttribute('aria-busy',String(busy));
   if(focused)Array.from(list.querySelectorAll('input')).find(n=>n.getAttribute('aria-label')===focused)?.focus({preventScroll:true});
   if(!options.fresh)draftMemory={stamp,name,cycle,flag,version,selected:[...selected]};
  }
  async function submit(){
   if(busy||uncertain||!available()||stamp!==ctx())return;
   if(!confirm(format('confirm',{summary:format('summary',changes())})))return;
   busy=true;delete status.dataset.injText;status.textContent='';paint();let held=false;
   try{
    if(_saveInFlight)await _saveInFlight;
    if(stamp!==ctx())throw Error(text('changed'));
    if(_dataOperationBusy||!_loadOK||_saveConflict||_lastSaved&&_serialize()!==_lastSaved)throw Error(text('pending'));
    if(_stateV!==version){uncertain=true;throw Error(text('conflict'));}
    _dataOperationBusy=true;held=true;
    let response,data;
    try{response=await fetch('/api/liga?operacion=injuries',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},cache:'no-store',body:JSON.stringify({ligaId:_ligaActual,expectedVersion:version,player:name,cycle,injured:flag,opponents:[...selected]}),signal:AbortSignal.timeout(30000)});data=await response.json();}catch(_){uncertain=true;throw Error(text('reload'));}
    if(stamp!==ctx()){uncertain=true;throw Error(text('changed'));}
    if(!response.ok){
     if(response.status===409||response.status>=500)uncertain=true;
     const errors={INJURY_CONFLICT:'conflict',INJURY_OWN_MATCH:'own',INJURY_CLOSED:'closed',INJURY_RECORDED:'lockedRow'};
     throw Error(LANG==='en'?text(errors[data?.code]||'unavailable'):data?.error||text('unavailable'));
    }
    if(!data?.ok||!data.state||!_hydrate(data.state)){uncertain=true;throw Error(text('reload'));}
    _lastSaved=_serialize();_loadOK=true;version=_stateV;choose();
    status.dataset.injText=data.changed?'saved':'unchanged';status.textContent=text(status.dataset.injText);
    if(options.onSaved){try{options.onSaved(data);}catch(_){/* The confirmed server save remains successful even if a view needs a refresh. */}}
    if(typeof refreshPlayerList==='function')refreshPlayerList();
   }catch(e){status.textContent=e.message;if(uncertain&&stamp===ctx()){_saveConflict=true;_showLoadError(text('reload'));if(!panel.querySelector('[data-inj-reload]')){const reload=btn(text('reloadBtn'),()=>location.reload());reload.dataset.injReload='1';panel.append(reload);}}}
   finally{if(held)_dataOperationBusy=false;busy=false;paint();}
  }
  if(remembered&&USERS[remembered.name]){ps.value=remembered.name;ps.onchange();if(remembered.cycle!==null&&Array.from(cs.options).some(o=>o.value===String(remembered.cycle))){cs.value=String(remembered.cycle);cs.onchange();}if(remembered.version===_stateV){flag=remembered.flag;selected=new Set(remembered.selected);}}
  if(options.player&&USERS[options.player]&&Array.from(ps.options).some(o=>o.value===options.player)){ps.value=options.player;ps.onchange();}
  panel.injuryDirty=dirty;panel.injuryBusy=()=>busy;
  panel.injuryTranslate=()=>{
   panel.querySelectorAll('[data-inj-text]').forEach(n=>n.textContent=text(n.dataset.injText));
   if(ps.options[0])ps.options[0].textContent=text('choose');
   Array.from(cs.options).forEach(o=>o.textContent=o.value?text('cycle')+' '+o.value:text('none'));
   paint();
  };
  paint();return panel;
 }
 const closeText=()=>LANG==='en'?'Close':'Cerrar';
 function clearSession(){
  if(injuryDialog){const d=injuryDialog;injuryDialog=null;d.close();d.remove();}
  draftMemory=null;
 }
 function open(options={}){
  if(!available()||!_token||!_loadOK||_dataOperationBusy||typeof isTutorialRunning==='function'&&isTutorialRunning())return null;
  if(injuryDialog?.isConnected)return injuryDialog;
  const stamp=ctx(),previous=document.activeElement,d=el('dialog','inj-dialog'),prefix='inj-dialog-'+(++dialogSerial);
  const head=el('div','inj-dialog-head'),title=el('h2','',text('title')),close=btn(closeText(),finish);
  title.id=prefix+'-heading';close.classList.add('inj-dialog-close');head.append(title,close);d.setAttribute('aria-labelledby',title.id);d.append(head);
  const lang=typeof createDialogLanguageSwitcher==='function'?createDialogLanguageSwitcher(prefix+'-lang'):null;if(lang)d.append(lang);
  const subtitle=el('p','inj-dialog-context');
  const contextLabel=()=>{const ns=[options.player,options.opponent].filter(n=>typeof n==='string'&&n);subtitle.textContent=(ns.length?ns.join(' vs ')+' · ':'')+(LANG==='en'?'Choose the injured player and check the affected opponents. Nothing is saved until you confirm.':'Elegí al jugador lesionado y marcá los rivales afectados. No se guarda nada hasta confirmar.');};contextLabel();d.append(subtitle);
  const panel=createPanel({...options,fresh:true,idPrefix:prefix,onSaved:data=>{
   if(stamp!==ctx())return;
   // Redraw sporting views from the confirmed state. Existing result drafts are
   // kept and admission checks disable a fixture that was just marked as injured.
   if(typeof renderGrupos==='function')renderGrupos();
   if(typeof subView!=='undefined'&&subView==='cargar')global.SohailResults?.renderPage();
   if(typeof renderGeneral==='function')renderGeneral();
   if(typeof options.onSaved==='function')options.onSaved(data);
  }});d.append(panel);document.body.append(d);injuryDialog=d;
  function finish(){
   if(panel.injuryBusy())return;
   if(panel.injuryDirty()&&!confirm(LANG==='en'?'Discard unsaved injury changes?':'¿Descartar los cambios de lesión sin guardar?'))return;
   d.close();
  }
  d.injuryTranslate=()=>{if(stamp!==ctx()){clearSession();return;}title.textContent=text('title');close.textContent=closeText();contextLabel();if(lang&&typeof updateDialogLanguageSwitchers==='function')updateDialogLanguageSwitchers(d);panel.injuryTranslate();};
  d.addEventListener('cancel',ev=>{ev.preventDefault();finish();});
  d.addEventListener('close',()=>{if(injuryDialog===d)injuryDialog=null;d.remove();if(previous?.isConnected)previous.focus({preventScroll:true});});
  d.showModal();panel.querySelector('select')?.focus({preventScroll:true});return d;
 }
 if(typeof MutationObserver==='function')new MutationObserver(()=>injuryDialog?.injuryTranslate?.()).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 if(typeof global.addEventListener==='function')global.addEventListener('beforeunload',ev=>{if(injuryDialog?.querySelector('.inj-panel')?.injuryDirty()){ev.preventDefault();ev.returnValue='';}});
 global.SohailInjuries=Object.freeze({createPanel,choices,text,isInjury:injury,open,clearSession});
})(window);
