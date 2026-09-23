// ============================================================================
// public/bootstrap.js — IIFE de arranque de la app y helpers finales
// Extraído del index.html original (líneas del script: 7110..7234).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
// La app arranca sin datos privados. Recupera la sesión desde el servidor
// solo si existe una marca no sensible de un login previo en este navegador.
// Si no hay sesión recuperable, inicia el login habitual; nunca autentica
// a partir del nombre o de los valores de localStorage.
(async function(){
  updateLangUI();
  const resumed=window.SohailSession?await SohailSession.restore():false;
  if(!resumed)initLogin();
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
