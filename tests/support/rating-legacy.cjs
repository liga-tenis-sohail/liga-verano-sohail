'use strict';
// Frozen numeric baseline from public/rating.js at 96cb7a1. Benchmark only.
// It deliberately retains old behavior so regression measurements are honest.
const UTR_MIN = 1, UTR_MAX = 16;
const UTR_ESCALA = 4;          
const UTR_PROV = 15;           
const UTR_DECAY = 0.97;        
const UTR_STB_PESO = 0.4;      
const UTR_VENTANA = 50;        
const UTR_GRUPO_PESO = 5;      
const UTR_ITER = 60, UTR_K = 0.35;

function utrMarcarVentana(partidos, jugadores){
  const cuenta = {}; jugadores.forEach(j => cuenta[j] = 0);
  const marca = partidos.map(() => ({ ventanaA: false, ventanaB: false }));
  for(let i = partidos.length - 1; i >= 0; i--){   
    const p = partidos[i];
    if(cuenta[p.a] !== undefined && cuenta[p.a] < UTR_VENTANA){ marca[i].ventanaA = true; cuenta[p.a]++; }
    if(cuenta[p.b] !== undefined && cuenta[p.b] < UTR_VENTANA){ marca[i].ventanaB = true; cuenta[p.b]++; }
  }
  return marca;
}

function utrExpected(rA, rB){ return 1 / (1 + Math.pow(10, -(rA - rB) / UTR_ESCALA)); }

function grupoASeed(grupo, totalGrupos){
  if(!grupo || grupo < 1 || !totalGrupos) return null;
  if(totalGrupos <= 1) return (UTR_MIN + UTR_MAX) / 2;
  const techo = UTR_MAX - 2;   
  const piso  = UTR_MIN + 2;   
  const t = Math.min(1, (grupo - 1) / (totalGrupos - 1));  
  return techo - t * (techo - piso);
}

function pesoGrupoSeed(nPartidos){
  return Math.max(0, UTR_GRUPO_PESO - nPartidos * (UTR_GRUPO_PESO / UTR_PROV));
}

function utrGamesDePartido(sets){
  if(!Array.isArray(sets)) return null;
  let gA = 0, gB = 0, esSTB = false;
  sets.forEach((s, i) => {
    if(!Array.isArray(s) || s.length < 2) return;
    const x = +s[0], y = +s[1];
    if(!isFinite(x) || !isFinite(y)) return;
    if(i === 2){ 
      esSTB = true;
      gA += x > y ? 1 : 0;
      gB += y > x ? 1 : 0;
    } else {
      gA += x; gB += y;
    }
  });
  return { gamesA: gA, gamesB: gB, esSTB };
}

function utrPartidosDeEstado(estado){
  const out = [];
  const ms = (estado && estado.matches) || [];
  ms.forEach(m => {
    if(!m || m.status !== 'confirmed' || m.np) return;
    let a, b;
    if(m.po && m.poNames){ a = m.poNames[0]; b = m.poNames[1]; }
    else { a = m.aName; b = m.bName; }
    if(!a || !b) return;
    // Antes: un partido con wo:true (retiro/W.O.) se descartaba SIEMPRE del
    // rating, incluso si el jugador había ganado o perdido sets/games
    // reales antes de retirarse — esos games sí reflejan nivel de juego y
    // deberían contar. Ahora solo se descarta si de verdad no hay ningún
    // set jugado (retiro antes de empezar, sets:[] vacío) — si hay al
    // menos un set cargado, se procesa normal más abajo (utrGamesDePartido
    // ya soporta cualquier cantidad de sets, completos o parciales en
    // cantidad, sin romperse).
    if(m.wo && (!Array.isArray(m.sets) || !m.sets.length)){ return; }
    const g = utrGamesDePartido(m.sets);
    if(!g || (g.gamesA + g.gamesB) === 0) return;
    out.push({ a, b, gamesA: g.gamesA, gamesB: g.gamesB, fecha: m.date || '', esSTB: g.esSTB });
  });
  return out;
}

function utrCalcular(jugadores, partidos, semillas, overrides, grupos){
  overrides = overrides || {};
  grupos = grupos || {};
  const R = {};
  
  jugadores.forEach(j => {
    if(semillas && semillas[j] != null){ R[j] = semillas[j]; return; }
    const gi = grupos[j];
    const sg = gi ? grupoASeed(gi.grupo, gi.totalGrupos) : null;
    R[j] = (sg != null) ? sg : 8;
  });

  const marca = utrMarcarVentana(partidos, jugadores);
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
        if(semillas && semillas[j] != null){
          const pesoSemilla = Math.max(0, 3 - nP * 0.3); 
          if(pesoSemilla > 0) target = (target * pes[j] + semillas[j] * pesoSemilla) / (pes[j] + pesoSemilla);
        } else {
          const gi = grupos[j];
          const sg = gi ? grupoASeed(gi.grupo, gi.totalGrupos) : null;
          if(sg != null){
            const pesoG = pesoGrupoSeed(nP);
            if(pesoG > 0) target = (target * pes[j] + sg * pesoG) / (pes[j] + pesoG);
          }
        }
        R[j] = R[j] * (1 - UTR_K) + target * UTR_K;
        R[j] = Math.max(UTR_MIN, Math.min(UTR_MAX, R[j]));
      }
    });
  }

  const stats = {};
  jugadores.forEach(j => stats[j] = { gGanados: 0, gTotal: 0, vict: 0, der: 0, sumRival: 0, nRival: 0 });
  partidos.forEach((p, i) => {
    const tot = p.gamesA + p.gamesB;
    if(tot === 0) return;
    if(marca[i].ventanaA && stats[p.a]){
      stats[p.a].gGanados += p.gamesA; stats[p.a].gTotal += tot;
      if(p.gamesA > p.gamesB) stats[p.a].vict++; else stats[p.a].der++;
      stats[p.a].sumRival += R[p.b]; stats[p.a].nRival++;
    }
    if(marca[i].ventanaB && stats[p.b]){
      stats[p.b].gGanados += p.gamesB; stats[p.b].gTotal += tot;
      if(p.gamesB > p.gamesA) stats[p.b].vict++; else stats[p.b].der++;
      stats[p.b].sumRival += R[p.a]; stats[p.b].nRival++;
    }
  });

  const info = {};
  jugadores.forEach(j => {
    const nP = idxPorJugador[j].length;   
    const calc = R[j];                    
    const ov = overrides[j];
    const tieneOverride = (ov != null && isFinite(ov));
    const st = stats[j] || { gGanados: 0, gTotal: 0, vict: 0, der: 0, sumRival: 0, nRival: 0 };
    info[j] = {
      rating: tieneOverride ? Math.max(UTR_MIN === 1 ? 0.01 : UTR_MIN, Math.min(UTR_MAX, +ov)) : calc,
      ratingCalculado: calc,              
      manual: tieneOverride,              
      seed: (semillas && semillas[j] != null) ? +semillas[j] : null,   
      partidos: nP,
      provisional: !tieneOverride && nP < UTR_PROV,   
      fiab: Math.min(100, Math.round(100 * nP / UTR_VENTANA)),   
      vict: st.vict,                      
      der: st.der,                        
      gGanados: st.gGanados,              
      gPerdidos: st.gTotal - st.gGanados, 
      pctGames: st.gTotal > 0 ? (st.gGanados / st.gTotal) : null,      
      nivelRivales: st.nRival > 0 ? (st.sumRival / st.nRival) : null   
    };
  });
  return info;
}


module.exports={utrCalcular,utrPartidosDeEstado};
