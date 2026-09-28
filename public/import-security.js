/* Sohail Security Part 3 — bounded import preflight. This is defense in depth;
 * it does not authenticate users or replace the server's import validation. */
(function(root){
 'use strict';
 const MAX_FILE=5*1024*1024,MAX_EXPANDED=64*1024*1024,MAX_ENTRY=16*1024*1024;
 const es=()=>typeof LANG==='undefined'||LANG!=='en';
 function fail(a,b){throw Object.assign(new Error(es()?a:b),{sohailImport:true});}
 function zip(bytes,collect=false){
  const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),d=new DataView(a.buffer,a.byteOffset,a.byteLength);
  const bad=()=>fail('El Excel tiene una estructura no admitida o excede los límites de seguridad.','The workbook has an unsupported structure or exceeds the security limits.');
  if(a.length<22||a.length>MAX_FILE)bad();
  let end=-1;
  for(let i=a.length-22;i>=Math.max(0,a.length-65557);i--)if(d.getUint32(i,true)===0x06054b50&&i+22+d.getUint16(i+20,true)===a.length){end=i;break;}
  if(end<0||d.getUint16(end+4,true)||d.getUint16(end+6,true))bad();
  const count=d.getUint16(end+10,true),size=d.getUint32(end+12,true),start=d.getUint32(end+16,true);
  if(count<1||count>3000||count!==d.getUint16(end+8,true)||start+size!==end)bad();
  let p=start,total=0;const names=new Set(),ranges=[],parts=[];
  for(let i=0;i<count;i++){
   if(p+46>end||d.getUint32(p,true)!==0x02014b50)bad();
   const flags=d.getUint16(p+8,true),method=d.getUint16(p+10,true),compressed=d.getUint32(p+20,true),expanded=d.getUint32(p+24,true),n=d.getUint16(p+28,true),extra=d.getUint16(p+30,true),comment=d.getUint16(p+32,true),offset=d.getUint32(p+42,true);
   if(p+46+n+extra+comment>end||n<1||n>512||flags&1||![0,8].includes(method)||expanded>MAX_ENTRY||compressed>MAX_FILE||d.getUint16(p+34,true)!==0)bad();
   const name=new TextDecoder('utf-8',{fatal:true}).decode(a.subarray(p+46,p+46+n));
   if(/[\\\u0000-\u001f]/.test(name)||name.startsWith('/')||name.includes(':')||name.split('/').some(x=>x==='..'||x==='.')||names.has(name))bad();
   if(/(?:vbaProject\.bin|macrosheets\/|externalLinks\/)/i.test(name))fail('No se admiten macros ni vínculos externos dentro del Excel.','Workbook macros and external workbook links are not supported.');
   if(offset+30>start||d.getUint32(offset,true)!==0x04034b50||d.getUint16(offset+6,true)!==flags||d.getUint16(offset+8,true)!==method)bad();
   const localN=d.getUint16(offset+26,true),localExtra=d.getUint16(offset+28,true),dataStart=offset+30+localN+localExtra;
   if(localN!==n||dataStart+compressed>start||dataStart>start)bad();
   for(let j=0;j<n;j++)if(a[offset+30+j]!==a[p+46+j])bad();
   if(method===0&&expanded!==compressed)bad();
   if(collect)parts.push({method,start:dataStart,size:compressed,expanded});
   total+=expanded;if(total>MAX_EXPANDED||expanded>Math.max(100000,compressed*1000))bad();
   ranges.push([offset,dataStart+compressed]);names.add(name);p+=46+n+extra+comment;
  }
  ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)if(ranges[i][0]<ranges[i-1][1])bad();
  if(p!==end||!names.has('[Content_Types].xml')||!names.has('xl/workbook.xml'))bad();
  return {entries:count,expandedBytes:total,...(collect?{parts}:{})};
 }
 async function verifyExpanded(bytes){
  const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),meta=zip(a,true);
  let total=0;
  for(const part of meta.parts){
   if(part.method===0){total+=part.size;continue;}
   let decoder;
   try{decoder=new DecompressionStream('deflate-raw');}catch(_){fail('Tu navegador no permite comprobar este Excel de forma segura. Actualizalo o usá otro navegador actualizado.','Your browser cannot safely check this workbook. Update it or use another current browser.');}
   const reader=new Blob([a.subarray(part.start,part.start+part.size)]).stream().pipeThrough(decoder).getReader();
   let size=0;
   try{
    for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;total+=chunk.value.byteLength;
     if(size>part.expanded||size>MAX_ENTRY||total>MAX_EXPANDED)throw new Error('limit');
    }
    if(size!==part.expanded)throw new Error('length');
   }catch(_){await reader.cancel().catch(()=>{});fail('El contenido expandido del Excel es inválido o supera los límites. No se importó.','The expanded workbook content is invalid or exceeds the limits. Nothing was imported.');}
   finally{reader.releaseLock();}
  }
  return {entries:meta.entries,expandedBytes:total};
 }
 async function file(file,allowJSON=false){
  if(!file||!Number.isFinite(file.size)||file.size<=0||file.size>MAX_FILE)fail('El archivo debe tener contenido y no superar 5 MB.','The file must not be empty or exceed 5 MB.');
  const name=String(file.name||'');
  if(allowJSON&&/\.json$/i.test(name))return {format:'json'};
  if(!/\.xlsx?$/i.test(name))fail('Usá un archivo .xlsx o .xls válido.','Use a valid .xlsx or .xls file.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(/\.xlsx$/i.test(name)){await verifyExpanded(bytes);return {format:'xlsx'};}
  // Legacy binary workbooks retain support, but are capped more tightly.
  const magic=[208,207,17,224,161,177,26,225];
  if(bytes.length>2*1024*1024||magic.some((b,i)=>bytes[i]!==b))fail('El formato .xls antiguo debe ser válido y no superar 2 MB. Convertí a .xlsx para archivos mayores.','Legacy .xls must be valid and no larger than 2 MB. Convert larger workbooks to .xlsx.');
  return {format:'xls'};
 }
 function workbook(wb){
  if(!wb||!Array.isArray(wb.SheetNames)||wb.SheetNames.length>100||wb.vbaraw)fail('Excel no admitido: revisá hojas y macros.','Unsupported workbook: check sheets and macros.');
  for(const name of wb.SheetNames){
   const s=wb.Sheets?.[name];if(!s)fail('Falta una hoja del Excel.','A workbook sheet is missing.');
   if(Object.keys(s).length>250000)fail('Una hoja excede 250.000 celdas.','A sheet exceeds 250,000 cells.');
   const range=String(s['!ref']||'A1'),m=/^\$?([A-Z]{1,3})\$?([1-9]\d*)(?::\$?([A-Z]{1,3})\$?([1-9]\d*))?$/.exec(range);
   const col=v=>[...v].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
   if(!m||Math.max(+m[2],+(m[4]||m[2]))>100000||Math.max(col(m[1]),col(m[3]||m[1]))>512)fail('El rango de una hoja es demasiado grande. No se importó parcialmente.','A sheet range is too large. No partial import was performed.');
  }
  return wb;
 }
 function protect(lib){
  if(!lib||lib.version!=='0.20.3'||typeof lib.read!=='function')fail('La versión de Excel no es la revisada. Recargá la página.','The Excel version is not the reviewed version. Reload the page.');
  if(lib.read.sohailBounded)return lib;
  const read=lib.read;
  lib.read=function(data,options={}){
   if(options.type==='array'){
    const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
    if(bytes.length>MAX_FILE)fail('El archivo supera 5 MB.','The file exceeds 5 MB.');
    if(bytes.length>=4&&bytes[0]===80&&bytes[1]===75)zip(bytes);
   }
   return workbook(read.call(this,data,{...options,bookVBA:false,bookDeps:false}));
  };
  lib.read.sohailBounded=true;return lib;
 }
 const api={MAX_FILE,MAX_EXPANDED,zip,verifyExpanded,file,workbook,protect};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.SohailImportSecurity=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis);
