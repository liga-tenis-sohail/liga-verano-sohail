// ============================================================================
// public/persistencia.js — load/save contra el backend, hydrate, backup y persist
// Extraído del index.html original (líneas del script: 6321..6754).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html: hay dependencias por
// hoisting y bloques de arranque (setInterval, IIFE) que dependen del orden.
// ============================================================================
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

// Skeleton placeholder animado. Uso: mostrarSkeleton(container, filas)
// Reemplaza el contenido del contenedor con N rectángulos animados que
// simulan filas de una lista. Usar antes de un fetch, borrar al terminar.
function mostrarSkeleton(container, filas){
  if(!container) return;
  filas = filas || 3;
  let html = '';
  for(let i = 0; i < filas; i++){
    html += '<div class="skeleton-row" style="height:44px;background:linear-gradient(90deg,#eef2f7 25%,#e2e8f0 50%,#eef2f7 75%);background-size:200% 100%;border-radius:8px;margin-bottom:6px;animation:sk-shine 1.2s infinite linear"></div>';
  }
  container.innerHTML = html;
}

// ===== CONEXIÓN A SUPABASE — guardado instantáneo =====
let _lastSaved=null,_saving=false,_pendingForce=false,_loadOK=false,_dbEmpty=false,_prioritySave=false,_lastSaveError='',_reintento409=false;
// Versión del estado. La incrementa el servidor en cada guardado: si dos personas
// tienen la app abierta, la segunda en guardar recibe 409 en vez de pisar a la primera.
let _stateV=0;
function _serialize(){
  return JSON.stringify({_v:_stateV,cycles,matches,matchId,activeN,playoff,DESTINO,FECHAS,PO_FECHAS,ALLNAMES,users:USERS,PUNTOS,LOG,LEAGUE_NAME,LEAGUE_SUBTITLE,LEAGUE_COLOR_PRI,LEAGUE_COLOR_ACC,LEAGUE_COLOR_HL,CLUBS,COLOR_DISPUTA,RATING_ON,RATING_SEEDS,RATING_OVERRIDES,REGLAMENTO,LOGIN_HEADER});
}

function _hydrate(d){try{
  _stateV=(typeof d._v==='number')?d._v:0;
  if(d.cycles)cycles=d.cycles;
  if(Array.isArray(d.matches))matches=d.matches;
  if(typeof d.matchId==='number')matchId=d.matchId;
  if(typeof d.activeN==='number')activeN=d.activeN;
  if(d.playoff){
    playoff=d.playoff;
    // Garantizar campos que pueden faltar en versiones viejas del schema
    if(!Array.isArray(playoff.tramos))playoff.tramos=[];
    if(typeof playoff.numTramos!=='number')playoff.numTramos=4;
    if(typeof playoff.started!=='boolean')playoff.started=false;
    if(typeof playoff.preview!=='boolean')playoff.preview=false;
    if(typeof playoff.forcedSize!=='number')playoff.forcedSize=0;
    if(!playoff.results||typeof playoff.results!=='object')playoff.results={};
    if(!Array.isArray(playoff.qualified))playoff.qualified=[];
    if(typeof playoff.viewT!=='number')playoff.viewT=0;
  }
  if(d.DESTINO)DESTINO=d.DESTINO;
  if(d.FECHAS)FECHAS=d.FECHAS;
  if(d.PO_FECHAS){// Migrate old string format to new object format
  Object.keys(d.PO_FECHAS).forEach(r=>{
    const v=d.PO_FECHAS[r];
    if(typeof v==='string')PO_FECHAS[r]={type:'single',date:v,from:'',to:''};
    else PO_FECHAS[r]=v;
  });
}
  if(Array.isArray(d.ALLNAMES))ALLNAMES=d.ALLNAMES;
  if(d.users){Object.keys(USERS).forEach(k=>delete USERS[k]);Object.assign(USERS,d.users);
    // USERS se reemplaza entero, así que currentUser quedaba apuntando al objeto
    // VIEJO: si mientras tanto le quitaron el rol de admin, su navegador seguía
    // mostrándole los botones con el isAdmin viejo. Se lo re-apunta al fresco.
    if(currentUser && currentUser.key && USERS[currentUser.key]){
      const _k=currentUser.key; currentUser=USERS[_k]; currentUser.key=_k;
    }
  }
  // Migración: un jugador ascendido con la versión anterior quedó con role:'admin'
  // y desapareció de los grupos, la clasificación y su historial. Se lo devuelve
  // a 'player' conservándole la capacidad de administrar.
  Object.keys(USERS).forEach(k=>{
    if(k!=='admin' && k!=='superadmin' && USERS[k] && USERS[k].role==='admin'){
      USERS[k].role='player'; USERS[k].isAdmin=true;
    }
  });
  // Migración: crear superadmin si no existe en base de datos vieja.
  // IMPORTANTE: el criterio es "ningún usuario tiene role superadmin" — el mismo
  // que usa el servidor para aceptar la migración. Si se chequeara solo la clave
  // 'superadmin', un estado con el rol bajo otra clave haría que cada cliente
  // creara un superadmin extra y el servidor rechazara TODOS los guardados con 403.
  const _hayAlgunSuper=Object.keys(USERS).some(k=>USERS[k]&&USERS[k].role==='superadmin');
  if(!_hayAlgunSuper)USERS['superadmin']={role:'superadmin',pass:ADMIN_PASS_HASH,name:'Super Administrador',email:'',tel:''};
  if(d.PUNTOS)PUNTOS=d.PUNTOS;
  if(Array.isArray(d.LOG))LOG=d.LOG;
  if(d.LEAGUE_NAME)LEAGUE_NAME=d.LEAGUE_NAME;
  REGLAMENTO=(typeof d.REGLAMENTO==='string')?d.REGLAMENTO:'';
  if(d.LEAGUE_SUBTITLE)LEAGUE_SUBTITLE=d.LEAGUE_SUBTITLE;
  if(d.LEAGUE_COLOR_PRI)LEAGUE_COLOR_PRI=d.LEAGUE_COLOR_PRI;
  if(d.LEAGUE_COLOR_ACC)LEAGUE_COLOR_ACC=d.LEAGUE_COLOR_ACC;
  if(d.LEAGUE_COLOR_HL)LEAGUE_COLOR_HL=d.LEAGUE_COLOR_HL;
  if(Array.isArray(d.CLUBS)&&d.CLUBS.length){
    const validos=d.CLUBS.filter(c=>c&&c.name&&c.bg);
    // Solo se reemplaza si quedó al menos un club válido: si todos vinieran corruptos,
    // se mantienen los que ya había en memoria en vez de quedar sin ningún club
    // (lo que dejaría el formulario de carga sin opciones).
    if(validos.length) CLUBS=validos;
  }
  if(typeof d.COLOR_DISPUTA==='string')COLOR_DISPUTA=d.COLOR_DISPUTA;
  // LOGIN_HEADER: config del header editable del login (color + links).
  // Validamos defensivamente cada campo por si viene de una versión previa
  // sin este campo (default = azul con lista vacía).
  if(d.LOGIN_HEADER && typeof d.LOGIN_HEADER === 'object'){
    LOGIN_HEADER = {
      color: (typeof d.LOGIN_HEADER.color === 'string' && d.LOGIN_HEADER.color) ? d.LOGIN_HEADER.color : '#0E3470',
      textColor: (typeof d.LOGIN_HEADER.textColor === 'string') ? d.LOGIN_HEADER.textColor : '',
      links: Array.isArray(d.LOGIN_HEADER.links) ? d.LOGIN_HEADER.links.filter(l => l && l.text && l.url).slice(0, 20) : []
    };
    // Refrescar el cache de localStorage con la versión autoritativa del server.
    // Así el próximo visitante ve la última config aunque no se haya logueado.
    try { localStorage.setItem('lh', JSON.stringify(LOGIN_HEADER)); } catch(_){}
  }
  if(typeof d.RATING_ON==='boolean')RATING_ON=d.RATING_ON;
  RATING_SEEDS=(d.RATING_SEEDS&&typeof d.RATING_SEEDS==='object')?d.RATING_SEEDS:{};
  RATING_OVERRIDES=(d.RATING_OVERRIDES&&typeof d.RATING_OVERRIDES==='object')?d.RATING_OVERRIDES:{};
  // Aplicar colores guardados al cargar
  if(d.LEAGUE_COLOR_PRI||d.LEAGUE_COLOR_ACC||d.LEAGUE_COLOR_HL)applyLeagueColors(d.LEAGUE_COLOR_PRI||LEAGUE_COLOR_PRI,d.LEAGUE_COLOR_ACC||LEAGUE_COLOR_ACC,d.LEAGUE_COLOR_HL||LEAGUE_COLOR_HL);
  return true;
}catch(e){console.warn('hydrate',e);return false;}
}

// Migración automática de passwords en texto plano → v1 (SHA-256)
// Los v1 se upgradan a v2 (PBKDF2) automáticamente en el siguiente login del usuario
// ===== COPIA DE SEGURIDAD: backup y restore del estado COMPLETO =====
function exportBackup(){
  try{
    const json=_serialize();
    const wb=XLSX.utils.book_new();
    const d=new Date();const pad=n=>String(n).padStart(2,'0');
    const stamp=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes());
    // Hoja 1: Resumen (legible)
    const resumen=[
      ['Liga', LEAGUE_NAME||''],
      ['Subtítulo', LEAGUE_SUBTITLE||''],
      ['Fecha del backup', d.toLocaleString('es-ES')],
      ['Jugadores', (ALLNAMES||[]).length],
      ['Ciclos', (cycles||[]).length],
      ['Partidos', (matches||[]).length],
      ['', ''],
      ['Copia de seguridad completa de la liga.', ''],
      ['Para restaurarla, usá "Restaurar backup" en el panel de administración.', '']
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');
    // Hoja 2: Jugadores (legible)
    const jug=[['Nombre','Email','Teléfono','Grupo (ciclo activo)','Estado']];
    (ALLNAMES||[]).slice().sort((a,b)=>String(a).localeCompare(String(b),'es')).forEach(n=>{
      const u=USERS[n]||{};const loc=(typeof findLoc==='function')?findLoc(n,activeN):null;
      jug.push([n, u.email||'', u.tel||'', loc?groupName(loc.g):'', u.inactive?'Inactivo':'Activo']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jug), 'Jugadores');
    // Hoja 3: técnica — estado completo para restaurar (NO editar)
    const CHUNK=30000;
    const bk=[['LIGA_SOHAIL_BACKUP_V1']];
    for(let i=0;i<json.length;i+=CHUNK){ bk.push([json.slice(i,i+CHUNK)]); }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bk), '_LIGA_BACKUP');
    XLSX.writeFile(wb,'backup_liga_sohail_'+stamp+'.xlsx');
    if(typeof addLog==='function')addLog('Backup completo exportado (Excel)','');
    toast('Backup completo descargado en Excel. Guardalo en un lugar seguro.');
  }catch(e){toast('Error al generar el backup: '+e.message);}
}
function importBackup(input){
  const file=input.files&&input.files[0];
  if(!file)return;
  if(!(esAdmin(currentUser))){toast(t('validated_only_admin'));input.value='';return;}
  const nameLC=(file.name||'').toLowerCase();
  const isXlsx=nameLC.endsWith('.xlsx')||nameLC.endsWith('.xls');
  const reader=new FileReader();
  reader.onload=async function(e){
    try{
      let obj=null;
      if(isXlsx){
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
        const ws=wb.Sheets['_LIGA_BACKUP'];
        if(!ws){toast('El Excel no tiene la hoja de backup. ¿Seguro que es un backup de la liga?');input.value='';return;}
        const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        if(!aoa.length||String((aoa[0]||[])[0]||'')!=='LIGA_SOHAIL_BACKUP_V1'){toast('El Excel no parece un backup válido de la liga.');input.value='';return;}
        let json='';for(let i=1;i<aoa.length;i++){json+=String((aoa[i]||[])[0]||'');}
        obj=JSON.parse(json);
      } else {
        obj=JSON.parse(e.target.result);
      }
      if(!obj||typeof obj!=='object'||!obj.cycles||!obj.users){
        toast('El archivo no parece un backup válido de la liga.');input.value='';return;
      }
      const nJug=Array.isArray(obj.ALLNAMES)?obj.ALLNAMES.length:Object.keys(obj.users||{}).length;
      const nPart=Array.isArray(obj.matches)?obj.matches.length:0;
      if(!confirm('RESTAURAR BACKUP\n\nEsto REEMPLAZA todo el estado actual de la liga por el del archivo:\n\n• '+nJug+' jugadores\n• '+nPart+' partidos\n• ciclos, grupos, puntos, ascensos/descensos, colores y nombre\n\n¿Continuar? Esta acción sobrescribe la base de datos.')){input.value='';return;}
      const ok=_hydrate(obj);
      if(!ok){toast('No se pudo aplicar el backup (formato inválido).');input.value='';return;}
      _loadOK=true;_dbEmpty=false;_hideLoadError();
      // CRÍTICO: el servidor rechaza con 409 si el _v del backup no coincide con el
      // _v actual de la base. Al restaurar, tenemos que alinear la versión con la que
      // está en el servidor AHORA, no con la que tenía cuando se hizo el backup.
      // Leemos el _v actual y lo ponemos en _stateV para que _doPersist pase el check.
      try{
        const rv=await fetch(_conLiga('/api/state'),{headers:{Authorization:'Bearer '+_token},cache:'no-store'});
        const rd=await rv.json().catch(()=>({}));
        if(rv.ok && rd.state && typeof rd.state._v==='number') _stateV=rd.state._v;
        else _stateV=0; // si no podemos leer, forzar desde 0 (el servidor aceptará igualmente si no hay _v)
      }catch(e){ _stateV=0; }
      if(typeof addLog==='function')addLog('Backup completo RESTAURADO',{jugadores:nJug,partidos:nPart});
      await _doPersist();
      toast('Backup restaurado. Recargando…');
      setTimeout(()=>location.reload(),700);
    }catch(err){toast('Error al leer el backup: '+err.message);input.value='';}
  };
  if(isXlsx) reader.readAsArrayBuffer(file);
  else reader.readAsText(file);
}
function initEmptyLeague(){
  if(!(esAdmin(currentUser))){toast(t('validated_only_admin'));return;}
  if(!_dbEmpty){toast('La base ya tiene datos — no hace falta inicializar. Para reemplazar todo, usá Restaurar backup.');return;}
  if(!confirm('INICIALIZAR LIGA\n\nLa base de datos está vacía. Esto GUARDA el estado actual (jugadores y grupos por defecto) como punto de partida.\n\nSolo hacelo en una liga NUEVA. ¿Continuar?'))return;
  _loadOK=true;_dbEmpty=false;_hideLoadError();
  _doPersist();
  toast('Estado inicial guardado.');
  setTimeout(()=>location.reload(),700);
}
function _showLoadError(msg){
  try{
    let b=document.getElementById('_loaderr');
    if(!b){b=document.createElement('div');b.id='_loaderr';b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#791F1F;color:#fff;padding:10px 16px;font-size:13px;line-height:1.4;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.35);font-family:system-ui,-apple-system,sans-serif';document.body.appendChild(b);}
    b.innerHTML='⚠️ '+msg+' &nbsp;<button onclick="location.reload()" style="background:#fff;color:#791F1F;border:none;padding:3px 12px;border-radius:6px;font-weight:700;cursor:pointer;margin-left:6px">Recargar</button>';
  }catch(e){}
}
function _hideLoadError(){var b=document.getElementById('_loaderr');if(b)b.remove();}

async function loadState(){
  if(!_token){console.warn('⚠️ loadState sin sesión');return;}
  console.log('🔄 Cargando estado desde el servidor...');
  let d;
  try{
    const r=await fetch(_conLiga('/api/state'),{headers:{Authorization:'Bearer '+_token},cache:'no-store'});
    if(r.status===401){_token=null;_showLoadError(t('err_session_expired'));return;}
    d=await r.json().catch(()=>({}));
    if(r.status===403){_token=null;_showLoadError(d.error||t('err_no_access'));return;}
    if(d.token)_token=d.token;   // sesión deslizante
    if(!r.ok){_showLoadError(d.error||'Error al leer la base de datos. Para proteger tus datos NO se guardará nada.');return;}
  }catch(e){
    console.error('❌ Excepción al leer estado:',e);
    _showLoadError('No se pudo leer la base de datos. Para proteger tus datos NO se guardará nada. Recargá en unos segundos.');
    return;
  }
  if(d&&d.state){
    const ok=_hydrate(d.state);
    if(!ok){console.error('❌ Hydrate falló — autosave BLOQUEADO');_showLoadError('Los datos se leyeron pero no se pudieron aplicar. Para proteger tu información NO se guardará nada. Recargá.');return;}
    _lastSaved=_serialize();
    _loadOK=true;
    _hideLoadError();
    console.log('✅ Estado cargado correctamente');
  }else{
    // Lectura VACÍA: puede ser un fallo transitorio, NO necesariamente una liga vacía real.
    // NUNCA sobrescribimos acá. El autosave queda bloqueado (_loadOK sigue false).
    _dbEmpty=true;
    console.warn('⚠️ Lectura VACÍA — NO se sobrescribe nada (protección de datos).');
    _showLoadError('La base respondió sin datos. Para proteger tu información NO se guardó nada. Si es momentáneo, recargá. Si es una liga NUEVA, entrá como admin y usá "Copia de seguridad → Inicializar liga".');
  }
}

// Guardado crítico para operaciones de alta importancia (playoffs, backups).
// Bloquea el autosave, espera cualquier save en curso, y reintenta hasta 3 veces.
// El 409 del servidor ahora incluye currentV: _doPersist sincroniza _stateV automáticamente,
// así el segundo intento ya tiene el _v correcto sin necesitar un fetch extra.
async function _criticalSave(){
  _prioritySave=true;
  _lastSaveError='';
  console.log('🔒 _criticalSave: iniciando. _token='+!!_token+', _saving='+_saving+', _stateV='+_stateV+', _loadOK='+_loadOK);
  try{
    // Esperar a que termine cualquier guardado en curso (máx 3 segundos)
    let waited=0;
    for(let i=0;i<30&&_saving;i++){await new Promise(r=>setTimeout(r,100));waited++;}
    if(waited)console.log('🔒 _criticalSave: esperó '+waited+'00ms por _saving');
    _loadOK=true;
    for(let attempt=0;attempt<3;attempt++){
      if(attempt>0) await new Promise(r=>setTimeout(r,400));
      console.log('🔒 _criticalSave: intento '+(attempt+1)+' con _stateV='+_stateV+', _token='+!!_token);
      const ok=await _doPersist();
      if(ok){console.log('✅ _criticalSave OK en intento '+(attempt+1));return true;}
      console.warn('⚠️ _criticalSave: intento '+(attempt+1)+' fallido: '+_lastSaveError);
      _loadOK=true;
    }
    console.error('❌ _criticalSave: los 3 intentos fallaron. Último error: '+_lastSaveError);
    return false;
  }finally{
    _prioritySave=false;
    setTimeout(()=>persist(true),600); // forzar un save de lo que haya quedado pendiente
  }
}
async function _doPersist(){
  if(!_token){_lastSaveError='Sin token de sesión (sesión expirada o cerrada)';console.error('❌ _doPersist: sin _token');return false;}
  const json=_serialize();
  try{
    const r=await fetch('/api/save',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},
      body:JSON.stringify({state:JSON.parse(json),ligaId:_ligaActual||undefined}),
      // NOTA: keepalive:true se quitó porque tiene un límite de 64KB en el body.
      // Con 65 jugadores + playoffs completos, el estado supera ese límite y el
      // navegador rechaza el fetch con "Failed to fetch" sin siquiera enviarlo.
      // El autosave cada 12s minimiza el riesgo de perder datos al cerrar la pestaña.
    });
    const d=await r.json().catch(()=>({}));
    if(r.ok){
      _stateV++;                   // el servidor acaba de incrementarla
      _lastSaved=_serialize();
      if(d.token)_token=d.token;   // sesión deslizante: el servidor la renovó
      _lastSaveError='';
      console.log('✅ Guardado OK ('+ new Date().toLocaleTimeString()+')');
      // Invalidar el cache del rating después de CADA guardado exitoso. Sin
      // esto, cuando el admin borra un partido (o el estado cambia por otra
      // acción), el conteo de partidos en el tab Rating quedaba desactualizado
      // hasta el próximo login. Ej: Víctor tenía 7 partidos de ciclos + 2 de
      // playoff = 9. Al borrar los 2 de playoff, el perfil se actualizaba a 7,
      // pero Rating seguía mostrando 9 porque calcularRatingGlobal solo se
      // ejecutaba una vez al login.
      // La llamada es fire-and-forget: no bloqueamos el retorno del save.
      // Si el usuario está viendo el tab Rating ahora mismo, disparamos también
      // renderRating() al terminar para que vea el cambio sin cambiar de tab.
      if(typeof RATING_ON !== 'undefined' && RATING_ON &&
         typeof calcularRatingGlobal === 'function'){
        calcularRatingGlobal(true).then(function(){
          if(typeof subView !== 'undefined' && subView === 'rating' &&
             typeof renderRating === 'function'){
            try { renderRating(); } catch(_){}
          }
        }).catch(function(){ /* si el rating falla, el save igual quedó ok */ });
      }
      return true;
    }else if(r.status===409){
      // Conflicto de versión. En vez de trabar los guardados para siempre
      // (el bug: _loadOK=false bloqueaba todo persist posterior), adoptamos la
      // versión del servidor y reintentamos UNA vez, conservando el cambio que el
      // usuario acaba de hacer. Con un solo admin esto resuelve el desajuste de
      // _stateV que aparecía tras el login sin pisar el resultado recién cargado.
      if(typeof d.currentV==='number'){
        _stateV=d.currentV;
        if(!_prioritySave && !_reintento409){
          _reintento409=true;
          console.warn('⚠️ 409: adopto versión '+d.currentV+' del servidor y reintento guardando el cambio local.');
          const ok=await _doPersist();      // reintenta con el _stateV corregido
          _reintento409=false;
          return ok;
        }
      }
      // Si el reintento tampoco anduvo, ahí sí avisamos (sin trabar para siempre).
      _showLoadError(d.error||t('err_conflict'));
      console.warn('⚠️ 409 persistente tras reintento.');
      return false;
    }else{
      _lastSaveError='HTTP '+r.status+': '+(d.error||'Error desconocido');
      if(r.status===413&&!_prioritySave){ _showLoadError(t('err_too_big')); }
      if(r.status===401&&!_prioritySave){_token=null;_showLoadError(t('err_session_expired_save'));}
      if(r.status===403&&!_prioritySave){_token=null;_showLoadError(d.error||t('err_no_access'));}
      // En modo _prioritySave (criticalSave), NO destruimos _token ni mostramos
      // el banner — dejamos que _criticalSave reintente y muestre su propio error.
      console.error('❌ Error al guardar:',r.status,d.error||'');
      return false;
    }
  }catch(e){_lastSaveError='Excepción de red: '+e.message;console.error('❌ Excepción al guardar:',e);return false;}
}

async function persist(force){
  if(!_token)return;
  if(!_loadOK){console.warn('⛔ persist bloqueado: el estado no se cargó correctamente. No se guarda para no pisar datos buenos.');return;}
  // Si hay un guardado crítico en curso (playoff, backup), este autosave espera.
  // El guardado crítico llama persist(true) cuando termina para no perder nada.
  if(_prioritySave){_pendingForce=true;return;}
  const json=_serialize();
  if(!force&&json===_lastSaved)return;
  if(_saving){
    _pendingForce=true;
    return;
  }
  _saving=true;
  _pendingForce=false;
  await _doPersist();
  _saving=false;
  if(_pendingForce){
    _pendingForce=false;
    await persist(true);
  }
}

if(typeof setInterval!=='undefined')setInterval(function(){persist(false);},12000);

if(typeof window!=='undefined'&&window.addEventListener){
  window.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden')persist(true);
  });
  window.addEventListener('pagehide',function(){persist(true);});
  window.addEventListener('beforeunload',function(){persist(true);});
}

// ========================================================================
// PANEL DE NOTIFICACIONES WHATSAPP (CallMeBot)
// Solo se llama si puedeGestionarAdmins(currentUser) es true.
// Todo el flujo pasa por /api/notify-channels; el envío real lo hace el
// helper del backend (_lib_whatsapp.js) usando CallMeBot como transporte.
// ========================================================================

// Estado local: cache del último fetch para poder editar sin refetch inmediato.
