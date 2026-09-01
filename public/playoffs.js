// ============================================================================
// public/playoffs.js — brackets, seeds, propagación y modales de playoff
// Extraído del index.html original (líneas del script: 4281..4794).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
function setViewT(i){playoff.viewT=i;showPlayoffView();}

function moveSeedUI(toTi){
  const sel=document.getElementById('po-move-'+toTi);
  const name=sel?sel.value:'';
  if(!name){toast(t('po_move_no_player'));return;}
  let fromTi=-1;
  playoff.tramos.forEach((tr,i)=>{if(tr.seeds.includes(name))fromTi=i;});
  if(fromTi<0||fromTi===toTi){toast(t('po_move_not_found'));return;}
  if(!confirm(tf('po_move_confirm',{n:name,from:playoff.tramos[fromTi].label,to:playoff.tramos[toTi].label})))return;
  playoff.tramos[fromTi].seeds=playoff.tramos[fromTi].seeds.filter(n=>n!==name);
  const srcKey=fromTi+'#';
  Object.keys(playoff.results).forEach(k=>{if(k.startsWith(srcKey)&&k.includes(name))delete playoff.results[k];});
  rebuildTramo(fromTi);
  addSeed(toTi,name);
  showPlayoffView();
  toast(tf('po_move_ok',{n:name,to:playoff.tramos[toTi].label}));
  persist(true);
}
// Reordenar seeds dentro del MISMO cuadro (cambia los emparejamientos del bracket).
// Si ya hay resultados cargados en ese cuadro, se pide confirmación porque los
// enfrentamientos cambian y esos resultados dejan de tener sentido.
function _poHasResultsInBracket(ti){
  const prefix=ti+'#';
  return Object.keys(playoff.results||{}).some(k=>k.startsWith(prefix));
}
function _poClearBracketResults(ti){
  const prefix=ti+'#';
  Object.keys(playoff.results||{}).forEach(k=>{if(k.startsWith(prefix))delete playoff.results[k];});
}
// Devuelve la clave de playoff.results para un partido puntual (mismo
// formato que usa applyStored en core-estado.js: prefix + '#' + nombres
// ordenados alfabéticamente, unidos con '|').
function _claveResultado(prefix,a,b){ return prefix+'#'+[a,b].sort().join('|'); }
// Chequea si ALGUNO de los jugadores dados ya tiene un resultado jugado
// en este cuadro (cualquier partido en el que haya participado, no solo
// contra un rival puntual) — es lo que de verdad importa para decidir si
// un reacomodo de posiciones puede "romper" algo: si ninguno de los
// jugadores movidos jugó todavía, no hay ningún resultado real en riesgo,
// sin importar que OTROS partidos del mismo cuadro (en ramas totalmente
// distintas) sí tengan resultado cargado.
function _poJugadoresConResultado(prefix,nombres){
  const resultados=playoff.results||{};
  return nombres.filter(n=>{
    if(!n) return false;
    return Object.keys(resultados).some(k=>{
      if(!k.startsWith(prefix+'#')) return false;
      const pares=k.slice(prefix.length+1).split('|');
      return pares.includes(n);
    });
  });
}
// Borra ÚNICAMENTE los resultados de los jugadores dados dentro de este
// cuadro — a diferencia de _poClearBracketResults (que arrasa con TODO el
// cuadro), esto solo toca los partidos donde participó alguno de los
// jugadores afectados por el reacomodo puntual que se está haciendo.
function _poClearResultadosDe(prefix,nombres){
  const set=new Set(nombres);
  Object.keys(playoff.results||{}).forEach(k=>{
    if(!k.startsWith(prefix+'#')) return;
    const pares=k.slice(prefix.length+1).split('|');
    if(pares.some(p=>set.has(p))) delete playoff.results[k];
  });
}
function _swapSeeds(ti,i,j){
  const tr=playoff.tramos[ti];
  if(!tr||!Array.isArray(tr.seeds))return false;
  if(i<0||j<0||i>=tr.seeds.length||j>=tr.seeds.length)return false;
  const label=tr.label;
  // Si hay resultados en el cuadro, avisar. Después borrar para rearmar limpio.
  if(_poHasResultsInBracket(ti)){
    if(!confirm(tf('po_reorder_confirm',{l:label})))return false;
    _poClearBracketResults(ti);
  }
  const tmp=tr.seeds[i];tr.seeds[i]=tr.seeds[j];tr.seeds[j]=tmp;
  rebuildTramo(ti);
  return true;
}
function moveSeedUpUI(ti,name){
  const tr=playoff.tramos[ti];if(!tr)return;
  const idx=tr.seeds.indexOf(name);
  if(idx<=0)return;
  if(_swapSeeds(ti,idx,idx-1)){
    showPlayoffView();
    toast(tf('po_reorder_ok',{n:name}));
    persist(true);
  }
}
function moveSeedDownUI(ti,name){
  const tr=playoff.tramos[ti];if(!tr)return;
  const idx=tr.seeds.indexOf(name);
  if(idx<0||idx>=tr.seeds.length-1)return;
  if(_swapSeeds(ti,idx,idx+1)){
    showPlayoffView();
    toast(tf('po_reorder_ok',{n:name}));
    persist(true);
  }
}
function removeSeedUI(ti,name){removeSeed(ti,name);showPlayoffView();toast(tf('po_seed_removed',{name}));persist(true);}
function addSeedUI(ti){const sel=document.getElementById('po-add-'+ti);const name=sel?sel.value:'';if(!name){toast(t('po_choose_add'));return;}addSeed(ti,name);showPlayoffView();toast(tf('po_seed_added',{name}));persist(true);}

// ===== Reacomodar posiciones (BYE incluidos) del cuadro PRINCIPAL =====
// Distinto del panel de seeds (moveSeedUpUI/DownUI, arriba): ese reordena
// el RANKING de siembra — quién es "mejor sembrado" que quién, lo que
// indirectamente decide contra quién juega cada uno según el criterio
// estándar de bisección (seedOrder). Esto de acá edita directamente las
// POSICIONES VISUALES del cuadro ya armado, incluyendo los BYE: permite
// mover a un jugador a un lugar donde había BYE (y viceversa, mover el
// BYE), sin tener que entender ni tocar el ranking de siembra en sí.
// Mismo mecanismo que ya existe para consolación (tr.consOverrides._order),
// pero en tr.mainOrder.
function _mainSlotsActuales(tr){
  const slots=[];
  if(tr.main) tr.main[0].forEach(m=>{ slots.push(m.a); slots.push(m.b); });
  return slots;
}
function clearMainOrderUI(ti){
  const tr=playoff.tramos[ti];if(!tr)return;
  if(!tr.mainOrder || !tr.mainOrder.length){toast(t('po_cons_none_to_clear'));return;}
  if(!confirm(t('po_cons_clear_confirm')))return;
  tr.mainOrder=null;
  rebuildTramo(ti);
  showPlayoffView();
  toast(t('po_cons_cleared'));
  persist(true);
}

// ===== Edición manual del cuadro de CONSOLACIÓN =====
// A diferencia del cuadro principal (tr.seeds, editable con
// add/remove/moveSeedUI de arriba), quiénes juegan la consolación se
// derivan AUTOMÁTICAMENTE de quién perdió la primera ronda del cuadro
// principal (rebuildTramo, en core-estado.js) — no había ninguna forma de
// tocarlo a mano. tr.consOverrides guarda reemplazos puntuales
// {perdedorOriginal: reemplazo} que rebuildTramo aplica en cada recálculo,
// así que sobreviven a cualquier resultado nuevo que se cargue después.
//
// Caso de uso típico: un jugador que perdió primera ronda no puede jugar
// la consolación (lesión, viaje, etc.) y el admin quiere que otra persona
// ocupe ese lugar — o directamente sacarlo sin reemplazo si el cuadro de
// consolación queda con número impar.
function editConsOverrideUI(ti,focoEnJugador){
  if(!esAdmin(currentUser))return;
  const tr=playoff.tramos[ti];
  if(!tr||!tr.cons){toast(t('po_cons_none'));return;}
  // Los jugadores ACTUALES en consolación (tras aplicar overrides previos,
  // si los hay) — se leen directamente del bracket ya armado (tr.cons[0]),
  // que es la fuente de verdad de "quién está en consolación ahora mismo".
  const actuales=[];
  tr.cons[0].forEach(m=>{ if(m.a)actuales.push(m.a); if(m.b)actuales.push(m.b); });
  if(!actuales.length){toast(t('po_cons_none'));return;}
  const overrides=tr.consOverrides||{};
  // El candidato a reemplazo: SOLO jugadores de ESTE cuadro (tr.seeds — los
  // sembrados originales del Cuadro A/B/C, no ALLNAMES/catálogo completo de
  // la liga) que no estén ya en esta consolación. Antes se ofrecía
  // cualquier jugador de la liga entera, lo cual no tiene mucho sentido:
  // un reemplazo de consolación normalmente es alguien que también
  // participa de este mismo cuadro (perdió otro partido, o directamente
  // ganó primera ronda y el admin igual quiere sumarlo a consolación).
  // Ordenado alfabéticamente ('es' para que las tildes ordenen bien),
  // igual que el resto de los selectores de jugadores del proyecto.
  const disponibles=tr.seeds.filter(n=>!actuales.includes(n)).slice().sort((a,b)=>a.localeCompare(b,'es'));
  document.getElementById('modal-title').textContent = tf('po_cons_edit_title',{l:tr.label});
  // Este modal ahora es SOLO para reemplazos (traer a alguien de afuera de
  // esta consolación, o sacar a alguien sin reemplazo) — mover DE POSICIÓN
  // dentro del cuadro ya se hace desde el selector inline de cada tarjeta
  // (ver _selectorPosicionInline/aplicarPosicionInline), que permite
  // ubicar a cualquiera en cualquier posición sin la limitación de pares
  // que tenía este modal antes.
  const rowsHtml = actuales.map((n)=>{
    // Si n ya es resultado de un override previo, mostramos también quién
    // era el perdedor original entre paréntesis, para que quede claro qué
    // se está reemplazando (y se pueda deshacer con "Restaurar").
    const original = Object.keys(overrides).filter(k=>k!=='_order').find(k=>overrides[k]===n);
    const label = original ? (n+' ('+tf('po_cons_was',{n:original})+')') : n;
    const esFoco = focoEnJugador && n===focoEnJugador;
    return `<div class="form-row ${esFoco?'po-pos-foco':''}" id="${esFoco?'po-cons-row-foco':''}" style="grid-template-columns:1fr auto;align-items:center;margin-bottom:.4rem;gap:6px">
      <div>${attr(label)}</div>
      <select id="po-cons-repl-${jsq(n)}" style="font-size:12px;padding:4px 6px">
        <option value="">${attr(t('po_cons_keep'))}</option>
        <option value="__remove__">${attr(t('po_cons_remove'))}</option>
        ${disponibles.map(d=>`<option value="${attr(d)}">${attr(d)}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
  document.getElementById('modal-body').innerHTML = `
    <p class="legend-txt" style="margin-top:0">${t('po_cons_edit_hint')}</p>
    ${rowsHtml}`;
  document.getElementById('modal-actions').innerHTML = `
    <button class="btn btn-primary" onclick="saveConsOverridesYPosiciones(${ti},[${actuales.map(n=>"'"+jsq(n)+"'").join(',')}])"><i class="ti ti-device-floppy"></i> ${t('save')}</button>
    <button class="btn" onclick="closeM()">${t('close')}</button>`;
  document.getElementById('modal-bg').classList.add('open');
  if(focoEnJugador){
    setTimeout(()=>{
      const el=document.getElementById('po-cons-row-foco');
      if(el) el.scrollIntoView({block:'center',behavior:'smooth'});
      const sel=document.getElementById('po-cons-pos-'+jsq(focoEnJugador));
      if(sel) sel.focus();
    },80);
  }
}
// Aplica reemplazos de jugador Y asignaciones de posición (BYE/rival) en
// un solo click — los reemplazos se resuelven PRIMERO (pueden cambiar
// quién está presente en la consolación), y recién después se calculan
// las posiciones sobre el conjunto de jugadores ya actualizado.
// Aplica los reemplazos elegidos en el modal de consolación. Ya no maneja
// posiciones (eso se saca del selector inline de cada tarjeta) — solo
// reemplazo de jugador: traer a alguien de afuera de esta consolación, o
// sacar a alguien sin reemplazo.
function saveConsOverridesYPosiciones(ti, actuales){
  const tr=playoff.tramos[ti];if(!tr)return;
  if(!tr.consOverrides) tr.consOverrides={};
  let huboReemplazos=false;
  actuales.forEach(actual=>{
    const sel=document.getElementById('po-cons-repl-'+actual);
    if(!sel)return;
    const v=sel.value;
    if(!v)return;
    const original = Object.keys(tr.consOverrides).filter(k=>k!=='_order').find(k=>tr.consOverrides[k]===actual) || actual;
    tr.consOverrides[original] = (v==='__remove__') ? null : v;
    huboReemplazos=true;
  });
  if(!huboReemplazos){ closeM(); return; }
  rebuildTramo(ti);
  showPlayoffView();
  closeM();
  toast(t('po_cons_saved'));
  persist(true);
}
// Deshace TODOS los overrides de consolación de un cuadro, volviendo a los
// perdedores reales de la primera ronda del cuadro principal.
function clearConsOverridesUI(ti){
  const tr=playoff.tramos[ti];if(!tr)return;
  if(!tr.consOverrides || !Object.keys(tr.consOverrides).length){toast(t('po_cons_none_to_clear'));return;}
  if(!confirm(t('po_cons_clear_confirm')))return;
  tr.consOverrides={};
  rebuildTramo(ti);
  showPlayoffView();
  toast(t('po_cons_cleared'));
  persist(true);
}

// Devuelve el array de POSICIONES del cuadro tal como está ahora (incluye
// null en los BYE) — no solo los nombres. Es importante preservar los null
// en su lugar: si se "aplanaran" (como hacía la versión anterior de esta
// función, filtrando solo los .a/.b con nombre), se perdía la información
// de EN QUÉ POSICIÓN va cada BYE, y el próximo armado del cuadro terminaba
// juntando a todos los jugadores reales al principio y a todos los BYE al
// final — en vez de repartir los BYE entre los sembrados más altos, como
// corresponde (ver seedOrder/buildRounds en core-estado.js).
function _consSlotsActuales(tr){
  const slots=[];
  if(tr.cons) tr.cons[0].forEach(m=>{ slots.push(m.a); slots.push(m.b); });
  return slots;
}

// Arma el <select> inline de posición para UN slot puntual (jugador o BYE)
// de la primera ronda. idx es la posición absoluta dentro del cuadro
// (0-based, mismo espacio que _mainSlotsActuales/_consSlotsActuales).
// nombreActual es el nombre del jugador ahí, o null si es BYE.
//
// Libre total: la lista de opciones es TODOS los jugadores del cuadro +
// BYE, sin ninguna restricción de "con quién queda enfrentado". Elegir
// cualquier opción simplemente PONE a esa persona (o un BYE) en ESTA
// posición puntual — el que estaba antes acá se va a donde estaba el
// elegido. No hay noción de "compañero de partido": el admin decide
// directamente QUIÉN VA EN QUÉ LLAVE, no contra quién juega cada uno (eso
// es una consecuencia de dónde quedó cada uno, no una restricción del
// editor). Antes el selector solo ofrecía "darle BYE" o "jugar contra X"
// —un intercambio de a pares, siempre preservando el concepto de "rival"—
// y eso era justamente la limitación: no dejaba poner a un jugador
// específico en una posición específica del cuadro sin que el sistema
// decidiera automáticamente quién quedaba de compañero en el otro extremo
// del par.
// Arma el <select> inline de posición para UN slot puntual (jugador o BYE)
// de la primera ronda. idx es la posición absoluta dentro del cuadro
// (0-based, mismo espacio que _mainSlotsActuales/_consSlotsActuales).
// nombreActual es el nombre del jugador ahí, o null si es BYE.
//
// El propio NOMBRE del jugador ES el selector: la primera opción es
// siempre "el valor actual" (nombreActual, o "BYE" si el slot está vacío),
// preseleccionada — así el <select> reemplaza directamente al texto del
// nombre en la tarjeta, en vez de ser un control aparte debajo. Elegir
// cualquier otra opción de la lista pone a esa persona (o BYE) en ESTA
// posición puntual — libre total, sin ninguna restricción de "con quién
// queda enfrentado" (ver aplicarPosicionInline).
function _selectorPosicionInline(ti,which,idx,nombreActual){
  const tr=playoff.tramos[ti];if(!tr)return'';
  const slots = which==='main' ? _mainSlotsActuales(tr) : _consSlotsActuales(tr);
  if(idx>=slots.length)return'';
  const valorActual = nombreActual || '__bye__';
  const textoActual = nombreActual || t('po_bye_label');
  let opciones='<option value="'+attr(valorActual)+'" selected>'+attr(textoActual)+'</option>';
  const hayByeEnOtroLado = slots.some((n,i)=>i!==idx&&n===null);
  if(nombreActual && hayByeEnOtroLado) opciones+='<option value="__bye__">'+attr(t('po_bye_label'))+'</option>';
  // Lista COMPLETA de jugadores del cuadro (menos este mismo slot) — cada
  // uno es "poner a X acá", no "jugar contra X".
  slots.forEach((n,i)=>{
    if(i===idx || !n) return;
    opciones+='<option value="'+attr(n)+'">'+attr(n)+'</option>';
  });
  const selId='po-inline-pos-'+ti+'-'+which+'-'+idx;
  return '<select id="'+selId+'" class="po-pos-inline-sel po-pos-inline-name" onchange="event.stopPropagation();aplicarPosicionInline('+ti+',\''+which+'\','+idx+',\''+jsq(nombreActual||'')+'\',this.value)" onclick="event.stopPropagation()">'+opciones+'</select>';
}
// Aplica el cambio elegido en el <select> inline de una posición puntual
// del cuadro. Libre total: simplemente pone al elegido en la posición
// `idx`, y a quien estaba antes ahí lo manda a donde estaba el elegido —
// un swap directo por ÍNDICE, sin ninguna noción de "compañero de
// partido" ni de "con quién queda enfrentado" cada uno. El admin elige
// literalmente quién ocupa cada casillero del cuadro; contra quién termine
// jugando cada uno es una consecuencia de esa ubicación, no algo que el
// editor imponga.
function aplicarPosicionInline(ti,which,idx,nombreActualCrudo,valor){
  if(!valor)return;
  // Si se "eligió" el mismo valor que ya estaba (el select ahora arranca
  // mostrando el actual como primera opción), no hay ningún cambio real.
  const actualComoValor = nombreActualCrudo || '__bye__';
  if(valor===actualComoValor)return;
  const tr=playoff.tramos[ti];if(!tr)return;
  const esMain = which==='main';
  const slots = (esMain ? _mainSlotsActuales(tr) : _consSlotsActuales(tr)).slice();
  const label=tr.label;
  let idxOrigen; // de dónde viene lo que se pone en `idx`
  if(valor==='__bye__'){
    idxOrigen = slots.indexOf(null, 0);
    // Buscar un BYE que NO sea esta misma posición (evita el caso trivial
    // de "poner BYE donde ya hay BYE").
    while(idxOrigen===idx) idxOrigen = slots.indexOf(null, idxOrigen+1);
    if(idxOrigen<0){ toast('No hay ningún BYE disponible en este cuadro.'); return; }
  }else{
    idxOrigen = slots.indexOf(valor);
    if(idxOrigen<0 || idxOrigen===idx) return;
  }
  // Chequeo de resultados ya jugados: solo los DOS jugadores/posiciones
  // directamente involucrados en este swap puntual (el que se mueve, y
  // quien ocupaba la posición destino) — nunca todo el cuadro entero.
  const involucrados=[slots[idx],slots[idxOrigen]].filter(Boolean);
  const conResultado=_poJugadoresConResultado(esMain?String(ti):ti+'c',involucrados);
  if(conResultado.length){
    if(!confirm(tf('po_reorder_confirm',{l:label}))) return;
    _poClearResultadosDe(esMain?String(ti):ti+'c',conResultado);
  }
  const tmp=slots[idx];slots[idx]=slots[idxOrigen];slots[idxOrigen]=tmp;
  if(esMain){ tr.mainOrder=slots; }
  else{ if(!tr.consOverrides) tr.consOverrides={}; tr.consOverrides._order=slots; }
  rebuildTramo(ti);
  showPlayoffView();
  toast(t('po_main_positions_saved'));
  persist(true);
}
function matchBox(m,ti,which,ri,mi,isFirstRound){
  const realMatch=!!(m.a&&m.b);const aw=realMatch&&m.w&&m.w===m.a,bw=realMatch&&m.w&&m.w===m.b;
  // Distinción WO vs RET (feedback usuario):
  //   - m.wo CON sets jugados = retiro (RET) → sets + "RET" al lado (partido
  //     que empezó y el jugador abandonó a mitad — se muestra el resultado
  //     parcial tal como quedó).
  //   - m.wo SIN sets jugados = walkover (WO) → solo "WO" (el jugador no se
  //     presentó, el partido no llegó a empezar).
  // Antes ambos casos se mostraban como "RET", que confundía porque "no se
  // presentó" no es lo mismo que "abandonó jugando".
  const setsStr=m.sets&&m.sets.length?m.sets.map(([a,b])=>a+'-'+b).join(' '):'';
  // Iniciales del que se retiró (solo RET, no WO): quien perdió es el que
  // se retiró — el ganador (m.w) es el otro. Se agregan al final del
  // marcador como "(XX)" para que se entienda quién abandonó el partido.
  // getInitials() vive en core-estado.js.
  const _retNm = (m.wo && setsStr && m.a && m.b && m.w) ? (m.a===m.w?m.b:m.a) : '';
  const _retIn = _retNm ? getInitials(_retNm) : '';
  const sc=m.np?t('po_not_played'):m.wo?(setsStr?(setsStr+' RET'+(_retIn?' ('+_retIn+')':'')):'WO'):setsStr;
  // Busca si hay un resultado ya cargado (pending o disputed) en `matches` para
  // este slot del bracket. Sin este chequeo, el rival veía el slot como
  // "Pendiente de juego" y podía cargar OTRO resultado (duplicado).
  //
  // Búsqueda con dos criterios en cascada:
  //   1) Coordenadas del bracket (ti/which/ri/mi), coercionadas a number/string
  //      para tolerar que algún deploy viejo las haya guardado como string.
  //   2) Fallback por nombres: si algún match antiguo no tiene coordenadas
  //      exactas, matcheamos por poNames que contengan ambos jugadores del slot.
  //      Esto cubre partidos de la misma llave aunque las coordenadas hayan
  //      cambiado tras una reorganización del bracket.
  const _poPending = (m.a && m.b && !m.w)
    ? (matches || []).find(function(x){
        if(!x || x.po !== true) return false;
        if(x.status !== 'pending' && x.status !== 'disputed') return false;
        // Criterio 1: coordenadas del bracket (con coerción defensiva).
        var sameCoord = (Number(x.ti) === Number(ti))
                     && (String(x.which) === String(which))
                     && (Number(x.ri) === Number(ri))
                     && (Number(x.mi) === Number(mi));
        if(sameCoord) return true;
        // Criterio 2: mismos 2 jugadores (en cualquier orden). Un partido de
        // playoff con exactamente estos 2 jugadores es único en la liga —
        // no puede haber dos matches pending distintos entre los mismos
        // jugadores. Sin este fallback, si por algún motivo los índices
        // ti/which/ri/mi guardados no coinciden con los del bracket (por un
        // rearmado, reset o guardado con tipos distintos), el partido se
        // mostraba invisible y el rival podía cargar un duplicado.
        if(Array.isArray(x.poNames) && x.poNames.length === 2
           && x.poNames.indexOf(m.a) !== -1
           && x.poNames.indexOf(m.b) !== -1) return true;
        return false;
      })
    : null;
  const canLoad=m.a&&m.b&&!m.w&&!_poPending&&(esAdmin(currentUser)||m.a===currentUser.name||m.b===currentUser.name);
  const emptyTxt=isFirstRound?'BYE':t('tbd');
  const isBYE_A=!m.a&&m.b;const isBYE_B=!m.b&&m.a;
  const meA=currentUser&&m.a===currentUser.name;const meB=currentUser&&m.b===currentUser.name;
  // Nota: cuando meA/meB, el fondo cream #FFF8DC + clase .po-me-slot fuerzan
  // texto oscuro en dark mode (regla en CSS). El seed number y el chip "yo"
  // heredan la clase para no quedar en blanco sobre cream.
  // El GANADOR (aw/bw) NO lleva fondo: se distingue solo por la negrita.
  // Antes tenía fondo cream, pero era ruido visual innecesario.
  const sA=meA?'background:#FFF8DC;font-weight:700;color:#0E3470;':isBYE_A?'background:var(--surface2);':'';
  const sB=meB?'background:#FFF8DC;font-weight:700;color:#0E3470;':isBYE_B?'background:var(--surface2);':'';
  const iA=!m.a?'color:var(--text2);font-style:italic;':'';
  const iB=!m.b&&m.a?'color:var(--text2);font-style:italic;':'';
  const nmA=m.a||emptyTxt;const nmB=m.b||(m.a?'BYE':emptyTxt);
  const seedA=(m.sid&&m.sid[0])||'';const seedB=(m.sid&&m.sid[1])||'';
  // Selector inline de posición: reemplaza al lápiz + modal separado que
  // había antes. Antes, editar una posición abría un modal aparte con la
  // lista completa de jugadores — quedaba confuso, con dos selects
  // apilados por fila (reemplazo + posición) y sin poder tocar
  // directamente a alguien con BYE, ni elegir libremente "quién va en qué
  // llave" (estaba atado a intercambios de a pares, "contra quién juega").
  // Ahora cada slot (jugador O BYE) de primera ronda tiene su propio
  // <select> inline, y el propio NOMBRE del jugador ES el selector — no
  // hay un control aparte debajo, el <select> reemplaza directamente al
  // texto. Solo primera ronda (único lugar donde el concepto de
  // "posición" existe de forma editable), solo admin, solo sin resultado
  // todavía.
  // Antes: `!m.w` bloqueaba la edición de posición apenas había ganador. El
  // problema: en un slot con BYE, m.w se asigna automáticamente al jugador
  // que quedó libre — sin haber jugado nada — así que el admin no podía
  // cambiar a ese jugador de posición ni asignarle rival. Ahora solo se
  // bloquea cuando REALMENTE hay un partido jugado (m.a && m.b && m.w);
  // los BYE (uno de los dos slots vacío) siguen siendo editables aunque
  // m.w esté seteado, porque ese m.w es virtual, no viene de un resultado.
  const puedeEditarPos = isFirstRound && esAdmin(currentUser) && !(m.a && m.b && m.w);
  const idxA=mi*2, idxB=mi*2+1;
  const selPosA = puedeEditarPos ? _selectorPosicionInline(ti,which,idxA,m.a) : '';
  const selPosB = puedeEditarPos ? _selectorPosicionInline(ti,which,idxB,m.b) : '';
  const clA = puedeEditarPos ? selPosA : (m.a?'<span class="nm-link" onclick="event.stopPropagation();showPlayerHistory(\''+jsq(m.a)+'\')">'+nmA+'</span>':nmA);
  const clB = puedeEditarPos ? selPosB : (m.b?'<span class="nm-link" onclick="event.stopPropagation();showPlayerHistory(\''+jsq(m.b)+'\')">'+nmB+'</span>':nmB);
  // Cuando el nombre se convierte en <select> (puedeEditarPos), el link a
  // "ver historial" que tenía adentro se pierde — se agrega como ícono
  // aparte, chico, junto al select, para no perder esa función.
  const histA = (puedeEditarPos && m.a) ? '<button class="po-hist-btn" title="'+attr(t('hist_view'))+'" onclick="event.stopPropagation();showPlayerHistory(\''+jsq(m.a)+'\')"><i class="ti ti-history"></i></button>' : '';
  const histB = (puedeEditarPos && m.b) ? '<button class="po-hist-btn" title="'+attr(t('hist_view'))+'" onclick="event.stopPropagation();showPlayerHistory(\''+jsq(m.b)+'\')"><i class="ti ti-history"></i></button>' : '';
  function fn(n){return n?n.split(' ')[0]:'';}
  const fA=fn(m.a),fB=fn(m.b);
  const sameFirst=m.a&&m.b&&fA===fB;
  const lblA=m.a?(sameFirst?m.a:fA):'';
  const lblB=m.b?(sameFirst?m.b:fB):'';
  const hA='';
  const hB='';
  let bot='';
  if(m.w&&m.a&&m.b){
    const editRow=esAdmin(currentUser)
      ?'<div style="display:flex;gap:6px;padding:5px 8px;border-top:1px solid var(--border);background:var(--surface)">'
        +'<button class="po-slot-btn po-slot-edit" onclick="poReport('+ti+',\''+which+'\','+ri+','+mi+')"><i class="ti ti-edit"></i> '+t('edit')+'</button>'
        +'<button class="po-slot-btn po-slot-del" onclick="deletePoDirect('+ti+',\''+which+'\','+ri+','+mi+')"><i class="ti ti-trash"></i> '+t('po_delete_btn')+'</button>'
        +'</div>'
      :'<div style="height:0"></div>';
    bot='<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 12px;background:var(--surface2);font-size:11px;border-top:1px solid var(--border)"><span style="color:var(--text2)">'+sc+'</span><span style="color:#085041;font-weight:700">✓ '+m.w+'</span></div>'+editRow;
  }else if(_poPending){
    // Resultado cargado esperando validación. Mostramos el marcador + reloj,
    // igual que en la tabla de grupos, y un botón que abre el modal existente
    // (openModal) que ya sabe manejar matches de playoff: el rival puede
    // disputar, el admin puede validar, todos pueden ver el detalle.
    const _pSetsStr = _poPending.sets&&_poPending.sets.length ? _poPending.sets.map(([a,b])=>a+'-'+b).join(' ') : '';
    // Iniciales del retirado (mismo criterio que en `sc`): en pending el
    // ganador viene explícito como `_poPending.winner`, no como `m.w`.
    const _pRetNm = (_poPending.wo && _pSetsStr && _poPending.poNames && _poPending.winner)
      ? (_poPending.poNames[0]===_poPending.winner?_poPending.poNames[1]:_poPending.poNames[0]) : '';
    const _pRetIn = _pRetNm ? getInitials(_pRetNm) : '';
    // Misma distinción WO vs RET que en `sc` arriba: con sets = RET (retiro),
    // sin sets = WO (walkover, no se presentó).
    const pSc = _poPending.np ? t('po_not_played')
              : _poPending.wo ? (_pSetsStr?(_pSetsStr+' RET'+(_pRetIn?' ('+_pRetIn+')':'')):'WO')
              : _pSetsStr;
    const disputed = _poPending.status === 'disputed';
    // Estilo del row del resultado: fondo warn con reloj para pending,
    // fondo disputa para disputed. Usa las mismas clases que grupos.
    const stCls = disputed ? 'cell-disputed' : 'cell-pending';
    const stIco = disputed ? '⚠️' : '⏳';
    const stLbl = disputed ? t('legend_disputed') : t('legend_pending');
    bot = '<div class="'+stCls+'" style="padding:5px 12px;font-size:11px;border-top:1px solid var(--border);text-align:center;cursor:pointer" onclick="openModal('+_poPending.id+')">'
        +   '<span style="font-weight:600">'+pSc+' '+stIco+'</span>'
        +   '<span style="font-size:10px;margin-left:6px;opacity:.85">'+stLbl+'</span>'
        + '</div>'
        // Fila de acciones inferior, mismo alto que la que se muestra cuando m.w existe,
        // para que las cajas del bracket queden alineadas en todas las rondas.
        + '<div style="display:flex;gap:6px;padding:5px 8px;border-top:1px solid var(--border);background:var(--surface)">'
        +   '<button class="po-slot-btn po-slot-edit" onclick="openModal('+_poPending.id+')"><i class="ti ti-eye"></i> '+t('review')+'</button>'
        + '</div>';
  }else if(canLoad){
    bot='<div style="padding:6px 8px;border-top:1px solid var(--border);text-align:center"><button class="po-load" onclick="poReport('+ti+',\''+which+'\','+ri+','+mi+')"><i class="ti ti-upload"></i> '+t('po_load_result')+'</button></div>'
      +(esAdmin(currentUser)?'<div style="height:34px"></div>':'');
  }else if(m.a&&m.b&&!m.w){
    bot='<div style="padding:5px 8px;border-top:1px solid var(--border);text-align:center"><span style="font-size:11px;color:var(--text2);font-style:italic">'+t('pending_match')+'</span></div>'
      +(esAdmin(currentUser)?'<div style="height:34px"></div>':'');
  }else{
    bot=esAdmin(currentUser)?'<div style="height:56px"></div>':'<div style="height:22px"></div>';
  }
  return '<div style="border:1px solid var(--border2);border-radius:10px;overflow:hidden;background:var(--surface);width:220px;flex-shrink:0;box-shadow:0 1px 4px rgba(0,0,0,.08)">'
    +hA+'<div class="'+(meA?'po-me-slot':'')+'" style="display:flex;align-items:center;padding:5px 10px 8px;border-bottom:1px solid var(--border);font-size:12px;min-height:32px;'+sA+iA+'"><span style="font-size:10px;color:var(--text2);min-width:22px;font-weight:600">'+seedA+'</span><span style="flex:1;font-weight:'+(aw?'700':'400')+'">'+clA+(meA?' <span class="po-me-chip">'+t('me_label')+'</span>':'')+'</span>'+histA+'</div>'
    +hB+'<div class="'+(meB?'po-me-slot':'')+'" style="display:flex;align-items:center;padding:5px 10px 8px;font-size:12px;min-height:32px;'+sB+iB+'"><span style="font-size:10px;color:var(--text2);min-width:22px;font-weight:600">'+seedB+'</span><span style="flex:1;font-weight:'+(bw?'700':'400')+'">'+clB+(meB?' <span class="po-me-chip">'+t('me_label')+'</span>':'')+'</span>'+histB+'</div>'
    +bot+'</div>';
}

function bracketHTML(rounds,ti,which){
  if(!rounds||!rounds.length)return'';
  const total=rounds.length;
  // BH = actual rendered box height (must match CSS)
  // 2 name headers (~15px each) + 2 slots (34px each) + result row (22px) + edit row (34px admin) = ~154px
  // Use consistent 160px so SVG always centers correctly
  const BW=220, BH=160, GAP=24, GX=72, LABEL_H=(currentUser&&currentUser.role==="admin"?90:58);
  // Slot connect offset: name header(14) + slot(34)/2 = 14+17 = 31 from top (first player slot center)
  // Second player slot center: 14+34+14+17 = 79
  // Mid-box connect point: (31+79)/2 = 55 from top of box
  const BOX_CONNECT=55;
  function slotSpacing(ri){ return Math.pow(2,ri)*(BH+GAP); }
  function matchCount(ri){ return rounds[ri].length; }
  function matchY(ri,mi){
    const sp=slotSpacing(ri);
    const n=matchCount(ri);
    const totalH=n*sp;
    const firstCenter=sp/2;
    return firstCenter+mi*sp;
  }
  const totalH=matchCount(0)*(BH+GAP);
  const svgH=totalH+LABEL_H;
  const totalW=total*(BW+GX);
  function rName(ri){const fe=total-1-ri;if(fe===0)return t('round_final');if(fe===1)return t('round_semi');if(fe===2)return t('round_quarters');if(fe===3)return t('round_16');if(fe===4)return t('round_32');return tf('round_n',{n:ri+1});}
  function rKey(ri){const fe=total-1-ri;if(fe===0)return 'r2';if(fe===1)return 'r4';if(fe===2)return 'r8';if(fe===3)return 'r16';if(fe===4)return 'r32';return 'r64';}
  function fmtD(s){if(!s)return '';const p=s.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:s;}
  function rDateLabel(ri){const k=rKey(ri);const f=PO_FECHAS[k];if(!f)return '';if(f.type==='range'&&f.from&&f.to)return fmtD(f.from)+' → '+fmtD(f.to);if(f.type==='single'&&f.date)return fmtD(f.date);if(typeof f==='string'&&f)return fmtD(f);return '';}
  let svg='';
  for(let ri=0;ri<total-1;ri++){
    const n=rounds[ri].length;
    const x1=ri*(BW+GX)+BW;
    const x2=(ri+1)*(BW+GX);
    const xm=x1+GX/2;
    for(let mi=0;mi<n;mi+=2){
      const yA=matchY(ri,mi);// yA/yB are box centers; adjust to slot centers
      const yB=matchY(ri,mi+1);
      const yM=(yA+yB)/2;
      const yN=matchY(ri+1,mi/2);
      svg+=`<line x1="${x1}" y1="${yA}" x2="${xm}" y2="${yA}" stroke="#C8D0DC" stroke-width="1.5"/>`;
      svg+=`<line x1="${x1}" y1="${yB}" x2="${xm}" y2="${yB}" stroke="#C8D0DC" stroke-width="1.5"/>`;
      svg+=`<line x1="${xm}" y1="${yA}" x2="${xm}" y2="${yB}" stroke="#C8D0DC" stroke-width="1.5"/>`;
      svg+=`<line x1="${xm}" y1="${yM}" x2="${x2}" y2="${yN}" stroke="#C8D0DC" stroke-width="1.5"/>`;
    }
  }
  let cols='';
  for(let ri=0;ri<total;ri++){
    const rd=rounds[ri];const isFirst=ri===0;
    const cx=ri*(BW+GX);
    // Single column div - header at top, matches absolutely positioned below
    cols+=`<div style="position:absolute;left:${cx}px;top:0;width:${BW}px">`;
    // Round name + date
    const dateStr=rDateLabel(ri);
    const rk=rKey(ri);
    const pf=PO_FECHAS[rk]||{type:'single',date:'',from:'',to:''};
    const isAdmin=esAdmin(currentUser);
    let dateLine='';
    if(isAdmin){
      const isSingle=pf.type==='single';
      const selHtml='<select onchange="setPoFechaType(\''+rk+'\',this.value);showPlayoffView()" style="font-size:10px;padding:2px 4px;border-radius:5px;border:1px solid var(--border2);background:var(--surface);margin-bottom:3px;width:100%"><option value="single" '+(isSingle?'selected':'')+'>'+t('po_date_single')+'</option><option value="range" '+(!isSingle?'selected':'')+'>'+t('po_date_range')+'</option></select>';
      const inpHtml=isSingle
        ?'<input type="date" value="'+attr(pf.date||'')+'" onchange="setPoFecha(\''+rk+'\',\'date\',this.value)" style="font-size:10px;padding:2px 6px;border-radius:5px;border:1px solid var(--border2);background:var(--surface);width:100%">'
        :'<div style="display:flex;gap:4px;align-items:center"><input type="date" value="'+attr(pf.from||'')+'" onchange="setPoFecha(\''+rk+'\',\'from\',this.value)" style="flex:1;font-size:10px;padding:2px 4px;border-radius:5px;border:1px solid var(--border2);background:var(--surface)"><span style="font-size:10px;color:var(--text2)">→</span><input type="date" value="'+attr(pf.to||'')+'" onchange="setPoFecha(\''+rk+'\',\'to\',this.value)" style="flex:1;font-size:10px;padding:2px 4px;border-radius:5px;border:1px solid var(--border2);background:var(--surface)"></div>';
      dateLine='<div style="margin-top:2px">'+selHtml+inpHtml+'</div>';
    } else if(dateStr){
      dateLine='<span style="font-size:11px;font-weight:700;color:var(--pri);letter-spacing:.03em">'+dateStr+'</span>';
    }
    cols+='<div style="text-align:center;height:'+LABEL_H+'px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px">'
      +'<span style="font-size:11px;font-weight:700;color:var(--pri);text-transform:uppercase;letter-spacing:.06em">'+rName(ri)+'</span>'
      +dateLine
      +'</div>';
    rd.forEach((m,mi)=>{
      const yc=matchY(ri,mi);
      const yTop=yc-BOX_CONNECT;
      cols+=`<div style="position:absolute;top:${LABEL_H+yTop}px;left:0;width:${BW}px">${matchBox(m,ti,which,ri,mi,isFirst)}</div>`;
    });
    cols+='</div>';
  }
  return `<div style="overflow-x:auto;padding:.5rem 0"><div style="position:relative;width:${totalW}px;height:${svgH}px;flex-shrink:0"><svg style="position:absolute;top:${LABEL_H}px;left:0;width:${totalW}px;height:${totalH}px;overflow:visible;pointer-events:none">${svg}</svg>${cols}</div></div>`;
}

function showPlayoffView(){
  const pv=document.getElementById('view-playoff');
  if(!pv)return;
  pv.style.display='block';
  ['grupos','general','cargar','pendientes','admin','perfil'].forEach(v=>{
    const el=document.getElementById('view-'+v);
    if(el)el.style.display='none';
  });
  if(!playoff.started&&!playoff.preview){
    pv.innerHTML=`<div class="card"><div class="empty">${t('po_not_yet')}</div></div>`;
    return;
  }
  try{
  const isAdmin=esAdmin(currentUser);
  let html='';

  if(playoff.preview&&!playoff.started){
    html+=`<div class="card po-preview-banner"><p class="pp-title"><i class="ti ti-eye"></i> ${t('po_preview_banner')}</p><p class="legend-txt" style="margin-top:0">${t('po_preview_hint')}</p>${isAdmin?`<button class="btn btn-accent" onclick="confirmPlayoffUI()"><i class="ti ti-check"></i> ${t('po_confirm_start')}</button>`:''}</div>`;
  }

  // Auto-jump to own bracket only on first visit (viewT starts at 0)
  if(currentUser&&currentUser.role==='player'&&playoff._autoJumped!==currentUser.name){
    const myTi=playoff.tramos.findIndex(tr=>tr.seeds.includes(currentUser.name));
    if(myTi>=0){playoff.viewT=myTi;playoff._autoJumped=currentUser.name;}
  }

  html+=`<div class="po-tramos">${playoff.tramos.map((tr,i)=>{
    const hasMe=currentUser&&currentUser.role==='player'&&tr.seeds.includes(currentUser.name);
    const badge=hasMe?'<span style="font-size:9px;background:var(--acc);color:var(--priD);border-radius:4px;padding:1px 4px;font-weight:700">✓</span>':'';
    return '<button class="po-tab '+(playoff.viewT===i?'active':'')+'" onclick="setViewT('+i+')">'+tf('po_match',{l:tr.label})+(badge?'&nbsp;'+badge:'')+'<br><span class="po-rng">'+tr.seeds.length+' '+t('po_tab_players')+'</span></button>';
  }).join('')}</div>`;

  const ti=playoff.viewT;
  const tr=playoff.tramos[ti];
  if(!tr){pv.innerHTML=html+`<div class="card"><div class="empty">${t('po_no_bracket')}</div></div>`;return;}

  if(isAdmin){
    const standingsOrder=playoff.qualified||[];
    const inPo={};playoff.tramos.forEach((tr2,ti2)=>tr2.seeds.forEach(n=>inPo[n]=ti2));
    const avail=ALLNAMES.filter(n=>!Object.keys(inPo).includes(n));
    function availLabel(n){return (USERS[n]&&USERS[n].inactive)?n+' (INACTIVO)':n;}
    const inOtherBrackets=standingsOrder.filter(n=>inPo[n]!==undefined&&inPo[n]!==ti);
    function rank(n){const r=standingsOrder.indexOf(n);return r>=0?r+1:'';}
    html+=`<div class="card"><div class="section-lbl">${tf('po_seeds_title',{l:tr.label})}</div>
    <div class="seed-list">${tr.seeds.map((n,idx)=>{const isFirst=idx===0;const isLast=idx===tr.seeds.length-1;return `<span class="seed-chip" style="${(USERS[n]&&USERS[n].inactive)?'background:#FCEBEB':''}"><span style="color:var(--text2);font-size:10px;min-width:18px;display:inline-block">#${rank(n)}</span> ${availLabel(n)} <button class="mv" onclick="moveSeedUpUI(${ti},'${jsq(n)}')" ${isFirst?'disabled':''} title="${t('po_seed_up')}" aria-label="${t('po_seed_up')}"><i class="ti ti-chevron-up"></i></button><button class="mv" onclick="moveSeedDownUI(${ti},'${jsq(n)}')" ${isLast?'disabled':''} title="${t('po_seed_down')}" aria-label="${t('po_seed_down')}"><i class="ti ti-chevron-down"></i></button><button class="rm" onclick="removeSeedUI(${ti},'${jsq(n)}')" aria-label="Quitar"><i class="ti ti-x"></i></button></span>`;}).join('')}</div>
    <div class="form-row" style="margin-top:.6rem">
      <div class="form-group"><label>${t('po_add_label')}</label><select id="po-add-${ti}"><option value="">${t('po_add_choose')}</option>${avail.map(n=>`<option value="${n}">#${rank(n)} ${availLabel(n)}</option>`).join('')}</select></div>
      <div class="form-group" style="align-self:end"><button class="btn btn-primary btn-sm" onclick="addSeedUI(${ti})"><i class="ti ti-plus"></i> ${t('po_add_btn')}</button></div>
    </div>
    <div class="form-row" style="margin-top:.4rem">
      <div class="form-group"><label>${t('po_move_from')}</label><select id="po-move-${ti}"><option value="">${t('po_choose_player')}</option>${inOtherBrackets.map(n=>`<option value="${n}">#${rank(n)} ${n} (${t('draw')} ${playoff.tramos[inPo[n]].label})</option>`).join('')}</select></div>
      <div class="form-group" style="align-self:end"><button class="btn btn-sm po-move-btn" onclick="moveSeedUI(${ti})"><i class="ti ti-arrows-exchange"></i> ${t('po_move_here')}</button></div>
    </div>
    <p class="legend-txt">${t('po_bye_note')}</p></div>`;
  }

  const finalM=tr.main&&tr.main.length?tr.main[tr.main.length-1][0]:null;
  const hayMainOrder = tr.mainOrder && tr.mainOrder.length;
  // El botón "Editar posiciones" (que abría un modal con lista + flechas)
  // se eliminó: ahora cada tarjeta del cuadro tiene su propio selector
  // inline (ver _selectorPosicionInline/aplicarPosicionInline) que permite
  // poner a CUALQUIER jugador en CUALQUIER posición sin ninguna
  // restricción de "compañero de partido" — el modal viejo, en cambio,
  // seguía atado a intercambios de a pares. Solo queda "Restaurar", que
  // sigue siendo útil para deshacer todos los reacomodos manuales de una
  // vez.
  const mainEditBtns = (isAdmin && hayMainOrder)
    ? '<button class="btn btn-sm" style="margin-left:8px" onclick="clearMainOrderUI('+ti+')"><i class="ti ti-refresh"></i> '+t('po_cons_clear_btn')+'</button>'
    : '';
  html+=`<div class="card"><div class="po-section-title"><i class="ti ti-trophy"></i> ${tf('po_main_title',{l:tr.label})}${mainEditBtns}</div>${bracketHTML(tr.main,ti,'main')}${finalM&&finalM.w?`<div class="champ-card"><div class="lbl">${tf('po_champ',{l:tr.label})}</div><div class="who"><i class="ti ti-crown"></i> <span class="nm-link" onclick="showPlayerHistory('${jsq(finalM.w)}')">${finalM.w}</span></div></div>`:''}</div>`;
  if(tr.cons){
    const cf=tr.cons[tr.cons.length-1][0];
    const hayOverrides = tr.consOverrides && Object.keys(tr.consOverrides).length;
    // "Editar jugadores" de consolación se mantiene, pero AHORA solo para
    // REEMPLAZOS (traer a alguien de afuera de esta consolación, o sacar a
    // alguien sin reemplazo) — la parte de POSICIONES que tenía antes
    // (flechas ↑↓ + selector con la limitación de pares) se sacó, porque
    // el selector inline de cada tarjeta ya cubre eso mejor y sin esa
    // limitación.
    const consEditBtns = isAdmin
      ? '<button class="btn btn-sm" style="margin-left:8px" onclick="editConsOverrideUI('+ti+')"><i class="ti ti-edit"></i> '+t('po_cons_edit_btn')+'</button>'
        + (hayOverrides ? '<button class="btn btn-sm" style="margin-left:4px" onclick="clearConsOverridesUI('+ti+')"><i class="ti ti-refresh"></i> '+t('po_cons_clear_btn')+'</button>' : '')
      : '';
    html+=`<div class="card"><div class="po-section-title po-cons-title"><i class="ti ti-shield"></i> ${tf('po_cons_title',{l:tr.label})}${consEditBtns}</div>${bracketHTML(tr.cons,ti,'cons')}${cf&&cf.w?`<div class="champ-card champ-cons"><div class="lbl">${tf('po_champ_cons',{l:tr.label})}</div><div class="who"><span class="nm-link" onclick="showPlayerHistory('${jsq(cf.w)}')">${cf.w}</span></div></div>`:''}</div>`;
  }

  html+=`<div class="card legend-card"><p class="legend-txt">${t('po_legend')}</p></div>`;
  pv.innerHTML=html;
  }catch(err){
    console.error('showPlayoffView ERROR:',err);
    pv.innerHTML='<div class="card"><div class="empty" style="color:red">Error al mostrar playoffs: '+err.message+'</div></div>';
  }
}
function removePlayerUI(name,fromG){removePlayerCycle(name,fromG);renderAdmin();toast(name+' quitado del ciclo.');persist(true);}

function resetCycleUI(n){
  // Mismo criterio que retroceder: con playoffs activos, cambiar resultados de un
  // ciclo altera la general con la que se armaron los cuadros.
  if(playoff.started||playoff.preview){
    alert('⚠️ Los Play Offs están '+(playoff.started?'iniciados':'en previsualización')+'.\n\nBorrar los partidos de un ciclo cambiaría la Clasificación General con la que se armaron los cuadros.\n\nPrimero reinicia los Play Offs (Admin → Reiniciar Play Offs) y después reinicia el ciclo.');
    return;
  }
  if(!confirm(tf('reset_confirm_cycle',{n})))return;
  // Solo se borran los PARTIDOS del ciclo. Los grupos, sus jugadores, los movimientos
  // entre grupos y los inactivos se conservan exactamente como están. Antes se
  // reseteaba la estructura entera al estado inicial (C1 hardcodeado), lo que perdía
  // todos los movimientos de jugadores que el admin había hecho durante el ciclo.
  matches=matches.filter(m=>m.cycle!==n);
  // Limpiar editMode colgado (el ciclo pasa a activo normal, no necesita el flag).
  cycles.forEach(cx=>delete cx.editMode);
  // El ciclo se reabre (status='active') y todos los ciclos posteriores se bloquean.
  cycles[n-1].status='active';
  for(let i=n;i<cycles.length;i++){
    cycles[i].status='locked';
    cycles[i].groups=null;  // los ciclos posteriores se limpian igual: su estructura
  }                          // se armaría al cerrar el ciclo N de nuevo.
  activeN=n;
  viewCycle=n;
  persist(true);renderShell();showSub('admin');toast(t('reset_done'));
}

// Habilita/deshabilita la carga de partidos en un ciclo cerrado.
// Con editMode=true, jugadores y admins pueden cargar en ese ciclo desde "Cargar".
// Solo un ciclo puede tener editMode activo a la vez (se desactiva el anterior).
function toggleEditMode(n){
  const c2=cycles[n-1]; if(!c2)return;
  // Solo tiene sentido en ciclos cerrados: el activo ya permite cargar normalmente.
  if(!c2.editMode && c2.status!=='finished'){toast('El Ciclo '+n+' no está cerrado; ya se puede cargar normalmente.');return;}
  if(c2.editMode){
    delete c2.editMode;
    toast('Carga deshabilitada en Ciclo '+n+'. El ciclo volvió a estar cerrado.');
  }else{
    cycles.forEach(cx=>delete cx.editMode);
    c2.editMode=true;
    toast('Carga habilitada en Ciclo '+n+'. Puedes cargar resultados desde Grupos o Cargar.');
  }
  persist(true);
  // Navegar al ciclo habilitado para que se vean los "+" en la matriz
  if(c2.editMode){
    viewCycle=n;
    renderShell();
    showSub('grupos');
  }else{
    renderAdmin();
  }
}
// Los partidos del ciclo N se CONSERVAN, solo se reabre para seguir cargando.
// Es distinto de resetCycleUI (que borra partidos): esto simplemente "deshace" el
// cierre del ciclo anterior para poder seguir cargando resultados en él.
// Útil cuando se cerró un ciclo por error o hay partidos pendientes de cargar.
function retrocederCicloUI(){
  // Solo tiene sentido si hay al menos 2 ciclos y el activo no es el primero
  if(activeN<=1){toast('Ya estás en el primer ciclo, no hay ciclo anterior al que volver.');return;}
  // Con playoffs activos, retroceder deja los cuadros inconsistentes (se armaron
  // con la clasificación general completa). Hay que reiniciarlos primero.
  if(playoff.started||playoff.preview){
    alert('⚠️ Los Play Offs están '+(playoff.started?'iniciados':'en previsualización')+'.\n\nRetroceder un ciclo cambiaría la Clasificación General con la que se armaron los cuadros.\n\nPrimero reinicia los Play Offs (Admin → Reiniciar Play Offs) y después retrocede el ciclo.');
    return;
  }
  const cycAnterior=activeN-1;
  const cAnterior=cycles[cycAnterior-1];
  if(!cAnterior){toast('No existe el ciclo anterior.');return;}
  if(!confirm('RETROCEDER AL CICLO '+cycAnterior+'\n\n'
    +'Esto reabre el Ciclo '+cycAnterior+' como activo y descarta la estructura del Ciclo '+activeN+'.\n\n'
    +'Los PARTIDOS del Ciclo '+cycAnterior+' se conservan. Los del Ciclo '+activeN+' también se borran '
    +'(si quieres conservarlos, primero exporta un backup).\n\n'
    +'¿Continuar?'))return;
  // Borrar partidos del ciclo actual (el que se está "deshaciendo")
  matches=matches.filter(m=>m.cycle!==activeN);
  // Limpiar cualquier editMode colgado: al retroceder, el ciclo destino pasa a ser
  // el activo normal (no necesita editMode) y el descartado deja de existir.
  cycles.forEach(cx=>delete cx.editMode);
  // Desbloquear el ciclo anterior
  cycles[cycAnterior-1].status='active';
  // Borrar la estructura del ciclo actual (que se armó al cerrar el anterior)
  cycles[activeN-1].status='locked';
  cycles[activeN-1].groups=null;
  activeN=cycAnterior;
  viewCycle=cycAnterior;
  persist(true);renderShell();showSub('admin');
  toast('Ciclo '+cycAnterior+' reabierto. Puedes seguir cargando resultados.');
}
function resetPlayoffUI(){if(!confirm(t('reset_confirm_po')))return;playoff={started:false,numTramos:4,tramos:[],results:{},viewT:0,qualified:[],preview:false,forcedSize:0};matches=matches.filter(m=>!m.po);Object.keys(PO_FECHAS).forEach(k=>{PO_FECHAS[k]={type:'single',date:'',from:'',to:''};});if(viewCycle==='po')viewCycle=activeN;persist(true);renderShell();showSub('admin');toast(t('reset_done'));}
function setPoNum(v){
  const newV=+v;
  if(playoff.started&&newV!==playoff.numTramos){
    if(!confirm('⚠️ Los Play Offs ya están iniciados. Cambiar la cantidad de cuadros va a reorganizar todos los jugadores y se perderán los resultados ya cargados. ¿Confirmar cambio a '+newV+' cuadros?')){
      const sel=document.querySelector('[onchange*="setPoNum"]');
      if(sel)sel.value=playoff.numTramos;
      return;
    }
  }
  playoff.numTramos=newV;
  if(playoff.started||playoff.preview){setNumTramos(newV);persist(true);}
}

function setPoSize(v){
  const newV=+v;
  if(playoff.started&&newV!==playoff.forcedSize){
    if(!confirm('⚠️ Los Play Offs ya están iniciados. Cambiar el tamaño del cuadro va a reorganizar los brackets y se perderán los resultados ya cargados. ¿Confirmar?')){
      const sel=document.querySelector('[onchange*="setPoSize"]');
      if(sel)sel.value=playoff.forcedSize||0;
      return;
    }
  }
  playoff.forcedSize=newV;
  if(playoff.started||playoff.preview){rebuildAll();showPlayoffView();toast('Tamaño del cuadro actualizado.');}
}
function addPlayerUI(){
  const nom=(document.getElementById('ap-nom').value||'').trim();
  const ape=(document.getElementById('ap-ape').value||'').trim();
  const gid=+document.getElementById('ap-grp').value;
  const full=(nom+' '+ape).trim();
  if(!nom||!ape){toast(t('add_fill_both'));return;}
  if(!gid){toast(t('add_choose_group'));return;}
  // Verificar si ya está en algún grupo activo (no solo en USERS/ALLNAMES)
  const inAnyGroup = cycles.some(c=>c.groups&&c.groups.some(g=>(g.players||[]).includes(full)));
  if(inAnyGroup){toast(t('add_exists'));return;}
  // Si existe en USERS pero no en ningún grupo, limpiarlo y re-agregar
  if(USERS[full]) delete USERS[full];
  const idxA = ALLNAMES.indexOf(full);
  if(idxA>=0) ALLNAMES.splice(idxA,1);
  addPlayerToCycle(full,gid);
  renderPerfil();toast(tf('add_done',{name:full,g:groupName(gid)}));
  // Primero guardar, DESPUÉS refrescar la lista: /api/users lee de la base,
  // así que si refrescáramos antes traeríamos la lista sin el jugador nuevo.
  persist(true).then(initLogin);
}
function setDestino(gid,pos,val){ensureDestino(gid,pos+1);DESTINO[gid][pos]='G'+val;if(subView==='admin')renderAdmin();toast(groupName(gid)+' · '+(pos+1)+'º → '+groupName(+val));persist(true);}
function destinoCard(){
  const grps=cycles[activeN-1]?.groups || [];
  if(!grps.length) return '';
  let html=`<div class="card"><div class="section-lbl">${t('promotions_title')}</div><p class="legend-txt" style="margin-top:0">${t('promotions_hint')}</p><div class="grpedit">`;
  const totalGrps=grps.length;
  grps.forEach(function(g,gi){
    const gid=gi+1;
    const len=Math.max(1,(g.players||[]).length);
    ensureDestino(gid,len);
    html+=`<div class="ge-group"><div class="ge-gtitle">${groupName(gid)} (${(g.players||[]).length})</div>`;
    for(let pos=0;pos<len;pos++){
      const cur=parseInt((DESTINO[gid][pos]||('G'+Math.min(gid+1,totalGrps))).replace('G',''));
      html+=`<div class="ge-row"><span class="ge-nm">${tf('pos_goes_to',{pos:pos+1})}</span><select class="ge-sel" onchange="setDestino(${gid},${pos},this.value)">`;
      for(let k=0;k<totalGrps;k++){
        html+=`<option value="${k+1}"${cur===k+1?' selected':''}>${groupName(k+1)}</option>`;
      }
      html+='</select></div>';
    }
    html+='</div>';
  });
  return html+'</div></div>';
}
function setFecha(i,v){FECHAS[i]=v;updateHdr();renderCycleBar();toast('Fecha del Ciclo '+(i+1)+' actualizada.');persist(true);}
async function previewPlayoffUI(){
  if(!previewPlayoff()){toast(t('po_need_3cycles'));return;}
  const gen=computeGeneral();
  if(!gen||gen.length<2){toast('No hay suficientes jugadores activos para armar los Play Offs. Verifica que haya al menos 2 jugadores activos.');return;}
  viewCycle='po';renderCycleBar();showPlayoffView();renderSubTabs();
  toast('⏳ Guardando previsualización…');
  const ok=await _criticalSave();
  if(ok){
    toast(t('po_preview_toast'));
  }else{
    // Revertir si no se pudo guardar
    playoff.preview=false;
    renderCycleBar();
    alert('⚠️ No se pudo guardar la previsualización de Play Offs.\n\n'+(_lastSaveError||'Error desconocido')+'\n\nRecarga la página y vuelve a intentarlo.');
  }
}
async function confirmPlayoffUI(){
  if(!confirmPlayoff())return;
  // Mostrar al usuario que el proceso está en curso antes de hacer el fetch
  toast('⏳ Iniciando Play Offs…');
  const ok=await _criticalSave();
  if(ok){
    renderCycleBar();showPlayoffView();renderSubTabs();
    toast(t('po_confirmed_toast'));
  }else{
    // Revertir el estado en memoria ya que no se pudo guardar
    playoff.started=false;playoff.preview=true;
    renderCycleBar();showPlayoffView();renderSubTabs();
    // Usar alert para que el usuario no lo pierda (no desaparece solo)
    alert('⚠️ No se pudo guardar el inicio de los Play Offs.\n\n'+(_lastSaveError||'Error desconocido')+'\n\nRecarga la página y vuelve a intentarlo.\nSi el problema persiste, contacta al desarrollador.');
  }
}
