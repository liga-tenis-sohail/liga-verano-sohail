/* Sohail v4.0 — explicit, previewed data operations. Nothing is hydrated before commit. */
(function(root){
 'use strict';
 let held=false;
 const es=()=>typeof LANG==='undefined'||LANG!=='en';
 const text=(a,b)=>es()?a:b;
 const el=(tag,cls,copy)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(copy!==undefined)n.textContent=String(copy);return n;};
 const button=(copy,fn,primary=false)=>{const b=el('button','btn'+(primary?' btn-primary':''),copy);b.type='button';b.addEventListener('click',fn);return b;};
 const stamp=()=>_saveSessionKey()+'|'+_ligaActual;
 async function begin(){
  if(held)throw Error(text('Ya hay una operación abierta.','Another operation is open.'));
  held=true;const key=stamp();
  try{
   if(_saveInFlight)await _saveInFlight;
   if(key!==stamp())throw Error(text('La sesión o la liga cambió.','The session or league changed.'));
   if(!_ligaReadOnly&&_loadOK&&_lastSaved&&_serialize()!==_lastSaved){
    if(!await _criticalSave())throw Error(text('Primero resolvé los cambios pendientes. No se inició la operación.','Resolve pending changes before starting this operation.'));
   }
   if(key!==stamp())throw Error(text('La sesión o la liga cambió.','The session or league changed.'));
   _dataOperationBusy=true;
   return {ligaId:_ligaActual,key,valid:()=>key===stamp()};
  }catch(e){held=false;throw e;}
 }
 function end(){held=false;_dataOperationBusy=false;}
 async function post(url,body,ctx){
  if(ctx&&!ctx.valid())throw Error(text('La liga o la sesión cambió. Cerrá y volvé a abrir la revisión.','League or session changed. Reopen the review.'));
  let r;
  try{r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(30000)});}catch(_){const e=Error(text('No se pudo confirmar la respuesta del servidor.','The server response could not be confirmed.'));e.uncertain=true;throw e;}
  const d=await r.json().catch(()=>null);
  if(!d){const e=Error(text('El servidor devolvió una respuesta incompleta.','The server returned an incomplete response.'));e.uncertain=true;throw e;}
  if(!r.ok){const e=Error(d.error||text('La operación no se completó.','The operation did not complete.'));e.code=d.code;e.status=r.status;if(r.status>=500)e.uncertain=true;throw e;}
  if(ctx&&!ctx.valid())throw Error(text('La operación respondió para otra sesión. Recargá para comprobar el estado.','The response belongs to another session. Reload to check the state.'));
  return d;
 }
 function modal(title){
  const previous=document.activeElement,overlay=el('div','dup-overlay'),dialog=el('section','dup-dialog');
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.tabIndex=-1;
  const head=el('header','dup-head'),h=el('h2','',title);h.id='data-operation-title';dialog.setAttribute('aria-labelledby',h.id);head.append(h);
  const body=el('div','dup-body'),status=el('p','dup-status'),foot=el('footer','dup-footer');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  dialog.append(head,body,status,foot);overlay.append(dialog);document.body.append(overlay);
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';let closed=false,busy=false;
  let onClose=()=>{};
  function close(){if(busy||closed)return;closed=true;overlay.remove();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});onClose();}
  const cancel=button(text('Cerrar sin cambios','Close without changes'),close);foot.append(cancel);
  overlay.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
   if(e.key==='Tab'){
    const nodes=[...dialog.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(n=>n.getClientRects().length);
    const a=nodes[0],z=nodes.at(-1);
    if(!a){e.preventDefault();dialog.focus();}else if(e.shiftKey&&(document.activeElement===a||document.activeElement===dialog)){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}
   }
  });
  dialog.focus();
  return {body,foot,status,dialog,close,get closed(){return closed;},set onClose(fn){onClose=fn;},busy(value){busy=value;dialog.setAttribute('aria-busy',String(value));dialog.querySelectorAll('button,input,select,textarea').forEach(n=>{n.disabled=value;});},title(value){h.textContent=value;}};
 }
 function uncertain(){_saveConflict=true;_showLoadError(text('No se confirmó la operación. Recargá los datos antes de volver a editar o reintentar.','Operation status is uncertain. Reload before editing or retrying.'));}
 async function committed(url,payload,ctx){
  try{return await post(url,payload,ctx);}catch(e){
   if(!e.uncertain)throw e;
   try{const s=await post(url,{mode:'status',ligaId:ctx.ligaId,operationId:payload.operationId},ctx);if(s.committed)return s;}catch(_){}
   uncertain();throw e;
  }
 }
 function applied(dialog,result){
  // Reload the confirmed state, rather than the untrusted file or local plan.
  _loadOK=false;
  dialog.busy(false);dialog.title(text('Operación guardada','Operation saved'));
  dialog.status.textContent=text('Guardada y confirmada por el servidor.','Saved and confirmed by the server.');
  dialog.body.replaceChildren(el('p','dup-summary',text('Se guardó la operación completa.','The complete operation was saved.')),el('p','dup-help',text('Referencia: ','Reference: ')+result.operationId),el('p','dup-help',text('Recargá para ver los datos confirmados. Hasta entonces no se enviarán cambios automáticos.','Reload to view confirmed data. Automatic saves are paused until then.')));
  dialog.foot.replaceChildren(button(text('Recargar datos','Reload data'),()=>location.reload(),true));
  dialog.onClose=()=>{end();location.reload();};
 }
 function decodeWorkbook(wb,XLSX){
  const ws=wb?.Sheets?._LIGA_BACKUP;if(!ws)throw Error(text('El Excel no tiene la hoja _LIGA_BACKUP.','The workbook has no _LIGA_BACKUP sheet.'));
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
  if(rows[0]?.[0]!=='LIGA_SOHAIL_BACKUP_V1')throw Error(text('El Excel no tiene el marcador de backup de la liga.','The workbook has no league backup marker.'));
  const json=rows.slice(1).map(r=>String(r[0]||'')).join('');
  if(json.length>3*1024*1024)throw Error(text('El contenido del backup supera el límite de 3 MB.','Backup content exceeds the 3 MB limit.'));
  return JSON.parse(json);
 }
 async function restore(input){
  const file=input.files?.[0];if(!file)return;
  if(!currentUser||!esAdmin(currentUser)){toast(text('Solo el administrador o superadministrador puede restaurar.','An administrator is required to restore.'));input.value='';return;}
  let ctx,d;
  try{
   if(file.size>5*1024*1024)throw Error(text('El archivo supera 5 MB.','The file exceeds 5 MB.'));
   ctx=await begin();d=modal(text('Restaurar backup · Vista previa','Restore backup · Preview'));d.onClose=end;
   d.status.textContent=text('Leyendo y validando el archivo…','Reading and validating the file…');
   const state=/\.xlsx?$/i.test(file.name)?decodeWorkbook(XLSX.read(new Uint8Array(await file.arrayBuffer()),{type:'array'}),XLSX):JSON.parse(await file.text());
   if(d.closed)return;
   const preview=await post('/api/liga?operacion=restore',{mode:'preview',ligaId:ctx.ligaId,state},ctx);if(d.closed)return;
   const s=preview.summary;
   d.body.append(el('p','dup-summary',text('Destino: ','Destination: ')+preview.targetName),el('p','dup-help',text('Archivo: ','Archive: ')+preview.archiveName),el('p','dup-summary',`${s.players} ${text('jugadores','players')} · ${s.cycles} ${text('ciclos','cycles')} · ${s.matches} ${text('partidos','matches')}`),el('p','dup-help',`${s.groups} ${text('de grupos','group matches')} · ${s.playoffs} ${text('de playoffs','playoff matches')}`));
   d.body.append(el('p','dup-warning',text('Esto REEMPLAZA la competición de destino, no las otras ligas. Se guardará una copia previa en el servidor dentro de la misma operación. Las credenciales vigentes no se toman del Excel.','This REPLACES the target competition, not other leagues. A prior snapshot is saved in the same transaction. Live credentials are not imported from Excel.')));
   for(const w of preview.warnings)d.body.append(el('p','dup-help',w.text));
   d.status.textContent=text('Todavía no se modificó ningún dato.','No data has been changed.');
   const confirm=button(text('Confirmar restauración','Confirm restore'),async()=>{
    if(d.closed)return;d.busy(true);d.status.textContent=text('Guardando la restauración… No cierres esta ventana.','Saving the restore… Keep this window open.');
    try{
     const result=await committed('/api/liga?operacion=restore',{mode:'commit',ligaId:ctx.ligaId,state,digest:preview.digest,operationId:crypto.randomUUID()},ctx);
     applied(d,result);
    }catch(e){d.busy(false);d.status.textContent=e.message;confirm.disabled=true;}
   },true);d.foot.append(confirm);
  }catch(e){if(d&&!d.closed){d.status.textContent=e.message;}else{end();toast(text('No se inició la restauración: ','Restore did not start: ')+e.message);}}
  finally{input.value='';}
 }
 root.SohailDataUI=Object.freeze({text,el,button,begin,end,post,modal,committed,applied});
 root.SohailRestore=Object.freeze({start:restore,decodeWorkbook});
})(typeof window!=='undefined'?window:globalThis);
