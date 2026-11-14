/* Result import review. Only row drafts live here: no optimistic match mutation.
   New results are appended by the server, never by replacing the client state. */
(function(root){
 'use strict';
 const ENDPOINT='/api/liga?operacion=import-results',MAX_ROWS=1000,PAGE=8;
 let active=null;
 const F=()=>root.SohailFeedback;
 const amount=(n,singular,plural)=>n+' '+(n===1?singular:plural);
 const el=(tag,cls,text)=>F().el(tag,cls,text),button=(text,fn,primary)=>F().button(text,fn,primary);
 const stamp=()=>_saveSessionKey()+'|'+_ligaActual;
 const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[ _]+/g,' ');
 const ALIASES={cycle:['ciclo','cycle'],group:['grupo','group'],a:['jugador a','jugadora','player a'],b:['jugador b','jugadorb','player b'],score:['resultado','result','marcador'],club:['club'],date:['fecha','date'],type:['tipo','type','tipo de resultado']};
 function excelDate(value,lib,date1904){
  if(typeof value!=='number')return String(value??'').trim();
  if(!Number.isFinite(value)||value<0||(!date1904&&Math.floor(value)===60))return String(value);
  const d=lib.SSF?.parse_date_code(value,{date1904});
  return d&&d.y>=1900&&d.y<=9999?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:String(value);
 }
 function readRows(wb,lib){
  const names=wb?.SheetNames||[],exact=names.find(n=>norm(n)==='resultados'||norm(n)==='results'),name=exact||names.find(n=>/result/i.test(n))||names[0];
  const ws=wb?.Sheets?.[name];if(!ws)throw Error('El archivo no tiene una hoja de resultados legible.');
  const matrix=lib.utils.sheet_to_json(ws,{header:1,raw:true,defval:'',blankrows:true});
  const offset=lib.utils.decode_range(ws['!ref']||'A1').s.r;
  let header=-1,columns={};
  for(let i=0;i<Math.min(matrix.length,30);i++){
   const mapping={};for(const [field,aliases]of Object.entries(ALIASES)){
    const found=matrix[i].map((v,index)=>aliases.includes(norm(v))?index:-1).filter(n=>n>=0);
    if(found.length>1)throw Error('Hay columnas duplicadas para “'+field+'”. Usá la plantilla de resultados.');
    if(found.length)mapping[field]=found[0];
   }
   if(['cycle','group','a','b','score'].every(k=>k in mapping)){header=i;columns=mapping;break;}
  }
  if(header<0)throw Error('Faltan las columnas Ciclo, Grupo, Jugador A, Jugador B y Resultado. Usá la plantilla de resultados.');
  const date1904=!!wb.Workbook?.WBProps?.date1904,rows=[];let blank=0;
  for(let i=header+1;i<matrix.length;i++){
   const cells=matrix[i],row={rowId:'fila_'+(offset+i+1),line:offset+i+1,excluded:false};
   for(const field of Object.keys(ALIASES)){const v=cells[columns[field]];row[field]=field==='date'?excelDate(v,lib,date1904):String(v??'').trim();}
   if(Object.keys(ALIASES).every(k=>!row[k])){blank++;continue;}
   rows.push(row);if(rows.length>MAX_ROWS)throw Error('El archivo tiene más de '+MAX_ROWS+' filas con datos. Dividilo en varios archivos; no se importó parcialmente.');
  }
  if(!rows.length)throw Error('La hoja no contiene partidos para importar.');
  return {rows,blank,sheet:name};
 }
 async function request(ctx,body,writing=false){
  assertContext(ctx);
  let result;
  try{result=await root.SohailRequest.json(root.fetch,ENDPOINT,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({ligaId:ctx.league,...body})},{timeout:30000});}
  catch(e){throw Object.assign(Error(writing?'No se confirmó el guardado. La conexión se interrumpió o venció el tiempo de espera. Comprobá el servidor antes de reintentar.':'No se pudo revisar el archivo en el servidor. Revisá la conexión y volvé a intentar.'),{code:e.code||'NETWORK_ERROR',uncertain:writing});}
  const {response,data}=result;
  if(!response.ok)throw Object.assign(Error(data.error||'El servidor rechazó la operación.'),{code:data.code||'HTTP_'+response.status,requestId:data.requestId,status:response.status,uncertain:writing&&(response.status>=500||response.status===408)});
  if(data.ok!==true||!Number.isSafeInteger(data.version)||!Array.isArray(data.rows)||!data.counts)throw Object.assign(Error('La respuesta del servidor está incompleta. No se confirmó esta operación.'),{code:'INVALID_RESPONSE',uncertain:writing});
  if(ctx.key!==stamp())throw Object.assign(Error('Cambió la sesión o la liga. No se aplicó esta respuesta a la pantalla; recargá para comprobar los datos.'),{code:'CONTEXT_CHANGED',uncertain:writing,contextChanged:true});
  return data;
 }
 function assertContext(ctx){
  if(ctx.key!==stamp()||!_token||!esAdmin(currentUser))throw Object.assign(Error('Cambió la sesión, la liga o tu permiso. Cerrá y volvé a abrir la importación.'),{code:'CONTEXT_CHANGED'});
  if(_serialize()!==ctx.baseline)throw Object.assign(Error('Hay cambios locales ajenos a esta importación. Exportalos y recargá antes de continuar.'),{code:'LOCAL_CHANGES'});
 }
 function payload(ctx){return ctx.rows.filter(r=>!ctx.saved.has(r.rowId)).map(r=>({...r}));}
 function counts(ctx){const rows=ctx.review?.rows||[];return {saved:ctx.saved.size,valid:rows.filter(r=>r.status==='valid').length,invalid:rows.filter(r=>r.status==='invalid').length,omitted:rows.filter(r=>r.status==='omitted').length,excluded:rows.filter(r=>r.status==='excluded').length};}
 function markDirty(ctx){ctx.dirty=true;ctx.digest=null;if(ctx.saveButton)ctx.saveButton.disabled=true;if(ctx.reviewButton)ctx.reviewButton.textContent='Validar correcciones';ctx.d.status.textContent='Hay correcciones sin validar. Pulsá “Validar correcciones” antes de guardar.';}
 function selectField(ctx,card,row,field,label,values){
  const wrap=el('label','sir-field',label),input=el('select');input.dataset.field=field;input.dataset.row=row.rowId;input.setAttribute('aria-label','Fila '+row.line+' · '+label);
  const all=[['','Seleccionar…'],...values.map(v=>Array.isArray(v)?v:[v,v])];
  if(row[field]&&!all.some(([v])=>String(v)===String(row[field])))all.splice(1,0,[row[field],row[field]+' (revisar)']);
  for(const [v,text]of all){const op=el('option','',text);op.value=String(v);input.append(op);}input.value=String(row[field]||'');
  input.addEventListener('change',()=>{row[field]=input.value;markDirty(ctx);if(['cycle','group'].includes(field))render(ctx);});wrap.append(input);card.append(wrap);return input;
 }
 function textField(ctx,card,row,field,label,placeholder){
  const wrap=el('label','sir-field',label),input=el('input');input.type='text';input.value=row[field]||'';input.placeholder=placeholder||'';input.maxLength=300;input.autocomplete='off';input.dataset.field=field;input.dataset.row=row.rowId;input.setAttribute('aria-label','Fila '+row.line+' · '+label);
  input.addEventListener('input',()=>{row[field]=input.value;markDirty(ctx);});wrap.append(input);card.append(wrap);
 }
 function editCard(ctx,item){
  const row=ctx.rows.find(r=>r.rowId===item.rowId),card=el('section','sir-card');card.dataset.status=item.status;card.dataset.row=row.rowId;
  card.append(el('h3','','Fila '+row.line+' · '+(row.a||'Jugador A')+' / '+(row.b||'Jugador B')),el('p',item.status==='invalid'?'sop-error':'sop-help',item.reason));
  const fields=el('div','sir-fields'),opts=ctx.review.options||ctx.options||{cycles:[],clubs:[]};
  selectField(ctx,fields,row,'cycle','Ciclo',opts.cycles.map(c=>[String(c.n),'Ciclo '+c.n+' · '+({active:'abierto',finished:'cerrado',locked:'bloqueado'}[c.status]||c.status)]));
  const cycle=opts.cycles.find(c=>c.n===Number(row.cycle));
  selectField(ctx,fields,row,'group','Grupo',(cycle?.groups||[]).map(g=>[String(g.id),'Grupo '+g.id]));
  const players=cycle?.groups.find(g=>g.id===Number(row.group))?.players||[];
  selectField(ctx,fields,row,'a','Jugador A',players);selectField(ctx,fields,row,'b','Jugador B',players);
  textField(ctx,fields,row,'score','Resultado','6-3 6-4');selectField(ctx,fields,row,'club','Club',opts.clubs);
  textField(ctx,fields,row,'date','Fecha','DD/MM/AAAA');
  if(row.type)selectField(ctx,fields,row,'type','Tipo de resultado',[['normal','Partido jugado (marcador completo)']]);
  card.append(fields);
  const label=el('label','sir-check'),check=el('input');check.type='checkbox';check.checked=!!row.excluded;check.setAttribute('aria-label','Excluir fila '+row.line);
  check.addEventListener('change',()=>{row.excluded=check.checked;markDirty(ctx);});label.append(check,el('span','','Excluir esta fila de la importación'));card.append(label);return card;
 }
 function list(ctx,items,label){
  if(!items.length)return;
  const details=el('details','sir-review-list'),summary=el('summary','',label+' ('+items.length+')');details.append(summary);
  // Limit DOM size, but include every row in the downloadable review report.
  for(const item of items.slice(0,60)){const r=item.row;details.append(el('p','','Fila '+item.line+' · C'+r.cycle+' / G'+r.group+' · '+r.a+' / '+r.b+' · '+r.score+' · '+r.club+' · '+r.date+' — '+item.reason));}
  if(items.length>60)details.append(el('p','sop-help','Mostrando 60 filas. El informe descargable incluye todas.'));
  ctx.d.body.append(details);
 }
 function render(ctx){
  const d=ctx.d;if(d.closed)return;d.body.replaceChildren();d.foot.replaceChildren();
  const c=counts(ctx),summary=el('p','sir-summary',[amount(c.saved,'partido guardado y validado','partidos guardados y validados'),amount(c.valid,'nuevo válido por guardar','nuevos válidos por guardar'),amount(c.invalid,'inválido','inválidos'),amount(c.omitted,'omitido','omitidos'),amount(c.excluded,'excluido','excluidos')].join(' · '));summary.setAttribute('role','status');d.body.append(summary);
  d.body.append(el('p','sop-help','Solo se añaden partidos nuevos. Nunca se reemplazan resultados existentes, aunque cambie el marcador del Excel. Los ciclos cerrados no se reabren.'));
  if(ctx.filename)d.body.append(el('p','sop-help',ctx.filename+' · Hoja '+ctx.sheet+(ctx.blank?' · '+ctx.blank+' filas vacías ignoradas.':'')));
  if(ctx.error)d.body.append(el('p','sop-error',ctx.error));
  const editable=(ctx.review?.rows||[]).filter(r=>['invalid','excluded'].includes(r.status));
  if(editable.length){
   d.body.append(el('h3','','Corregir filas inválidas'));
   ctx.page=Math.min(ctx.page,Math.max(0,Math.ceil(editable.length/PAGE)-1));
   for(const item of editable.slice(ctx.page*PAGE,(ctx.page+1)*PAGE))d.body.append(editCard(ctx,item));
   if(editable.length>PAGE){const nav=el('div','sir-page'),prev=button('Anteriores',()=>{ctx.page--;render(ctx);}),next=button('Siguientes',()=>{ctx.page++;render(ctx);});prev.disabled=ctx.page===0;next.disabled=(ctx.page+1)*PAGE>=editable.length;nav.append(prev,el('span','','Página '+(ctx.page+1)+' de '+Math.ceil(editable.length/PAGE)),next);d.body.append(nav);}
  }
  list(ctx,(ctx.review?.rows||[]).filter(r=>r.status==='valid'),'Revisar nuevos resultados válidos');
  list(ctx,(ctx.review?.rows||[]).filter(r=>r.status==='omitted'),'Partidos omitidos — no se modifican');
  d.foot.append(button(c.saved?'Cerrar revisión':'Cancelar importación',()=>cancel(ctx)));
  d.foot.append(button('Descargar informe',()=>download(ctx)));
  if(ctx.uncertain||ctx.mustRefresh)d.foot.append(button('Comprobar en servidor',()=>recover(ctx),true));
  else if(payload(ctx).length){
   ctx.reviewButton=button(ctx.dirty?'Validar correcciones':'Revisar de nuevo',()=>preview(ctx));d.foot.append(ctx.reviewButton);
   ctx.saveButton=button('Guardar '+amount(c.valid,'nuevo','nuevos')+(c.invalid?' (dejar '+amount(c.invalid,'inválido','inválidos')+')':''),()=>commit(ctx),true);
   ctx.saveButton.disabled=ctx.dirty||!ctx.digest||c.valid===0;d.foot.append(ctx.saveButton);
  }
  if(ctx.dirty)d.status.textContent='Hay correcciones pendientes de validar. No se guardaron esas correcciones.';
 }
 function download(ctx){
  const report={tipo:'SOHAIL_RESULT_IMPORT_REVIEW',fecha:new Date().toISOString(),archivo:ctx.filename,liga:ctx.league,conteo:counts(ctx),guardadoSinConfirmar:!!ctx.uncertain,filas:ctx.rows.map(r=>({...r,guardado:ctx.saved.has(r.rowId),revision:(ctx.review?.rows||[]).find(x=>x.rowId===r.rowId)?.reason||''}))};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='sohail-informe-importacion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function cancel(ctx){
  if((ctx.dirty||counts(ctx).valid||counts(ctx).invalid||ctx.uncertain)&&!root.confirm('¿Cerrar la revisión? Las filas sin guardar se descartarán de esta pantalla. Los resultados ya guardados no se revierten. Podés descargar el informe antes de salir.'))return;
  ctx.d.close();
 }
 function error(ctx,e,writing){
  ctx.error=(e.message||'No se pudo completar la operación.')+(e.code?'\nCódigo: '+e.code:'')+(e.requestId?'\nReferencia: '+e.requestId:'');ctx.digest=null;
  if(writing&&e.uncertain){ctx.uncertain=true;if(ctx.key===stamp())_saveUnconfirmed=true;}
  if(e.code==='LOCAL_CHANGES'||e.code==='CONTEXT_CHANGED')ctx.mustRefresh=true;
  ctx.d.busy(false);render(ctx);ctx.d.status.textContent=writing?'No se anunció éxito ni se agregaron resultados en memoria. Revisá el motivo antes de continuar.':'La revisión no se completó. Corregí el problema o cancelá.';
 }
 async function preview(ctx){
  if(ctx.busy||ctx.d.closed)return;ctx.busy=true;ctx.d.busy(true);ctx.d.status.textContent='Validando cada fila en el servidor…';ctx.error='';
  try{const data=await request(ctx,{mode:'preview',rows:payload(ctx)});ctx.review=data;ctx.options=data.options;ctx.version=data.version;ctx.digest=data.digest;ctx.dirty=false;ctx.page=0;ctx.d.busy(false);render(ctx);ctx.d.status.textContent='Revisión terminada. Los nuevos resultados todavía no están guardados. Corregí los inválidos o guardá solo los válidos.';}
  catch(e){error(ctx,e,false);}finally{ctx.busy=false;}
 }
 function applyState(ctx,data){
  assertContext(ctx);
  if(!root.SohailRequest.stateValid(data.state)||data.state._v!==data.version)throw Object.assign(Error('El guardado respondió, pero el estado de la liga está incompleto. Comprobalo en el servidor.'),{code:'INVALID_STATE_RESPONSE',uncertain:true});
  _loadOK=false;
  if(!_hydrate(data.state))throw Object.assign(Error('No se pudo mostrar el estado confirmado. Recargá antes de volver a editar.'),{code:'HYDRATE_FAILED',uncertain:true});
  if(data.token)_token=data.token;_lastSaved=_serialize();ctx.baseline=_lastSaved;_saveConflict=false;_saveUnconfirmed=false;_unconfirmedAttempt=null;_lastSaveError='';_loadOK=true;_hideLoadError();
 }
 async function commit(ctx){
  if(ctx.busy||ctx.dirty||!ctx.digest||ctx.uncertain||ctx.d.closed)return;
  const expected=counts(ctx).valid;if(!expected)return;
  ctx.busy=true;ctx.d.busy(true);ctx.d.status.textContent='Guardando '+expected+' resultados nuevos. No se mostrará éxito hasta la confirmación del servidor.';ctx.error='';
  try{
   const data=await request(ctx,{mode:'commit',rows:payload(ctx),expectedVersion:ctx.version,digest:ctx.digest},true);
   const saved=data.rows.filter(r=>r.status==='saved');
   if(data.counts.saved!==saved.length||saved.length!==expected||data.version!==ctx.version+1)throw Object.assign(Error('La confirmación no coincide con el lote revisado. Comprobá el servidor antes de continuar.'),{code:'INVALID_RECEIPT',uncertain:true});
   applyState(ctx,data);for(const row of saved)ctx.saved.add(row.rowId);
   ctx.review={...data,options:ctx.options};ctx.version=data.version;ctx.digest=null;ctx.dirty=false;
   ctx.d.busy(false);render(ctx);const c=counts(ctx);ctx.d.status.textContent=[amount(c.saved,'partido guardado y validado','partidos guardados y validados'),amount(c.invalid,'inválido pendiente','inválidos pendientes'),amount(c.omitted,'omitido','omitidos')].join(' · ')+'. Podés corregir los inválidos y guardarlos como nuevos, sin repetir los anteriores.';
   try{if(typeof refreshAll==='function')refreshAll();root.dispatchEvent(new Event('sohail-data-saved'));}catch(_){ctx.d.status.textContent+=' Cerrá y recargá para actualizar la tabla.';}
   if(typeof RATING_ON!=='undefined'&&RATING_ON&&typeof calcularRatingGlobal==='function')Promise.resolve(calcularRatingGlobal(true)).catch(()=>{if(!ctx.d.closed)ctx.d.status.textContent+=' Los partidos están guardados, pero no se pudo actualizar el rating. Recargá para comprobarlo.';});
  }catch(e){error(ctx,e,true);}finally{ctx.busy=false;}
 }
 async function recover(ctx){
  if(ctx.busy||ctx.d.closed)return;ctx.busy=true;ctx.d.busy(true);
  try{
   if(ctx.key!==stamp())throw Error('La sesión o la liga cambió. Cerrá esta revisión y volvé a entrar.');
   if(_serialize()!==ctx.baseline)throw Error('Hay otros cambios locales. Exportalos antes de recargar; no se sobrescriben desde esta revisión.');
   const {response,data}=await root.SohailRequest.json(root.fetch,'/api/state?liga='+encodeURIComponent(ctx.league),{headers:{Authorization:'Bearer '+_token},cache:'no-store'},{timeout:15000});
   if(!response.ok||!root.SohailRequest.stateValid(data.state))throw Error(data.error||'No se pudo leer el estado confirmado de la liga.');
   applyState(ctx,{state:data.state,version:data.state._v,token:data.token});ctx.uncertain=false;ctx.mustRefresh=false;ctx.error='';
   ctx.d.busy(false);ctx.busy=false;await preview(ctx);
   ctx.d.status.textContent='Se volvió a leer la liga. Los partidos que ya existen se omiten; los restantes requieren una nueva confirmación para guardarse.';
  }catch(e){error(ctx,e,false);}finally{ctx.busy=false;}
 }
 async function start(input){
  const file=input?.files?.[0];if(!file)return;
  if(active){active.d.dialog.focus();input.value='';return;}
  let ctx;
  try{
   if(!currentUser||!esAdmin(currentUser))throw Error('Solo un administrador puede importar resultados.');
   if(typeof isTutorialRunning==='function'&&isTutorialRunning())throw Error('Salí del tutorial antes de importar resultados reales.');
   const key=stamp();if(_saveInFlight)await _saveInFlight;
   if(key!==stamp())throw Error('La sesión o la liga cambió. Seleccioná el archivo de nuevo.');
   if(_dataOperationBusy)throw Error('Hay otra operación abierta. Cerrala antes de importar resultados.');
   if(!_loadOK||!_token||_ligaReadOnly||_saveConflict||_saveUnconfirmed)throw Error('Primero resolvé el estado de la sesión o los guardados pendientes. Recargá y comprobá la liga.');
   if(_lastSaved===null||_serialize()!==_lastSaved)throw Error('Hay cambios locales pendientes. Guardalos o descartalos antes de empezar la importación; no se guardan automáticamente al abrirla.');
   ctx={key,league:_ligaActual,baseline:_serialize(),rows:[],saved:new Set(),review:null,version:null,digest:null,dirty:false,page:0,filename:file.name,busy:true,blank:0,sheet:''};
   ctx.d=F().dialog('Importar resultados · revisar y corregir');active=ctx;_dataOperationBusy=true;
   const unload=e=>{if(ctx.rows.length&&!ctx.d.closed){e.preventDefault();e.returnValue='';}};root.addEventListener('beforeunload',unload);
   ctx.d.onClose=()=>{root.removeEventListener('beforeunload',unload);if(active===ctx){active=null;_dataOperationBusy=false;}};
   // Escape uses the same discard confirmation as the Cancel button.
   ctx.d.dialog.addEventListener('cancel',e=>{e.preventDefault();e.stopImmediatePropagation();if(!ctx.busy)cancel(ctx);},true);
   ctx.d.busy(true);ctx.d.status.textContent='Comprobando el archivo y preparando la revisión…';
   await root.SohailImportSecurity.file(file,false);assertContext(ctx);
   const lib=await root.SohailExcel.ensure();root.SohailImportSecurity.protect(lib);assertContext(ctx);
   const wb=lib.read(new Uint8Array(await file.arrayBuffer()),{type:'array'});Object.assign(ctx,readRows(wb,lib));assertContext(ctx);
   ctx.busy=false;await preview(ctx);
  }catch(e){if(ctx){ctx.busy=false;error(ctx,e,false);}else F().report(e.message,{title:'No se inició la importación',force:true});}
  finally{if(input)input.value='';}
 }
 start.sohailExcelLoader=true; // This function runs the existing secure loader itself.
 root.importarResultadosExcel=start;
 root.SohailResultsImport=Object.freeze({start,readRows,excelDate,MAX_ROWS});
})(typeof window!=='undefined'?window:globalThis);
