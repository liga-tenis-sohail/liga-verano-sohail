/* Sohail v3.9.7 — suggestions only. This module never links or merges identities,
 * rewrites names, changes credentials, or persists application data.
 * Comparisons use temporary Unicode-normalised copies; stored spelling is kept.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')root.SohailDuplicates=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LIMITS=Object.freeze({rows:1000,known:2500,comparisons:300000,pairs:500,candidates:8,findings:1500,name:120,file:5*1024*1024});
  const particles=new Set(['de','del','la','las','los','el','y','van','von','da','dos','di']);
  const words={
    es:{button:'Posibles duplicados',title:'Revisar posibles duplicados',importTitle:'Revisar nombres antes de importar',intro:'Son sugerencias por parecido del nombre, no una confirmación de identidad. No se fusiona, vincula ni cambia ningún perfil automáticamente.',loading:'Comparando con los jugadores de esta liga y el catálogo…',empty:'No se encontraron coincidencias con estos criterios. Esto no garantiza que no haya duplicados.',local:'Esta liga',catalog:'Catálogo de jugadores',excel:'Excel',row:'Fila',group:'Grupo',none:'Sin grupo',exact:'Mismo nombre escrito',format:'Mayúsculas o espacios',accents:'Tildes o diéresis',punctuation:'Guiones, puntos o apóstrofos',enye:'Diferencia entre n y ñ: revisar especialmente',order:'Mismas palabras en distinto orden',typo:'Posible letra cambiada, añadida, omitida o intercambiada',partial:'Posible nombre incompleto: revisar especialmente',high:'Coincidencia de escritura',possible:'Posible coincidencia',caution:'Revisión especial',close:'Cerrar',cancel:'Volver sin importar',continue:'Continuar con {n} filas',choose:'Elegir qué hacer con esta fila…',skip:'Omitir esta fila',keep:'Conservar fila: ya revisé la coincidencia',choices:'Las filas con coincidencias necesitan una decisión. Las demás se conservan. No se corrige el Excel ni se elige una identidad por vos.',linkHelp:'Para reutilizar un perfil de otra liga, omití la fila y usá «Agregar de ligas anteriores» con un grupo. Conservar una fila NO vincula el perfil; continúa con el importador existente.',summary:'{rows} filas · {flagged} con posibles coincidencias · {invalid} nombres inválidos',scanSummary:'{n} pares para revisar',invalid:'Nombre vacío, demasiado largo o con caracteres no admitidos. Esta fila se omitirá.',needDecision:'Elegí Omitir o Conservar en cada fila señalada.',error:'No se pudo obtener el catálogo. No se importó nada. Reintentá o cerrá la revisión.',retry:'Volver a consultar',changed:'La liga, la sesión o los datos cambiaron durante la revisión. Abrí el archivo de nuevo.',busy:'Ya hay una revisión abierta.',tooMany:'La revisión admite hasta 1.000 filas y archivos de hasta 5 MB. Dividí el archivo en partes más pequeñas.',limited:'Revisión parcial: se alcanzó el límite de comparaciones o de resultados. No se puede continuar esta importación; dividí el archivo en partes más pequeñas.',scanLimited:'Revisión parcial: se alcanzó el límite de comparaciones o de resultados. Puede haber más coincidencias sin mostrar.',more:'Mostrar más coincidencias',allSkipped:'Todas las filas quedaron omitidas. No se importó nada.',failModule:'Falta el módulo de revisión de duplicados. Recargá antes de importar.',notSaved:'Se revisan nombres; todavía no se guardó nada.',scanHelp:'Comprobá la ficha antes de decidir. La vinculación o fusión se realiza por separado con las herramientas y permisos existentes. No se modifica ningún nombre al cerrar esta revisión.',profileId:'Perfil',counterpart:'Coincide con',reviewed:'{n} de {total} filas resueltas',currentOnly:'Esta revisión usa el catálogo devuelto por la plataforma y los jugadores de esta liga; no busca por Internet ni inspecciona cuentas sin vínculo en otras ligas.'},
    en:{button:'Possible duplicates',title:'Review possible duplicates',importTitle:'Review names before importing',intro:'These are name-similarity suggestions, not proof of identity. No profile is merged, linked or changed automatically.',loading:'Comparing players in this league and the catalogue…',empty:'No matches found with these criteria. This does not guarantee that there are no duplicates.',local:'This league',catalog:'Player catalogue',excel:'Excel',row:'Row',group:'Group',none:'No group',exact:'Same written name',format:'Capitalisation or spaces',accents:'Accents or diacritics',punctuation:'Hyphens, dots or apostrophes',enye:'Difference between n and ñ: check carefully',order:'Same words in a different order',typo:'Possible changed, added, missing or swapped letter',partial:'Possibly incomplete name: check carefully',high:'Matching spelling',possible:'Possible match',caution:'Check carefully',close:'Close',cancel:'Return without importing',continue:'Continue with {n} rows',choose:'Choose what to do with this row…',skip:'Skip this row',keep:'Keep row: I reviewed this match',choices:'Rows with matches need a decision. Other rows are kept. The spreadsheet is not corrected and an identity is not chosen for you.',linkHelp:'To reuse a profile from another league, skip the row and use Add from previous leagues with a group. Keeping a row does NOT link a profile; it proceeds through the existing importer.',summary:'{rows} rows · {flagged} with possible matches · {invalid} invalid names',scanSummary:'{n} pairs to review',invalid:'Name is empty, too long or contains unsupported characters. This row will be skipped.',needDecision:'Choose Skip or Keep for every flagged row.',error:'The catalogue could not be retrieved. Nothing was imported. Retry or close this review.',retry:'Reload catalogue',changed:'The league, session or data changed during the review. Open the file again.',busy:'A review is already open.',tooMany:'Review supports up to 1,000 rows and files up to 5 MB. Split the file into smaller parts.',limited:'Partial review: the comparison or result limit was reached. This import cannot continue; split the file into smaller parts.',scanLimited:'Partial review: the comparison or result limit was reached. There may be more matches not shown.',more:'Show more matches',allSkipped:'All rows were skipped. Nothing was imported.',failModule:'The duplicate-review module is missing. Reload before importing.',notSaved:'Reviewing names; nothing has been saved yet.',scanHelp:'Check the player profile before deciding. Linking or merging remains a separate action with the existing tools and permissions. Closing this review does not rename anyone.',profileId:'Profile',counterpart:'Matches',reviewed:'{n} of {total} rows reviewed',currentOnly:'This review uses the catalogue returned by the platform and players in this league; it does not search the Internet or inspect unlinked accounts in other leagues.'}
  };
  function label(key,values){
    const language=typeof LANG!=='undefined'&&LANG==='en'?'en':'es';
    let str=words[language][key]||key;
    for(const[k,v]of Object.entries(values||{}))str=str.split('{'+k+'}').join(String(v));
    return str;
  }
  function validName(value){return typeof value==='string'&&value.trim().length>0&&value.length<=LIMITS.name&&!/[<>"`\\\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/.test(value)&&!['admin','superadmin','__proto__','constructor','prototype'].includes(value.trim().toLowerCase());}
  function prepare(value){
    if(!validName(value))return null;
    const canonical=value.normalize('NFC').trim().toLowerCase().replace(/\s+/g,' ');
    // Keep ñ distinct. Losing it is a separate, explicitly weaker suggestion.
    const folded=canonical.normalize('NFD').replace(/n\u0303/g,'ñ').replace(/[\u0300-\u036f]/g,'').normalize('NFC');
    const clean=folded.replace(/[’‘ʼ']/g,'').replace(/[-‐‑–—.]/g,' ').replace(/\s+/g,' ').trim();
    const tokens=clean.split(' ').filter(Boolean);
    return {raw:value,canonical,folded,clean,tokens,significant:tokens.filter(t=>!particles.has(t))};
  }
  // Restricted Damerau edit distance: adjacent transposition counts as one typo.
  function distance(a,b,max=2){
    const x=Array.from(a),y=Array.from(b);if(Math.abs(x.length-y.length)>max)return max+1;
    if(max===1){
      if(x.length===y.length){
        const differences=[];for(let i=0;i<x.length;i++)if(x[i]!==y[i]){differences.push(i);if(differences.length>2)return 2;}
        if(differences.length<=1)return differences.length;
        const[i,j]=differences;return j===i+1&&x[i]===y[j]&&x[j]===y[i]?1:2;
      }
      const small=x.length<y.length?x:y,big=small===x?y:x;let i=0,j=0,skips=0;
      while(i<small.length&&j<big.length){if(small[i]===big[j]){i++;j++;}else{j++;if(++skips>1)return 2;}}
      return 1;
    }
    let older=null,prev=Array.from({length:y.length+1},(_,i)=>i);
    for(let i=1;i<=x.length;i++){
      const row=[i];
      for(let j=1;j<=y.length;j++){
        row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));
        if(older&&i>1&&j>1&&x[i-1]===y[j-2]&&x[i-2]===y[j-1])row[j]=Math.min(row[j],older[j-2]+1);
      }
      older=prev;prev=row;
    }
    return Math.min(prev[y.length],max+1);
  }
  function comparePrepared(a,b){
    if(!a||!b)return null;
    const answer=(reason,level)=>({reason,level});
    if(a.raw===b.raw)return answer('exact','high');
    if(a.canonical===b.canonical)return answer('format','high');
    if(a.folded===b.folded)return answer('accents','high');
    if(a.clean===b.clean)return answer('punctuation','high');
    if(a.clean.replace(/ñ/g,'n')===b.clean.replace(/ñ/g,'n'))return answer('enye','caution');
    if(a.tokens.length<2||b.tokens.length<2)return null;
    if(a.significant.length>=2&&b.significant.length>=2&&a.tokens.length===b.tokens.length&&a.tokens.slice().sort().join(' ')===b.tokens.slice().sort().join(' '))return answer('order','caution');
    if(a.tokens.length===b.tokens.length){
      let edits=0,changed=0,anchors=0;
      for(let i=0;i<a.tokens.length;i++){
        const x=a.tokens[i],y=b.tokens[i];
        if(x===y){if(x.length>=3&&!particles.has(x))anchors++;continue;}
        if(Math.min(x.length,y.length)<4)return null;
        const d=distance(x,y,1);if(d>1)return null;edits+=d;changed++;
      }
      if(anchors>=1&&changed===1&&edits===1)return answer('typo','possible');
    }
    const small=a.significant.length<b.significant.length?a.significant:b.significant;
    const big=small===a.significant?b.significant:a.significant;
    if(small.length>=2&&big.length===small.length+1&&small[0]===big[0]&&small.at(-1)===big.at(-1)){
      let i=0;for(const part of big)if(part===small[i])i++;
      if(i===small.length)return answer('partial','caution');
    }
    return null;
  }
  function compareNames(a,b){return comparePrepared(prepare(a),prepare(b));}
  function sameProfile(a,b){return !!(a.globalId&&b.globalId&&a.globalId===b.globalId);}
  function cleanRecord(row,i,source){return {key:source+':'+i,name:typeof row.name==='string'?row.name:'',source:row.source||source,globalId:typeof row.globalId==='string'?row.globalId:'',group:row.group??'',row:row.row??i+2};}
  function reviewData(input,known){
    if(!Array.isArray(input)||input.length>LIMITS.rows||!Array.isArray(known))throw new RangeError('DUPLICATE_REVIEW_LIMIT');
    const refs=known.slice(0,LIMITS.known).map((r,i)=>cleanRecord(r,i,'catalog'));
    let comparisons=0,findings=0,limited=known.length>LIMITS.known;
    const pool=refs.map(r=>({...r,p:prepare(r.name)})),rows=[];
    for(let index=0;index<input.length;index++){
      const record=cleanRecord(input[index],index,'excel'),p=prepare(record.name),matches=[];
      if(p)for(const other of pool){
        if(comparisons>=LIMITS.comparisons){limited=true;break;}
        comparisons++;if(!other.p||sameProfile(record,other))continue;
        const found=comparePrepared(p,other.p);
        if(found){
          if(matches.length>=LIMITS.candidates||findings>=LIMITS.findings){limited=true;break;}
          matches.push({record:other,...found});findings++;
        }
      }
      // Do not expose normalised copies or any credentials to the UI.
      rows.push({index,record,invalid:!p,matches:matches.map(m=>({record:{key:m.record.key,name:m.record.name,source:m.record.source,globalId:m.record.globalId,group:m.record.group,row:m.record.row},reason:m.reason,level:m.level}))});
      pool.push({...record,p});
    }
    return {rows,comparisons,limited,flagged:rows.filter(r=>r.matches.length).length,invalid:rows.filter(r=>r.invalid).length};
  }
  function scanData(input){
    if(!Array.isArray(input))throw new TypeError('Expected an array');
    const rows=input.slice(0,LIMITS.known).map((r,i)=>cleanRecord(r,i,r.source||'catalog'));
    const prepared=rows.map(r=>prepare(r.name)),pairs=[];let comparisons=0,limited=input.length>LIMITS.known;
    outer:for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
      if(comparisons>=LIMITS.comparisons||pairs.length>=LIMITS.pairs){limited=true;break outer;}
      comparisons++;if(sameProfile(rows[i],rows[j]))continue;
      const found=comparePrepared(prepared[i],prepared[j]);if(found)pairs.push({a:rows[i],b:rows[j],...found});
    }
    return {pairs,limited,comparisons};
  }
  let opened=null,epoch=0;
  function authorised(){return typeof currentUser!=='undefined'&&typeof esAdmin==='function'&&esAdmin(currentUser)&&typeof _token!=='undefined'&&!!_token&&typeof _ligaActual!=='undefined'&&!!_ligaActual;}
  function fingerprint(){
    if(!authorised())return null;
    return JSON.stringify([_ligaActual,typeof _saveSessionKey==='function'?_saveSessionKey():currentUser.name,typeof _serialize==='function'?_serialize():null]);
  }
  function notify(key){if(typeof toast==='function')toast(label(key));}
  function element(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function button(text,action,primary){const b=element('button','btn'+(primary?' btn-primary':''),text);b.type='button';b.addEventListener('click',action);return b;}
  function sourceText(record){
    const parts=[label(record.source==='league'?'local':record.source==='excel'?'excel':'catalog')];
    if(record.source==='excel')parts.push(label('row')+' '+record.row);
    if(record.group!==''&&record.group!==undefined&&record.group!==null)parts.push(label('group')+' '+record.group);
    return parts.join(' · ');
  }
  function knownLocal(){
    const rows=[];
    if(typeof USERS==='undefined')return rows;
    for(const[key,u]of Object.entries(USERS||{})){
      if(!u||key==='admin'||key==='superadmin')continue;
      const name=typeof u.name==='string'?u.name:key;
      const loc=typeof findLoc==='function'&&typeof activeN!=='undefined'?findLoc(name,activeN):null;
      rows.push({name,globalId:u.jugadorId||'',source:'league',group:loc?loc.g:''});
    }
    return rows;
  }
  async function catalogRead(signal){
    const response=await fetch('/api/liga',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({accion:'duplicadosCatalogo',ligaId:_ligaActual})});
    if(!response.ok)throw Error('CATALOG_UNAVAILABLE');
    const data=await response.json();if(!data||!Array.isArray(data.jugadores)||typeof data.complete!=='boolean')throw Error('CATALOG_UNAVAILABLE');
    return {records:data.jugadores.filter(j=>j&&typeof j.nombre==='string').map(j=>({name:j.nombre,globalId:typeof j.jugadorId==='string'?j.jugadorId:'',source:'catalog'})),complete:data.complete};
  }
  function pairCard(record,reason,level){
    const d=element('div','dup-match');
    d.append(element('strong','dup-name',record.name),element('span','dup-source',sourceText(record)),element('span','dup-reason dup-'+level,label(reason)));
    return d;
  }
  function chooseKept(report,decisions){
    if(report.limited)return null;
    const kept=[];
    for(const r of report.rows){
      if(r.invalid)continue;
      if(r.matches.length&&!['skip','keep'].includes(decisions[r.index]))return null;
      if(!r.matches.length||decisions[r.index]==='keep')kept.push(r.index);
    }
    return kept;
  }
  function openDialog(importRows){
    if(!authorised())return Promise.resolve(null);
    if(opened){notify('busy');return Promise.resolve(null);}
    const id=++epoch,stamp=fingerprint(),previous=document.activeElement;
    const imported=Array.isArray(importRows);
    if(imported&&importRows.length>LIMITS.rows){notify('tooMany');return Promise.resolve(null);}
    const local=knownLocal(),overlay=element('div','dup-overlay'),dialog=element('section','dup-dialog');
    overlay.id='sohail-duplicates';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','dup-title');dialog.setAttribute('aria-describedby','dup-intro');dialog.tabIndex=-1;
    dialog.lang=typeof LANG!=='undefined'&&LANG==='en'?'en':'es';
    const head=element('header','dup-head'),title=element('h2','',label(imported?'importTitle':'title'));title.id='dup-title';
    const intro=element('p','dup-intro',label('intro'));intro.id='dup-intro';
    const body=element('div','dup-body'),foot=element('footer','dup-footer'),status=element('p','dup-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
    head.append(title,intro);dialog.append(head,body,status,foot);overlay.append(dialog);
    const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';document.body.append(overlay);
    let resolve,finished=false,controller=null,timer=null,fetchTimeout=null;
    const promise=new Promise(r=>{resolve=r;});
    const isCurrent=()=>id===epoch&&fingerprint()===stamp;
    function finish(value){
      if(finished)return;finished=true;controller?.abort();clearInterval(timer);clearTimeout(fetchTimeout);overlay.remove();document.body.style.overflow=oldOverflow;opened=null;
      if(previous&&previous.isConnected)previous.focus({preventScroll:true});resolve(value);
    }
    opened={finish};
    const cancel=()=>finish(null);
    function changed(){if(!isCurrent()){finish(null);notify('changed');return true;}return false;}
    overlay.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}
      if(e.key==='Tab'){
        const focusable=[...dialog.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(e=>e.getClientRects().length);
        const first=focusable[0],last=focusable.at(-1);
        if(!first){e.preventDefault();dialog.focus();}
        else if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}
      }
    });
    timer=setInterval(changed,350);
    function resetFooter(){foot.replaceChildren(button(label(imported?'cancel':'close'),cancel));}
    function render(report){
      if(changed()||finished)return;
      body.replaceChildren();resetFooter();
      body.append(element('p','dup-scope',label('currentOnly')));
      if(imported){
        const decisions=Object.create(null);
        body.append(element('p','dup-summary',label('summary',{rows:report.rows.length,flagged:report.flagged,invalid:report.invalid})),element('p','dup-help',label('choices')),element('p','dup-warning',label('linkHelp')));
        if(report.limited)body.append(element('p','dup-warning',label('limited')));
        if(!report.flagged&&!report.invalid)body.append(element('p','dup-empty',label('empty')));
        const action=button('',()=>{
          if(changed())return;const keepIndexes=chooseKept(report,decisions);if(!keepIndexes){status.textContent=label('needDecision');return;}
          if(!keepIndexes.length){finish(null);notify('allSkipped');return;}
          finish({keepIndexes,isCurrent});
        },true);foot.append(action);
        function update(){const selected=Object.keys(decisions).length,keep=chooseKept(report,decisions);status.textContent=report.flagged?label('reviewed',{n:selected,total:report.flagged}):label('notSaved');action.disabled=keep===null;action.textContent=label('continue',{n:keep?keep.length:'—'});}
        const list=element('div','dup-list');body.append(list);
        for(const row of report.rows.filter(r=>r.invalid||r.matches.length)){
          const item=element('article','dup-card');item.append(element('h3','dup-name',label('row')+' '+row.record.row+' · '+row.record.name),element('p','dup-source',sourceText(row.record)));
          if(row.invalid){item.append(element('p','dup-warning',label('invalid')));list.append(item);continue;}
          const matchBox=element('div','dup-matches');
          // Candidate display is complete; it never silently selects the first.
          for(const candidate of row.matches)matchBox.append(pairCard(candidate.record,candidate.reason,candidate.level));
          item.append(matchBox);
          const select=element('select','dup-decision');select.id='dup-choice-'+row.index;select.setAttribute('aria-label',label('row')+' '+row.record.row+' · '+label('choose'));
          for(const[v,k]of [['','choose'],['skip','skip'],['keep','keep']]){const o=element('option','',label(k));o.value=v;select.append(o);}
          select.addEventListener('change',()=>{if(select.value)decisions[row.index]=select.value;else delete decisions[row.index];update();});
          item.append(select);list.append(item);
        }
        update();
      }else{
        body.append(element('p','dup-summary',label('scanSummary',{n:report.pairs.length})),element('p','dup-help',label('scanHelp')));
        if(report.limited)body.append(element('p','dup-warning',label('scanLimited')));
        if(!report.pairs.length)body.append(element('p','dup-empty',label('empty')));
        const list=element('div','dup-list');body.append(list);let shown=0;
        const more=button(label('more'),addMore);body.append(more);
        function addMore(){for(const pair of report.pairs.slice(shown,shown+25)){const card=element('article','dup-card dup-pair');card.append(pairCard(pair.a,pair.reason,pair.level),pairCard(pair.b,pair.reason,pair.level));list.append(card);}shown+=25;more.hidden=shown>=report.pairs.length;}
        addMore();status.textContent=label('notSaved');
      }
      dialog.focus({preventScroll:true});
    }
    async function load(){
      if(changed()||finished)return;
      body.replaceChildren(element('p','dup-empty',label('loading')));resetFooter();status.textContent=label('loading');controller=new AbortController();
      fetchTimeout=setTimeout(()=>controller?.abort(),10000);
      try{
        const cat=await catalogRead(controller.signal);clearTimeout(fetchTimeout);if(finished||changed())return;
        // Same ID and same spelling in the current league/catalogue is one record.
        const seen=new Set();const known=[];
        for(const r of [...local,...cat.records]){const k=r.globalId?r.globalId+'\0'+r.name:r.source+'\0'+r.name;if(seen.has(k))continue;seen.add(k);known.push(r);}
        await new Promise(r=>setTimeout(r,0));if(finished||changed())return;
        const report=imported?reviewData(importRows,known):scanData(known);
        if(!cat.complete)report.limited=true;
        render(report);
      }catch(_){clearTimeout(fetchTimeout);if(finished||changed())return;body.replaceChildren(element('p','dup-warning',label('error')));body.append(button(label('retry'),load));status.textContent=label('error');}
    }
    load();dialog.focus({preventScroll:true});return promise;
  }
  function canReadFile(file){return !!file&&Number.isFinite(file.size)&&file.size>=0&&file.size<=LIMITS.file;}
  return Object.freeze({LIMITS,words,label,validName,prepare,distance,compareNames,reviewData,scanData,chooseKept,canReadFile,reviewRows:rows=>openDialog(rows),show:()=>openDialog(null)});
});
