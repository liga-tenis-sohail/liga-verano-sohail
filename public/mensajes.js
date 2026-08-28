// ============================================================================
// MENSAJERÍA — pestaña "Inbox" con hasta TRES sub-hilos:
//   'admin'   → avisos del administrador a todos los jugadores (solo lectura
//               para jugadores, el admin escribe).
//   'grupo'   → chat privado entre los jugadores del grupo del usuario en el
//               ciclo actualmente seleccionado (viewCycle). Cambia solo si
//               cambiás de ciclo arriba (Ciclo 1 / Ciclo 2 / ...), igual que
//               Grupos y Clasificación. La pestaña muestra el número real
//               del grupo del jugador (ej. "Grupo 5"), no un genérico "Mi Grupo".
//   'playoff' → chat privado entre los jugadores del CUADRO de Play Offs
//               (tramo) del usuario. Solo aparece si los Play Offs están
//               iniciados y el jugador pertenece a algún cuadro. La pestaña
//               muestra el nombre real del cuadro (ej. "Cuadro A").
//
// Los mensajes viven en su propia tabla en el backend (ver api/mensajes.js),
// NO en el bloque grande de estado de la liga — así dos personas escribiendo
// casi al mismo tiempo no se pisan el guardado.
//
// "Tiempo real" liviano: mientras la pestaña está abierta, cada 8s se pide
// solo lo NUEVO (mensajes con id mayor al último que ya tenemos) — no se
// vuelve a bajar todo el hilo. El polling se corta al salir de la pestaña.
// ============================================================================

let _msgSubTab = 'admin';          // 'admin' | 'grupo' | 'playoff'
let _msgPollTimer = null;
let _msgLastId = { admin: 0, grupo: 0, playoff: 0 };
let _msgGrupoCtx = null;           // {ciclo, grupo} resuelto para el hilo de grupo actual
let _msgTramoCtx = null;           // {tramo, label} resuelto para el hilo de playoff actual

function renderMensajes(){
  const el = document.getElementById('view-mensajes');
  if(!el) return;
  // Resolvemos los contextos ANTES de armar el HTML de las pestañas, para
  // poder mostrar el número de grupo / nombre de cuadro reales de entrada,
  // sin esperar a un fetch.
  _msgGrupoCtx = _msgResolverGrupoCtx();
  _msgTramoCtx = _msgResolverTramoCtx();
  // Si la pestaña de playoff/grupo estaba activa pero el jugador ya no
  // pertenece a ese hilo (ej. cambiaron los Play Offs), volvemos a 'admin'
  // para no quedar en una pestaña fantasma.
  if(_msgSubTab === 'playoff' && !_msgTramoCtx) _msgSubTab = 'admin';
  if(_msgSubTab === 'grupo' && !_msgGrupoCtx) _msgSubTab = 'admin';

  el.innerHTML = mensajesShellHTML();
  cargarMsgHilo(_msgSubTab, true);
  reiniciarPollingMensajes();
}

function mensajesShellHTML(){
  const grupoLabel = _msgGrupoCtx ? groupName(_msgGrupoCtx.grupo) : t('msg_group_tab');
  const playoffLabel = _msgTramoCtx ? t('po_match').replace('{l}', _msgTramoCtx.label) : '';
  let tabsHtml = `<button class="msg-tab ${_msgSubTab==='admin'?'active':''}" onclick="cambiarMsgSubTab('admin')"><i class="ti ti-speakerphone"></i> ${t('msg_admin_tab')}</button>`;
  if(_msgGrupoCtx){
    tabsHtml += `<button class="msg-tab ${_msgSubTab==='grupo'?'active':''}" onclick="cambiarMsgSubTab('grupo')"><i class="ti ti-users"></i> ${attr(grupoLabel)}</button>`;
  }
  if(_msgTramoCtx){
    tabsHtml += `<button class="msg-tab ${_msgSubTab==='playoff'?'active':''}" onclick="cambiarMsgSubTab('playoff')"><i class="ti ti-tournament"></i> ${attr(playoffLabel)}</button>`;
  }
  return `<div class="card msg-card">
    <div class="msg-tabs">${tabsHtml}</div>
    <div id="msg-body"></div>
  </div>`;
}

function cambiarMsgSubTab(tab){
  if(_msgSubTab === tab) return;
  _msgSubTab = tab;
  const el = document.getElementById('view-mensajes');
  if(el) el.innerHTML = mensajesShellHTML();
  cargarMsgHilo(tab, true);
  reiniciarPollingMensajes();
}

// Resuelve en qué grupo está el usuario actual, para el ciclo que está
// mirando ahora mismo (mismo criterio que Grupos/Clasificación: si está en
// Play Offs, usamos el ciclo activo como referencia).
function _msgResolverGrupoCtx(){
  if(!currentUser) return null;
  const ciclo = (viewCycle === 'po') ? activeN : viewCycle;
  const loc = (typeof findLoc === 'function') ? findLoc(currentUser.name, ciclo) : null;
  return loc ? { ciclo, grupo: loc.g } : null;
}

// Resuelve a qué cuadro (tramo) de Play Offs pertenece el usuario actual.
// Mismo criterio que ya usa la propia pantalla de Play Offs para saber "cuál
// es mi cuadro" (playoffs.js). Si los Play Offs no arrancaron, no hay tramo.
function _msgResolverTramoCtx(){
  if(!currentUser) return null;
  if(!playoff || !playoff.started || !Array.isArray(playoff.tramos)) return null;
  const idx = playoff.tramos.findIndex(tr => tr && Array.isArray(tr.seeds) && tr.seeds.includes(currentUser.name));
  if(idx < 0) return null;
  const tr = playoff.tramos[idx];
  return { tramo: idx, label: (tr.label != null ? tr.label : String(idx + 1)) };
}

async function cargarMsgHilo(tab, esCargaInicial){
  const body = document.getElementById('msg-body');
  if(!body) return;

  if(tab === 'grupo' && !_msgGrupoCtx){
    body.innerHTML = `<p class="legend-txt" style="margin:.5rem 0">${t('msg_group_desc')}</p>
      <div class="msg-empty">${t('msg_no_group')}</div>`;
    return;
  }
  if(tab === 'playoff' && !_msgTramoCtx){
    body.innerHTML = `<div class="msg-empty">${t('msg_no_playoff')}</div>`;
    return;
  }

  if(esCargaInicial){
    const desc = tab==='admin' ? t('msg_admin_desc') : (tab==='grupo' ? t('msg_group_desc') : t('msg_playoff_desc'));
    body.innerHTML = `<p class="legend-txt" style="margin:.15rem 0 .6rem">${desc}</p>
      <div class="msg-list" id="msg-list"><div class="legend-txt">${t('past_loading')}</div></div>
      <div id="msg-compose"></div>`;
  }

  try{
    let payload;
    if(tab === 'admin') payload = { accion:'listarAdmin', ligaId:_ligaActual };
    else if(tab === 'grupo') payload = { accion:'listarGrupo', ligaId:_ligaActual, ciclo:_msgGrupoCtx.ciclo, grupo:_msgGrupoCtx.grupo };
    else payload = { accion:'listarPlayoff', ligaId:_ligaActual, tramo:_msgTramoCtx.tramo };

    const r = await fetch('/api/liga', {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer '+_token},
      body: JSON.stringify(payload)
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok){
      const list = document.getElementById('msg-list');
      if(list) list.innerHTML = '<div class="legend-txt">'+attr(d.error||t('msg_load_err'))+'</div>';
      return;
    }
    const msgs = Array.isArray(d.mensajes) ? d.mensajes : [];
    _msgLastId[tab] = msgs.length ? msgs[msgs.length-1].id : 0;
    _msgPintarLista(tab, msgs, true);
    _msgPintarComposer(tab);
  } catch(e){
    const list = document.getElementById('msg-list');
    if(list) list.innerHTML = '<div class="legend-txt">'+attr(t('ml_conn_err'))+'</div>';
  }
}

function _msgFmtFecha(iso){
  try{
    const d = new Date(iso);
    const hoy = new Date();
    const mismodia = d.toDateString() === hoy.toDateString();
    const hora = d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    if(mismodia) return hora;
    return d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'}) + ' ' + hora;
  }catch(_){ return ''; }
}

// Pinta la lista completa (reset=true) o agrega mensajes nuevos al final
// (reset=false, usado por el polling) sin perder el scroll del usuario si
// no estaba pegado abajo.
function _msgPintarLista(tab, msgs, reset){
  const list = document.getElementById('msg-list');
  if(!list) return;
  const estabaAbajo = (list.scrollHeight - list.scrollTop - list.clientHeight) < 40;

  if(reset){
    if(!msgs.length){
      const vacio = tab==='admin' ? t('msg_empty_admin') : (tab==='grupo' ? t('msg_empty_group') : t('msg_empty_playoff'));
      list.innerHTML = `<div class="msg-empty">${vacio}</div>`;
      return;
    }
    list.innerHTML = msgs.map(m=>_msgBubbleHTML(m)).join('');
    list.scrollTop = list.scrollHeight;
    return;
  }

  if(!msgs.length) return;
  // Si la lista estaba vacía (mostrando el estado "todavía no hay mensajes"),
  // reemplazamos ese placeholder en vez de agregar debajo.
  if(list.querySelector('.msg-empty')) list.innerHTML = '';
  list.insertAdjacentHTML('beforeend', msgs.map(m=>_msgBubbleHTML(m)).join(''));
  if(estabaAbajo) list.scrollTop = list.scrollHeight;
}

function _msgBubbleHTML(m){
  const soyYo = currentUser && m.autor === currentUser.name;
  const nombre = soyYo ? t('msg_you') : attr(m.autor || '');
  const cuando = attr(_msgFmtFecha(m.fecha));
  const texto = attr(m.texto || '');
  return `<div class="msg-bubble-row ${soyYo?'me':''}">
    <div class="msg-bubble">
      ${!soyYo?`<div class="msg-bubble-author">${nombre}</div>`:''}
      <div class="msg-bubble-text">${texto}</div>
      <div class="msg-bubble-time">${cuando}</div>
    </div>
  </div>`;
}

function _msgPintarComposer(tab){
  const box = document.getElementById('msg-compose');
  if(!box) return;
  const puedeEscribir = tab === 'admin' ? esAdmin(currentUser) : (tab === 'grupo' ? !!_msgGrupoCtx : !!_msgTramoCtx);
  if(!puedeEscribir){
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `<div class="msg-compose-row">
    <textarea id="msg-input" class="msg-input" placeholder="${attr(t('msg_placeholder'))}" rows="1"
      onkeydown="_msgTeclaComposer(event)" oninput="_msgAutoAltura(this)"></textarea>
    <button class="btn btn-primary" onclick="enviarMensajeUI('${tab}')"><i class="ti ti-send"></i> ${t('msg_send')}</button>
  </div>`;
}

function _msgAutoAltura(ta){
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

function _msgTeclaComposer(ev){
  // Enter envía, Shift+Enter hace salto de línea (estándar de cualquier chat).
  if(ev.key === 'Enter' && !ev.shiftKey){
    ev.preventDefault();
    enviarMensajeUI(_msgSubTab);
  }
}

async function enviarMensajeUI(tab){
  const input = document.getElementById('msg-input');
  if(!input) return;
  const texto = input.value.trim();
  if(!texto){ toast(t('msg_empty_err')); return; }

  let payload;
  if(tab === 'admin') payload = { accion:'enviarAdmin', ligaId:_ligaActual, texto };
  else if(tab === 'grupo') payload = { accion:'enviarGrupo', ligaId:_ligaActual, ciclo:_msgGrupoCtx.ciclo, grupo:_msgGrupoCtx.grupo, texto };
  else payload = { accion:'enviarPlayoff', ligaId:_ligaActual, tramo:_msgTramoCtx.tramo, texto };

  input.disabled = true;
  try{
    const r = await fetch('/api/liga', {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer '+_token},
      body: JSON.stringify(payload)
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok){ toast(d.error || t('msg_send_err')); input.disabled = false; return; }
    input.value = '';
    input.style.height = 'auto';
    if(d.mensaje){
      _msgLastId[tab] = d.mensaje.id;
      _msgPintarLista(tab, [d.mensaje], false);
    }
  }catch(e){
    toast(t('msg_send_err'));
  }
  input.disabled = false;
  input.focus();
}

// ---- Polling liviano: solo mientras la pestaña Mensajes está abierta ----
function reiniciarPollingMensajes(){
  detenerPollingMensajes();
  _msgPollTimer = setInterval(function(){
    if(!_token || !_ligaActual) return;
    const tab = _msgSubTab;
    let payload = null;
    if(tab === 'admin'){
      payload = { accion:'nuevosAdmin', ligaId:_ligaActual, desdeId:_msgLastId.admin };
    } else if(tab === 'grupo' && _msgGrupoCtx){
      payload = { accion:'nuevosGrupo', ligaId:_ligaActual, ciclo:_msgGrupoCtx.ciclo, grupo:_msgGrupoCtx.grupo, desdeId:_msgLastId.grupo };
    } else if(tab === 'playoff' && _msgTramoCtx){
      payload = { accion:'nuevosPlayoff', ligaId:_ligaActual, tramo:_msgTramoCtx.tramo, desdeId:_msgLastId.playoff };
    }
    if(!payload) return;
    fetch('/api/liga', {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer '+_token},
      body: JSON.stringify(payload)
    }).then(r=>r.ok?r.json():null).then(d=>{
      if(!d || !Array.isArray(d.mensajes) || !d.mensajes.length) return;
      _msgLastId[tab] = d.mensajes[d.mensajes.length-1].id;
      _msgPintarLista(tab, d.mensajes, false);
    }).catch(()=>{});
  }, 8000);
}

function detenerPollingMensajes(){
  if(_msgPollTimer){ clearInterval(_msgPollTimer); _msgPollTimer = null; }
}
