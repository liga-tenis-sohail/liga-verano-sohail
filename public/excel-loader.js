/* Sohail v4.1 — Excel is an on-demand admin tool, not a login dependency.
 * Same library/version as before. One shared load, explicit failure/retry and
 * session/file checks so a delayed download never acts in a different league.
 */
(function(root){
  'use strict';
  const URL='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const ACTIONS=['exportBackup','importBackup','exportExcel','descargarPlantillaResultados',
    'importarResultadosExcel','descargarPlantillaImport','importarJugadoresExcel',
    'exportarListaJugadores','importarListaJugadores'];
  function createLoader(doc,getLibrary=()=>root.XLSX,timeout=30000){
    let pending=null;
    return function ensure(){
      if(getLibrary()?.utils)return Promise.resolve(getLibrary());
      if(pending)return pending;
      pending=new Promise((resolve,reject)=>{
        const script=doc.createElement('script');let settled=false;
        const timer=setTimeout(()=>done(new Error('Excel no respondió. Volvé a intentar.')),timeout);
        function done(error){
          if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;
          if(error){script.remove();reject(error);}else resolve(getLibrary());
        }
        script.src=URL;script.async=true;script.dataset.sohailExcel='v410';
        script.onload=()=>done(getLibrary()?.utils?null:new Error('La librería Excel no está disponible.'));
        script.onerror=()=>done(new Error('No se pudo cargar Excel. Revisá la conexión y volvé a intentar.'));
        doc.head.append(script);
      }).catch(error=>{pending=null;throw error;});
      return pending;
    };
  }
  const text=(es,en)=>typeof LANG!=='undefined'&&LANG==='en'?en:es;
  const stamp=()=>({token:typeof _token==='undefined'?null:_token,league:typeof _ligaActual==='undefined'?null:_ligaActual});
  const same=(a,b)=>a.token===b.token&&a.league===b.league;
  const ensure=typeof document==='undefined'?null:createLoader(document);
  function install(){
    if(!ensure)return;
    for(const name of ACTIONS){
      const original=root[name];if(typeof original!=='function'||original.sohailExcelLoader)continue;
      let busy=false;
      const wrapped=async function(...args){
        if(busy)return;busy=true;
        const context=stamp(),input=args[0],file=input?.files?.[0];
        try{
          if(!root.XLSX?.utils){
            if(typeof toast==='function')toast(text('Preparando Excel…','Preparing Excel…'));
            await ensure();
          }
          if(!same(context,stamp()))throw new Error(text('La sesión o la liga cambió. Volvé a iniciar la acción.','Session or league changed. Start the action again.'));
          if(file&&input.files?.[0]!==file)throw new Error(text('El archivo cambió. Volvé a seleccionarlo.','The file changed. Select it again.'));
          return await original.apply(this,args);
        }catch(e){
          if(typeof toast==='function')toast(text(e.message,'Excel could not complete this action. Check your connection, session and file, then retry.'));
        }finally{busy=false;}
      };
      wrapped.sohailExcelLoader=true;root[name]=wrapped;
    }
  }
  const api={URL,ACTIONS,createLoader,ensure,install};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SohailExcel=Object.freeze(api);install();
})(typeof window!=='undefined'?window:globalThis);
