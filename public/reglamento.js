// ============================================================================
// public/reglamento.js — editor rich-text y render del reglamento
// Extraído del index.html original (líneas del script: 1497..1732).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
// ==================== CATÁLOGO DE JUGADORES fin ====================

// ==================== REGLAMENTO ====================
// Visible para todos (incluso en ligas pasadas). Editable solo por admin.
let _rgEdit=false;
function renderReglamento(){
  const cont=document.getElementById('view-reglamento');
  if(!cont)return;
  const admin=!_ligaReadOnly && esAdmin(currentUser);
  const vacio=!REGLAMENTO||!REGLAMENTO.trim();
  let h='<div class="card">';
  h+='<div class="section-lbl"><i class="ti ti-book"></i> '+t('rg_title')+'</div>';
  if(_rgEdit && admin){
    // Barra de herramientas del editor enriquecido.
    h+='<div class="rg-toolbar">';
    h+=' <button type="button" class="rg-tb" title="'+t('rg_bold')+'" onmousedown="rgCmd(event,\'bold\')"><b>B</b></button>';
    h+=' <button type="button" class="rg-tb" title="'+t('rg_italic')+'" onmousedown="rgCmd(event,\'italic\')"><i>I</i></button>';
    h+=' <button type="button" class="rg-tb" title="'+t('rg_underline')+'" onmousedown="rgCmd(event,\'underline\')"><u>U</u></button>';
    h+=' <span class="rg-sep"></span>';
    h+=' <select class="rg-size" title="'+t('rg_size')+'" onchange="rgSize(this)"><option value="">'+t('rg_size')+'</option><option value="2">'+t('rg_size_s')+'</option><option value="3">'+t('rg_size_m')+'</option><option value="5">'+t('rg_size_l')+'</option><option value="6">'+t('rg_size_xl')+'</option></select>';
    h+=' <span class="rg-sep"></span>';
    h+=' <button type="button" class="rg-tb" title="'+t('rg_ul')+'" onmousedown="rgCmd(event,\'insertUnorderedList\')"><i class="ti ti-list"></i></button>';
    h+=' <button type="button" class="rg-tb" title="'+t('rg_ol')+'" onmousedown="rgCmd(event,\'insertOrderedList\')"><i class="ti ti-list-numbers"></i></button>';
    h+=' <span class="rg-sep"></span>';
    h+=' <button type="button" class="rg-tb" title="'+t('rg_img')+'" onmousedown="rgPickImg(event)"><i class="ti ti-photo"></i></button>';
    h+='</div>';
    h+='<div id="rg-editor" class="rg-editor" contenteditable="true" data-ph="'+t('rg_placeholder')+'">'+sanitizarReglamento(REGLAMENTO||'')+'</div>';
    h+='<input type="file" id="rg-file" accept="image/*" style="display:none" onchange="rgInsertFile(this)">';
    h+='<div class="rg-hint">'+t('rg_img_hint')+'</div>';
    h+='<div class="gap-sm" style="flex-wrap:wrap;margin-top:10px">';
    h+='<button class="btn btn-primary" onclick="guardarReglamento()"><i class="ti ti-check"></i> '+t('rg_save')+'</button>';
    h+='<button class="btn" onclick="_rgEdit=false;renderReglamento()">'+t('close')+'</button>';
    h+='<button class="btn btn-sm" onclick="copiarReglamentoUI()"><i class="ti ti-copy"></i> '+t('rg_copy')+'</button>';
    h+='</div>';
  } else {
    if(vacio){
      h+='<p class="legend-txt">'+t('rg_empty')+'</p>';
    } else {
      h+='<div class="rg-content">'+sanitizarReglamento(REGLAMENTO)+'</div>';   // sanitizado al vuelo (limpia contenido viejo)
    }
    if(admin){
      h+='<div class="gap-sm" style="flex-wrap:wrap;margin-top:12px">';
      h+='<button class="btn btn-primary" onclick="_rgEdit=true;renderReglamento()"><i class="ti ti-edit"></i> '+(vacio?t('rg_create'):t('rg_edit'))+'</button>';
      if(!vacio) h+='<button class="btn btn-sm" onclick="copiarReglamentoUI()"><i class="ti ti-copy"></i> '+t('rg_copy')+'</button>';
      h+='</div>';
    }
  }
  h+='</div>';
  cont.innerHTML=h;
  // Enganchar el pegado de imágenes en el editor.
  const ed=document.getElementById('rg-editor');
  if(ed){ ed.addEventListener('paste', rgOnPaste); }
}
// Comandos de formato (negrita, listas, etc.). onmousedown + preventDefault para
// no perder la selección del texto en el editor.
function rgCmd(ev, cmd){ ev.preventDefault(); document.execCommand(cmd,false,null); document.getElementById('rg-editor')?.focus(); }
function rgSize(sel){ if(sel.value){ document.execCommand('fontSize',false,sel.value); sel.value=''; } document.getElementById('rg-editor')?.focus(); }
function rgPickImg(ev){ ev.preventDefault(); document.getElementById('rg-file')?.click(); }
// Límite de tamaño por imagen (para no inflar el estado guardado).
const RG_IMG_MAX = 2*1024*1024;  // 2 MB
function rgInsertFile(inp){
  const f=inp.files&&inp.files[0]; if(!f)return;
  if(f.size>RG_IMG_MAX){ alert(t('rg_img_big')); inp.value=''; return; }
  rgComprimirImg(f, (dataUrl)=>{ if(dataUrl) rgInsertImg(dataUrl); });
  inp.value='';
}
function rgInsertImg(dataUrl){
  const ed=document.getElementById('rg-editor'); if(!ed)return;
  ed.focus();
  document.execCommand('insertHTML',false,'<img src="'+dataUrl+'" style="max-width:100%;height:auto;border-radius:8px;margin:6px 0">');
}
// Comprime y redimensiona una imagen a un tamaño razonable ANTES de guardarla.
// Sin esto, una foto de celular (varios MB en base64) infla el estado y hace
// que el guardado falle por tamaño. La bajamos a máx 1200px y JPEG calidad 0.75.
function rgComprimirImg(fileOrDataUrl, cb){
  const img=new Image();
  img.onload=function(){
    const MAX=1200;
    let w=img.width, h=img.height;
    if(w>MAX||h>MAX){ if(w>=h){ h=Math.round(h*MAX/w); w=MAX; } else { w=Math.round(w*MAX/h); h=MAX; } }
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
    cv.getContext('2d').drawImage(img,0,0,w,h);
    try{ cb(cv.toDataURL('image/jpeg',0.75)); }
    catch(_){ cb(typeof fileOrDataUrl==='string'?fileOrDataUrl:null); }
  };
  img.onerror=function(){ cb(null); };
  if(typeof fileOrDataUrl==='string'){ img.src=fileOrDataUrl; }
  else { const r=new FileReader(); r.onload=()=>{ img.src=r.result; }; r.readAsDataURL(fileOrDataUrl); }
}
// Pegar imágenes directo (Ctrl+V) desde el portapapeles.
function rgOnPaste(ev){
  const items=(ev.clipboardData&&ev.clipboardData.items)||[];
  for(const it of items){
    if(it.type&&it.type.indexOf('image')===0){
      ev.preventDefault();
      const f=it.getAsFile();
      if(f&&f.size>RG_IMG_MAX){ alert(t('rg_img_big')); return; }
      rgComprimirImg(f, (dataUrl)=>{ if(dataUrl) rgInsertImg(dataUrl); });
      return;
    }
  }
  // Pegado de texto: limpiamos el HTML externo (Word/web traen tamaños y estilos
  // gigantes que rompen el layout). Conservamos negrita/cursiva/listas, sin estilos.
  const cd=ev.clipboardData;
  if(cd){
    const html=cd.getData('text/html');
    if(html){
      ev.preventDefault();
      document.execCommand('insertHTML', false, rgLimpiarPegado(html));
    }
  }
}
// Limpia HTML pegado: quita estilos inline, clases, y tamaños de fuente externos.
function rgLimpiarPegado(html){return sanitizarReglamento(html,true);}
// Formatea el texto plano del reglamento a HTML seguro (respeta saltos de línea).
function formatearReglamento(txt){
  return escPast(txt).replace(/\n/g,'<br>');
}
async function guardarReglamento(){
  const ed=document.getElementById('rg-editor');
  if(!ed)return;
  REGLAMENTO=sanitizarReglamento(ed.innerHTML);
  if(!await _criticalSave()){toast(t('fix_save_failed'));return;}
  _rgEdit=false;
  renderReglamento();
  renderSubTabs();   // la pestaña puede aparecer/desaparecer si pasó de vacío a lleno
  toast(t('rg_saved'));
}
// Limpia el HTML del reglamento: permite solo etiquetas de formato seguras y quita
// cualquier script/handler. Así el HTML se puede mostrar sin riesgo de inyección.
function sanitizarReglamento(html,pegado){
  // Documento inerte. Se reconstruyen nodos nuevos: ningún atributo desconocido
  // puede sobrevivir al desenvolver etiquetas anidadas.
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  const out=document.createElement('div');
  const allowed=new Set('B STRONG I EM U BR P DIV SPAN UL OL LI FONT IMG H1 H2 H3 H4'.split(' '));
  const discard=new Set('SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH TEMPLATE NOSCRIPT'.split(' '));
  function walk(src,dest,depth){
    if(depth>60)return;
    for(const n of Array.from(src.childNodes)){
      if(n.nodeType===3){dest.appendChild(document.createTextNode(n.textContent));continue;}
      if(n.nodeType!==1||discard.has(n.tagName)||n.namespaceURI!=='http://www.w3.org/1999/xhtml')continue;
      if(!allowed.has(n.tagName)){walk(n,dest,depth+1);continue;}
      if(pegado&&n.tagName==='IMG')continue;
      const el=document.createElement(n.tagName.toLowerCase());
      if(n.tagName==='IMG'){
        const src=n.getAttribute('src')||'';
        if(!/^data:image\/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(src))continue;
        if(src.length>3*1024*1024)continue;
        el.src=src;el.alt=(n.getAttribute('alt')||'').slice(0,200);
        el.style.cssText='max-width:100%;height:auto;border-radius:8px';
      }
      if(!pegado&&n.tagName==='FONT'&&/^[2-6]$/.test(n.getAttribute('size')||''))el.setAttribute('size',n.getAttribute('size'));
      if(!pegado){
        const rules={'font-weight':/^(normal|bold|[1-9]00)$/,'font-style':/^(normal|italic)$/,'text-decoration':/^(none|underline|line-through)$/,'text-align':/^(left|right|center|justify)$/};
        for(const [k,re]of Object.entries(rules)){const v=n.style.getPropertyValue(k).trim().toLowerCase();if(re.test(v))el.style.setProperty(k,v);}
      }
      walk(n,el,depth+1);dest.appendChild(el);
    }
  }
  walk(doc.body,out,0);return out.innerHTML;
}
// Copiar el reglamento de otra liga.
async function copiarReglamentoUI(){
  document.getElementById('modal-title').textContent=t('rg_copy_title');
  document.getElementById('modal-body').innerHTML='<div class="pm-past-load">'+t('past_loading')+'</div>';
  document.getElementById('modal-actions').innerHTML='<button class="btn" onclick="closeM()">'+t('close')+'</button>';
  document.getElementById('modal-bg').classList.add('open');
  try{
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'listar'})});
    const d=await r.json().catch(()=>({}));
    const otras=(d.ligas||[]).filter(l=>l.id!==(_ligaActual||'liga-actual'));
    const body=document.getElementById('modal-body');
    if(!otras.length){ body.innerHTML='<div class="pm-past-empty">'+t('rg_copy_none')+'</div>'; return; }
    body.innerHTML='<p class="legend-txt" style="margin-top:0">'+t('rg_copy_desc')+'</p>'
      +'<div class="lm-list">'+otras.map(l=>
        '<button class="btn rg-src-btn" onclick="copiarReglamentoDe(\''+escJsAttr(l.id)+'\',\''+escJsAttr(l.nombre)+'\')">'
        +'<i class="ti ti-book"></i> '+escPast(l.nombre)+'</button>').join('')+'</div>';
  }catch(_){ document.getElementById('modal-body').innerHTML='<div class="pm-past-empty">'+t('past_loading_err')+'</div>'; }
}
async function copiarReglamentoDe(ligaId,nombre){
  try{
    let estado=null;
    const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'ver',id:ligaId})});
    if(r.ok){ const d=await r.json().catch(()=>({})); estado=d.estado; }
    else {
      const r2=await fetch(_conLiga2('/api/state',ligaId),{headers:{Authorization:'Bearer '+_token},cache:'no-store'});
      if(r2.ok){ const d=await r2.json().catch(()=>null); estado=d&&d.state; }
    }
    const regla=estado&&typeof estado.REGLAMENTO==='string'?estado.REGLAMENTO:'';
    if(!regla.trim()){ alert(t('rg_copy_empty').replace('{n}',nombre)); return; }
    REGLAMENTO=regla;
    closeM();
    _rgEdit=true;   // abrir en edición para que el admin revise antes de guardar
    renderReglamento();
    toast(t('rg_copied').replace('{n}',nombre));
  }catch(_){ alert(t('past_loading_err')); }
}
// Helper: URL de state para una liga específica (para copiar reglamento de liga activa).
