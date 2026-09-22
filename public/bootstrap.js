// ============================================================================
// public/bootstrap.js — IIFE de arranque de la app y helpers finales
// Extraído del index.html original (líneas del script: 7110..7234).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
// La app arranca SIN datos. Nada se pide al servidor hasta que alguien entre.
// El nombre y el subtítulo de la liga los aplica el script del <head> desde
// localStorage, así la pantalla de login no necesita leer la base.
(function(){
  initLogin();
  updateLangUI();
})();
// v4.0: historical linking never transfers a password or an account identity.
async function abrirVincularJugador(nombreActual){
  closeM();
  if(typeof SohailIdentity==='undefined'){toast(LANG==='en'?'Reload to review sporting identities.':'Recargá para revisar las identidades deportivas.');return;}
  return SohailIdentity.historical(nombreActual);
}
async function confirmarVinculacion(nombreActual){return abrirVincularJugador(nombreActual);}

// Función súper robusta que actualiza todo el historial del jugador si su nombre tuvo que cambiar
function renombrarJugadorEnLiga(oldName,newName){
  return renamePlayerEverywhere(oldName,newName);
}

if(typeof applyStaticTranslations==='function')applyStaticTranslations();
