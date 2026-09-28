/* v5.1 — explicit cleanup, never on installation. Exported original must be retained independently. */
(function(root){
 'use strict';
 const en=()=>typeof LANG!=='undefined'&&LANG==='en',t=(a,b)=>en()?b:a;
 const el=(tag,txt)=>{const x=document.createElement(tag);if(txt!==undefined)x.textContent=txt;return x;};
 const button=(txt,fn)=>{const b=el('button',txt);b.type='button';b.className='btn';b.onclick=fn;return b;};
 async function request(body){
  const token=_token,league=_ligaActual,person=currentUser?.key||currentUser?.name;
  const response=await fetch('/api/liga?operacion=storage',{method:'POST',headers:{'Content-Type':'application/json','Accept-Language':en()?'en':'es',Authorization:'Bearer '+token},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)});
  const d=await response.json();if(league!==_ligaActual||!currentUser||person!==(currentUser.key||currentUser.name))throw Error(t('La sesión o liga cambió.','The session or league changed.'));
  if(!response.ok)throw Error(typeof apiError==='function'?apiError(d):d.error||t('No se pudo completar.','The operation failed.'));return d;
 }
 async function open(){
  if(!currentUser||!esAdmin(currentUser)||_ligaReadOnly)return;
  const dlg=el('dialog');dlg.className='ui-picker storage-review';
  const head=el('div');head.className='ui-picker-head';head.append(el('h2',t('Espacio y reglamentos anteriores','Storage and archived rules')),button(t('Cerrar','Close'),()=>dlg.close()));
  const note=el('p',t('Solo ligas finalizadas. Primero descargá y comprobá la copia. No se borran partidos, puntos ni jugadores. Los bytes indicados son contenido JSON, no espacio físico garantizado.','Finalized leagues only. Download and check the archive first. Matches, points and players are preserved. Byte counts refer to JSON content, not guaranteed physical disk savings.'));note.className='ui-muted';
  const status=el('p',t('Leyendo…','Loading…'));status.setAttribute('role','status');const list=el('div');list.className='ui-picker-list';dlg.append(head,note,status,list);document.body.append(dlg);dlg.addEventListener('close',()=>dlg.remove(),{once:true});dlg.showModal();
  try{
   const data=await request({mode:'report'});if(!dlg.isConnected)return;status.textContent=data.leagues.length?'':t('No hay ligas finalizadas administrables.','No manageable finalized leagues.');
   for(const league of data.leagues){
    const card=el('section');card.className='card';card.append(el('strong',league.name),el('p',`${(league.bytes/1024).toFixed(1)} KiB · ${league.images} `+t('imágenes incrustadas','embedded images')));
    let archive=null,busy=false;
    const mode=el('select');mode.className='cl-inp';mode.setAttribute('aria-label',t('Tipo de limpieza','Cleanup type'));
    for(const [value,label]of [['images',t('Quitar imágenes; conservar texto','Remove images; keep text')],['all',t('Retirar todo el reglamento','Remove all rules content')]]){const o=el('option',label);o.value=value;mode.append(o);}
    const confirm=el('label');const check=el('input');check.type='checkbox';check.disabled=true;confirm.append(check,document.createTextNode(' '+t('Verifiqué el archivo descargado y guardé una copia.','I checked the downloaded archive and saved a copy.')));
    const msg=el('p');msg.setAttribute('role','status');
    const clean=button(t('Limpiar liga seleccionada','Clean selected league'),async()=>{
     if(busy||!check.checked||!archive)return;
     if(!window.confirm(t('Esta acción retira el contenido seleccionado de la liga finalizada. ¿Continuar?','This removes the selected content from the finalized league. Continue?')))return;
     busy=true;clean.disabled=true;download.disabled=true;
     try{const d=await request({mode:'clean',league:league.id,version:archive.version,digest:archive.digest,kind:mode.value});if(!dlg.isConnected)return;msg.textContent=t('Contenido reducido: ','Content reduced: ')+(d.savedBytes/1024).toFixed(1)+' KiB';archive=null;check.checked=false;check.disabled=true;}
     catch(e){msg.textContent=e.message;}finally{busy=false;download.disabled=false;clean.disabled=!check.checked;}
    });clean.disabled=true;check.onchange=()=>{clean.disabled=!check.checked;};
    const download=button(t('1. Descargar reglamento original','1. Download original rules'),async()=>{
     if(busy)return;busy=true;download.disabled=true;clean.disabled=true;
     try{const d=await request({mode:'export',league:league.id});if(!dlg.isConnected)return;
      const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='reglamento-'+league.id+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
      archive=d;check.disabled=false;msg.textContent=t('Comprobá la descarga antes de marcar la casilla.','Check the download before selecting the checkbox.');
     }catch(e){msg.textContent=e.message;}finally{busy=false;download.disabled=false;clean.disabled=!check.checked;}
    });card.append(download,mode,confirm,clean,msg);list.append(card);
   }
  }catch(e){status.textContent=e.message;}
 }
 root.SohailStorage=Object.freeze({open});
})(window);
