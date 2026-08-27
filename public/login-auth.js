// ============================================================================
// public/login-auth.js — pantalla de login, selector de ligas, gestión de ligas
// Extraído del index.html original (líneas del script: 656..1369).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html: hay dependencias por
// hoisting y bloques de arranque (setInterval, IIFE) que dependen del orden.
// ============================================================================
function pintarLogin(d){
  const s=document.getElementById('login-user');if(!s)return;
  const prev=s.value;
  s.innerHTML='';
  const ph=document.createElement('option');ph.value='';ph.textContent=t('select_user');s.appendChild(ph);
  const opt=u=>new Option(u.i?u.v+' (inactivo)':u.v,u.v);
  // 1) El administrador, arriba de todo
  const admin=document.createElement('option');admin.value='admin';admin.textContent=t('admin_org');s.appendChild(admin);
  // 2) Las secciones: grupos del ciclo activo, o cuadros si están los playoffs
  const esPO=d.mode==='po';
  (d.sections||[]).forEach(sec=>{
    const og=document.createElement('optgroup');
    og.label=esPO?('Cuadro '+sec.k):groupName(sec.k);
    (sec.players||[]).forEach(u=>og.appendChild(opt(u)));
    s.appendChild(og);
  });
  // 3) Jugadores que no cayeron en ninguna sección (si los hubiera)
  if((d.loose||[]).length){
    const og=document.createElement('optgroup');og.label='Sin grupo';
    d.loose.forEach(u=>og.appendChild(opt(u)));
    s.appendChild(og);
  }
  // 4) Super Admin, abajo de todo
  const saOg=document.createElement('optgroup');saOg.label='Super Admin';
  saOg.appendChild(new Option('Super Administrador','superadmin'));
  s.appendChild(saOg);
  if(prev)s.value=prev;
}

// Renderiza el header configurable de la pantalla de login. Se ejecuta al
// arrancar la app y cada vez que el admin cambia la config. El header se
// oculta si no hay ningún link (nada útil que mostrar).
function renderLoginHeader(){
  const el = document.getElementById('login-header');
  if(!el) return;
  // Rehidratar desde localStorage si la config en memoria está vacía. Esto
  // es CRÍTICO para visitantes que abren el login SIN loguearse: hasta que
  // alguien no se loguea, no hay hydrate desde el server. El cache local es
  // la única fuente de verdad para ese primer paint.
  // Si ya hay algo en memoria (por ej. el admin loguado editando), NO se
  // pisa — la config en memoria es más nueva que el cache.
  if((!LOGIN_HEADER || !Array.isArray(LOGIN_HEADER.links) || !LOGIN_HEADER.links.length)){
    try {
      const cached = JSON.parse(localStorage.getItem('lh') || 'null');
      if(cached && typeof cached === 'object'){
        LOGIN_HEADER = {
          color: (typeof cached.color === 'string' && cached.color) ? cached.color : '#0E3470',
          textColor: (typeof cached.textColor === 'string') ? cached.textColor : '',
          links: Array.isArray(cached.links) ? cached.links.filter(l => l && l.text && l.url) : []
        };
      }
    } catch(_){ /* cache corrupta: ignorar y seguir con default */ }
  }
  const cfg = LOGIN_HEADER || { color:'#0E3470', textColor:'', links:[] };
  const links = Array.isArray(cfg.links) ? cfg.links.filter(l => l && l.text && l.url) : [];
  if(!links.length){
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  // Color de texto: usa el custom si el admin lo definió; si no, calcula
  // automático con autoTxt() (claro sobre fondo oscuro, oscuro sobre claro).
  const bg = cfg.color || '#0E3470';
  const fg = (cfg.textColor && String(cfg.textColor).trim())
    ? cfg.textColor
    : ((typeof autoTxt === 'function') ? autoTxt(bg) : '#fff');
  // Usa la clase .login-header-bar (definida en el CSS) para heredar padding,
  // gap, media queries móvil, negrita y borde grueso. Los estilos inline solo
  // definen los colores (dinámicos según config del admin). Sin la clase, las
  // media queries no aplicaban y el header se veía roto en móvil.
  el.className = 'login-header-bar';
  el.style.cssText = 'display:flex;background:' + bg + ';color:' + fg + ';box-shadow:0 1px 3px rgba(0,0,0,.08)';
  el.innerHTML = links.map(l => {
    // target=_blank + rel=noopener por seguridad (evita tabnabbing).
    const url = String(l.url).replace(/"/g, '&quot;');
    const txt = String(l.text).replace(/[<>&]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[ch]));
    return '<a href="' + url + '" target="_blank" rel="noopener" style="color:' + fg + ';border-color:' + fg + '">' + txt + '</a>';
  }).join('');
}

async function initLogin(){
  const e=document.getElementById('login-err');

  // Pintar el header custom del login (config editable por admin, ver
  // renderLoginHeader). Se hace apenas se abre el login, sin esperar a la
  // red — usa lo que haya en cache (localStorage 'lh' + memoria).
  try { renderLoginHeader(); } catch(_){}

  // En PARALELO, refrescar el header consultando al server. Este endpoint
  // NO requiere login: el header es info pública (color y links a la web
  // del club). Sin esta llamada, un móvil que nunca se logueó veía la
  // versión vieja del cache local hasta que alguien se logueara desde ese
  // dispositivo. Con esta llamada, cualquier cambio del admin se refleja
  // en todos los dispositivos apenas alguien abre el login.
  //
  // Fire-and-forget: no bloqueamos el flujo del login esperando esta
  // respuesta. Si el server tarda, el header aparece con lo que había en
  // cache y se actualiza cuando termina el fetch.
  fetch(_conLiga('/api/login-header'), { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(cfg => {
      if(!cfg || typeof cfg !== 'object') return;
      // Solo actualizamos si algo cambió, para no re-renderear al pedo
      const nuevo = JSON.stringify({
        color: cfg.color || '#0E3470',
        textColor: cfg.textColor || '',
        links: Array.isArray(cfg.links) ? cfg.links : []
      });
      const viejo = JSON.stringify(LOGIN_HEADER || {});
      if(nuevo === viejo) return;
      LOGIN_HEADER = JSON.parse(nuevo);
      try { localStorage.setItem('lh', nuevo); } catch(_){}
      try { renderLoginHeader(); } catch(_){}
    })
    .catch(() => { /* si falla, seguimos con lo cacheado */ });

  // 0) Determinar a qué liga se hace login. Si hay una sola activa, esa. Si hay
  //    varias, se muestra un selector. Esto hace el login dinámico: nunca entra
  //    a una liga cerrada, y sigue a la liga activa aunque cambie.
  await detectarLigaActiva();

  // 1) Pintar YA con lo último que sabemos. El desplegable aparece instantáneo
  //    en recargas y al cambiar de cuenta, sin esperar a la red.
  let hayCache=false;
  try{
    const c=localStorage.getItem('lsu');
    if(c){ pintarLogin(JSON.parse(c)); hayCache=true; }
  }catch(_){ /* caché corrupta: se ignora y se pide de nuevo */ }

  // 2) Precalentar las dos funciones en paralelo. Un GET a /api/login devuelve
  //    405 al instante sin tocar la base, pero deja la función levantada.
  fetch('/api/login',{method:'GET'}).catch(()=>{});

  // 3) Traer la lista de verdad y refrescar por detrás.
  let d={};
  try{
    const r=await fetch(_conLiga('/api/users'),{cache:'no-store'});
    if(!r.ok){
      const err=await r.json().catch(()=>({}));
      const msg=r.status===404 ? t('err_users_404') : t('err_server_said')+r.status+'. '+(err.error||'');
      // Si ya hay algo pintado de la caché, no se rompe la pantalla por un fallo
      // de refresco: se puede entrar igual y el servidor valida al final.
      if(e && !hayCache){e.textContent=t('err_no_users')+' '+msg;e.style.display='block';}
      console.error('/api/users →',r.status,err);
      return;
    }
    d=await r.json().catch(()=>({}));
    if(e)e.style.display='none';
  }catch(err){
    if(e && !hayCache){e.textContent=t('err_users_csp');e.style.display='block';}
    console.error('fetch /api/users falló:',err);
    return;
  }

  // 4) Repintar solo si algo cambió, y guardar para la próxima vez.
  const nuevo=JSON.stringify(d);
  let viejo=null; try{ viejo=localStorage.getItem('lsu'); }catch(_){}
  if(nuevo!==viejo){
    pintarLogin(d);
    // Solo nombres y grupos: no viajan hashes ni roles (lo garantiza /api/users).
    try{ localStorage.setItem('lsu',nuevo); }catch(_){ /* modo privado: sin caché */ }
  }
  cargarLigasPasadas();
}

// Detecta las ligas activas y decide a cuál hacer login.
// - 1 activa  → se elige sola (login directo a esa).
// - 2+ activas → se muestra un selector arriba del login.
// - 0 activas → cae en la liga por defecto (compatibilidad).
let _ligasActivas=[];
async function detectarLigaActiva(){
  let todas=[];
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'listar'})});
    const d=await r.json().catch(()=>({}));
    todas=(d.ligas||[]);
    _ligasActivas=todas.filter(l=>l.estado==='activa')
      .sort((a,b)=>(b.orden||0)-(a.orden||0));
  }catch(_){ _ligasActivas=[]; todas=[]; }
  const sel=document.getElementById('liga-selector');
  // CASO ESPECIAL: ninguna liga activa. El admin igual tiene que poder entrar
  // (para reabrir o crear una). Elegimos la última liga (la más reciente aunque
  // esté cerrada) como destino de login, y mostramos el acceso admin especial.
  if(_ligasActivas.length===0){
    const ultima=todas.slice().sort((a,b)=>(b.orden||0)-(a.orden||0))[0];
    _ligaActual = ultima ? ultima.id : null;
    _sinLigasActivas = true;
    if(sel) sel.style.display='none';
    aplicarNombreLigaLogin();
    mostrarAccesoAdmin(ultima);
    return;
  }
  _sinLigasActivas = false;
  ocultarAccesoAdmin();
  if(_ligasActivas.length===1){
    _ligaActual = _ligasActivas[0].id;
    if(sel) sel.style.display='none';
    aplicarNombreLigaLogin();
    return;
  }
  // Varias activas: si no hay una elegida (o la elegida ya no está activa), tomar la primera.
  if(!_ligaActual || !_ligasActivas.some(l=>l.id===_ligaActual)){
    _ligaActual=_ligasActivas[0].id;
  }
  pintarSelectorLigas();
  aplicarNombreLigaLogin();
}
// Muestra los botones para elegir entre varias ligas activas.
function pintarSelectorLigas(){
  let sel=document.getElementById('liga-selector');
  if(!sel){
    sel=document.createElement('div');
    sel.id='liga-selector';
    sel.className='liga-selector';
    const wrap=document.querySelector('.login-wrap');
    if(wrap&&wrap.parentNode){ wrap.parentNode.insertBefore(sel, wrap); }
  }
  sel.style.display='';
  sel.innerHTML='<div class="liga-sel-lbl">'+t('lsel_title')+'</div><div class="liga-sel-btns">'
    + _ligasActivas.map(l=>
      '<button class="liga-sel-btn'+(l.id===_ligaActual?' on':'')+'" onclick="elegirLigaLogin(\''+String(l.id).replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'")+'\')">'
      + '<i class="ti ti-trophy"></i> '+escPast(l.nombre)+'</button>').join('')
    +'</div>';
}
// El usuario elige a qué liga activa entrar: recargamos la lista de usuarios de esa liga.
async function elegirLigaLogin(id){
  _ligaActual=id;
  pintarSelectorLigas();
  aplicarNombreLigaLogin();
  // Recargar la lista de usuarios para la liga elegida.
  try{
    const r=await fetch(_conLiga('/api/users'),{cache:'no-store'});
    if(r.ok){ const d=await r.json(); pintarLogin(d); try{ localStorage.setItem('lsu',JSON.stringify(d)); }catch(_){}}
  }catch(_){}
}
// Pone el nombre de la liga activa elegida en el encabezado del login.
function aplicarNombreLigaLogin(){
  const activa=_ligasActivas.find(l=>l.id===_ligaActual);
  if(activa){
    const tit=document.getElementById('login-title');
    if(tit&&activa.nombre) tit.textContent=activa.nombre;
  }
}
// Acceso admin cuando NO hay ninguna liga activa: un aviso en el login para que
// el admin/superadmin igual pueda entrar (a la última liga) y reabrir o crear.
function mostrarAccesoAdmin(ultima){
  let box=document.getElementById('admin-access');
  if(!box){
    box=document.createElement('div');
    box.id='admin-access';
    box.className='admin-access';
    const wrap=document.querySelector('.login-wrap');
    if(wrap&&wrap.parentNode){ wrap.parentNode.insertBefore(box, wrap); }
  }
  box.style.display='';
  box.innerHTML='<div class="aa-ic"><i class="ti ti-shield-lock"></i></div>'
    +'<div class="aa-tx"><b>'+t('aa_title')+'</b><span>'+t('aa_sub')+'</span></div>';
  // El login normal ya apunta _ligaActual a la última liga: el admin entra con su
  // usuario y contraseña habituales. Solo lo avisamos con este cartel.
}
function ocultarAccesoAdmin(){
  const box=document.getElementById('admin-access');
  if(box) box.style.display='none';
}

// ---- Ligas pasadas (sistema unificado) ----
// Escapa texto para meterlo en HTML sin romper nada (nombres de liga).
function escPast(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// Trae la lista de ligas del índice y muestra las finalizadas en el desplegable
// público del login. Consulta sin cuenta, solo lectura.
async function cargarLigasPasadas(){
  const cont=document.getElementById('past-leagues');
  const list=document.getElementById('past-list');
  if(!cont||!list) return;
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'listar'})});
    const d=await r.json().catch(()=>({}));
    const ligas=(d.ligas||[]).filter(l=>l.estado==='finalizada')
      .sort((a,b)=>(b.orden||0)-(a.orden||0))   // más recientes primero
      .slice(0,3);                               // solo las últimas 3
    if(!ligas.length){ cont.style.display='none'; return; }
    list.innerHTML=ligas.map(l=>
      '<div class="past-item" onclick="entrarLigaPasada(\''+String(l.id).replace(/'/g,"\\'")+'\',\''+String(l.nombre).replace(/'/g,"\\'")+'\')">'
      +'<div class="past-item-ic"><i class="ti ti-trophy"></i></div>'
      +'<div class="past-item-tx"><b>'+escPast(l.nombre)+'</b><span>'+t('past_view')+'</span></div>'
      +'<i class="ti ti-chevron-right" style="color:var(--text2)"></i></div>'
    ).join('');
    cont.style.display='';
  }catch(_){ cont.style.display='none'; }
}
function togglePastLeagues(){
  document.getElementById('past-leagues').classList.toggle('open');
}
// Entra a una liga pasada en modo consulta (solo lectura, sin login).
async function entrarLigaPasada(id, nombre){
  const e=document.getElementById('login-err');
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'ver',id})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){ if(e){e.textContent=d.error||'No se pudo abrir esa liga.';e.style.display='block';} return; }
    // Activar modo consulta: sin token, liga fija, solo lectura.
    _ligaActual=id; _ligaReadOnly=true; _token=null;
    currentUser={ name:'', role:'guest', key:'' };   // invitado: no edita nada
    const ok=_hydrate(d.estado);
    if(!ok){ if(e){e.textContent=t('err_hydrate');e.style.display='block';} _ligaReadOnly=false; _ligaActual=null; return; }
    applyLeagueNameToDOM();
    document.getElementById('login-screen').style.display='none';
    document.getElementById('main-app').style.display='block';
    document.body.classList.add('readonly-mode');
    // Mostrar el banner de solo lectura y entrar a la vista de grupos del ciclo activo.
    mostrarBannerReadonly(nombre);
    if(playoff.started){ viewCycle='po';renderShell();showPlayoffView();renderSubTabs();updateHdr(); }
    else { viewCycle=activeN;renderShell();showSub('grupos'); }
  }catch(err){ if(e){e.textContent=t('err_no_server');e.style.display='block';} }
}
// Banner "estás viendo una liga finalizada" + botón volver.
function mostrarBannerSinLigas(){
  let b=document.getElementById('nolig-banner');
  if(!b){
    b=document.createElement('div');
    b.id='nolig-banner';
    b.className='readonly-banner';
    const app=document.getElementById('main-app');
    app.insertBefore(b, app.firstChild);
  }
  b.innerHTML='<i class="ti ti-alert-triangle"></i><span>'+t('aa_banner')+'</span>'
    +'<button onclick="showSub(\'admin\')"><i class="ti ti-settings"></i> '+t('tab_admin')+'</button>';
  b.style.display='flex';
}
function mostrarBannerReadonly(nombre){
  let b=document.getElementById('readonly-banner');
  if(!b){
    b=document.createElement('div');
    b.id='readonly-banner';
    b.className='readonly-banner';
    const app=document.getElementById('main-app');
    app.insertBefore(b, app.firstChild);
  }
  b.innerHTML='<i class="ti ti-eye"></i><span><b>'+escPast(nombre)+'</b> · '+t('past_readonly')+'</span>'
    +'<button onclick="salirLigaPasada()"><i class="ti ti-arrow-left"></i> '+t('past_back')+'</button>';
  b.style.display='flex';
}
// Volver del modo consulta al login.
function salirLigaPasada(){
  _ligaReadOnly=false; _ligaActual=null; currentUser=null;
  document.body.classList.remove('readonly-mode');
  const b=document.getElementById('readonly-banner'); if(b)b.style.display='none';
  document.getElementById('main-app').style.display='none';
  document.getElementById('login-screen').style.display='block';
  initLogin();
}

// ==================== GESTIÓN DE LIGAS (admin) ====================
// Lista las ligas del sistema con sus acciones (cerrar / reabrir / eliminar).
async function cargarGestionLigas(){
  const cont=document.getElementById('liga-mgmt-list');
  if(!cont) return;
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'listar'})});
    const d=await r.json().catch(()=>({}));
    const ligas=d.ligas||[];
    if(!ligas.length){ cont.innerHTML='<div class="pm-past-empty">'+t('lm_none')+'</div>'; return; }
    cont.innerHTML=ligas.map(l=>{
      const activa=l.estado==='activa';
      const esActual=(_ligaActual? l.id===_ligaActual : activa);   // la que estás usando
      const badge=activa
        ? '<span class="lm-badge lm-on">'+t('lm_active')+'</span>'
        : '<span class="lm-badge lm-off">'+t('lm_finished')+'</span>';
      let acciones='';
      if(activa){
        acciones+='<button class="btn btn-sm" onclick="cerrarLigaUI(\''+escJsAttr(l.id)+'\',\''+escJsAttr(l.nombre)+'\')"><i class="ti ti-flag-check"></i> '+t('lm_close')+'</button>';
      } else {
        acciones+='<button class="btn btn-sm" onclick="reabrirLigaUI(\''+escJsAttr(l.id)+'\',\''+escJsAttr(l.nombre)+'\')"><i class="ti ti-lock-open"></i> '+t('lm_reopen')+'</button>';
      }
      acciones+='<button class="btn btn-sm" onclick="renombrarLigaUI(\''+escJsAttr(l.id)+'\',\''+escJsAttr(l.nombre)+'\')"><i class="ti ti-pencil"></i> '+t('lm_rename')+'</button>';
      acciones+='<button class="btn btn-sm" onclick="renombrarLigaUI(\''+escJsAttr(l.id)+'\',\''+escJsAttr(l.nombre)+'\')"><i class="ti ti-pencil"></i> '+t('lm_rename')+'</button>';
      acciones+='<button class="btn btn-sm btn-danger" onclick="eliminarLigaUI(\''+escJsAttr(l.id)+'\',\''+escJsAttr(l.nombre)+'\')"><i class="ti ti-trash"></i> '+t('lm_delete')+'</button>';
      return '<div class="lm-item">'
        +'<div class="lm-item-h"><b>'+escPast(l.nombre)+'</b>'+badge+(esActual?' <span class="lm-badge lm-cur">'+t('past_current')+'</span>':'')+'</div>'
        +'<div class="lm-item-actions">'+acciones+'</div></div>';
    }).join('');
  }catch(_){ cont.innerHTML='<div class="pm-past-empty">'+t('past_loading_err')+'</div>'; }
}
// Escape para meter texto dentro de un atributo onclick con comillas simples.
function escJsAttr(s){return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');}

// ---- Crear liga: modal con selector de jugadores del catálogo + nuevos ----
let _crearLigaCat=[];       // catálogo cargado
let _crearLigaSel={};       // jugadorId -> true (seleccionados)
let _crearLigaNuevos=[];    // [{nombre,email}] jugadores nuevos a mano
let _crearLigaClubs=[];     // [{id,name,bg}] clubes que van a participar en la liga nueva
async function abrirCrearLiga(){
  document.getElementById('modal-title').textContent=t('lm_new_title');
  document.getElementById('modal-body').innerHTML='<div class="pm-past-load">'+t('past_loading')+'</div>';
  document.getElementById('modal-actions').innerHTML='<button class="btn" onclick="closeM()">'+t('close')+'</button>';
  document.getElementById('modal-bg').classList.add('open');
  _crearLigaSel={}; _crearLigaNuevos=[];
  // Los clubes arrancan como copia de los de la liga actual (mismo diseño de
  // partida); el admin los puede renombrar, recolorear, agregar o sacar.
  _crearLigaClubs=(Array.isArray(CLUBS)&&CLUBS.length) ? CLUBS.map(c=>({id:c.id,name:c.name,bg:c.bg})) : [{id:'c1',name:'Club A',bg:'#D6ECFB'}];
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({accion:'catalogo',ligaId:_ligaActual||undefined})});
    const d=await r.json().catch(()=>({}));
    _crearLigaCat=d.jugadores||[];
  }catch(_){ _crearLigaCat=[]; }
  pintarCrearLiga();
}
function pintarCrearLiga(){
  const body=document.getElementById('modal-body');
  let h='<div class="cl-form">';
  // Nombre de la liga
  h+='<label class="cl-lbl">'+t('lm_name_lbl')+'</label>';
  h+='<input id="cl-nombre" class="cl-inp" placeholder="'+t('lm_name_ph')+'" oninput="clSyncId()">';
  h+='<label class="cl-lbl">'+t('lm_id_lbl')+'</label>';
  h+='<input id="cl-id" class="cl-inp" placeholder="verano-2026">';
  h+='<div class="cl-hint">'+t('lm_id_hint')+'</div>';
  // Cantidad de grupos y ciclos
  h+='<div class="cl-gc">';
  h+='<div class="cl-gc-item"><label class="cl-lbl">'+t('lm_groups')+'</label><input id="cl-grupos" class="cl-inp" type="number" min="1" max="30" value="1" oninput="pintarCatFiltrado();pintarNuevos()"></div>';
  h+='<div class="cl-gc-item"><label class="cl-lbl">'+t('lm_cycles')+'</label><input id="cl-ciclos" class="cl-inp" type="number" min="1" max="12" value="3"></div>';
  h+='</div>';
  h+='<div class="cl-hint">'+t('lm_gc_hint')+'</div>';
  // Clubes que participan
  h+='<label class="cl-lbl" style="margin-top:12px">'+t('lm_clubs_lbl')+'</label>';
  h+='<div class="cl-hint" style="margin-top:-4px">'+t('lm_clubs_hint')+'</div>';
  h+='<div id="cl-clubs"></div>';
  h+='<button class="btn btn-sm" onclick="clAddClub()"><i class="ti ti-plus"></i> '+t('club_add')+'</button>';
  // Jugadores del catálogo
  h+='<label class="cl-lbl" style="margin-top:12px">'+t('lm_players_lbl')+'</label>';
  if(_crearLigaCat.length){
    h+='<div class="cl-search"><i class="ti ti-search"></i><input id="cl-search" placeholder="'+t('lm_search_ph')+'" oninput="pintarCatFiltrado()"></div>';
    h+='<div class="cl-cat" id="cl-cat"></div>';
  } else {
    h+='<div class="cl-hint">'+t('lm_no_catalog')+'</div>';
  }
  // Jugadores nuevos
  h+='<label class="cl-lbl" style="margin-top:12px">'+t('lm_new_players_lbl')+'</label>';
  h+='<div id="cl-nuevos"></div>';
  h+='<button class="btn btn-sm" onclick="clAddNuevo()"><i class="ti ti-plus"></i> '+t('lm_add_player')+'</button>';
  h+='<div class="cl-count" id="cl-count"></div>';
  h+='</div>';
  body.innerHTML=h;
  document.getElementById('modal-actions').innerHTML=
    '<button class="btn" onclick="closeM()">'+t('close')+'</button>'
    +'<button class="btn btn-primary" onclick="crearLigaConfirmar()"><i class="ti ti-check"></i> '+t('lm_create')+'</button>';
  pintarClCLubs(); pintarCatFiltrado(); pintarNuevos(); clActualizarCount();
}
// ---- Editor de clubes dentro del modal de crear liga ----
// Mismo patrón visual que clubsEditorHTML() del panel Admin, pero opera sobre
// _crearLigaClubs (liga todavía no creada) en vez del CLUBS global.
function pintarClCLubs(){
  const cont=document.getElementById('cl-clubs'); if(!cont)return;
  cont.innerHTML=_crearLigaClubs.map((c,i)=>
    '<div class="club-edit-row" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:.5rem;padding:.5rem;border:1px solid var(--border2);border-radius:8px;background:var(--surface)">'
    +'<input type="text" value="'+attr(c.name)+'" maxlength="24" oninput="clUpdateClubName('+i+',this.value)" style="flex:1;min-width:120px;padding:6px 10px;border-radius:8px;border:1.5px solid var(--border2);background:var(--surface);font-size:14px" placeholder="'+t('club_name_ph')+'">'
    +'<input id="cl-club-color-'+i+'" type="color" value="'+c.bg+'" oninput="clUpdateClubColor('+i+',this.value)" style="width:44px;height:34px;border:1.5px solid var(--border2);border-radius:8px;cursor:pointer;padding:2px">'
    +'<input id="cl-club-hex-'+i+'" type="text" value="'+c.bg+'" maxlength="7" spellcheck="false" oninput="clUpdateClubColorHex('+i+',this.value)" style="width:82px;font-size:12px;font-family:monospace;padding:6px 8px;border:1.5px solid var(--border2);border-radius:8px;background:var(--surface);color:var(--text)" placeholder="#RRGGBB">'
    +'<span id="cl-club-demo-'+i+'" style="font-size:12px;font-weight:600;padding:5px 12px;border-radius:6px;background:'+c.bg+';color:'+autoTxt(c.bg)+'">'+(attr(c.name)||t('club_short'))+'</span>'
    +'<button class="btn btn-sm" onclick="clRemoveClub('+i+')" title="'+t('club_delete')+'" style="background:#fee2e2;color:#b91c1c"><i class="ti ti-trash"></i></button>'
    +'</div>').join('');
}
function clUpdateClubName(i,val){
  if(!_crearLigaClubs[i])return;
  _crearLigaClubs[i].name=val;
  const demo=document.getElementById('cl-club-demo-'+i);
  if(demo) demo.textContent=val||t('club_short');
}
function clUpdateClubColor(i,val){
  if(!_crearLigaClubs[i])return;
  _crearLigaClubs[i].bg=val;
  const hex=document.getElementById('cl-club-hex-'+i);
  if(hex){ hex.value=val; hex.style.borderColor=''; }
  const demo=document.getElementById('cl-club-demo-'+i);
  if(demo){ demo.style.background=val; demo.style.color=autoTxt(val); }
}
function clUpdateClubColorHex(i,val){
  if(!_crearLigaClubs[i])return;
  const hexInp=document.getElementById('cl-club-hex-'+i);
  let v=(val||'').trim();
  if(v&&v[0]!=='#')v='#'+v;
  let full=null;
  if(/^#[0-9a-fA-F]{6}$/.test(v)) full=v;
  else if(/^#[0-9a-fA-F]{3}$/.test(v)){ const h=v.slice(1); full='#'+h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; }
  if(!full){ if(hexInp) hexInp.style.borderColor='#e55'; return; }
  if(hexInp) hexInp.style.borderColor='';
  _crearLigaClubs[i].bg=full;
  const picker=document.getElementById('cl-club-color-'+i);
  if(picker) picker.value=full;
  const demo=document.getElementById('cl-club-demo-'+i);
  if(demo){ demo.style.background=full; demo.style.color=autoTxt(full); }
}
function clAddClub(){
  const id='c'+Date.now().toString(36);
  _crearLigaClubs.push({ id, name:'', bg:'#E5E7EB' });
  pintarClCLubs();
}
function clRemoveClub(i){
  if(!_crearLigaClubs[i])return;
  if(_crearLigaClubs.length<=1){ toast(t('club_min_one')); return; }
  _crearLigaClubs.splice(i,1);
  pintarClCLubs();
}
function _clNumGrupos(){ return parseInt(document.getElementById('cl-grupos')?.value,10)||1; }
// callExpr: expresión JS completa a ejecutar en el onchange, ej "clSetGrupo('id',this.value)"
function _clGrupoSelectHTML(cur,callExpr){
  const n=_clNumGrupos();
  if(n<=1) return '';
  let h='<select class="cl-grp-sel" onclick="event.stopPropagation()" onchange="'+callExpr+'">';
  for(let g=1; g<=n; g++) h+='<option value="'+g+'"'+(g===cur?' selected':'')+'>'+t('group')+' '+g+'</option>';
  return h+'</select>';
}
function pintarCatFiltrado(){
  const cont=document.getElementById('cl-cat'); if(!cont)return;
  const q=(document.getElementById('cl-search')?.value||'').toLowerCase().trim();
  const lista=_crearLigaCat.filter(j=>!q||j.nombre.toLowerCase().includes(q));
  cont.innerHTML=lista.map(j=>{
    const sel=_crearLigaSel[j.jugadorId];
    const on=!!sel;
    const grpSel=on?_clGrupoSelectHTML(sel.grupo||1,"clSetGrupo('"+escJsAttr(j.jugadorId)+"',this.value)"):'';
    return '<div class="cl-cat-item'+(on?' on':'')+'" onclick="clToggle(\''+escJsAttr(j.jugadorId)+'\')">'
      +'<div class="cl-chk">'+(on?'<i class="ti ti-check"></i>':'')+'</div>'
      +'<span>'+escPast(j.nombre)+'</span>'+grpSel+'</div>';
  }).join('')||'<div class="cl-hint">'+t('lm_no_match')+'</div>';
}
function clToggle(id){ if(_crearLigaSel[id])delete _crearLigaSel[id]; else _crearLigaSel[id]={grupo:1}; pintarCatFiltrado(); clActualizarCount(); }
function clSetGrupo(id,v){ if(_crearLigaSel[id]) _crearLigaSel[id].grupo=parseInt(v,10)||1; }
function clAddNuevo(){ _crearLigaNuevos.push({nombre:'',email:'',grupo:1}); pintarNuevos(); clActualizarCount(); }
function clDelNuevo(i){ _crearLigaNuevos.splice(i,1); pintarNuevos(); clActualizarCount(); }
function clSetGrupoNuevo(i,v){ if(_crearLigaNuevos[i]) _crearLigaNuevos[i].grupo=parseInt(v,10)||1; }
function pintarNuevos(){
  const cont=document.getElementById('cl-nuevos'); if(!cont)return;
  cont.innerHTML=_crearLigaNuevos.map((n,i)=>
    '<div class="cl-nuevo-row">'
    +'<input class="cl-inp cl-inp-sm" placeholder="'+t('lm_np_name')+'" value="'+escPast(n.nombre)+'" oninput="_crearLigaNuevos['+i+'].nombre=this.value;clActualizarCount()">'
    +'<input class="cl-inp cl-inp-sm" placeholder="'+t('lm_np_email')+'" value="'+escPast(n.email)+'" oninput="_crearLigaNuevos['+i+'].email=this.value">'
    +_clGrupoSelectHTML(n.grupo||1,'clSetGrupoNuevo('+i+',this.value)')
    +'<button class="cl-del" onclick="clDelNuevo('+i+')"><i class="ti ti-x"></i></button>'
    +'</div>').join('');
}
function clActualizarCount(){
  const el=document.getElementById('cl-count'); if(!el)return;
  const nSel=Object.keys(_crearLigaSel).length;
  const nNew=_crearLigaNuevos.filter(n=>n.nombre.trim()).length;
  el.textContent=t('lm_total').replace('{n}', nSel+nNew);
}
// Deriva un id sugerido a partir del nombre (minúsculas, guiones).
function clSyncId(){
  const nom=document.getElementById('cl-nombre')?.value||'';
  const idInp=document.getElementById('cl-id'); if(!idInp)return;
  if(idInp.dataset.touched==='1')return;
  idInp.value=nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64);
}
async function crearLigaConfirmar(){
  const nombre=(document.getElementById('cl-nombre')?.value||'').trim();
  const id=(document.getElementById('cl-id')?.value||'').trim().toLowerCase();
  const numGrupos=parseInt(document.getElementById('cl-grupos')?.value,10)||1;
  const numCiclos=parseInt(document.getElementById('cl-ciclos')?.value,10)||1;
  if(!nombre){ alert(t('lm_err_name')); return; }
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)){ alert(t('lm_err_id')); return; }
  // Validar clubes: ninguno vacío, sin nombres repetidos.
  const nombresClubs=_crearLigaClubs.map(c=>(c.name||'').trim());
  if(nombresClubs.some(n=>!n)){ alert(t('club_err_empty')); return; }
  if(new Set(nombresClubs.map(n=>n.toLowerCase())).size!==nombresClubs.length){ alert(t('club_err_dup')); return; }
  const clubs=_crearLigaClubs.map(c=>({id:c.id,name:c.name.trim(),bg:c.bg}));
  // Armar la lista de jugadores: del catálogo + nuevos con nombre.
  const jugadores=[];
  Object.keys(_crearLigaSel).forEach(jid=>jugadores.push({jugadorId:jid, grupo:(_crearLigaSel[jid]&&_crearLigaSel[jid].grupo)||1}));
  _crearLigaNuevos.forEach(n=>{ if(n.nombre.trim()) jugadores.push({nombre:n.nombre.trim(), email:(n.email||'').trim(), grupo:n.grupo||1}); });
  if(!jugadores.length){ if(!confirm(t('lm_confirm_empty')))return; }
  const btn=event&&event.target?event.target.closest('button'):null;
  if(btn){btn.disabled=true;btn.textContent=t('lm_creating');}
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({accion:'crear',id,nombre,jugadores,numGrupos,numCiclos,clubs,ligaId:_ligaActual||undefined})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){ alert(d.error||t('lm_err_create')); if(btn){btn.disabled=false;btn.textContent=t('lm_create');} return; }
    closeM();
    toast(t('lm_created').replace('{n}', escPast(nombre)));
    cargarGestionLigas();
  }catch(_){ alert(t('lm_err_create')); if(btn){btn.disabled=false;btn.textContent=t('lm_create');} }
}

// ---- Agregar jugadores de ligas anteriores a la liga ya creada ----
// Mismo patrón que "crear liga": modal con catálogo + buscador, pero acá
// se suman a la liga actual (_ligaActual) en vez de crear una liga nueva,
// y el admin elige a qué grupo del ciclo activo va cada jugador.
let _addLigaCat=[];   // catálogo filtrado (sin los que ya están en esta liga)
let _addLigaSel={};   // jugadorId -> {grupo}
async function abrirAgregarJugadores(){
  document.getElementById('modal-title').textContent=t('aj_title');
  document.getElementById('modal-body').innerHTML='<div class="pm-past-load">'+t('past_loading')+'</div>';
  document.getElementById('modal-actions').innerHTML='<button class="btn" onclick="closeM()">'+t('close')+'</button>';
  document.getElementById('modal-bg').classList.add('open');
  _addLigaSel={};
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({accion:'catalogo',ligaId:_ligaActual||undefined})});
    const d=await r.json().catch(()=>({}));
    const yaEnLiga=new Set(ALLNAMES||[]);
    _addLigaCat=(d.jugadores||[]).filter(j=>!yaEnLiga.has(j.nombre));
  }catch(_){ _addLigaCat=[]; }
  pintarAgregarJugadores();
}
function _ajNumGrupos(){ const grps=(getActive()&&getActive().groups)?getActive().groups:[]; return grps.length||1; }
function pintarAgregarJugadores(){
  const body=document.getElementById('modal-body');
  let h='<div class="cl-form">';
  h+='<p class="legend-txt" style="margin-top:0">'+t('aj_desc')+'</p>';
  if(_addLigaCat.length){
    h+='<div class="cl-search"><i class="ti ti-search"></i><input id="aj-search" placeholder="'+t('lm_search_ph')+'" oninput="pintarAjFiltrado()"></div>';
    h+='<div class="cl-cat" id="aj-cat"></div>';
  } else {
    h+='<div class="cl-hint">'+t('aj_none')+'</div>';
  }
  h+='<div class="cl-count" id="aj-count"></div>';
  h+='</div>';
  body.innerHTML=h;
  document.getElementById('modal-actions').innerHTML=
    '<button class="btn" onclick="closeM()">'+t('close')+'</button>'
    +'<button class="btn btn-primary" onclick="agregarJugadoresConfirmar()"><i class="ti ti-user-plus"></i> '+t('aj_add')+'</button>';
  pintarAjFiltrado(); ajActualizarCount();
}
function pintarAjFiltrado(){
  const cont=document.getElementById('aj-cat'); if(!cont)return;
  const q=(document.getElementById('aj-search')?.value||'').toLowerCase().trim();
  const lista=_addLigaCat.filter(j=>!q||j.nombre.toLowerCase().includes(q));
  const numGrupos=_ajNumGrupos();
  cont.innerHTML=lista.map(j=>{
    const sel=_addLigaSel[j.jugadorId];
    const on=!!sel;
    let grpSel='';
    if(on && numGrupos>1){
      const cur=sel.grupo||1;
      grpSel='<select class="cl-grp-sel" onclick="event.stopPropagation()" onchange="ajSetGrupo(\''+escJsAttr(j.jugadorId)+'\',this.value)">';
      for(let g=1; g<=numGrupos; g++) grpSel+='<option value="'+g+'"'+(g===cur?' selected':'')+'>'+groupName(g)+'</option>';
      grpSel+='</select>';
    }
    return '<div class="cl-cat-item'+(on?' on':'')+'" onclick="ajToggle(\''+escJsAttr(j.jugadorId)+'\')">'
      +'<div class="cl-chk">'+(on?'<i class="ti ti-check"></i>':'')+'</div>'
      +'<span>'+escPast(j.nombre)+'</span>'+grpSel+'</div>';
  }).join('')||'<div class="cl-hint">'+t('lm_no_match')+'</div>';
}
function ajToggle(id){ if(_addLigaSel[id])delete _addLigaSel[id]; else _addLigaSel[id]={grupo:1}; pintarAjFiltrado(); ajActualizarCount(); }
function ajSetGrupo(id,v){ if(_addLigaSel[id]) _addLigaSel[id].grupo=parseInt(v,10)||1; }
function ajActualizarCount(){
  const el=document.getElementById('aj-count'); if(!el)return;
  el.textContent=t('aj_total').replace('{n}', Object.keys(_addLigaSel).length);
}
async function agregarJugadoresConfirmar(){
  const ids=Object.keys(_addLigaSel);
  if(!ids.length){ toast(t('aj_none_sel')); return; }
  const jugadores=ids.map(jid=>({jugadorId:jid, grupo:_addLigaSel[jid].grupo||1}));
  const btn=event&&event.target?event.target.closest('button'):null;
  if(btn){btn.disabled=true;btn.textContent=t('aj_adding');}
  try{
    // Guardamos primero cualquier cambio local pendiente para no pisarlo,
    // pedimos al servidor que agregue los jugadores directo sobre la liga,
    // y después releemos el estado para reflejarlo acá.
    await persist(true);
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({accion:'agregarJugadores', id:_ligaActual, jugadores, ligaId:_ligaActual||undefined})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){ alert(d.error||t('aj_err')); if(btn){btn.disabled=false;btn.textContent=t('aj_add');} return; }
    closeM();
    toast(t('aj_done').replace('{n}', (d.agregados||[]).length));
    await loadState();
    renderShell();
    showSub('perfil');
  }catch(_){ alert(t('aj_err')); if(btn){btn.disabled=false;btn.textContent=t('aj_add');} }
}

// ---- Cerrar / reabrir / eliminar ----
async function cerrarLigaUI(id,nombre){
  if(!(await confirmarModal(t('lm_close_confirm').replace('{n}',nombre), {titulo:t('lm_close'), okTxt:t('lm_close')})))return;
  await accionLiga('cerrar',{id});
}
async function reabrirLigaUI(id,nombre){
  if(!(await confirmarModal(t('lm_reopen_confirm').replace('{n}',nombre), {titulo:t('lm_reopen'), okTxt:t('lm_reopen')})))return;
  await accionLiga('reabrir',{id});
}
async function renombrarLigaUI(id,nombre){
  const nuevo=prompt(t('lm_rename_prompt'), nombre);
  if(nuevo===null)return;
  const n=nuevo.trim();
  if(!n){ alert(t('lm_rename_empty')); return; }
  if(n===nombre)return;   // sin cambios
  await accionLiga('renombrar',{id,nombre:n});
}
async function eliminarLigaUI(id,nombre){
  // Doble confirmación: la segunda pide escribir el nombre exacto.
  if(!(await confirmarModal(t('lm_delete_confirm1').replace('{n}',nombre), {titulo:t('lm_delete'), okTxt:t('lm_delete'), peligro:true})))return;
  const tecleado=prompt(t('lm_delete_confirm2').replace('{n}',nombre));
  if(tecleado===null)return;
  if(tecleado.trim()!==nombre && tecleado.trim()!==id){ alert(t('lm_delete_mismatch')); return; }
  await accionLiga('eliminar',{id,confirmar:tecleado.trim()});
}
// Renombrar el nombre visible de una liga (el id interno queda fijo).
async function renombrarLigaUI(id,nombreActual){
  const nuevo=prompt(t('lm_rename_prompt'), nombreActual);
  if(nuevo===null)return;
  const limpio=nuevo.trim();
  if(!limpio){ alert(t('lm_rename_empty')); return; }
  if(limpio===nombreActual)return;
  await accionLiga('renombrar',{id,nombre:limpio});
}
async function accionLiga(accion,extra){
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify(Object.assign({accion,ligaId:_ligaActual||undefined},extra))});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){ alert(d.error||t('lm_err_action')); return; }
    toast(t('lm_action_ok'));
    cargarGestionLigas();
  }catch(_){ alert(t('lm_err_action')); }
}

// ==================== ESTADÍSTICAS DEL JUGADOR ====================
// Calcula PJ/PG/PP de un jugador dado el estado de una liga (cuenta por sets ganados).
