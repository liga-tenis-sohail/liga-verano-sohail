// ============================================================================
// public/jugadores-perfiles-catalogo.js — catálogo global de jugadores (panel superadmin)
// Extraído del index.html original (líneas del script: 1370..1496).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
function statsJugadorEnEstado(name, estado){
  const all = (estado && estado.matches) || [];
  // Reconocemos DOS formatos de match: liga regular (aName/bName) y playoff
  // (po:true con poNames array). Antes filtrábamos solo por aName/bName, así que
  // los playoffs quedaban invisibles: un jugador que jugó 4+3 partidos de ciclos
  // + 2 de playoff veía "7 partidos" en su perfil en lugar de 9.
  const ms = all.filter(m => {
    if(!m || m.status !== 'confirmed') return false;
    if(m.aName === name || m.bName === name) return true;
    if(m.po && Array.isArray(m.poNames) && m.poNames.indexOf(name) !== -1) return true;
    return false;
  });
  let g=0,p=0;
  ms.forEach(m=>{
    // En playoffs preferimos usar m.winner (nombre del ganador guardado explícito
    // al confirmar), porque en algunos casos los sets pueden estar vacíos
    // (W.O., no jugado). Para liga regular el winner se deduce de los sets.
    if(m.po && m.winner){
      if(m.winner === name) g++; else p++;
      return;
    }
    // Cálculo por sets: primero determinamos si el jugador es "A" o "B"
    // en la estructura correspondiente al formato del match.
    const yoA = m.po ? (m.poNames && m.poNames[0] === name) : (m.aName === name);
    let sgA=0,sgB=0;
    (m.sets||[]).forEach(s=>{if(Array.isArray(s)){if(s[0]>s[1])sgA++;else if(s[1]>s[0])sgB++;}});
    const gane=yoA?sgA>sgB:sgB>sgA;
    if(gane)g++;else p++;
  });
  return {pj:g+p, pg:g, pp:p};
}
// HTML de un bloque de estadísticas (una tarjeta con PJ/PG/PP/%).
function bloqueStatsHTML(titulo, st, cargando){
  const pct=st.pj>0?Math.round((st.pg/st.pj)*100):0;
  const num=(v)=>cargando?'<span class="stat-load">·</span>':v;
  return '<div class="stat-block"><div class="stat-block-t">'+titulo+'</div>'
    +'<div class="stat-grid">'
    +'<div class="stat-cell"><b>'+num(st.pj)+'</b><span>'+t('st_pj')+'</span></div>'
    +'<div class="stat-cell"><b class="stat-w">'+num(st.pg)+'</b><span>'+t('st_pg')+'</span></div>'
    +'<div class="stat-cell"><b class="stat-l">'+num(st.pp)+'</b><span>'+t('st_pp')+'</span></div>'
    +'<div class="stat-cell"><b class="stat-pct">'+num(pct+'%')+'</b><span>'+t('st_pct')+'</span></div>'
    +'</div></div>';
}
// Suma las stats de la liga actual + todas las pasadas para un jugador (async).
async function cargarStatsTotales(name, actualSt){
  const cont=document.getElementById('stat-total');
  if(!cont)return;
  let tot={pj:actualSt.pj, pg:actualSt.pg, pp:actualSt.pp};
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'listar'})});
    const d=await r.json().catch(()=>({}));
    const otras=(d.ligas||[]).filter(l=>l.id!==(_ligaActual||'liga-actual'));
    for(const l of otras){
      try{
        let est=null;
        const rv=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'ver',id:l.id})});
        if(rv.ok){ const dv=await rv.json().catch(()=>({})); est=dv.estado; }
        else if(_token){
          const r2=await fetch('/api/state?liga='+encodeURIComponent(l.id),{headers:{Authorization:'Bearer '+_token},cache:'no-store'});
          if(r2.ok){ const d2=await r2.json().catch(()=>({})); est=d2.state; }
        }
        if(est){
          const st=statsJugadorEnEstado(name, est);
          tot.pj+=st.pj; tot.pg+=st.pg; tot.pp+=st.pp;
        }
      }catch(_){}
    }
  }catch(_){}
  cont.innerHTML=bloqueStatsHTML(t('st_total'), tot, false);
}
// Arma los dos bloques (actual + total) y dispara la carga async del total.
function statsPerfilHTML(name){
  const actual=statsJugadorEnEstado(name, {matches:matches});
  setTimeout(()=>cargarStatsTotales(name, actual), 30);   // el total se completa solo
  return '<div class="card"><div class="section-lbl"><i class="ti ti-chart-bar"></i> '+t('st_title')+'</div>'
    +'<div class="stat-blocks">'
    + bloqueStatsHTML(t('st_current'), actual, false)
    + '<div id="stat-total">'+bloqueStatsHTML(t('st_total'), actual, true)+'</div>'
    +'</div></div>';
}

// ==================== CATÁLOGO DE JUGADORES (superadmin) ====================
let _catJugadores=[];
async function cargarCatJugadores(){
  const cont=document.getElementById('cat-jugadores-list');
  if(!cont)return;
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({accion:'jugadores',ligaId:_ligaActual||undefined})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){ cont.innerHTML='<div class="pm-past-empty">'+(d.error||t('past_loading_err'))+'</div>'; return; }
    _catJugadores=d.jugadores||[];
    pintarCatJugadores();
  }catch(_){ cont.innerHTML='<div class="pm-past-empty">'+t('past_loading_err')+'</div>'; }
}
// ---- Fusión de perfiles (login unificado) ----
// Un mismo jugador real puede tener 2 filas de catálogo (2 jugadorId
// distintos) si se lo cargó con nombres de usuario distintos en dos ligas
// (ej: "Juan Pérez" en una, "jperez" en otra), sin email para vincularlos
// solo. _fusionModo activa un modo de selección: se eligen 2 jugadores con
// checkbox y se fusionan en uno solo (una queda como principal, la otra se
// borra del catálogo y se re-vincula en todas las ligas donde aparecía).
let _fusionModo=false, _fusionSel=[];
function toggleFusionModo(){
  _fusionModo=!_fusionModo;
  _fusionSel=[];
  pintarCatJugadores();
}
function toggleFusionSel(jid){
  const i=_fusionSel.indexOf(jid);
  if(i>=0){ _fusionSel.splice(i,1); }
  else{
    if(_fusionSel.length>=2) _fusionSel.shift();   // solo se sostienen 2 a la vez
    _fusionSel.push(jid);
  }
  pintarCatJugadores();
}
function pintarCatJugadores(){
  const cont=document.getElementById('cat-jugadores-list');
  if(!cont)return;
  const q=(document.getElementById('cj-search')?.value||'').toLowerCase().trim();
  const lista=_catJugadores.filter(j=>!q||j.nombre.toLowerCase().includes(q));
  const barraFusion='<div class="cj-fusion-bar">'
    +'<button class="btn btn-sm'+(_fusionModo?' btn-primary':'')+'" onclick="toggleFusionModo()">'
    +'<i class="ti ti-git-merge"></i> '+(_fusionModo?t('cj_fusion_salir'):t('cj_fusion_btn'))+'</button>'
    +(_fusionModo?'<span class="cj-fusion-hint">'+t('cj_fusion_hint')+'</span>':'')
    +'</div>';
  if(!lista.length){ cont.innerHTML=barraFusion+'<div class="pm-past-empty">'+t('cj_none')+'</div>'; return; }
  cont.innerHTML=barraFusion+'<div class="cj-count">'+t('cj_total').replace('{n}',_catJugadores.length)+'</div>'
    + lista.map(j=>{
    // Un jugador con partidos NO se puede borrar (protege el historial).
    // La fusión SÍ puede incluir jugadores con partidos: no se pierde nada,
    // el historial queda guardado por nombre en cada liga tal cual estaba.
    const tienePartidos=j.partidos>0;
    const meta=[];
    if(j.email) meta.push('<i class="ti ti-mail"></i> '+escPast(j.email));
    meta.push('<i class="ti ti-trophy"></i> '+t('cj_leagues').replace('{n}',j.ligas));
    meta.push('<i class="ti ti-ball-tennis"></i> '+t('cj_matches').replace('{n}',j.partidos));

    if(_fusionModo){
      const marcado=_fusionSel.indexOf(j.jugadorId)>=0;
      return '<div class="cj-item cj-item-fusion'+(marcado?' on':'')+'" onclick="toggleFusionSel(\''+escJsAttr(j.jugadorId)+'\')">'
        +'<div class="cj-chk'+(marcado?' on':'')+'"><i class="ti ti-check"></i></div>'
        +'<div class="cj-item-tx"><b>'+escPast(j.nombre)+'</b>'
        +'<span class="cj-meta">'+meta.join(' · ')+'</span></div></div>';
    }

    const btn=tienePartidos
      ? '<button class="cj-del" disabled title="'+t('cj_has_matches')+'"><i class="ti ti-lock"></i></button>'
      : '<button class="cj-del cj-del-on" onclick="eliminarJugadorUI(\''+escJsAttr(j.jugadorId)+'\',\''+escJsAttr(j.nombre)+'\')"><i class="ti ti-trash"></i></button>';
    return '<div class="cj-item"><div class="cj-item-tx"><b>'+escPast(j.nombre)+'</b>'
      +'<span class="cj-meta">'+meta.join(' · ')+'</span></div>'+btn+'</div>';
  }).join('')
    + (_fusionModo && _fusionSel.length===2 ? pintarBarraConfirmarFusion() : '');
}
function pintarBarraConfirmarFusion(){
  const a=_catJugadores.find(j=>j.jugadorId===_fusionSel[0]);
  const b=_catJugadores.find(j=>j.jugadorId===_fusionSel[1]);
  if(!a||!b) return '';
  return '<div class="cj-fusion-confirm">'
    +'<div class="cj-fusion-confirm-tx">'+t('cj_fusion_confirm_lbl').replace('{a}',escPast(a.nombre)).replace('{b}',escPast(b.nombre))+'</div>'
    +'<div class="cj-fusion-confirm-btns">'
    +'<button class="btn btn-sm" onclick="fusionarJugadoresUI(\''+escJsAttr(a.jugadorId)+'\',\''+escJsAttr(b.jugadorId)+'\',\''+escJsAttr(a.nombre)+'\')">'+t('cj_fusion_keep').replace('{n}',escPast(a.nombre))+'</button>'
    +'<button class="btn btn-sm" onclick="fusionarJugadoresUI(\''+escJsAttr(b.jugadorId)+'\',\''+escJsAttr(a.jugadorId)+'\',\''+escJsAttr(b.nombre)+'\')">'+t('cj_fusion_keep').replace('{n}',escPast(b.nombre))+'</button>'
    +'</div></div>';
}
async function fusionarJugadoresUI(mantenerId,descartarId,nombreMantener){
  if(!(await confirmarModal(t('cj_fusion_final_confirm').replace('{n}',nombreMantener), {titulo:t('cj_fusion_btn'), okTxt:t('cj_fusion_btn'), peligro:true})))return;
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({accion:'fusionarJugadores',jugadorIdMantener:mantenerId,jugadorIdDescartar:descartarId,ligaId:_ligaActual||undefined})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){ alert(d.error||t('cj_fusion_err')); return; }
    toast(t('cj_fusion_done').replace('{n}',nombreMantener));
    _fusionModo=false; _fusionSel=[];
    cargarCatJugadores();
  }catch(_){ alert(t('cj_fusion_err')); }
}
function filtrarCatJugadores(){ pintarCatJugadores(); }
async function eliminarJugadorUI(jid,nombre){
  if(!(await confirmarModal(t('cj_del_confirm').replace('{n}',nombre), {titulo:t('lm_delete'), okTxt:t('lm_delete'), peligro:true})))return;
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({accion:'eliminarJugador',jugadorId:jid,ligaId:_ligaActual||undefined})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){ alert(d.error||t('cj_del_err')); return; }
    toast(t('cj_deleted').replace('{n}',nombre));
    cargarCatJugadores();
  }catch(_){ alert(t('cj_del_err')); }
}

