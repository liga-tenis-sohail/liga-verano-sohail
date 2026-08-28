// ============================================================================
// public/login-auth-p2.js — passkeys, theme, doLogin y montaje post-login
// Extraído del index.html original (líneas del script: 1733..2350).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
function _conLiga2(url,ligaId){ return url+(url.includes('?')?'&':'?')+'liga='+encodeURIComponent(ligaId); }
function applyLeagueNameToDOM(){
  const _lt=document.getElementById('login-title');if(_lt&&LEAGUE_NAME)_lt.textContent=LEAGUE_NAME;
  const _ls=document.getElementById('login-sub');if(_ls&&LEAGUE_SUBTITLE)_ls.textContent=LEAGUE_SUBTITLE;
  if(LEAGUE_NAME)document.title=LEAGUE_NAME;
  // Cacheado para que la próxima pantalla de login ya muestre el nombre correcto
  try{localStorage.setItem('lsn',JSON.stringify({n:LEAGUE_NAME,s:LEAGUE_SUBTITLE}));}catch(e){}
}
// ==================== PASSKEYS (Face ID / Touch ID) ====================
// Login con clave sigue intacto: esto es una capa opcional encima.
// La librería del cliente expone el objeto global SimpleWebAuthnBrowser.

// ¿El dispositivo soporta passkeys? Si no, ni mostramos los botones.
function passkeySoportada(){
  return !!(window.SimpleWebAuthnBrowser && window.PublicKeyCredential);
}

// Mostrar el botón "Entrar con Face ID" si el dispositivo lo soporta.
function mostrarBotonPasskeyLogin(){
  try{
    const b=document.getElementById('login-btn-pk');
    if(b && passkeySoportada()) b.style.display='';
  }catch(_){}
}

// LOGIN con passkey: pide al dispositivo autenticarse y manda al servidor.
async function loginConPasskey(){
  const e=document.getElementById('login-err');
  const btn=document.getElementById('login-btn-pk');
  if(!passkeySoportada()){ if(e){e.textContent=t('pk_unsupported');e.style.display='block';} return; }
  if(btn) btn.disabled=true;
  try{
    // 1) Pedir el challenge al servidor
    const r1=await fetch('/api/passkey',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({accion:'auth-start'})});
    const opts=await r1.json();
    if(!r1.ok) throw new Error(opts.error||'No se pudo iniciar.');
    // 2) El dispositivo autentica (acá aparece el Face ID / Touch ID)
    const cred=await SimpleWebAuthnBrowser.startAuthentication({optionsJSON:opts});
    // 3) Mandar la respuesta firmada al servidor
    const ligaId=(typeof _ligaActual!=='undefined'&&_ligaActual)?_ligaActual:undefined;
    const r2=await fetch('/api/passkey',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({accion:'auth-finish',cred,ligaId})});
    const d=await r2.json();
    if(!r2.ok) throw new Error(d.error||'No se pudo entrar.');
    // 4) Entrar con el token, igual que el login con clave
    entrarConToken(d);
    // Si la contraseña sigue siendo pública, forzar el cambio. En este flujo no
    // tenemos la clave anterior (entramos con Face ID): pasamos null y el
    // servidor la acepta porque la clave guardada está en la lista pública.
    if(d && d.mustChangePw) forcePwChange(null);
  }catch(err){
    // Si el usuario cancela el Face ID, no es un error para mostrar feo.
    const msg=(err&&err.name==='NotAllowedError')?t('pk_cancelled'):(err.message||t('pk_login_err'));
    if(e){e.textContent=msg;e.style.display='block';}
  }finally{
    if(btn) btn.disabled=false;
  }
}

// ACTIVAR passkey (registro): se llama desde el perfil, ya logueado.
async function activarPasskey(){
  // Diagnóstico: este alert confirma que el botón SÍ dispara la función.
  // Si no ves ni este aviso, el problema es que la librería rompió el onclick.
  try{
    if(typeof window.SimpleWebAuthnBrowser==='undefined'){
      alert('La librería de Face ID no cargó. Puede estar bloqueada por la configuración de seguridad (CSP). Avisá al administrador.');
      return;
    }
    if(!window.PublicKeyCredential){
      alert('Este navegador o dispositivo no admite Face ID / passkeys.');
      return;
    }
    if(!_token){ toast(t('pk_need_login')); return; }
    // 1) Pedir opciones de registro (requiere token del login con clave)
    let r1, opts;
    try{
      r1=await fetch('/api/passkey',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},credentials:'same-origin',body:JSON.stringify({accion:'reg-start'})});
    }catch(netErr){ throw new Error('No se pudo contactar el servidor (paso 1). ¿Está subido /api/passkey?'); }
    const txt1=await r1.text();
    try{ opts=JSON.parse(txt1); }catch(_){ throw new Error('El servidor no respondió bien (paso 1). Código '+r1.status+'. ¿Falta el package.json o la librería en Vercel?'); }
    if(!r1.ok) throw new Error((opts&&opts.error)||('Error del servidor al iniciar (código '+r1.status+').'));
    // 2) El dispositivo crea la passkey (aparece el Face ID / Touch ID)
    let cred;
    try{
      cred=await SimpleWebAuthnBrowser.startRegistration({optionsJSON:opts});
    }catch(devErr){
      if(devErr&&devErr.name==='NotAllowedError'){ toast(t('pk_cancelled')); return; }
      if(devErr&&devErr.name==='InvalidStateError'){ toast('Este dispositivo ya tiene una passkey registrada para tu cuenta.'); return; }
      throw new Error('El dispositivo no pudo crear la passkey: '+(devErr&&devErr.message||devErr&&devErr.name||'desconocido'));
    }
    // 3) Un nombre para reconocer el dispositivo
    const deviceLabel=navigator.platform||navigator.userAgent.slice(0,40)||'Mi dispositivo';
    // 4) Guardar en el servidor
    let r2, d;
    try{
      r2=await fetch('/api/passkey',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},credentials:'same-origin',body:JSON.stringify({accion:'reg-finish',cred,deviceLabel})});
    }catch(netErr){ throw new Error('No se pudo contactar el servidor (paso 4).'); }
    const txt2=await r2.text();
    try{ d=JSON.parse(txt2); }catch(_){ throw new Error('El servidor no respondió bien al guardar (paso 4). Código '+r2.status+'. ¿Creaste la tabla passkeys en Supabase?'); }
    if(!r2.ok) throw new Error((d&&d.error)||('Error al guardar la passkey (código '+r2.status+').'));
    toast(t('pk_activated'));
    try{ localStorage.setItem('pk_hint','1'); }catch(_){}
    // Refrescá la vista del perfil si está abierta: pasamos de "activar" a mostrar el dispositivo nuevo.
    try{ if(typeof refrescarListaPasskeys==='function') refrescarListaPasskeys(); }catch(_){}
  }catch(err){
    const msg=(err&&err.name==='NotAllowedError')?t('pk_cancelled'):(err.message||t('pk_reg_err'));
    toast(msg);
  }
}

// Escapa texto para meterlo dentro de HTML atributo/contenido sin riesgo de XSS.
// deviceLabel viene del navegador (navigator.platform) — no es hostil, pero
// mejor no confiar en nada que se ponga en innerHTML.
function _pkEsc(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Trae del servidor las passkeys del usuario logueado y redibuja el pk-body:
// si hay 0 → muestra el mensaje inicial + botón "Activar".
// si hay 1+ → muestra el estado "Activado" + lista de dispositivos + botón "Activar en otro".
async function refrescarListaPasskeys(){
  const body = document.getElementById('pk-body');
  if(!body) return;                       // el perfil no está abierto
  if(!_token) return;                     // sin sesión no se puede pedir la lista
  try{
    const r = await fetch('/api/passkey', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},
      credentials:'same-origin',
      body: JSON.stringify({ accion:'list' })
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error || 'list failed');
    const lista = Array.isArray(d.passkeys) ? d.passkeys : [];
    if(lista.length === 0){
      // Estado sin passkeys: la vista original.
      body.innerHTML =
        `<p class="legend-txt" style="margin:.35rem 0 .75rem">${t('pk_section_hint')}</p>` +
        `<button class="btn btn-primary btn-sm" onclick="activarPasskey()"><i class="ti ti-face-id"></i> ${t('pk_activate_btn')}</button>`;
      return;
    }
    // Estado con passkeys: cabecera, lista de dispositivos con botón desactivar, y opción de agregar otro.
    const fmtFecha = iso => {
      if(!iso) return t('pk_never_used');
      try{ return new Date(iso).toLocaleDateString(); }catch(_){ return iso.slice(0,10); }
    };
    let html =
      `<div style="display:flex;align-items:center;gap:.5rem;margin:.15rem 0 .35rem;color:var(--success);font-weight:600;font-size:14px">` +
        `<i class="ti ti-shield-check"></i>${_pkEsc(t('pk_status_active'))}` +
      `</div>` +
      `<p class="legend-txt" style="margin:0 0 .75rem">${t('pk_status_active_hint')}</p>` +
      `<div class="section-lbl" style="font-size:12px;margin:.5rem 0 .35rem">${_pkEsc(t('pk_devices_lbl'))}</div>` +
      `<div style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:.75rem">`;
    for(const p of lista){
      const label = _pkEsc(p.deviceLabel);
      const reg   = fmtFecha(p.createdAt);
      const uso   = p.lastUsedAt ? fmtFecha(p.lastUsedAt) : t('pk_never_used');
      const escCid = _pkEsc(p.credentialId).replace(/'/g,"&#39;");
      const escLbl = label.replace(/'/g,"&#39;");
      html +=
        `<div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;padding:.5rem .65rem;border:1px solid var(--border,#e2e8f0);border-radius:8px">` +
          `<div style="min-width:0;flex:1">` +
            `<div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center">` +
              `<i class="ti ti-device-mobile" style="margin-right:.25rem;opacity:.7"></i>` +
              `<span style="overflow:hidden;text-overflow:ellipsis">${label}</span>` +
              `<button class="pk-device-edit-btn" title="Renombrar" onclick="renombrarPasskey('${escCid}', '${escLbl}')"><i class="ti ti-pencil"></i></button>` +
            `</div>` +
            `<div class="legend-txt" style="font-size:11px;margin-top:.15rem">${_pkEsc(t('pk_registered_at'))}: ${_pkEsc(reg)} · ${_pkEsc(t('pk_last_used'))}: ${_pkEsc(uso)}</div>` +
          `</div>` +
          `<button class="btn btn-sm" style="background:transparent;color:var(--danger);border:1px solid var(--danger);flex-shrink:0;white-space:nowrap" onclick="desactivarPasskey('${escCid}', '${escLbl}')"><i class="ti ti-trash"></i> ${_pkEsc(t('pk_device_deactivate'))}</button>` +
        `</div>`;
    }
    html += `</div>`;
    html += `<button class="btn btn-primary btn-sm" onclick="activarPasskey()"><i class="ti ti-plus"></i> ${_pkEsc(t('pk_added_more'))}</button>`;
    body.innerHTML = html;
  }catch(err){
    // Si falla la lista, no rompemos la app: dejamos el botón activar por si acaso.
    body.innerHTML =
      `<p class="legend-txt" style="margin:.35rem 0 .5rem;color:var(--danger)">${t('pk_list_err')}</p>` +
      `<p class="legend-txt" style="margin:0 0 .75rem">${t('pk_section_hint')}</p>` +
      `<button class="btn btn-primary btn-sm" onclick="activarPasskey()"><i class="ti ti-face-id"></i> ${t('pk_activate_btn')}</button>`;
  }
}

// Desactiva (borra en Supabase) una passkey del propio usuario y refresca la vista.
// El backend valida que la passkey pertenezca al usuario del token: no se puede
// desactivar la de otro pasando el credentialId a mano.
async function desactivarPasskey(credId, label){
  if(!credId) return;
  const msg = t('pk_device_deactivate_confirm').replace('{n}', label || 'este dispositivo');
  if(!(await confirmarModal(msg, {titulo:t('pk_device_deactivate'), okTxt:t('pk_device_deactivate'), peligro:true}))) return;
  try{
    const r = await fetch('/api/passkey', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},
      credentials:'same-origin',
      body: JSON.stringify({ accion:'delete', credentialId: credId })
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error || 'delete failed');
    toast(t('pk_device_deactivated').replace('{n}', label || t('pk_devices_lbl')));
    refrescarListaPasskeys();
  }catch(err){
    toast(t('pk_device_deactivate_err'));
  }
}

// ============================================================================
// SELECTOR DE APARIENCIA (Tema) — light / dark / system.
// Se guarda por dispositivo en localStorage ('theme'). El script del <head>
// lo lee y aplica ANTES del primer paint (evita flash).
// - 'system' (default): el navegador respeta prefers-color-scheme del OS.
// - 'light' o 'dark': override manual vía atributo data-theme en <html>.
// ============================================================================
function currentTheme(){
  // Default sin preferencia guardada = 'light' (antes era 'system').
  try { return localStorage.getItem('theme') || 'light'; } catch(_){ return 'light'; }
}

// Escuchar cambios del OS en vivo: si el usuario tiene modo 'system' seleccionado
// y cambia dark/light desde el OS mientras la app está abierta, aplicamos
// el cambio sin necesidad de recargar. Se dispara sólo si estamos en 'system'
// (los modos 'light'/'dark' explícitos no dependen del OS).
try {
  if(window.matchMedia){
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if(currentTheme() === 'system' && typeof aplicarTema === 'function'){
        aplicarTema('system');
      }
    });
  }
} catch(_){}

function aplicarTema(modo){
  try {
    // Guardar la preferencia. El script del <head> la aplica al cargar,
    // y acá abajo la aplicamos inmediatamente sin recargar la página —
    // así el usuario no pierde la sesión, el scroll, ni la subvista actual.
    localStorage.setItem('theme', modo);

    // Aplicar el data-theme al <html> en el momento:
    //   - 'system' → quitar el atributo para que respete prefers-color-scheme
    //   - 'light' / 'dark' → setear el atributo explícito
    if(modo === 'system'){
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', modo);
    }

    // La mayoría del contenido usa CSS variables (--surface, --text, --border...)
    // y se re-pinta solo. Pero algunos componentes tienen inline styles calculados
    // (rating con clubStyle, pk-body, admin panel con badges de club, WhatsApp
    // panel con APIKEY enmascarado) que quedaron con los colores del tema anterior.
    // Los volvemos a renderear disparando la vista actual.
    try {
      if(typeof subView === 'string' && typeof showSub === 'function'){
        showSub(subView);
      }
    } catch(_){ /* si algo falla acá, el tema ya cambió, solo puede quedar
                   algún componente con estilo viejo hasta la próxima navegación */ }

    if(typeof toast === 'function' && typeof t === 'function'){
      toast(t('theme_saved'));
    }
  } catch(e){ console.error('Theme error:', e); }
}

// HTML del card. Se inserta en ambos perfiles (admin y jugador) antes del pk-card.
function renderThemeCard(){
  const cur = currentTheme();
  const btn = (mode, label, icon) => {
    const active = (mode === cur);
    const bg = active ? 'var(--pri)' : 'var(--surface2)';
    const fg = active ? '#fff' : 'var(--text)';
    const bd = active ? 'var(--pri)' : 'var(--border)';
    return `<button class="theme-btn" data-mode="${mode}" onclick="aplicarTema('${mode}')" style="flex:1;padding:10px 12px;border:1.5px solid ${bd};border-radius:8px;background:${bg};color:${fg};font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px"><i class="ti ti-${icon}"></i>${label}</button>`;
  };
  return `<div class="card"><div class="section-lbl"><i class="ti ti-palette"></i> ${t('theme_section')}</div>` +
    `<p class="legend-txt" style="margin:.35rem 0 .75rem">${t('theme_hint')}</p>` +
    `<div style="display:flex;gap:8px;flex-wrap:wrap">` +
      btn('system', t('theme_system'), 'device-desktop') +
      btn('light', t('theme_light'), 'sun') +
      btn('dark', t('theme_dark'), 'moon') +
    `</div></div>`;
}


// ============================================================================
// PANEL ADMIN DE PASSKEYS — el admin ve quién tiene ingreso rápido activado
// y puede desactivar dispositivos de otros (útil si perdieron el iPhone).
// Usa los endpoints admin-stats + admin-list-user + admin-delete-user.
// ============================================================================
async function cargarPasskeysAdmin(){
  const metricsEl = document.getElementById('pk-admin-metrics');
  const listEl = document.getElementById('pk-admin-list');
  if(!metricsEl || !listEl) return;
  mostrarSkeleton(listEl, 4);
  try{
    // Traemos métricas y lista de todos los jugadores con passkey en paralelo.
    // Para la lista, recorremos users y pedimos por cada uno que tenga passkeys
    // (dos requests: stats primero, luego por jugador). Para no saturar Supabase
    // con 60 requests, hacemos SOLO stats acá y expandimos por jugador on-click.
    const rStats = await fetch('/api/passkey', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},
      body: JSON.stringify({ accion:'admin-stats', ligaId: _ligaActual || undefined })
    });
    const stats = await rStats.json().catch(()=>({}));
    if(!rStats.ok) throw new Error(stats.error || 'stats failed');

    // Métricas
    metricsEl.innerHTML =
      `<div class="metric-tile"><span class="metric-n">${stats.conPasskey||0}</span><span class="metric-lbl">${t('pk_admin_metric_users')}</span></div>` +
      `<div class="metric-tile"><span class="metric-n">${stats.totalPasskeys||0}</span><span class="metric-lbl">${t('pk_admin_metric_devices')}</span></div>` +
      `<div class="metric-tile"><span class="metric-n">${stats.pct||0}%</span><span class="metric-lbl">${t('pk_admin_metric_pct')}</span></div>`;

    // Para el listado detallado, necesitamos saber qué jugadores tienen passkeys.
    // El endpoint admin-stats devuelve totales pero no la lista. Hacemos una
    // pasada por USERS local (que ya está en memoria) y pedimos passkeys por
    // cada jugador. Para no explotar, solo pedimos jugadores activos (no inactive).
    // Peor caso: 60 fetches en paralelo, ~2 s.
    const users = USERS || {};
    const jugadoresActivos = Object.keys(users)
      .filter(n => (users[n].role || 'player') === 'player' && !users[n].inactive)
      .sort((a,b) => a.localeCompare(b, 'es'));
    if(!jugadoresActivos.length){ listEl.innerHTML = `<p class="legend-txt">${t('pk_admin_none')}</p>`; return; }

    const rs = await Promise.all(jugadoresActivos.map(nom =>
      fetch('/api/passkey', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},
        body: JSON.stringify({ accion:'admin-list-user', userName: nom, ligaId: _ligaActual || undefined })
      }).then(r => r.ok ? r.json() : { passkeys: [] }).catch(() => ({ passkeys: [] }))
    ));
    const jugadoresConPasskeys = [];
    rs.forEach((d, i) => {
      if(d.passkeys && d.passkeys.length) jugadoresConPasskeys.push({ nombre: jugadoresActivos[i], passkeys: d.passkeys });
    });
    if(!jugadoresConPasskeys.length){ listEl.innerHTML = `<p class="legend-txt">${t('pk_admin_none')}</p>`; return; }

    const fmtFecha = iso => { if(!iso) return t('pk_never_used'); try{ return new Date(iso).toLocaleDateString(); }catch(_){ return iso.slice(0,10); } };
    let html = '';
    jugadoresConPasskeys.forEach(j => {
      const nombreEsc = _pkEsc(j.nombre);
      html += `<details style="border:1px solid var(--border,#e2e8f0);border-radius:8px;margin-bottom:6px">` +
        `<summary style="cursor:pointer;padding:10px 12px;font-weight:600;font-size:13px;display:flex;justify-content:space-between;align-items:center">` +
          `<span><i class="ti ti-user" style="margin-right:.35rem;opacity:.7"></i>${nombreEsc}</span>` +
          `<span style="font-size:11px;color:var(--text2,#64748b);font-weight:500">${j.passkeys.length} disp.</span>` +
        `</summary>` +
        `<div style="padding:8px 12px 12px;display:flex;flex-direction:column;gap:6px">`;
      j.passkeys.forEach(p => {
        const label = _pkEsc(p.deviceLabel);
        const escCid = _pkEsc(p.credentialId).replace(/'/g,"&#39;");
        const escLbl = label.replace(/'/g,"&#39;");
        const escUser = nombreEsc.replace(/'/g,"&#39;");
        html +=
          `<div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;padding:.4rem .5rem;background:var(--surface2,#f8fafc);border-radius:6px">` +
            `<div style="min-width:0;flex:1">` +
              `<div style="font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><i class="ti ti-device-mobile" style="opacity:.6"></i> ${label}</div>` +
              `<div style="font-size:10.5px;color:var(--text2,#64748b);margin-top:2px">${t('pk_last_used')}: ${_pkEsc(p.lastUsedAt ? fmtFecha(p.lastUsedAt) : t('pk_never_used'))}</div>` +
            `</div>` +
            `<button class="btn btn-sm" style="background:transparent;color:var(--danger);border:1px solid var(--danger);flex-shrink:0;font-size:11px;padding:4px 8px" onclick="desactivarPasskeyAdmin('${escUser}','${escCid}','${escLbl}')"><i class="ti ti-trash"></i></button>` +
          `</div>`;
      });
      html += `</div></details>`;
    });
    listEl.innerHTML = html;
  }catch(err){
    metricsEl.innerHTML = '';
    listEl.innerHTML = `<p class="legend-txt" style="color:var(--danger)">${t('pk_list_err')}</p>`;
  }
}

// Admin desactiva un dispositivo de otro jugador.
async function desactivarPasskeyAdmin(userName, credId, label){
  if(!userName || !credId) return;
  const msg = t('pk_admin_del_confirm').replace('{d}', label || 'este dispositivo').replace('{n}', userName);
  if(!(await confirmarModal(msg, { titulo: t('pk_device_deactivate'), okTxt: t('pk_device_deactivate'), peligro: true }))) return;
  try{
    const r = await fetch('/api/passkey', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},
      body: JSON.stringify({ accion:'admin-delete-user', userName, credentialId: credId, ligaId: _ligaActual || undefined })
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error || 'admin delete failed');
    toast(t('pk_admin_del_ok'));
    cargarPasskeysAdmin();   // refrescar la lista
  }catch(err){
    toast(t('pk_admin_del_err'));
  }
}


// ============================================================================
// EXPORTAR LIGA A EXCEL — usa SheetJS (ya cargado globalmente como XLSX).
// Arma un workbook con 4 hojas: Jugadores, Clasificación, Partidos, Ciclos.
// ============================================================================
function exportarLigaExcel(){
  if(typeof XLSX === 'undefined'){ toast('Error: librería Excel no cargada.'); return; }
  toast(t('export_working'));
  try{
    const wb = XLSX.utils.book_new();

    // ---- Hoja 1: Jugadores (con estadísticas totales) ----
    const stats = {};
    Object.keys(USERS).forEach(n => {
      if(n === 'admin' || n === 'superadmin') return;
      stats[n] = { pj:0, pg:0, pp:0, gg:0, gp:0 };
    });
    matches.forEach(m => {
      if(m.status !== 'confirmed') return;
      const a = m.po ? m.poNames[0] : m.aName;
      const b = m.po ? m.poNames[1] : m.bName;
      if(!stats[a] || !stats[b]) return;
      let ga = 0, gb = 0;
      (m.sets || []).forEach(s => { ga += s[0]||0; gb += s[1]||0; });
      stats[a].pj++; stats[b].pj++;
      stats[a].gg += ga; stats[a].gp += gb;
      stats[b].gg += gb; stats[b].gp += ga;
      // Ganador: quien ganó más sets
      let wa = 0, wb = 0;
      (m.sets || []).forEach(s => { if((s[0]||0) > (s[1]||0)) wa++; else if((s[1]||0) > (s[0]||0)) wb++; });
      if(wa > wb){ stats[a].pg++; stats[b].pp++; }
      else if(wb > wa){ stats[b].pg++; stats[a].pp++; }
    });
    const jugadoresRows = [['Nombre','Grupo actual','Email','Teléfono','PJ','PG','PP','% Victorias','Games ganados','Games perdidos','Rating']];
    Object.keys(USERS).filter(n => n!=='admin' && n!=='superadmin').sort((a,b)=>a.localeCompare(b,'es')).forEach(n => {
      const u = USERS[n];
      const loc = findPlayer(n);
      const grupo = loc ? groupName(loc.g) : '';
      const s = stats[n] || { pj:0, pg:0, pp:0, gg:0, gp:0 };
      const pct = s.pj > 0 ? Math.round(100 * s.pg / s.pj) + '%' : '';
      let rating = '';
      try { if(window.ratingsUTR && typeof window.ratingsUTR === 'object' && window.ratingsUTR[n]){ rating = window.ratingsUTR[n].rating ? window.ratingsUTR[n].rating.toFixed(2) : ''; } } catch(_){}
      jugadoresRows.push([n, grupo, u.email||'', u.tel||'', s.pj, s.pg, s.pp, pct, s.gg, s.gp, rating]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jugadoresRows), t('export_sheet_jugadores'));

    // ---- Hoja 2: Clasificación general (usa computeGeneralStanding si existe) ----
    try {
      if(typeof computeGeneralStanding === 'function'){
        const gs = computeGeneralStanding();
        const genRows = [['Pos','Jugador','Puntos totales','Puntos último ciclo','Grupo actual']];
        gs.forEach((r, i) => {
          genRows.push([i+1, r.name, r.total, r.last, r.grupo || '']);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(genRows), t('export_sheet_general'));
      }
    } catch(_){}

    // ---- Hoja 3: Partidos ----
    const partRows = [['Ciclo','Grupo','Fase','Jugador A','Jugador B','Sets','Ganador','Estado','Club']];
    matches.forEach(m => {
      const a = m.po ? (m.poNames && m.poNames[0]) : m.aName;
      const b = m.po ? (m.poNames && m.poNames[1]) : m.bName;
      const fase = m.po ? (playoff.tramos && playoff.tramos[m.ti] ? 'PO ' + playoff.tramos[m.ti].label : 'PO') : ('Ciclo '+m.cycle);
      const sets = (m.sets || []).map(s => (s[0]||0)+'-'+(s[1]||0)).join(' · ');
      let ganador = '';
      let wa = 0, wb = 0;
      (m.sets || []).forEach(s => { if((s[0]||0) > (s[1]||0)) wa++; else if((s[1]||0) > (s[0]||0)) wb++; });
      if(wa > wb) ganador = a; else if(wb > wa) ganador = b;
      const estado = m.status || 'confirmed';
      const club = (CLUBS && m.clubId) ? (CLUBS.find(c => c.id === m.clubId)?.name || '') : '';
      partRows.push([m.cycle || '', m.g || '', fase, a, b, sets, ganador, estado, club]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(partRows), t('export_sheet_partidos'));

    // ---- Hoja 4: Ciclos (estado y jugadores por grupo) ----
    const cycRows = [['Ciclo','Estado','Grupo','Jugadores']];
    (cycles || []).forEach(c => {
      const st = c.status === 'active' ? 'Activo' : (c.status === 'finished' ? 'Finalizado' : 'Bloqueado');
      if(c.groups && c.groups.length){
        c.groups.forEach((g, gi) => {
          cycRows.push([c.n, st, gi+1, (g.players||[]).join(', ')]);
        });
      } else {
        cycRows.push([c.n, st, '', '']);
      }
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cycRows), t('export_sheet_ciclos'));

    // ---- Descargar ----
    const nombreLiga = (typeof LEAGUE_NAME === 'string' && LEAGUE_NAME) ? LEAGUE_NAME : 'liga';
    const fname = 'liga-' + nombreLiga.replace(/[^a-z0-9]+/gi,'_').toLowerCase() + '-' + new Date().toISOString().slice(0,10) + '.xlsx';
    XLSX.writeFile(wb, fname);
    toast(t('export_ok'));
  }catch(err){
    console.error('Export error:', err);
    toast(t('export_err'));
  }
}


// Renombrar una passkey del propio usuario. Pide un nombre nuevo en un modal
// (con input) y llama al endpoint. El backend valida que sea del usuario.
async function renombrarPasskey(credId, labelActual){
  if(!credId) return;
  const nuevo = await confirmarModal(
    t('pk_rename_prompt'),
    { titulo: t('pk_rename_title'), okTxt: t('rg_save')||'Guardar', inputPlaceholder: labelActual || 'Ej: iPhone del trabajo' }
  );
  if(nuevo === null || nuevo === false) return;   // canceló
  const nombre = String(nuevo || '').trim();
  if(!nombre){ toast(t('pk_rename_empty')); return; }
  if(nombre === labelActual) return;              // sin cambios
  try{
    const r = await fetch('/api/passkey', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},
      credentials:'same-origin',
      body: JSON.stringify({ accion:'rename', credentialId: credId, deviceLabel: nombre })
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error || 'rename failed');
    toast(t('pk_renamed'));
    refrescarListaPasskeys();
  }catch(err){
    toast(t('pk_rename_err'));
  }
}

async function doLogin(){
  const uv=(document.getElementById('login-user').value||'').trim();
  const pv=document.getElementById('login-pass').value;
  const e=document.getElementById('login-err');
  const btn=document.getElementById('login-btn');
  if(!uv||!pv){e.textContent=t('err_need_both');e.style.display='block';return;}
  if(btn){btn.disabled=true;btn.textContent=t('login_working');}
  try{
    // La contraseña se verifica en el servidor. Acá no hay ningún hash con qué compararla.
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:uv,pass:pv,ligaId:_ligaActual||undefined})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){e.textContent=d.error||'Usuario o contraseña incorrectos.';e.style.display='block';return;}
    _token=d.token;
    // El estado ya viene en la respuesta del login: no hace falta una segunda
    // llamada a /api/state, que releía los mismos 222 KB de la base.
    if(d.state){
      const ok=_hydrate(d.state);
      if(!ok){e.textContent=t('err_hydrate');e.style.display='block';_token=null;return;}
      _lastSaved=_serialize();
      _loadOK=true;
    }else{
      await loadState();
    }
    if(!_loadOK){e.textContent=t('err_no_data');e.style.display='block';_token=null;return;}
    const u=USERS[d.name];
    if(!u){e.textContent=t('err_no_user_league');e.style.display='block';_token=null;return;}
    if(u.inactive&&d.role==='player'){e.textContent=t('err_inactive');e.style.display='block';_token=null;return;}
    currentUser=u; currentUser.key=d.name;
    // Si no hay ninguna liga activa, solo admin/superadmin pueden entrar (para
    // reabrir o crear). Un jugador no tiene nada que hacer hasta que haya una liga.
    if(_sinLigasActivas && !esAdmin(currentUser)){
      e.textContent=t('err_no_active_league');e.style.display='block';_token=null;currentUser=null;
      if(btn){btn.disabled=false;btn.textContent=t('enter');}
      return;
    }
    // El servidor detectó una contraseña por defecto: se bloquea la app hasta cambiarla.
    if(d.mustChangePw) forcePwChange(pv);
  }catch(err){
    e.textContent=t('err_no_server');e.style.display='block';return;
  }finally{
    if(btn){btn.disabled=false;btn.textContent=t('enter')||'Entrar';}
  }
  montarAppTrasLogin();
}

// Monta la app tras un login exitoso (con clave o con passkey). currentUser,
// _token y el estado ya deben estar cargados antes de llamar a esto.
function montarAppTrasLogin(){
  const e=document.getElementById('login-err');
  if(e) e.style.display='none';
  _lastActivity=Date.now();
  applyLeagueNameToDOM();
  _lastActivity=Date.now();
  document.getElementById('login-screen').style.display='none';
  document.getElementById('main-app').style.display='block';
  if(_sinLigasActivas && esAdmin(currentUser)){ mostrarBannerSinLigas(); } else { const b=document.getElementById('nolig-banner'); if(b)b.style.display='none'; }
  document.getElementById('cur-name').textContent=currentUser.name;
  document.getElementById('cur-role').innerHTML=currentUser.role==='superadmin'?'<span class="role-badge" style="background:#8b5cf6">Super Admin</span>':esAdmin(currentUser)?'<span class="role-badge">'+t('role_admin')+'</span>':t('role_player');
  if(currentUser.role==='player'){const loc=findLoc(currentUser.name,activeN);if(loc)selGroup=loc.g;}
  // Redirigir al lugar correcto según el estado de la liga
  if(playoff.started||(playoff.preview&&esAdmin(currentUser))){
    viewCycle='po';renderShell();showPlayoffView();renderSubTabs();updateHdr();
    // renderSubTabs() re-crea el elemento #pend-n (con display:none y "0"),
    // pisando el resultado que había dejado el updateBadge() interno de
    // renderShell. Sin este updateBadge() extra, el admin entra en playoffs
    // y NO ve el badge de pendientes hasta que hace clic en algún tab.
    updateBadge();
  } else {
    viewCycle=activeN;renderShell();showSub('grupos');
    // Calcular el rating global (todas las ligas) en segundo plano. Cuando termina,
    // refresca la vista para que la columna y la ficha muestren los números.
    if(RATING_ON){ calcularRatingGlobal(true).then(()=>{ try{ if(subView==='grupos'||subView==='rating') showSub(subView); }catch(_){}}); }
  }
  document.getElementById('login-pass').value='';
  clearForm();
}

// Entrar con un token+state ya obtenidos (usado por el login con passkey).
// Replica los chequeos de doLogin sobre el resultado del servidor.
function entrarConToken(d){
  const e=document.getElementById('login-err');
  _token=d.token;
  if(d.state){
    const ok=_hydrate(d.state);
    if(!ok){ if(e){e.textContent=t('err_hydrate');e.style.display='block';} _token=null; return; }
    _lastSaved=_serialize();
    _loadOK=true;
  }
  if(!_loadOK){ if(e){e.textContent=t('err_no_data');e.style.display='block';} _token=null; return; }
  const u=USERS[d.name];
  if(!u){ if(e){e.textContent=t('err_no_user_league');e.style.display='block';} _token=null; return; }
  if(u.inactive&&d.role==='player'){ if(e){e.textContent=t('err_inactive');e.style.display='block';} _token=null; return; }
  currentUser=u; currentUser.key=d.name;
  if(_sinLigasActivas && !esAdmin(currentUser)){
    if(e){e.textContent=t('err_no_active_league');e.style.display='block';} _token=null; currentUser=null; return;
  }
  montarAppTrasLogin();
}
function doLogout(){closeM();clearForm();currentUser=null;_token=null;_loadOK=false;_lastActivity=0;_sessionExpiring=false;_hdrLigasCache=null;document.getElementById('main-app').style.display='none';document.getElementById('login-screen').style.display='block';document.getElementById('login-pass').value='';initLogin();}
