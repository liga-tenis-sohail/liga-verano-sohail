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
  async function abrirVincularJugador(nombreActual) {
    document.getElementById('modal-title').textContent = 'Conectar jugador: ' + attr(nombreActual);
    document.getElementById('modal-body').innerHTML = '<div class="pm-past-load">Cargando catálogo global...</div>';
    document.getElementById('modal-actions').innerHTML = '<button class="btn" onclick="closeM()">Cancelar</button>';
    document.getElementById('modal-bg').classList.add('open');

    try {
        const r = await fetch('/api/liga', {
            method: 'POST',
            headers: {'Content-Type':'application/json', Authorization: 'Bearer '+_token},
            body: JSON.stringify({accion: 'catalogo'})
        });
        const d = await r.json();
        const cat = d.jugadores || [];

        let html = '<p class="legend-txt">Elige un jugador de la base de datos (ligas anteriores) para conectarlo. Esto arrastrará su historial unificado y contraseña.</p>';
        html += '<select id="vincular-sel" class="cl-inp" style="margin-top:10px;"><option value="">-- Seleccionar jugador global --</option>';
        cat.forEach(j => {
            html += `<option value="${j.jugadorId}|${attr(j.nombre)}">${attr(j.nombre)} ${j.email ? `(${j.email})` : ''}</option>`;
        });
        html += '</select>';

        document.getElementById('modal-body').innerHTML = html;
        document.getElementById('modal-actions').innerHTML = `
            <button class="btn" onclick="closeM()">Cancelar</button>
            <button class="btn btn-primary" onclick="confirmarVinculacion('${jsq(nombreActual)}')"><i class="ti ti-link"></i> Conectar</button>
        `;
    } catch (e) {
        document.getElementById('modal-body').innerHTML = '<div class="alert alert-err">Error cargando catálogo</div>';
    }
}

async function confirmarVinculacion(nombreActual){
 const el=document.getElementById('vincular-sel'),value=el&&el.value;
 if(!value){toast(t('choose_player'));return;}
 const id=value.split('|')[0];
 if(!confirm(t('fix_link_confirm')))return;
 if(_saveInFlight)await _saveInFlight;
 if(_serialize()!==_lastSaved&&!await _criticalSave()){toast(t('fix_pending_first'));return;}
 try{
  const r=await fetch('/api/liga',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+_token},body:JSON.stringify({accion:'vincularJugador',ligaId:_ligaActual,nombre:nombreActual,jugadorId:id,version:_stateV})});
  const d=await r.json();if(!r.ok)throw new Error(d.error||t('fix_save_failed'));
  await loadState();closeM();refreshAll();toast(t('fix_link_ok'));
 }catch(e){toast(e.message||t('fix_save_failed'));}
}

// Función súper robusta que actualiza todo el historial del jugador si su nombre tuvo que cambiar
function renombrarJugadorEnLiga(oldName,newName){
  return renamePlayerEverywhere(oldName,newName);
}

if(typeof applyStaticTranslations==='function')applyStaticTranslations();
