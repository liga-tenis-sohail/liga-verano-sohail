/* Sohail v4.4 — global, server-verified sporting ratings. All existing public
   adapters remain available. The client never computes with unsaved results. */
(function(){
 'use strict';
 const es=()=>typeof LANG==='undefined'||LANG!=='en';
 const tr=(a,b)=>es()?a:b;
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
 const league=()=>typeof _ligaActual==='string'?_ligaActual:'liga-actual';
 const client=window.SohailRatingClient.create({getToken:()=>typeof _token==='string'?_token:'',fetcher:(...args)=>fetch(...args)});
 let _draw=0,_adjustContext=null;
 const context=()=>[league(),typeof _saveSessionKey==='function'?_saveSessionKey():typeof _token==='string'?_token:''].join('|');
 if(typeof TRANSLATIONS!=='undefined'){
  if(TRANSLATIONS.es)Object.assign(TRANSLATIONS.es,{rt_prov_t:'Estimación provisional: pocos partidos o evidencia insuficiente (rivales, fechas o inactividad).',rt_col_fiab_t:'Índice orientativo de evidencia, no una probabilidad de acierto.',rt_leg_fiab:'= índice orientativo de evidencia'});
  if(TRANSLATIONS.en)Object.assign(TRANSLATIONS.en,{rt_prov_t:'Provisional estimate: few matches or insufficient evidence (opponents, dates or inactivity).',rt_col_fiab_t:'Diagnostic evidence index, not an accuracy probability.',rt_leg_fiab:'= diagnostic evidence index'});
 }
 const isAdmin=()=>typeof currentUser!=='undefined'&&currentUser&&esAdmin(currentUser)&&!(typeof _ligaReadOnly!=='undefined'&&_ligaReadOnly);
 const _ratingSeeds=()=>typeof RATING_SEEDS==='object'&&RATING_SEEDS?RATING_SEEDS:{};
 const _ratingOverrides=()=>typeof RATING_OVERRIDES==='object'&&RATING_OVERRIDES?RATING_OVERRIDES:{};
 function ratingUTRDe(name){
  const snapshot=client.peek(),d=snapshot.data;if(!d)return null;
  const key=d.byLeague[league()]?.[name],r=key&&d.info[key];if(!r)return null;
  // Manual exceptions remain local and explicitly labelled. They do NOT feed
  // the opponent model; the calculated global estimate is always shown too.
  const over=d.overrides?.[league()]?.[name],manual=typeof over==='number'&&Number.isFinite(over);
  return {...r,rating:manual?over:r.ratingCalculado,manual,manualRating:manual?over:null,key,stale:snapshot.stale};
 }
 function ratingUTRfmt(name){const r=ratingUTRDe(name);return r&&r.partidos>0?r.rating.toFixed(2):r?.manual?r.rating.toFixed(2):'';}
 function currentVersionAhead(){
  const d=client.peek().data,l=d?.leagues.find(x=>x.id===league());
  return !!(l&&typeof _stateV==='number'&&_stateV>l.version);
 }
 async function calcularRatingGlobal(force){
  const result=await client.load(!!force||currentVersionAhead());
  // A save may have completed while an older request was already in flight.
  if(result&&currentVersionAhead()&&!client.peek().error)return client.load(true);
  return result;
 }
 function confidence(r){return r.confidence==='high'?tr('Alta','High'):r.confidence==='medium'?tr('Media','Medium'):tr('Baja','Low');}
 const button=(label,fn,primary=false)=>{const b=document.createElement('button');b.type='button';b.className='btn'+(primary?' btn-primary':'');b.textContent=label;b.addEventListener('click',fn);return b;};
 function statusHTML(s){
  const d=s.data;
  if(s.error)return `<div class="rating-alert" role="alert">${escape(s.error.message)} ${d?escape(tr('Mostrando la última lectura completa de esta sesión.','Showing the last complete snapshot of this session.')):''}</div>`;
  if(!d)return '';
  return `<p class="rating-snapshot">${escape(d.scope==='all-registered'?tr('Todas las ligas registradas','All registered leagues'):tr('Consulta pública: solo ligas finalizadas','Public view: finalized leagues only'))} · ${d.leagues.length} ${escape(tr('ligas','leagues'))} · ${d.matchCount} ${escape(tr('partidos con juego','matches with play'))}<br>${escape(tr('Lectura completa: ','Complete snapshot: '))}${escape(new Date(d.ts).toLocaleString(es()?'es-ES':'en-GB'))} · ${escape(d.version)} · ${escape(d.snapshot.slice(0,10))}${s.stale?' · '+escape(tr('Pendiente de actualizar','Update pending')):''}</p>`;
 }
 function renderRating(){
  const box=document.getElementById('view-rating');if(!box)return;
  const serial=++_draw,s=client.peek();
  box.classList.add('rating-v440');
  if(!s.data){
   box.innerHTML=`<div class="card"><h2>${escape(tr('Rating Sohail','Sohail rating'))}</h2>${statusHTML(s)}<p>${escape(s.error?tr('No se publicó ningún cálculo parcial.','No partial rating was published.'):tr('Leyendo el historial completo…','Reading the complete history…'))}</p><div class="rating-tools"></div></div>`;
   if(s.error)box.querySelector('.rating-tools').append(button(tr('Reintentar','Retry'),()=>refresh()));
   else calcularRatingGlobal(false).then(()=>{if(serial===_draw)renderRating();});
   return;
  }
  const d=s.data,seen=new Set(),list=[];
  for(const name of (typeof ALLNAMES!=='undefined'?ALLNAMES:Object.keys(d.byLeague[league()]||{}))){
   if(name==='admin'||name==='superadmin'||typeof USERS!=='undefined'&&USERS[name]?.inactive)continue;
   const r=ratingUTRDe(name);if(!r||seen.has(r.key)||!r.partidos&&!r.manual&&r.seed==null)continue;
   seen.add(r.key);list.push({name,...r});
  }
  list.sort((a,b)=>b.rating-a.rating||a.name.localeCompare(b.name));
  const mine=typeof currentUser!=='undefined'&&currentUser?d.byLeague[league()]?.[currentUser.name]:null;
  const rows=list.map((r,i)=>`<tr class="${r.key===mine?'me-row':''}"><td>${i+1}</td><td><button type="button" class="rating-name" data-player="${i}">${escape(r.name)}</button>${r.unlinked?`<small>${escape(tr('Ficha sin vínculo global','Unlinked historical profile'))}</small>`:''}</td><td><strong>${r.rating.toFixed(2)}</strong>${r.manual?`<span class="rt-manual">${escape(tr('fijo en esta liga','fixed in this league'))}</span>`:''}${r.provisional?`<span class="rt-prov">${escape(tr('provisional','provisional'))}</span>`:''}</td><td>${r.ratingCalculado.toFixed(2)}</td><td>${r.partidos}<small>${r.totalMatches} ${escape(tr('en el historial','in history'))}</small></td><td>${r.vict}–${r.der}${r.unresolved?`<small>${r.unresolved} ${escape(tr('sin ganador','winner unknown'))}</small>`:''}</td><td>${r.gGanados}–${r.gPerdidos}</td><td>${r.pctGames==null?'—':(100*r.pctGames).toFixed(1)+'%'}</td><td>${r.nivelRivales==null?'—':r.nivelRivales.toFixed(2)}</td><td><span class="rating-confidence">${escape(confidence(r))}</span><small>${r.fiab}/100 · ${r.uniqueOpponents} ${escape(tr('rivales','opponents'))}</small></td><td><button type="button" class="btn btn-sm" data-detail="${i}">${escape(tr('Ver detalle','Details'))}</button>${isAdmin()?` <button type="button" class="btn btn-sm" data-adjust="${i}">${escape(tr('Ajustar','Adjust'))}</button>`:''}</td></tr>`).join('');
  box.innerHTML=`<div class="card"><header class="rating-head"><div><h2>${escape(tr('Rating Sohail · nivel y confianza','Sohail rating · skill and confidence'))}</h2><p class="rt-sub">${escape(tr('Últimos 50 partidos por identidad deportiva, sumando sus nombres vinculados y todas las ligas accesibles. Con menos de 50, se usan todos.','Latest 50 matches per sporting identity, across linked names and all accessible leagues. All matches are used when fewer than 50.'))}</p></div><div class="rating-tools"></div></header>${statusHTML(s)}
   ${d.componentCount>1?`<p class="rating-alert">${escape(tr('Hay grupos de jugadores sin cruces entre sí. Su comparación depende más de la referencia inicial; no es una escala UTR oficial.','Some player groups have no cross-play. Their comparison depends more on initial references; this is not an official UTR scale.'))}</p>`:''}
   ${Object.keys(d.issueCounts||{}).length?`<details class="rating-method"><summary>${escape(tr('Avisos de calidad de datos','Data quality notices'))}</summary><p>${Object.entries(d.issueCounts).map(([k,v])=>escape(({'future-date':tr('Fechas posteriores a hoy: revisar','Future dates: review'),'missing-date':tr('Fechas desconocidas','Unknown dates'),'missing-id':tr('IDs históricos ausentes','Missing historical IDs'),'winner-unknown':tr('Ganador sin determinar; los games cuentan','Unknown winner; games still count'),'seed-conflict':tr('Seeds distintos entre ligas; no se elige uno arbitrariamente','Conflicting league seeds; none is chosen arbitrarily')}[k]||k)+': '+v)).join(' · ')}</p></details>`:''}
   <div class="overflow-x" tabindex="0" role="region" aria-label="${escape(tr('Tabla de rating','Rating table'))}" aria-describedby="rating-scroll-help"><table class="gen-table rt-table"><thead><tr><th>#</th><th>${escape(tr('Jugador','Player'))}</th><th>Rating</th><th>${escape(tr('Calc. global','Global calc.'))}</th><th>PJ / 50</th><th>V–D</th><th>GG–GP</th><th>% Games</th><th>${escape(tr('Rival medio','Mean opponent'))}</th><th>${escape(tr('Confianza','Confidence'))}</th><th>${escape(tr('Acciones','Actions'))}</th></tr></thead><tbody>${rows||`<tr><td colspan="11">${escape(tr('Todavía no hay partidos con juego para los jugadores de esta liga.','No played matches for this league’s players yet.'))}</td></tr>`}</tbody></table></div>
   <p id="rating-scroll-help" class="ui-scroll-note">${escape(tr('Desplazá la tabla para ver todas las columnas. GG–GP no incluye puntos de supertiebreak.','Scroll the table to see all columns. Games do not include match-tiebreak points.'))}</p>
   <details class="rating-method"><summary>${escape(tr('Cómo se calcula y qué significa la confianza','Calculation and confidence explained'))}</summary><p>${escape(tr('Se compara la proporción de games con la esperada según el rival. Los sets normales conservan su evidencia; el supertiebreak aporta por separado. Los retiros con juego siguen contando, con evidencia acorde a lo jugado. No se penaliza un partido entero por tener supertiebreak.','Game share is compared with the expectation against the opponent. Normal sets retain their evidence; the match tiebreak contributes separately. Retirements with play still count in proportion to play observed. A tiebreak does not downweight the whole match.'))}</p><p>${escape(tr('Cada uno de los 50 encuentros conserva peso positivo. La antigüedad usa días respecto del último partido conocido: dejar de jugar no baja automáticamente el nivel, pero sí la confianza. Sin fecha, se conserva el registro y se advierte la incertidumbre.','Every selected match has positive weight. Recency uses days relative to the latest known match: inactivity does not automatically lower skill, but does lower confidence. Unknown dates remain in the data and are flagged.'))}</p><p>${escape(tr('La referencia inicial es un seed coherente entre ligas, el grupo del primer partido registrado o 8 si no hay referencia. No se reinicia al cambiar de liga o de grupo actual. La confianza considera cantidad y diversidad de rivales, volumen de juego, fechas, repetición e inactividad. Es un índice orientativo, no una probabilidad de acertar ni un intervalo estadístico calibrado.','Initial reference is a consistent seed across leagues, the group at the first recorded match, or 8 without a reference. Switching league or current group does not reset it. Confidence accounts for match count, opponent diversity, play volume, dates, repetition and inactivity. It is a diagnostic index, not a calibrated accuracy probability or statistical interval.'))}</p><p>${escape(tr('Los valores fijos del administrador se conservan como excepciones de esta liga, señaladas junto al cálculo global. No alteran el nivel calculado de los rivales.','Administrator-fixed values remain local exceptions displayed beside the global estimate. They do not alter computed opponent levels.'))}</p></details></div>`;
  box.querySelector('.rating-tools').append(button(tr('Actualizar rating','Refresh rating'),()=>refresh()));
  box.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>showPlayerHistory(list[+b.dataset.player].name));
  box.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>detail(list[+b.dataset.detail].name));
  box.querySelectorAll('[data-adjust]').forEach(b=>b.onclick=()=>abrirAjusteRating(list[+b.dataset.adjust].name));
  if(!s.error&&(s.stale||currentVersionAhead())&&!s.busy)calcularRatingGlobal(true).then(()=>{if(serial===_draw)renderRating();});
 }
 async function refresh(){
  const box=document.getElementById('view-rating');box?.querySelectorAll('.rating-tools button').forEach(b=>{b.disabled=true;b.textContent=tr('Actualizando…','Updating…');});
  await calcularRatingGlobal(true);renderRating();
 }
 function modal(title,body){document.getElementById('modal-title').textContent=title;document.getElementById('modal-body').innerHTML=body;document.getElementById('modal-actions').replaceChildren(button(tr('Cerrar','Close'),()=>closeM()));document.getElementById('modal-bg').classList.add('open');}
 async function detail(name){
  const r=ratingUTRDe(name),d=client.peek().data;if(!r||!d)return;
  modal(tr('Detalle del rating: ','Rating detail: ')+name,`<section class="rating-detail"><p>${escape(tr('Calculado: ','Computed: '))}<strong>${r.ratingCalculado.toFixed(2)}</strong> · ${escape(tr('Confianza: ','Confidence: '))}${escape(confidence(r))} (${r.fiab}/100)</p><dl><dt>${escape(tr('Partidos utilizados / disponibles','Used / available matches'))}</dt><dd>${r.partidos} / ${r.totalMatches}</dd><dt>${escape(tr('Rivales distintos','Distinct opponents'))}</dt><dd>${r.uniqueOpponents}</dd><dt>${escape(tr('STB ganados–perdidos','Match tiebreaks won–lost'))}</dt><dd>${r.stbWins}–${r.stbLosses}</dd><dt>${escape(tr('Sin fecha conocida','Unknown date'))}</dt><dd>${r.missingDates}</dd><dt>${escape(tr('Días desde el último partido','Days since last match'))}</dt><dd>${r.inactiveDays??'—'}</dd><dt>${escape(tr('Referencia inicial','Initial reference'))}</dt><dd>${r.prior.toFixed(2)} · ${escape(({'manual-consistent':tr('seed coherente entre ligas','consistent cross-league seed'),'first-recorded-group':tr('grupo del primer partido registrado','first recorded match group'),'neutral':tr('referencia neutra','neutral reference')}[r.priorSource]||r.priorSource))}</dd></dl><p>${escape(tr('El tamaño efectivo resume pesos desiguales; no descarta registros: ','Effective size summarizes unequal weights; it does not remove records: '))}${r.effectiveMatches.toFixed(1)} · ${escape(tr('partidos incluidos: ','matches included: '))}${r.partidos}</p>${r.unlinked?`<p class="rating-alert">${escape(tr('Esta ficha no tiene identificador global. Vinculá sus perfiles históricos desde Jugadores para reunirlos; no se unen por parecido del nombre.','This profile has no global identifier. Link historical profiles in Players; name similarity does not merge people.'))}</p>`:''}<p data-rating-load role="status">${escape(tr('Cargando los partidos utilizados…','Loading the selected matches…'))}</p><div data-rating-selected></div></section>`);
  const target=document.querySelector('[data-rating-selected]'),status=document.querySelector('[data-rating-load]');
  try{const response=await client.details(r.key,d.snapshot);if(!target.isConnected)return;
   const labels=new Map(response.leagues.map(l=>[l.id,l.name]));
   status.textContent=tr('Estos son los registros usados, del más nuevo al más viejo.','These are the selected records, newest first.');
   target.innerHTML='<ol class="rating-matches">'+response.selected.map(m=>`<li><strong>${escape(m.date||tr('Sin fecha','Unknown date'))}</strong> · ${escape(labels.get(m.leagueId)||m.leagueId)}<small>${escape(m.key)} · ${escape(tr('Peso temporal/rival','Time/opponent weight'))}: ${m.weight.toFixed(3)}</small></li>`).join('')+'</ol>';
  }catch(e){if(status.isConnected)status.textContent=e.message;}
 }
 function abrirAjusteRating(name){
  if(!isAdmin())return;
  _adjustContext={name,key:context()};
  const r=ratingUTRDe(name),seed=_ratingSeeds()[name],over=_ratingOverrides()[name];
  modal(tr('Ajustes de rating: ','Rating adjustments: ')+name,`<section class="rating-detail"><p>${escape(tr('Cálculo global: ','Global estimate: '))}${r?r.ratingCalculado.toFixed(2):'—'}</p><label for="rt-seed">${escape(tr('Referencia inicial (seed) de esta liga','Initial seed in this league'))}</label><input id="rt-seed" class="cl-inp" type="number" min="1" max="16" step="0.01" value="${Number.isFinite(seed)?seed:''}"><p>${escape(tr('Solo se usa como referencia global si los seeds existentes de esa identidad son coherentes. Si hay valores diferentes entre ligas se informa el conflicto; no se elige la liga abierta.','Only used globally when this identity’s existing seeds agree. Conflicting league seeds are flagged rather than choosing the open league.'))}</p><label for="rt-over">${escape(tr('Rating fijo solo en esta liga','Fixed rating in this league only'))}</label><input id="rt-over" class="cl-inp" type="number" min="0.01" max="16" step="0.01" value="${Number.isFinite(over)?over:''}"><p>${escape(tr('Vacío usa el cálculo. Un valor fijo se muestra como excepción y no cambia el cálculo de los rivales.','Empty uses the estimate. A fixed value is a marked exception and does not change computed opponent ratings.'))}</p><p data-rating-save role="status"></p></section>`);
  document.getElementById('modal-actions').append(button(tr('Guardar ajustes','Save adjustments'),()=>guardarAjusteRating(name),true));
 }
 async function guardarAjusteRating(name){
  if(!isAdmin())return;
  const status=document.querySelector('[data-rating-save]'),a=document.getElementById('rt-seed'),b=document.getElementById('rt-over');if(!a||!b)return;
  const ctx=_adjustContext;if(!ctx||ctx.name!==name||ctx.key!==context()){status.textContent=tr('La liga o la sesión cambió. Cerrá y volvé a abrir el ajuste.','League or session changed. Reopen the adjustment.');return;}
  if(typeof _saveInFlight!=='undefined'&&_saveInFlight)await _saveInFlight;
  if(ctx.key!==context()||!a.isConnected)return;
  const sv=a.value.trim(),ov=b.value.trim();
  if(sv!==''&&(!Number.isFinite(+sv)||+sv<1||+sv>16)||ov!==''&&(!Number.isFinite(+ov)||+ov<0.01||+ov>16)){status.textContent=tr('Revisá los límites de ambos valores.','Check both value ranges.');return;}
  const oldS={..._ratingSeeds()},oldO={..._ratingOverrides()};
  if(sv==='')delete RATING_SEEDS[name];else RATING_SEEDS[name]=Math.round(+sv*100)/100;
  if(ov==='')delete RATING_OVERRIDES[name];else RATING_OVERRIDES[name]=Math.round(+ov*100)/100;
  const buttons=document.getElementById('modal-actions').querySelectorAll('button');buttons.forEach(x=>x.disabled=true);
  let saved=false;
  try{saved=await _criticalSave();if(ctx.key!==context())return;if(!saved){RATING_SEEDS=oldS;RATING_OVERRIDES=oldO;status.textContent=tr('No se confirmó el guardado. Resolvé el aviso de conexión o conflicto antes de reintentar.','Save was not confirmed. Resolve the connection or conflict notice before retrying.');return;}
   closeM();await calcularRatingGlobal(true);if(typeof subView!=='undefined'&&subView==='rating')renderRating();toast(tr('Ajustes guardados.','Adjustments saved.'));
  }catch(e){if(!saved&&ctx.key===context()){RATING_SEEDS=oldS;RATING_OVERRIDES=oldO;}if(status.isConnected)status.textContent=e.message;}
  finally{buttons.forEach(x=>x.disabled=false);}
 }
 function ratingFichaHTML(name){
  const r=ratingUTRDe(name);if(!r||!r.partidos&&!r.manual)return '';
  return `<div class="rt-ficha"><div class="rt-ficha-num">${r.rating.toFixed(2)}</div><div class="rt-ficha-side"><div class="rt-ficha-lbl">Rating Sohail ${r.provisional?'<span class="rt-prov">'+escape(tr('provisional','provisional'))+'</span>':''}</div><div class="rt-ficha-sub">${r.partidos}/50 · ${escape(tr('Confianza ','Confidence '))}${escape(confidence(r))}${r.manual?' · '+escape(tr('fijo; calculado ','fixed; computed '))+r.ratingCalculado.toFixed(2):''}${r.stale?' · '+escape(tr('lectura anterior','previous snapshot')):''}</div></div></div>`;
 }
 Object.assign(window,{calcularRatingGlobal,ratingUTRDe,ratingUTRfmt,renderRating,abrirAjusteRating,guardarAjusteRating,ratingFichaHTML});
})();
