// ============================================================================
// public/headers-ui.js — panel de canales WhatsApp y header editable del login
// Extraído del index.html original (líneas del script: 6755..7109).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
let _waChannels = [];

// Fetch de la lista de canales y render en el contenedor #wa-channels-list.
async function cargarCanalesWhatsApp(){
  const cont = document.getElementById('wa-channels-list');
  if(!cont) return;
  cont.innerHTML = '<div class="pm-past-load">'+t('past_loading')+'</div>';
  try {
    const r = await fetch('/api/notify-channels', {
      headers: {'Authorization':'Bearer '+_token}
    });
    if(!r.ok){
      cont.innerHTML = '<div class="alert alert-err" style="margin:0">'+t('wa_err_load')+'</div>';
      return;
    }
    const d = await r.json();
    _waChannels = Array.isArray(d.channels) ? d.channels : [];
    if(d.token) _token = d.token;
    renderCanalesWhatsApp();
  } catch(e){
    cont.innerHTML = '<div class="alert alert-err" style="margin:0">'+t('wa_err_load')+'</div>';
  }
}

// Render de la lista actual (usa _waChannels, no re-fetchea).
function renderCanalesWhatsApp(){
  const cont = document.getElementById('wa-channels-list');
  if(!cont) return;
  if(!_waChannels.length){
    cont.innerHTML = '<div class="legend-txt" style="margin:0">'+t('wa_none')+'</div>';
    return;
  }
  // Tabla compacta con acciones inline. En móvil: scroll horizontal si no entra.
  let html = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.85rem">';
  html += '<thead><tr style="border-bottom:1px solid var(--border2);text-align:left">';
  html += '<th style="padding:.4rem .3rem">'+t('wa_col_name')+'</th>';
  html += '<th style="padding:.4rem .3rem">'+t('wa_col_phone')+'</th>';
  html += '<th style="padding:.4rem .3rem">'+t('wa_col_apikey')+'</th>';
  html += '<th style="padding:.4rem .3rem;text-align:center">'+t('wa_col_active')+'</th>';
  html += '<th style="padding:.4rem .3rem">'+t('wa_col_last')+'</th>';
  html += '<th style="padding:.4rem .3rem;text-align:right">'+t('wa_col_actions')+'</th>';
  html += '</tr></thead><tbody>';
  for(const c of _waChannels){
    const nombreEsc = String(c.admin_name||'').replace(/[<>&"]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[ch]));
    const phoneEsc  = String(c.phone_number||'').replace(/[^\d]/g,'');
    // El APIKEY nunca se muestra completo por seguridad: solo los últimos 3 dígitos.
    // Si no tiene APIKEY propio, indica que usa el fallback del sistema.
    let apikeyTxt;
    if(c.apikey && String(c.apikey).length){
      const k = String(c.apikey);
      apikeyTxt = '••••'+k.slice(-3);
    } else {
      apikeyTxt = '<span class="legend-txt" style="font-size:.75rem">'+t('wa_using_fallback')+'</span>';
    }
    const activeChk = c.active ? 'checked' : '';
    const lastTxt = c.last_notified_at
      ? new Date(c.last_notified_at).toLocaleString()
      : '<span class="legend-txt">'+t('wa_never')+'</span>';
    html += '<tr style="border-bottom:1px solid var(--border2)">';
    html += '<td style="padding:.5rem .3rem"><strong>'+nombreEsc+'</strong></td>';
    html += '<td style="padding:.5rem .3rem;font-family:monospace">+'+phoneEsc+'</td>';
    html += '<td style="padding:.5rem .3rem;font-family:monospace">'+apikeyTxt+'</td>';
    html += '<td style="padding:.5rem .3rem;text-align:center"><label style="display:inline-flex;align-items:center;cursor:pointer"><input type="checkbox" '+activeChk+' onchange="toggleCanalWA('+c.id+', this.checked)" style="cursor:pointer"></label></td>';
    html += '<td style="padding:.5rem .3rem;font-size:.8rem">'+lastTxt+'</td>';
    html += '<td style="padding:.5rem .3rem;text-align:right;white-space:nowrap">';
    html += '<button class="btn btn-sm" onclick="probarCanalWA('+c.id+')" title="'+t('wa_test_btn')+'">🧪</button> ';
    html += '<button class="btn btn-sm" onclick="abrirModalCanalWA('+c.id+')" title="'+t('wa_edit_btn')+'"><i class="ti ti-edit"></i></button> ';
    html += '<button class="btn btn-sm btn-danger" onclick="borrarCanalWA('+c.id+')" title="'+t('wa_delete_btn')+'"><i class="ti ti-trash"></i></button>';
    html += '</td></tr>';
  }
  html += '</tbody></table></div>';
  cont.innerHTML = html;
}

// Abre el modal de agregar (sin id) o editar (con id existente). Reutiliza
// el modal genérico #modal-bg que ya está en el DOM.
function abrirModalCanalWA(idOpc){
  const editing = typeof idOpc === 'number' && idOpc > 0;
  const c = editing ? _waChannels.find(x => x.id === idOpc) : null;
  if(editing && !c){ toast(t('wa_err_load')); return; }

  document.getElementById('modal-title').textContent = editing ? t('wa_modal_edit_title') : t('wa_modal_add_title');

  // Campos del formulario. El teléfono se puede editar solo en "agregar"
  // (cambiar el teléfono requiere APIKEY nuevo → mejor borrar y agregar de nuevo).
  const phoneDisabled = editing ? 'readonly style="opacity:.6;cursor:not-allowed"' : '';
  const phonePrefill  = editing ? String(c.phone_number||'') : '';
  const namePrefill   = editing ? String(c.admin_name||'').replace(/"/g,'&quot;') : '';
  const apikeyPrefill = editing && c.apikey ? String(c.apikey) : '';

  let body = '';
  body += '<label class="lbl">'+t('wa_field_name_lbl')+'</label>';
  body += '<input id="wa-fld-name" class="inp" type="text" maxlength="60" placeholder="'+t('wa_field_name_ph')+'" value="'+namePrefill+'">';
  body += '<label class="lbl" style="margin-top:.6rem">'+t('wa_field_phone_lbl')+'</label>';
  body += '<input id="wa-fld-phone" class="inp" type="text" maxlength="20" placeholder="'+t('wa_field_phone_ph')+'" value="'+phonePrefill+'" '+phoneDisabled+'>';
  body += '<p class="legend-txt" style="margin:.2rem 0 .6rem;font-size:.75rem">'+t('wa_field_phone_hint')+'</p>';
  body += '<label class="lbl">'+t('wa_field_apikey_lbl')+'</label>';
  body += '<input id="wa-fld-apikey" class="inp" type="text" maxlength="40" placeholder="'+t('wa_field_apikey_ph')+'" value="'+apikeyPrefill+'">';
  body += '<p class="legend-txt" style="margin:.2rem 0 0;font-size:.75rem">'+t('wa_field_apikey_hint')+'</p>';
  document.getElementById('modal-body').innerHTML = body;

  const idParam = editing ? idOpc : 'null';
  document.getElementById('modal-actions').innerHTML =
    '<button class="btn" onclick="closeM()">'+t('wa_cancel_btn')+'</button>'+
    '<button class="btn btn-primary" onclick="guardarCanalWA('+idParam+')">'+t('wa_save_btn')+'</button>';

  document.getElementById('modal-bg').classList.add('open');
}

// Guarda: POST si es nuevo, PATCH si es edición.
async function guardarCanalWA(idOpc){
  const name   = (document.getElementById('wa-fld-name').value||'').trim();
  const phone  = (document.getElementById('wa-fld-phone').value||'').replace(/[^\d]/g,'');
  const apikey = (document.getElementById('wa-fld-apikey').value||'').trim();

  if(!name){ toast(t('wa_bad_name')); return; }
  const editing = typeof idOpc === 'number' && idOpc > 0;
  // Al agregar exigimos teléfono válido; al editar el teléfono está readonly.
  if(!editing && (phone.length < 7 || phone.length > 15)){ toast(t('wa_bad_phone')); return; }

  try {
    let r;
    if(editing){
      r = await fetch('/api/notify-channels', {
        method: 'PATCH',
        headers: {'Content-Type':'application/json','Authorization':'Bearer '+_token},
        body: JSON.stringify({ id: idOpc, admin_name: name, apikey: apikey || null })
      });
    } else {
      r = await fetch('/api/notify-channels', {
        method: 'POST',
        headers: {'Content-Type':'application/json','Authorization':'Bearer '+_token},
        body: JSON.stringify({ phone_number: phone, admin_name: name, apikey: apikey || null })
      });
    }
    const d = await r.json().catch(()=>({}));
    if(!r.ok){
      toast((d && d.error) || t('wa_err_save'));
      return;
    }
    if(d.token) _token = d.token;
    closeM();
    toast(t('wa_saved'));
    await cargarCanalesWhatsApp();
  } catch(e){
    toast(t('wa_err_save'));
  }
}

// Toggle active/inactive: PATCH inmediato, sin modal.
async function toggleCanalWA(id, active){
  try {
    const r = await fetch('/api/notify-channels', {
      method: 'PATCH',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+_token},
      body: JSON.stringify({ id, active: !!active })
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok){
      toast((d && d.error) || t('wa_err_save'));
      // Revertimos visualmente refrescando la lista.
      await cargarCanalesWhatsApp();
      return;
    }
    if(d.token) _token = d.token;
    // Actualizamos el cache local sin refetch para respuesta instantánea.
    const c = _waChannels.find(x => x.id === id);
    if(c) c.active = !!active;
    toast(t('wa_toggle_ok'));
  } catch(e){
    toast(t('wa_err_save'));
    await cargarCanalesWhatsApp();
  }
}

// Borrar con confirmación.
async function borrarCanalWA(id){
  const c = _waChannels.find(x => x.id === id);
  if(!c) return;
  if(!confirm(t('wa_delete_confirm').replace('{n}', c.admin_name || ''))) return;
  try {
    const r = await fetch('/api/notify-channels', {
      method: 'DELETE',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+_token},
      body: JSON.stringify({ id })
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok){
      toast((d && d.error) || t('wa_err_delete'));
      return;
    }
    if(d.token) _token = d.token;
    toast(t('wa_deleted'));
    await cargarCanalesWhatsApp();
  } catch(e){
    toast(t('wa_err_delete'));
  }
}

// Test manual: dispara un mensaje al canal para que el admin lo verifique en su
// WhatsApp. Usa el endpoint POST /api/notify-channels con action=test (agregado
// abajo en el backend) — si no está soportado, el usuario ve el error real de la API.
async function probarCanalWA(id){
  const c = _waChannels.find(x => x.id === id);
  if(!c) return;
  toast(t('wa_test_sending'));
  try {
    const r = await fetch('/api/notify-channels', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+_token},
      body: JSON.stringify({ action: 'test', id })
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok || d.error){
      toast(t('wa_test_err') + (d && d.error ? ': ' + d.error : ''));
      return;
    }
    if(d.token) _token = d.token;
    toast(t('wa_test_ok'));
  } catch(e){
    toast(t('wa_test_err'));
  }
}

// ========================================================================
// PANEL: HEADER DEL LOGIN (color + links editables)
// Config vive en LOGIN_HEADER = { color, links: [{text, url}] }.
// El admin edita desde el panel Admin; el estado se guarda vía persist().
// Renderiza en vivo la barra del login (para que el admin vea el cambio
// aunque no haya cerrado sesión).
// ========================================================================
function renderLoginHeaderLinks(){
  const cont = document.getElementById('lh-links-list');
  if(!cont) return;
  const links = (LOGIN_HEADER && Array.isArray(LOGIN_HEADER.links)) ? LOGIN_HEADER.links : [];
  if(!links.length){
    cont.innerHTML = '<div class="legend-txt" style="margin:.5rem 0">'+t('lh_no_links')+'</div>';
    renderLoginHeaderPreview();
    return;
  }
  let html = '';
  links.forEach((l, i) => {
    const text = String(l.text || '').replace(/"/g, '&quot;');
    const url = String(l.url || '').replace(/"/g, '&quot;');
    html += '<div style="display:grid;grid-template-columns:1fr 2fr auto;gap:.5rem;align-items:end;margin-bottom:.5rem;padding:.5rem;border:1px solid var(--border2);border-radius:8px;background:var(--surface)">';
    html +=   '<div class="form-group" style="margin:0"><label style="font-size:11px">'+t('lh_link_text')+'</label><input type="text" value="'+text+'" onchange="updateLoginHeaderLink('+i+',\'text\',this.value)" placeholder="Ej: Club" maxlength="30"></div>';
    html +=   '<div class="form-group" style="margin:0"><label style="font-size:11px">'+t('lh_link_url')+'</label><input type="url" value="'+url+'" onchange="updateLoginHeaderLink('+i+',\'url\',this.value)" placeholder="https://..." maxlength="500"></div>';
    html +=   '<button class="btn btn-sm btn-danger" onclick="removeLoginHeaderLink('+i+')" title="'+t('lh_link_delete')+'" style="margin-bottom:.15rem"><i class="ti ti-trash"></i></button>';
    html += '</div>';
  });
  cont.innerHTML = html;
  renderLoginHeaderPreview();
}

// Preview miniatura del header, dentro del panel Admin. Ayuda a ver cómo va a
// quedar sin salir/entrar del login. Idéntico look al header real (renderLoginHeader),
// pero encapsulado en el elemento #lh-preview.
// Muestra DOS previews: light y dark, así el admin ve al toque cómo va a
// quedar en cada tema sin salir de la app ni cambiar su preferencia.
function renderLoginHeaderPreview(){
  const el = document.getElementById('lh-preview');
  if(!el) return;
  const cfg = LOGIN_HEADER || { color:'#0E3470', textColor:'', colorDark:'', textColorDark:'', links:[] };
  const links = Array.isArray(cfg.links) ? cfg.links.filter(l => l && l.text && l.url) : [];

  // Colores efectivos por tema (con fallback: dark cae a light si no hay override).
  const bgLight = cfg.color || '#0E3470';
  const fgLight = (cfg.textColor && String(cfg.textColor).trim())
    ? cfg.textColor
    : ((typeof autoTxt === 'function') ? autoTxt(bgLight) : '#fff');
  const bgDark = cfg.colorDark || bgLight;
  const fgDark = (cfg.textColorDark && String(cfg.textColorDark).trim())
    ? cfg.textColorDark
    : ((typeof autoTxt === 'function') ? autoTxt(bgDark) : '#fff');

  function pintarPreview(bg, fg, labelTxt){
    let inner = '';
    if(!links.length){
      inner = '<div style="padding:.5rem;background:'+bg+';color:'+fg+';font-size:11px;text-align:center;opacity:.7">(sin enlaces — la barra no se muestra)</div>';
    } else {
      inner = '<div style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:.4rem;padding:.5rem;background:'+bg+';color:'+fg+'">'
            + links.map(l => {
                const txt = String(l.text).replace(/[<>&]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[ch]));
                return '<span style="font-weight:600;font-size:12px;padding:.25rem .55rem;border:1px solid '+fg+';border-radius:999px">'+txt+'</span>';
              }).join('')
            + '</div>';
    }
    return '<div style="border-radius:6px;overflow:hidden;margin-bottom:.35rem"><div style="font-size:10px;color:var(--text2);margin-bottom:.15rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em">'+labelTxt+'</div>'+inner+'</div>';
  }

  el.style.cssText = '';
  el.innerHTML = pintarPreview(bgLight, fgLight, 'Light mode')
               + pintarPreview(bgDark, fgDark, 'Dark mode');
}

// Vuelve al color de texto automático (basado en el fondo). Vacía el campo
// custom y re-guarda: si textColor='', renderLoginHeader usa autoTxt().
function resetLoginHeaderTextColor(){
  if(!LOGIN_HEADER) LOGIN_HEADER = { color:'#0E3470', textColor:'', colorDark:'', textColorDark:'', links:[] };
  LOGIN_HEADER.textColor = '';
  try { localStorage.setItem('lh', JSON.stringify(LOGIN_HEADER)); } catch(_){}
  renderLoginHeaderPreview();
  try { renderLoginHeader(); } catch(_){}
  if(typeof persist === 'function') persist(true);
  toast(t('lh_saved'));
  // Re-renderear los inputs para que el color picker se resetee visualmente
  if(typeof renderLoginHeaderLinks === 'function') renderLoginHeaderLinks();
  // Y actualizar el input del color de texto para reflejar el reset (aunque
  // internamente está vacío, el picker HTML muestra algo — le ponemos el auto).
  const ti = document.getElementById('lh-textcolor');
  if(ti && typeof autoTxt === 'function') ti.value = autoTxt(LOGIN_HEADER.color || '#0E3470');
}

// Reset del textColor para dark mode. Espejo de la función anterior pero
// sobre los campos dark. Deja que autoTxt() calcule el mejor contraste sobre
// el color de fondo dark.
function resetLoginHeaderTextColorDark(){
  if(!LOGIN_HEADER) LOGIN_HEADER = { color:'#0E3470', textColor:'', colorDark:'', textColorDark:'', links:[] };
  LOGIN_HEADER.textColorDark = '';
  try { localStorage.setItem('lh', JSON.stringify(LOGIN_HEADER)); } catch(_){}
  renderLoginHeaderPreview();
  try { renderLoginHeader(); } catch(_){}
  if(typeof persist === 'function') persist(true);
  toast(t('lh_saved'));
  if(typeof renderLoginHeaderLinks === 'function') renderLoginHeaderLinks();
  const ti = document.getElementById('lh-textcolor-dark');
  if(ti && typeof autoTxt === 'function'){
    const bgDark = LOGIN_HEADER.colorDark || LOGIN_HEADER.color || '#0E3470';
    ti.value = autoTxt(bgDark);
  }
}

function addLoginHeaderLink(){
  if(!LOGIN_HEADER) LOGIN_HEADER = { color:'#0E3470', links:[] };
  if(!Array.isArray(LOGIN_HEADER.links)) LOGIN_HEADER.links = [];
  LOGIN_HEADER.links.push({ text: '', url: '' });
  renderLoginHeaderLinks();
  // No persistimos aún: hasta que el usuario complete texto Y url, el link no
  // se guarda ni aparece en la barra. persist() dispara con updateLoginHeaderLink.
}

function updateLoginHeaderLink(i, field, value){
  if(!LOGIN_HEADER || !Array.isArray(LOGIN_HEADER.links)) return;
  const link = LOGIN_HEADER.links[i];
  if(!link) return;
  const v = String(value || '').trim();
  // Validación suave por campo. No bloqueamos escribir mal, pero avisamos al
  // guardar si la URL está mal formada.
  if(field === 'url' && v && !/^https?:\/\//i.test(v)){
    toast(t('lh_url_bad'));
    return;
  }
  if(field === 'text' && v.length > 30) return;
  link[field] = v;
  // Solo llamamos a persist si el link quedó completo (text Y url válidos).
  // Un link a medio llenar no rompe nada, se filtra en el render.
  saveLoginHeader();
}

function removeLoginHeaderLink(i){
  if(!LOGIN_HEADER || !Array.isArray(LOGIN_HEADER.links)) return;
  const link = LOGIN_HEADER.links[i];
  if(!link) return;
  const nombre = link.text || t('lh_link_delete');
  if(!confirm(t('lh_del_confirm').replace('{n}', nombre))) return;
  LOGIN_HEADER.links.splice(i, 1);
  renderLoginHeaderLinks();
  saveLoginHeader();
}

// Guarda el estado (persist) y también dispara re-render del header en vivo
// dentro del login (por si el admin también tiene el login abierto en otra
// pestaña, aunque no común). El preview del panel se refresca en cada acción
// del admin, no necesita hook aquí.
function saveLoginHeader(){
  const colorInput = document.getElementById('lh-color');
  const textColorInput = document.getElementById('lh-textcolor');
  const colorDarkInput = document.getElementById('lh-color-dark');
  const textColorDarkInput = document.getElementById('lh-textcolor-dark');
  if(!LOGIN_HEADER) LOGIN_HEADER = { color:'#0E3470', textColor:'', colorDark:'', textColorDark:'', links:[] };
  if(colorInput) LOGIN_HEADER.color = colorInput.value || '#0E3470';
  if(textColorInput) LOGIN_HEADER.textColor = textColorInput.value || '';
  if(colorDarkInput) LOGIN_HEADER.colorDark = colorDarkInput.value || '';
  if(textColorDarkInput) LOGIN_HEADER.textColorDark = textColorDarkInput.value || '';
  // Cachear en localStorage: el header debe aparecer en el PRIMER paint del
  // login SIN esperar al backend. Sin este cache, un visitante nuevo abre la
  // app y no ve la barra hasta que alguien se loguea (imposible: hasta login,
  // no hay state hidratado).
  try { localStorage.setItem('lh', JSON.stringify(LOGIN_HEADER)); } catch(_){}
  renderLoginHeaderPreview();
  try { renderLoginHeader(); } catch(_){}
  if(typeof persist === 'function') persist(true);
  toast(t('lh_saved'));
}

