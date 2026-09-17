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
// Fixed, soft marker colours: no arbitrary CSS or colour expressions are stored.
const RG_HIGHLIGHT_COLORS=Object.freeze([
  {value:'#fef08a',key:'rg_hl_yellow'}, {value:'#bbf7d0',key:'rg_hl_green'},
  {value:'#bfdbfe',key:'rg_hl_blue'}, {value:'#fbcfe8',key:'rg_hl_pink'},
  {value:'#e9d5ff',key:'rg_hl_purple'}
]);
// v3.9.2: foreground is independent from highlighting and league-wide colours.
// Only opaque hex/RGB and the internal "initial" reset survive sanitization.
const RG_TEXT_COLORS=Object.freeze([
  {value:'#1d4ed8',key:'rg_ink_blue'}, {value:'#15803d',key:'rg_ink_green'},
  {value:'#b91c1c',key:'rg_ink_red'}, {value:'#c2410c',key:'rg_ink_orange'},
  {value:'#7e22ce',key:'rg_ink_purple'}, {value:'#475569',key:'rg_ink_gray'}
]);
let _rgTextChoice='#1d4ed8';
function rgTextColor(value){
  if(typeof value!=='string')return '';
  let v=value.trim().toLowerCase();
  if(/^#[0-9a-f]{3}$/.test(v))v='#'+Array.from(v.slice(1),x=>x+x).join('');
  if(/^#[0-9a-f]{6}$/.test(v))return v;
  const rgb=/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
  if(!rgb)return '';
  const a=rgb.slice(1).map(Number);return a.some(n=>n>255)?'':'#'+a.map(n=>n.toString(16).padStart(2,'0')).join('');
}
function rgTextLuminance(hex){
  const a=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return a[0]*.2126+a[1]*.7152+a[2]*.0722;
}
function rgTextContrast(a,b){const x=rgTextLuminance(a),y=rgTextLuminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function rgReadableTextColor(requested,background){
  const fg=rgTextColor(requested),bg=rgTextColor(background);if(!fg||!bg)return '#172033';
  if(rgTextContrast(fg,bg)>=4.5)return fg;
  const target=rgTextContrast('#000000',bg)>=rgTextContrast('#ffffff',bg)?0:255;
  const rgb=[1,3,5].map(i=>parseInt(fg.slice(i,i+2),16));
  // At most 256 tiny operations, memoized by the caller per paint. An opaque
  // black/white endpoint always meets 4.5:1; stored requested colour is untouched.
  for(let step=1;step<=255;step++){
    const v='#'+rgb.map(n=>Math.round(n+(target-n)*step/255).toString(16).padStart(2,'0')).join('');
    if(rgTextContrast(v,bg)>=4.55)return v;
  }
  return target===0?'#000000':'#ffffff';
}
function rgTextStatus(key){const el=document.getElementById('rg-text-status');if(el)el.textContent=t(key);}
function rgSyncTextPicker(source){
  const picker=document.getElementById('rg-text-picker'),hex=document.getElementById('rg-text-hex');
  if(!picker||!hex)return;
  const v=rgTextColor(source==='picker'?picker.value:hex.value);
  hex.setAttribute('aria-invalid',v?'false':'true');
  if(!v){rgTextStatus('rg_ink_invalid');return;}
  _rgTextChoice=v;picker.value=v;
  if(source==='picker')hex.value=v;
  rgTextStatus('rg_ink_ready');
}
function rgApplyTextColor(value){
  const ed=document.getElementById('rg-editor');
  if(!_rgEdit||_ligaReadOnly||!esAdmin(currentUser)||ed!==_rgHighlightEditor||String(_ligaActual)!==_rgHighlightLeague)return false;
  const raw=value===undefined?document.getElementById('rg-text-hex')?.value:value;
  const colour=raw==='auto'?'initial':rgTextColor(raw);
  if(!colour){rgTextStatus('rg_ink_invalid');return false;}
  rgRememberHighlightRange();const r=_rgHighlightRange;
  if(!rgHighlightInside(r,ed)||r.collapsed||!r.toString().trim()){rgTextStatus('rg_ink_select');return false;}
  const sel=window.getSelection();if(!sel)return false;
  if(typeof document.execCommand!=='function'||(document.queryCommandSupported&&!document.queryCommandSupported('foreColor'))){rgTextStatus('rg_ink_unsupported');return false;}
  const top=ed.scrollTop;let css=false,changed=false;
  try{
    ed.focus({preventScroll:true});sel.removeAllRanges();sel.addRange(r);
    try{css=document.queryCommandState('styleWithCSS');}catch(_){}
    document.execCommand('styleWithCSS',false,true);
    changed=document.execCommand('foreColor',false,colour);
  }catch(_){changed=false;}
  finally{try{document.execCommand('styleWithCSS',false,css);}catch(_){}ed.scrollTop=top;}
  if(changed&&colour!=='initial'){
    _rgTextChoice=colour;
    const picker=document.getElementById('rg-text-picker'),hex=document.getElementById('rg-text-hex');
    if(picker)picker.value=colour;if(hex){hex.value=colour;hex.setAttribute('aria-invalid','false');}
  }
  rgRefreshTextColors();rgRememberHighlightRange();
  rgTextStatus(changed?(raw==='auto'?'rg_ink_reset':'rg_ink_applied'):'rg_ink_unsupported');
  return changed;
}
function rgQueueTextPaint(){
  // Run only after native editing finishes, never nest another execCommand.
  Promise.resolve().then(rgRefreshTextColors);
}
function rgRefreshTextColors(){
  const host=document.getElementById('view-reglamento');if(!host)return;
  const memo=new Map();
  const readable=(ink,bg)=>{const k=ink+'|'+bg;if(!memo.has(k))memo.set(k,rgReadableTextColor(ink,bg));return memo.get(k);};
  for(const root of host.querySelectorAll('.rg-editor,.rg-content')){
    const surface=root.closest('.rg-reader')||root;
    const baseBg=rgTextColor(getComputedStyle(surface).backgroundColor)||(document.documentElement.dataset.theme==='dark'?'#191919':'#ffffff');
    const baseInk=rgTextColor(getComputedStyle(root).color)||(document.documentElement.dataset.theme==='dark'?'#f1f5f9':'#172033');
    const stack=Array.from(root.children,el=>({el,ink:null,bg:baseBg,marked:false,reset:false}));
    while(stack.length){
      let {el,ink,bg,marked,reset}=stack.pop();
      const raw=el.style.getPropertyValue('color').trim().toLowerCase();
      const own=rgTextColor(raw||(el.tagName==='FONT'?el.getAttribute('color'):''));
      if(raw==='initial'){ink=null;reset=true;}else if(own){ink=own;reset=false;}
      const highlight=rgHighlightColor(el.style.getPropertyValue('background-color'));
      if(highlight){bg=highlight;marked=true;}
      if(el.tagName!=='IMG'&&(ink||marked||reset)){
        el.setAttribute('data-rg-ink-rendered','');
        el.style.setProperty('--rg-visible-ink',readable(ink||(marked?'#172033':baseInk),bg));
      }else{el.removeAttribute('data-rg-ink-rendered');el.style.removeProperty('--rg-visible-ink');}
      for(const child of el.children)stack.push({el:child,ink,bg,marked,reset});
    }
  }
}
function rgTextToolbar(){
  let h='<div class="rg-text-tools" role="group" aria-labelledby="rg-text-label">';
  h+='<span id="rg-text-label" class="rg-highlight-label"><i class="ti ti-letter-a" aria-hidden="true"></i> '+t('rg_ink_title')+'</span>';
  h+='<div class="rg-highlight-palette">';
  for(const c of RG_TEXT_COLORS){const label=t('rg_ink_title')+': '+t(c.key);
    h+='<button type="button" class="rg-ink-swatch" style="--rg-swatch:'+c.value+'" data-rg-ink-choice="'+c.value+'" title="'+label+'" aria-label="'+label+'" aria-describedby="rg-text-hint" onmousedown="rgKeepHighlightSelection(event)" ontouchstart="rgKeepHighlightSelection(event)" onclick="rgApplyTextColor(this.dataset.rgInkChoice)"><span aria-hidden="true">A</span></button>';
  }
  h+='</div><div class="rg-text-custom">';
  h+='<label class="rg-text-picker-label">'+t('rg_ink_custom')+'<input id="rg-text-picker" type="color" value="'+_rgTextChoice+'" onpointerdown="rgRememberHighlightRange()" oninput="rgSyncTextPicker(\'picker\')"></label>';
  h+='<label class="rg-text-hex-label">'+t('rg_ink_hex')+'<input id="rg-text-hex" type="text" maxlength="7" value="'+_rgTextChoice+'" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="rg-text-hint rg-text-status" oninput="rgSyncTextPicker(\'hex\')"></label>';
  h+='<button type="button" class="rg-highlight-clear" onmousedown="rgKeepHighlightSelection(event)" ontouchstart="rgKeepHighlightSelection(event)" onclick="rgApplyTextColor()">'+t('rg_ink_apply')+'</button>';
  h+='<button type="button" class="rg-highlight-clear" data-rg-ink-choice="auto" onmousedown="rgKeepHighlightSelection(event)" ontouchstart="rgKeepHighlightSelection(event)" onclick="rgApplyTextColor(\'auto\')">'+t('rg_ink_auto')+'</button>';
  h+='</div><p id="rg-text-hint" class="rg-highlight-hint">'+t('rg_ink_hint')+'</p>';
  h+='<p id="rg-text-status" class="rg-highlight-status" role="status" aria-live="polite" aria-atomic="true"></p></div>';
  return h;
}

let _rgHighlightRange=null, _rgHighlightEditor=null, _rgHighlightLeague=null;
let _rgHighlightListening=false;
function rgHighlightColor(value){
  let v=String(value||'').trim().toLowerCase();
  if(/^#[0-9a-f]{3}$/.test(v))v='#'+Array.from(v.slice(1),x=>x+x).join('');
  const rgb=/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
  if(rgb){const a=rgb.slice(1).map(Number);if(a.some(n=>n>255))return '';v='#'+a.map(n=>n.toString(16).padStart(2,'0')).join('');}
  return RG_HIGHLIGHT_COLORS.some(c=>c.value===v)?v:'';
}
function rgHighlightInside(range,ed){
  return !!(range&&ed&&ed.isConnected&&ed.contains(range.startContainer)&&ed.contains(range.endContainer));
}
function rgRememberHighlightRange(){
  const ed=document.getElementById('rg-editor');
  if(!ed||ed!==_rgHighlightEditor||String(_ligaActual)!==_rgHighlightLeague){_rgHighlightRange=null;return;}
  const sel=window.getSelection();
  if(!sel||!sel.rangeCount)return;
  const r=sel.getRangeAt(0);
  if(rgHighlightInside(r,ed)&&!r.collapsed){_rgHighlightRange=r.cloneRange();return;}
  // Keyboard focus moving to a toolbar button must not discard the saved range.
  // A new caret/selection in the editor or elsewhere invalidates the old one.
  if(document.activeElement?.closest('.rg-highlight-tools,.rg-text-tools'))return;
  _rgHighlightRange=null;
}
function rgKeepHighlightSelection(ev){
  rgRememberHighlightRange();
  if(ev.type==='mousedown')ev.preventDefault();
}
function rgHighlightStatus(key){
  const el=document.getElementById('rg-highlight-status');if(el)el.textContent=t(key);
}
function rgApplyHighlight(value){
  const ed=document.getElementById('rg-editor');
  if(!_rgEdit||_ligaReadOnly||!esAdmin(currentUser)||ed!==_rgHighlightEditor||String(_ligaActual)!==_rgHighlightLeague)return false;
  const colour=value==='none'?'transparent':rgHighlightColor(value);
  if(!colour)return false;
  rgRememberHighlightRange();
  const r=_rgHighlightRange;
  if(!rgHighlightInside(r,ed)||r.collapsed||!r.toString().trim()){rgHighlightStatus('rg_hl_select');return false;}
  const sel=window.getSelection();if(!sel)return false;
  // Keep the native editing/undo buffer used by the existing rich-text editor.
  // Do not fall back to backColor: some engines apply that command to a block.
  if(typeof document.execCommand!=='function'||(document.queryCommandSupported&&!document.queryCommandSupported('hiliteColor'))){rgHighlightStatus('rg_hl_unsupported');return false;}
  const top=ed.scrollTop;
  let css=false,changed=false;
  try{
    ed.focus({preventScroll:true});sel.removeAllRanges();sel.addRange(r);
    try{css=document.queryCommandState('styleWithCSS');}catch(_){}
    document.execCommand('styleWithCSS',false,true);
    changed=document.execCommand('hiliteColor',false,colour);
  }catch(_){changed=false;}
  finally{try{document.execCommand('styleWithCSS',false,css);}catch(_){}ed.scrollTop=top;}
  rgRefreshTextColors();rgRememberHighlightRange();
  rgHighlightStatus(changed?(value==='none'?'rg_hl_removed':'rg_hl_applied'):'rg_hl_unsupported');
  return changed;
}
function rgBindHighlightEditor(ed){
  _rgHighlightRange=null;_rgHighlightEditor=ed;_rgHighlightLeague=String(_ligaActual);
  if(!_rgHighlightListening){document.addEventListener('selectionchange',rgRememberHighlightRange);document.addEventListener('sohail-theme-change',rgQueueTextPaint);_rgHighlightListening=true;}
  if(ed){ed.addEventListener('input',rgQueueTextPaint);ed.addEventListener('keyup',rgRememberHighlightRange);ed.addEventListener('mouseup',rgRememberHighlightRange);ed.addEventListener('touchend',rgRememberHighlightRange);}
}
function renderReglamento(resetDraft=false){
  const cont=document.getElementById('view-reglamento');
  if(!cont)return;
  const admin=!_ligaReadOnly && esAdmin(currentUser);
  const vacio=!REGLAMENTO||!REGLAMENTO.trim();
  const oldEditor=cont.querySelector('#rg-editor');
  const sameLeague=cont.dataset.rgLeague===String(_ligaActual);
  const draft=!resetDraft&&_rgEdit&&admin&&sameLeague&&oldEditor?oldEditor.innerHTML:null;
  const draftTop=oldEditor&&sameLeague?oldEditor.scrollTop:0;
  const old=cont.querySelector('.rg-reader');
  const oldTop=old&&cont.dataset.rgLeague===String(_ligaActual)?old.scrollTop:0;
  let h='<div class="card rg-card">';
  h+='<div id="rg-title" class="section-lbl"><i class="ti ti-book"></i> '+t('rg_title')+'</div>';
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
    h+=rgTextToolbar();
    h+=' <div class="rg-highlight-tools" role="group" aria-labelledby="rg-highlight-label">';
    h+='<span id="rg-highlight-label" class="rg-highlight-label"><i class="ti ti-highlight" aria-hidden="true"></i> '+t('rg_hl_title')+'</span>';
    h+='<div class="rg-highlight-palette">';
    for(const c of RG_HIGHLIGHT_COLORS){
      const label=t('rg_hl_title')+': '+t(c.key);
      h+='<button type="button" class="rg-highlight-swatch" data-rg-colour="'+c.value+'" style="--rg-swatch:'+c.value+'" title="'+label+'" aria-label="'+label+'" aria-describedby="rg-highlight-hint" onmousedown="rgKeepHighlightSelection(event)" ontouchstart="rgKeepHighlightSelection(event)" onclick="rgApplyHighlight(this.dataset.rgColour)"><span aria-hidden="true">Aa</span></button>';
    }
    h+='</div><button type="button" class="rg-highlight-clear" data-rg-colour="none" onmousedown="rgKeepHighlightSelection(event)" ontouchstart="rgKeepHighlightSelection(event)" onclick="rgApplyHighlight(\'none\')">'+t('rg_hl_clear')+'</button>';
    h+='<p id="rg-highlight-hint" class="rg-highlight-hint">'+t('rg_hl_hint')+'</p>';
    h+='<p id="rg-highlight-status" class="rg-highlight-status" role="status" aria-live="polite" aria-atomic="true"></p></div>';
    h+='</div>';
    h+='<div id="rg-editor" class="rg-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="rg-title" data-ph="'+t('rg_placeholder')+'">'+sanitizarReglamento(draft!==null?draft:(REGLAMENTO||''))+'</div>';
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
      h+='<p id="rg-scroll-hint" class="rg-scroll-hint">'+t('rg_scroll_hint')+'</p>';
      h+='<div class="rg-reader" tabindex="0" role="region" aria-labelledby="rg-title" aria-describedby="rg-scroll-hint"><div class="rg-content">'+sanitizarReglamento(REGLAMENTO)+'</div></div>';   // sanitizado al vuelo (limpia contenido viejo)
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
  cont.dataset.rgLeague=String(_ligaActual);
  const reader=cont.querySelector('.rg-reader');if(reader)reader.scrollTop=oldTop;
  // Enganchar el pegado de imágenes en el editor.
  const ed=document.getElementById('rg-editor');
  rgBindHighlightEditor(ed);
  if(ed){ ed.addEventListener('paste', rgOnPaste);ed.scrollTop=draftTop; }
  rgRefreshTextColors();
}
// Comandos de formato (negrita, listas, etc.). onmousedown + preventDefault para
// no perder la selección del texto en el editor.
function rgCmd(ev, cmd){ ev.preventDefault(); document.execCommand(cmd,false,null); document.getElementById('rg-editor')?.focus();rgQueueTextPaint(); }
function rgSize(sel){ if(sel.value){ document.execCommand('fontSize',false,sel.value); sel.value=''; } document.getElementById('rg-editor')?.focus();rgQueueTextPaint(); }
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
  if(!ed||!_rgEdit||_ligaReadOnly||!esAdmin(currentUser))return;
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
        // Preserve only marker colours from our palette; never background images,
        // user supplied CSS, opacity, positioning, handlers or arbitrary colours.
        const bg=rgHighlightColor(n.style.getPropertyValue('background-color'));
        if(bg&&n.tagName!=='IMG')el.style.setProperty('background-color',bg);
        // Keep only opaque colours. UI-only derived ink and all data attributes
        // are deliberately regenerated, not trusted or persisted.
        const raw=n.style.getPropertyValue('color').trim().toLowerCase();
        const ink=rgTextColor(raw||(n.tagName==='FONT'?n.getAttribute('color'):''));
        if(n.tagName!=='IMG'&&(ink||raw==='initial'))el.style.setProperty('color',ink||'initial');
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
    renderReglamento(true);
    toast(t('rg_copied').replace('{n}',nombre));
  }catch(_){ alert(t('past_loading_err')); }
}
// Helper: URL de state para una liga específica (para copiar reglamento de liga activa).
