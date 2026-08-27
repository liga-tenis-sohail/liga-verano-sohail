// ============================================================================
// public/bootstrap.js — IIFE de arranque de la app y helpers finales
// Extraído del index.html original (líneas del script: 7109..7234).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html: hay dependencias por
// hoisting y bloques de arranque (setInterval, IIFE) que dependen del orden.
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

        let html = '<p class="legend-txt">Elegí un jugador de la base de datos (ligas anteriores) para conectarlo. Esto arrastrará su historial unificado y contraseña.</p>';
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

function confirmarVinculacion(nombreActual) {
    const val = document.getElementById('vincular-sel').value;
    if (!val) { alert('Seleccioná un jugador del catálogo.'); return; }
    
    const parts = val.split('|');
    const jugadorId = parts[0];
    const nuevoNombre = parts[1];

    if (!confirm(`¿Estás seguro de conectar a "${nombreActual}" con el perfil global de "${nuevoNombre}"?`)) return;

    // Si los nombres son diferentes, renombramos al jugador en la liga actual para que coincida.
    if (nombreActual !== nuevoNombre) {
        if (USERS[nuevoNombre]) {
            alert(`Ya existe un jugador llamado "${nuevoNombre}" en esta liga. No se puede vincular.`);
            return;
        }
        renombrarJugadorEnLiga(nombreActual, nuevoNombre);
    }

    // Le asignamos el ID del catálogo y guardamos.
    const nameToUse = (nombreActual !== nuevoNombre) ? nuevoNombre : nombreActual;
    USERS[nameToUse].jugadorId = jugadorId;

    persist(true);
    closeM();
    toast('✅ Jugador conectado exitosamente.');
    refreshAll();
}

// Función súper robusta que actualiza todo el historial del jugador si su nombre tuvo que cambiar
function renombrarJugadorEnLiga(oldName, newName) {
    // 1. Modificar objeto USERS
    USERS[newName] = USERS[oldName];
    USERS[newName].name = newName;
    delete USERS[oldName];

    // 2. Modificar listado global ALLNAMES
    const idx = ALLNAMES.indexOf(oldName);
    if (idx >= 0) ALLNAMES[idx] = newName;

    // 3. Modificar Grupos en los Ciclos
    cycles.forEach(c => {
        if (c.groups) {
            c.groups.forEach(g => {
                const gi = g.players.indexOf(oldName);
                if (gi >= 0) g.players[gi] = newName;
            });
        }
    });

    // 4. Modificar Historial de Partidos
    matches.forEach(m => {
        if (m.aName === oldName) m.aName = newName;
        if (m.bName === oldName) m.bName = newName;
        if (m.reporter === oldName) m.reporter = newName;
        if (m.vBy === oldName) m.vBy = newName;
        if (m.winner === oldName) m.winner = newName;
        if (m.po && Array.isArray(m.poNames)) {
            const pi = m.poNames.indexOf(oldName);
            if (pi >= 0) m.poNames[pi] = newName;
        }
    });

    // 5. Modificar clasificados y seeds de Play Offs
    if (playoff && playoff.qualified) {
        const qi = playoff.qualified.indexOf(oldName);
        if (qi >= 0) playoff.qualified[qi] = newName;
        playoff.tramos.forEach(tr => {
            const si = tr.seeds.indexOf(oldName);
            if (si >= 0) tr.seeds[si] = newName;

            ['main', 'cons'].forEach(which => {
                if (tr[which]) {
                    tr[which].forEach(round => {
                        round.forEach(m => {
                            if (m.a === oldName) m.a = newName;
                            if (m.b === oldName) m.b = newName;
                            if (m.w === oldName) m.w = newName;
                        });
                    });
                }
            });
        });
    }
}

