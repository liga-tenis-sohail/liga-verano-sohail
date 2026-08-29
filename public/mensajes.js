// ============================================================================
// MENSAJERÍA — pestaña "Inbox" con hasta CUATRO sub-hilos:
//   'admin'    → avisos del administrador a todos los jugadores (solo
//                lectura para jugadores, el admin escribe).
//   'grupo'    → chat privado entre los jugadores del grupo del usuario en
//                el ciclo actualmente seleccionado (viewCycle). Se BLOQUEA
//                (deja de aparecer) en cuanto arrancan los Play Offs — la
//                conversación pasa al hilo de Play Offs.
//   'playoff'  → chat privado entre los jugadores del CUADRO de Play Offs
//                (tramo) del usuario. Solo aparece si los Play Offs están
//                iniciados y el jugador pertenece a algún cuadro.
//   'explorar' → SOLO ADMIN: navegar, leer Y ESCRIBIR en el chat de
//                CUALQUIER grupo de CUALQUIER ciclo, o cualquier cuadro de
//                Play Offs (elige ciclo + grupo, o cuadro, con un selector).
//                No reemplaza al chat propio del jugador — es la vía del
//                admin para escribir en un grupo/cuadro donde no juega.
//                No tiene polling en vivo (ver reiniciarPollingMensajes):
//                es para revisar y, si hace falta, avisar algo puntual.
//
// Los mensajes viven en su propia tabla en el backend (dentro de /api/liga,
// ver comentario en ese archivo sobre el límite de Serverless Functions),
// NO en el bloque grande de estado de la liga — así dos personas escribiendo
// casi al mismo tiempo no se pisan el guardado.
//
// Orden de la lista: viejo arriba, nuevo abajo, la vista se mantiene pegada
// al final — estilo iMessage/WhatsApp estándar.
//
// Colores de burbuja: cada persona tiene un color propio, calculado a partir
// de su nombre (mismo color siempre, para todos los que miran el chat — no
// es un color al azar por sesión). Así, con varias personas escribiendo, se
// distingue quién dijo qué de un vistazo sin tener que leer el nombre cada
// vez.
// ============================================================================

let _msgSubTab = 'admin';          // 'admin' | 'grupo' | 'playoff' | 'explorar'
let _msgPollTimer = null;
let _msgLastId = { admin: 0, grupo: 0, playoff: 0 };
let _msgGrupoCtx = null;           // {ciclo, grupo} resuelto para el hilo de grupo actual (null si está bloqueado por playoffs)
let _msgTramoCtx = null;           // {tramo, label} resuelto para el hilo de playoff actual
let _msgExplorarNivel1 = null;     // número de ciclo, o 'po' — qué fila de arriba está elegida en "Todos los grupos"
let _msgExplorarCtx = null;        // {tipo:'grupo',ciclo,grupo} o {tipo:'playoff',tramo} — hilo puntual elegido

// ---------------------------------------------------------------------------
// Marcado de "leído": guardado en localStorage, por liga + usuario.
// ---------------------------------------------------------------------------
function _msgReadStorageKey(){
  return 'msgRead:' + (_ligaActual||'') + ':' + (currentUser ? currentUser.name : '');
}
function _msgReadStateGet(){
  try { return JSON.parse(localStorage.getItem(_msgReadStorageKey()) || '{}'); }
  catch(_){ return {}; }
}
function _msgReadStateSetOne(key, id){
  if(!id) return;
  const st = _msgReadStateGet();
  if((st[key]||0) >= id) return; // nunca retrocede
  st[key] = id;
  try { localStorage.setItem(_msgReadStorageKey(), JSON.stringify(st)); } catch(_){}
}
function _msgThreadKey(tipo, ctx){
  if(tipo === 'admin') return 'admin';
  if(tipo === 'grupo') return 'grupo:'+ctx.ciclo+':'+ctx.grupo;
  return 'playoff:'+ctx.tramo;
}

// ---------------------------------------------------------------------------
// Color por jugador: hash determinístico del nombre → un matiz (hue) fijo
// en la rueda de 360°. Con esto, "infinitos" jugadores tienen su propio
// color sin mantener una lista fija — dos nombres distintos casi siempre
// caen en tonos bien diferenciados, y el mismo nombre da siempre el mismo
// color (para vos, para otro jugador, para el admin mirando desde afuera).
// ---------------------------------------------------------------------------
function _msgHashName(name){
  let h = 0;
  const s = String(name||'');
  for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}
function _msgEsOscuro(){
  const at = document.documentElement.getAttribute('data-theme');
  if(at === 'dark') return true;
  if(at === 'light') return false;
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
function _msgColorForName(name){
  const hue = _msgHashName(name) % 360;
  if(_msgEsOscuro()){
    return { bg:'hsl('+hue+',34%,22%)', border:'hsl('+hue+',38%,32%)', label:'hsl('+hue+',75%,72%)' };
  }
  return { bg:'hsl('+hue+',68%,93%)', border:'hsl('+hue+',45%,80%)', label:'hsl('+hue+',55%,33%)' };
}

function renderMensajes(){
  const el = document.getElementById('view-mensajes');
  if(!el) return;
  const playoffsArrancaron = !!(playoff && playoff.started);
  // Resolvemos los contextos ANTES de armar el HTML de las pestañas. El chat
  // de grupo se BLOQUEA (no se resuelve, no aparece la pestaña) en cuanto
  // arrancan los Play Offs — la conversación pasa a "Cuadro X".
  _msgGrupoCtx = playoffsArrancaron ? null : _msgResolverGrupoCtx();
  _msgTramoCtx = _msgResolverTramoCtx();
  if(_msgSubTab === 'playoff' && !_msgTramoCtx) _msgSubTab = 'admin';
  if(_msgSubTab === 'grupo' && !_msgGrupoCtx) _msgSubTab = 'admin';
  if(_msgSubTab === 'explorar' && !esAdmin(currentUser)) _msgSubTab = 'admin';

  el.innerHTML = mensajesShellHTML();
  cargarMsgHilo(_msgSubTab, true);
  reiniciarPollingMensajes();
  actualizarBadgeMensajes();
}

// Mismas clases .tabs/.tab que usa el resto de la app — un solo lenguaje
// visual para todas las pestañas.
function mensajesShellHTML(){
  const grupoLabel = _msgGrupoCtx ? groupName(_msgGrupoCtx.grupo) : t('msg_group_tab');
  const playoffLabel = _msgTramoCtx ? t('po_match').replace('{l}', _msgTramoCtx.label) : '';
  let tabsHtml = `<button class="tab ${_msgSubTab==='admin'?'active':''}" onclick="cambiarMsgSubTab('admin')"><i class="ti ti-speakerphone" aria-hidden="true"></i> ${t('msg_admin_tab')}</button>`;
  if(_msgGrupoCtx){
    tabsHtml += `<button class="tab ${_msgSubTab==='grupo'?'active':''}" onclick="cambiarMsgSubTab('grupo')"><i class="ti ti-users" aria-hidden="true"></i> ${attr(grupoLabel)}</button>`;
  }
  if(_msgTramoCtx){
    tabsHtml += `<button class="tab ${_msgSubTab==='playoff'?'active':''}" onclick="cambiarMsgSubTab('playoff')"><i class="ti ti-tournament" aria-hidden="true"></i> ${attr(playoffLabel)}</button>`;
  }
  if(esAdmin(currentUser)){
    tabsHtml += `<button class="tab ${_msgSubTab==='explorar'?'active':''}" onclick="cambiarMsgSubTab('explorar')"><i class="ti ti-eye" aria-hidden="true"></i> ${t('msg_explorar_tab')}</button>`;
  }
  return `<div class="card msg-card">
    <div class="tabs" style="margin-bottom:.85rem">${tabsHtml}</div>
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

function _msgResolverGrupoCtx(){
  if(!currentUser) return null;
  const ciclo = (viewCycle === 'po') ? activeN : viewCycle;
  const loc = (typeof findLoc === 'function') ? findLoc(currentUser.name, ciclo) : null;
  return loc ? { ciclo, grupo: loc.g } : null;
}

function _msgResolverTramoCtx(){
  if(!currentUser) return null;
  if(!playoff || !playoff.started || !Array.isArray(playoff.tramos)) return null;
  const idx = playoff.tramos.findIndex(tr => tr && Array.isArray(tr.seeds) && tr.seeds.includes(currentUser.name));
  if(idx < 0) return null;
  const tr = playoff.tramos[idx];
  return { tramo: idx, label: (tr.label != null ? tr.label : String(idx + 1)) };
}

// Picker de ciclo/grupo para el explorador de admin. Mismo criterio ya usado
// en "Reparar jugador en un ciclo": ciclos con grupos armados. La fila de
// arriba (nivel 1) son botones tipo pestaña, uno por ciclo + "Play Offs" si
// ya arrancaron; la fila de abajo (nivel 2) son los grupos de ese ciclo (o
// los cuadros de Play Offs), también como pestañas — mismo lenguaje visual
// que el resto de la app, nada de selects sueltos.
function _msgExplorarNivel1HTML(){
  const cyclesConGrupos = (typeof cycles !== 'undefined' ? cycles : []).filter(c=>c && c.groups);
  const hayPlayoffs = !!(playoff && playoff.started && Array.isArray(playoff.tramos) && playoff.tramos.length);
  let html = cyclesConGrupos.map(c=>{
    const activo = _msgExplorarNivel1 === c.n;
    return `<button class="tab ${activo?'active':''}" onclick="elegirExplorarNivel1(${c.n})"><i class="ti ti-calendar" aria-hidden="true"></i> ${t('cycle')} ${c.n}</button>`;
  }).join('');
  if(hayPlayoffs){
    const activo = _msgExplorarNivel1 === 'po';
    html += `<button class="tab ${activo?'active':''}" onclick="elegirExplorarNivel1('po')"><i class="ti ti-tournament" aria-hidden="true"></i> ${t('playoffs')}</button>`;
  }
  return `<div class="tabs" style="margin-bottom:.6rem">${html}</div>`;
}

function _msgExplorarNivel2HTML(){
  if(_msgExplorarNivel1 == null) return '';
  if(_msgExplorarNivel1 === 'po'){
    const tramos = (playoff && Array.isArray(playoff.tramos)) ? playoff.tramos : [];
    const html = tramos.map((tr,i)=>{
      const activo = _msgExplorarCtx && _msgExplorarCtx.tipo==='playoff' && _msgExplorarCtx.tramo===i;
      const label = t('po_match').replace('{l}', tr && tr.label!=null ? tr.label : String(i+1));
      return `<button class="tab ${activo?'active':''}" onclick='elegirExplorarNivel2("playoff",${i})'><i class="ti ti-swords" aria-hidden="true"></i> ${attr(label)}</button>`;
    }).join('');
    return `<div class="tabs" style="margin-bottom:.75rem">${html}</div>`;
  }
  const c = (typeof cycles !== 'undefined' ? cycles : []).find(cc=>cc && cc.n === _msgExplorarNivel1);
  const grupos = (c && Array.isArray(c.groups)) ? c.groups : [];
  const html = grupos.map((g,i)=>{
    const gid = i+1;
    const activo = _msgExplorarCtx && _msgExplorarCtx.tipo==='grupo' && _msgExplorarCtx.ciclo===_msgExplorarNivel1 && _msgExplorarCtx.grupo===gid;
    return `<button class="tab ${activo?'active':''}" onclick='elegirExplorarNivel2("grupo",${gid})'><i class="ti ti-users" aria-hidden="true"></i> ${attr(groupName(gid))}</button>`;
  }).join('');
  return `<div class="tabs" style="margin-bottom:.75rem">${html}</div>`;
}

function elegirExplorarNivel1(valor){
  _msgExplorarNivel1 = valor;
  _msgExplorarCtx = null; // al cambiar de ciclo/playoffs, se resetea el grupo/cuadro elegido
  cargarMsgHilo('explorar', true);
}

function elegirExplorarNivel2(tipo, valor){
  _msgExplorarCtx = (tipo === 'grupo')
    ? { tipo:'grupo', ciclo:_msgExplorarNivel1, grupo:valor }
    : { tipo:'playoff', tramo:valor };
  cargarMsgHilo('explorar', true);
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

  if(tab === 'explorar'){
    // Por default, al entrar por primera vez, arrancamos mostrando el ciclo
    // actual (así el admin ve algo útil sin tener que elegir nada primero).
    if(_msgExplorarNivel1 == null) _msgExplorarNivel1 = activeN;
    const nivel1 = _msgExplorarNivel1HTML();
    const nivel2 = _msgExplorarNivel2HTML();
    if(!_msgExplorarCtx){
      body.innerHTML = `<p class="legend-txt" style="margin:.15rem 0 .6rem">${t('msg_explorar_desc')}</p>${nivel1}${nivel2}`;
      return;
    }
    body.innerHTML = `<p class="legend-txt" style="margin:.15rem 0 .6rem">${t('msg_explorar_desc')}</p>${nivel1}${nivel2}
      <div class="msg-box"><div class="msg-list" id="msg-list"><div class="legend-txt">${t('past_loading')}</div></div><div id="msg-compose"></div></div>`;
    try{
      const payload = _msgExplorarCtx.tipo === 'playoff'
        ? { accion:'listarPlayoff', ligaId:_ligaActual, tramo:_msgExplorarCtx.tramo }
        : { accion:'listarGrupo', ligaId:_ligaActual, ciclo:_msgExplorarCtx.ciclo, grupo:_msgExplorarCtx.grupo };
      const r = await fetch('/api/liga', {
        method:'POST',
        headers:{'Content-Type':'application/json', Authorization:'Bearer '+_token},
        body: JSON.stringify(payload)
      });
      const d = await r.json().catch(()=>({}));
      const list = document.getElementById('msg-list');
      if(!r.ok){ if(list) list.innerHTML = '<div class="legend-txt">'+attr(d.error||t('msg_load_err'))+'</div>'; return; }
      const msgs = Array.isArray(d.mensajes) ? d.mensajes : [];
      _msgPintarLista('explorar', msgs, true);
      // El admin puede escribir en cualquier grupo/cuadro desde acá (ver
      // enviarGrupo/enviarPlayoff en api/liga.js, que ya lo permiten). Antes
      // el explorador era 100% de solo lectura porque nunca se pintaba el
      // composer; ahora sí, igual que en los hilos propios.
      _msgPintarComposer('explorar');
    } catch(e){
      const list = document.getElementById('msg-list');
      if(list) list.innerHTML = '<div class="legend-txt">'+attr(t('ml_conn_err'))+'</div>';
    }
    return;
  }

  if(esCargaInicial){
    const desc = tab==='admin' ? t('msg_admin_desc') : (tab==='grupo' ? t('msg_group_desc') : t('msg_playoff_desc'));
    body.innerHTML = `<p class="legend-txt" style="margin:.15rem 0 .6rem">${desc}</p>
      <div class="msg-box">
        <div class="msg-list" id="msg-list"><div class="legend-txt">${t('past_loading')}</div></div>
        <div id="msg-compose"></div>
      </div>`;
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
    if(msgs.length){
      const ctx = tab==='admin' ? null : (tab==='grupo' ? _msgGrupoCtx : _msgTramoCtx);
      _msgReadStateSetOne(_msgThreadKey(tab, ctx), _msgLastId[tab]);
      actualizarBadgeMensajes();
    }
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

// Pinta la lista completa (reset=true) o agrega mensajes nuevos AL FINAL
// (reset=false, usado por el polling) — viejo arriba, nuevo abajo, pegado
// al final salvo que el usuario haya scrolleado para arriba a leer historial.
function _msgPintarLista(tab, msgs, reset){
  const list = document.getElementById('msg-list');
  if(!list) return;
  const estabaAbajo = (list.scrollHeight - list.scrollTop - list.clientHeight) < 60;

  if(reset){
    if(!msgs.length){
      const vacio = tab==='admin' ? t('msg_empty_admin') : (tab==='grupo'||tab==='explorar' ? t('msg_empty_group') : t('msg_empty_playoff'));
      list.innerHTML = `<div class="msg-empty">${vacio}</div>`;
      return;
    }
    list.innerHTML = msgs.map(m=>_msgBubbleHTML(m)).join('');
    list.scrollTop = list.scrollHeight;
    return;
  }

  if(!msgs.length) return;
  if(list.querySelector('.msg-empty')) list.innerHTML = '';
  const bloque = msgs.map(m=>_msgBubbleHTML(m)).join('');
  list.insertAdjacentHTML('beforeend', bloque);
  if(estabaAbajo) list.scrollTop = list.scrollHeight;
}

function _msgBubbleHTML(m){
  const soyYo = currentUser && m.autor === currentUser.name;
  const nombre = soyYo ? t('msg_you') : attr(m.autor || '');
  const cuando = attr(_msgFmtFecha(m.fecha));
  const texto = attr(m.texto || '');
  const c = _msgColorForName(m.autor || '');
  const estiloBurbuja = 'background:'+c.bg+';border-color:'+c.border+';';
  const estiloAutor = 'color:'+c.label+';';
  return `<div class="msg-bubble-row ${soyYo?'me':''}">
    <div class="msg-bubble" style="${estiloBurbuja}">
      <div class="msg-bubble-author" style="${estiloAutor}">${nombre}</div>
      <div class="msg-bubble-text">${texto}</div>
      <div class="msg-bubble-time">${cuando}</div>
    </div>
  </div>`;
}

function _msgPintarComposer(tab){
  const box = document.getElementById('msg-compose');
  if(!box) return;
  // 'explorar': el admin escribe en el grupo/cuadro que esté navegando en
  // ese momento (_msgExplorarCtx). Solo esAdmin llega acá (la pestaña ni
  // se muestra si no lo es), y el backend igual valida esAdminMsg de nuevo.
  const puedeEscribir = tab === 'admin' ? esAdmin(currentUser)
    : tab === 'grupo' ? !!_msgGrupoCtx
    : tab === 'playoff' ? !!_msgTramoCtx
    : tab === 'explorar' ? (esAdmin(currentUser) && !!_msgExplorarCtx)
    : false;
  if(!puedeEscribir){
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `<div class="msg-compose-row">
    <textarea id="msg-input" class="msg-input" placeholder="${attr(t('msg_placeholder'))}" rows="3"
      onkeydown="_msgTeclaComposer(event)"></textarea>
    <button class="btn btn-primary" onclick="enviarMensajeUI('${tab}')"><i class="ti ti-send"></i> ${t('msg_send')}</button>
  </div>`;
}

function _msgTeclaComposer(ev){
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
  else if(tab === 'playoff') payload = { accion:'enviarPlayoff', ligaId:_ligaActual, tramo:_msgTramoCtx.tramo, texto };
  else if(tab === 'explorar' && _msgExplorarCtx){
    payload = _msgExplorarCtx.tipo === 'playoff'
      ? { accion:'enviarPlayoff', ligaId:_ligaActual, tramo:_msgExplorarCtx.tramo, texto }
      : { accion:'enviarGrupo', ligaId:_ligaActual, ciclo:_msgExplorarCtx.ciclo, grupo:_msgExplorarCtx.grupo, texto };
  }
  if(!payload) return;

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
    if(d.mensaje){
      _msgLastId[tab] = d.mensaje.id;
      _msgPintarLista(tab, [d.mensaje], false);
      // 'explorar' no tiene marcado de leído propio (es de otro): el hilo
      // real que se actualiza es el de _msgExplorarCtx, no un hilo del
      // usuario. Se omite _msgReadStateSetOne para ese caso.
      if(tab !== 'explorar'){
        const ctx = tab==='admin' ? null : (tab==='grupo' ? _msgGrupoCtx : _msgTramoCtx);
        _msgReadStateSetOne(_msgThreadKey(tab, ctx), d.mensaje.id);
      }
    }
  }catch(e){
    toast(t('msg_send_err'));
  }
  input.disabled = false;
  input.focus();
}

// ---- Polling liviano del hilo abierto ----
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
    // El hilo 'explorar' no hace polling: es una foto para revisar, no un
    // chat en vivo del admin.
    if(!payload) return;
    fetch('/api/liga', {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer '+_token},
      body: JSON.stringify(payload)
    }).then(r=>r.ok?r.json():null).then(d=>{
      if(!d || !Array.isArray(d.mensajes) || !d.mensajes.length) return;
      _msgLastId[tab] = d.mensajes[d.mensajes.length-1].id;
      _msgPintarLista(tab, d.mensajes, false);
      const ctx = tab==='admin' ? null : (tab==='grupo' ? _msgGrupoCtx : _msgTramoCtx);
      _msgReadStateSetOne(_msgThreadKey(tab, ctx), _msgLastId[tab]);
      actualizarBadgeMensajes();
    }).catch(()=>{});
  }, 8000);
}

function detenerPollingMensajes(){
  if(_msgPollTimer){ clearInterval(_msgPollTimer); _msgPollTimer = null; }
}

// ---------------------------------------------------------------------------
// Burbuja de "no leídos" en la pestaña Mensajes.
// ---------------------------------------------------------------------------
async function actualizarBadgeMensajes(){
  if(!_token || !_ligaActual || !currentUser) return;
  const badge = document.getElementById('msg-n');
  if(!badge) return;

  const playoffsArrancaron = !!(playoff && playoff.started);
  const grupoCtx = playoffsArrancaron ? null : _msgResolverGrupoCtx();
  const tramoCtx = _msgResolverTramoCtx();
  const readState = _msgReadStateGet();

  const hilos = [{ tipo:'admin', desdeId: readState['admin']||0 }];
  if(grupoCtx) hilos.push({ tipo:'grupo', ciclo:grupoCtx.ciclo, grupo:grupoCtx.grupo, desdeId: readState[_msgThreadKey('grupo',grupoCtx)]||0 });
  if(tramoCtx) hilos.push({ tipo:'playoff', tramo:tramoCtx.tramo, desdeId: readState[_msgThreadKey('playoff',tramoCtx)]||0 });

  let data;
  try{
    const r = await fetch('/api/liga', {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer '+_token},
      body: JSON.stringify({ accion:'contarNoLeidos', ligaId:_ligaActual, hilos })
    });
    if(!r.ok) return;
    data = await r.json();
  }catch(e){ return; }
  if(!data || !Array.isArray(data.hilos)) return;

  const viendoMensajes = (typeof subView !== 'undefined' && subView === 'mensajes');
  let total = 0;
  data.hilos.forEach(h=>{
    const ctx = h.tipo==='admin' ? null : (h.tipo==='grupo' ? grupoCtx : tramoCtx);
    const key = _msgThreadKey(h.tipo, ctx);
    const estoyMirandoEsteHilo = viendoMensajes && _msgSubTab === h.tipo;
    if(estoyMirandoEsteHilo){
      _msgReadStateSetOne(key, h.ultimoId);
    } else {
      total += h.count;
    }
  });

  if(total > 0){
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

if(typeof setTimeout !== 'undefined') setTimeout(actualizarBadgeMensajes, 4000);
if(typeof setInterval !== 'undefined') setInterval(actualizarBadgeMensajes, 15000);
