// ============================================================================
// public/admin-ciclos-config.js — panel admin: configuración estructural, imports, render admin, export excel
// Extraído del index.html original (líneas del script: 3523..4280).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
function limpiarJugadoresUI(){
  // Primera confirmación
  if(!confirm('⚠️ Limpiar jugadores\n\nEsto eliminará TODOS los jugadores y sus resultados del ciclo activo.\nLa estructura de grupos se mantiene vacía.\n\n¿Querés continuar?')) return;
  // Segunda confirmación
  if(!confirm('⛔ Segunda confirmación\n\n¿Estás seguro que querés borrar todos los jugadores y resultados?\nEsta acción no se puede deshacer.')) return;
  // Ejecutar limpieza solo de jugadores
  const c=cycles[activeN-1];
  const numGrupos=c&&c.groups?c.groups.length:12;
  matches=matches.filter(m=>m.po); // mantener matches de playoff si los hay
  ALLNAMES=[];
  const adminU=USERS['admin']||{role:'admin',pass:ADMIN_PASS_HASH,name:'Organización',email:'',tel:''};
  USERS={admin:adminU};
  cycles.forEach((cy,i)=>{
    if(cy.groups)cy.groups.forEach(g=>{g.players=[];});
  });
  persist(true);renderPerfil();
  toast('✅ '+numGrupos+' grupos vaciados. Podés importar nuevos jugadores.');
}

function mostrarModalReiniciar(){
  // PASO 1: Ofrecer descarga del Excel (Enter = descargar)
  let _excelDescargado=false;
  let overlay=document.getElementById('reiniciar-overlay');
  if(overlay)overlay.remove();
  overlay=document.createElement('div');
  overlay.id='reiniciar-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';

  function paso2(){
    const estado=_excelDescargado
      ?'<span style="color:#22c55e;font-weight:600">✅ Excel descargado correctamente</span>'
      :'<span style="color:#f59e0b;font-weight:600">⚠️ No descargaste el Excel (continuaste sin respaldo)</span>';
    overlay.innerHTML=`
      <div style="background:var(--surface);border-radius:16px;padding:1.5rem;max-width:440px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25)">
        <div style="font-size:11px;color:var(--text2);margin-bottom:.25rem;font-weight:600;letter-spacing:.05em">PASO 2 DE 2</div>
        <div style="font-size:20px;font-weight:700;color:var(--danger);margin-bottom:.5rem">⛔ Confirmar reinicio</div>
        <p style="font-size:13px;margin-bottom:.75rem">${estado}</p>
        <p style="font-size:13px;color:var(--text2);margin-bottom:.35rem">Para confirmar, escribí exactamente:</p>
        <p style="font-family:monospace;font-size:14px;font-weight:700;color:var(--pri);background:var(--surface2,#f5f5f5);padding:6px 12px;border-radius:8px;margin-bottom:.75rem;display:inline-block">reiniciar liga</p>
        <input id="reiniciar-input" type="text" placeholder="Escribí aquí..." autocomplete="off"
          style="width:100%;padding:10px 14px;border:1.5px solid var(--border2);border-radius:10px;font-size:15px;margin-bottom:1rem;box-sizing:border-box;outline:none"
          oninput="document.getElementById('btn-confirm-reiniciar').disabled=this.value!=='reiniciar liga'">
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn" onclick="document.getElementById('reiniciar-overlay').remove()">Cancelar</button>
          <button id="btn-confirm-reiniciar" class="btn btn-danger" disabled onclick="ejecutarReiniciar()">
            <i class="ti ti-trash"></i> Reiniciar liga
          </button>
        </div>
      </div>`;
    setTimeout(()=>{ const i=document.getElementById('reiniciar-input'); if(i)i.focus(); },100);
  }

  overlay.innerHTML=`
    <div style="background:var(--surface);border-radius:16px;padding:1.5rem;max-width:440px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25)">
      <div style="font-size:11px;color:var(--text2);margin-bottom:.25rem;font-weight:600;letter-spacing:.05em">PASO 1 DE 2</div>
      <div style="font-size:20px;font-weight:700;color:var(--danger);margin-bottom:.5rem">⛔ Reiniciar Liga</div>
      <p style="color:var(--text);font-size:14px;margin-bottom:1.25rem">Esta acción eliminará <strong>todos los jugadores, partidos y resultados</strong>. No se puede deshacer.<br><br>
      ¿Querés descargar un respaldo en Excel antes de continuar?</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button id="btn-excel-reiniciar" class="btn btn-success" style="justify-content:center;font-size:15px;padding:10px">
          <i class="ti ti-file-spreadsheet"></i> Descargar Excel y continuar
        </button>
        <button class="btn" style="justify-content:center;color:var(--text2);font-size:13px" id="btn-sin-excel">
          Continuar sin descargar
        </button>
        <button class="btn" style="justify-content:center" onclick="document.getElementById('reiniciar-overlay').remove()">Cancelar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Botón descargar Excel (default — también responde al Enter)
  document.getElementById('btn-excel-reiniciar').addEventListener('click',()=>{
    exportExcel();
    _excelDescargado=true;
    setTimeout(()=>paso2(),600);
  });
  document.getElementById('btn-sin-excel').addEventListener('click',()=>{
    _excelDescargado=false;
    paso2();
  });
  // Enter en el modal paso 1 = descargar Excel
  overlay.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&document.getElementById('btn-excel-reiniciar')){
      document.getElementById('btn-excel-reiniciar').click();
    }
  });
  document.getElementById('btn-excel-reiniciar').focus();
}

async function ejecutarReiniciar(){
  const overlay=document.getElementById('reiniciar-overlay');
  if(overlay)overlay.remove();
  // Ejecutar el reinicio (el Excel ya se descargó en el paso 1 si se eligió)
  const c=cycles[activeN-1];
  const numGrupos=c&&c.groups?c.groups.length:12;
  matches=[];matchId=1;ALLNAMES=[];LOG=[];
  const adminU=USERS['admin']||{role:'admin',pass:ADMIN_PASS_HASH,name:'Organización',email:'',tel:''};
  USERS={admin:adminU};
  cycles.forEach((cy,i)=>{
    if(i===0){cy.groups=Array.from({length:numGrupos},()=>({players:[]}));cy.status='active';}
    else{cy.groups=null;cy.status='locked';}
  });
  activeN=1;viewCycle=1;
  playoff={started:false,numTramos:playoff.numTramos||4,tramos:[],results:{},viewT:0,qualified:[],preview:false,forcedSize:0};
  PO_FECHAS={};
  persist(true);renderShell();showSub('admin');
  toast('✅ Liga reiniciada. '+numGrupos+' grupos vacíos listos. Importá jugadores con el botón "Importar jugadores (Excel)".');
}

// Alias para el botón
function limpiarParticipantesUI(){ mostrarModalReiniciar(); }

// 4. Nueva liga — genera un index.html listo para nuevo repo + Supabase
async function nuevaLigaUI(){
  const info='NUEVA LIGA\n\nGenera un archivo index.html con el nombre de la liga nueva.\n\nOJO: ahora las credenciales NO van en el archivo, van en Vercel.\n\nPasos:\n1. Crear un proyecto nuevo en supabase.com y correr supabase_lockdown.sql\n2. Subir este archivo + la carpeta /api a un repo nuevo de GitHub\n3. Conectar el repo a Vercel\n4. En Vercel > Settings > Environment Variables cargar:\n   SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET\n5. Listo: nueva liga en nuevo URL, con su propia base aislada';
  if(!confirm(info+' \n\n¿Seguimos?'))return;
  const nombre=prompt('Nombre de la nueva liga (aparece en el título):','Liga de Tenis');
  if(!nombre)return;
  toast('Generando archivo...');
  try{
    const resp=await fetch(location.href);
    let src=await resp.text();
    // Solo se reemplaza el título: las credenciales viven en el servidor.
    src=src.replace(/<title>[^<]*<\/title>/,`<title>${nombre}</title>`);
    src=src.replace(/Liga de Tenis Sohail/g,nombre);
    const blob=new Blob([src],{type:'text/html'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='index.txt';a.click();
    URL.revokeObjectURL(url);
    toast('✅ Archivo descargado. Subilo con la carpeta /api a un repo nuevo y cargá las variables de entorno en Vercel. La base de esta liga queda intacta.');
  }catch(err){
    toast('Error al generar el archivo: '+err.message);
  }
}

// ===== HISTORIAL =====
function addLog(action, detail){
  const now=new Date();
  const ts=now.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+now.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  LOG.unshift({ts,who:currentUser?currentUser.name:'Sistema',role:currentUser?currentUser.role:'system',action,detail});
  if(LOG.length>500)LOG.splice(500);
}
function fmtSets(sets){if(!sets||!sets.length)return '—';return sets.map(([a,b])=>a+'-'+b).join(' ');}


// Modal para que el admin ajuste el seed y/o el override de un jugador.


// Guarda seed/override y recalcula.

function renderHistorial(){
  const el=document.getElementById('view-historial');if(!el)return;
  const filter=document.getElementById('hist-filter')?document.getElementById('hist-filter').value:'all';
  const search=document.getElementById('hist-search')?document.getElementById('hist-search').value.toLowerCase():'';
  const isSA=currentUser&&currentUser.role==='superadmin';
  const rows=LOG.filter(e=>{
    // Admin no ve acciones del superadmin (config de liga, colores, etc.)
    if(!isSA&&e.role==='superadmin')return false;
    if(filter==='liga'&&(e.detail&&(e.detail.po===true||e.detail.po===null)))return false;
    if(filter==='playoff'&&(!e.detail||e.detail.po!==true))return false;
    if(search&&!(e.who.toLowerCase().includes(search)||e.action.toLowerCase().includes(search)||(e.detail&&JSON.stringify(e.detail).toLowerCase().includes(search))))return false;
    return true;
  });
  const icons={
    'Liga: cargado':'<i class="ti ti-upload" style="color:#3b82f6"></i>',
    'Liga: confirmado':'<i class="ti ti-circle-check" style="color:#22c55e"></i>',
    'Liga: validado (admin)':'<i class="ti ti-shield-check" style="color:#22c55e"></i>',
    'Liga: editado':'<i class="ti ti-pencil" style="color:#f59e0b"></i>',
    'Liga: eliminado':'<i class="ti ti-trash" style="color:#ef4444"></i>',
    'Liga: marcado no jugado':'<i class="ti ti-ban" style="color:#64748b"></i>',
    'Liga: en disputa':'<i class="ti ti-alert-triangle" style="color:#ef4444"></i>',
    'Liga: disputa resuelta':'<i class="ti ti-gavel" style="color:#8b5cf6"></i>',
    'Playoff: cargado':'<i class="ti ti-upload" style="color:#3b82f6"></i>',
    'Playoff: validado (admin)':'<i class="ti ti-shield-check" style="color:#22c55e"></i>',
    'Playoff: confirmado':'<i class="ti ti-circle-check" style="color:#22c55e"></i>',
    'Playoff: editado':'<i class="ti ti-pencil" style="color:#f59e0b"></i>',
    'Playoff: eliminado':'<i class="ti ti-trash" style="color:#ef4444"></i>',
    'Playoff: W.O.':'<i class="ti ti-arrow-big-right-lines" style="color:#ea580c"></i>',
    'Playoff: disputa resuelta':'<i class="ti ti-gavel" style="color:#8b5cf6"></i>',
  };
  let h='<div class="card"><div class="section-lbl">Historial de resultados</div>';
  h+='<div style="display:flex;gap:8px;margin-bottom:.75rem;flex-wrap:wrap">';
  h+='<select id="hist-filter" onchange="renderHistorial()" style="padding:5px 10px;border-radius:8px;border:1px solid var(--border2);background:var(--surface);font-size:13px">';
  h+='<option value="all">Todos</option><option value="liga" '+(filter==='liga'?'selected':'')+'>Solo liga</option><option value="playoff" '+(filter==='playoff'?'selected':'')+'>Solo playoff</option>';
  h+='</select>';
  h+='<input id="hist-search" placeholder="Buscar jugador o acción..." value="'+attr(search)+'" oninput="renderHistorial()" style="flex:1;min-width:160px;padding:5px 10px;border-radius:8px;border:1px solid var(--border2);background:var(--surface);font-size:13px">';
  h+='</div>';
  if(!rows.length){h+='<p style="color:var(--text2);font-style:italic;text-align:center;padding:2rem 0">Sin entradas en el historial todavía.</p></div>';el.innerHTML=h;return;}
  h+='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">';
  h+='<thead><tr style="border-bottom:2px solid var(--border2);text-align:left">';
  h+='<th style="padding:6px 8px;color:var(--text2);font-weight:600;white-space:nowrap">Fecha y hora</th>';
  h+='<th style="padding:6px 8px;color:var(--text2);font-weight:600">Quién</th>';
  h+='<th style="padding:6px 8px;color:var(--text2);font-weight:600">Acción</th>';
  h+='<th style="padding:6px 8px;color:var(--text2);font-weight:600">Detalle</th>';
  h+='<th style="padding:6px 8px;color:var(--text2);font-weight:600;white-space:nowrap">Sets</th>';
  h+='</tr></thead><tbody>';
  rows.forEach((e,i)=>{
    const ic=icons[e.action]||'<i class="ti ti-dots" style="color:var(--text2)"></i>';
    const d=e.detail||{};
    let detalle='';
    if(d.po){
      const rnd=d.round||'';const cuadro=d.cuadro?'Cuadro '+d.cuadro:'';
      const draw=d.which==='cons'?'Consolación':'Principal';
      detalle=cuadro+(rnd?' · '+rnd:'')+(draw?' ('+draw+')':'');
      if(d.a&&d.b)detalle+='<br><span style="font-weight:500">'+d.a+'</span> vs <span style="font-weight:500">'+d.b+'</span>';
    } else {
      if(d.grupo)detalle='Grupo '+d.grupo;
      if(d.a&&d.b)detalle+=(detalle?'<br>':'')+'<span style="font-weight:500">'+d.a+'</span> vs <span style="font-weight:500">'+d.b+'</span>';
    }
    const sets=fmtSets(d.sets);
    const winner=d.winner?'<br><span style="font-size:11px;color:#22c55e;font-weight:600">🏆 '+d.winner+'</span>':'';
    h+=`<tr style="border-bottom:1px solid var(--border);background:${i%2===0?'transparent':'var(--surface2,#f8f9fb)'}">`;
    h+=`<td style="padding:7px 8px;color:var(--text2);font-size:12px;white-space:nowrap">${e.ts}</td>`;
    h+=`<td style="padding:7px 8px;font-weight:500">${e.who}</td>`;
    h+=`<td style="padding:7px 8px;white-space:nowrap">${ic} ${e.action}</td>`;
    h+=`<td style="padding:7px 8px">${detalle}${winner}</td>`;
    h+=`<td style="padding:7px 8px;font-family:monospace;white-space:nowrap">${sets}</td>`;
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  h+=`<p style="font-size:11px;color:var(--text2);margin-top:.5rem;text-align:right">${rows.length} de ${LOG.length} entradas</p>`;
  h+='</div>';
  el.innerHTML=h;
}

function setPoFecha(r, field, v) {
  if(!PO_FECHAS[r])PO_FECHAS[r]={type:'single',date:'',from:'',to:''};
  PO_FECHAS[r][field]=v;
  persist(true);
  // Re-render bracket if playoff is active
  if(viewCycle==='po')showPlayoffView();
}
function setPoFechaType(r, type) {
  if(!PO_FECHAS[r])PO_FECHAS[r]={type:'single',date:'',from:'',to:''};
  PO_FECHAS[r].type=type;
  persist(true);
  if(viewCycle==='po')showPlayoffView();
  else if(subView==='admin')renderAdmin();
}

function renderAdmin(){
  if(!currentUser||!esAdmin(currentUser))return;
  try {
    const c = getActive() || { groups: [] };
    const grps = c.groups || [];
    const need = pairsNeeded(c);
    const done = matches.filter(m=>m.cycle===activeN&&!m.po&&m.status==='confirmed').length;
    const notC = matches.filter(m=>m.cycle===activeN&&!m.po&&m.status!=='confirmed').length;
    const ready = done>=need&&notC===0;
    // Se PUEDE cerrar mientras no queden partidos cargados sin validar. Que falten
    // partidos por jugar no bloquea: el admin puede cerrar igual (con confirmación).
    const puedeCerrar = notC===0;
    const faltanJugar = need-done-notC;
    const cyclesDone = allCyclesDone();

    // ¿Hay algún ciclo con editMode activo? (carga habilitada manualmente por admin)
    const cicloEditMode = cycles.find(c2=>c2.editMode);
    
    let h=`<div class="card"><div class="section-lbl">${t('admin_cycle_status')}</div><div class="alert ${ready?'alert-ok':(puedeCerrar?'alert-warn':'alert-info')}">${t('cycle')} ${activeN}: ${tf('validated_count',{done,need})}${notC>0?` · ${notC} ${t('unvalidated_short')}`:''}. ${ready?t('ready_close'):(notC>0?t('missing_results'):tf('close_can_incomplete',{n:faltanJugar}))}</div>`+
    (ready&&activeN===cycles.length&&c.status!=='finished'?`<div class="alert alert-ok" style="margin-top:.4rem;font-weight:600"><i class="ti ti-info-circle"></i> ¡Todos los partidos validados! Presioná "Finalizar último ciclo" para habilitar los Play Offs.</div>`:'')+
    // Banner de ciclo con editMode activo
    (cicloEditMode?`<div class="alert alert-warn" style="margin-top:.4rem"><i class="ti ti-pencil"></i> <strong>Carga habilitada en Ciclo ${cicloEditMode.n}</strong> — jugadores y admins pueden cargar resultados en ese ciclo aunque esté cerrado. Deshabilitalo cuando termines.</div>`:'')+
    `<div class="gap-sm mt-sm">${activeN<cycles.length?`<button class="btn ${faltanJugar>0&&puedeCerrar?'btn-warn':'btn-accent'}" ${(!puedeCerrar)?'disabled':''} onclick="startNextCycle()"><i class="ti ti-arrow-right-circle"></i> ${t('close_cycle')}${faltanJugar>0&&puedeCerrar?' ('+t('close_incomplete')+')':''}</button>`:`<button class="btn ${faltanJugar>0&&puedeCerrar?'btn-warn':'btn-accent'}" ${(!puedeCerrar||(c&&c.status==='finished'))?'disabled':''} onclick="finishLastCycle()"><i class="ti ti-flag-check"></i> ${t('finish_last_cycle')}${faltanJugar>0&&puedeCerrar?' ('+t('close_incomplete')+')':''}</button>`}<button class="btn" onclick="demoFillUI()"><i class="ti ti-wand"></i> ${t('simulate')}</button><button class="btn btn-danger" onclick="undoDemoUI()"><i class="ti ti-eraser"></i> ${t('undo_demo')}</button></div>` +
    // Sección de rehabilitar carga (solo si hay ciclos cerrados)
    (cycles.some(c2=>c2.status==='finished')?`<div style="border-top:1px solid var(--border2);margin-top:.75rem;padding-top:.75rem">
      <div style="font-weight:700;font-size:.85rem;margin-bottom:.25rem"><i class="ti ti-pencil"></i> Habilitar carga de partidos en un ciclo cerrado</div>
      <p class="legend-txt" style="margin-top:.15rem;margin-bottom:.5rem">Si necesitás agregar resultados en un ciclo ya cerrado (sin borrar los existentes), habilitá ese ciclo temporalmente. Jugadores y admins van a poder cargar partidos en él desde la pestaña Cargar. Deshabilitalo cuando termines.</p>
      <div class="gap-sm" style="flex-wrap:wrap">
        ${cycles.filter(c2=>c2.status==='finished').map(c2=>`<button class="btn btn-sm ${c2.editMode?'btn-warn':''}" onclick="toggleEditMode(${c2.n})"><i class="ti ti-${c2.editMode?'lock-open':'lock'}"></i> Ciclo ${c2.n} ${c2.editMode?'(carga activa — click para cerrar)':'(cerrado)'}</button>`).join('')}
      </div>
    </div>`:'') +
    `</div>`;
    
    const numGrupos = grps.length || 12;
    const ppg = (grps[0]&&grps[0].players)?grps[0].players.length:5;
    const cActiveHasMatches = matches.some(m=>m.cycle===activeN&&!m.po);
    if(currentUser.role==='superadmin'){ h += `<div class="card"><div class="section-lbl">Configuración de la Liga (Ciclo ${activeN})</div>
          <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
             <div class="form-group">
                <label>Total de ciclos (1 a 8)</label>
                <select onchange="setTotalCycles(this.value)">
                   ${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${cycles.length===n?'selected':''}>${n} ciclo${n>1?'s':''}</option>`).join('')}
                </select>
             </div>
             <div class="form-group">
                <label>Grupos en la liga (1 a 50)</label>
                <select onchange="setNumGroups(this.value)">
                   ${Array.from({length:50},(_,i)=>i+1).map(n=>`<option value="${n}" ${numGrupos===n?'selected':''}>${n} grupo${n>1?'s':''}</option>`).join('')}
                </select>
             </div>
             <div class="form-group">
                <label>Jugadores por grupo</label>
                <select onchange="setPlayersPerGroup(this.value)">
                   ${[2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${ppg===n?'selected':''}>${n} jugadores</option>`).join('')}
                </select>
             </div>
          </div>
          <p class="legend-txt" style="margin-top:0">Cambiar grupos o jugadores por grupo ajusta la estructura del <strong>Ciclo ${activeN}</strong> (el ciclo activo). ${cActiveHasMatches?'<span style="color:#e55;font-weight:600">⚠ Este ciclo ya tiene partidos cargados — reducir grupos puede borrar resultados.</span>':''}</p>
          </div>
          <div style="border-top:1px solid var(--border2);margin-top:.75rem;padding-top:.85rem">
            <div style="font-weight:700;font-size:.85rem;margin-bottom:.35rem">⚡ ${t('autoscale_title')}</div>
            <p class="legend-txt" style="margin-top:0;margin-bottom:.65rem">${t('autoscale_hint')}</p>
            <div class="form-row" style="grid-template-columns:1fr auto;align-items:end;gap:.625rem">
              <div class="form-group">
                <label>${t('autoscale_step')}</label>
                <input type="number" id="autoscale-step" value="3" min="1" max="20" style="width:100%;padding:.5rem;border:1.5px solid var(--border2);border-radius:8px">
              </div>
              <button class="btn btn-accent" onclick="autoGenerarEscala()">${t('autoscale_btn')}</button>
            </div>
          </div>`;
    } // fin config exclusiva superadmin

    h+=`<div class="form-row" style="grid-template-columns:1fr 1fr;gap:.625rem;align-items:start">`;
    
    h+=`<div class="card" style="margin:0"><div class="section-lbl">${t('cycle_dates')}</div><div style="display:grid;grid-template-columns:1fr;gap:12px">`+
       cycles.map((cyc,i)=>{
         const [d1, d2] = parseDateRange(FECHAS[i]);
         return `<div class="form-group"><label>${t('cycle')} ${i+1}</label>
                 <div style="display:flex;gap:6px;align-items:center">
                   <input type="date" value="${d1}" onchange="updateCycleDate(${i}, 'start', this.value)" style="padding:6px 8px">
                   <span style="color:var(--text2);font-weight:bold">–</span>
                   <input type="date" value="${d2}" onchange="updateCycleDate(${i}, 'end', this.value)" style="padding:6px 8px">
                 </div></div>`;
       }).join('')+
       `</div><p class="legend-txt" style="margin-top:.4rem">Seleccioná inicio y fin de cada ciclo.</p></div>`;

    h+=`<div class="card" style="margin:0"><div class="section-lbl">${t('playoffs_title')}</div>`;
    h+=(cyclesDone?`<div class="alert alert-ok" style="margin-bottom:.5rem">${t('playoffs_ready')}</div>`:`<div class="alert alert-info" style="margin-bottom:.5rem">${t('playoffs_not_ready')}</div>`);
    h+=`<div class="form-row"><div class="form-group"><label>${t('how_many_playoffs')}</label><select onchange="setPoNum(this.value)">${[1,2,3,4,5,6].map(k=>`<option value="${k}" ${playoff.numTramos===k?'selected':''}>${k} ${k>1?t('bracket_plural'):t('bracket_singular')}</option>`).join('')}</select></div>`;
    h+=`<div class="form-group"><label>${t('po_size_label')}</label><select onchange="setPoSize(this.value)"><option value="0" ${!playoff.forcedSize?'selected':''}>${t('po_size_auto')}</option><option value="64" ${playoff.forcedSize===64?'selected':''}>${t('r_64')}</option><option value="32" ${playoff.forcedSize===32?'selected':''}>${t('r_32')}</option><option value="16" ${playoff.forcedSize===16?'selected':''}>${t('r_16')}</option><option value="8" ${playoff.forcedSize===8?'selected':''}>${t('r_8')}</option><option value="4" ${playoff.forcedSize===4?'selected':''}>${t('r_4')}</option><option value="2" ${playoff.forcedSize===2?'selected':''}>${t('r_2')}</option></select></div></div>`;
    h+=`<div><button class="btn btn-primary" ${cyclesDone&&!playoff.started?'':'disabled'} onclick="previewPlayoffUI()"><i class="ti ti-eye"></i> ${t('preview_po')}</button></div>`;
    h+=(playoff.started?`<p class="legend-txt">${t('po_started')}</p>`:playoff.preview?`<p class="legend-txt">${t('po_preview_active')}</p>`:'');
    h+=`</div>`;
    h+=`</div>`;

    h+=`<div class="card"><div class="section-lbl">Exportar / Importar</div>
      <div style="margin-top:.35rem">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--text2);margin-bottom:.5rem">Exportar</div>
      <p class="legend-txt" style="margin-top:0;margin-bottom:.65rem">Descargá los resultados completos o los Play Offs para compartir o imprimir.</p>
      <div class="gap-sm" style="flex-wrap:wrap">`;
    cycles.forEach(cy => {
        h += `<button class="btn btn-sm" onclick="printCycle(${cy.n})"><i class="ti ti-printer"></i> PDF Ciclo ${cy.n}</button>`;
    });
    h += `<button class="btn btn-sm" onclick="printPlayoffs()"><i class="ti ti-printer"></i> PDF Play Offs</button>`;
    h += `<button class="btn btn-success btn-sm" onclick="exportExcel()"><i class="ti ti-file-spreadsheet"></i> Exportar Excel</button>`;
    h += `</div>
      </div>
      <div style="height:1px;background:var(--border);margin:1.1rem 0"></div>
      <div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--text2);margin-bottom:.5rem">Importar</div>
      <p class="legend-txt" style="margin-top:0;margin-bottom:.65rem">Cargá resultados de liga desde un Excel con el mismo formato de la plantilla.</p>
      <div class="gap-sm" style="flex-wrap:wrap">
        <button class="btn btn-sm" onclick="descargarPlantillaResultados()"><i class="ti ti-file-download"></i> Plantilla de resultados</button>
        <label class="btn btn-sm" style="cursor:pointer"><i class="ti ti-file-upload"></i> Importar resultados (Excel)
          <input type="file" accept=".xlsx,.xls" style="display:none" onchange="importarResultadosExcel(this)">
        </label>
      </div>
      <p class="legend-txt" style="margin-bottom:0;margin-top:.65rem;font-size:11px">Solo resultados de liga (grupos), no Play Offs. Quedan validados. Un resultado ya cargado del mismo partido se reemplaza.</p>
      </div>
    </div>`;

    h+=`<div class="card" style="border:1.5px solid var(--pri)"><div class="section-lbl"><i class="ti ti-shield-check"></i> Copia de seguridad (backup completo)</div>
      <p class="legend-txt" style="margin-top:.35rem;margin-bottom:.85rem">Descargá un backup en Excel con TODA la liga (jugadores, grupos, ciclos, resultados, ascensos/descensos, puntos, colores y nombre). Si algún día se pierde la data, con este archivo restaurás todo en un clic. <b>Recomendado: bajá un backup cada semana.</b></p>
      <div class="gap-sm" style="flex-wrap:wrap">
        <button class="btn btn-success btn-sm" onclick="exportBackup()"><i class="ti ti-download"></i> Descargar backup (Excel)</button>
        <label class="btn btn-danger btn-sm" style="cursor:pointer"><i class="ti ti-upload"></i> Restaurar backup
          <input type="file" accept=".xlsx,.xls,.json,application/json" style="display:none" onchange="importBackup(this)">
        </label>
      </div>
      <p class="legend-txt" style="margin-bottom:0;margin-top:.7rem;font-size:11px">Restaurar REEMPLAZA todo el estado actual por el del archivo (pide confirmación). Acepta el backup en Excel o los .json viejos. Es la forma segura de recuperar la liga completa.</p>
    </div>`;

    h+=`<div class="card"><div class="section-lbl">${tf('edit_groups',{n:activeN})}</div><p class="legend-txt" style="margin-top:0">${t('edit_groups_hint')}</p><div style="margin-bottom:.75rem"><button class="btn btn-primary" onclick="applyGroupsUpdate()"><i class="ti ti-refresh"></i> Actualizar grupos</button></div>`;
    h+=`<div class="grpedit">`+grps.map((g,gi)=>{
      const gid=gi+1;
      const players = g.players || [];
      return `<div class="ge-group"><div class="ge-gtitle">${groupName(gid)} (${players.length})</div>`+
      players.map(n=>`<div class="ge-row"><span class="ge-nm">${n}</span><select class="ge-sel" onchange="movePlayerUI('${jsq(n)}',${gid},this.value)"><option value="">${t('move_to')}</option>${grps.map((_,k)=>k+1!==gid?`<option value="${k+1}">${groupName(k+1)}</option>`:'').join('')}</select><button class="btn btn-danger btn-sm" onclick="removePlayerUI('${jsq(n)}',${gid})">${t('remove')}</button></div>`).join('')+`</div>`;
    }).join('')+`</div></div>`;
    h+=destinoCard();

    h+='<div class="card"><div class="section-lbl">Reiniciar y retroceder</div>';
    h+='<p class="legend-txt" style="margin-top:0;margin-bottom:.75rem">Tres opciones según lo que necesitás:</p>';

    // Acción 1: solo borrar partidos del ciclo activo (conserva grupos y jugadores)
    h+=`<div style="border:1px solid var(--border2);border-radius:10px;padding:.75rem 1rem;margin-bottom:.6rem">
      <div style="font-weight:700;font-size:.85rem;margin-bottom:.2rem"><i class="ti ti-eraser" style="color:#f59e0b"></i> Reiniciar partidos del ciclo activo</div>
      <p class="legend-txt" style="margin-top:.2rem;margin-bottom:.5rem">Borra solo los partidos del ciclo activo (Ciclo ${activeN}). Los grupos, jugadores, inactivos y movimientos entre grupos se conservan. Útil para empezar a jugar desde cero con los mismos grupos.</p>
      <button class="btn btn-warn btn-sm" onclick="resetCycleUI(${activeN})"><i class="ti ti-eraser"></i> Borrar partidos del Ciclo ${activeN}</button>
    </div>`;

    // Acción 2: retroceder al ciclo anterior (solo si hay ciclo anterior)
    if(activeN>1){
      h+=`<div style="border:1px solid var(--border2);border-radius:10px;padding:.75rem 1rem;margin-bottom:.6rem">
        <div style="font-weight:700;font-size:.85rem;margin-bottom:.2rem"><i class="ti ti-arrow-back-up" style="color:#3b82f6"></i> Volver al ciclo anterior (Ciclo ${activeN-1})</div>
        <p class="legend-txt" style="margin-top:.2rem;margin-bottom:.5rem">Reabre el Ciclo ${activeN-1} para seguir cargando partidos. Descarta la estructura del Ciclo ${activeN} (los partidos de ese ciclo también se borran). Los partidos del Ciclo ${activeN-1} se conservan.</p>
        <button class="btn btn-sm" style="border-color:#3b82f6;color:#3b82f6" onclick="retrocederCicloUI()"><i class="ti ti-arrow-back-up"></i> Volver al Ciclo ${activeN-1}</button>
      </div>`;
    }

    // Acción 3: reiniciar playoffs
    if(playoff.started||playoff.preview){
      h+=`<div style="border:1px solid var(--border2);border-radius:10px;padding:.75rem 1rem;margin-bottom:.6rem">
        <div style="font-weight:700;font-size:.85rem;margin-bottom:.2rem"><i class="ti ti-trash" style="color:#e55"></i> Reiniciar Play Offs</div>
        <p class="legend-txt" style="margin-top:.2rem;margin-bottom:.5rem">Borra todos los cuadros y resultados de Play Offs. Los partidos de liga no se tocan.</p>
        <button class="btn btn-danger btn-sm" onclick="resetPlayoffUI()"><i class="ti ti-trash"></i> Reiniciar Play Offs</button>
      </div>`;
    }
    h+='</div>';

    if(currentUser.role==='superadmin'){
    h+='<div class="card" style="border:1.5px solid var(--danger,#e55);border-radius:12px">';
    h+='<div class="section-lbl" style="color:var(--danger,#e55)">Nueva temporada</div>';
    h+='<p class="legend-txt" style="margin-top:0">Reiniciá la liga para una nueva temporada. Los partidos actuales se borran.</p>';
    h+='<div class="gap-sm" style="flex-wrap:wrap">';
    h+='<button class="btn btn-danger" onclick="limpiarParticipantesUI()"><i class="ti ti-refresh"></i> Reiniciar liga</button>';
    h+='</div></div>';
    }

    // ---- Gestión de ligas (sistema unificado) ----
    // Panel para crear ligas nuevas desde el catálogo de jugadores, y para
    // cerrar / reabrir / eliminar las existentes. Visible para cualquier admin.
    h+='<div class="card" id="liga-mgmt-card">';
    h+='<div class="section-lbl"><i class="ti ti-trophy"></i> '+t('lm_title')+'</div>';
    h+='<p class="legend-txt" style="margin-top:0">'+t('lm_desc')+'</p>';
    h+='<div class="gap-sm" style="flex-wrap:wrap;margin-bottom:10px">';
    h+='<button class="btn btn-primary" onclick="abrirCrearLiga()"><i class="ti ti-plus"></i> '+t('lm_new')+'</button>';
    h+='</div>';
    h+='<div id="liga-mgmt-list" class="lm-list"><div class="pm-past-load">'+t('past_loading')+'</div></div>';
    h+='</div>';

    // ==================== CARD: Métricas + Panel de Ingreso Rápido ====================
    // Muestra métricas de adopción de Face ID y permite al admin desactivar
    // dispositivos de cualquier jugador (útil si perdieron el iPhone).
    h+=`<div class="card"><div class="section-lbl"><i class="ti ti-face-id"></i> ${t('pk_admin_title')}</div>`;
    h+=`<p class="legend-txt" style="margin:.35rem 0 .75rem">${t('pk_admin_desc')}</p>`;
    h+=`<div id="pk-admin-metrics" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"></div>`;
    h+=`<div id="pk-admin-list"></div></div>`;

    // ==================== CARD: Notificaciones WhatsApp (CallMeBot) ====================
    // Solo admin original y superadmin pueden gestionar canales de notificación.
    // Un admin ascendido no ve este card (evita que agregue números arbitrarios
    // y reciba data sensible de la liga).
    if(puedeGestionarAdmins(currentUser)){
      h+=`<div class="card"><div class="section-lbl"><i class="ti ti-brand-whatsapp"></i> ${t('wa_admin_title')}</div>`;
      h+=`<p class="legend-txt" style="margin:.35rem 0 .75rem">${t('wa_admin_desc')}</p>`;
      h+=`<div class="gap-sm" style="flex-wrap:wrap;margin-bottom:12px">`;
      h+=`<button class="btn btn-primary" onclick="abrirModalCanalWA()"><i class="ti ti-plus"></i> 📱 ${t('wa_add_btn')}</button>`;
      h+=`</div>`;
      h+=`<div id="wa-channels-list"><div class="pm-past-load">${t('past_loading')}</div></div></div>`;
    }

    // ==================== CARD: Header del login (editable) ====================
    // Barra superior de la pantalla de login con color + links configurables.
    // Solo admin original y superadmin la editan (misma restricción que WA).
    if(puedeGestionarAdmins(currentUser)){
      h+=`<div class="card"><div class="section-lbl"><i class="ti ti-layout-navbar"></i> ${t('lh_title')}</div>`;
      h+=`<p class="legend-txt" style="margin:.35rem 0 .75rem">${t('lh_desc')}</p>`;
      h+=`<div class="form-row" style="align-items:flex-end;flex-wrap:wrap">`;
      h+=`<div class="form-group" style="max-width:180px"><label>${t('lh_color_lbl')}</label><input type="color" id="lh-color" value="${(LOGIN_HEADER&&LOGIN_HEADER.color)||'#0E3470'}" style="height:38px;padding:2px;cursor:pointer" onchange="saveLoginHeader()"></div>`;
      h+=`<div class="form-group" style="max-width:180px"><label>${t('lh_textcolor_lbl')} <span class="legend-txt" style="font-size:10px">(${t('lh_textcolor_auto')})</span></label><div style="display:flex;gap:4px;align-items:center"><input type="color" id="lh-textcolor" value="${(LOGIN_HEADER&&LOGIN_HEADER.textColor)||'#ffffff'}" style="height:38px;padding:2px;cursor:pointer;flex:1" onchange="saveLoginHeader()"><button class="btn btn-sm" onclick="resetLoginHeaderTextColor()" title="${t('lh_textcolor_reset')}"><i class="ti ti-refresh"></i></button></div></div>`;
      h+=`<div class="form-group"><button class="btn" onclick="addLoginHeaderLink()"><i class="ti ti-plus"></i> ${t('lh_add_link')}</button></div>`;
      h+=`</div>`;
      h+=`<div id="lh-links-list" style="margin-top:.5rem"></div>`;
      h+=`<div style="margin-top:.75rem;padding:.65rem;background:var(--soft);border-radius:8px;border:1px dashed var(--border2)"><div style="font-size:11px;color:var(--text2);margin-bottom:.35rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em">${t('preview')}</div><div id="lh-preview" style="border-radius:6px;overflow:hidden"></div></div>`;
      h+=`</div>`;
    }

    // ==================== CARD: Exportar liga a Excel ====================
    h+=`<div class="card"><div class="section-lbl"><i class="ti ti-file-spreadsheet"></i> ${t('export_title')}</div>`;
    h+=`<p class="legend-txt" style="margin:.35rem 0 .75rem">${t('export_desc')}</p>`;
    h+=`<button class="btn btn-primary btn-sm" onclick="exportarLigaExcel()"><i class="ti ti-download"></i> ${t('export_btn')}</button></div>`;

    document.getElementById('view-admin').innerHTML=h;
    cargarGestionLigas();
    // Cargar el card de passkeys admin (fetch async, no bloquea el render)
    if(typeof cargarPasskeysAdmin==='function') cargarPasskeysAdmin();
    // Cargar el card de canales WhatsApp (fetch async, solo si el card se renderizó)
    if(puedeGestionarAdmins(currentUser) && typeof cargarCanalesWhatsApp==='function') cargarCanalesWhatsApp();
    if(puedeGestionarAdmins(currentUser) && typeof renderLoginHeaderLinks==='function') renderLoginHeaderLinks();
  } catch (err) {
    console.error("Error en renderAdmin:", err);
    document.getElementById('view-admin').innerHTML = `<div class="card"><div class="alert alert-err" style="margin-bottom:0"><b>Error cargando el panel Admin:</b> ${err.message}<br>Por favor recargá la página o contactá a soporte técnico.</div></div>`;
  }
}

function printCycle(n) {
  const c = cycles[n-1];
  if(!c || !c.groups) { toast('Ciclo sin datos.'); return; }
  let html = `<h2 style="margin-bottom:1rem;color:var(--priD)">Liga de Tenis Sohail - Ciclo ${n}</h2>`;
  const oldView = viewCycle;
  viewCycle = n;
  c.groups.forEach((g, gi) => { html += groupCardHTML(gi + 1); });
  viewCycle = oldView;
  const pa = document.getElementById('print-area');
  pa.innerHTML = html;
  
  setTimeout(() => { 
      window.print(); 
      setTimeout(() => { pa.innerHTML = ''; }, 800); 
  }, 350);
}

function printPlayoffs() {
  if(!playoff.started && !playoff.preview) { toast('Play Offs no disponibles.'); return;
  }
  let html = `<h2 style="margin-bottom:1rem;color:var(--priD)">Liga de Tenis Sohail - Play Offs</h2>`;
  playoff.tramos.forEach((tr, ti) => {
     if(!tr.main)return;
     html += `<div class="po-card">`;
     html += `<h3 style="background:var(--pri);color:#fff;padding:8px;border-radius:8px;margin-bottom:10px">${tf('po_main_title',{l:tr.label})}</h3>`;
     html += bracketHTML(tr.main, ti, 'main');
     if(tr.cons) {
        html += `<h3 style="background:#854F0B;color:#fff;padding:8px;border-radius:8px;margin-top:1.5rem;margin-bottom:10px">${tf('po_cons_title',{l:tr.label})}</h3>`;
        html += bracketHTML(tr.cons, ti, 'cons');
     }
     html += `</div>`;
  });
  const pa = document.getElementById('print-area');
  pa.innerHTML = html;

  const style = document.createElement('style');
  style.id = 'print-landscape-style';
  style.innerHTML = '@page { size: landscape; }';
  document.head.appendChild(style);

  setTimeout(() => { 
      window.print(); 
      setTimeout(() => { 
          pa.innerHTML = ''; 
          const sl = document.getElementById('print-landscape-style');
          if(sl) document.head.removeChild(sl);
      }, 800); 
  }, 350);
}

function exportExcel(){
  if(typeof XLSX==='undefined'){toast('Error: librería Excel no cargada.');return;}
  const wb=XLSX.utils.book_new();

  // ===== HOJA: GRUPOS (todos los ciclos, todos los grupos en una sola pestaña) =====
  const gAOA=[];
  cycles.forEach(cy=>{
    if(!cy.groups)return;
    gAOA.push(['CICLO '+cy.n]);
    gAOA.push([]);
    cy.groups.forEach((g,gi)=>{
      const gid=gi+1;
      gAOA.push([groupName(gid)]);
      gAOA.push(['Destino','Jugador','Pts','G','P','NJ','SG','SP','Bal','P.Puesto','Extra','Total']);
      const st=computeStats(cy.n,gid);
      const dest=DESTINO[gid]||[];
      st.forEach((s,i)=>{
        const d=dest[i]||'';
        const base=ptsForPos(gid,i);
        const ex=i===0?2:0;
        const isInactive=USERS[s.name]&&USERS[s.name].inactive;
        gAOA.push([d, s.name+(isInactive?' (INACTIVO)':''), s.pts, s.g, s.p, s.nj, s.sg, s.sp, s.sg-s.sp, isInactive?'':base, ex>0?ex:'', isInactive?'':base+ex]);
      });
      gAOA.push([]);
      // Matriz de resultados
      const players=(g.players||[]).filter(Boolean);
      gAOA.push(['Resultados '+groupName(gid)]);
      gAOA.push(['Jugador',...players]);
      players.forEach(p=>{
        const row=[p];
        players.forEach(q=>{
          if(p===q){row.push('');return;}
          const m=findMatch(cy.n,gid,p,q);
          if(m&&m.np){row.push('NJ');return;}
          if(m&&m.status==='confirmed'){
            const sc=m.aName===p?m.sets.map(([a,b])=>a+'-'+b).join(' '):m.sets.map(([a,b])=>b+'-'+a).join(' ');
            row.push(sc);
          } else row.push('');
        });
        gAOA.push(row);
      });
      gAOA.push([]);
    });
    gAOA.push([]);
  });
  const wsG=XLSX.utils.aoa_to_sheet(gAOA);
  wsG['!cols']=[{wch:10},{wch:24},{wch:6},{wch:5},{wch:5},{wch:5},{wch:5},{wch:5},{wch:6},{wch:9},{wch:7},{wch:7}];
  XLSX.utils.book_append_sheet(wb,wsG,'Grupos');

  // ===== HOJA: PLAY OFFS =====
  if(playoff.started||playoff.preview){
    const pAOA=[];
    playoff.tramos.forEach(tr=>{
      if(!tr.main)return;
      pAOA.push(['CUADRO '+tr.label+' - Principal']);
      pAOA.push(['Ronda','Jugador A','Jugador B','Resultado','Ganador']);
      tr.main.forEach((round,ri)=>{
        round.forEach(m=>{
          const sc=m.np?'No jugado':(m.sets?m.sets.map(([a,b])=>a+'-'+b).join(' '):'');
          pAOA.push([rName_export(ri,tr.main.length), m.a||'BYE', m.b||(m.a?'BYE':''), sc, m.w||'']);
        });
      });
      pAOA.push([]);
      if(tr.cons){
        pAOA.push(['CUADRO '+tr.label+' - Consolación']);
        pAOA.push(['Ronda','Jugador A','Jugador B','Resultado','Ganador']);
        tr.cons.forEach((round,ri)=>{
          round.forEach(m=>{
            const sc=m.np?'No jugado':(m.sets?m.sets.map(([a,b])=>a+'-'+b).join(' '):'');
            pAOA.push([rName_export(ri,tr.cons.length), m.a||'BYE', m.b||(m.a?'BYE':''), sc, m.w||'']);
          });
        });
        pAOA.push([]);
      }
    });
    const wsP=XLSX.utils.aoa_to_sheet(pAOA);
    wsP['!cols']=[{wch:14},{wch:24},{wch:24},{wch:16},{wch:24}];
    XLSX.utils.book_append_sheet(wb,wsP,'Play Offs');
  }

  // ===== HOJA: RESULTADOS (formato plano — base para importar) =====
  const rAOA=[['Ciclo','Grupo','Jugador A','Jugador B','Resultado','Club','Fecha']];
  cycles.forEach(cy=>{
    if(!cy.groups)return;
    cy.groups.forEach((g,gi)=>{
      const gid=gi+1;
      const players=(g.players||[]).filter(Boolean);
      for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){
        const m=findMatch(cy.n,gid,players[i],players[j]);
        if(!m||m.status!=='confirmed'||m.po)continue;
        const sc=m.sets.map(([a,b])=>a+'-'+b).join(' ');
        rAOA.push([cy.n,gid,m.aName,m.bName,sc,m.club||'',fmtDate(m.date)]);
      }
    });
  });
  const wsR=XLSX.utils.aoa_to_sheet(rAOA);
  wsR['!cols']=[{wch:7},{wch:7},{wch:22},{wch:22},{wch:16},{wch:9},{wch:12}];
  XLSX.utils.book_append_sheet(wb,wsR,'Resultados');

  // ===== HOJA: JUGADORES (padrón: grupo por ciclo, estado, contacto) =====
  const nameSet={};
  ALLNAMES.forEach(n=>{nameSet[n]=1;});
  Object.keys(USERS).forEach(n=>{if(USERS[n]&&USERS[n].role==='player')nameSet[n]=1;});
  cycles.forEach(cy=>{if(cy.groups)cy.groups.forEach(g=>(g.players||[]).forEach(n=>{if(n)nameSet[n]=1;}));});
  const roster=Object.keys(nameSet).sort((a,b)=>a.localeCompare(b,'es'));
  const jHead=['Jugador','Email','Teléfono','Estado'];
  cycles.forEach(cy=>jHead.push('Ciclo '+cy.n));
  const jAOA=[jHead];
  roster.forEach(name=>{
    const u=USERS[name]||{};
    const row=[name,u.email||'',u.tel||'',u.inactive?'Inactivo':'Activo'];
    cycles.forEach(cy=>{
      if(!cy.groups){row.push('—');return;}
      const loc=findLoc(name,cy.n);
      row.push(loc?('Grupo '+loc.g):'—');
    });
    jAOA.push(row);
  });
  const wsJ=XLSX.utils.aoa_to_sheet(jAOA);
  const jCols=[{wch:24},{wch:26},{wch:16},{wch:10}];
  cycles.forEach(()=>jCols.push({wch:10}));
  wsJ['!cols']=jCols;
  XLSX.utils.book_append_sheet(wb,wsJ,'Jugadores');

  const fname='Liga_Sohail_'+new Date().toISOString().slice(0,10)+'.xlsx';
  XLSX.writeFile(wb,fname);
  toast('Excel exportado: '+fname);
}
function rName_export(ri,total){const fe=total-1-ri;if(fe===0)return 'Final';if(fe===1)return 'Semifinal';if(fe===2)return 'Cuartos';if(fe===3)return 'Octavos';if(fe===4)return '16avos';return 'Ronda '+(ri+1);}

// ===== Importar resultados (mismo formato que la hoja "Resultados" de la exportación) =====
function descargarPlantillaResultados(){
  if(typeof XLSX==='undefined'){toast('Error: librería Excel no cargada.');return;}
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([
    ['Ciclo','Grupo','Jugador A','Jugador B','Resultado','Club','Fecha'],
    [1,1,'Juan Pérez','María García','6-3 6-4','Sohail','01/07/2026'],
    [1,1,'Carlos López','Ana Ruiz','6-2 4-6 1-0','Haza','02/07/2026'],
  ]);
  ws['!cols']=[{wch:7},{wch:7},{wch:22},{wch:22},{wch:16},{wch:9},{wch:12}];
  XLSX.utils.book_append_sheet(wb,ws,'Resultados');
  XLSX.writeFile(wb,'plantilla_importar_resultados.xlsx');
  toast('Plantilla descargada. El formato coincide con la hoja "Resultados" de la exportación.');
}
function parseResultado(str){
  if(str==null)return[];
  str=String(str).trim();
  if(!str)return[];
  const tokens=str.split(/[\s,;]+/).filter(Boolean);
  const sets=[];
  for(const tok of tokens){
    const parts=tok.split(/[-–—:]/).map(x=>x.trim());
    if(parts.length!==2)return null;
    const a=parseInt(parts[0],10),b=parseInt(parts[1],10);
    if(isNaN(a)||isNaN(b))return null;
    sets.push([a,b]);
  }
  return sets;
}
function importarResultadosExcel(input){
  const file=input.files[0];
  if(!file)return;
  if(typeof XLSX==='undefined'){toast('Error: librería Excel no cargada.');input.value='';return;}
  if(!(esAdmin(currentUser))){toast(t('validated_only_admin'));input.value='';return;}
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const data=new Uint8Array(e.target.result);
      const wb=XLSX.read(data,{type:'array'});
      const shName=wb.SheetNames.find(n=>/result/i.test(n))||wb.SheetNames[0];
      const ws=wb.Sheets[shName];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      if(!rows.length){toast('El archivo está vacío o no tiene el formato correcto.');input.value='';return;}
      let imported=0,replaced=0,errors=[];
      const G=(row,keys)=>{for(const k of keys){for(const kk in row){if(kk.trim().toLowerCase()===k)return row[kk];}}return '';};
      rows.forEach((row,idx)=>{
        const fila=idx+2;
        const cicN=parseInt(G(row,['ciclo','cycle']),10);
        const gid=parseInt(G(row,['grupo','group']),10);
        const pa=String(G(row,['jugador a','jugadora','player a','jugador_a'])).trim();
        const pb=String(G(row,['jugador b','jugadorb','player b','jugador_b'])).trim();
        const resStr=String(G(row,['resultado','result','marcador'])).trim();
        let club=String(G(row,['club'])).trim();
        let fecha=String(G(row,['fecha','date'])).trim();
        if(!pa&&!pb&&!resStr)return; // fila vacía → ignorar en silencio
        if(!cicN||isNaN(cicN)){errors.push('Fila '+fila+': ciclo inválido');return;}
        const c=cycles[cicN-1];
        if(!c||!c.groups){errors.push('Fila '+fila+': el ciclo '+cicN+' no tiene grupos activos');return;}
        if(!gid||gid<1||gid>c.groups.length){errors.push('Fila '+fila+': grupo inválido ('+cicN+')');return;}
        const gpl=(c.groups[gid-1].players||[]);
        if(!pa||!pb){errors.push('Fila '+fila+': faltan jugadores');return;}
        if(pa===pb){errors.push('Fila '+fila+': Jugador A y B son el mismo');return;}
        if(gpl.indexOf(pa)<0){errors.push('Fila '+fila+': "'+pa+'" no está en '+groupName(gid)+' (ciclo '+cicN+')');return;}
        if(gpl.indexOf(pb)<0){errors.push('Fila '+fila+': "'+pb+'" no está en '+groupName(gid)+' (ciclo '+cicN+')');return;}
        const sets=parseResultado(resStr);
        if(sets===null){errors.push('Fila '+fila+': no se pudo leer el resultado "'+resStr+'"');return;}
        const vr=validMatch(sets);
        if(!vr.ok){errors.push('Fila '+fila+': '+vr.msg+' ("'+resStr+'")');return;}
        if(/haza/i.test(club))club='Haza';else if(/sohail/i.test(club))club='Sohail';else club='';
        fecha=toISODate(fecha)||new Date().toISOString().slice(0,10);
        const exist=findMatch(cicN,gid,pa,pb);
        if(exist){matches=matches.filter(m=>m!==exist);replaced++;}
        // Un admin que además juega no valida sus propios partidos ni por Excel:
        // era la última puerta que quedaba abierta para saltearse la regla.
        const propio=!validaAlCargar(pa,pb);
        matches.push({id:matchId++,cycle:cicN,g:gid,aName:pa,bName:pb,sets:sets,date:fecha,status:propio?'pending':'confirmed',vBy:propio?undefined:currentUser.name,reporter:pa,club:club,locked:!propio});
        imported++;
      });
      addLog('Liga: import de resultados',{importados:imported,reemplazados:replaced,errores:errors.length});
      persist(true);refreshAll();
      let msg=imported+' resultado'+(imported!==1?'s':'')+' importado'+(imported!==1?'s':'')+' y validado'+(imported!==1?'s':'')+'.';
      if(replaced)msg+=' '+replaced+' reemplazaron uno existente.';
      if(errors.length)msg+=' '+errors.length+' con error.';
      toast(msg);
      if(errors.length)alert('Errores de importación:\n\n'+errors.join('\n'));
    }catch(err){toast('Error al leer el archivo: '+err.message);}
  };
  reader.readAsArrayBuffer(file);
  input.value='';
}
