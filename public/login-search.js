/* Sohail v4.1 — searchable username suggestions alongside the native dropdown.
 * Searches ONLY the public options already loaded by /api/users; no per-keypress
 * requests and no inferred person/account merges. Never submits a login itself.
 */
(function(root){
  'use strict';
  const normalize = value => String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().replace(/\s+/g, ' ');
  function search(entries, query, limit=8) {
    const q=normalize(query).slice(0,120);
    if(!q)return [];
    const tokens=q.split(' ');
    return entries.map((entry,index)=>{
      const label=normalize(entry.label),value=normalize(entry.value),hay=label+' '+value;
      const score=label===q||value===q?0:label.startsWith(q)||value.startsWith(q)?1:
        tokens.every(t=>hay.split(' ').some(w=>w.startsWith(t)))?2:3;
      return {entry,index,score,match:tokens.every(t=>hay.includes(t))};
    }).filter(r=>r.match).sort((a,b)=>a.score-b.score||a.index-b.index)
      .slice(0,Math.max(0,Math.min(20,limit))).map(r=>r.entry);
  }
  function exact(entries, query) {
    const raw=String(query||'').trim(),q=normalize(raw);
    if(!q)return null;
    const literal=entries.filter(e=>e.value===raw);
    if(literal.length===1)return literal[0];
    const matches=entries.filter(e=>normalize(e.label)===q||normalize(e.value)===q);
    return matches.length===1?matches[0]:null;
  }
  let controller=null;
  function mount(){
    if(controller)return controller;
    if(typeof document==='undefined')return null;
    const input=document.getElementById('login-user-search'),list=document.getElementById('login-user-suggestions'),
      select=document.getElementById('login-user'),status=document.getElementById('login-search-status');
    if(!input||!list||!select||!status)return null;
    let entries=[],shown=[],active=-1,editing=false,blurTimer;
    const text=(es,en)=>document.documentElement.lang==='en'?en:es;
    function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
    function translate(){
      document.getElementById('login-search-label').textContent=text('Buscá tu nombre','Search your name');
      input.placeholder=text('Escribí tu nombre o apellido…','Type your first or last name…');
      document.getElementById('login-search-help').textContent=text('Elegí una sugerencia o usá la lista completa de abajo.','Choose a suggestion or use the full list below.');
      list.setAttribute('aria-label',text('Sugerencias de usuarios','Username suggestions'));
    }
    function draw(){
      shown=search(entries,input.value);active=-1;list.replaceChildren();input.removeAttribute('aria-activedescendant');
      for(const [i,entry] of shown.entries()){
        const option=document.createElement('li');option.id='login-suggestion-'+i;option.setAttribute('role','option');
        option.setAttribute('aria-selected','false');option.textContent=entry.label;
        option.addEventListener('click',()=>choose(entry));list.append(option);
      }
      const hasQuery=!!normalize(input.value);
      list.hidden=!hasQuery||!shown.length;input.setAttribute('aria-expanded',String(!list.hidden));
      status.textContent=!hasQuery?'':shown.length?text('Sugerencias: ','Suggestions: ')+shown.length+
        (shown.length===8?text('. Escribí más letras para afinar.','. Type more letters to narrow the results.'):''):
        text('No hay coincidencias. Revisá el nombre o usá la lista.','No matches. Check the name or use the list.');
    }
    function choose(entry){
      if(!entries.some(e=>e.value===entry.value))return;
      select.value=entry.value;editing=false;input.value=entry.label;close();
      status.textContent=text('Usuario seleccionado: ','Selected user: ')+entry.label;
      select.dispatchEvent(new Event('change',{bubbles:true}));input.focus({preventScroll:true});
    }
    function changed(){
      editing=true;
      const match=exact(entries,input.value);select.value=match?match.value:'';
      draw();
    }
    function refresh(){
      entries=Array.from(select.options).filter(o=>o.value&&!o.disabled)
        .map(o=>({value:o.value,label:o.textContent||o.label||o.value}));
      translate();
      if(editing){const match=exact(entries,input.value);select.value=match?match.value:'';}
      else{const selected=entries.find(e=>e.value===select.value);input.value=selected?selected.label:'';}
      if(document.activeElement===input)draw();else close();
    }
    select.addEventListener('change',()=>{
      editing=false;const selected=entries.find(e=>e.value===select.value);
      input.value=selected?selected.label:'';close();status.textContent=selected?text('Usuario seleccionado: ','Selected user: ')+selected.label:'';
    });
    input.addEventListener('input',e=>{if(!e.isComposing)changed();});
    input.addEventListener('compositionend',changed);
    input.addEventListener('focus',()=>{clearTimeout(blurTimer);if(editing)draw();});
    input.addEventListener('blur',()=>{blurTimer=setTimeout(close,150);});
    list.addEventListener('mousedown',e=>e.preventDefault());
    input.addEventListener('keydown',e=>{
      if(e.isComposing)return;
      if(e.key==='Escape'){e.preventDefault();close();return;}
      if(e.key==='Tab'){close();return;}
      if(e.key==='Enter'){
        e.preventDefault();
        const chosen=active>=0&&!list.hidden?shown[active]:exact(entries,input.value);
        if(chosen)choose(chosen);
        return;
      }
      if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
      if(list.hidden)draw();if(!shown.length)return;e.preventDefault();
      active=e.key==='ArrowDown'?Math.min(shown.length-1,active+1):(active<0?shown.length-1:Math.max(0,active-1));
      Array.from(list.children).forEach((o,i)=>o.setAttribute('aria-selected',String(i===active)));
      const option=list.children[active];input.setAttribute('aria-activedescendant',option.id);
      // Only scroll the suggestion container; never move the whole login page.
      if(option.offsetTop<list.scrollTop)list.scrollTop=option.offsetTop;
      else if(option.offsetTop+option.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=option.offsetTop+option.offsetHeight-list.clientHeight;
    });
    if(typeof MutationObserver!=='undefined'){
      new MutationObserver(refresh).observe(select,{childList:true,subtree:true,characterData:true});
      new MutationObserver(()=>{translate();if(!list.hidden)draw();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    }
    controller={refresh,close};refresh();return controller;
  }
  const api={normalize,search,exact,mount,refresh:()=>mount()?.refresh()};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SohailLoginSearch=Object.freeze(api);
  if(typeof document!=='undefined')mount();
})(typeof window!=='undefined'?window:globalThis);
