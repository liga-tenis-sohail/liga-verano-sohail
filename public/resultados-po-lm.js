// ============================================================================
// public/resultados-po-lm.js — modales de carga de playoff y load modal unificado
// Extraído del index.html original (líneas del script: 5854..6363).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
let poFormClub = '';
function pickPoClub(c) {
    poFormClub = c;
    const box = document.getElementById('po-club-pick');
    if(box){
      box.querySelectorAll('.club-opt').forEach(el=>{
        el.classList.toggle('club-sel', el.getAttribute('data-club')===c);
      });
      box.classList.remove('req-empty');
    }
}

function poReport(ti,which,ri,mi){
  const tr = playoff.tramos[ti];
  const m = (which === 'main' ? tr.main : tr.cons)[ri][mi];
  if(!m.a || !m.b){toast(t('po_report_no_players')); return;}
  if(m.locked && !esAdmin(currentUser)){toast(t('po_locked')); return;}
  // Verificación de "sos jugador del partido" para no-admins.
  //
  // Antes: `currentUser.role === 'player'` bloqueaba también a admins ascendidos
  // (que tienen role='player' pero isAdmin=true). Y el `!==` estricto podía
  // fallar por espacios sobrantes o mayúsculas/minúsculas invisibles al usuario.
  //
  // Ahora: usar esAdmin() como criterio canónico, y normalizar los nombres antes
  // de comparar. Así un admin puede cargar cualquier partido, y un jugador puede
  // cargar el suyo aunque el nombre en el bracket tenga un espacio extra.
  if(!esAdmin(currentUser)){
    const _n = (s)=>String(s||'').trim().toLocaleLowerCase('es');
    const mine = _n(currentUser.name);
    if(_n(m.a) !== mine && _n(m.b) !== mine){toast(t('po_not_yours')); return;}
  }
  poContext = {ti,which,ri,mi};
  openPoForm(m,ti);
}

function openPoForm(m,ti){
  const existing = m.locked && m.sets && m.sets.length;
  document.getElementById('modal-title').textContent = (existing ? t('edit_result') : t('po_load_result')) + ' · ' + tf('po_match',{l:playoff.tramos[ti].label});
  
  const s1a = existing ? m.sets[0][0] : '', s1b = existing ? m.sets[0][1] : '', s2a = existing ? m.sets[1]?.[0] : '', s2b = existing ? m.sets[1]?.[1] : '';
  const s3 = existing && m.sets[2]; const s3a = s3 ? m.sets[2][0] : '', s3b = s3 ? m.sets[2][1] : '';

  const extMatch = matches.find(x => x.po && x.ti === ti && x.which === poContext.which && x.poNames && x.poNames.includes(m.a) && x.poNames.includes(m.b));
  const extDate = extMatch && extMatch.date ? extMatch.date : (()=>{const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');})();
  poFormClub = extMatch && extMatch.club ? extMatch.club : '';

  document.getElementById('modal-body').innerHTML = `
  <div class="req-wrap" style="margin-bottom:1.25rem">
    <div class="form-row" style="margin-bottom:0">
      <div class="form-group">
        <label>${t('club_label')} <span class="reqmark">${t('reqmark_label')}</span></label>
        <div class="club-pick" id="po-club-pick">${CLUBS.map(c=>`<div class="club-opt${poFormClub===c.name?' club-sel':''}" data-club="${attr(c.name)}" onclick="pickPoClub('${jsq(c.name)}')" style="--cbg:${c.bg};--ctx:${autoTxt(c.bg)}">${attr(c.name)}</div>`).join('')}</div>
      </div>
      <div class="form-group">
        <label>${t('date_label')} <span class="reqmark">${t('reqmark_label')}</span></label>
        <input type="date" id="po-f-fecha" class="req" value="${extDate}">
      </div>
    </div>
  </div>

  <!-- Nombres arriba, mismo estilo que la sección Cargar (.names-box) -->
  <div class="names-box">
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px">
      <div style="text-align:center;font-weight:700;font-size:14px;color:var(--pri)">${attr(m.a)}</div>
      <div style="color:var(--border2);font-size:13px;font-weight:600;text-align:center">vs</div>
      <div style="text-align:center;font-weight:700;font-size:14px;color:var(--pri)">${attr(m.b)}</div>
    </div>
  </div>

  <!-- Sets con inputs grandes (.score-inp-lg), mismo layout que Cargar -->
  <div class="section-lbl" style="margin-bottom:.5rem">${t('sets_section')||'Resultado por sets'}</div>
  <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;margin-bottom:6px">
    <input type="number" id="po-s1a" min="0" max="7" class="score-inp-lg" oninput="checkPoAutoSTB()" value="${s1a !== '' ? s1a : '0'}">
    <div style="text-align:center"><span style="display:block;font-size:10px;color:var(--text2);margin-bottom:2px">SET 1</span><span class="sep">–</span></div>
    <input type="number" id="po-s1b" min="0" max="7" class="score-inp-lg" oninput="checkPoAutoSTB()" value="${s1b !== '' ? s1b : '0'}">
  </div>
  <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;margin-bottom:6px">
    <input type="number" id="po-s2a" min="0" max="7" class="score-inp-lg" oninput="checkPoAutoSTB()" value="${s2a !== '' ? s2a : '0'}">
    <div style="text-align:center"><span style="display:block;font-size:10px;color:var(--text2);margin-bottom:2px">SET 2</span><span class="sep">–</span></div>
    <input type="number" id="po-s2b" min="0" max="7" class="score-inp-lg" oninput="checkPoAutoSTB()" value="${s2b !== '' ? s2b : '0'}">
  </div>
  <!-- Fila de supertiebreak: oculta por defecto salvo que el partido existente ya tenga tercer set -->
  <div id="po-s3-row" style="display:${s3 ? 'grid' : 'none'};grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;margin-bottom:6px">
    <input type="number" id="po-s3a" min="0" class="score-inp-lg" value="${s3a !== '' ? s3a : '0'}">
    <div style="text-align:center"><span style="display:block;font-size:10px;color:var(--text2);margin-bottom:2px">S.TB</span><span class="sep">–</span></div>
    <input type="number" id="po-s3b" min="0" class="score-inp-lg" value="${s3b !== '' ? s3b : '0'}">
  </div>
  <div style="text-align:center;margin-bottom:.5rem"><span class="set-hint">${t('set_hint')||'6-0 a 6-4, 7-5 o 7-6'}</span></div>

  <!-- Botón toggle del supertiebreak, mismo comportamiento que la sección Cargar -->
  <div style="text-align:center;margin-top:8px">
    <button class="btn btn-sm" id="po-stb-toggle-btn" onclick="togglePoSTB()"><i class="ti ti-${s3?'x':'plus'}"></i> ${s3?(t('remove_stb')||'Quitar STB'):(t('add_stb')||'Supertiebreak (1-1)')}</button>
  </div>

  ${(esAdmin(currentUser)||m.a===currentUser.name||m.b===currentUser.name)?`
  <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border)">
    <div id="po-ret-toggle-wrap" style="text-align:center;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
      <button class="btn btn-sm" id="po-ret-toggle-btn" onclick="togglePoRetiro()" style="background:#FEE2E2;color:#991B1B;border-color:#FCA5A5;font-weight:600"><i class="ti ti-flag"></i> RET (se jugó algo y se retiró)</button>
      <button class="btn btn-sm" id="po-wo-toggle-btn" onclick="togglePoWO()" style="background:var(--hl);color:var(--priD);border-color:var(--priD);font-weight:600"><i class="ti ti-ban"></i> W.O. (no se jugó nada)</button>
    </div>
    <div id="po-ret-panel" style="display:none">
      <p style="font-size:12px;color:#991B1B;margin-bottom:.5rem;text-align:center;font-weight:600">Cargá arriba los sets que SÍ se jugaron (dejá 0-0 los que no) y elegí quién se retiró:</p>
      <div style="text-align:center">
        <select id="po-ret-quien" style="font-size:13px;padding:6px 10px;border-radius:8px;border:1px solid #FCA5A5">
          <option value="">— ¿Quién se retiró? —</option>
          <option value="${attr(m.a)}">${attr(m.a)}</option>
          <option value="${attr(m.b)}">${attr(m.b)}</option>
        </select>
      </div>
    </div>
    <div id="po-wo-panel" style="display:none">
      <p style="font-size:12px;color:var(--priD);margin-bottom:.5rem;text-align:center;font-weight:600">W.O. — el partido no se jugó, ¿quién no se presentó?</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-sm" onclick="confirmarPoWO('${jsq(m.a)}','${jsq(m.b)}')" style="background:var(--hl);color:var(--priD);border-color:var(--priD);font-weight:600"><i class="ti ti-ban"></i> Falta ${attr(m.a)} · avanza ${attr(m.b)}</button>
        <button class="btn btn-sm" onclick="confirmarPoWO('${jsq(m.b)}','${jsq(m.a)}')" style="background:var(--hl);color:var(--priD);border-color:var(--priD);font-weight:600"><i class="ti ti-ban"></i> Falta ${attr(m.b)} · avanza ${attr(m.a)}</button>
      </div>
    </div>
  </div>`:''}
  <p class="lock-note" id="po-alert" style="margin-top:.5rem"></p>`;

  let actions = `<button class="btn btn-accent" onclick="submitPo()"><i class="ti ti-send"></i> ${esAdmin(currentUser) ? t('save_validate') : t('send')}</button>`;
  if(existing && esAdmin(currentUser)){
    actions += `<button class="btn btn-danger" onclick="deletePo()" style="margin-left:.25rem"><i class="ti ti-trash"></i> Eliminar</button>`;
  }
  actions += `<button class="btn" onclick="closeM()">${t('close')}</button>`;
  document.getElementById('modal-actions').innerHTML = actions;
  document.getElementById('modal-bg').classList.add('open');
}

// Toggle del supertiebreak dentro del modal de playoff. Espeja el comportamiento
// de toggleSTB() de la sección Cargar: si está oculto lo muestra y cambia el
// label del botón; si está visible lo oculta y limpia los valores.
function togglePoSTB(){
  const row = document.getElementById('po-s3-row');
  const btn = document.getElementById('po-stb-toggle-btn');
  if(!row) return;
  const oculto = row.style.display === 'none' || row.style.display === '';
  if(oculto){
    row.style.display = 'grid';
    if(btn) btn.innerHTML = '<i class="ti ti-x"></i> ' + (t('remove_stb') || 'Quitar STB');
    // Inicializamos en "0" (no vacíos) para mantener el look de la sección Cargar,
    // donde todos los inputs de score arrancan visibles con "0" en negro.
    ['po-s3a','po-s3b'].forEach(id => { const e = document.getElementById(id); if(e) e.value = '0'; });
  } else {
    row.style.display = 'none';
    if(btn) btn.innerHTML = '<i class="ti ti-plus"></i> ' + (t('add_stb') || 'Supertiebreak (1-1)');
    ['po-s3a','po-s3b'].forEach(id => { const e = document.getElementById(id); if(e) e.value = ''; });
  }
}
// Panel de retiro (RET) dentro del modal de Play Offs — mismo patrón que
// toggleRetiro() en resultados-y-grupos.js: vive dentro del formulario
// normal, no reemplaza los sets. Reemplaza al viejo flujo (markPoWO con
// botones directos sin sets).
// Panel de retiro (RET) dentro del modal de Play Offs — mismo patrón que
// toggleRetiro() en resultados-y-grupos.js: vive dentro del formulario
// normal, no reemplaza los sets. Al abrirse, oculta el botón de W.O. (son
// mutuamente excluyentes: o se carga con sets, o directo sin sets).
function togglePoRetiro(){
  const panel=document.getElementById('po-ret-panel');
  const btn=document.getElementById('po-ret-toggle-btn');
  const woBtn=document.getElementById('po-wo-toggle-btn');
  if(!panel||!btn) return;
  const abrir = panel.style.display==='none'||panel.style.display==='';
  if(abrir){ panel.style.display='block'; btn.style.display='none'; if(woBtn)woBtn.style.display='none'; }
  else{ panel.style.display='none'; btn.style.display='inline-flex'; if(woBtn)woBtn.style.display='inline-flex'; const sel=document.getElementById('po-ret-quien'); if(sel) sel.value=''; }
}
// Panel de W.O. (walkover — el partido directamente no se jugó, sin
// ningún set): convive con RET (arriba, para cuando SÍ se jugó algo antes
// del retiro) como una opción separada y más rápida para el caso más
// simple. Al abrirse, oculta el botón de RET.
function togglePoWO(){
  const panel=document.getElementById('po-wo-panel');
  const btn=document.getElementById('po-wo-toggle-btn');
  const retBtn=document.getElementById('po-ret-toggle-btn');
  if(!panel||!btn) return;
  const abrir = panel.style.display==='none'||panel.style.display==='';
  if(abrir){ panel.style.display='block'; btn.style.display='none'; if(retBtn)retBtn.style.display='none'; }
  else{ panel.style.display='none'; btn.style.display='inline-flex'; if(retBtn)retBtn.style.display='inline-flex'; }
}
// Confirma un W.O. directo: sin sets, el ganador avanza inmediato. Mismo
// comportamiento que el markPoWO original (antes de integrar RET al
// formulario de sets) — se mantiene como camino corto para cuando
// directamente no hay nada que cargar. loserName/winnerName ya vienen
// resueltos desde los botones del panel.
function confirmarPoWO(loserName,winnerName){
  if(!poContext)return;
  const ti=poContext.ti,which=poContext.which,ri=poContext.ri,mi=poContext.mi;
  const tr=playoff.tramos[ti];if(!tr||!tr[which])return;
  const m=tr[which][ri][mi];if(!m||!m.a||!m.b)return;
  const isAdmin=esAdmin(currentUser);
  if(!isAdmin && m.a!==currentUser.name && m.b!==currentUser.name){
    toast('Solo los jugadores de ese partido (o el admin) pueden reportar un W.O.');
    return;
  }
  if(!confirm(loserName+' no se presentó.\n\n'+winnerName+' avanza por W.O. '+(isAdmin?'':'Queda pendiente de confirmación.')+'\n\n¿Confirmás?'))return;
  matches=matches.filter(x=>!(x.po&&x.ti===ti&&x.which===which&&x.poNames&&x.poNames.includes(m.a)&&x.poNames.includes(m.b)));
  const newM={id:matchId++,po:true,ti,which,ri,mi,tLabel:tr.label,poNames:[m.a,m.b],sets:[],wo:true,date:'',club:'',status:isAdmin?'confirmed':'pending',vBy:isAdmin?currentUser.name:undefined,reporter:currentUser.name,winner:winnerName,locked:isAdmin};
  matches.push(newM);
  if(isAdmin){
    storePo(ti,which,m.a,m.b,[],winnerName,true);
    rebuildTramo(ti);
  }else{
    applyPoPending(newM);
  }
  addLog(isAdmin?'Playoff: W.O. (admin)':'Playoff: W.O. (reportado)',{a:m.a,b:m.b,winner:winnerName,po:true,cuadro:tr.label,which});
  closeM();
  if(typeof showPlayoffView==='function')showPlayoffView();
  refreshAll();
  toast(isAdmin?(winnerName+' avanza por W.O.'):'W.O. reportado, pendiente de confirmación.');
  persist(true);
}
// Lectura "libre" de sets del modal de Play Offs para un retiro — mismo
// criterio que readSetsLibre() en resultados-y-grupos.js: solo incluye los
// sets que realmente se jugaron (descarta cualquier set en 0-0).
function readPoSetsLibre(){
  const crudos=[[+document.getElementById('po-s1a').value,+document.getElementById('po-s1b').value],[+document.getElementById('po-s2a').value,+document.getElementById('po-s2b').value]];
  if(document.getElementById('po-s3-row').style.display!=='none'){
    crudos.push([+document.getElementById('po-s3a').value,+document.getElementById('po-s3b').value]);
  }
  return crudos.filter(([a,b])=>!(a===0&&b===0));
}

// Auto-show del supertiebreak cuando los 2 sets ya cargados están 1-1. Es el
// equivalente para el modal PO de checkAutoSTB() en la sección Cargar.
function checkPoAutoSTB(){
  const s1a = +document.getElementById('po-s1a').value, s1b = +document.getElementById('po-s1b').value;
  const s2a = +document.getElementById('po-s2a').value, s2b = +document.getElementById('po-s2b').value;
  if(!s1a && !s1b && !s2a && !s2b) return;
  let w1=0, w2=0;
  if(typeof validSet === 'function'){
    if(validSet(s1a,s1b)){ if(s1a>s1b) w1++; else w2++; }
    if(validSet(s2a,s2b)){ if(s2a>s2b) w1++; else w2++; }
  } else {
    if(s1a>s1b) w1++; else if(s1b>s1a) w2++;
    if(s2a>s2b) w1++; else if(s2b>s2a) w2++;
  }
  const row = document.getElementById('po-s3-row');
  const btn = document.getElementById('po-stb-toggle-btn');
  if(!row) return;
  if(w1 === 1 && w2 === 1){
    if(row.style.display === 'none' || row.style.display === ''){
      row.style.display = 'grid';
      if(btn) btn.innerHTML = '<i class="ti ti-x"></i> ' + (t('remove_stb') || 'Quitar STB');
    }
  } else if(w1 === 2 || w2 === 2){
    row.style.display = 'none';
    if(btn) btn.innerHTML = '<i class="ti ti-plus"></i> ' + (t('add_stb') || 'Supertiebreak (1-1)');
    ['po-s3a','po-s3b'].forEach(id => { const e = document.getElementById(id); if(e) e.value = ''; });
  }
}

// ========================================================================
// MODAL PARA CARGAR RESULTADO DESDE LA TABLA DE GRUPOS (celda "+")
// Reemplaza el flujo viejo (prefill → showSub('cargar')), que sacaba al
// usuario de la vista de grupos. Ahora el "+" abre un popup con el mismo
// look and feel del modal de playoffs y guarda en el mismo lugar, sin
// perder el contexto de dónde estaba el usuario.
// ========================================================================
let _lmCtx = null;   // contexto del modal en curso: {gid, n1, n2, editId}
let lmFormClub = '';

function pickLmClub(name){
  lmFormClub = name;
  document.querySelectorAll('#lm-club-pick .club-opt').forEach(el => {
    el.classList.toggle('club-sel', el.getAttribute('data-club') === name);
  });
}

function toggleLmSTB(){
  const row = document.getElementById('lm-s3-row');
  const btn = document.getElementById('lm-stb-toggle-btn');
  if(!row) return;
  const oculto = row.style.display === 'none' || row.style.display === '';
  if(oculto){
    row.style.display = 'grid';
    if(btn) btn.innerHTML = '<i class="ti ti-x"></i> ' + (t('remove_stb') || 'Quitar STB');
    ['lm-s3a','lm-s3b'].forEach(id => { const e = document.getElementById(id); if(e) e.value = '0'; });
  } else {
    row.style.display = 'none';
    if(btn) btn.innerHTML = '<i class="ti ti-plus"></i> ' + (t('add_stb') || 'Supertiebreak (1-1)');
    ['lm-s3a','lm-s3b'].forEach(id => { const e = document.getElementById(id); if(e) e.value = ''; });
  }
}

// Panel de retiro (RET) dentro del modal "+" de grupos. Mismo patrón que
// togglePoRetiro() (playoff) y toggleRetiro() (pestaña Cargar): mutuamente
// excluyente con WO — al abrirse esconde el botón de WO, al cerrarse lo
// vuelve a mostrar. Los selects ya vienen pre-poblados con n1/n2 desde el
// HTML del modal (openLoadModal los conoce por _lmCtx), no hace falta
// popularlos acá como en toggleRetiro().
function toggleLmRetiro(){
  const panel = document.getElementById('lm-ret-panel');
  const btn = document.getElementById('lm-ret-toggle-btn');
  const woBtn = document.getElementById('lm-wo-toggle-btn');
  if(!panel || !btn) return;
  const abrir = panel.style.display === 'none' || panel.style.display === '';
  if(abrir){
    panel.style.display = 'block';
    btn.style.display = 'none';
    if(woBtn) woBtn.style.display = 'none';
  } else {
    panel.style.display = 'none';
    btn.style.display = 'inline-flex';
    if(woBtn) woBtn.style.display = 'inline-flex';
    const sel = document.getElementById('lm-ret-quien');
    if(sel) sel.value = '';
  }
}

// Panel de W.O. (walkover) dentro del modal "+" de grupos. Igual a
// toggleLmRetiro() pero para el otro caso: el partido no se jugó nada.
function toggleLmWO(){
  const panel = document.getElementById('lm-wo-panel');
  const btn = document.getElementById('lm-wo-toggle-btn');
  const retBtn = document.getElementById('lm-ret-toggle-btn');
  if(!panel || !btn) return;
  const abrir = panel.style.display === 'none' || panel.style.display === '';
  if(abrir){
    panel.style.display = 'block';
    btn.style.display = 'none';
    if(retBtn) retBtn.style.display = 'none';
  } else {
    panel.style.display = 'none';
    btn.style.display = 'inline-flex';
    if(retBtn) retBtn.style.display = 'inline-flex';
    const sel = document.getElementById('lm-wo-quien');
    if(sel) sel.value = '';
  }
}

function checkLmAutoSTB(){
  const s1a = +document.getElementById('lm-s1a').value, s1b = +document.getElementById('lm-s1b').value;
  const s2a = +document.getElementById('lm-s2a').value, s2b = +document.getElementById('lm-s2b').value;
  if(!s1a && !s1b && !s2a && !s2b) return;
  let w1=0, w2=0;
  if(typeof validSet === 'function'){
    if(validSet(s1a,s1b)){ if(s1a>s1b) w1++; else w2++; }
    if(validSet(s2a,s2b)){ if(s2a>s2b) w1++; else w2++; }
  } else {
    if(s1a>s1b) w1++; else if(s1b>s1a) w2++;
    if(s2a>s2b) w1++; else if(s2b>s2a) w2++;
  }
  const row = document.getElementById('lm-s3-row');
  const btn = document.getElementById('lm-stb-toggle-btn');
  if(!row) return;
  if(w1 === 1 && w2 === 1){
    if(row.style.display === 'none' || row.style.display === ''){
      row.style.display = 'grid';
      if(btn) btn.innerHTML = '<i class="ti ti-x"></i> ' + (t('remove_stb') || 'Quitar STB');
    }
  } else if(w1 === 2 || w2 === 2){
    row.style.display = 'none';
    if(btn) btn.innerHTML = '<i class="ti ti-plus"></i> ' + (t('add_stb') || 'Supertiebreak (1-1)');
    ['lm-s3a','lm-s3b'].forEach(id => { const e = document.getElementById(id); if(e) e.value = ''; });
  }
}

// Abre el modal para cargar un resultado de liga regular desde el "+".
// gid, n1, n2 = grupo, jugador A, jugador B (mismos parámetros que prefill).
function openLoadModal(gid, n1, n2){
  // Fecha por defecto = hoy
  const hoy = (()=>{ const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
  _lmCtx = { gid, n1, n2, editId: null };
  lmFormClub = '';

  document.getElementById('modal-title').textContent = (t('load_result') || 'Cargar resultado') + ' · ' + groupName(gid);
  document.getElementById('modal-body').innerHTML = `
  <div class="req-wrap" style="margin-bottom:1.25rem">
    <div class="form-row" style="margin-bottom:0">
      <div class="form-group">
        <label>${t('club_label')||'Club'} <span class="reqmark">${t('reqmark_label')||'obligatorio'}</span></label>
        <div class="club-pick" id="lm-club-pick">${CLUBS.map(c=>`<div class="club-opt" data-club="${attr(c.name)}" onclick="pickLmClub('${jsq(c.name)}')" style="--cbg:${c.bg};--ctx:${autoTxt(c.bg)}">${attr(c.name)}</div>`).join('')}</div>
      </div>
      <div class="form-group">
        <label>${t('date_label')||'Fecha'} <span class="reqmark">${t('reqmark_label')||'obligatorio'}</span></label>
        <input type="date" id="lm-f-fecha" class="req" value="${hoy}">
      </div>
    </div>
  </div>
  <div class="names-box">
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px">
      <div style="text-align:center;font-weight:700;font-size:14px;color:var(--pri)">${attr(n1)}</div>
      <div style="color:var(--border2);font-size:13px;font-weight:600;text-align:center">vs</div>
      <div style="text-align:center;font-weight:700;font-size:14px;color:var(--pri)">${attr(n2)}</div>
    </div>
  </div>
  <div class="section-lbl" style="margin-bottom:.5rem">${t('sets_section')||'Resultado por sets'}</div>
  <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;margin-bottom:6px">
    <input type="number" id="lm-s1a" min="0" max="7" value="0" class="score-inp-lg" oninput="checkLmAutoSTB()">
    <div style="text-align:center"><span style="display:block;font-size:10px;color:var(--text2);margin-bottom:2px">SET 1</span><span class="sep">–</span></div>
    <input type="number" id="lm-s1b" min="0" max="7" value="0" class="score-inp-lg" oninput="checkLmAutoSTB()">
  </div>
  <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;margin-bottom:6px">
    <input type="number" id="lm-s2a" min="0" max="7" value="0" class="score-inp-lg" oninput="checkLmAutoSTB()">
    <div style="text-align:center"><span style="display:block;font-size:10px;color:var(--text2);margin-bottom:2px">SET 2</span><span class="sep">–</span></div>
    <input type="number" id="lm-s2b" min="0" max="7" value="0" class="score-inp-lg" oninput="checkLmAutoSTB()">
  </div>
  <div id="lm-s3-row" style="display:none;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;margin-bottom:6px">
    <input type="number" id="lm-s3a" min="0" value="0" class="score-inp-lg">
    <div style="text-align:center"><span style="display:block;font-size:10px;color:var(--text2);margin-bottom:2px">S.TB</span><span class="sep">–</span></div>
    <input type="number" id="lm-s3b" min="0" value="0" class="score-inp-lg">
  </div>
  <div style="text-align:center;margin-bottom:.5rem"><span class="set-hint">${t('set_hint')||'6-0 a 6-4, 7-5 o 7-6'}</span></div>
  <div style="text-align:center;margin-top:8px">
    <button class="btn btn-sm" id="lm-stb-toggle-btn" onclick="toggleLmSTB()"><i class="ti ti-plus"></i> ${t('add_stb')||'Supertiebreak (1-1)'}</button>
  </div>
  <!-- RET/WO en el modal del "+" de grupos: mismo patrón que la pestaña
       Cargar (ret-panel / wo-panel en index.html) pero con IDs 'lm-'
       para no chocar con el form principal. Los dos selects ya vienen
       pre-poblados con n1/n2 desde acá (no hace falta popular en el
       toggle como hace toggleRetiro() en resultados-y-grupos.js, porque
       el modal ya conoce a los dos jugadores del contexto _lmCtx). Los
       jugadores pueden usarlos igual que el admin — queda pendiente hasta
       que el rival lo confirme, como cualquier resultado cargado por un
       jugador. -->
  <div id="lm-ret-toggle-wrap" style="text-align:center;margin-top:.75rem;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
    <button class="btn btn-sm" id="lm-ret-toggle-btn" onclick="toggleLmRetiro()" style="background:#FEE2E2;color:#991B1B;border-color:#FCA5A5;font-weight:600"><i class="ti ti-flag"></i> RET (se jugó algo y se retiró)</button>
    <button class="btn btn-sm" id="lm-wo-toggle-btn" onclick="toggleLmWO()" style="background:var(--hl);color:var(--priD);border-color:var(--priD);font-weight:600"><i class="ti ti-ban"></i> W.O. (no se jugó nada)</button>
  </div>
  <div id="lm-ret-panel" style="display:none;text-align:center;margin-top:.5rem;padding:.6rem;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:10px">
    <p style="font-size:12px;color:#991B1B;margin-bottom:.5rem;font-weight:600">Cargá arriba los sets que SÍ se jugaron (dejá 0-0 los que no) y elegí quién se retiró:</p>
    <select id="lm-ret-quien" style="font-size:13px;padding:6px 10px;border-radius:8px;border:1px solid #FCA5A5">
      <option value="">— ¿Quién se retiró? —</option>
      <option value="${attr(n1)}">${attr(n1)}</option>
      <option value="${attr(n2)}">${attr(n2)}</option>
    </select>
  </div>
  <div id="lm-wo-panel" style="display:none;text-align:center;margin-top:.5rem;padding:.6rem;background:var(--surface2);border:1px solid var(--priD);border-radius:10px">
    <p style="font-size:12px;color:var(--priD);margin-bottom:.5rem;font-weight:600">W.O. — el partido no se jugó, ¿quién no se presentó?</p>
    <select id="lm-wo-quien" style="font-size:13px;padding:6px 10px;border-radius:8px;border:1px solid var(--priD)">
      <option value="">— ¿Quién no se presentó? —</option>
      <option value="${attr(n1)}">${attr(n1)}</option>
      <option value="${attr(n2)}">${attr(n2)}</option>
    </select>
  </div>
  <p class="lock-note" id="lm-alert" style="margin-top:.5rem"></p>`;

  document.getElementById('modal-actions').innerHTML =
    '<button class="btn btn-accent" onclick="submitLoadModal()"><i class="ti ti-send"></i> ' + (esAdmin(currentUser) ? (t('save_validate')||'Guardar y validar') : (t('send')||'Enviar')) + '</button>' +
    '<button class="btn" onclick="closeM()">' + (t('close')||'Cerrar') + '</button>';

  document.getElementById('modal-bg').classList.add('open');
}

// Submit del modal: reutiliza toda la validación existente reciclando submitResult.
function submitLoadModal(){
  if(!_lmCtx){ toast('Sin contexto de carga'); return; }
  const alert = document.getElementById('lm-alert');
  const showErr = msg => { if(alert) alert.innerHTML = '<span style="color:var(--danger)">✕ ' + msg + '</span>'; };
  if(alert) alert.innerHTML = '';
  if(!lmFormClub){
    showErr(t('select_club')||'Elige el club');
    document.getElementById('lm-club-pick').classList.add('req-empty');
    return;
  }
  const fecha = document.getElementById('lm-f-fecha').value;
  if(!fecha){
    showErr(t('select_date')||'Elige la fecha');
    document.getElementById('lm-f-fecha').classList.add('req-empty');
    return;
  }
  // RET/WO en el modal "+": si están activos, cambia la validación de sets.
  //  - WO = no se jugó nada → los sets se ignoran (submitResult los pone en []).
  //  - RET = sets parciales OK → submitResult usa readSetsLibre() que descarta
  //    cualquier set en 0-0.
  //  - Ninguno = validación normal de partido completo (validMatch).
  // Los valores se pasan al form principal (#ret-quien / #wo-quien) más
  // abajo, así submitResult() los lee del DOM como hace normalmente.
  const lmRetQuien = document.getElementById('lm-ret-quien') ? document.getElementById('lm-ret-quien').value : '';
  const lmWoQuien = document.getElementById('lm-wo-quien') ? document.getElementById('lm-wo-quien').value : '';
  const esRetOWo = !!(lmRetQuien || lmWoQuien);
  // Validar los sets ANTES de cerrar el modal.
  const s1a = +document.getElementById('lm-s1a').value, s1b = +document.getElementById('lm-s1b').value;
  const s2a = +document.getElementById('lm-s2a').value, s2b = +document.getElementById('lm-s2b').value;
  const s3Visible = document.getElementById('lm-s3-row').style.display === 'grid' || document.getElementById('lm-s3-row').style.display === 'flex';
  const sets = [[s1a, s1b], [s2a, s2b]];
  if(s3Visible){
    const s3a = +document.getElementById('lm-s3a').value, s3b = +document.getElementById('lm-s3b').value;
    sets.push([s3a, s3b]);
  }
  if(!esRetOWo && typeof validMatch === 'function'){
    const v = validMatch(sets);
    if(!v.ok){ showErr(v.msg); return; }
  }
  // Copiar valores del modal a los inputs originales de la sección Cargar
  const gid = _lmCtx.gid, n1 = _lmCtx.n1, n2 = _lmCtx.n2;
  const gi = gid - 1;
  
  const r = document.getElementById('f-reporter');
  const o = document.getElementById('f-rival');
  
  if(esAdmin(currentUser)){
    const rVal = gi + '|' + n1;
    if(r && ![...r.options].some(op => op.value === rVal)) r.add(new Option(n1, rVal));
    if(r) r.value = rVal;
    
    const oVal = gi + '|' + n2;
    if(o && ![...o.options].some(op => op.value === oVal)) o.add(new Option(n2, oVal));
    if(o) o.value = oVal;
  } else {
    const repName = currentUser.name;
    const rivalName = (currentUser.name === n1) ? n2 : n1;
    
    if(r && ![...r.options].some(op => op.value === repName)) r.add(new Option(repName, repName));
    if(r) r.value = repName;
    
    if(o && ![...o.options].some(op => op.value === rivalName)) o.add(new Option(rivalName, rivalName));
    if(o) o.value = rivalName;
  }
  
  document.getElementById('s1a').value = document.getElementById('lm-s1a').value || '';
  document.getElementById('s1b').value = document.getElementById('lm-s1b').value || '';
  document.getElementById('s2a').value = document.getElementById('lm-s2a').value || '';
  document.getElementById('s2b').value = document.getElementById('lm-s2b').value || '';
  document.getElementById('s3-row').style.display = s3Visible ? 'flex' : 'none';
  if(s3Visible){
    document.getElementById('s3a').value = document.getElementById('lm-s3a').value || '';
    document.getElementById('s3b').value = document.getElementById('lm-s3b').value || '';
  }
  // Copiar el estado de RET/WO al form principal (#ret-quien / #wo-quien).
  // Hay que poblar las opciones porque el select puede estar vacío si el
  // usuario nunca abrió el panel RET/WO en la pestaña Cargar. clearForm()
  // limpia estos selects después del submit, así que no ensucia el form.
  const setDropdown = (id, val) => {
    const el = document.getElementById(id);
    if(!el) return;
    // Asegurar que las 2 opciones de n1/n2 existen (además del placeholder)
    [n1, n2].forEach(name => {
      if(![...el.options].some(op => op.value === name)){
        el.add(new Option(name, name));
      }
    });
    el.value = val || '';
  };
  setDropdown('ret-quien', lmRetQuien);
  setDropdown('wo-quien', lmWoQuien);
  if(typeof pickClub === 'function') pickClub(lmFormClub);
  document.getElementById('f-fecha').value = fecha;
  closeM();
  _lmCtx = null;
  lmFormClub = '';
  submitResult();
}
// El admin hace avanzar a un jugador por WO (walkover): el rival no se presenta / no puede jugar.
// Retiro / walkover en un partido de Play Offs: quien se retira pierde el
// partido sin jugar más sets, el rival avanza directo. Antes esto era
// exclusivo admin ("Marcar como no jugado", confirmado al toque). Ahora
// también lo puede iniciar un jugador del partido — como cualquier otro
// resultado cargado por un jugador, queda 'pending' hasta que el rival lo
// confirme o el admin lo valide; si lo hace el admin, queda 'confirmed'
// directo, igual que siempre.
function deletePoDirect(ti,which,ri,mi){
  if(!confirm('¿Eliminar este resultado? El partido vuelve a estar pendiente.')) return;
  const m = (which === 'main' ? playoff.tramos[ti].main : playoff.tramos[ti].cons)[ri][mi];
  const mRec = matches.find(x=>x.po&&x.ti===ti&&x.which===which&&x.poNames&&x.poNames.includes(m.a)&&x.poNames.includes(m.b));
  addLog('Playoff: eliminado',{a:m.a,b:m.b,sets:mRec?mRec.sets:[],po:true,cuadro:playoff.tramos[ti]?playoff.tramos[ti].label:'',which});
  const k = (which === 'main' ? ti : ti + 'c') + '#' + [m.a, m.b].sort().join('|');
  delete playoff.results[k];
  matches = matches.filter(x => !(x.po && x.ti === ti && x.which === which && ((x.poNames[0] === m.a && x.poNames[1] === m.b) || (x.poNames[0] === m.b && x.poNames[1] === m.a))));
  rebuildTramo(ti); showPlayoffView(); toast('Resultado eliminado.'); persist(true);
}

function deletePo(){
  const ti = poContext.ti, which = poContext.which, ri = poContext.ri, mi = poContext.mi;
  deletePoDirect(ti,which,ri,mi);
  closeM();
}

function submitPo(){
  const retQuien = document.getElementById('po-ret-quien') ? document.getElementById('po-ret-quien').value : '';
  const ti = poContext.ti, which = poContext.which, ri = poContext.ri, mi = poContext.mi;
  const m = (which === 'main' ? playoff.tramos[ti].main : playoff.tramos[ti].cons)[ri][mi];
  let s, winner;
  if(retQuien){
    if(retQuien!==m.a && retQuien!==m.b){
      const a=document.getElementById('po-alert'); a.textContent='Elegí quién se retiró entre los dos jugadores de este partido.'; a.classList.add('err-txt'); return;
    }
    s=readPoSetsLibre();
    winner=retQuien===m.a?m.b:m.a;
  }else{
    s = [
      [+document.getElementById('po-s1a').value, +document.getElementById('po-s1b').value],
      [+document.getElementById('po-s2a').value, +document.getElementById('po-s2b').value]
    ];
    if(document.getElementById('po-s3-row').style.display !== 'none') {
      s.push([+document.getElementById('po-s3a').value, +document.getElementById('po-s3b').value]);
    }
    const v = validMatch(s);
    if(!v.ok){
      const a = document.getElementById('po-alert'); 
      a.textContent = '✕ ' + v.msg; a.classList.add('err-txt'); 
      return;
    }
    let w1 = 0, w2 = 0; s.forEach(([a,b]) => {if(a > b) w1++; else w2++;}); 
    winner = w1 > w2 ? m.a : m.b;
  }

  const fecha = document.getElementById('po-f-fecha').value;
  if(!poFormClub){
      const a = document.getElementById('po-alert'); a.textContent = '✕ Elige el club.'; a.classList.add('err-txt');
      document.getElementById('po-club-pick').classList.add('req-empty');
      return;
  }
  if(!fecha){
      const a = document.getElementById('po-alert'); a.textContent = '✕ Completa la fecha.'; a.classList.add('err-txt');
      document.getElementById('po-f-fecha').classList.add('req-empty');
      return;
  }

  const exPo = matches.find(x => x.po && x.ti === ti && x.which === which && ((x.poNames[0] === m.a && x.poNames[1] === m.b) || (x.poNames[0] === m.b && x.poNames[1] === m.a)));
  if(exPo && exPo.status === 'disputed' && !esAdmin(currentUser)){
    const a=document.getElementById('po-alert'); a.textContent='Este resultado está en disputa. El administrador debe resolverlo primero.'; a.classList.add('err-txt'); return;
  }
  matches = matches.filter(x => !(x.po && x.ti === ti && x.which === which && ((x.poNames[0] === m.a && x.poNames[1] === m.b) || (x.poNames[0] === m.b && x.poNames[1] === m.a))));
  
  if(validaAlCargar(m.a, m.b)){
    storePo(ti, which, m.a, m.b, s, winner, !!retQuien);
    matches.push({id: matchId++, po: true, ti, which, tLabel: playoff.tramos[ti].label, poNames: [m.a, m.b], sets: s, wo: !!retQuien, status: 'confirmed', reporter: currentUser.name, winner, date: fecha, club: poFormClub, locked: true});
    rebuildTramo(ti);
    const _rn2=(()=>{const rounds=which==='main'?playoff.tramos[ti].main:playoff.tramos[ti].cons;const fe=rounds.length-1-ri;return fe===0?'Final':fe===1?'Semifinal':fe===2?'Cuartos':fe===3?'Octavos':'Ronda '+(ri+1);})();
    addLog('Playoff: validado (admin)',{a:m.a,b:m.b,sets:s,winner,wo:!!retQuien,po:true,cuadro:playoff.tramos[ti].label,which,round:_rn2});
    closeM(); showPlayoffView(); toast(t('po_validated')); persist(true);
  } else {
    matches.push({id: matchId++, po: true, ti, which, tLabel: playoff.tramos[ti].label, poNames: [m.a, m.b], sets: s, wo: !!retQuien, status: 'pending', reporter: currentUser.name, winner, date: fecha, club: poFormClub});
    const _rn3=(()=>{const rounds=which==='main'?playoff.tramos[ti].main:playoff.tramos[ti].cons;const fe=rounds.length-1-ri;return fe===0?'Final':fe===1?'Semifinal':fe===2?'Cuartos':fe===3?'Octavos':'Ronda '+(ri+1);})();
    addLog('Playoff: cargado',{a:m.a,b:m.b,sets:s,wo:!!retQuien,po:true,cuadro:playoff.tramos[ti].label,which,round:_rn3});
    closeM(); renderPend(); renderCycleBar(); showPlayoffView(); toast(t('po_sent')); persist(true);
  }
}
function storePo(ti,which,a,b,sets,w,wo){const k=(which==='main'?ti:ti+'c')+'#'+[a,b].sort().join('|');playoff.results[k]={sets,w,wo:!!wo};}
function applyPoPending(rec){storePo(rec.ti,rec.which,rec.poNames[0],rec.poNames[1],rec.sets,rec.winner,rec.wo);rebuildTramo(rec.ti);}
let _toastTimer=null;function toast(m){let t=document.getElementById('_toast');if(!t){t=document.createElement('div');t.id='_toast';t.className='toast';document.body.appendChild(t);}t.textContent=m;t.style.opacity='1';if(_toastTimer)clearTimeout(_toastTimer);_toastTimer=setTimeout(()=>{t.style.opacity='0';_toastTimer=null;},3800);}

// ============================================================================
// confirmarModal(mensaje, opts) — reemplazo estético del confirm() nativo.
// Devuelve Promise<boolean>: true si confirma, false si cancela / cierra.
// Uso:  if(await confirmarModal('¿Borrar?')) { ... }
// Opts: { titulo, okTxt, cancelTxt, peligro:true (rojo), inputPlaceholder (si
//   se necesita que el usuario escriba algo para confirmar; el resolve pasa el
//   string en vez de boolean) }
// ============================================================================
function confirmarModal(mensaje, opts){
  opts = opts || {};
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'cm-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .18s';
    const peligro = !!opts.peligro;
    const okBg = peligro ? 'var(--danger)' : 'var(--pri,#1e3a8a)';
    const titulo = opts.titulo || '';
    const okTxt = opts.okTxt || 'Confirmar';
    const cancelTxt = opts.cancelTxt || 'Cancelar';
    const inputPh = opts.inputPlaceholder || '';
    const inputHtml = inputPh
      ? '<input id="_cm-in" placeholder="'+inputPh.replace(/"/g,'&quot;')+'" style="width:100%;padding:9px;margin:8px 0 4px;border:1px solid var(--border,#e2e8f0);border-radius:8px;font-size:14px" autocomplete="off">'
      : '';
    ov.innerHTML =
      '<div style="background:var(--surface,#fff);border-radius:14px;padding:22px;max-width:400px;width:100%;box-shadow:0 18px 50px rgba(0,0,0,.25);transform:translateY(8px);transition:transform .18s">'+
        (titulo ? '<h3 style="margin:0 0 8px;font-size:16px;font-weight:600">'+titulo+'</h3>' : '')+
        '<p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:var(--text,#0f172a);white-space:pre-wrap">'+String(mensaje).replace(/</g,'&lt;')+'</p>'+
        inputHtml +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">'+
          '<button id="_cm-cancel" class="btn btn-sm" style="background:transparent;border:1px solid var(--border,#e2e8f0);color:var(--text2,#64748b);padding:8px 14px">'+cancelTxt+'</button>'+
          '<button id="_cm-ok" class="btn btn-sm" style="background:'+okBg+';color:#fff;border:none;padding:8px 14px;font-weight:600">'+okTxt+'</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(ov);
    requestAnimationFrame(()=>{ ov.style.opacity='1'; ov.firstChild.style.transform='translateY(0)'; });
    const cerrar = (val) => {
      ov.style.opacity='0';
      setTimeout(()=>{ if(ov.parentNode) ov.parentNode.removeChild(ov); resolve(val); }, 180);
    };
    const inp = document.getElementById('_cm-in');
    if(inp){ setTimeout(()=>inp.focus(), 60); }
    document.getElementById('_cm-ok').onclick = () => cerrar(inp ? inp.value : true);
    document.getElementById('_cm-cancel').onclick = () => cerrar(inp ? null : false);
    // Click en el overlay = cancelar
    ov.onclick = (e) => { if(e.target === ov) cerrar(inp ? null : false); };
    // ESC = cancelar
    const esc = (e) => { if(e.key === 'Escape'){ cerrar(inp ? null : false); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
    // Enter en el input = OK
    if(inp){ inp.addEventListener('keydown', (e) => { if(e.key === 'Enter') cerrar(inp.value); }); }
  });
}
