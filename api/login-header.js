// ============================================================================
// GET /api/login-header  →  devuelve la config del header de login (sin auth)
//
// El header del login se guarda dentro del state de la liga (LOGIN_HEADER).
// El problema: hasta que el usuario no se loguea, no hay hidratación del state
// y el localStorage puede estar desactualizado (en móvil se ve viejo hasta que
// el admin se loguea desde ese dispositivo).
//
// Este endpoint expone SOLO la parte cosmética del state (color + links) sin
// requerir auth. Todos los datos sensibles quedan afuera. El frontend lo llama
// en cada arranque de initLogin() y actualiza LOGIN_HEADER + re-render inmediato.
//
// Failsafe: si algo falla (Supabase caído, tabla inexistente, config corrupta),
// devuelve el default. El header nunca rompe el login.
// ============================================================================

const { readState, LIGA_DEFAULT, ligaIdOK, envOK } = require('./_lib');

module.exports = async function handler(req, res){
  if(!envOK(res)) return;
  if(req.method !== 'GET'){
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Default por si algo falla o la liga no tiene config guardada.
  const defaultCfg = { color: '#0E3470', textColor: '', colorDark: '', textColorDark: '', links: [] };

  try {
    const ligaId = ligaIdOK(req.query.liga) ? req.query.liga : LIGA_DEFAULT;
    const state = await readState(ligaId);
    if(!state){
      return res.status(200).json(defaultCfg);
    }
    const lh = state.LOGIN_HEADER;
    if(!lh || typeof lh !== 'object'){
      return res.status(200).json(defaultCfg);
    }
    // Sanitizamos igual que en el frontend: filtramos links vacíos, limitamos
    // cantidad razonable (20), validamos tipos. Así el cliente puede confiar
    // en la forma del payload y renderear sin más validaciones.
    return res.status(200).json(require('./_content-security').headerConfig(lh));
  } catch(e){
    // Nunca romper el login por un error acá. Devolvemos default y logueamos.
    console.error('login-header unavailable');
    return res.status(200).json(defaultCfg);
  }
};

module.exports = require('./_http').wrap(module.exports,{route:'login-header'});
