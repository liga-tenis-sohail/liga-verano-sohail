// =====================================================================
// GET /api/users
//   Modo LIGA  (?liga=xxx)  ->  { mode:'cyc'|'po', sections:[...], loose:[...] }
//   Modo GLOBAL (sin ?liga) ->  { mode:'global', players:[{v,i}] }
//
// Alimenta el desplegable de la pantalla de login. Es PÚBLICO por
// necesidad: hace falta antes de que exista una sesión.
//
// Modo LIGA (compatibilidad con lo que ya existía): se reorganiza según
// el momento de esa liga puntual (grupos del ciclo activo, o cuadros en
// playoffs). Lo sigue usando el selector de liga del ADMIN al gestionar
// una liga concreta ('cambiar liga' desde el panel, etc.).
//
// Modo GLOBAL (login unificado): junta los jugadores de TODAS las ligas
// activas en una sola lista alfabética plana, sin agrupar por grupo/cuadro
// (ya no tiene sentido: son varias ligas a la vez). Deduplica por
// jugadorId cuando existe, y además por NOMBRE normalizado (cubre
// perfiles que quedaron con jugadorId distinto por variantes de nombre
// o falta de fusión): la misma persona aparece UNA sola vez sin importar
// en cuántas ligas activas participe. Los jugadores INACTIVOS no aparecen
// en absoluto (no pueden entrar a ninguna liga activa igual).
//
// Devuelve el mínimo: nombre y marca de inactivo. Nada de emails,
// teléfonos, hashes, roles ni resultados.
// =====================================================================
const { readState, readLigaIndex, envOK, ligaIdOK, LIGA_DEFAULT } = require('./_lib');

// Caché en memoria POR LIGA (modo liga) y una caché aparte para el modo
// global. Este endpoint es público y leía los ~125 KB completos de la
// base en CADA carga del login: un script apuntándole agotaba el egress
// gratis de Supabase en unas 40.000 peticiones. Con 30 segundos, mil
// visitas seguidas cuestan una sola lectura, y un jugador nuevo igual
// aparece casi al instante.
//
// El caché de liga es un mapa {ligaId: {data, at}}: si fuera una sola
// variable global, pedir la liga A y después la B devolvería los
// jugadores de A para B.
const cacheByLiga = new Map();
const CACHE_MS = 30 * 1000;
let cacheGlobal = null;   // { data, at }

module.exports = async function handler(req, res){
  if(!envOK(res)) return;

  // Qué liga: viene por query (?liga=anual-2026). Si NO viene, modo global.
  const q = (req.query && req.query.liga) ? String(req.query.liga) : '';

  if(!q){
    return await handlerGlobal(req, res);
  }

  const ligaId = ligaIdOK(q) ? q : LIGA_DEFAULT;

  const hit = cacheByLiga.get(ligaId);
  if(hit && (Date.now() - hit.at) < CACHE_MS){
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(hit.data);
  }

  let state;
  try { state = await readState(ligaId); }
  catch(e){ return res.status(503).json({ error: 'No se pudo leer la lista de usuarios.' }); }
  if(!state || !state.users) return res.status(200).json({ mode: 'cyc', sections: [], loose: [] });  // sin cachear: puede ser un fallo transitorio

  const users = state.users;
  const inact = n => (users[n] && users[n].inactive) ? 1 : 0;
  const abc   = (a, b) => a.localeCompare(b, 'es');

  const seen     = new Set();
  const sections = [];
  const po       = state.playoff || {};
  const enPO     = !!(po.started && Array.isArray(po.tramos) && po.tramos.length);
  let   mode     = 'cyc';

  if(enPO){
    // --- Playoffs: una sección por cuadro ---
    // Da igual si el jugador está en el cuadro principal o en consolación:
    // los seeds del tramo son los mismos, solo importa en qué cuadro está.
    mode = 'po';
    po.tramos.forEach((tr, i) => {
      const players = (tr.seeds || [])
        .filter(n => users[n])                 // descarta BYE / TBD
        .slice().sort(abc)
        .map(n => { seen.add(n); return { v: n, i: inact(n) }; });
      sections.push({ k: tr.label || String.fromCharCode(65 + i), players });
    });
  }else{
    // --- Liga en curso: una sección por grupo del ciclo activo ---
    const cyc = (state.cycles || [])[(state.activeN || 1) - 1];
    if(cyc && Array.isArray(cyc.groups)){
      cyc.groups.forEach((g, i) => {
        const players = (g.players || [])
          .filter(n => users[n])
          .slice().sort(abc)
          .map(n => { seen.add(n); return { v: n, i: inact(n) }; });
        sections.push({ k: i + 1, players });
      });
    }
  }

  // Red de seguridad: jugadores que existen pero no cayeron en ninguna sección.
  // Sin esto quedarían sin poder entrar, porque ya no hay campo de texto donde
  // escribir el nombre a mano.
  const loose = Object.keys(users)
    .filter(n => users[n] && users[n].role === 'player' && !seen.has(n))
    .sort(abc)
    .map(n => ({ v: n, i: inact(n) }));

  const result = { mode, sections, loose };
  cacheByLiga.set(ligaId, { data: result, at: Date.now() });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result);
};

// =====================================================================
// MODO GLOBAL — junta jugadores activos de TODAS las ligas activas.
// Usado por la pantalla de login unificado (paso a: un solo dropdown
// alfabético con todo el mundo, sin elegir liga primero).
// =====================================================================
async function handlerGlobal(req, res){
  if(cacheGlobal && (Date.now() - cacheGlobal.at) < CACHE_MS){
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(cacheGlobal.data);
  }

  let idx = [];
  try { idx = await readLigaIndex(); }
  catch(e){ return res.status(503).json({ error: 'No se pudo leer la lista de ligas.' }); }

  const activas = idx.filter(l => l.estado === 'activa');

  // porClave: dedupe. Preferimos jugadorId como clave (misma persona real
  // en 2 ligas = una sola entrada). Si un usuario no tiene jugadorId
  // todavía (no migrado al catálogo), deduplicamos por nombre normalizado.
  const porClave = new Map();   // clave -> { nombre, inactive }

  for(const l of activas){
    let state;
    try { state = await readState(l.id); } catch(e){ continue; }
    if(!state || !state.users) continue;
    for(const nombre of Object.keys(state.users)){
      const u = state.users[nombre];
      if(!u || u.role !== 'player') continue;
      const clave = u.jugadorId ? ('j:' + u.jugadorId) : ('n:' + normNombre(nombre));
      const inactivo = !!u.inactive;
      const prev = porClave.get(clave);
      if(!prev){
        porClave.set(clave, { nombre, inactive: inactivo });
      } else if(prev.inactive && !inactivo){
        // Si en una liga figura inactivo y en otra activo, se muestra activo:
        // sigue siendo un jugador vigente en la plataforma.
        prev.inactive = false;
      }
    }
  }

  // Segunda pasada: fusiona por NOMBRE normalizado entre entradas que
  // quedaron con jugadorId distinto (o con y sin jugadorId). Esto cubre
  // perfiles duplicados que ya existen en la base de antes del fix en
  // liga.js que evita crearlos — acá el dropdown igual muestra al jugador
  // una sola vez, aunque su catálogo siga separado hasta que el admin
  // fusione los perfiles desde el panel.
  const porNombreFinal = new Map();   // nombreNorm -> { nombre, inactive }
  for(const { nombre, inactive } of porClave.values()){
    const key = normNombre(nombre);
    const prev = porNombreFinal.get(key);
    if(!prev){
      porNombreFinal.set(key, { nombre, inactive });
    } else if(prev.inactive && !inactive){
      prev.inactive = false;
    }
  }

  // Los inactivos NO aparecen en el login: no pueden entrar a ninguna liga
  // activa igual, así que mostrarlos en el desplegable solo confunde.
  const players = Array.from(porNombreFinal.values())
    .filter(p => !p.inactive)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(p => ({ v: p.nombre }));

  const result = { mode: 'global', players };
  cacheGlobal = { data: result, at: Date.now() };
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result);
}

// Normaliza un nombre para comparar (minúsculas, sin tildes, espacios
// colapsados). Mismo criterio que idDeJugador() en liga.js, para que el
// dedupe del login coincida con el criterio de creación de perfiles.
function normNombre(n){
  return String(n).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}
