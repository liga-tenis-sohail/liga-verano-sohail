// ============================================================================
// public/resultados-y-grupos.js — grupos, general, carga de resultados y pendientes
// Extraído del index.html original (líneas del script: 2488..3121).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
function validaAlCargar(a, b){
  // Un administrador valida al cargar, incluido su propio partido.
  // Antes se le bloqueaba para que no arbitrara lo suyo. Ahora el control es la
  // TRANSPARENCIA en vez de la prohibición: todo partido guarda vBy con el nombre
  // de quien lo validó y queda a la vista en el modal. En una liga de conocidos,
  // que alguien tenga que esperar a otro admin para cerrar su partido trababa más
  // de lo que protegía. Los parámetros quedan por compatibilidad de las llamadas.
  return esAdmin(currentUser);
}
// Dos escapes distintos, porque son dos problemas distintos.
//
// jsq(): para meter un valor DENTRO de un string de JavaScript, que a su vez vive
// dentro de un atributo:  onclick="verFicha('${jsq(nombre)}')"
// Solo tiene que neutralizar el apóstrofo, que es lo que cierra ese string.
// Nació por los apellidos tipo O'Brien, que rompían el onclick.
//
// attr(): para meter un valor como VALOR de un atributo HTML:
//   value="${attr(email)}"   id="pe-name-${attr(nombre)}"
// Acá el peligro es la comilla doble, que cierra el atributo y deja inyectar
// otro (por ejemplo onfocus=). El apóstrofo no molesta, pero se escapa igual.
//
// Antes ambas cosas las hacía una sola función llamada esc(), que solo tocaba el
// apóstrofo: correcta para los 15 casos de JS, inútil para los 13 de atributos.
// El nombre sugería "escape de HTML" y no lo era: una trampa para el que viniera
// después. La validación del servidor tapa el agujero, pero el nombre mentía.
function jsq(s){ return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function attr(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
// Cambia el grupo seleccionado en la vista "Grupos" (layout tipo selector,
// con botones Grupo 1 / Grupo 2 / etc). Faltaba esta función: los botones
// llamaban a setSelGroup(gid) por onclick pero nunca estaba definida, por lo
// que al tocar un grupo distinto no pasaba nada (ni jugador ni admin podían
// cambiar de grupo).
function setSelGroup(gid){
  selGroup=gid;
  renderGrupos();
}
function renderGrupos(){
  try {
      const c=cycles[viewCycle-1];
      let html='';
      if(!c||!c.groups){document.getElementById('view-grupos').innerHTML=`<div class="card"><div class="empty">Ciclo no disponible.</div></div>`;return;}
      
      if(LAYOUT==='selector'){
        html+=`<div class="card"><div class="section-lbl">${t('choose_group')}</div><div class="grp-pick">`+c.groups.map((g,i)=>{
            const gid=i+1;
            const loc=currentUser?findLoc(currentUser.name,viewCycle):null;
            const mine=currentUser&&currentUser.role==='player'&&loc&&loc.g===gid;
            return `<button class="grp-btn ${selGroup===gid?'active':''}" onclick="setSelGroup(${gid})">${groupName(gid)}${mine?`<span class="mine">${t('mine_label')}</span>`:''}</button>`;
        }).join('')+`</div></div>`;
        if(selGroup>c.groups.length)selGroup=1;
        html+=groupCardHTML(selGroup);
      }else{
        c.groups.forEach((g,gi)=>{html+=groupCardHTML(gi+1);if(gi<c.groups.length-1)html+='<div class="grp-sep"></div>';});
      }
      
      const clubsLeg = CLUBS.map(c=>
        `<span><span class="dot" style="background:${c.bg}"></span> ${attr(c.name)}</span>`
      ).join('');
      html+=`<div class="card legend-card"><div class="legend">${clubsLeg}<span><span class="dot dot-pend"></span> ${t('legend_pending')}</span><span><span class="dot" style="background:${COLOR_DISPUTA}"></span> ${t('legend_disputed')}</span><span><span class="dot" style="background:${LEAGUE_COLOR_HL}"></span> ${t('legend_nj')}</span><span>${t('legend_load')} · ${t('legend_noedit')}</span></div></div>`;
      document.getElementById('view-grupos').innerHTML=html;
  } catch(e) {
      console.error("Error crítico en renderGrupos:", e);
      document.getElementById('view-grupos').innerHTML=`<div class="card"><div class="alert alert-err">Hubo un problema cargando los grupos. Contacte a soporte o actualice la página.</div><pre style="font-size:10px;color:var(--danger);margin-top:10px">${e.message}</pre></div>`;
  }
}
function canCreate(gid,n1,n2){if(viewCycle!==activeN)return false;if(esAdmin(currentUser))return true;const rival=currentUser.name===n1?n2:n1;if(USERS[rival]&&USERS[rival].inactive)return false;const loc=findLoc(currentUser.name,activeN);return loc&&loc.g===gid&&(currentUser.name===n1||currentUser.name===n2);}
function renderGeneral(){
const all=computeGeneral();const pc=['p1','p2','p3'];
const title=document.getElementById('gen-title');if(title)title.textContent=t('general_title');
const tb=document.getElementById('gen-tiebreak');if(tb)tb.innerHTML=t('gen_tiebreak_note');
// Reconstruir el encabezado: #, Jugador, Grupo, Total, una columna por ciclo, y
// (si los playoffs YA ESTÁN INICIADOS — no en preview) la columna de cuadro.
// En preview el admin ve los cuadros en la pestaña Play Offs, pero no se refleja
// en la clasificación general para no confundir a los jugadores.
const poActivoHdr=playoff&&playoff.started;
const thCiclos=cycles.map(c=>'<th title="'+attr(t('gen_cycle_pts'))+'">'+t('cycle_short')+c.n+'</th>').join('');
const thPO=poActivoHdr?('<th>'+t('gen_po_col')+'</th>'):'';
const headRow=document.getElementById('gen-thead-row');
if(headRow)headRow.innerHTML='<th>#</th><th style="text-align:left">'+t('player')+'</th><th>'+t('current_group')+'</th><th>'+t('total')+'</th>'+thCiclos+thPO+(esAdmin(currentUser)?'<th></th>':'');
document.getElementById('gen-body').innerHTML=all.map((p,i)=>{const me=currentUser&&currentUser.role==='player'&&p.name===currentUser.name;const loc=findLoc(p.name,activeN);
  // Una celda por ciclo con los puntos que sumó ese ciclo (— si no jugó ese ciclo).
  const celdasCiclos=cycles.map(c=>{const v=p.porCiclo[c.n];return '<td class="gen-cyc">'+(v!==undefined?v:'<span class="gen-dash">—</span>')+'</td>';}).join('');
  // Columna de playoff: solo si están iniciados (no en preview).
  const poActivo=playoff&&playoff.started;
  const celdaPO=poActivo?('<td class="gen-po">'+(p.poDraw?('<span class="po-chip">'+t('draw')+' '+attr(p.poDraw)+'</span>'):'<span class="gen-dash">—</span>')+'</td>'):'';
  const inactBadge=p.inactive?' <span class="badge-inact">'+t('inactive_short')+'</span>':'';
  // Editor de puntos: una columna propia AL FINAL de la fila (no adentro de
  // "Total" como antes), y abre un modal que deja tocar el ajuste de CADA
  // ciclo por separado (editAjustePuntosGeneralUI), no solo el del ciclo
  // activo — el admin puede corregir un ciclo pasado sin tener que
  // cambiarse de ciclo primero, INCLUSO en un ciclo donde el jugador nunca
  // participó (ver _ajustesDelJugadorPorCiclo y la segunda pasada de
  // computeGeneral en core-estado.js, que suma esos ajustes "sueltos").
  // Ya no depende de p.porCiclo: el modal siempre ofrece TODOS los ciclos
  // de la liga, jugados o no.
  const celdaEditor=esAdmin(currentUser)
    ? '<td class="gen-edit">'+(cycles.length?'<button class="pts-ajuste-btn" title="'+attr(t('pts_ajuste_btn'))+'" onclick="editAjustePuntosGeneralUI(\''+jsq(p.name)+'\')"><i class="ti ti-edit"></i></button>':'')+'</td>'
    : '';
  return '<tr class="'+(me?'me-row':'')+'" style="'+(p.inactive?'opacity:.55':'')+'"><td>'+(p.inactive?'<span class="pos pn">—</span>':'<span class="pos '+(pc[i]||'pn')+'">'+(i+1)+'</span>')+'</td><td><span class="avatar">'+getInitials(p.name)+'</span><span class="nm-link" onclick="showPlayerHistory(\''+jsq(p.name)+'\')">'+p.name+'</span>'+(me?' <span class="badge badge-ok">'+t('me_label')+'</span>':'')+inactBadge+'</td><td>'+(p.inactive?'—':(loc?groupName(loc.g):'—'))+'</td><td><strong>'+p.total+'</strong></td>'+celdasCiclos+celdaPO+celdaEditor+'</tr>';}).join('');}

// Dibuja un botón por club en el formulario de carga, desde CLUBS. Reemplaza a los
// dos botones fijos Sohail/Haza. Cada botón lleva el color del club como fondo.
function renderClubButtons(){
  const box=document.getElementById('club-pick');
  if(!box)return;
  box.innerHTML=CLUBS.map(c=>
    `<div class="club-opt" data-club="${attr(c.name)}" onclick="pickClub('${jsq(c.name)}')" style="--cbg:${c.bg};--ctx:${autoTxt(c.bg)}">${attr(c.name)}</div>`
  ).join('');
  // Re-marcar el seleccionado si ya había uno
  if(formClub) pickClub(formClub);
}
function pickClub(c){
  formClub=c;
  const box=document.getElementById('club-pick');
  if(box){
    box.querySelectorAll('.club-opt').forEach(el=>{
      const sel = el.getAttribute('data-club')===c;
      el.classList.toggle('club-sel', sel);
    });
    box.classList.remove('req-empty');
  }
}
function getMyPoMatch(){
  if(!playoff.started&&!playoff.preview)return null;
  if(!currentUser||esAdmin(currentUser))return null;
  const name=currentUser.name;
  for(let ti=0;ti<playoff.tramos.length;ti++){
    const tr=playoff.tramos[ti];
    if(!tr)continue;
    // Buscar en main draw
    for(const which of['main','cons']){
      const rounds=tr[which];
      if(!Array.isArray(rounds))continue;
      for(let ri=0;ri<rounds.length;ri++){
        for(let mi=0;mi<rounds[ri].length;mi++){
          const m=rounds[ri][mi];
          if((m.a===name||m.b===name)&&m.a&&m.b&&!m.w){
            // ¿Ya hay un resultado cargado (pending/disputed) para este slot?
            // Si sí, este partido NO se debe ofrecer en el tab Cargar como
            // pendiente de jugar. El jugador ya lo cargó (o el rival lo cargó)
            // y ahora está esperando confirmación/disputa. Sin este chequeo, el
            // tab Cargar seguía mostrando el formulario con el rival autoseleccionado,
            // habilitando que el mismo jugador cargue un DUPLICADO por encima.
            //
            // Estrategia doble para blindar (misma que matchBox):
            //   1) Coincidencia por índices ti/which/ri/mi con coerción de tipo.
            //   2) Fallback por nombres: un match de playoff con exactamente los
            //      mismos 2 jugadores es único. Si un match antiguo tiene otros
            //      índices por un rearmado del bracket, igual lo atrapamos.
            const rival = m.a === name ? m.b : m.a;
            const yaCargado = (matches || []).some(function(x){
              if(!x || x.po !== true) return false;
              if(x.status !== 'pending' && x.status !== 'disputed') return false;
              // Criterio 1: mismas coordenadas del bracket
              var sameCoord = (Number(x.ti) === Number(ti))
                           && (String(x.which) === String(which))
                           && (Number(x.ri) === Number(ri))
                           && (Number(x.mi) === Number(mi));
              if(sameCoord) return true;
              // Criterio 2: mismos 2 jugadores en cualquier orden
              if(Array.isArray(x.poNames) && x.poNames.length === 2
                 && x.poNames.indexOf(name) !== -1
                 && x.poNames.indexOf(rival) !== -1) return true;
              return false;
            });
            if(yaCargado) continue;
            const total=rounds.length;
            const fe=total-1-ri;
            const roundName=fe===0?'Final':fe===1?'Semifinal':fe===2?'Cuartos':fe===3?'Octavos':fe===4?'16avos':'Ronda '+(ri+1);
            const drawName=which==='cons'?'Consolación '+tr.label:'Cuadro '+tr.label;
            return{ti,which,ri,mi,rival,roundName,drawName,trLabel:tr.label};
          }
        }
      }
    }
  }
  return null;
}

function populateForm(gid,na,nb){poContext=null;formClub='';renderClubButtons();const r=document.getElementById('f-reporter'),o=document.getElementById('f-rival'),note=document.getElementById('cargar-note');r.innerHTML='<option value="">— Jugador —</option>';o.innerHTML='<option value="">— Rival —</option>';
  // Ciclo para cargar: el activo, O un ciclo cerrado con editMode habilitado por el admin.
  // Si hay editMode, se usa ese ciclo (tanto para admins como para jugadores).
  const editCycle = cycles.find(cx=>cx.editMode);
  const c = editCycle || getActive();
  const cycleN = editCycle ? editCycle.n : activeN;
  _formCycleN = cycleN;  // submitResult lo lee para saber en qué ciclo guardar
  if(!c||!c.groups){note.textContent="Ciclo inactivo.";r.disabled=true;o.disabled=true;return;}
// Ocultar/mostrar el filtro de grupo/playoff según el rol
const _fw=document.getElementById('admin-group-filter');
if(_fw)_fw.style.display=(esAdmin(currentUser))?'flex':'none';
// Bloquear carga si el ciclo está finalizado y sin editMode ni playoffs activos.
// Con editMode activo el admin habilitó explícitamente la carga: cualquiera puede cargar.
if(c.status==='finished'&&!c.editMode&&!playoff.started&&!playoff.preview&&!esAdmin(currentUser)){
  note.innerHTML='<span style="color:var(--text2)">La temporada regular ha finalizado. Esperá que el administrador habilite los Play Offs.</span>';
  r.disabled=true;o.disabled=true;r.className='score-sel-locked';o.className='score-sel-locked';return;
}
// Si hay editMode activo, mostrar banner informativo del ciclo habilitado
if(editCycle){
  note.innerHTML=`<strong style="color:#f59e0b"><i class="ti ti-pencil"></i> Carga habilitada en Ciclo ${cycleN} — los resultados se guardan en ese ciclo.</strong>`;
}
if(currentUser.role==='player' && !esAdmin(currentUser)){
  // Un jugador que además es admin NO entra acá: cae en la rama else de abajo,
  // que le deja elegir a cualquiera de los dos jugadores (poder de admin).
  // Si no, este bloque le bloqueaba el reporter en su propio nombre y no podía
  // cargar el partido de otros.
  const myPo=getMyPoMatch();
  if(myPo&&!na){
    // Modo playoff: formulario bloqueado con el rival de llaves
    note.innerHTML='<strong style="color:var(--pri)">🏆 '+tf('po_form_note',{draw:myPo.drawName,round:myPo.roundName})+'</strong>';
    r.add(new Option(currentUser.name,currentUser.name));
    r.value=currentUser.name;
    r.disabled=true;r.className='score-sel-locked';
    o.add(new Option(myPo.rival,myPo.rival));
    o.value=myPo.rival;
    o.disabled=true;o.className='score-sel-locked';
    poContext={ti:myPo.ti,which:myPo.which,ri:myPo.ri,mi:myPo.mi};
    renderClubButtons();
    document.getElementById('f-fecha').value=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
    _updateCargarLabels();
    return;
  }
  // Si estamos en playoffs y el jugador NO tiene ningún partido de playoff
  // pendiente (ya perdió, quedó afuera, o le toca esperar la siguiente ronda),
  // NO le mostramos el formulario de liga. La liga regular ya terminó — no debe
  // poder cargar resultados de partidos del ciclo cerrado que nunca se jugaron.
  if((playoff.started||playoff.preview) && !myPo){
    note.innerHTML='<span style="color:var(--text2)"><i class="ti ti-trophy"></i> Estamos en Play Offs. No tienes ningún partido pendiente por cargar en este momento.</span>';
    r.disabled=true;o.disabled=true;r.className='score-sel-locked';o.className='score-sel-locked';
    return;
  }
  // Modo liga normal
  const loc=findLoc(currentUser.name,cycleN);if(!loc){note.textContent=t('not_in_cycle');return;}
  r.add(new Option(currentUser.name,currentUser.name));r.value=currentUser.name;r.disabled=true;r.className='score-sel-locked';
  (c.groups[loc.g-1].players||[]).slice().sort((a,b)=>a.localeCompare(b,'es')).forEach(j=>{if(j!==currentUser.name && !(USERS[j]&&USERS[j].inactive) && !findMatch(cycleN, loc.g, currentUser.name, j))o.add(new Option(j,j));});
  o.disabled=false;o.className='score-sel-pick';
  note.textContent=tf('load_note_player',{g:groupName(loc.g)});
}else{r.disabled=false;
  // Llenar el select de reporter con todos los grupos (sin filtro)
  function fillReporterAll(){
    r.innerHTML='<option value="">— '+t('select_user')+' —</option>';
    // .filter(Boolean) descarta los cupos vacíos (null) de grupos con
    // jugadores sin asignar todavía (ver setNumGroups/setPlayersPerGroup en
    // admin-ligas-clubes.js) — sin este filtro, sort() explota al intentar
    // null.localeCompare(...).
    c.groups.forEach((g,gi)=>{const gid2=gi+1;const og=document.createElement('optgroup');og.label=groupName(gid2);(g.players||[]).filter(Boolean).slice().sort((a,b)=>a.localeCompare(b,'es')).forEach(j=>og.appendChild(new Option(j,gi+'|'+j)));r.appendChild(og);});
  }
  function fillReporterByGroup(fgi){
    r.innerHTML='<option value="">— '+t('select_user')+' —</option>';
    const g=c.groups[fgi];if(!g)return;
    (g.players||[]).filter(Boolean).slice().sort((a,b)=>a.localeCompare(b,'es')).forEach(j=>r.appendChild(new Option(j,fgi+'|'+j)));
  }
  // Construir opciones del filtro incluyendo playoffs dinámicos
  function buildFilterOptions(){
    let html='<option value="">— Todos los grupos —</option>';
    const haspo=(playoff.started||playoff.preview)&&playoff.tramos&&playoff.tramos.length>0;
    if(haspo){
      html+='<optgroup label="─── Play Offs ───">';
      playoff.tramos.forEach((tr,ti)=>{
        const roundName=(ri,total)=>{const fe=total-1-ri;return fe===0?'Final':fe===1?'Semifinal':fe===2?'Cuartos':fe===3?'Octavos':'Ronda '+(ri+1);};
        ['main','cons'].forEach(which=>{
          const rounds=tr[which];
          if(!Array.isArray(rounds))return;
          // Contar partidos abiertos
          let open=0;rounds.forEach(rd=>rd.forEach(m=>{if(!m.w&&m.a&&m.b)open++;}));
          if(open===0)return; // sección eliminada — no aparece en el filtro
          const lbl=which==='cons'?'Consolación '+tr.label:'Cuadro '+tr.label;
          html+='<option value="po:'+ti+':'+which+'">'+lbl+'</option>';
        });
      });
      html+='</optgroup><optgroup label="─── Liga ───">';
    }
    html+=c.groups.map((_,gi)=>'<option value="'+gi+'">'+groupName(gi+1)+'</option>').join('');
    if(haspo)html+='</optgroup>';
    return html;
  }

  function fillReporterByPoSection(ti,which){
    r.innerHTML='<option value="">— Selecciona jugador —</option>';
    const tr=playoff.tramos[ti];if(!tr||!tr[which])return;
    const rounds=tr[which];
    const added=new Set();
    rounds.forEach((round,ri)=>round.forEach((m,mi)=>{
      if(!m.w&&m.a&&m.b){
        if(!added.has(m.a)){added.add(m.a);r.appendChild(new Option(m.a,'po:'+ti+':'+which+':'+m.a));}
        if(!added.has(m.b)){added.add(m.b);r.appendChild(new Option(m.b,'po:'+ti+':'+which+':'+m.b));}
      }
    }));
    r.onchange=function(){
      const val=this.value;
      if(!val||!val.startsWith('po:'))return;
      const parts=val.split(':');const pti=+parts[1],pwhich=parts[2],pname=parts[3];
      const ptr=playoff.tramos[pti];if(!ptr||!ptr[pwhich])return;
      let rival=null,pri=-1,pmi=-1;
      ptr[pwhich].forEach((round,ri)=>round.forEach((m,mi)=>{
        if(!m.w&&(m.a===pname||m.b===pname)&&m.a&&m.b){
          rival=m.a===pname?m.b:m.a;pri=ri;pmi=mi;
        }
      }));
      if(rival){
        o.innerHTML='<option value="'+rival+'">'+rival+'</option>';
        o.value=rival;o.disabled=true;
        poContext={ti:pti,which:pwhich,ri:pri,mi:pmi};
        const total=ptr[pwhich].length;
        const fe=total-1-pri;
        const rn=fe===0?'Final':fe===1?'Semifinal':fe===2?'Cuartos':fe===3?'Octavos':'Ronda '+(pri+1);
        const sn=pwhich==='cons'?'Consolación '+ptr.label:'Cuadro '+ptr.label;
        note.innerHTML='<strong style="color:var(--pri)">🏆 Play Offs — '+sn+' · '+rn+'</strong>';
      } else {
        o.innerHTML='<option value="">—</option>';o.disabled=false;poContext=null;
        note.textContent=t('load_note_admin');
      }
      syncNoJugado();
    };
  }

  // Insertar selector de grupo/playoff filtro antes del note
  const filterWrap=document.getElementById('admin-group-filter');
  if(!filterWrap){
    const fw=document.createElement('div');
    fw.id='admin-group-filter';
    fw.className='filter-row'; // fila sin recuadro, fondo sutil
    const lbl=document.createElement('label');lbl.textContent='Filtrar:';lbl.style.cssText='font-size:13px;color:var(--text2);white-space:nowrap;font-weight:400';
    const sel=document.createElement('select');sel.id='admin-grp-filter-sel';sel.style.cssText='flex:1;padding:5px 10px;border-radius:8px;border:1px solid var(--border2);background:var(--surface);color:var(--text);font-size:13px';
    sel.innerHTML=buildFilterOptions();
    sel.onchange=function(){
      const v=this.value;
      o.innerHTML='<option value="">—</option>';o.disabled=false;poContext=null;r.value='';
      if(v===''){fillReporterAll();r.onchange=function(){filterRival(this.value,null);};note.textContent=t('load_note_admin');}
      else if(v.startsWith('po:')){
        const parts=v.split(':');fillReporterByPoSection(+parts[1],parts[2]);
      }else{fillReporterByGroup(+v);r.onchange=function(){filterRival(this.value,null);};note.textContent=t('load_note_admin');}
      syncNoJugado();
    };
    fw.appendChild(lbl);fw.appendChild(sel);
    const cfWrap=document.getElementById('club-fecha-wrap');
    if(cfWrap&&cfWrap.nextSibling){cfWrap.parentNode.insertBefore(fw,cfWrap.nextSibling);}
    else if(cfWrap){cfWrap.parentNode.appendChild(fw);}
  } else {
    const sel=document.getElementById('admin-grp-filter-sel');
    if(sel){
      sel.innerHTML=buildFilterOptions();
      sel.value='';
      // Actualizar el onchange con el closure fresco (nuevos grupos incluidos)
      sel.onchange=function(){
        const v=this.value;
        o.innerHTML='<option value="">—</option>';o.disabled=false;poContext=null;r.value='';
        if(v===''){fillReporterAll();r.onchange=function(){filterRival(this.value,null);};note.textContent=t('load_note_admin');}
        else if(v.startsWith('po:')){
          const parts=v.split(':');fillReporterByPoSection(+parts[1],parts[2]);
        }else{fillReporterByGroup(+v);r.onchange=function(){filterRival(this.value,null);};note.textContent=t('load_note_admin');}
        syncNoJugado();
      };
    }
    filterWrap.style.display='flex';
  }
  fillReporterAll();
  r.className='score-sel-pick';o.className='score-sel-pick';
  r.onchange=function(){
    this.className='score-sel-pick';
    const val=this.value;
    // Auto-detectar grupo y actualizar el filtro de grupo
    if(val&&val.includes('|')){
      const gi=+val.split('|')[0];
      const fs=document.getElementById('admin-grp-filter-sel');
      if(fs&&fs.value!==String(gi)){
        fs.value=String(gi);
        // No re-poblar el reporter para no perder la selección, solo actualizar nota
        const noteEl=document.getElementById('cargar-note');
        if(noteEl)noteEl.textContent=t('load_note_admin');
      }
    }
    filterRival(val,null);
    o.className='score-sel-pick';
  };
  note.textContent=t('load_note_admin');
  if(gid!=null){const gi=gid-1;
    const fs=document.getElementById('admin-grp-filter-sel');if(fs)fs.value=String(gi);
    fillReporterByGroup(gi);
    r.value=`${gi}|${na}`;filterRival(`${gi}|${na}`,nb);
  }else{filterRival('',null);}}formClub='';renderClubButtons();document.getElementById('f-fecha').value=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
_updateCargarLabels();}
// Actualizar los labels traducibles del formulario Cargar. Se llama desde ambos
// caminos de populateForm (playoff y liga normal) para que al cambiar idioma
// mientras estás en la pestaña Upload los textos se actualicen bien.
function _updateCargarLabels(){
  var lc=document.getElementById('lbl-club');if(lc)lc.innerHTML=`${t('club_label')} <span class="reqmark">${t('reqmark_label')}</span>`;
  var lf=document.getElementById('lbl-fecha-field');if(lf)lf.innerHTML=`${t('date_label')} <span class="reqmark">${t('reqmark_label')}</span>`;
  var rp=document.getElementById('f-reporter-lbl');if(rp)rp.textContent=t('reporter');
  var rv=document.getElementById('f-rival-lbl');if(rv)rv.textContent=t('rival');
  var ss=document.getElementById('sets-section-lbl');if(ss)ss.textContent=t('sets_section');
  var rr=document.getElementById('report-result-lbl');if(rr)rr.textContent=t('report_result');
  // Hint de sets ("6-0 a 6-4, 7-5 o 7-6" / "6-0 to 6-4, 7-5 or 7-6")
  document.querySelectorAll('.set-hint').forEach(el=>{el.textContent=t('set_hint');});
}
function filterRival(repVal,preselect){
  const o=document.getElementById('f-rival');
  syncNoJugado();
  o.innerHTML='<option value="">—</option>';
  if(!repVal)return;
  const parts=repVal.split('|');
  if(parts.length<2)return;
  const gi=+parts[0];const repName=parts[1];
  const c=getActive();if(!c||!c.groups)return;
  const g=c.groups[gi];if(!g)return;
  const og=document.createElement('optgroup');
  og.label=groupName(gi+1);
  (g.players||[]).filter(Boolean).slice().sort((a,b)=>a.localeCompare(b,'es')).forEach(j=>{
    if(j===repName)return;
    const hasMatch=findMatch(activeN,gi+1,repName,j);
    const jInactive=USERS[j]&&USERS[j].inactive;
    // Admin y jugador: solo rivales pendientes (sin partido confirmado/pendiente aún)
    // Excepción: preselect siempre aparece (para edición)
    if((!hasMatch&&!jInactive)||j===preselect){
      const label=jInactive?j+' (INACTIVO)':j;
      og.appendChild(new Option(label,`${gi}|${j}`));
    }
  });
  o.appendChild(og);
  if(preselect)o.value=`${gi}|${preselect}`;
}
function prefill(gid,n1,n2){
  showSub('cargar');
  if(currentUser.role==='player' && !esAdmin(currentUser)){
    // Jugador sin permisos de admin: es uno de los dos, se setea el rival.
    document.getElementById('f-rival').value=(currentUser.name===n1?n2:n1);
  }else{
    // Admin (incluido el jugador-admin): rellena AMBOS jugadores del partido
    // clickeado, sin asumir que el que carga es uno de ellos.
    const gi=gid-1;
    const repVal=`${gi}|${n1}`;
    const r=document.getElementById('f-reporter');
    r.value=repVal;
    filterRival(repVal, n2);
  }
}

function toggleSTB(){const row=document.getElementById('s3-row');const btn=document.getElementById('stb-toggle-btn');if(row.style.display==='none'||row.style.display===''){row.style.display='flex';btn.innerHTML='<i class="ti ti-x"></i> '+t('remove_stb');['s3a','s3b'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});}else{row.style.display='none';btn.innerHTML='<i class="ti ti-plus"></i> '+t('add_stb');['s3a','s3b'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});}}
// Panel de retiro (RET): a diferencia del viejo flujo (un modal aparte sin
// sets), esto vive DENTRO del formulario normal — el usuario carga los
// sets que efectivamente se jugaron (quedan en 0-0 los que no) en los
// mismos campos de siempre, y acá solo se elige quién se retiró. Al
// activarse, se llena #ret-quien con los 2 jugadores ya elegidos arriba
// (#f-reporter/#f-rival) — si todavía no eligieron a ambos, se avisa.
function toggleRetiro(){
  const panel=document.getElementById('ret-panel');
  const btn=document.getElementById('ret-toggle-btn');
  const abrir = panel.style.display==='none'||panel.style.display==='';
  if(abrir){
    const rv=document.getElementById('f-reporter').value,iv=document.getElementById('f-rival').value;
    if(!rv||!iv){ fAlert(t('select_two'),'err'); return; }
    const isAdmin=esAdmin(currentUser);
    let repName,rivName;
    if(currentUser.role==='player' && !isAdmin){
      repName=currentUser.name;rivName=iv;
    }else{
      const repVal=rv.startsWith('po:')?rv.split(':')[3]:rv;
      repName=parseSel(repVal).name;rivName=parseSel(iv).name;
    }
    if(!repName||!rivName||repName===rivName){ fAlert(t('select_two'),'err'); return; }
    const sel=document.getElementById('ret-quien');
    sel.innerHTML='<option value="">— ¿Quién se retiró? —</option>'
      +'<option value="'+attr(repName)+'">'+attr(repName)+'</option>'
      +'<option value="'+attr(rivName)+'">'+attr(rivName)+'</option>';
    panel.style.display='block';
    btn.style.display='none';
  }else{
    panel.style.display='none';
    btn.style.display='inline-flex';
    document.getElementById('ret-quien').value='';
  }
}
function checkAutoSTB(){const s1a=+document.getElementById('s1a').value,s1b=+document.getElementById('s1b').value;const s2a=+document.getElementById('s2a').value,s2b=+document.getElementById('s2b').value;if(!s1a&&!s1b&&!s2a&&!s2b)return;let w1=0,w2=0;if(validSet(s1a,s1b)){if(s1a>s1b)w1++;else w2++;}if(validSet(s2a,s2b)){if(s2a>s2b)w1++;else w2++;}const row=document.getElementById('s3-row');const btn=document.getElementById('stb-toggle-btn');if(w1===1&&w2===1){
if(row.style.display==='none'||row.style.display===''){row.style.display='flex';if(btn)btn.innerHTML='<i class="ti ti-x"></i> '+t('remove_stb');}}else if(w1===2||w2===2){
row.style.display='none';if(btn)btn.innerHTML='<i class="ti ti-plus"></i> '+t('add_stb');['s3a','s3b'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});}}
function readSets(){const s=[[+document.getElementById('s1a').value,+document.getElementById('s1b').value],[+document.getElementById('s2a').value,+document.getElementById('s2b').value]];let w1=0,w2=0;[s[0],s[1]].forEach(([a,b])=>{if(a>b)w1++;else w2++;});if(document.getElementById('s3-row').style.display!=='none'&&w1===1&&w2===1)s.push([+document.getElementById('s3a').value,+document.getElementById('s3b').value]);return s;}
// Lectura "libre" de sets para un retiro (RET): a diferencia de readSets()
// (que siempre arma 2 o 3 sets, aunque estén en 0-0), esto SOLO incluye los
// sets que realmente se jugaron — cualquier set en 0-0 se descarta, porque
// "0-0" en este contexto significa "no llegaron a jugar este set", no "un
// set real que terminó 0-0" (algo que no pasa en tenis). Así, un retiro sin
// ningún set jugado guarda sets:[] (no cuenta para el rating — ver
// rating.js), y un retiro a mitad del primer set... en la práctica el
// sistema solo captura SETS COMPLETOS, así que si el retiro fue a mitad de
// un set, ese set no se puede cargar parcialmente — solo los sets que se
// terminaron de jugar antes del retiro.
function readSetsLibre(){
  const crudos=[[+document.getElementById('s1a').value,+document.getElementById('s1b').value],[+document.getElementById('s2a').value,+document.getElementById('s2b').value]];
  if(document.getElementById('s3-row').style.display!=='none'){
    crudos.push([+document.getElementById('s3a').value,+document.getElementById('s3b').value]);
  }
  return crudos.filter(([a,b])=>!(a===0&&b===0));
}
function parseSel(v){if(v.indexOf('|')>=0){const p=v.split('|');return{g:+p[0]+1,name:p[1]};}return{g:null,name:v};}

function submitResult(){
  const rv=document.getElementById('f-reporter').value,iv=document.getElementById('f-rival').value,fecha=document.getElementById('f-fecha').value;
  if(!rv||!iv){fAlert(t('select_two'),'err');return;}
  // Retiro (RET): si el panel está activo y hay alguien elegido, se toma
  // ESTE camino en vez del de validación normal — los sets se leen tal
  // cual estén cargados en el formulario (pueden ser 0, no hace falta que
  // estén completos ni sean 2-3 sets parejos), y el ganador es
  // directamente "quien no se retiró", no se calcula por sets ganados.
  const retQuien=document.getElementById('ret-quien')?document.getElementById('ret-quien').value:'';
  // Si hay poContext activo, redirigir a lógica de playoff
  if(poContext){
    if(!formClub){fAlert(t('select_club'),'err');document.getElementById('club-pick').classList.add('req-empty');return;}
    if(!fecha){fAlert(t('select_date'),'err');document.getElementById('f-fecha').classList.add('req-empty');return;}
    const ti=poContext.ti,which=poContext.which,ri=poContext.ri,mi=poContext.mi;
    const tr=playoff.tramos[ti];if(!tr||!tr[which])return;
    const m=tr[which][ri][mi];if(!m)return;
    const isAdmin=validaAlCargar(m.a,m.b);
    let s,winner;
    if(retQuien){
      if(retQuien!==m.a&&retQuien!==m.b){fAlert('Elegí quién se retiró entre los dos jugadores de este partido.','err');return;}
      s=readSetsLibre();
      winner=retQuien===m.a?m.b:m.a;
    }else{
      s=readSets();const v=validMatch(s);if(!v.ok){fAlert('✕ '+v.msg,'err');return;}
      let w1=0,w2=0;s.forEach(([a,b])=>{if(a>b)w1++;else w2++;});
      winner=w1>w2?m.a:m.b;
    }
    // Guardar resultado en matches igual que submitPo
    matches=matches.filter(x=>!(x.po&&x.ti===ti&&x.which===which&&x.poNames&&x.poNames.includes(m.a)&&x.poNames.includes(m.b)));
    const newM={id:matchId++,po:true,ti,which,ri,mi,tLabel:playoff.tramos[ti].label,poNames:[m.a,m.b],sets:s,wo:!!retQuien,retiroDe:retQuien||undefined,date:fecha,club:formClub||'',status:isAdmin?'confirmed':'pending',vBy:isAdmin?currentUser.name:undefined,reporter:currentUser.name,winner,locked:isAdmin};
    matches.push(newM);
    if(isAdmin){
      storePo(ti,which,m.a,m.b,s,winner,!!retQuien);
      rebuildTramo(ti);
    } else {
      applyPoPending(newM);
    }
    const _rn=(()=>{const fe=tr[which].length-1-ri;return fe===0?'Final':fe===1?'Semifinal':fe===2?'Cuartos':fe===3?'Octavos':'Ronda '+(ri+1);})();
    addLog(isAdmin?'Playoff: validado (admin)':'Playoff: cargado',{a:m.a,b:m.b,sets:s,winner,wo:!!retQuien,po:true,cuadro:playoff.tramos[ti].label,which,round:_rn});
    clearForm();poContext=null;
    fAlert(isAdmin?t('result_sent_admin'):t('result_sent_player'),'ok');
    persist(true);
    // Forzar actualización del bracket en todos los casos
    if(typeof showPlayoffView==='function')showPlayoffView();
    refreshAll();
    // Admin: repoblar el form para siguiente resultado
    if(isAdmin)setTimeout(()=>populateForm(),50);
    return;
  }
  let repName,rivName,gid;
  const _cN = _formCycleN || activeN;  // ciclo donde se guarda el partido (editMode o activo)
  if(currentUser.role==='player' && !esAdmin(currentUser)){
    // Jugador sin permisos de admin: él es el reporter, el rival sale del select.
    repName=currentUser.name;rivName=iv;const loc=findLoc(repName,_cN);gid=loc?loc.g:null;
    if(!gid){fAlert(t('not_in_cycle'),'err');return;}
  }else{
    // Admin (incluido el jugador-admin): ambos jugadores salen de los dos selects,
    // sin asumir que el que envía es uno de ellos.
    const repVal=rv.startsWith('po:')?rv.split(':')[3]:rv;
    const a=parseSel(repVal),b=parseSel(iv);
    if(a.g!==b.g){fAlert(t('same_group'),'err');return;}
    gid=a.g;repName=a.name;rivName=b.name;
  }
  if(repName===rivName){fAlert(t('select_two'),'err');return;}
  if(!formClub){fAlert(t('select_club'),'err');document.getElementById('club-pick').classList.add('req-empty');return;}
  if(!fecha){fAlert(t('select_date'),'err');document.getElementById('f-fecha').classList.add('req-empty');return;}
  const ex=findMatch(_cN,gid,repName,rivName);
  if(ex&&ex.locked&&!esAdmin(currentUser)){fAlert(t('validated_admin_only'),'err');return;}
  if(ex&&ex.status==='disputed'&&!esAdmin(currentUser)){fAlert('Este resultado está en disputa. El administrador debe resolverlo primero.','err');return;}
  let s,winnerRet;
  if(retQuien){
    if(retQuien!==repName&&retQuien!==rivName){fAlert('Elegí quién se retiró entre los dos jugadores de este partido.','err');return;}
    s=readSetsLibre();
    winnerRet=retQuien===repName?rivName:repName;
  }else{
    s=readSets();const v=validMatch(s);
    if(!v.ok){fAlert('✕ '+v.msg,'err');return;}
  }
  
  matches=matches.filter(m=>!(m.cycle===_cN&&m.g===gid&&!m.po&&((m.aName===repName&&m.bName===rivName)||(m.aName===rivName&&m.bName===repName))));
  const isAdmin=validaAlCargar(repName,rivName);
  matches.push({id:matchId++,cycle:_cN,g:gid,aName:repName,bName:rivName,sets:s,wo:!!retQuien,winner:retQuien?winnerRet:undefined,date:fecha,status:isAdmin?'confirmed':'pending',vBy:isAdmin?currentUser.name:undefined,reporter:repName,club:formClub,locked:isAdmin});
  addLog(isAdmin?'Liga: validado (admin)':'Liga: cargado',{a:repName,b:rivName,sets:s,wo:!!retQuien,grupo:gid,po:false});
  clearForm();
  fAlert(isAdmin?t('result_sent_admin'):t('result_sent_player'),'ok');
  persist(true);
  refreshAll();
  if(isAdmin) setTimeout(()=>populateForm(),50);
}
// Muestra el botón "No jugado" solo para admin y solo en modo liga (no en playoffs)
function syncNoJugado(){
  const b=document.getElementById('btn-nojugado');if(!b)return;
  const isAdmin=esAdmin(currentUser);
  const fs=document.getElementById('admin-grp-filter-sel');
  const poFilter=!!(fs&&fs.value&&fs.value.startsWith('po:'));
  b.style.display=(isAdmin&&!poContext&&!poFilter)?'':'none';
}
// El admin marca un partido de liga como NO JUGADO: ambos suman 1 en NJ y 0 puntos.
function markNotPlayed(){
  const isAdmin=esAdmin(currentUser);
  if(!isAdmin){fAlert('Solo el administrador puede marcar partidos como no jugados.','err');return;}
  if(poContext){fAlert('“No jugado” no aplica a partidos de Play Offs.','err');return;}
  const rv=document.getElementById('f-reporter').value,iv=document.getElementById('f-rival').value;
  if(!rv||!iv){fAlert(t('select_two'),'err');return;}
  const repVal=rv.startsWith('po:')?rv.split(':')[3]:rv;
  const a=parseSel(repVal),b=parseSel(iv);
  if(a.g==null||b.g==null||a.g!==b.g){fAlert(t('same_group'),'err');return;}
  const gid=a.g,repName=a.name,rivName=b.name;
  if(repName===rivName){fAlert(t('select_two'),'err');return;}
  const ex=findMatch(activeN,gid,repName,rivName);
  if(ex&&ex.status==='disputed'){fAlert('Este partido está en disputa; resolvelo antes de marcarlo como no jugado.','err');return;}
  if(!confirm('¿Marcar como NO JUGADO el partido '+repName+' vs '+rivName+'?\n\nAmbos jugadores suman 1 en la columna NJ y 0 puntos por este partido. Puedes deshacerlo borrando el partido desde la tabla del grupo.'))return;
  matches=matches.filter(m=>!(m.cycle===activeN&&m.g===gid&&!m.po&&((m.aName===repName&&m.bName===rivName)||(m.aName===rivName&&m.bName===repName))));
  matches.push({id:matchId++,cycle:activeN,g:gid,aName:repName,bName:rivName,sets:[],np:true,date:'',status:'confirmed',reporter:currentUser.name,club:'',locked:true});
  addLog('Liga: marcado no jugado',{a:repName,b:rivName,grupo:gid,po:false});
  clearForm();
  fAlert('Partido marcado como no jugado.','ok');
  persist(true);
  refreshAll();
  setTimeout(()=>populateForm(),50);
}

function fAlert(m,t){const e=document.getElementById('form-alert');e.className=`alert alert-${t}`;e.textContent=m;setTimeout(()=>{e.textContent='';e.className='';},6000);}
function clearForm(){if(esAdmin(currentUser)){const r=document.getElementById('f-reporter');if(r)r.value='';}const rv=document.getElementById('f-rival');if(rv)rv.value='';['s1a','s1b','s2a','s2b','s3a','s3b'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='0';});const sr=document.getElementById('s3-row');if(sr)sr.style.display='none';const stbBtn=document.getElementById('stb-toggle-btn');if(stbBtn)stbBtn.innerHTML='<i class="ti ti-plus"></i> '+t('add_stb');formClub='';renderClubButtons();const ff=document.getElementById('f-fecha');if(ff){const d=new Date();ff.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}const cp=document.getElementById('club-pick');if(cp)cp.classList.remove('req-empty');const fp2=document.getElementById('f-fecha');if(fp2)fp2.classList.remove('req-empty');
  // Resetear también el panel de retiro (RET): sin esto, si el admin cargaba
  // un retiro y después quería cargar un resultado normal, el panel seguía
  // abierto con "quién se retiró" ya elegido de la carga anterior.
  const retPanel=document.getElementById('ret-panel');if(retPanel)retPanel.style.display='none';
  const retBtn=document.getElementById('ret-toggle-btn');if(retBtn)retBtn.style.display='inline-flex';
  const retQuien=document.getElementById('ret-quien');if(retQuien)retQuien.value='';
}
function involvedPend(m){if(esAdmin(currentUser))return true;if(m.po)return m.poNames&&m.poNames.includes(currentUser.name)&&m.reporter!==currentUser.name;return (m.aName===currentUser.name||m.bName===currentUser.name)&&m.reporter!==currentUser.name;}
function renderPend(){
  var _pt=document.getElementById('pend-title');if(_pt)_pt.textContent=t('pending_title');
  const pend=matches.filter(m=>m.status==='pending').sort((a,b)=>b.id-a.id);
  const disp=matches.filter(m=>m.status==='disputed').sort((a,b)=>b.id-a.id);
  const userPend = pend.filter(m => {
    if(m.po) return m.poNames && m.poNames.includes(currentUser.name);
    return m.aName === currentUser.name || m.bName === currentUser.name;
  });
  updateBadge();

  let html = '';

  if(currentUser&&esAdmin(currentUser) && pend.length > 0){
    html += `<div style="margin-bottom:.75rem"><button class="btn btn-accent" onclick="forceConfirmAll()"><i class="ti ti-checks"></i> ${t('confirm_pending')}</button></div>`;
  }

  if(currentUser&&esAdmin(currentUser) && disp.length > 0) {
    html += `<div class="section-lbl" style="margin-top:0">${t('disputes_title')}</div>`;
    html += disp.map(m=>{
      let p1,p2;if(m.po){p1=m.poNames[0];p2=m.poNames[1];}else{p1=m.aName;p2=m.bName;}
      const sc=m.sets.map(([a,b])=>`${a}-${b}`).join(' / ');
      return`<div class="disp-item"><span class="badge badge-disp">${m.po?'PO '+m.tLabel:'C'+m.cycle+' '+groupName(m.g)}</span><span>${p1} ${sc} ${p2}</span><div class="disp-act"><button class="btn btn-success btn-sm" onclick="resolveD(${m.id})">${t('validate')}</button>${!m.po?`<button class="btn btn-primary btn-sm" onclick="adminEdit(${m.id})">${t('edit')}</button>`:''}</div></div>`;
    }).join('');
    html += `<div class="grp-sep" style="margin:1rem 0"></div>`;
  }

  const vis = (currentUser&&esAdmin(currentUser)) ? pend : userPend;
  if(vis.length > 0) {
    if(currentUser&&esAdmin(currentUser) && disp.length > 0) html += `<div class="section-lbl">${t('pending_title')}</div>`;
    html += vis.map(m=>{
      let p1,p2,tag;if(m.po){p1=m.poNames[0];p2=m.poNames[1];tag='Play Off '+m.tLabel;}else{p1=m.aName;p2=m.bName;tag=`C${m.cycle}·${groupName(m.g)}`;}
      const sc=m.sets.map(([a,b])=>`${a}-${b}`).join(' / ');
      const ca=involvedPend(m);
      const wait=currentUser&&currentUser.role==='player'&&m.reporter===currentUser.name;
      return`<div class="pend-item"><span class="badge badge-tag">${tag}</span><span class="pend-nm">${p1}</span><span class="pend-sc">${sc}</span><span class="pend-nm">${p2}</span>${m.club?`<span class="badge" style="${clubStyle(m.club)}">${m.club}</span>`:''}<span class="badge badge-pend">${t('legend_pending')}</span>${wait?`<span class="lock-note">${t('waiting_admin')}</span>`:''}${ca?`<div class="pend-act"><button class="btn btn-accent btn-sm" onclick="openModal(${m.id})"><i class="ti ti-eye"></i> ${t('review')}</button></div>`:''}</div>`;
    }).join('');
  } else if (disp.length === 0) {
    html = `<div class="empty">${t('no_pending')}</div>`;
  }
  
  const listEl = document.getElementById('pend-list');
  if(listEl) listEl.innerHTML = html;
}
function openModal(mid){const m=matches.find(x=>x.id===mid);if(!m)return;currentModal=mid;let p1,p2,rep,tag;if(m.po){p1=m.poNames[0];p2=m.poNames[1];rep=m.reporter;tag='Play Off '+m.tLabel;}else{p1=m.aName;p2=m.bName;rep=m.reporter;tag=`C${m.cycle} ${groupName(m.g)}`;}const sc=m.sets.map(([a,b])=>`${a}-${b}`).join(' / ');
document.getElementById('modal-title').textContent=(m.status==='confirmed'?t('validated_result'):m.status==='disputed'?t('disputed_result'):t('review_result'))+` · ${tag}`;
const statusLabel = m.status === 'confirmed' ?
t('confirmed_label') : m.status === 'disputed' ? t('legend_disputed') : t('legend_pending');
if(m.np){document.getElementById('modal-body').innerHTML=`<div class="modal-score"><p>${p1} &nbsp;vs&nbsp; ${p2}</p></div><p class="modal-meta" style="text-align:center"><strong>Partido no jugado</strong> · ${t('status_field')}: ${statusLabel}${m.locked?' · 🔒 '+t('locked_label'):''}</p>`;}
else{document.getElementById('modal-body').innerHTML=`<p class="modal-rep">${t('reported_by')} <strong>${rep}</strong>${m.vBy?` · ${t('validated_by')} <strong>${attr(m.vBy)}</strong>`:''}${m.club?` · Club <strong>${m.club}</strong>`:''}</p><div class="modal-score" style="${clubStyle(m.club)}"><p>${p1} ${sc} ${p2}</p></div><p class="modal-meta">${t('date_field')}: ${fmtDate(m.date)} · ${t('status_field')}: ${statusLabel}${m.locked?' · 🔒 '+t('locked_label'):''}</p>`;}
const acts=document.getElementById('modal-actions');let h='';const isAdmin=esAdmin(currentUser);const isPend=m.status==='pending';
if(isAdmin){
  // El botón no se dibuja si el partido es propio: confirmM() lo rechazaría igual,
  // y un botón que existe pero no funciona confunde más que no tenerlo.
  if(isPend) h+=`<button class="btn btn-success" onclick="confirmM()"><i class="ti ti-check"></i> ${t('validate')}</button>`;
  if(!m.po&&!m.np) h+=`<button class="btn btn-primary" onclick="adminEdit(${mid})"><i class="ti ti-edit"></i> ${t('edit')}</button>`;
  h+=`<button class="btn btn-danger" onclick="deleteMatch(${mid})"><i class="ti ti-trash"></i> ${t('delete_match')}</button>`;
} else {
  if(isPend&&involvedPend(m)) h+=`<button class="btn btn-danger" onclick="disputeM()"><i class="ti ti-x"></i> ${t('dispute')}</button>`;
  else if(m.status==='confirmed'&&!m.po) h+=`<span class="lock-note" style="align-self:center">${t('validated_only_admin')}</span>`;
}
h+=`<button class="btn" onclick="closeM()">${t('close')}</button>`;acts.innerHTML=h;document.getElementById('modal-bg').classList.add('open');}
function closeM(){document.getElementById('modal-bg').classList.remove('open');}
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeM();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeM();});
function confirmM(){if(!(esAdmin(currentUser))){toast(t('validated_only_admin'));return;}const m=matches.find(x=>x.id===currentModal);if(m){m.vBy=currentUser.name;m.status='confirmed';m.locked=true;if(m.po){applyPoPending(m);const tr=playoff.tramos[m.ti];const rnd=(()=>{const rounds=m.which==='main'?tr.main:tr.cons;const fe=rounds.length-1-m.ri;return fe===0?'Final':fe===1?'Semifinal':fe===2?'Cuartos':fe===3?'Octavos':'Ronda '+(m.ri+1);})();addLog('Playoff: confirmado',{a:m.poNames[0],b:m.poNames[1],sets:m.sets,winner:m.winner,po:true,cuadro:tr.label,which:m.which,round:rnd});}else{addLog('Liga: confirmado',{a:m.aName,b:m.bName,sets:m.sets,grupo:m.g,po:false});}}closeM();refreshAll();toast(t('toast_confirmed'));persist(true);}
function disputeM(){const m=matches.find(x=>x.id===currentModal);if(m)m.status='disputed';closeM();refreshAll();toast(t('toast_disputed'));persist(true);}
function deleteMatch(mid){if(confirm(t('confirm_delete'))){const dm=matches.find(x=>x.id===mid);if(dm){if(dm.po){const tr=playoff.tramos[dm.ti];addLog('Playoff: eliminado',{a:dm.poNames[0],b:dm.poNames[1],sets:dm.sets,po:true,cuadro:tr?tr.label:'',which:dm.which});}else{addLog('Liga: eliminado',{a:dm.aName,b:dm.bName,sets:dm.sets,grupo:dm.g,po:false});}}matches=matches.filter(x=>x.id!==mid);closeM();refreshAll();toast(t('match_deleted'));persist(true);}}
function adminEdit(mid){const m=matches.find(x=>x.id===mid);closeM();showSub('cargar');populateForm(m.g,m.aName,m.bName);pickClub(m.club);['s1a','s1b','s2a','s2b','s3a','s3b'].forEach(id=>document.getElementById(id).value='');document.getElementById('s3-row').style.display='none';m.sets.forEach((s,i)=>{const a=document.getElementById(`s${i+1}a`),b=document.getElementById(`s${i+1}b`);if(a)a.value=s[0];if(b)b.value=s[1];if(i===2)document.getElementById('s3-row').style.display='flex';});document.getElementById('f-fecha').value=m.date;}

function setTotalCycles(val){
  const newTotal = parseInt(val);
  if(newTotal < activeN) {
    toast('No puedes reducir a menos ciclos de los que ya están en juego.');
    renderAdmin(); 
    return;
  }
  if(newTotal === cycles.length) return;

  if(newTotal > cycles.length) {
    for(let i = cycles.length; i < newTotal; i++) {
      cycles.push({n: i+1, status: 'locked', groups: null});
      FECHAS.push('');
    }
  } else {
    cycles.splice(newTotal);
    FECHAS.splice(newTotal);
  }
  persist(true);
  renderCycleBar();
  renderAdmin();
  toast('Cantidad de ciclos actualizada a ' + newTotal + '.');
}


// ============================================================================
// Recalcular puntos por posición de todos los grupos.
//
// Se llama SOLO desde el panel de administrador (Ciclos y Configuración,
// sección "Recalcular puntos por posición"). NO se llama desde el botón
// "Editar" de cada grupo — ese botón abre editPuntosUI() para edición 100%
// manual, sin recalcular nada automáticamente.
//
// Qué hace: regenera PUNTOS para TODOS los grupos del ciclo activo con la
// escala estándar de la liga:
//   - El ÚLTIMO grupo SIEMPRE ancla en 1 punto para el último puesto,
//     subiendo de a 1 por posición (…,2,3,4,5 para el 1º puesto del último grupo).
//   - Cada grupo hacia ARRIBA suma STEP puntos al ganador (1er puesto).
//   - Dentro de un mismo grupo, cada posición baja 1 punto respecto a la anterior,
//     con piso en 1 punto (nunca negativo ni cero).
//   - Si un grupo tiene más de 5 jugadores, del 6º puesto en adelante se repite
//     el valor del 5º puesto (no sigue bajando).
//
// Es la MISMA fórmula que usa "Generar escala automática" con STEP=3 fijo,
// pero sin pedir el valor a mano — es la escala estándar de la liga.
//
// Ejemplo con 3 grupos de 5 (STEP=3):
//   Grupo 3 (último): 5,4,3,2,1
//   Grupo 2:          8,7,6,5,4   (5+1*3=8)
//   Grupo 1:          11,10,9,8,7 (5+2*3=11)
// ============================================================================
function recalcularPuntajesGrupos(){
  if(!esAdmin(currentUser)){
    toast(t('own_match_admin') || 'Solo administradores.');
    return;
  }
  const c = cycles[activeN - 1];
  if(!c || !Array.isArray(c.groups) || !c.groups.length){
    toast('No hay ciclo activo.');
    return;
  }
  if(!confirm('Esto va a sobrescribir los puntos por posición de TODOS los grupos del ciclo activo con la escala estándar (paso 3). ¿Confirmás?')) return;

  const STEP = 3;   // cuánto sube el 1er puesto de un grupo al siguiente hacia arriba
  const BASE = 5;   // escalones definidos (1º a 5º); del 6º en adelante se repite el 5º
  const numGrupos = c.groups.length;

  const nuevoPUNTOS = {};
  for(let gi = 0; gi < numGrupos; gi++){
    const gid = gi + 1;
    const g = c.groups[gi];
    // Cantidad de posiciones a generar: el tamaño real del grupo, con mínimo
    // BASE para no perder escalones si el grupo está incompleto.
    const nPlayers = (g && Array.isArray(g.players)) ? g.players.length : 0;
    const N = Math.max(nPlayers, BASE);
    // El ÚLTIMO grupo ancla en BASE (5) para el ganador. Cada grupo hacia
    // arriba (número menor) suma STEP. distanciaDesdeAbajo=0 para el último.
    const distanciaDesdeAbajo = numGrupos - gid;
    const ganador = BASE + distanciaDesdeAbajo * STEP;
    const arr = [];
    for(let pos = 0; pos < N; pos++){
      const escalon = Math.min(pos, BASE - 1);
      arr.push(Math.max(1, ganador - escalon));
    }
    nuevoPUNTOS[gid] = arr;
  }
  PUNTOS = nuevoPUNTOS;

  try { refreshAll(); } catch(_){}
  try { renderAll(); } catch(_){}
  try { renderAdmin(); } catch(_){}
  if(typeof persist === 'function') persist(true);
  toast('Puntos recalculados con la escala estándar (paso 3, último puesto del último grupo = 1 punto).');
}
