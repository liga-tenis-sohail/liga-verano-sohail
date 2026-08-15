// ============================================================
// rating.js — Sistema de rating estilo UTR (SEPARADO de la app)
// Se carga DESPUÉS del script principal. Usa las globales de la app
// (USERS, matches, cycles, t, getInitials, esCuentaSistema, jsq, attr,
//  persist, toast, showSub, subView, RATING_ON, RATING_SEEDS, RATING_OVERRIDES).
// Si este archivo falla, la liga sigue funcionando (la app tiene guardas).
// ============================================================
(function(){
'use strict';
// ==================== MOTOR DE RATING UTR ====================
// ============================================================
// MOTOR DE RATING ESTILO UTR — Liga de Tenis
// Escala 1-16 · semilla = punto de partida · recencia · provisional@10 · STB=mini-set
// Calcula sobre TODAS las ligas (actual + pasadas).
// ============================================================
// Constantes del rating (ajustables desde un solo lugar)
const UTR_MIN = 1, UTR_MAX = 16;
const UTR_ESCALA = 4;          // puntos UTR por "década" de la curva logística
const UTR_PROV = 10;           // partidos para dejar de ser provisional
const UTR_DECAY = 0.97;        // recencia: peso = DECAY^(antigüedad en partidos)
const UTR_STB_PESO = 0.4;      // un supertiebreak pesa como 0.4 de un set normal
const UTR_VENTANA = 50;        // solo los últimos N partidos de cada jugador (sin límite de tiempo)
const UTR_ITER = 60, UTR_K = 0.35;

// Marca, para cada partido, si entra en la ventana de últimos UTR_VENTANA de
// CADA uno de sus dos jugadores. Devuelve un mapa i -> {ventanaA, ventanaB}
// que dice si ese partido cuenta para el rating de A y/o de B.
// Así el rating de cada jugador usa solo SUS 50 más recientes, aunque el rival
// tenga más o menos historia. (Recibe partidos ordenados por fecha ASC.)
function utrMarcarVentana(partidos, jugadores){
  const cuenta = {}; jugadores.forEach(j => cuenta[j] = 0);
  const marca = partidos.map(() => ({ ventanaA: false, ventanaB: false }));
  for(let i = partidos.length - 1; i >= 0; i--){   // del más nuevo al más viejo
    const p = partidos[i];
    if(cuenta[p.a] !== undefined && cuenta[p.a] < UTR_VENTANA){ marca[i].ventanaA = true; cuenta[p.a]++; }
    if(cuenta[p.b] !== undefined && cuenta[p.b] < UTR_VENTANA){ marca[i].ventanaB = true; cuenta[p.b]++; }
  }
  return marca;
}

// % de games esperado para A según la diferencia de rating con B (logística)
function utrExpected(rA, rB){ return 1 / (1 + Math.pow(10, -(rA - rB) / UTR_ESCALA)); }

// Extrae de un partido los games de cada lado y si tuvo supertiebreak.
// sets = [[6,4],[3,6],[1,0]] → los 2 primeros son sets, el 3ro (si está) es STB.
// Devuelve {gamesA, gamesB, esSTB} contando el STB como mini-set con menos peso.
function utrGamesDePartido(sets){
  if(!Array.isArray(sets)) return null;
  let gA = 0, gB = 0, esSTB = false;
  sets.forEach((s, i) => {
    if(!Array.isArray(s) || s.length < 2) return;
    const x = +s[0], y = +s[1];
    if(!isFinite(x) || !isFinite(y)) return;
    if(i === 2){ // 3er "set" = supertiebreak: cuenta como mini-set (1 game al ganador)
      esSTB = true;
      gA += x > y ? 1 : 0;
      gB += y > x ? 1 : 0;
    } else {
      gA += x; gB += y;
    }
  });
  return { gamesA: gA, gamesB: gB, esSTB };
}

// Recolecta todos los partidos "rateables" de un estado de liga (matches).
// Cada uno: {a, b, gamesA, gamesB, fecha, esSTB}. Orienta A=aName, B=bName.
function utrPartidosDeEstado(estado){
  const out = [];
  const ms = (estado && estado.matches) || [];
  ms.forEach(m => {
    if(!m || m.status !== 'confirmed' || m.np) return;
    // Nombres: partido normal usa aName/bName; playoff usa poNames
    let a, b;
    if(m.po && m.poNames){ a = m.poNames[0]; b = m.poNames[1]; }
    else { a = m.aName; b = m.bName; }
    if(!a || !b) return;
    // W.O.: sin games reales, se puede contar como victoria mínima o saltar.
    if(m.wo){ return; }  // los W.O. no aportan info de nivel: se saltan
    const g = utrGamesDePartido(m.sets);
    if(!g || (g.gamesA + g.gamesB) === 0) return;
    out.push({ a, b, gamesA: g.gamesA, gamesB: g.gamesB, fecha: m.date || '', esSTB: g.esSTB });
  });
  return out;
}

// Núcleo iterativo: dado el set de jugadores, partidos (ordenados por fecha ASC)
// y las semillas del admin, devuelve {jugador: {rating, partidos, provisional, fiab}}.
// Núcleo iterativo. Parámetros:
//   jugadores: lista de nombres
//   partidos: todos, ordenados por fecha ASC
//   semillas: {jugador: valor} punto de partida que da el admin (opcional)
//   overrides: {jugador: valor} rating FIJO puesto a mano por el admin (opcional).
//     Si un jugador tiene override, ese valor manda y reemplaza el calculado.
function utrCalcular(jugadores, partidos, semillas, overrides){
  overrides = overrides || {};
  const R = {};
  jugadores.forEach(j => R[j] = (semillas && semillas[j] != null) ? semillas[j] : 8);

  // Marca qué partidos entran en la ventana de últimos 50 de cada jugador.
  const marca = utrMarcarVentana(partidos, jugadores);

  // Antigüedad por jugador (0 = su último partido dentro de la ventana) y
  // conteo de partidos usados por jugador (para provisional/fiabilidad).
  const idxPorJugador = {}; jugadores.forEach(j => idxPorJugador[j] = []);
  partidos.forEach((p, i) => {
    if(idxPorJugador[p.a] && marca[i].ventanaA) idxPorJugador[p.a].push(i);
    if(idxPorJugador[p.b] && marca[i].ventanaB) idxPorJugador[p.b].push(i);
  });
  const antig = {};
  partidos.forEach((p, i) => { antig[i] = {}; });
  jugadores.forEach(j => {
    const lista = idxPorJugador[j], n = lista.length;
    lista.forEach((idx, k) => { antig[idx][j] = n - 1 - k; });
  });

  for(let it = 0; it < UTR_ITER; it++){
    const acc = {}, pes = {};
    jugadores.forEach(j => { acc[j] = 0; pes[j] = 0; });
    partidos.forEach((p, i) => {
      const tot = p.gamesA + p.gamesB;
      if(tot === 0) return;
      const realA = p.gamesA / tot;
      const expA = utrExpected(R[p.a], R[p.b]);
      const errorA = realA - expA;
      const objA = R[p.a] + errorA * UTR_ESCALA;
      const objB = R[p.b] - errorA * UTR_ESCALA;
      const tipo = p.esSTB ? UTR_STB_PESO : 1;
      // Solo aporta al jugador si el partido está en SU ventana de 50.
      if(marca[i].ventanaA && antig[i][p.a] !== undefined){
        const wA = Math.pow(UTR_DECAY, antig[i][p.a]) * tipo;
        acc[p.a] += objA * wA; pes[p.a] += wA;
      }
      if(marca[i].ventanaB && antig[i][p.b] !== undefined){
        const wB = Math.pow(UTR_DECAY, antig[i][p.b]) * tipo;
        acc[p.b] += objB * wB; pes[p.b] += wB;
      }
    });
    jugadores.forEach(j => {
      const nP = idxPorJugador[j].length;
      if(pes[j] > 0){
        let target = acc[j] / pes[j];
        // La semilla actúa como un "partido virtual" que se diluye con más partidos.
        if(semillas && semillas[j] != null){
          const pesoSemilla = Math.max(0, 3 - nP * 0.3); // ~3 al inicio → 0 tras 10 partidos
          if(pesoSemilla > 0) target = (target * pes[j] + semillas[j] * pesoSemilla) / (pes[j] + pesoSemilla);
        }
        R[j] = R[j] * (1 - UTR_K) + target * UTR_K;
        R[j] = Math.max(UTR_MIN, Math.min(UTR_MAX, R[j]));
      }
    });
  }

  const info = {};
  jugadores.forEach(j => {
    const nP = idxPorJugador[j].length;   // partidos realmente usados (máx 50)
    const calc = R[j];                    // rating calculado por resultados
    const ov = overrides[j];
    const tieneOverride = (ov != null && isFinite(ov));
    info[j] = {
      rating: tieneOverride ? Math.max(UTR_MIN === 1 ? 0.01 : UTR_MIN, Math.min(UTR_MAX, +ov)) : calc,
      ratingCalculado: calc,              // el que salió del cálculo (para que el admin compare)
      manual: tieneOverride,              // true si el admin lo fijó a mano
      partidos: nP,
      provisional: !tieneOverride && nP < UTR_PROV,   // un valor manual no es provisional
      fiab: Math.min(100, Math.round(100 * nP / UTR_PROV))
    };
  });
  return info;
}

// ==================== FIN MOTOR UTR ====================

// ---- Orquestador del rating: junta todas las ligas, calcula y cachea ----
let _ratingCache = null;      // { info:{jugador:{rating,...}}, ts:Date }
let _ratingCalculando = false;

// Devuelve los seeds y overrides guardados en el estado actual.
function _ratingSeeds(){ return (typeof RATING_SEEDS !== 'undefined' && RATING_SEEDS) ? RATING_SEEDS : {}; }
function _ratingOverrides(){ return (typeof RATING_OVERRIDES !== 'undefined' && RATING_OVERRIDES) ? RATING_OVERRIDES : {}; }

// Calcula el rating de todos, cargando la liga actual + las pasadas.
// Guarda el resultado en _ratingCache. force=true recalcula aunque haya caché.
async function calcularRatingGlobal(force){
  if(_ratingCalculando) return _ratingCache;
  if(_ratingCache && !force) return _ratingCache;
  _ratingCalculando = true;
  try{
    // 1) Partidos de la liga actual (en memoria)
    let todos = utrPartidosDeEstado({ matches: matches });
    // 2) Partidos de las ligas pasadas (fetch)
    try{
      const r = await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'listar'})});
      const d = await r.json().catch(()=>({}));
      const pasadas = (d.ligas||[]).filter(l=>l.estado==='finalizada');
      for(const l of pasadas){
        try{
          const rv = await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'ver',id:l.id})});
          if(!rv.ok) continue;
          const dv = await rv.json().catch(()=>({}));
          const ps = utrPartidosDeEstado(dv.estado||{});
          ps.forEach(x=>todos.push(x));
        }catch(_){}
      }
    }catch(_){}
    // 3) Ordenar todos los partidos por fecha ASC (para recencia y ventana)
    todos.sort((a,b)=>{ const fa=a.fecha||'', fb=b.fecha||''; return fa.localeCompare(fb); });
    // 4) Lista de jugadores: todos los que aparecen en algún partido + los del estado
    const setJ = {};
    todos.forEach(p=>{ setJ[p.a]=1; setJ[p.b]=1; });
    Object.keys(USERS||{}).forEach(n=>{ if(!esCuentaSistema(n)) setJ[n]=1; });
    const jugadores = Object.keys(setJ);
    // 5) Calcular con seeds y overrides del admin
    const info = utrCalcular(jugadores, todos, _ratingSeeds(), _ratingOverrides());
    _ratingCache = { info, ts: new Date() };
    return _ratingCache;
  } finally {
    _ratingCalculando = false;
  }
}

// Rating de un jugador desde el caché (para la columna de grupos y la ficha).
// Devuelve el objeto {rating, provisional, manual, partidos, ...} o null.
function ratingUTRDe(name){
  if(!_ratingCache || !_ratingCache.info) return null;
  return _ratingCache.info[name] || null;
}
// Rating formateado a 2 decimales, o '' si no hay.
function ratingUTRfmt(name){
  const r = ratingUTRDe(name);
  return (r && typeof r.rating === 'number') ? r.rating.toFixed(2) : '';
}

function ratingCompleto(ciclos){
  const N = ciclos.map((c) => c.v + c.d);
  const fm = N.map(_factorMuestra);
  const ef = ciclos.map((c) => _eficienciaCiclo(c.v, c.d));
  const aj = ciclos.map((c) => _ajusteCiclo(c.v, c.d));
  const no = ciclos.map((c) => _notaCiclo(c.grupo, c.v, c.d));
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const partidos = sum(N);
  const ganados = sum(ciclos.map((c) => c.v));
  const perdidos = sum(ciclos.map((c) => c.d));
  const sumFm = sum(fm);
  const nivelMedio = sum(no.map((x, i) => x * fm[i])) / sumFm;
  const eficMedia = sum(ef.map((x, i) => x * fm[i])) / sumFm;
  const grupoMedio = sum(ciclos.map((c, i) => c.grupo * N[i])) / partidos;
  const valorBaseMedio = 9.6 - 0.35 * (grupoMedio - 1);
  const ajusteEficMedio = sum(aj) / aj.length;
  const w = ciclos.map((c, i) => N[i] * _valorBase(c.grupo));
  const eficPonderada = 1 + 9 * sum(ef.map((e, i) => e * w[i])) / sum(w);
  const fiabilidad = 10 * (1 - Math.exp(-partidos / 11.2));
  const rating = 0.85 * nivelMedio + 0.10 * eficPonderada + 0.05 * fiabilidad;
  return { rating, nivelMedioCiclo: nivelMedio, fiabilidad, grupoMedio,
    valorBaseMedio, ajusteEficMedio, eficienciaMedia: eficMedia,
    eficienciaPonderada: eficPonderada,
    puntosPorPartido: (3 * ganados + perdidos) / partidos,
    partidos, ganados, perdidos, porcentajeVictorias: 100 * ganados / partidos };
}

function ciclosDeJugador(name){
  const out = [];
  for(let cy = 1; cy <= cycles.length; cy++){
    const c = cycles[cy-1];
    if(!c || !c.groups) continue;
    const loc = findLoc(name, cy);
    if(!loc) continue;  // no jugó ese ciclo / no está en ningún grupo
    const st = computeStats(cy, loc.g).find(s => s.name === name);
    if(!st) continue;
    const v = st.g, d = st.p;  // g = ganados, p = perdidos
    if(v + d < 1) continue;    // ciclo sin partidos jugados: se excluye
    out.push({ grupo: loc.g, v, d });
  }
  return out;
}

function tablaRating(){
  const filas = [];
  Object.keys(USERS).forEach(name => {
    if(esCuentaSistema(name)) return;         // 'admin'/'superadmin' no son jugadores
    if(USERS[name] && USERS[name].inactive) return;
    const ciclos = ciclosDeJugador(name);
    if(!ciclos.length) return;                // sin partidos: no aparece
    const r = ratingCompleto(ciclos);
    filas.push({ name, ...r, nCiclos: ciclos.length });
  });
  filas.sort((a, b) => b.rating - a.rating);
  return filas;
}

function ratingDe(name){
  try{
    const ciclos = ciclosDeJugador(name);
    if(!ciclos.length) return '';
    const r = ratingCompleto(ciclos);
    return (r && typeof r.rating === 'number') ? r.rating.toFixed(1) : '';
  }catch(_){ return ''; }
}

function renderRating(){
  const box = document.getElementById('view-rating');
  if(!box) return;
  const admin = esAdmin(currentUser);
  // Si el rating todavía no se calculó, lo lanzamos y mostramos "cargando".
  if(!_ratingCache){
    box.innerHTML = `<div class="card"><div class="lock-note" style="padding:1rem 0;text-align:center">${t('past_loading')}</div></div>`;
    calcularRatingGlobal(false).then(()=>{ try{ if(subView==='rating') renderRating(); }catch(_){}});
    return;
  }
  const info = _ratingCache.info || {};
  // Armar filas: jugadores con al menos 1 partido O con seed/override puesto.
  const seeds = _ratingSeeds(), overs = _ratingOverrides();
  let filas = Object.keys(info).map(name=>({ name, ...info[name] }))
    .filter(f => f.partidos > 0 || seeds[f.name] != null || overs[f.name] != null)
    .filter(f => !esCuentaSistema(f.name));
  filas.sort((a,b)=> b.rating - a.rating);
  if(!filas.length){
    box.innerHTML = `<div class="card"><div class="lock-note" style="padding:1rem 0;text-align:center">${t('rating_empty')}</div></div>`;
    return;
  }
  const rows = filas.map((f,i)=>{
    const pos = i+1;
    const medal = pos===1?'pos-1':pos===2?'pos-2':pos===3?'pos-3':'';
    const prov = f.provisional ? `<span class="rt-prov" title="${t('rt_prov_t')}">${t('rt_prov')}</span>` : '';
    const manual = f.manual ? `<span class="rt-manual" title="${t('rt_manual_t')}">${t('rt_manual')}</span>` : '';
    const accion = admin
      ? `<td class="rt-actions"><button class="btn btn-sm" onclick="abrirAjusteRating('${jsq(f.name)}')"><i class="ti ti-adjustments"></i> ${t('rt_adjust')}</button></td>`
      : '';
    return `<tr>
      <td><span class="pos-badge ${medal}">${pos}</span></td>
      <td class="rt-name"><span class="avatar">${getInitials(f.name)}</span><span class="nm-link" onclick="showPlayerHistory('${jsq(f.name)}')">${attr(f.name)}</span></td>
      <td class="rt-big">${f.rating.toFixed(2)}${prov}${manual}</td>
      <td class="rt-pj">${f.partidos}</td>
      ${accion}
    </tr>`;
  }).join('');
  const thAcc = admin ? `<th>${t('rt_adjust')}</th>` : '';
  box.innerHTML = `
    <div class="card">
      <div class="rt-header">
        <div><h3 style="margin:0">${t('rating_title')}</h3><div class="rt-sub">${t('rt_desc_utr')}</div></div>
      </div>
      <div class="table-wrap">
        <table class="tbl rt-table">
          <thead><tr><th>#</th><th>${t('player')}</th><th>${t('rating_col')}</th><th>${t('rt_pj')}</th>${thAcc}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="rt-legend">
        <span><span class="rt-prov">${t('rt_prov')}</span> ${t('rt_prov_leg')}</span>
        <span><span class="rt-manual">${t('rt_manual')}</span> ${t('rt_manual_leg')}</span>
      </div>
    </div>`;
}

function abrirAjusteRating(name){
  const info = ratingUTRDe(name) || {};
  const seed = _ratingSeeds()[name];
  const over = _ratingOverrides()[name];
  document.getElementById('modal-title').textContent = t('rt_adjust')+': '+name;
  const calc = (typeof info.ratingCalculado==='number') ? info.ratingCalculado.toFixed(2) : (typeof info.rating==='number'?info.rating.toFixed(2):'—');
  document.getElementById('modal-body').innerHTML = `
    <div class="rt-adj">
      <div class="rt-adj-calc">${t('rt_calc_now')}: <b>${calc}</b> · ${info.partidos||0} ${t('rt_pj_lc')}</div>
      <label class="rt-adj-lbl">${t('rt_seed_lbl')}</label>
      <div class="rt-adj-hint">${t('rt_seed_hint')}</div>
      <input id="rt-seed" class="cl-inp" type="number" step="0.01" min="1" max="16" value="${seed!=null?seed:''}" placeholder="${t('rt_empty_ph')}">
      <label class="rt-adj-lbl" style="margin-top:12px">${t('rt_over_lbl')}</label>
      <div class="rt-adj-hint">${t('rt_over_hint')}</div>
      <input id="rt-over" class="cl-inp" type="number" step="0.01" min="0.01" max="16" value="${over!=null?over:''}" placeholder="${t('rt_empty_ph')}">
    </div>`;
  document.getElementById('modal-actions').innerHTML = `
    <button class="btn" onclick="closeM()">${t('cancel')}</button>
    <button class="btn btn-primary" onclick="guardarAjusteRating('${jsq(name)}')">${t('save')}</button>`;
  document.getElementById('modal-bg').classList.add('open');
}

async function guardarAjusteRating(name){
  const sv = (document.getElementById('rt-seed').value||'').trim();
  const ov = (document.getElementById('rt-over').value||'').trim();
  // Validar rangos
  if(sv!==''){ const n=+sv; if(!isFinite(n)||n<1||n>16){ alert(t('rt_seed_bad')); return; } RATING_SEEDS[name]=Math.round(n*100)/100; }
  else { delete RATING_SEEDS[name]; }
  if(ov!==''){ const n=+ov; if(!isFinite(n)||n<0.01||n>16){ alert(t('rt_over_bad')); return; } RATING_OVERRIDES[name]=Math.round(n*100)/100; }
  else { delete RATING_OVERRIDES[name]; }
  closeM();
  toast(t('rt_saved'));
  await persist(true);                 // guardar en la base
  await calcularRatingGlobal(true);    // recalcular con los nuevos valores
  if(subView==='rating') renderRating();
  else if(subView==='grupos') showSub('grupos');
}

function ratingFichaHTML(name){
  const r = ratingUTRDe(name);
  if(!r || typeof r.rating !== 'number') return '';
  const prov = r.provisional ? `<span class="rt-prov">${t('rt_prov')}</span>` : '';
  const manual = r.manual ? `<span class="rt-manual">${t('rt_manual')}</span>` : '';
  return `<div class="rt-ficha">
    <div class="rt-ficha-num">${r.rating.toFixed(2)}</div>
    <div class="rt-ficha-side">
      <div class="rt-ficha-lbl">${t('rating_title')} ${prov}${manual}</div>
      <div class="rt-ficha-sub">${r.partidos} ${t('rt_pj_lc')} · ${t('rt_scale')}</div>
    </div>
  </div>`;
}


// Exponer al scope global para que el index.html llame a estas funciones.
window.calcularRatingGlobal = calcularRatingGlobal;
window.ratingUTRDe = ratingUTRDe;
window.ratingUTRfmt = ratingUTRfmt;
window.ratingCompleto = ratingCompleto;
window.ciclosDeJugador = ciclosDeJugador;
window.tablaRating = tablaRating;
window.ratingDe = ratingDe;
window.renderRating = renderRating;
window.abrirAjusteRating = abrirAjusteRating;
window.guardarAjusteRating = guardarAjusteRating;
window.ratingFichaHTML = ratingFichaHTML;
})();
