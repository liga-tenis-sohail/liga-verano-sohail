// ============================================================================
// MENSAJERÍA — pestaña "Mensajes" con dos sub-hilos:
//   'admin' → avisos del administrador a todos los jugadores (solo lectura
//             para jugadores, el admin escribe).
//   'grupo' → chat privado entre los jugadores del grupo del usuario en el
//             ciclo actualmente seleccionado (viewCycle). Cambia solo si
//             cambiás de ciclo arriba (Ciclo 1 / Ciclo 2 / ...), igual que
//             Grupos y Clasificación.
//
// Los mensajes viven en su propia tabla en el backend (ver api/mensajes.js),
// NO en el bloque grande de estado de la liga — así dos personas escribiendo
// casi al mismo tiempo no se pisan el guardado.
//
// "Tiempo real" liviano: mientras la pestaña está abierta, cada 8s se pide
// solo lo NUEVO (mensajes con id mayor al último que ya tenemos) — no se
// vuelve a bajar todo el hilo. El polling se corta al salir de la pestaña.
// ============================================================================

let _msgSubTab = 'admin';          // 'admin' | 'grupo'
let _msgPollTimer = null;
let _msgLastId = { admin: 0, grupo: 0 };
let _msgGrupoCtx = null;           // {ciclo, grupo} resuelto para el hilo de grupo actual

function renderMensajes(){
  const el = document.getElementById('view-mensajes');
  if(!el) return;
  el.innerHTML = mensajesShellHTML();
  cargarMsgHilo(_msgSubTab, true);
  reiniciarPollingMensajes();
}

function mensajesShellHTML(){
  return `<div class="card msg-card">
    <div class="msg-tabs">
      <button class="msg-tab ${_msgSubTab==='admin'?'active':''}" onclick="cambiarMsgSubTab('admin')"><i class="ti ti-speakerphone"></i> ${t('msg_admin_tab')}</button>
      <button class="msg-tab ${_msgSubTab==='grupo'?'active':''}" onclick="cambiarMsgSubTab('grupo')"><i class="ti ti-users"></i> ${t('msg_group_tab')}</button>
    </div>
    <div id="msg-body"></div>
  </div>`;
}

function cambiarMsgSubTab(tab){
  if(_msgSubTab === tab) return;
  _msgSubTab = tab;
  const tabs = document.querySelectorAll('#view-mensajes .msg-tab');
  tabs.forEach(b=>b.classList.remove('active'));
  const idx = tab === 'admin' ? 0 : 1;
  if(tabs[idx]) tabs[idx].classList.add('active');
  cargarMsgHilo(tab, true);
  reiniciarPollingMensajes();
}

// Resuelve en qué grupo está el usuario actual, para el ciclo que está
// mirando ahora mismo (mismo criterio que Grupos/Clasificación: si está en
// Play Offs, usamos el ciclo activo como referencia).
function _msgResolverGrupoCtx(){
  const ciclo = (viewCycle === 'po') ? activeN : viewCycle;
  const loc = (typeof findLoc === 'function' && currentUser) ? findLoc(currentUser.name, ciclo) : null;
  return loc ? { ciclo, grupo: loc.g } : null;
}

async function cargarMsgHilo(tab, esCargaInicial){
  const body = document.getElementById('msg-body');
  if(!body) return;

  if(tab === 'grupo'){
    _msgGrupoCtx = _msgResolverGrupoCtx();
    if(!_msgGrupoCtx){
      body.innerHTML = `<p class="legend-txt" style="margin:.5rem 0">${t('msg_group_desc')}</p>
        <div class="msg-empty">${t('msg_no_group')}</div>`;
      return;
    }
  }

  if(esCargaInicial){
    body.innerHTML = `<p class="legend-txt" style="margin:.15rem 0 .6rem">${tab==='admin'?t('msg_admin_desc'):t('msg_group_desc')}</p>
      <div class="msg-list" id="msg-list"><div class="legend-txt">${t('past_loading')}</div></div>
      <div id="msg-compose"></div>`;
  }

  try{
    const payload = tab === 'admin'
      ? { accion:'listarAdmin', ligaId:_ligaActual }
      : { accion:'listarGrupo', ligaId:_ligaActual, ciclo:_msgGrupoCtx.ciclo, grupo:_msgGrupoCtx.grupo };
    const r = await fetch('/api/mensajes', {
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
      list.innerHTML = `<div class="msg-empty">${tab==='admin'?t('msg_empty_admin'):t('msg_empty_group')}</div>`;
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
  const puedeEscribir = tab === 'admin' ? esAdmin(currentUser) : !!_msgGrupoCtx;
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

  const payload = tab === 'admin'
    ? { accion:'enviarAdmin', ligaId:_ligaActual, texto }
    : { accion:'enviarGrupo', ligaId:_ligaActual, ciclo:_msgGrupoCtx.ciclo, grupo:_msgGrupoCtx.grupo, texto };

  input.disabled = true;
  try{
    const r = await fetch('/api/mensajes', {
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
    const payload = tab === 'admin'
      ? { accion:'nuevosAdmin', ligaId:_ligaActual, desdeId:_msgLastId.admin }
      : (_msgGrupoCtx ? { accion:'nuevosGrupo', ligaId:_ligaActual, ciclo:_msgGrupoCtx.ciclo, grupo:_msgGrupoCtx.grupo, desdeId:_msgLastId.grupo } : null);
    if(!payload) return;
    fetch('/api/mensajes', {
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
