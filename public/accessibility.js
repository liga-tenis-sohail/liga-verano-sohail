// Diálogo existente: teclado, etiquetas y devolución de foco. Sin dependencias.
(function(){
 let previous=null;
 const root=document.getElementById('modal-bg');
 if(root){
  new MutationObserver(()=>{
   if(root.classList.contains('open')){
    if(!root._focusActive){previous=document.activeElement;root._focusActive=true;setTimeout(()=>{const d=root.querySelector('[role="dialog"]');if(d)d.focus();},0);}
   }else if(root._focusActive){root._focusActive=false;if(previous&&previous.isConnected)previous.focus();}
  }).observe(root,{attributes:true,attributeFilter:['class']});
  root.addEventListener('keydown',e=>{if(e.key==='Tab'&&typeof trapDialogFocus==='function')trapDialogFocus(e,root);if(e.key==='Escape'){e.preventDefault();closeM();}});
 }
 // Asociar etiquetas dentro de formularios legacy sin reescribir sus contenidos.
 const attach=()=>document.querySelectorAll('.form-group').forEach(g=>{
  const label=g.querySelector('label'),input=g.querySelector('input[id],select[id],textarea[id]');
  if(label&&input&&!label.htmlFor)label.htmlFor=input.id;
 });
 new MutationObserver(attach).observe(document.body,{childList:true,subtree:true});attach();
})();
