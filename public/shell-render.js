// ============================================================================
// public/shell-render.js — shell principal, tabs, cabecera
// Extraído del index.html original (líneas del script: 2351..2487).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
function renderShell(){renderCycleBar();renderSubTabs();updateBadge();if(window.SohailUI)SohailUI.renderNav();}
function renderCycleBar(){
  const bar=document.getElementById('cycle-bar');
  let html='';
  cycles.forEach(c=>{
    const playable=!!c.groups;
    const isView=viewCycle===c.n;
    const icon=c.status==='finished'?'<i class="ti ti-circle-check st"></i>':c.status==='active'?'<i class="ti ti-player-play st"></i>':'<i class="ti ti-lock st"></i>';
    // Fecha corta ("Sep 12 - Oct 10") debajo del nombre del ciclo, centrada.
    // Se lee de FECHAS[c.n-1] en cada render — dinámica: si el admin la
    // edita desde el panel, el próximo renderCycleBar() (disparado por
    // renderShell(), que corre en casi cualquier navegación) ya la muestra
    // actualizada, sin ningún paso manual de refresco.
    const fechaCorta=fmtRangeShort(FECHAS[c.n-1]||'');
    const fechaHtml=fechaCorta?`<span class="cycle-tab-date">${fechaCorta}</span>`:'';
    html+=`<button class="cycle-tab ${playable?'':'locked'} ${isView?'active':''}" onclick="${playable?`SohailUI.chooseCycle(${c.n})`:''}"><span class="cycle-tab-main">${icon} ${t('cycle')} ${c.n}</span>${fechaHtml}</button>`;
  });
  const showPO=playoff.started||(playoff.preview&&esAdmin(currentUser));
  const poLabel=showPO?(playoff.preview&&!playoff.started?`<i class="ti ti-eye st"></i> ${t('playoffs_prev')}`:`<i class="ti ti-tournament st"></i> ${t('playoffs')}`):`<i class="ti ti-lock st"></i> ${t('playoffs')}`;
  // Play Offs no tiene un solo rango en FECHAS: tiene una fecha POR RONDA en
  // PO_FECHAS. fmtPlayoffRangeShort() junta todas las cargadas y muestra de
  // la más vieja a la más nueva (ver su comentario en core-estado.js).
  const poFechaCorta=showPO?fmtPlayoffRangeShort():'';
  const poFechaHtml=poFechaCorta?`<span class="cycle-tab-date">${poFechaCorta}</span>`:'';
  html+=`<button class="cycle-tab ${showPO?'':'locked'} ${viewCycle==='po'?'active':''}" onclick="${showPO?`SohailUI.chooseCycle('po')`:''}"><span class="cycle-tab-main">${poLabel}</span>${poFechaHtml}</button>`;
  bar.innerHTML=html;
}
function renderSubTabs(){
if(window.SohailUI){SohailUI.tabDefs();return;}
const tabs=document.getElementById('tabs');tabs.style.display='flex';const showPO=playoff.started||(playoff.preview&&esAdmin(currentUser));const inPO=viewCycle==='po';let tabs_def=[];if(showPO){tabs_def.push({id:'po',i:'ti-tournament',l:t('playoffs'),po:true});}else{tabs_def.push({id:'grupos',i:'ti-layout-grid',l:t('tab_grupos')});}tabs_def.push({id:'general',i:'ti-chart-bar',l:t('tab_general')});if(RATING_ON)tabs_def.push({id:'rating',i:'ti-star',l:'Rating'});if(!_ligaReadOnly){tabs_def.push({id:'cargar',i:'ti-upload',l:esAdmin(currentUser)?t('tab_cargar_admin'):t('tab_cargar')});tabs_def.push({id:'pendientes',i:'ti-bell',l:esAdmin(currentUser)?t('tab_pendientes_admin'):t('tab_pendientes'),b:true,badgeId:'pend-n'});tabs_def.push({id:'mensajes',i:'ti-message-circle',l:t('tab_mensajes'),b:true,badgeId:'msg-n'});tabs_def.push({id:'perfil',i:'ti-user',l:t('tab_perfil')});}if((typeof rgHasContent==='function'?rgHasContent():REGLAMENTO&&REGLAMENTO.trim())||esAdmin(currentUser)){tabs_def.push({id:'reglamento',i:'ti-book',l:t('rg_tab')});}if(!_ligaReadOnly&&esAdmin(currentUser)){tabs_def.push({id:'admin',i:'ti-settings',l:t('tab_admin')});tabs_def.push({id:'historial',i:'ti-history',l:'Historial'});}tabs.innerHTML=tabs_def.map(x=>{
  // El botón "Play Offs" de esta fila se marca activo solo cuando subView
  // vale 'po' — es decir, cuando se acaba de entrar a Play Offs y todavía
  // no se eligió ninguna sub-pestaña (Cargar, Mensajes, etc.). Antes usaba
  // inPO (viewCycle==='po'), que sigue siendo true aunque el usuario ya
  // esté en "Cargar" DENTRO de Play Offs — ahí quedaban DOS botones
  // marcados 'active' en esta fila a la vez ("Play Offs" y "Cargar").
  if(x.po){const active=subView==='po';return '<button class="tab'+(active?' active':'')+'" id="tab-po" onclick="viewCyc(\'po\')"><i class="ti ti-tournament" aria-hidden="true"></i> '+x.l+'</button>';}
  // El resaltado de una pestaña normal (Mensajes, Cargar, Perfil, etc.) se
  // basa PURA Y EXCLUSIVAMENTE en subView. subView puede valer 'po' (ver
  // arriba) además de los ids reales de pestaña, así que nunca coincide
  // por accidente con ninguna de estas.
  const active=subView===x.id;const extraCls=(x.id==='historial'||x.id==='admin')?' tab-sm':'';return '<button class="tab'+extraCls+(active?' active':'')+'" id="tab-'+x.id+'" onclick="showSub(\''+x.id+'\')" ><i class="ti '+x.i+'" aria-hidden="true"></i> '+x.l+(x.b?' <span class="tab-n" id="'+x.badgeId+'" style="display:none">0</span>':'')+'</button>';}).join('');}
function viewCyc(n){
  if(window.SohailUI&&!SohailUI.canLeave(n==='po'?'po':'grupos'))return;
  if(n==='po'&&!(playoff.started||playoff.preview&&esAdmin(currentUser)))return;
  if(n!=='po'&&!cycles.find(c=>c.n===n&&c.groups))return;
  viewCycle=n;
  if(n==='po'){
    subView='po';document.querySelectorAll('#main-app > [id^="view-"]').forEach(el=>el.style.display='none');
    document.getElementById('view-playoff').style.display='block';try{detenerPollingMensajes();}catch(_){}
    renderShell();updateHdr();showPlayoffView();
  }else{
    const remembered=window.SohailUI?SohailUI.remembered(n):undefined;
    const loc=currentUser?findLoc(currentUser.name,n):null;
    selGroup=remembered||loc?.g||selGroup||1;
    const c=cycles.find(c=>c.n===n);if(selGroup>c.groups.length)selGroup=1;
    renderShell();showSub('grupos');
  }
  if(window.SohailUI)SohailUI.afterView();
}
function showSub(name){
  if(name==='liga-resultados'){if(window.SohailUI)SohailUI.openLeagueResults();return;}
  if(name==='po'||name==='playoff'){viewCyc('po');return;}
  if(window.SohailUI&&(!SohailUI.allowed(name)||!SohailUI.canLeave(name)))return;
  if(viewCycle==='po'&&name==='grupos')viewCycle=activeN;
  if(name==='inicio'||name==='resumen')viewCycle=playoff.started?'po':activeN;
  subView=name;
  document.querySelectorAll('#main-app > [id^="view-"]').forEach(el=>{el.style.display='none';el.classList.remove('view-fade');});
  renderSubTabs();const active=document.getElementById('view-'+name);if(active)active.style.display='block';
  if(name==='grupos')renderGrupos();if(name==='general')renderGeneral();
  if(name==='cargar')populateForm();if(name==='pendientes')renderPend();
  if(name==='admin')renderAdmin();if(name==='perfil'||name==='jugadores')renderPerfil();
  if(name==='historial')renderHistorial();if(name==='rating')renderRating();if(name==='reglamento')renderReglamento();
  if(name==='mensajes')renderMensajes();else try{detenerPollingMensajes();}catch(_){}
  updateHdr();if(name!=='pendientes')renderPend();updateBadge();renderCycleBar();
  if(window.SohailUI)SohailUI.afterView();
}
function updateHdr(){
  // El subtítulo del header ya NO incluye el rango de fechas del ciclo — se
  // movió a una línea propia, centrada, debajo del nombre de cada pestaña de
  // ciclo en renderCycleBar() (shell-render.js). Acá solo queda el nombre y
  // el estado, que es información sobre la SESIÓN de navegación (qué ciclo
  // estoy viendo), no del ciclo en sí — coherente con "un poco de aire" pedido
  // para esta zona.
  const hs=viewCycle==='po'?t('playoffs'):t('cycle')+' '+viewCycle+' · '+(cycles[viewCycle-1]?t('fix_cycle_'+cycles[viewCycle-1].status):'');
  const sub=document.getElementById('hdr-sub');if(sub)sub.textContent=hs;
// hdr-title y login-title usan el nombre OFICIAL de la liga (el mismo que
// "Gestión de ligas"), no LEAGUE_NAME — así el nombre visible acá nunca se
// desincroniza de Gestión de Ligas. LIGA_NOMBRE_OFICIAL llega del servidor
// (login/state); si por algún motivo está vacío (versión vieja de la API),
// cae a LEAGUE_NAME como antes.
const nombreOficial=(LIGA_NOMBRE_OFICIAL&&LIGA_NOMBRE_OFICIAL.trim())?LIGA_NOMBRE_OFICIAL:LEAGUE_NAME;
const lsub=document.getElementById('login-sub');if(lsub)lsub.textContent=LEAGUE_SUBTITLE||'';const tit=document.getElementById('hdr-title');if(tit)tit.textContent=nombreOficial||t('app_title');
const lt=document.getElementById('login-title');if(lt)lt.textContent=nombreOficial||t('app_title');const eb=document.getElementById('exit-btn');if(eb)eb.textContent=t('exit');
try{ refreshHdrLigaSwitch(); }catch(_){}
}

function groupCardHTML(gid){
  try {
      const c=cycles[viewCycle-1];
      if(!c || !c.groups || !c.groups[gid-1]) return '';
      const isActive=c.status==='active'||!!c.editMode;
      const grp=c.groups[gid-1];
      const players=(grp.players||[]).filter(Boolean); // Filtro contra nulls
      let st=computeStats(viewCycle,gid);
      if(!DESTINO) DESTINO = {};
      const dest=DESTINO[gid] || ensureDestino(gid, Math.max(1, players.length));
      
      const fc={};
      players.forEach(p=>{const f=p.split(' ')[0];fc[f]=(fc[f]||0)+1;});
      const lbl=p=>{if(!p)return'';const f=p.split(' ')[0];return fc[f]>1?p:f;};

      // Reordenar para la clasificación: los activos primero (respetando el orden por
      // desempate que ya trae computeStats), y los inactivos al final, ordenados entre
      // ellos por nivel (rating). Así un jugador que se dio de baja no ocupa un puesto
      // por encima de los que siguen compitiendo.
      const _esInact = nm => USERS[nm] && USERS[nm].inactive;
      // Se guarda la posición ORIGINAL (_pos0) ANTES de reordenar, para que los puntos
      // En la mini-clasificación del grupo: los activos siempre aparecen. Los inactivos
      // aparecen si y solo si jugaron al menos un partido en este ciclo/grupo. Si un
      // inactivo no jugó nada en este ciclo, no tiene sentido que ocupe un puesto.
      st.forEach((s,idx) => { s._pos0 = idx; });
      st = st.filter(s => {
        if(!_esInact(s.name)) return true;  // activos siempre
        return matches.some(m => !m.po && m.cycle===viewCycle && m.g===gid
          && (m.aName===s.name || m.bName===s.name));
      });

      let cls=st.map((s,i)=>{
        const pos0 = (s._pos0 !== undefined) ? s._pos0 : i;
        const d=dest[pos0]||'',dn=parseInt((d||'G99').replace('G',''));
        const ar=dn<gid?'dest-up':dn>gid?'dest-down':'dest-same';
        const ic=dn<gid?'↑':dn>gid?'↓':'=';
        const pendingDest=typeof SohailDestinos!=='undefined'&&SohailDestinos.meta({DESTINO})&&!SohailDestinos.validDestination(d,c.groups.length);
        const ex=pos0===0?2:0;
        const base=ptsForPos(gid,pos0);
        // Ajuste manual del admin (bonus/penalidad) sobre el Total de ESTE
        // jugador en ESTE ciclo/grupo — independiente de su posición. Ver
        // AJUSTES_PUNTOS en core-estado.js. 0 si nunca se tocó.
        const ajuste = (AJUSTES_PUNTOS[viewCycle] && AJUSTES_PUNTOS[viewCycle][gid] && AJUSTES_PUNTOS[viewCycle][gid][s.name]) || 0;
        const totalFinal = base + ex + ajuste;
        const ajusteTxt = ajuste ? ` <span class="pts-ajuste ${ajuste>0?'pos':'neg'}">${ajuste>0?'+':''}${ajuste}</span>` : '';
        // Botón de ajuste manual: solo admin, discreto (lápiz chico) para no
        // saturar la fila. Abre editAjustePuntosUI con el jugador/ciclo/
        // grupo ya resueltos, así el modal no tiene que volver a buscarlos.
        const ajusteBtn = esAdmin(currentUser)
          ? `<button class="pts-ajuste-btn" title="${attr(t('pts_ajuste_btn'))}" onclick="editAjustePuntosUI(${viewCycle},${gid},'${jsq(s.name)}')"><i class="ti ti-edit"></i></button>`
          : '';
        const pInactive = USERS[s.name]&&USERS[s.name].inactive;
        const inactiveBadge = pInactive?("<span style=\"font-size:9px;background:#e55;color:#fff;border-radius:3px;padding:1px 4px;margin-left:4px;font-weight:700\">"+t('ui36_text_166')+"</span>"):'';
        return `<tr class="${currentUser&&s.name===currentUser.name?'me-row':''}" style="${pInactive?'opacity:.6':''}"><td>${(d||pendingDest)?`<span class="dest ${pendingDest?'badge-pend':ar}">${pendingDest?t('da_review'):ic+groupName(dn)}</span>`:''}</td><td><span class="avatar">${getInitials(s.name)}</span><span class="nm-link" onclick="showPlayerHistory('${jsq(s.name)}')">${s.name}</span>${inactiveBadge}</td>${RATING_ON?'<td class="rt-cell">'+(ratingUTRfmt(s.name)?ratingUTRfmt(s.name)+(ratingUTRDe(s.name)&&ratingUTRDe(s.name).provisional?'<span class="rt-prov" title="'+t('rt_prov_t')+'">~</span>':''):'<span class=\"rt-none\">·</span>')+'</td>':''}<td><strong>${s.pts}</strong></td><td>${s.g}</td><td>${s.p}</td><td>${s.nj||''}</td><td>${s.sg}</td><td>${s.sp}</td><td>${s.sg-s.sp}</td><td>${base}</td><td>${ex>0?ex:''}</td><td><strong>${totalFinal}</strong>${ajusteTxt}${ajusteBtn}</td></tr>`;
      }).join('');
      
      // Para la MATRIZ de resultados: los activos siempre aparecen. Los inactivos
      // aparecen SOLO si tienen al menos un partido en este grupo/ciclo (confirmado,
      // pendiente o disputado). Si un inactivo no jugó nada, no ocupa columna ni fila.
      const playersMtx = players.filter(p => {
        if(!(USERS[p] && USERS[p].inactive)) return true; // activo → siempre
        return matches.some(m => !m.po && m.cycle===viewCycle && m.g===gid
          && (m.aName===p || m.bName===p));
      });
      const head=playersMtx.map(p=>`<th class="${currentUser&&p===currentUser.name?'me-mtx':''}">${lbl(p)}</th>`).join('');
      let mrows=playersMtx.map((p,i)=>{
        const cols=playersMtx.map((q,j)=>{
          if(i===j)return`<td class="res-black"></td>`;
          const m=findMatch(viewCycle,gid,p,q);
          if(m&&m.np)return`<td title="${m.npReason==='injury'?(LANG==='en'?'Injury: not played, no points':'Lesión: no jugado, sin puntos'):t('legend_nj')}" class="cell-club" style="background:${LEAGUE_COLOR_HL};color:${autoTxt(LEAGUE_COLOR_HL)};font-size:10px;font-weight:700" onclick="openModal(${m.id})">${m.npReason==='injury'?(LANG==='en'?'INJ':'LES'):'NJ'}</td>`;
          if(m&&m.status==='confirmed'){
            // WO puro (sets vacíos): mismo look destacado que NJ (fondo
            // amarillo LEAGUE_COLOR_HL, texto chico y bold). Los dos
            // significan "no se jugó" — la diferencia es que WO SÍ
            // atribuye la victoria al rival (ver core-estado.js: m.winner
            // suma .g++ +3pts y el otro .p++ +1pt), mientras que NJ no
            // atribuye nada.
            if(m.wo && (!m.sets || !m.sets.length)){
              return`<td class="cell-club" style="background:${LEAGUE_COLOR_HL};color:${autoTxt(LEAGUE_COLOR_HL)};font-size:10px;font-weight:700" onclick="openModal(${m.id})">WO</td>`;
            }
            // RET (sets + " RET (XX)") o partido normal: render con flip por
            // perspectiva de fila. XX = iniciales del que se retiró (el
            // que perdió, derivado del winner).
            let sc = m.aName===p?m.sets.map(([a,b])=>`${a}-${b}`).join(' '):m.sets.map(([a,b])=>`${b}-${a}`).join(' ');
            if(m.wo && m.winner){
              const _retNm = m.aName===m.winner ? m.bName : m.aName;
              sc = sc + ' RET (' + getInitials(_retNm) + ')';
            }
            return`<td class="cell-club" style="${clubStyle(m.club)}" onclick="openModal(${m.id})">${sc}</td>`;
          }
          if(m&&m.status==='pending'){
            // Pending WO: mismo criterio que confirmed pero con el look
            // pending (fondo warn + reloj) — mantiene la señal de "todavía
            // no validado". Sigue diciendo "WO" en vez de un marcador.
            if(m.wo && (!m.sets || !m.sets.length)){
              return`<td class="cell-pending" onclick="openModal(${m.id})" style="font-weight:700">WO⏳</td>`;
            }
            let sc = m.aName===p?m.sets.map(([a,b])=>`${a}-${b}`).join(' '):m.sets.map(([a,b])=>`${b}-${a}`).join(' ');
            if(m.wo && m.winner){
              const _retNm = m.aName===m.winner ? m.bName : m.aName;
              sc = sc + ' RET (' + getInitials(_retNm) + ')';
            }
            return`<td class="cell-pending" onclick="openModal(${m.id})">${sc}⏳</td>`;
          }
          if(m&&m.status==='disputed')return`<td class="cell-disputed" style="background:${COLOR_DISPUTA};color:${autoTxt(COLOR_DISPUTA)}" onclick="openModal(${m.id})">disp.</td>`;
          if(isActive&&canCreate(gid,p,q))return`<td class="cell-empty" onclick="openLoadModal(${gid},'${jsq(p)}','${jsq(q)}')">+</td>`;
          return`<td class="cell-locked">·</td>`;
        }).join('');
        return`<tr class="${currentUser&&p===currentUser.name?'me-mtx-row':''}"><td class="${currentUser&&p===currentUser.name?'me-mtx':''}"><span class="nm-link" onclick="showPlayerHistory('${jsq(p)}')">${lbl(p)}</span></td>${cols}</tr>`;
      }).join('');
      
      const thPtsText = t('pts_classif') + (esAdmin(currentUser) ? ` <button class="edit-pts-btn" onclick="editPuntosUI(${gid})"><i class="ti ti-edit"></i> Editar</button>` : '');
      const thr=`<tr><th>${t('destination')}</th><th>${t('player')}</th>${RATING_ON?'<th>'+t('rating_col')+'</th>':''}<th>Pts</th><th>${t('won')}</th><th>${t('lost')}</th><th>${t('not_played')}</th><th data-ui-stat="sets">${t('sets_won')}</th><th>${t('sets_lost')}</th><th>${t('balance')}</th><th data-ui-stat="points">${t('pts_pos')}</th><th>${t('extra')}</th><th>${t('total')}</th></tr>`;
      
      const jump=(kind,label)=>`<button type="button" class="ui-link-button" data-ui-jump="${kind}" data-gid="${gid}">${attr(label)}</button>`;
      const matrix=mrows.replace(/<td([^>]*onclick="[^"]+"[^>]*)>/g,'<td$1 role="button" tabindex="0">');
      return `<div class="grp-card ui-group-card" id="ui-group-${gid}">
      <section class="card ui-standings-section"><div class="ui-section-heading"><h2>${t('ui_positions')} · ${groupName(gid)}</h2>${jump('results',t('ui_to_results'))}</div><p class="ui-muted">${t('cycle')} ${viewCycle} · ${players.length} ${t('players_col')} · ${c.status==='finished'?t('ui_finished'):t('ui_active')}</p>
      <div class="overflow-x ui-standings-scroll" role="region" aria-label="${attr(t('ui_positions')+' · '+groupName(gid))}" tabindex="0"><table class="cls-table"><caption class="ui-sr-only">${groupName(gid)} · ${t('cycle')} ${viewCycle}</caption><thead><tr class="clg-head"><th colspan="${RATING_ON?10:9}"></th><th colspan="3">${thPtsText}</th></tr>${thr}</thead><tbody>${cls}</tbody></table></div>
      <div class="ui-table-shortcuts">${jump('sets',t('ui_sets_balance')+' →')}${jump('points',t('ui_final_points')+' →')}</div><p class="ui-scroll-note">${t('ui_scroll_hint')}</p></section>
      <section class="card ui-matrix-section"><div class="ui-section-heading"><h2>${t('ui_results')} · ${groupName(gid)}</h2>${jump('positions',t('ui_back_positions'))}</div><p class="legend-txt ui-matrix-hint">${t('legend_matrix')}</p><div class="overflow-x ui-matrix-scroll" role="region" aria-label="${attr(t('ui_results')+' · '+groupName(gid))}" tabindex="0"><table class="res-table"><caption class="ui-sr-only">${t('ui_results')} · ${t('cycle')} ${viewCycle}</caption><thead><tr><th scope="col">${t('players_col')}</th>${head}</tr></thead><tbody>${matrix}</tbody></table></div></section>
      <section class="card ui-legend-section"><h3>${t('ui_group_legend')}</h3><p class="legend-txt">${t('legend_pts')}</p></section></div>`;
  } catch(e) {
      console.error("Error regenerando tabla del grupo:", gid, e);
      return `<div class="card"><div class="alert alert-err">Datos corruptos en el Grupo ${gid}.</div></div>`;
  }
}

// ¿Puede esta persona VALIDAR este partido al cargarlo?
// Es admin, sí — pero no si lo jugó ella. Un jugador ascendido que carga su propio
// resultado lo dejaba 'confirmed' al instante y su rival no podía ni disputarlo
// (un confirmado ya no admite disputa). Ahora va a 'pending' como el de cualquiera:
// su rival puede disputarlo, y lo confirma OTRO administrador. Confirmar es acción
// de admin: el rival no tiene ese botón, solo el de disputa.
// ¿Este partido lo jugué yo? Sirve para todas las acciones de admin: validar,
// marcar no jugado, resolver una disputa. Un admin que además juega no debe
// arbitrar sus propios partidos: lo hace su rival o cualquier otro admin.
function esMiPartido(m){
  if(!m || !currentUser) return false;
  const yo = currentUser.name;
  if(m.po) return !!(m.poNames && m.poNames.includes(yo));
  return m.aName === yo || m.bName === yo;
}
