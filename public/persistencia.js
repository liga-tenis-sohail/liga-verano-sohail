// ============================================================================
// public/persistencia.js — load/save contra el backend, hydrate, backup y persist
// Extraído del index.html original (líneas del script: 6364..6754).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
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
  return JSON.stringify({_v:_stateV,cycles,matches,matchId,activeN,playoff,DESTINO,FECHAS,PO_FECHAS,ALLNAMES,users:Object.fromEntries(Object.entries(USERS).map(([n,u])=>{const v={...u};delete v.key;return [n,v];})),PUNTOS,AJUSTES_PUNTOS,LOG,LEAGUE_NAME,LEAGUE_SUBTITLE,LOGIN_TITLE,LEAGUE_COLOR_PRI,LEAGUE_COLOR_ACC,LEAGUE_COLOR_HL,CLUBS,COLOR_DISPUTA,RATING_ON,RATING_SEEDS,RATING_OVERRIDES,REGLAMENTO,LOGIN_HEADER,JOIN_REQUESTS});
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
  if(d.PUNTOS)PUNTOS=d.PUNTOS;
  // AJUSTES_PUNTOS: bonus/penalidades manuales del admin sobre el puntaje
  // final de un jugador puntual en un grupo puntual — independiente de su
  // posición (eso ya lo cubre PUNTOS/ptsForPos). Objeto anidado ciclo ->
  // grupo -> nombre -> número (puede ser negativo). Si no viene en el
  // estado (ligas viejas, guardadas antes de esta función), arranca vacío.
  AJUSTES_PUNTOS=(d.AJUSTES_PUNTOS && typeof d.AJUSTES_PUNTOS==='object')?d.AJUSTES_PUNTOS:{};
  if(Array.isArray(d.LOG))LOG=d.LOG;
  if(d.LEAGUE_NAME)LEAGUE_NAME=d.LEAGUE_NAME;
  REGLAMENTO=(typeof d.REGLAMENTO==='string')?d.REGLAMENTO:'';
  if(d.LEAGUE_SUBTITLE)LEAGUE_SUBTITLE=d.LEAGUE_SUBTITLE;
  // typeof==='string' (no truthy-check): un LOGIN_TITLE vacío es un valor
  // válido y querido (significa "usar LEAGUE_NAME por defecto"), a diferencia
  // de LEAGUE_SUBTITLE de arriba donde vacío se trata como "no vino nada".
  LOGIN_TITLE=(typeof d.LOGIN_TITLE==='string')?d.LOGIN_TITLE:'';
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
      colorDark: (typeof d.LOGIN_HEADER.colorDark === 'string') ? d.LOGIN_HEADER.colorDark : '',
      textColorDark: (typeof d.LOGIN_HEADER.textColorDark === 'string') ? d.LOGIN_HEADER.textColorDark : '',
      links: Array.isArray(d.LOGIN_HEADER.links) ? d.LOGIN_HEADER.links.filter(l => l && l.text && l.url).slice(0, 20) : []
    };
    // Refrescar el cache de localStorage con la versión autoritativa del server.
    // Así el próximo visitante ve la última config aunque no se haya logueado.
    try { localStorage.setItem('lh', JSON.stringify(LOGIN_HEADER)); } catch(_){}
  }
  // JOIN_REQUESTS: solicitudes de acceso de jugadores de OTRAS ligas. Se
  // sanitiza cada entrada por si viene de un formato viejo o corrupto.
  JOIN_REQUESTS = Array.isArray(d.JOIN_REQUESTS) ? d.JOIN_REQUESTS.filter(r=>r&&r.id&&r.nombre) : [];
  if(typeof d.RATING_ON==='boolean')RATING_ON=d.RATING_ON;
  RATING_SEEDS=(d.RATING_SEEDS&&typeof d.RATING_SEEDS==='object')?d.RATING_SEEDS:{};
  RATING_OVERRIDES=(d.RATING_OVERRIDES&&typeof d.RATING_OVERRIDES==='object')?d.RATING_OVERRIDES:{};
  // Aplicar colores guardados al cargar
  if(d.LEAGUE_COLOR_PRI||d.LEAGUE_COLOR_ACC||d.LEAGUE_COLOR_HL)applyLeagueColors(d.LEAGUE_COLOR_PRI||LEAGUE_COLOR_PRI,d.LEAGUE_COLOR_ACC||LEAGUE_COLOR_ACC,d.LEAGUE_COLOR_HL||LEAGUE_COLOR_HL);
  // Renderizar/reconstruir no dispara escrituras automáticas al cargar.
  try{if(playoff&&playoff.tramos&&playoff.tramos.length&&typeof rebuildAll==='function')rebuildAll();}catch(_){}
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
      if(_saveInFlight)await _saveInFlight;
      const before=_serialize();
      const rv=await fetch(_conLiga('/api/state'),{headers:{Authorization:'Bearer '+_token},cache:'no-store'});
      const rd=await rv.json();
      if(!rv.ok||!rd.state||!Number.isSafeInteger(rd.state._v))throw new Error(t('fix_restore_read'));
      obj._v=rd.state._v;
      if(!_hydrate(obj))throw new Error(t('fix_restore_format'));
      _loadOK=true;_dbEmpty=false;_saveConflict=false;
      const saved=await _criticalSave();
      if(!saved){_hydrate(JSON.parse(before));throw new Error(_lastSaveError||t('fix_save_failed'));}
      toast(t('fix_restore_ok'));setTimeout(()=>location.reload(),700);
    }catch(err){toast('Error al leer el backup: '+err.message);input.value='';}
  };
  if(isXlsx) reader.readAsArrayBuffer(file);
  else reader.readAsText(file);
}
function initEmptyLeague(){toast(t('fix_init_disabled'));}
function _showLoadError(msg){
  try{
    let b=document.getElementById('_loaderr');
    if(!b){b=document.createElement('div');b.id='_loaderr';b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#791F1F;color:#fff;padding:10px 16px;font-size:13px;line-height:1.4;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.35);font-family:system-ui,-apple-system,sans-serif';document.body.appendChild(b);}
    b.replaceChildren(document.createTextNode('⚠️ '+msg+' '));
    const btn=document.createElement('button');btn.type='button';btn.textContent=t('fix_reload');
    btn.onclick=()=>{if(_loadOK&&_serialize()!==_lastSaved&&!confirm(t('fix_reload_confirm')))return;location.reload();};b.appendChild(btn);b.setAttribute('role','alert');

  }catch(e){}
}
function _hideLoadError(){var b=document.getElementById('_loaderr');if(b)b.remove();}

async function loadState(){
  // Una visita guiada nunca guarda su contexto temporal.
  if(typeof isTutorialRunning==='function'&&isTutorialRunning())return false;
  if(!_token){console.warn('⚠️ loadState sin sesión');return;}
  console.log('🔄 Cargando estado desde el servidor...');
  let d;const requestLiga=_ligaActual,requestSession=_saveSessionKey(),localBefore=_serialize();
  try{
    const r=await fetch(_conLiga('/api/state'),{headers:{Authorization:'Bearer '+_token},cache:'no-store'});
    if(requestLiga!==_ligaActual||requestSession!==_saveSessionKey())return;
    if(r.status===401){_token=null;_loadOK=false;_showLoadError(t('err_session_expired'));return;}
    d=await r.json().catch(()=>({}));
    if(requestLiga!==_ligaActual||requestSession!==_saveSessionKey()||(_loadOK&&localBefore!==_serialize()))return;
    if(r.status===403){_token=null;_showLoadError(d.error||t('err_no_access'));return;}
    if(d.token)_token=d.token;   // sesión deslizante
    if(!r.ok){_loadOK=false;_showLoadError(d.error||'Error al leer la base de datos. Para proteger tus datos NO se guardará nada.');return;}
  }catch(e){
    console.error('❌ Excepción al leer estado:',e);
    if(requestLiga!==_ligaActual||requestSession!==_saveSessionKey())return;
    _loadOK=false;_showLoadError('No se pudo leer la base de datos. Para proteger tus datos NO se guardará nada. Recarga en unos segundos.');
    return;
  }
  if(typeof isTutorialRunning==='function'&&isTutorialRunning())return;
  if(d&&d.state){
    const ok=_hydrate(d.state);
    if(!ok){console.error('❌ Hydrate falló — autosave BLOQUEADO');_showLoadError('Los datos se leyeron pero no se pudieron aplicar. Para proteger tu información NO se guardará nada. Recarga.');return;}
    _lastSaved=_serialize();
    _saveConflict=false;
    _loadOK=true;
    _hideLoadError();
    console.log('✅ Estado cargado correctamente');
    return true;
  }else{
    // Lectura VACÍA: puede ser un fallo transitorio, NO necesariamente una liga vacía real.
    // NUNCA sobrescribimos acá. El autosave queda bloqueado (_loadOK sigue false).
    _dbEmpty=true;_loadOK=false;
    console.warn('⚠️ Lectura VACÍA — NO se sobrescribe nada (protección de datos).');
    _showLoadError('La base respondió sin datos. Para proteger tu información NO se guardó nada. Si es momentáneo, recarga. Si es una liga NUEVA, entra como admin y usa "Copia de seguridad → Inicializar liga".');
  }
}

// Guardado crítico para operaciones de alta importancia (playoffs, backups).
// Espera el envío actual y requiere confirmación; nunca reintenta un 409 con datos antiguos.
// Se conserva una copia pendiente y se detiene el autosave ante un conflicto.
let _saveInFlight=null,_saveConflict=false;
function _saveSessionKey(){
  try{const p=JSON.parse(atob((_token||'').split('.')[0].replace(/-/g,'+').replace(/_/g,'/')));return [p.u,p.pk,p.sv].join(':');}catch(_){return _token;}
}
function exportPendingChanges(){
  const blob=new Blob([JSON.stringify({kind:'SOHAIL_PENDING_REVIEW',ligaId:_ligaActual,savedBase:_lastSaved?JSON.parse(_lastSaved):null,pending:JSON.parse(_serialize())},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sohail-cambios-pendientes.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function _conflictNotice(){
  _showLoadError(t('fix_conflict'));
  const bar=document.getElementById('_loaderr');if(!bar)return;
  const b=document.createElement('button');b.type='button';b.textContent=t('fix_export_pending');b.onclick=exportPendingChanges;bar.appendChild(b);
}
async function _criticalSave(){
  // Una visita guiada nunca guarda su contexto temporal.
  if(typeof isTutorialRunning==='function'&&isTutorialRunning())return false;
  if(!_loadOK||_saveConflict||!_token||_ligaReadOnly)return false;
  _prioritySave=true;
  try{if(_saveInFlight)await _saveInFlight;return await _doPersist();}
  finally{_prioritySave=false;}
}
async function _doPersist(){
  // Una visita guiada nunca guarda su contexto temporal.
  if(typeof isTutorialRunning==='function'&&isTutorialRunning())return false;
  if(_saveInFlight)return _saveInFlight;
  if(!_token||!_loadOK||_saveConflict||_ligaReadOnly||document.getElementById('_pwforce'))return false;
  const json=_serialize(),sent=JSON.parse(json),liga=_ligaActual,user=currentUser&&currentUser.name,sessionKey=_saveSessionKey();
  _saveInFlight=(async()=>{
    try{
      const r=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({state:sent,ligaId:liga||undefined}),signal:AbortSignal.timeout(30000)});
      const d=await r.json().catch(()=>({}));
      if(liga!==_ligaActual||user!==(currentUser&&currentUser.name)||sessionKey!==_saveSessionKey())return false;
      if(r.ok){
        _stateV=Number.isSafeInteger(d.version)?d.version:sent._v+1;
        // SOLO esta instantánea fue confirmada. Los cambios posteriores siguen sucios.
        sent._v=_stateV;_lastSaved=JSON.stringify(sent);
        if(d.token)_token=d.token;_lastSaveError='';_hideLoadError();
        if(typeof RATING_ON!=='undefined'&&RATING_ON&&typeof calcularRatingGlobal==='function')calcularRatingGlobal(true).catch(()=>{});
        return true;
      }
      _lastSaveError=(typeof apiError==='function'?apiError(d):d.error)||t('fix_save_failed');
      if(r.status===409){_saveConflict=true;_conflictNotice();return false;}
      if(r.status===401){_token=null;_showLoadError(t('err_session_expired_save'));return false;}
      _showLoadError(_lastSaveError);return false;
    }catch(e){_lastSaveError=t('fix_network_pending');_showLoadError(_lastSaveError);return false;}
  })();
  try{return await _saveInFlight;}finally{_saveInFlight=null;}
}
async function persist(force){
  // Una visita guiada nunca guarda su contexto temporal.
  if(typeof isTutorialRunning==='function'&&isTutorialRunning())return false;
  if(!_token||!_loadOK||_ligaReadOnly||_saveConflict||document.getElementById('_pwforce'))return false;
  if(_prioritySave)return false;
  if(_saving){_pendingForce=true;return false;}
  if(!force&&_serialize()===_lastSaved)return true;
  _saving=true;_pendingForce=false;
  let ok=false;
  try{ok=await _doPersist();}finally{_saving=false;}
  if(ok&&(_pendingForce||_serialize()!==_lastSaved)){_pendingForce=false;return await persist(false);}
  return ok;
}
if(typeof setInterval!=='undefined')setInterval(()=>persist(false),12000);
if(typeof window!=='undefined'&&window.addEventListener){
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persist(false);});
  window.addEventListener('beforeunload',event=>{if(_token&&_loadOK&&!_ligaReadOnly&&(typeof isTutorialRunning==='function'&&isTutorialRunning()?tutorialHasUnsavedState():_serialize()!==_lastSaved)){event.preventDefault();event.returnValue='';}});
}

// ========================================================================
// PANEL DE NOTIFICACIONES WHATSAPP (CallMeBot)
// Solo se llama si puedeGestionarAdmins(currentUser) es true.
// Todo el flujo pasa por /api/notify-channels; el envío real lo hace el
// helper del backend (_lib_whatsapp.js) usando CallMeBot como transporte.
// ========================================================================

// Estado local: cache del último fetch para poder editar sin refetch inmediato.
