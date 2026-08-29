// ============================================================================
// public/core-estado.js — estado global, helpers puros (traducciones, fechas, permisos, cálculos)
// Extraído del index.html original (líneas del script: 1..655).
// Este archivo comparte scope global con los otros public/*.js.
// NO REORDENAR el orden de carga en index.html.
// ============================================================================
// ===== La app ya NO habla directo con Supabase =====
// Las claves viven como variables de entorno en Vercel y solo las ve el servidor.
// Todo pasa por /api/login, /api/state y /api/save.
// --- Guardas de rating: si rating.js no cargó, estas versiones seguras evitan
//     que la app se rompa. rating.js las sobrescribe cuando carga. ---
if(typeof window.calcularRatingGlobal!=='function') window.calcularRatingGlobal=function(){return Promise.resolve(null);};
if(typeof window.ratingUTRDe!=='function') window.ratingUTRDe=function(){return null;};
if(typeof window.ratingUTRfmt!=='function') window.ratingUTRfmt=function(){return '';};
if(typeof window.renderRating!=='function') window.renderRating=function(){var b=document.getElementById('view-rating');if(b)b.innerHTML='<div class="card"><div class="lock-note" style="padding:1rem;text-align:center">Rating no disponible.</div></div>';};
if(typeof window.ratingFichaHTML!=='function') window.ratingFichaHTML=function(){return '';};
if(typeof window.ratingDe!=='function') window.ratingDe=function(){return '';};
if(typeof window.tablaRating!=='function') window.tablaRating=function(){return [];};
if(typeof window.ciclosDeJugador!=='function') window.ciclosDeJugador=function(){return [];};
if(typeof window.ratingCompleto!=='function') window.ratingCompleto=function(){return {rating:0};};
if(typeof window.abrirAjusteRating!=='function') window.abrirAjusteRating=function(){};
if(typeof window.guardarAjusteRating!=='function') window.guardarAjusteRating=function(){};
let _token = null;   // token de sesión firmado, devuelto por /api/login
// Sistema unificado: con qué liga estamos trabajando. La define el login (a qué
// liga entrás) o la navegación de ligas pasadas. Si es null, el servidor asume
// la liga por defecto ('liga-actual'), lo que mantiene la compatibilidad.
let _ligaActual = null;
// Modo consulta: true cuando mirás una liga pasada (solo lectura, sin login).
let _ligaReadOnly = false;
let _sinLigasActivas = false;  // true cuando no hay ninguna liga activa (acceso admin)
// Helper: agrega ?liga=... a una URL de GET si hay liga seleccionada.
function _conLiga(url){
  if(!_ligaActual) return url;
  return url + (url.includes('?') ? '&' : '?') + 'liga=' + encodeURIComponent(_ligaActual);
}

// ===== SEGURIDAD: PBKDF2 con sistema de versiones (Web Crypto API) =====
// El login ya NO se valida acá: lo hace el servidor. Estas funciones quedan
// solo para que el admin pueda fijar contraseñas desde el panel.
const PBKDF2_SALT      = 'LigaSohailSecure2026';
const PBKDF2_ITERS     = 100000;
const DEFAULT_PASS_HASH= 'v1:8f5e91d22e332be45d55724423baad250490285a4e302b9eec0e6fd482164b83'; // hash por defecto v1
const ADMIN_PASS_HASH  = 'v1:240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'; // hash admin v1

function isHashed(pw){ return typeof pw==='string'&&(pw.startsWith('v1:')||pw.startsWith('v2:')); }

// ===== CAPA 2: SESSION TIMEOUT (90 minutos de inactividad) =====
let _lastActivity=Date.now();
const SESSION_TIMEOUT_MS=90*60*1000; // 90 minutos
function touchActivity(){_lastActivity=Date.now();}
let _sessionExpiring=false;
function checkSessionTimeout(){
  if(!currentUser||_sessionExpiring)return;
  if(Date.now()-_lastActivity>SESSION_TIMEOUT_MS){
    _sessionExpiring=true;
    toast('Sesión expirada por inactividad. Por favor vuelve a ingresar.');
    setTimeout(()=>{if(_sessionExpiring)doLogout();},1500);
  }
}
if(typeof setInterval!=='undefined')setInterval(checkSessionTimeout,60000); // chequeo cada minuto
// Registrar actividad en eventos del usuario
if(typeof document!=='undefined'){
  ['click','keydown','touchstart','mousemove'].forEach(ev=>
    document.addEventListener(ev,touchActivity,{passive:true})
  );
}

// ===== CAPA 3: RATE LIMITING DE LOGIN =====
// 5 intentos fallidos → bloqueo de 5 minutos
const LOGIN_MAX_ATTEMPTS=5;
const LOGIN_LOCKOUT_MS=5*60*1000; // 5 minutos
const _loginAttempts={}; // {username: {count, lockedUntil}}
// ===== TRADUCCIONES & ESTADO =====
let demoBackup=null;
let LANG='es';
function setLang(l){LANG=l;try{localStorage.setItem('liga_lang',l);}catch(e){}renderAll();}
function t(k){const v=(TRANSLATIONS[LANG]&&TRANSLATIONS[LANG][k])||TRANSLATIONS['es'][k];return v!==undefined?v:k;}
function tf(k,vars){let s=t(k);Object.keys(vars||{}).forEach(v=>{s=s.replace(new RegExp('{'+v+'}','g'),vars[v]);});return s;}
function renderAll(){if(typeof currentUser!=='undefined'&&currentUser){renderShell();if(typeof subView!=='undefined'){try{if(viewCycle==='po'){const pv=document.getElementById('view-playoff');if(pv)pv.style.display='block';showPlayoffView();}else showSub(subView);}catch(e){console.warn('renderAll',e);}}}updateLangUI();updateBadge();}
function updateLangUI(){
  ['btn-lang-es','btn-lang-es-login'].forEach(id=>{let el=document.getElementById(id);if(el){el.classList.toggle('active',LANG==='es');}});
  ['btn-lang-en','btn-lang-en-login'].forEach(id=>{let el=document.getElementById(id);if(el){el.classList.toggle('active',LANG==='en');}});
  const lu=document.getElementById('lbl-user');if(lu)lu.textContent=t('select_user');
  const lp=document.getElementById('lbl-pass');if(lp)lp.textContent=t('password');
  const lt=document.getElementById('login-title');if(lt)lt.textContent=(LOGIN_TITLE&&LOGIN_TITLE.trim())?LOGIN_TITLE:(LEAGUE_NAME||t('app_title'));
  const ls=document.getElementById('login-sub');if(ls)ls.textContent=LEAGUE_SUBTITLE||t('app_subtitle');
  const bEnv=document.getElementById('btn-enviar');if(bEnv)bEnv.innerHTML='<i class="ti ti-send"></i> '+t('send');
  const bLim=document.getElementById('btn-limpiar');if(bLim)bLim.textContent=t('clear');
  const lbtn=document.getElementById('login-btn');if(lbtn){lbtn.textContent=t('enter');}const sh=document.getElementById('stb-hint');if(sh)sh.textContent=t('stb_hint');
  const pkt=document.getElementById('login-btn-pk-txt');if(pkt)pkt.textContent=t('pk_login_btn');
  const fbtn=document.getElementById('login-forgot-btn');if(fbtn)fbtn.textContent=t('forgot_pass');
  if(typeof mostrarBotonPasskeyLogin==='function')mostrarBotonPasskeyLogin();
}

const TRANSLATIONS={
es:{
gen_tiebreak_note:'<strong>Desempate:</strong> 1º Puntos totales · 2º Puntos del último ciclo · 3º Grupo más alto.',autoscale_title:'Autogenerar escala de puntos',autoscale_hint:'Llena los puntos de todos los grupos de una vez. El grupo más bajo siempre arranca en 5-4-3-2-1, y cada grupo hacia arriba suma lo que elijas por grupo. No hay techo: el puntaje del grupo más alto se ajusta solo a la cantidad de grupos. Dentro de cada grupo baja de a 1 hasta el 5º; del 6º en adelante repite el 5º. Después puedes ajustar cualquier grupo a mano.',autoscale_top:'Puntos del ganador del Grupo 1',autoscale_step:'Puntos que sube cada grupo',autoscale_btn:'Generar',autoscale_bad_top:'Pon un puntaje válido para el ganador del Grupo 1.',autoscale_bad_step:'Pon un valor de bajada válido (1 o más).',autoscale_confirm:'Generar la escala de {n} grupos: el grupo más bajo queda 5-4-3-2-1 y sube {step} por grupo. Esto reemplaza cualquier puntaje editado a mano. ¿Continuar?',autoscale_done:'Escala generada para {n} grupos.',cycle_short:'C',draw:'Cuadro',inactive_short:'Inactivo',gen_cycle_pts:'Puntos sumados en ese ciclo',gen_po_col:'Play Off',close_pending_first:'Antes de cerrar, resuelve los partidos cargados sin validar (pendientes o en disputa).',close_force_confirm:'Quedan {n} partidos sin jugar en este ciclo. ¿Cerrar igual e iniciar el siguiente? Esos partidos quedarán sin jugarse y no se podrán cargar después.',close_force_confirm_last:'Quedan {n} partidos sin jugar en este ciclo. ¿Finalizarlo igual y habilitar los Play Offs? Esos partidos quedarán sin jugarse.',close_incomplete:'incompleto',close_can_incomplete:'Faltan {n} por jugar. Puedes cerrar el ciclo igual.',unvalidated_short:'sin validar',rating_empty:'Todavía no hay jugadores con partidos suficientes para calcular el rating.',rating_title:'Rating / Nivel',rating_desc:'Rating global (0–10) calculado a partir del grupo, victorias y derrotas de cada jugador en cada ciclo. Ordenado de mayor a menor.',rating_col:'Rating',rt_prov:'prov.',rt_prov_t:'Rating provisional: menos de 15 partidos. Se afina a medida que juega.',rt_prov_leg:'provisional (pocos partidos)',rt_manual:'fijo',rt_manual_t:'Rating fijado a mano por el administrador.',rt_manual_leg:'ajustado por el admin',rt_adjust:'Ajustar',rt_desc_utr:'Rating estilo UTR (1–16) calculado con los últimos 50 partidos de cada jugador en todas las ligas. Los partidos recientes, el margen de games y el nivel de los rivales pesan más.',rt_pj:'PJ',rt_pj_lc:'partidos',rt_grp:'Grupo',rt_grp_t:'Grupo actual del jugador en el ciclo activo',rt_calc_now:'Rating calculado ahora',rt_seed_lbl:'Puntaje inicial (seed)',rt_seed_hint:'Punto de partida del jugador. Orienta el rating al principio y se diluye a medida que juega. Déjalo vacío para que arranque neutro.',rt_over_lbl:'Ajuste manual (rating fijo)',rt_over_hint:'Si pones un valor, reemplaza el rating calculado y queda fijo. Déjalo vacío para usar el cálculo automático.',rt_empty_ph:'(vacío)',rt_scale:'escala 1–16',rt_seed_bad:'El puntaje inicial tiene que estar entre 1 y 16.',rt_over_bad:'El ajuste manual tiene que estar entre 0.01 y 16.',rt_saved:'Rating actualizado.',rt_show_detail:'Ver detalle del cálculo',rt_hide_detail:'Ocultar detalle',rt_col_seed:'Seed',rt_col_calc:'Calc.',rt_col_vd:'V-D',rt_col_vd_t:'Victorias-Derrotas en la ventana',rt_col_pct:'% Games',rt_col_pct_t:'Porcentaje de games ganados',rt_col_riv:'Niv.Riv',rt_col_riv_t:'Nivel medio de los rivales enfrentados',rt_col_fiab:'Fiab.',rt_col_fiab_t:'Fiabilidad: qué tan asentado está el rating (según cantidad de partidos)',rt_detail_help:'Seed: punto de partida del admin · Calc.: rating calculado (si hay ajuste manual) · V-D: victorias y derrotas · % Games: proporción de games ganados · Niv.Riv: nivel promedio de los rivales · Fiab.: qué tan asentado está el rating.',rt_col_gg:'GG',rt_col_gg_t:'Games ganados en total',rt_col_gp:'GP',rt_col_gp_t:'Games perdidos en total',rt_pj_t:'Partidos usados en el cálculo (máximo 50, los más recientes)',rt_howto_title:'¿Cómo se calcula el rating?',rt_leg_rating:'= rating (1–16)',rt_leg_pj:'= partidos usados (máx 50)',rt_leg_seed:'= puntaje inicial del admin',rt_leg_calc:'= rating calculado (si hay ajuste manual)',rt_leg_vd:'= victorias-derrotas',rt_leg_gg:'= games ganados',rt_leg_gp:'= games perdidos',rt_leg_pct:'= % de games ganados',rt_leg_riv:'= nivel medio de los rivales',rt_leg_fiab:'= fiabilidad (sobre 50 partidos)',rt_howto_body:'El rating (escala 1–16, estilo UTR) se calcula con los últimos 50 partidos de cada jugador en todas las ligas. Para cada partido se compara el porcentaje de games que ganaste contra lo que se esperaba según el nivel del rival: ganarle a alguien más fuerte, o ganar por más games, sube más el rating. Los partidos más recientes pesan más, y el supertiebreak cuenta como medio set. Además, el grupo en el que juega cada persona influye como punto de partida: estar en un grupo alto ubica el rating más arriba, sobre todo con pocos partidos, y esa influencia se diluye a medida que se juega y mandan los resultados reales. La fiabilidad crece hasta los 50 partidos; con menos de 15 el rating es provisional.',rating_nivel:'Nivel',rating_nivel_t:'Nivel medio de juego ponderado por ciclo',rating_efic:'Eficiencia',rating_efic_t:'Eficiencia ponderada por dificultad de grupo (1–10)',rating_fiab:'Fiabilidad',rating_fiab_t:'Sube con la cantidad de partidos jugados (satura en 10)',rating_grupo:'Grupo',rating_grupo_t:'Grupo medio ponderado por partidos (1 = grupo más alto)',rating_ppp:'Pts/PJ',rating_ppp_t:'Puntos por partido medio (3 victoria, 1 derrota)',rating_pj:'PJ',rating_gp:'G-P',rating_pct:'%Vict',rating_footer:'El rating pondera 85% nivel de juego, 10% eficiencia por dificultad de grupo y 5% fiabilidad por cantidad de partidos.',rating_feature:'Función de Rating',rating_toggle_label:'Mostrar pestaña de Rating/Nivel',rating_toggle_hint:'Si la activás, todos los usuarios verán una pestaña con el rating de cada jugador. Si no, la pestaña no aparece.',rating_on:'Activado',rating_off:'Desactivado',rating_enabled_toast:'Rating activado. La pestaña ya es visible para todos.',rating_disabled_toast:'Rating desactivado. La pestaña ya no se muestra.',appearance_title:'Apariencia de la liga',legend_nj:'No jugado',dispute_color:'Color de disputas',dispute_color_hint:'fondo de partidos en disputa',dispute_short:'En disputa',clubs_title:'Clubes',clubs_hint:'Edita el nombre y color de cada club, agrega o elimina. El color pinta el sombreado de la tabla de resultados; el texto se oscurece solo para que siempre se lea.',club_add:'Agregar club',club_delete:'Eliminar club',club_name_ph:'Nombre del club',club_short:'Club',club_min_one:'Tiene que quedar al menos un club.',club_delete_confirm:'¿Eliminar el club "{n}"? Los partidos ya cargados con ese club conservan su marcador pero pierden el color.',club_err_empty:'Ningún club puede quedar sin nombre.',club_err_dup:'Hay dos clubes con el mismo nombre.',preview:'Vista previa',save_all:'Guardar todo',reset_colors:'Restablecer colores',confirm_all_skipped:'Pendientes validados. Se saltearon {n} porque los jugaste tú: los tiene que confirmar otro administrador.',own_match_admin:'No puedes arbitrar un partido que jugaste tú. Lo tiene que confirmar otro administrador.',wo_not_yours:'No puedes marcar W.O. en un partido que juegas tú. Lo tiene que resolver otro administrador.',role_only_owner:'Solo el administrador original y el super admin pueden repartir el rol.',admins_section:'Administradores de la liga',admins_hint:'Además de la cuenta Organización, estas personas pueden administrar la liga. Siguen siendo jugadores: mantienen su grupo y sus partidos.',admins_none:'No hay ningún jugador con permisos de administrador.',role_section:'Rol en la liga',role_is_admin:'Administrador',role_is_player:'Jugador',role_make_admin:'Hacer administrador',role_make_player:'Quitar administrador',role_confirm_up:'¿Dar permisos de administrador a {n}? Va a poder confirmar resultados, editar jugadores y cambiar la configuración de la liga.',role_confirm_down:'¿Quitarle los permisos de administrador a {n}? Vuelve a ser un jugador normal.',role_done:'Rol de {n} actualizado.',role_last_admin:'Tiene que quedar al menos un administrador.',reset_not_here:'No se puede desde aquí.',reset_confirm:'¿Restablecer la contraseña de {n} a la clave por defecto "tenis"? Se le va a pedir que la cambie al entrar.',reset_ok:'Contraseña de {n} restablecida. Al entrar se le va a pedir una nueva.',reset_err:'No se pudo restablecer la contraseña.',pwf_title:'Cambia tu contraseña',pwf_why:'Estás usando la contraseña por defecto, que es pública. Elige una nueva para continuar.',pwf_new:'Contraseña nueva',pwf_rep:'Repetila',pwf_save:'Guardar y continuar',pwf_short:'Tiene que tener al menos 6 caracteres.',pwf_same:'No puede ser la misma que ya tenías.',pwf_nomatch:'Las dos contraseñas no coinciden.',pwf_err:'No se pudo cambiar. Prueba de nuevo.',err_need_both:'Escribe tu usuario y tu contraseña.',err_no_server:'No se pudo conectar con el servidor. Prueba de nuevo.',err_no_users:'No se pudo cargar la lista de usuarios.',err_users_404:'Falta el archivo api/users.js en el repo (404).',err_users_csp:'El navegador bloqueó la llamada a /api/users.',err_server_said:'El servidor devolvió ',err_hydrate:'Los datos se leyeron pero no se pudieron aplicar. Recarga la página.',err_no_data:'No se pudieron cargar los datos. Recarga la página.',err_no_user_league:'No se encontró tu usuario en la liga.',err_inactive:'Tu cuenta está inactiva. Contacta al administrador.',err_session_expired:'Tu sesión expiró. Vuelve a entrar.',err_session_expired_save:'Tu sesión expiró. Vuelve a entrar para seguir guardando.',err_no_access:'No tienes acceso.',err_conflict:'Otra persona guardó un cambio mientras cargabas el tuyo. Recarga la página y vuelve a cargarlo.',login_working:'Entrando…',app_title:'Liga de Tenis Sohail',app_subtitle:'Verano 2026',select_user:'Seleccione su usuario',admin_org:'admin (Organización)',password:'Contraseña',enter:'Entrar',pk_login_btn:'Entrar con Face ID / Touch ID',invalid_user:'Selecciona un usuario válido.',wrong_pass:'Contraseña incorrecta.',past_title:'Ligas anteriores',past_sub:'Consulta temporadas finalizadas',past_view:'Ver clasificación y resultados',past_readonly:'Estás viendo una liga finalizada (solo lectura).',past_back:'Volver al inicio',past_current:'Liga en juego',lsel_title:'¿A qué liga quieres entrar?',lsel_title_post:'Hola, {n}. ¿A qué liga quieres entrar?',lsel_current:'Cambiar de liga',lsel_current_tag:'acá',lsel_cancel:'Cambiar de cuenta',aa_title:'No hay ligas activas',aa_sub:'Ingresa como administrador para reabrir o crear una liga.',aa_banner:'No hay ninguna liga activa. Entra a Admin → Gestión de ligas para reabrir esta o crear una nueva.',err_no_active_league:'No hay ninguna liga activa en este momento. Vuelve cuando el administrador abra una nueva. Para consultar temporadas pasadas, usa «Ligas anteriores».',past_player_btn:'Ver ligas pasadas',past_player_lbl:'Elige una temporada',past_player_none:'No hay ligas pasadas todavía.',past_player_nomatch:'Sin partidos en esa liga.',past_loading:'Cargando…',past_loading_err:'No se pudo cargar.',won_lc:'ganados',lost_lc:'perdidos',win_short:'G',loss_short:'P',h2h_title:'Cara a Cara',h2h_none:'{a} y {b} nunca se enfrentaron.',h2h_balance:'{a} {ga} · {b} {gb} en enfrentamientos directos',lm_title:'Gestión de ligas',lm_desc:'Crea una liga nueva desde el catálogo de jugadores, o cierra, reabre y elimina las existentes.',lm_new:'Crear liga nueva',lm_none:'Todavía no hay ligas registradas.',lm_active:'Activa',lm_finished:'Finalizada',lm_close:'Cerrar',lm_reopen:'Reabrir',lm_delete:'Eliminar',lm_rename:'Renombrar',lm_rename_prompt:'Nuevo nombre de la liga:',lm_rename_empty:'El nombre no puede quedar vacío.',lm_new_title:'Crear liga nueva',lm_name_lbl:'Nombre de la liga',lm_name_ph:'Ej: Liga Verano 2026',lm_id_lbl:'Identificador (URL interna)',lm_id_hint:'Solo minúsculas, números y guiones. No se puede cambiar después.',lm_groups:'Cantidad de grupos',lm_cycles:'Cantidad de ciclos',lm_gc_hint:'Puedes ajustar los grupos y ciclos después desde el panel de admin.',lm_clubs_lbl:'Clubes que participan',lm_clubs_hint:'Arrancan con los mismos clubes y colores de la liga actual. Puedes renombrarlos, cambiarles el color (con el selector o escribiendo el código hex) o agregar/sacar clubes para esta liga.',lm_players_lbl:'Jugadores del catálogo',lm_search_ph:'Buscar jugador…',lm_no_catalog:'El catálogo está vacío. Agrega jugadores nuevos abajo.',lm_no_match:'Ningún jugador coincide.',lm_new_players_lbl:'Agregar jugadores nuevos',lm_add_player:'Agregar jugador',lm_np_name:'Nombre',lm_np_email:'Email (opcional)',lm_total:'{n} jugadores seleccionados',lm_create:'Crear liga',lm_creating:'Creando…',lm_created:'Liga «{n}» creada.',lm_confirm_empty:'No seleccionaste ningún jugador. ¿Crear la liga vacía igual?',lm_err_name:'Pon un nombre para la liga.',lm_err_id:'El identificador solo puede tener minúsculas, números y guiones.',lm_err_create:'No se pudo crear la liga.',lm_close_confirm:'¿Cerrar la liga «{n}»? Va a pasar a finalizada y quedará pública en modo consulta. Puedes reabrirla después.',lm_reopen_confirm:'¿Reabrir la liga «{n}»? Vuelve a estar activa y editable.',lm_delete_confirm1:'¿Eliminar la liga «{n}»? Esta acción no se puede deshacer.',lm_delete_confirm2:'Para confirmar, escribe el nombre exacto de la liga:\n\n{n}',lm_delete_mismatch:'El nombre no coincide. No se eliminó nada.',lm_action_ok:'Hecho.',lm_err_action:'No se pudo completar la acción.',rg_tab:'Reglamento',rg_title:'Reglamento de la liga',rg_empty:'Todavía no hay un reglamento cargado para esta liga.',rg_create:'Crear reglamento',rg_edit:'Editar',rg_save:'Guardar reglamento',rg_saved:'Reglamento guardado.',rg_placeholder:'Escribe aquí el reglamento de la liga…',rg_copy:'Copiar de otra liga',rg_copy_title:'Copiar reglamento',rg_copy_desc:'Elige la liga de la que quieres copiar el reglamento. Vas a poder revisarlo antes de guardar.',rg_copy_none:'No hay otras ligas para copiar.',rg_copy_empty:'La liga «{n}» no tiene reglamento cargado.',rg_copied:'Reglamento copiado de «{n}». Revísalo y guarda.',err_too_big:'No se pudo guardar: hay demasiado contenido (probablemente una imagen muy grande en el reglamento). Quita la imagen más pesada y vuelve a intentar.',st_title:'Estadísticas',st_current:'Liga actual',st_total:'Total (todas las ligas)',st_pj:'Jugados',st_pg:'Ganados',st_pp:'Perdidos',st_pct:'% Vict.',cj_title:'Jugadores en la base',cj_desc:'Todos los jugadores del sistema (actuales y de ligas previas). Puedes eliminar de la base solo a los que no tienen partidos; los que jugaron conservan su historial.',cj_search:'Buscar jugador…',cj_none:'No hay jugadores en la base.',cj_total:'{n} jugadores en total',cj_leagues:'{n} ligas',cj_matches:'{n} partidos',cj_has_matches:'Tiene partidos: no se puede eliminar (se perdería historial).',cj_del_confirm:'¿Eliminar a «{n}» de la base? Pierde su cuenta, pero como no tiene partidos no afecta ningún historial.',cj_deleted:'«{n}» eliminado de la base.',cj_del_err:'No se pudo eliminar al jugador.',cj_fusion_btn:'Fusionar perfiles',cj_fusion_salir:'Cancelar fusión',cj_fusion_hint:'Elige 2 jugadores que sean la misma persona.',cj_fusion_confirm_lbl:'¿Cuál de los dos te quedas como principal?',cj_fusion_keep:'Mantener a {n}',cj_fusion_final_confirm:'¿Fusionar los dos perfiles en «{n}»? El otro perfil se borra de la base y todas sus ligas quedan re-vinculadas a «{n}» con una sola contraseña. Esta acción no se puede deshacer.',cj_fusion_done:'Perfiles fusionados en «{n}».',cj_fusion_err:'No se pudo fusionar los jugadores.',rg_bold:'Negrita',rg_italic:'Cursiva',rg_underline:'Subrayado',rg_size:'Tamaño',rg_size_s:'Chico',rg_size_m:'Normal',rg_size_l:'Grande',rg_size_xl:'Muy grande',rg_ul:'Viñetas',rg_ol:'Numerado',rg_img:'Insertar imagen',rg_img_hint:'Puedes pegar imágenes directamente (Ctrl+V) o usar el botón. Máximo 2 MB por imagen.',rg_img_big:'La imagen es muy grande (máximo 2 MB). Prueba con una más liviana.',aj_open_btn:'Agregar de ligas anteriores',aj_title:'Agregar jugadores de ligas anteriores',aj_desc:'Elige jugadores que ya jugaron en otras ligas y súmalos a esta, indicando a qué grupo va cada uno.',aj_none:'No hay jugadores de otras ligas para agregar (o ya están todos en esta liga).',aj_total:'{n} jugadores seleccionados',aj_none_sel:'Elige al menos un jugador.',aj_add:'Agregar a la liga',aj_adding:'Agregando…',aj_done:'Se agregaron {n} jugadores a la liga.',aj_err:'No se pudo agregar a los jugadores.',
exit:'Salir',cycle:'Ciclo',playoffs:'Play Offs',playoffs_prev:'Play Offs (previa)',
tab_grupos:'Grupos',tab_general:'Clasificación',tab_cargar:'Cargar',tab_cargar_admin:'Cargar',tab_pendientes:'Pendientes',tab_pendientes_admin:'Pendientes / Disputas',tab_perfil:'Perfil & Jugadores',tab_mensajes:'Mensajes',tab_admin:'Admin',
choose_group:'Elige el grupo',group:'Grupo',destination:'Destino',player:'Jugador',won:'G',lost:'P',not_played:'NJ',sets_won:'SG',sets_lost:'SP',balance:'Bal',pts_pos:'P.puesto',extra:'Extra',total:'Total',pts_classif:'Puntos para la Clasificación General',players_col:'Jugadores',edit:'Editar',
legend_pts:'<strong>Tabla de posiciones:</strong> Pts: puntos (3 victoria · 1 derrota · 0 no jugado) · G: partidos ganados · P: perdidos · NJ: no jugados · SG: sets ganados · SP: sets perdidos · Bal: balance de sets (SG−SP) · P.puesto: puntos por posición en el grupo · Extra: +2 al ganador del grupo · Total: P.puesto + Extra (suma a la Clasificación General) · Destino: grupo al que sube (↑), baja (↓) o se mantiene (=).<br><strong>Desempate (en orden):</strong> 1º Puntos · 2º Partidos jugados · 3º Cara a cara · 4º Balance de sets · 5º Cara a cara 2º (entre los aún empatados) · 6º Balance de juegos.',
legend_matrix:'El marcador se lee en la fila del jugador (sus juegos primero). El color de cada celda indica el club donde se jugó (ver referencias).',
legend_pending:'Pendiente de validación',legend_disputed:'Disputado',legend_load:'+ cargar',legend_noedit:'· no editable',
general_title:'Clasificación general acumulada (todos los ciclos)',
current_group:'Grupo actual',you:'Tú',me_label:'Tú',
report_result:'Reportar resultado',reporter:'Jugador (quien reporta)',rival:'Rival',club_label:'Club',date_label:'Fecha',
reqmark_label:'OBLIGATORIO',set:'Set',
sets_section:'Resultado por sets',supertiebreak:'S.Tiebreak',stb_hint:'solo 1-0 o 0-1',add_stb:'Supertiebreak (1-1)',
remove_stb:'Quitar supertiebreak',send:'Enviar',clear:'Limpiar',set_hint:'6-0 a 6-4, 7-5 o 7-6',valid_need2sets:'Completa los dos sets.',valid_set1:'Set 1 inválido (6-0 a 6-4, 7-5 o 7-6).',valid_set2:'Set 2 inválido (6-0 a 6-4, 7-5 o 7-6).',valid_need_stb:'Sets empatados 1-1: completa el supertiebreak.',valid_stb_only:'El supertiebreak solo puede ser 1-0 o 0-1.',valid_no_stb:'Si el resultado es 2-0 o 0-2, no hay supertiebreak.',edit_result:'Editar resultado',save_validate:'Guardar y validar',
not_in_cycle:'No estás en el ciclo activo.',load_note_player:'Cargás partidos tuyos del {g}. Solo aparecen los rivales con los que aún no tienes partido cargado. El admin lo validará.',load_note_admin:'Admin: cargás/editás cualquier partido. Lo que cargás queda validado.',
select_two:'Selecciona los dos jugadores.',same_group:'Ambos deben ser del mismo grupo.',validated_admin_only:'Ese resultado ya fue validado. Solo el admin puede editarlo.',result_sent_admin:'✓ Resultado válido y validado (admin).',result_sent_player:'✓ Resultado válido enviado. El admin lo validará.',select_club:'Elige el club (Sohail o Haza).',select_date:'Completa la fecha del partido.',
disputes_title:'Disputas activas (resuelve el admin)',no_disputes:'No hay disputas',validate:'Validar',
pending_title:'Pendientes de confirmación',no_pending:'No hay pendientes',waiting_rival:'Esperando al rival',review:'Revisar',
validated_result:'Resultado validado',disputed_result:'Resultado disputado',review_result:'Revisar resultado',validated_by:'Validado por',reported_by:'Reportado por',date_field:'Fecha',status_field:'Estado',confirmed_label:'Confirmado',locked_label:'Validado',confirm:'Confirmar',dispute:'Disputar',close:'Cerrar',validated_only_admin:'Validado — solo el admin edita',waiting_admin:'Esperando validación del admin',my_history:'Mi historial de partidos',hist_title:'Historial de partidos',hist_no_matches:'Sin partidos jugados todavía.',hist_won:'Ganó',hist_lost:'Perdió',
admin_cycle_status:'Estado del ciclo',validated_count:'{done}/{need} partidos validados',ready_close:'✓ Listo para cerrar el ciclo.',missing_results:'Faltan validar resultados.',close_cycle:'Cerrar ciclo e iniciar siguiente',finish_last_cycle:'Finalizar último ciclo (habilita Play Offs)',simulate:'Simular y validar todos',confirm_pending:'Confirmar pendientes',
cycle_dates:'Fechas de los ciclos',cycle_date_hint:'Edita el período de cada ciclo.',
promotions_title:'Ascensos y descensos — a qué grupo pasa cada puesto',promotions_hint:'Para cada grupo, elige a qué grupo va cada puesto al cerrar el ciclo. Las filas se ajustan solas a la cantidad de jugadores de cada grupo.',pos_goes_to:'{pos}º →',
edit_groups:'Editar grupos (Ciclo {n})',edit_groups_hint:'Reasigna, quita o agrega jugadores. Puedes dejar grupos de distinto tamaño si hace falta.',add_player:'Agregar jugador',first_name:'Nombre',last_name:'Apellido',add_btn:'Agregar',move_to:'mover a…',remove:'Quitar',
move_done:'{name} movido a {g}.',remove_done:'{name} quitado del ciclo.',add_fill_both:'Completa nombre y apellido.',add_choose_group:'Elige el grupo.',add_exists:'Ya existe un jugador con ese nombre y apellido.',add_done:'{name} agregado al {g}.',
playoffs_title:'Play Offs',playoffs_ready:'Todos los ciclos están cerrados. Previsualiza los cuadros para revisarlos y ajustar quién juega antes de iniciarlos.',playoffs_not_ready:'Los Play Offs se habilitan cuando todos los ciclos estén cerrados.',how_many_playoffs:'¿Cuántos cuadros (playoffs) en total?',bracket_singular:'cuadro',bracket_plural:'cuadros',preview_po:'Previsualizar Play Offs',po_started:'Los Play Offs ya están iniciados. Gestionalos desde la pestaña Play Offs.',po_preview_active:'Hay una previsualización en curso: revísala y confirma el inicio en la pestaña Play Offs.',
cycle_closed_next:'Ciclo {n} cerrado. ¡Ciclo {nx} iniciado con grupos actualizados!',cycle3_closed:'Todos los ciclos cerrados. Ya puedes iniciar los Play Offs desde Admin.',last_cycle_finished:'Último ciclo finalizado. Ya puedes previsualizar los Play Offs.',
po_preview_banner:'Previsualización — los Play Offs todavía NO están iniciados',po_preview_hint:'Así quedarían los cuadros según la clasificación general. Quita o agrega jugadores (los que no juegan) y ajusta la cantidad de cuadros. Cuando esté todo listo, confirma el inicio. Hasta entonces los jugadores no ven nada.',po_confirm_start:'Iniciar Play Offs definitivamente',
po_config:'Configuración de Play Offs',po_config_hint:'Al cambiar la cantidad, los cuadros se rearman repartiendo la clasificación general en partes iguales. Puedes también forzar en qué ronda empezar cada cuadro.',po_seeds_title:'Jugadores del Cuadro {l} — quita (✕) o agrega',po_removed:'Retirados: {list}.',po_add_label:'Agregar jugador a este cuadro',po_add_choose:'Elige…',po_add_btn:'Agregar',po_bye_note:'Si quitás a alguien, no se reemplaza: pasa uno más por bye.',
po_main_title:'Cuadro principal {l}',po_cons_title:'Consolación {l} (perdedores 1ª ronda)',po_legend:'Cuadros por tramos de la general. Cada uno con su consolación para los que pierden en primera ronda. El admin agrega/quita jugadores.',po_champ:'Campeón del Cuadro {l}',po_champ_cons:'Campeón Consolación {l}',
po_load_result:'Cargar resultado',po_to_play:'A jugar',po_not_available:'El admin todavía no inició los Play Offs.',po_not_yet:'Los Play Offs todavía no están disponibles.',po_match:'Cuadro {l}',po_no_bracket:'Sin cuadro.',po_move_from:'Mover jugador desde otro cuadro',po_choose_player:'Elige jugador…',po_move_here:'Mover aquí',po_move_confirm:'¿Mover a {n} del Cuadro {from} al Cuadro {to}?\n\nEl Cuadro {from} se va a reorganizar sin ese jugador.',po_move_no_player:'Elige un jugador para mover.',po_move_not_found:'No se pudo encontrar al jugador.',po_move_ok:'{n} movido al Cuadro {to}.',po_date_single:'Fecha única',po_date_range:'Rango de fechas',po_not_played:'No jugado',po_delete_btn:'Eliminar',po_seed_up:'Subir posición',po_seed_down:'Bajar posición',po_reorder_confirm:'Reordenar cambia los emparejamientos del Cuadro {l}. Los resultados ya cargados en este cuadro se van a borrar. ¿Continuar?',po_reorder_ok:'Posición de {n} actualizada.',po_form_note:'Partido de Play Offs — {draw} · {round}',
po_tab_players:'jug.',
pending_match:'Pendiente de juego',
po_started_toast:'Play Offs iniciados.',po_confirmed_toast:'¡Play Offs iniciados! Ya son visibles para los jugadores.',po_preview_toast:'Previsualización lista. Ajusta los jugadores y confirma el inicio.',po_need_3cycles:'Primero cierra todos los ciclos.',po_seed_removed:'{name} quitado del Cuadro (pasa uno por bye).',po_seed_added:'{name} agregado al Cuadro.',po_choose_add:'Elige un jugador para agregar.',po_report_no_players:'Ese partido todavía no tiene los dos jugadores.',po_locked:'Resultado ya validado. Solo el admin puede editarlo.',po_not_yours:'Solo los jugadores de ese partido (o el admin) pueden cargarlo.',po_validated:'Resultado de Play Off validado.',po_sent:'Resultado enviado. El admin lo validará.',
stage_dates:'Fechas de las etapas',stage_dates_hint:'Para cada ronda elige "Semana de juego" (rango desde–hasta) o "Fecha única".',single_date:'Fecha única',week_play:'Semana de juego',from_date:'Desde',until_date:'Hasta',
round_final:'Final',round_semi:'Semifinales',round_quarters:'Cuartos',round_16:'Octavos',round_32:'16avos',round_64:'32avos',round_n:'Ronda {n}',
my_profile:'My profile',full_name:'Nombre completo',email:'Email',phone:'Teléfono',save_data:'Guardar datos',change_password:'Cambiar contraseña',current_pass:'Contraseña actual',new_pass:'Nueva contraseña',repeat_pass:'Repetir nueva contraseña',save_pass:'Guardar contraseña',pass_wrong:'La contraseña actual no es correcta.',pass_short:'La nueva contraseña debe tener al menos 4 caracteres.',pass_no_match:'Las contraseñas nuevas no coinciden.',pass_ok:'✓ Contraseña actualizada.',profile_saved:'✓ Datos actualizados.',name_empty:'Name cannot be empty.',name_exists:'Ya existe un jugador con ese nombre.',role_admin:'Administrador',role_player:'Jugador',current_group_label:'Grupo actual',pk_section:'Ingreso rápido sin contraseña',pk_section_hint:'Activa el ingreso rápido en este dispositivo para entrar sin escribir la contraseña. Funciona con Face ID, Touch ID, huella o Windows Hello. Puedes activarlo en cada dispositivo que uses (celular, computadora, tablet). Tu contraseña sigue funcionando como respaldo.',pk_activate_btn:'Activar en este dispositivo',pk_activated:'Listo. Ya puedes entrar sin contraseña en este dispositivo.',pk_unsupported:'Este dispositivo no admite el ingreso rápido.',pk_need_login:'Inicia sesión con tu clave primero.',pk_cancelled:'Cancelaste el ingreso rápido.',pk_login_err:'No se pudo entrar sin contraseña. Usa tu contraseña.',pk_reg_err:'No se pudo activar. Prueba de nuevo.',pk_status_active:'Ingreso rápido activado',pk_status_active_hint:'Puedes entrar en este dispositivo sin escribir la contraseña. Si perdés el acceso al dispositivo, tu contraseña sigue funcionando.',pk_devices_lbl:'Dispositivos activados',pk_added_more:'Activar en otro dispositivo también',pk_registered_at:'Registrado',pk_last_used:'Último uso',pk_never_used:'todavía no usado',pk_device_deactivate:'Desactivar',pk_device_deactivate_confirm:'¿Desactivar el ingreso rápido en «{n}»? Vas a tener que usar tu contraseña en ese dispositivo hasta que lo actives de nuevo.',pk_device_deactivated:'Ingreso rápido desactivado en «{n}».',pk_device_deactivate_err:'No se pudo desactivar. Prueba de nuevo.',pk_list_err:'No se pudo cargar la lista de dispositivos.',pwf_pk_offer:'Activar también el ingreso rápido en este dispositivo (Face ID / Touch ID).',pwf_pk_offer_after:'Vas a tener que confirmar con Face ID / Touch ID en la ventana que aparece a continuación.',pk_rename_title:'Renombrar dispositivo',pk_rename_prompt:'Elige un nombre para reconocer este dispositivo.',pk_rename_empty:'El nombre no puede estar vacío.',pk_renamed:'Dispositivo renombrado.',pk_rename_err:'No se pudo renombrar.',forgot_pass:'Olvidé mi contraseña',forgot_title:'¿Olvidaste tu contraseña?',forgot_msg:'Contacta al administrador de la liga para que te reset la contraseña. Cuando lo haga, vas a entrar con la clave por defecto y la app te va a pedir elegir una nueva.',forgot_ok:'Entendido',theme_section:'Apariencia',theme_hint:'Elige cómo quieres ver la app en este dispositivo. La preferencia se guarda solo en este equipo.',theme_system:'Sistema',theme_light:'Claro',theme_dark:'Oscuro',theme_saved:'Apariencia actualizada.',pk_admin_title:'Ingreso rápido de los jugadores',pk_admin_desc:'Ve quién tiene activado el ingreso rápido y desactívalo si perdieron el dispositivo. La cuenta sigue funcionando con contraseña.',pk_admin_col_user:'Jugador',pk_admin_col_devices:'Dispositivos',pk_admin_col_last:'Último uso',pk_admin_none:'Ningún jugador tiene ingreso rápido activado todavía.',pk_admin_devices_of:'Dispositivos de {n}',pk_admin_del_confirm:'¿Desactivar el dispositivo «{d}» de {n}? Va a tener que entrar con contraseña hasta que lo reactive.',pk_admin_del_ok:'Dispositivo desactivado.',pk_admin_del_err:'No se pudo desactivar.',pk_admin_metric_lbl:'Adopción de ingreso rápido',pk_admin_metric_users:'jugadores lo usan',pk_admin_metric_devices:'dispositivos activados',pk_admin_metric_pct:'% de adopción',export_title:'Exportar liga',export_desc:'Descarga un Excel con todo: jugadores, clasificación, partidos, ciclos y playoffs.',export_btn:'Descargar Excel',export_working:'Preparando Excel…',export_ok:'Excel descargado.',export_err:'No se pudo exportar.',export_sheet_jugadores:'Jugadores',export_sheet_general:'Clasificación general',export_sheet_partidos:'Partidos',export_sheet_ciclos:'Ciclos',export_sheet_playoff:'Playoffs',wa_admin_title:'Notificaciones WhatsApp',wa_admin_desc:'Recibe un WhatsApp cada vez que se carga un resultado o se dispute un partido. Cada admin activa su propio número siguiendo el setup de CallMeBot.',wa_add_btn:'Agregar canal',wa_col_name:'Admin',wa_col_phone:'Teléfono',wa_col_apikey:'APIKEY',wa_col_active:'Activo',wa_col_last:'Último aviso',wa_col_actions:'Acciones',wa_test_btn:'Probar',wa_edit_btn:'Editar',wa_delete_btn:'Eliminar',wa_none:'Todavía no hay canales configurados. Agrega el primero.',wa_never:'nunca',wa_using_fallback:'usa el APIKEY del sistema',wa_modal_add_title:'Agregar canal WhatsApp',wa_modal_edit_title:'Editar canal WhatsApp',wa_field_name_lbl:'Nombre del admin',wa_field_name_ph:'Ej: Marcos',wa_field_phone_lbl:'Teléfono (formato internacional)',wa_field_phone_ph:'Ej: 34687291646',wa_field_phone_hint:'Solo dígitos, con código de país, sin "+" ni espacios.',wa_field_apikey_lbl:'APIKEY de CallMeBot',wa_field_apikey_ph:'Ej: 6643661',wa_field_apikey_hint:'Cada admin obtiene su propio APIKEY: agrega +34 623 91 22 04 como contacto en WhatsApp y enviale «I allow callmebot to send me messages». En 2 minutos te llega la respuesta con tu APIKEY.',wa_save_btn:'Guardar',wa_cancel_btn:'Cancelar',wa_delete_confirm:'¿Eliminar el canal de {n}? Dejará de recibir notificaciones.',wa_saved:'Canal guardado.',wa_deleted:'Canal eliminado.',wa_test_sending:'Enviando prueba…',wa_test_ok:'Mensaje de prueba enviado.',wa_test_err:'No se pudo enviar la prueba.',wa_toggle_ok:'Canal actualizado.',wa_err_save:'No se pudo guardar el canal.',wa_err_load:'No se pudieron cargar los canales.',wa_err_delete:'No se pudo eliminar el canal.',wa_bad_phone:'El número tiene que estar en formato internacional (entre 7 y 15 dígitos).',wa_bad_name:'El nombre no puede quedar vacío.',pl_active:'Activos',pl_inactive:'Inactivos',lh_title:'Barra del login',lh_desc:'Se muestra arriba del recuadro azul en la pantalla de login. Configura el color de fondo y los enlaces que aparecen (por ejemplo la web del club, redes, contacto).',lh_color_lbl:'Color de fondo',lh_textcolor_lbl:'Color de texto',lh_textcolor_auto:'auto según fondo',lh_textcolor_reset:'Volver al automático',lh_add_link:'Agregar enlace',lh_link_text:'Texto',lh_link_url:'URL (con https://)',lh_link_delete:'Eliminar',lh_no_links:'Todavía no hay enlaces. Agrega el primero para que la barra aparezca.',lh_saved:'Barra del login actualizada.',lh_url_bad:'La URL tiene que empezar con http:// o https://.',lh_text_bad:'El texto del enlace no puede estar vacío.',lh_del_confirm:'¿Eliminar el enlace «{n}»?',
admin_profile:'My profile — Administrador',player_mgmt:'Gestión de jugadores',player_mgmt_hint:'Ordenados alfabéticamente. Busca por nombre. Puedes editar nombre, email, teléfono, resetear contraseña, cambiar de grupo o eliminar.',search_player:'Buscar jugador…',refresh_list:'Actualizar lista',no_results:'Sin resultados',save:'Guardar',reset_pass:'Resetear clave',reset_done:'{name}: contraseña reseteada a la clave por defecto.',save_done:'{name}: datos actualizados.',
toast_confirmed:'¡Resultado confirmado y validado!',toast_disputed:'Resultado disputado. El admin lo revisará.',toast_pending_confirmed:'Pendientes confirmados.',toast_simulated:'Ciclo simulado y validado.',toast_dispute_resolved:'Disputa resuelta.',
reset_playoffs:'Reiniciar Play Offs',
reset_cycle:'Reiniciar Ciclo {n}',
reset_confirm_po:'¿Seguro que quieres borrar todos los Play Offs? Esta acción no se puede deshacer.',
reset_confirm_cycle:'¿Borrar todos los PARTIDOS del Ciclo {n}? Los grupos y jugadores se conservan; solo se eliminan los resultados cargados en ese ciclo.',
reset_done:'Reinicio completado.',
reset_cancel:'Cancelar',
tbd:'A definir',
mine_label:'tuyo',
pending_label:'Pendiente',
po_size_label:'Tamaño del cuadro / Empezar en',
po_size_auto:'Automático (según jugadores)',
r_64:'32avos de final (64 jug.)',
r_32:'16avos de final (32 jug.)',
r_16:'Octavos de final (16 jug.)',
r_8:'Cuartos de final (8 jug.)',
r_4:'Semifinales (4 jug.)',
r_2:'Final (2 jug.)',
delete_match:'Eliminar',
confirm_delete:'¿Seguro que quieres borrar este resultado permanentemente?',
match_deleted:'Resultado borrado.',
undo_demo:'Deshacer simulación',confirm_undo_demo:'¿Deshacer la simulación? Se borran únicamente los partidos generados por la simulación.',pass_changed:'Contraseña actualizada correctamente.',
toast_demo_undone:'Simulaciones borradas.',
ml_title:'Mis Ligas',ml_desc:'Estas son las ligas activas de la plataforma. Puedes pedir acceso a otra sin perder tu lugar aquí.',
ml_here:'estás aquí',ml_ok:'participando',ml_pending:'pendiente',ml_ask:'Solicitar acceso',ml_retry:'Reintentar',
ml_ask_confirm:'¿Solicitar acceso a "{n}"? El administrador de esa liga tendrá que aprobarlo antes de que puedas entrar.',
ml_ask_sent:'Solicitud enviada. El administrador de "{n}" la va a revisar.',
ml_ask_err:'No se pudo enviar la solicitud.',
ml_switch_confirm:'Vas a salir de esta sesión para entrar a "{n}". ¿Continuar?',
ml_no_leagues:'No hay ligas activas por el momento.',
ml_load_err:'No se pudo cargar.',
ml_conn_err:'No se pudo conectar con el servidor.',
ml_no_league_id:'No se pudo determinar tu liga actual.',
solicitudes_title:'Solicitudes de acceso',solicitudes_desc:'Jugadores de otras ligas de la plataforma que pidieron sumarse a esta.',
solicitudes_none:'No hay solicitudes pendientes.',
solicitudes_from:'Desde',
solicitudes_accept:'Aceptar',solicitudes_reject:'Rechazar',
solicitudes_only_owner:'Solo el administrador original o el super admin pueden aceptar jugadores nuevos. Puedes rechazar solicitudes.',
solicitudes_no_exists:'Esa solicitud ya no existe.',
solicitudes_no_perm:'Solo el administrador original o el super admin pueden aceptar jugadores nuevos.',
solicitudes_dup_confirm:'Ya existe un jugador llamado "{n}" en esta liga. ¿Marcar la solicitud como aceptada de todas formas? (no se crea una cuenta nueva, ya existe)',
solicitudes_accepted:'{n} fue aceptado con contraseña por defecto. Ahora hay que ubicarlo en un grupo.',
solicitudes_reject_confirm:'¿Rechazar la solicitud de "{n}"?',
solicitudes_rejected:'Solicitud rechazada.',
msg_admin_tab:'Administración',msg_group_tab:'Mi Grupo',
msg_admin_desc:'Avisos del administrador para todos los jugadores de la liga. Solo el administrador puede escribir acá.',
msg_group_desc:'Chat privado entre los jugadores de tu grupo en este ciclo. Solo ustedes lo ven.',
msg_placeholder:'Escribe un mensaje…',
msg_send:'Enviar',
msg_empty_admin:'Todavía no hay avisos del administrador.',
msg_empty_group:'Todavía no hay mensajes en este grupo. ¡Sé el primero en escribir!',
msg_no_group:'No perteneces a ningún grupo en este ciclo, así que no tienes un chat grupal disponible.',
msg_send_err:'No se pudo enviar el mensaje.',
msg_load_err:'No se pudieron cargar los mensajes.',
msg_empty_err:'Escribe algo antes de enviar.',
msg_you:'Tú',
msg_playoff_desc:'Chat privado entre los jugadores de tu cuadro de Play Offs. Solo ustedes lo ven.',
msg_no_playoff:'Todavía no pertenecés a ningún cuadro de Play Offs.',
msg_empty_playoff:'Todavía no hay mensajes en este cuadro. ¡Sé el primero en escribir!',
msg_explorar_tab:'Todos los grupos',
msg_explorar_desc:'Solo para administradores: elegí un ciclo y un grupo para leer su chat. Es de solo lectura — no podés escribir acá salvo que también seas jugador de ese grupo.',
msg_explorar_ver:'Ver chat',
},
en:{
gen_tiebreak_note:'<strong>Tiebreak:</strong> 1st Total points · 2nd Last cycle points · 3rd Highest group.',autoscale_title:'Auto-generate points scale',autoscale_hint:'Fill every group\'s points at once. The lowest group always starts at 5-4-3-2-1, and each group above adds your chosen step. No ceiling: the top group\'s points adjust to the number of groups. Within a group it drops by 1 up to 5th; from 6th on it repeats 5th. You can still tweak any group by hand afterwards.',autoscale_top:'Group 1 winner points',autoscale_step:'Points added per group',autoscale_btn:'Generate',autoscale_bad_top:'Enter a valid score for the Group 1 winner.',autoscale_bad_step:'Enter a valid drop value (1 or more).',autoscale_confirm:'Generate a scale for {n} groups: the lowest group is 5-4-3-2-1 and rises {step} per group. This replaces any hand-edited points. Continue?',autoscale_done:'Scale generated for {n} groups.',cycle_short:'C',draw:'Draw',inactive_short:'Inactive',gen_cycle_pts:'Points earned that cycle',gen_po_col:'Play Off',close_pending_first:'Before closing, resolve the loaded but unvalidated matches (pending or disputed).',close_force_confirm:'{n} matches were not played in this cycle. Close it anyway and start the next one? Those matches will remain unplayed and cannot be entered later.',close_force_confirm_last:'{n} matches were not played in this cycle. Finish it anyway and enable the Play Offs? Those matches will remain unplayed.',close_incomplete:'incomplete',close_can_incomplete:'{n} matches left to play. You can still close the cycle.',unvalidated_short:'unvalidated',rating_empty:'No players have enough matches yet to compute a rating.',rating_title:'Rating / Level',rating_desc:'Global rating (0–10) computed from each player\'s group, wins and losses per cycle. Sorted high to low.',rating_col:'Rating',rt_prov:'prov.',rt_prov_t:'Provisional rating: fewer than 15 matches. It sharpens as they play.',rt_prov_leg:'provisional (few matches)',rt_manual:'fixed',rt_manual_t:'Rating set manually by the administrator.',rt_manual_leg:'adjusted by admin',rt_adjust:'Adjust',rt_desc_utr:'UTR-style rating (1–16) computed from each player last 50 matches across all leagues. Recent matches, game margin and opponent level weigh more.',rt_pj:'M',rt_pj_lc:'matches',rt_grp:'Group',rt_grp_t:'Player current group in the active cycle',rt_calc_now:'Rating computed now',rt_seed_lbl:'Starting score (seed)',rt_seed_hint:'The player starting point. It guides the rating at first and fades as they play. Leave empty to start neutral.',rt_over_lbl:'Manual adjustment (fixed rating)',rt_over_hint:'If set, it replaces the computed rating and stays fixed. Leave empty to use the automatic calculation.',rt_empty_ph:'(empty)',rt_scale:'scale 1–16',rt_seed_bad:'The starting score must be between 1 and 16.',rt_over_bad:'The manual adjustment must be between 0.01 and 16.',rt_saved:'Rating updated.',rt_show_detail:'Show calculation detail',rt_hide_detail:'Hide detail',rt_col_seed:'Seed',rt_col_calc:'Calc.',rt_col_vd:'W-L',rt_col_vd_t:'Wins-Losses in the window',rt_col_pct:'% Games',rt_col_pct_t:'Percentage of games won',rt_col_riv:'Opp.Lvl',rt_col_riv_t:'Average level of opponents faced',rt_col_fiab:'Rel.',rt_col_fiab_t:'Reliability: how settled the rating is (based on number of matches)',rt_detail_help:'Seed: admin starting point · Calc.: computed rating (if manually adjusted) · W-L: wins and losses · % Games: share of games won · Opp.Lvl: average opponent level · Rel.: how settled the rating is.',rt_col_gg:'GW',rt_col_gg_t:'Total games won',rt_col_gp:'GL',rt_col_gp_t:'Total games lost',rt_pj_t:'Matches used in the calculation (max 50, most recent)',rt_howto_title:'How is the rating calculated?',rt_leg_rating:'= rating (1–16)',rt_leg_pj:'= matches used (max 50)',rt_leg_seed:'= admin starting score',rt_leg_calc:'= computed rating (if manually adjusted)',rt_leg_vd:'= wins-losses',rt_leg_gg:'= games won',rt_leg_gp:'= games lost',rt_leg_pct:'= % of games won',rt_leg_riv:'= average opponent level',rt_leg_fiab:'= reliability (out of 50 matches)',rt_howto_body:'The rating (1–16 scale, UTR-style) is computed from each player last 50 matches across all leagues. For every match, the percentage of games you won is compared to what was expected given the opponent level: beating a stronger player, or winning by more games, raises the rating more. Recent matches weigh more, and the super tiebreak counts as half a set. Each player group also acts as a starting point: being in a higher group places the rating higher, especially with few matches, and that influence fades as more matches are played and real results take over. Reliability grows up to 50 matches; below 15 the rating is provisional.',rating_nivel:'Level',rating_nivel_t:'Average level of play weighted by cycle',rating_efic:'Efficiency',rating_efic_t:'Efficiency weighted by group difficulty (1–10)',rating_fiab:'Reliability',rating_fiab_t:'Rises with matches played (saturates at 10)',rating_grupo:'Group',rating_grupo_t:'Average group weighted by matches (1 = highest group)',rating_ppp:'Pts/M',rating_ppp_t:'Average points per match (3 win, 1 loss)',rating_pj:'M',rating_gp:'W-L',rating_pct:'%Win',rating_footer:'Rating weighs 85% level of play, 10% efficiency by group difficulty and 5% reliability by number of matches.',rating_feature:'Rating feature',rating_toggle_label:'Show Rating/Level tab',rating_toggle_hint:'If enabled, all users will see a tab with each player\'s rating. If not, the tab does not appear.',rating_on:'On',rating_off:'Off',rating_enabled_toast:'Rating enabled. The tab is now visible to everyone.',rating_disabled_toast:'Rating disabled. The tab is no longer shown.',appearance_title:'League appearance',legend_nj:'Not played',dispute_color:'Dispute color',dispute_color_hint:'background of disputed matches',dispute_short:'Disputed',clubs_title:'Clubs',clubs_hint:'Edit each club name and color, add or remove. The color shades the results table; text auto-darkens so it stays readable.',club_add:'Add club',club_delete:'Delete club',club_name_ph:'Club name',club_short:'Club',club_min_one:'At least one club must remain.',club_delete_confirm:'Delete club "{n}"? Matches already saved with this club keep their score but lose the color.',club_err_empty:'No club can be left unnamed.',club_err_dup:'Two clubs have the same name.',preview:'Preview',save_all:'Save all',reset_colors:'Reset colors',confirm_all_skipped:'Pending matches validated. {n} were skipped because you played in them: another administrator must confirm them.',own_match_admin:'You cannot referee a match you played in. Another administrator must confirm it.',wo_not_yours:'You cannot mark W.O. on a match you are playing in. Ask another administrator.',role_only_owner:'Only the original administrator and the super admin can grant this role.',admins_section:'League administrators',admins_hint:'Besides the Organización account, these people can administer the league. They are still players: they keep their group and their matches.',admins_none:'No player has administrator rights.',role_section:'League role',role_is_admin:'Administrator',role_is_player:'Player',role_make_admin:'Make administrator',role_make_player:'Remove administrator',role_confirm_up:'Give {n} administrator rights? They will be able to confirm results, edit players and change the league settings.',role_confirm_down:'Remove {n}\'s administrator rights? They go back to being a regular player.',role_done:'{n}\'s role updated.',role_last_admin:'At least one administrator must remain.',reset_not_here:'Not available from here.',reset_confirm:'Reset {n}\'s password to the default "tenis"? They will be asked to change it on their next login.',reset_ok:'{n}\'s password was reset. They will be asked for a new one on login.',reset_err:'Could not reset the password.',pwf_title:'Change your password',pwf_why:'You are using the default password, which is public. Choose a new one to continue.',pwf_new:'New password',pwf_rep:'Repeat it',pwf_save:'Save and continue',pwf_short:'It must be at least 6 characters.',pwf_same:'It cannot be the same one you had.',pwf_nomatch:'The two passwords do not match.',pwf_err:'Could not change it. Please try again.',err_need_both:'Enter your username and password.',err_no_server:'Could not reach the server. Please try again.',err_no_users:'Could not load the user list.',err_users_404:'The file api/users.js is missing from the repo (404).',err_users_csp:'The browser blocked the call to /api/users.',err_server_said:'The server returned ',err_hydrate:'Data was read but could not be applied. Please reload the page.',err_no_data:'Could not load the data. Please reload the page.',err_no_user_league:'Your user was not found in the league.',err_inactive:'Your account is inactive. Please contact the administrator.',err_session_expired:'Your session expired. Please log in again.',err_session_expired_save:'Your session expired. Log in again to keep saving.',err_no_access:'You do not have access.',err_conflict:'Someone else saved a change while you were entering yours. Please reload and enter it again.',login_working:'Signing in…',app_title:'Sohail Tennis League',app_subtitle:'Summer 2026',select_user:'Select User',admin_org:'admin (Organisation)',password:'Password',enter:'Log in',pk_login_btn:'Sign in with Face ID / Touch ID',invalid_user:'Please select a valid user.',wrong_pass:'Incorrect password.',past_title:'Past leagues',past_sub:'Browse finished seasons',past_view:'View standings and results',past_readonly:'You are viewing a finished league (read-only).',past_back:'Back to home',past_current:'Active league',lsel_title:'Which league do you want to enter?',lsel_title_post:'Hi, {n}. Which league do you want to enter?',lsel_current:'Switch league',lsel_current_tag:'here',lsel_cancel:'Switch account',aa_title:'No active leagues',aa_sub:'Sign in as administrator to reopen or create a league.',aa_banner:'There is no active league. Go to Admin → League management to reopen this one or create a new one.',err_no_active_league:'There is no active league right now. Come back when the administrator opens a new one. To browse past seasons, use "Past leagues".',past_player_btn:'View past leagues',past_player_lbl:'Pick a season',past_player_none:'No past leagues yet.',past_player_nomatch:'No matches in that league.',past_loading:'Loading…',past_loading_err:'Could not load.',won_lc:'won',lost_lc:'lost',win_short:'W',loss_short:'L',h2h_title:'Head 2 Head',h2h_none:'{a} and {b} have never played each other.',h2h_balance:'{a} {ga} · {b} {gb} in head-to-head matches',lm_title:'League management',lm_desc:'Create a new league from the player catalog, or close, reopen and delete existing ones.',lm_new:'Create new league',lm_none:'No leagues registered yet.',lm_active:'Active',lm_finished:'Finished',lm_close:'Close',lm_reopen:'Reopen',lm_delete:'Delete',lm_rename:'Rename',lm_rename_prompt:'New league name:',lm_rename_empty:'The name cannot be empty.',lm_new_title:'Create new league',lm_name_lbl:'League name',lm_name_ph:'e.g. Summer League 2026',lm_id_lbl:'Identifier (internal URL)',lm_id_hint:'Lowercase, numbers and hyphens only. Cannot be changed later.',lm_groups:'Number of groups',lm_cycles:'Number of cycles',lm_gc_hint:'You can adjust groups and cycles later from the admin panel.',lm_clubs_lbl:'Participating clubs',lm_clubs_hint:'They start with the same clubs and colors as the current league. You can rename them, change their color (with the picker or by typing the hex code), or add/remove clubs for this league.',lm_players_lbl:'Players from catalog',lm_search_ph:'Search player…',lm_no_catalog:'The catalog is empty. Add new players below.',lm_no_match:'No player matches.',lm_new_players_lbl:'Add new players',lm_add_player:'Add player',lm_np_name:'Name',lm_np_email:'Email (optional)',lm_total:'{n} players selected',lm_create:'Create league',lm_creating:'Creating…',lm_created:'League "{n}" created.',lm_confirm_empty:'You did not select any players. Create the empty league anyway?',lm_err_name:'Enter a name for the league.',lm_err_id:'The identifier can only have lowercase letters, numbers and hyphens.',lm_err_create:'Could not create the league.',lm_close_confirm:'Close league "{n}"? It will become finished and publicly viewable in read-only mode. You can reopen it later.',lm_reopen_confirm:'Reopen league "{n}"? It becomes active and editable again.',lm_delete_confirm1:'Delete league "{n}"? This cannot be undone.',lm_delete_confirm2:'To confirm, type the exact league name:\n\n{n}',lm_delete_mismatch:'The name does not match. Nothing was deleted.',lm_action_ok:'Done.',lm_err_action:'Could not complete the action.',rg_tab:'Rules',rg_title:'League rules',rg_empty:'No rules have been added for this league yet.',rg_create:'Create rules',rg_edit:'Edit',rg_save:'Save rules',rg_saved:'Rules saved.',rg_placeholder:'Write the league rules here…',rg_copy:'Copy from another league',rg_copy_title:'Copy rules',rg_copy_desc:'Choose the league to copy the rules from. You can review them before saving.',rg_copy_none:'No other leagues to copy from.',rg_copy_empty:'League "{n}" has no rules set.',rg_copied:'Rules copied from "{n}". Review and save.',err_too_big:'Could not save: too much content (likely a very large image in the rules). Remove the heaviest image and try again.',st_title:'Statistics',st_current:'Current league',st_total:'Total (all leagues)',st_pj:'Played',st_pg:'Won',st_pp:'Lost',st_pct:'% Win',cj_title:'Players in the database',cj_desc:'All players in the system (current and from past leagues). You can only delete players with no matches; those who played keep their history.',cj_search:'Search player…',cj_none:'No players in the database.',cj_total:'{n} players total',cj_leagues:'{n} leagues',cj_matches:'{n} matches',cj_has_matches:'Has matches: cannot be deleted (history would be lost).',cj_del_confirm:'Delete "{n}" from the database? They lose their account, but since they have no matches no history is affected.',cj_deleted:'"{n}" deleted from the database.',cj_del_err:'Could not delete the player.',cj_fusion_btn:'Merge profiles',cj_fusion_salir:'Cancel merge',cj_fusion_hint:'Pick 2 players who are the same person.',cj_fusion_confirm_lbl:'Which one do you want to keep as the main profile?',cj_fusion_keep:'Keep {n}',cj_fusion_final_confirm:'Merge both profiles into "{n}"? The other profile is deleted from the database and all its leagues are re-linked to "{n}" with a single password. This cannot be undone.',cj_fusion_done:'Profiles merged into "{n}".',cj_fusion_err:'Could not merge the players.',rg_bold:'Bold',rg_italic:'Italic',rg_underline:'Underline',rg_size:'Size',rg_size_s:'Small',rg_size_m:'Normal',rg_size_l:'Large',rg_size_xl:'Very large',rg_ul:'Bullets',rg_ol:'Numbered',rg_img:'Insert image',rg_img_hint:'You can paste images directly (Ctrl+V) or use the button. Max 2 MB per image.',rg_img_big:'The image is too large (max 2 MB). Try a lighter one.',aj_open_btn:'Add from past leagues',aj_title:'Add players from past leagues',aj_desc:'Pick players who already played in other leagues and add them to this one, choosing which group each one joins.',aj_none:'No players from other leagues to add (or they are all already in this league).',aj_total:'{n} players selected',aj_none_sel:'Select at least one player.',aj_add:'Add to league',aj_adding:'Adding…',aj_done:'{n} players were added to the league.',aj_err:'Could not add the players.',
ml_title:'My Leagues',ml_desc:'These are the platform\'s active leagues. You can request access to another one without losing your spot here.',
ml_here:'you are here',ml_ok:'participating',ml_pending:'pending',ml_ask:'Request access',ml_retry:'Retry',
ml_ask_confirm:'Request access to "{n}"? That league\'s administrator will need to approve it before you can enter.',
ml_ask_sent:'Request sent. "{n}"\'s administrator will review it.',
ml_ask_err:'Could not send the request.',
ml_switch_confirm:'You are about to log out of this session to enter "{n}". Continue?',
ml_no_leagues:'No active leagues right now.',
ml_load_err:'Could not load.',
ml_conn_err:'Could not reach the server.',
ml_no_league_id:'Could not determine your current league.',
solicitudes_title:'Access requests',solicitudes_desc:'Players from other leagues on the platform who asked to join this one.',
solicitudes_none:'No pending requests.',
solicitudes_from:'From',
solicitudes_accept:'Accept',solicitudes_reject:'Reject',
solicitudes_only_owner:'Only the original administrator or the super admin can accept new players. You can reject requests.',
solicitudes_no_exists:'That request no longer exists.',
solicitudes_no_perm:'Only the original administrator or the super admin can accept new players.',
solicitudes_dup_confirm:'A player named "{n}" already exists in this league. Mark the request as accepted anyway? (no new account will be created, it already exists)',
solicitudes_accepted:'{n} was accepted with the default password. Now they need to be placed in a group.',
solicitudes_reject_confirm:'Reject the request from "{n}"?',
solicitudes_rejected:'Request rejected.',
msg_admin_tab:'Administration',msg_group_tab:'My Group',
msg_admin_desc:'Announcements from the administrator to all players in the league. Only the administrator can post here.',
msg_group_desc:'Private chat between the players in your group this cycle. Only you can see it.',
msg_placeholder:'Write a message…',
msg_send:'Send',
msg_empty_admin:'No announcements from the administrator yet.',
msg_empty_group:'No messages in this group yet. Be the first to write!',
msg_no_group:"You don't belong to any group this cycle, so there's no group chat available for you.",
msg_send_err:'Could not send the message.',
msg_load_err:'Could not load the messages.',
msg_empty_err:'Write something before sending.',
msg_you:'You',
msg_playoff_desc:'Private chat between the players in your Play Offs bracket. Only you can see it.',
msg_no_playoff:"You don't belong to any Play Offs bracket yet.",
msg_empty_playoff:'No messages in this bracket yet. Be the first to write!',
msg_explorar_tab:'All Groups',
msg_explorar_desc:'Admins only: pick a cycle and a group to read its chat. Read-only — you can only post here if you are also a player in that group.',
msg_explorar_ver:'View chat',
exit:'Log out',cycle:'Cycle',playoffs:'Play Offs',playoffs_prev:'Play Offs (preview)',
tab_grupos:'Groups',tab_general:'Standings',tab_cargar:'Upload',tab_cargar_admin:'Upload',tab_pendientes:'Pending',tab_pendientes_admin:'Pending / Disputes',tab_perfil:'Profile & Players',tab_mensajes:'Inbox',tab_admin:'Admin',
choose_group:'Choose group',group:'Group',destination:'Dest.',player:'Player',won:'W',lost:'L',not_played:'NP',sets_won:'SW',sets_lost:'SL',balance:'Bal',pts_pos:'Pos.pts',extra:'Extra',total:'Total',pts_classif:'Points for the General Standings',players_col:'Players',edit:'Edit',
legend_pts:'<strong>Standings table:</strong> Pts: points (3 win · 1 loss · 0 not played) · W: wins · L: losses · NP: not played · SW: sets won · SL: sets lost · Bal: set balance (SW−SL) · Pos.pts: points for group position · Extra: +2 to group winner · Total: Pos.pts + Extra (adds to General Standings) · Dest.: group player moves to: up (↑), down (↓) or stays (=).<br><strong>Tiebreakers (in order):</strong> 1st Points · 2nd Matches played · 3rd Head-to-head · 4th Set balance · 5th H2H 2nd (among still-tied players) · 6th Game balance.',
legend_matrix:"Score is read in the player's row (their games first). Each cell color shows the club where it was played (see key).",
legend_pending:'Pending validation',legend_disputed:'Disputed',legend_load:'+ upload',legend_noedit:'· locked',
general_title:'Cumulative general standings (all cycles)',
current_group:'Current group',you:'You',me_label:'You',
report_result:'Report Result',reporter:'Player (Who Reports)',rival:'Opponent',club_label:'Club',date_label:'Date',
reqmark_label:'MANDATORY',set:'Set',
sets_section:'Results by set',supertiebreak:'S.Tiebreak',stb_hint:'only 1-0 or 0-1',add_stb:'Super tiebreak (1-1)',
remove_stb:'Remove super tiebreak',send:'Send',clear:'Clear',set_hint:'6-0 to 6-4, 7-5 or 7-6',valid_need2sets:'Please complete both sets.',valid_set1:'Invalid Set 1 (6-0 to 6-4, 7-5 or 7-6).',valid_set2:'Invalid Set 2 (6-0 to 6-4, 7-5 or 7-6).',valid_need_stb:'Sets tied 1-1: please complete the super tiebreak.',valid_stb_only:'The super tiebreak can only be 1-0 or 0-1.',valid_no_stb:'No super tiebreak needed if result is 2-0 or 0-2.',edit_result:'Edit result',save_validate:'Save & validate',
not_in_cycle:'You are not in the active cycle.',load_note_player:'Upload your matches in {g}. Only opponents you haven\'t played yet are shown. The admin will validate it.',load_note_admin:'Admin: upload/edit any match. Immediately validated.',
select_two:'Please select two players.',same_group:'Both players must be in the same group.',validated_admin_only:'That result is already validated. Only the admin can edit it.',result_sent_admin:'✓ Valid result — validated (admin).',result_sent_player:'✓ Valid result submitted. The admin will validate it.',select_club:'Please choose a club (Sohail or Haza).',select_date:'Please fill in the match date.',
disputes_title:'Active disputes (resolved by admin)',no_disputes:'No disputes',validate:'Validate',
pending_title:'Pending Confirmation',no_pending:'No pending items',waiting_rival:'Waiting for opponent',review:'Review',
validated_result:'Validated result',disputed_result:'Disputed result',review_result:'Review result',validated_by:'Validated by',reported_by:'Reported by',date_field:'Date',status_field:'Status',confirmed_label:'Confirmed',locked_label:'Validated',confirm:'Confirm',dispute:'Dispute',close:'Close',validated_only_admin:'Validated — only admin can edit',waiting_admin:'Waiting for admin validation',my_history:'My match history',hist_title:'Match history',hist_no_matches:'No matches played yet.',hist_won:'Won',hist_lost:'Lost',
admin_cycle_status:'Cycle status',validated_count:'{done}/{need} matches validated',ready_close:'✓ Ready to close the cycle.',missing_results:'Some results still need validating.',close_cycle:'Close cycle and start next',finish_last_cycle:'Finish last cycle (enables Play Offs)',simulate:'Simulate and validate all',confirm_pending:'Confirm pending',
cycle_dates:'Cycle dates',cycle_date_hint:"Edit each cycle's period.",
promotions_title:'Promotions & relegations — where each position goes',promotions_hint:'For each group, choose which group each finishing position goes to when the cycle closes.',pos_goes_to:'{pos} →',
edit_groups:'Edit groups (Cycle {n})',edit_groups_hint:'Reassign, remove or add players. Groups can have different sizes if needed.',add_player:'Add player',first_name:'First name',last_name:'Last name',add_btn:'Add',move_to:'move to…',remove:'Remove',
move_done:'{name} moved to {g}.',remove_done:'{name} removed from cycle.',add_fill_both:'Please fill in first and last name.',add_choose_group:'Please choose a group.',add_exists:'A player with that name already exists.',add_done:'{name} added to {g}.',
playoffs_title:'Play Offs',playoffs_ready:'All cycles closed. Preview brackets to review and adjust before starting.',playoffs_not_ready:'Play Offs are enabled once all cycles are closed.',how_many_playoffs:'How many brackets (play offs) in total?',bracket_singular:'bracket',bracket_plural:'brackets',preview_po:'Preview Play Offs',po_started:'Play Offs are already running. Manage them from the Play Offs tab.',po_preview_active:'A preview is in progress: review it and confirm from the Play Offs tab.',
cycle_closed_next:'Cycle {n} closed. Cycle {nx} started with updated groups!',cycle3_closed:'All cycles closed. You can now start the Play Offs from Admin.',last_cycle_finished:'Last cycle finished. You can now preview the Play Offs.',
po_preview_banner:'Preview — Play Offs have NOT started yet',po_preview_hint:'This is how the brackets would look. Remove or add players (those not playing) and adjust the number of brackets. When ready, confirm the start. Until then players see nothing.',po_confirm_start:'Start Play Offs for real',
po_config:'Play Off settings',po_config_hint:'Changing the number of brackets redistributes the general standings evenly. You can also force the starting round.',po_seeds_title:'Players in Draw {l} — remove (✕) or add',po_removed:'Withdrawn: {list}.',po_add_label:'Add player to this bracket',po_add_choose:'Choose…',po_add_btn:'Add',po_bye_note:'If you remove someone they are not replaced: another player gets a bye instead.',
po_main_title:'Main Draw {l}',po_cons_title:'Consolation {l} (1st round losers)',po_legend:'Brackets by general standings segment. Each has a consolation for 1st-round losers. Admin adds/removes players.',po_champ:'Champion Draw {l}',po_champ_cons:'Consolation champion {l}',
po_load_result:'Upload result',po_to_play:'To be played',po_not_available:'Admin has not started the Play Offs yet.',po_not_yet:'Play Offs are not available yet.',po_match:'Draw {l}',po_no_bracket:'No draw.',po_move_from:'Move player from another bracket',po_choose_player:'Choose player…',po_move_here:'Move here',po_move_confirm:'Move {n} from Bracket {from} to Bracket {to}?\n\nBracket {from} will be reorganised without that player.',po_move_no_player:'Choose a player to move.',po_move_not_found:'Could not find the player.',po_move_ok:'{n} moved to Bracket {to}.',po_date_single:'Single date',po_date_range:'Date range',po_not_played:'Not played',po_delete_btn:'Delete',po_seed_up:'Move up',po_seed_down:'Move down',po_reorder_confirm:'Reordering changes the pairings in Bracket {l}. Results already loaded in this bracket will be erased. Continue?',po_reorder_ok:'{n}\'s position updated.',po_form_note:'Play Off Match — {draw} · {round}',
po_tab_players:'players',
pending_match:'Pending match',
po_started_toast:'Play Offs started.',po_confirmed_toast:'Play Offs started! Now visible to players.',po_preview_toast:'Preview ready. Adjust players and confirm the start.',po_need_3cycles:'Close all cycles first.',po_seed_removed:'{name} removed from Draw (another player gets a bye).',po_seed_added:'{name} added to Draw.',po_choose_add:'Choose a player to add.',po_report_no_players:"That match doesn't have both players yet.",po_locked:'Result already validated. Only the admin can edit it.',po_not_yours:'Only the players in that match (or the admin) can upload it.',po_validated:'Play Off result validated.',po_sent:'Result submitted. The admin will validate it.',
stage_dates:'Stage dates',stage_dates_hint:'For each round choose "Match week" (date range) or "Single date".',single_date:'Single date',week_play:'Match week',from_date:'From',until_date:'To',
round_final:'Final',round_semi:'Semifinals',round_quarters:'Quarterfinals',round_16:'Round of 16',round_32:'Round of 32',round_64:'Round of 64',round_n:'Round {n}',
my_profile:'My profile',full_name:'Full name',email:'Email',phone:'Phone',save_data:'Save details',change_password:'Change password',current_pass:'Current password',new_pass:'New password',repeat_pass:'Repeat new password',save_pass:'Save password',pass_wrong:'Current password is incorrect.',pass_short:'New password must be at least 4 characters.',pass_no_match:'New passwords do not match.',pass_ok:'✓ Password updated.',profile_saved:'✓ Details updated.',name_empty:'Name cannot be empty.',name_exists:'A player with that name already exists.',role_admin:'Administrator',role_player:'Player',current_group_label:'Current group',pk_section:'Passwordless sign-in',pk_section_hint:'Enable passwordless sign-in on this device to log in without typing your password. Works with Face ID, Touch ID, fingerprint or Windows Hello. You can enable it on every device you use (phone, computer, tablet). Your password still works as a backup.',pk_activate_btn:'Enable on this device',pk_activated:'Done. You can now sign in without a password on this device.',pk_unsupported:'This device does not support passwordless sign-in.',pk_need_login:'Sign in with your password first.',pk_cancelled:'You cancelled passwordless sign-in.',pk_login_err:'Could not sign in without a password. Use your password.',pk_reg_err:'Could not enable it. Please try again.',pk_status_active:'Passwordless sign-in enabled',pk_status_active_hint:'You can sign in on this device without typing your password. If you lose access to the device, your password still works.',pk_devices_lbl:'Enabled devices',pk_added_more:'Enable on another device too',pk_registered_at:'Registered',pk_last_used:'Last used',pk_never_used:'not used yet',pk_device_deactivate:'Disable',pk_device_deactivate_confirm:'Disable passwordless sign-in on "{n}"? You will need to use your password on that device until you enable it again.',pk_device_deactivated:'Passwordless sign-in disabled on "{n}".',pk_device_deactivate_err:'Could not disable it. Please try again.',pk_list_err:'Could not load the device list.',pwf_pk_offer:'Also enable passwordless sign-in on this device (Face ID / Touch ID).',pwf_pk_offer_after:'You will need to confirm with Face ID / Touch ID in the window that appears next.',pk_rename_title:'Rename device',pk_rename_prompt:'Choose a name to recognise this device.',pk_rename_empty:'Name cannot be empty.',pk_renamed:'Device renamed.',pk_rename_err:'Could not rename it.',forgot_pass:'Forgot password',forgot_title:'Forgot your password?',forgot_msg:'Contact the league administrator to reset your password. Once they do, you will sign in with the default password and the app will ask you to choose a new one.',forgot_ok:'Got it',theme_section:'Appearance',theme_hint:'Choose how you want to see the app on this device. The preference is saved locally.',theme_system:'System',theme_light:'Light',theme_dark:'Dark',theme_saved:'Appearance updated.',pk_admin_title:'Players passwordless sign-in',pk_admin_desc:'See who has passwordless sign-in enabled and disable it if they lost the device. Their account still works with password.',pk_admin_col_user:'Player',pk_admin_col_devices:'Devices',pk_admin_col_last:'Last used',pk_admin_none:'No player has enabled passwordless sign-in yet.',pk_admin_devices_of:'Devices of {n}',pk_admin_del_confirm:'Disable the device "{d}" of {n}? They will need to sign in with password until they enable it again.',pk_admin_del_ok:'Device disabled.',pk_admin_del_err:'Could not disable.',pk_admin_metric_lbl:'Passwordless sign-in adoption',pk_admin_metric_users:'players using it',pk_admin_metric_devices:'devices enabled',pk_admin_metric_pct:'% adoption',export_title:'Export league',export_desc:'Download an Excel with everything: players, standings, matches, cycles and playoffs.',export_btn:'Download Excel',export_working:'Preparing Excel…',export_ok:'Excel downloaded.',export_err:'Could not export.',export_sheet_jugadores:'Players',export_sheet_general:'Standings',export_sheet_ciclos:'Cycles',export_sheet_playoff:'Playoffs',wa_admin_title:'WhatsApp notifications',wa_admin_desc:'Get a WhatsApp every time a match is loaded or disputed. Each admin activates their own number by following the CallMeBot setup.',wa_add_btn:'Add channel',wa_col_name:'Admin',wa_col_phone:'Phone',wa_col_apikey:'APIKEY',wa_col_active:'Active',wa_col_last:'Last sent',wa_col_actions:'Actions',wa_test_btn:'Test',wa_edit_btn:'Edit',wa_delete_btn:'Delete',wa_none:'No channels configured yet. Add the first one.',wa_never:'never',wa_using_fallback:'uses the system APIKEY',wa_modal_add_title:'Add WhatsApp channel',wa_modal_edit_title:'Edit WhatsApp channel',wa_field_name_lbl:'Admin name',wa_field_name_ph:'e.g. Marcos',wa_field_phone_lbl:'Phone (international format)',wa_field_phone_ph:'e.g. 34687291646',wa_field_phone_hint:'Digits only, with country code, no "+" or spaces.',wa_field_apikey_lbl:'CallMeBot APIKEY',wa_field_apikey_ph:'e.g. 6643661',wa_field_apikey_hint:'Each admin gets their own APIKEY: add +34 623 91 22 04 as a WhatsApp contact and send them "I allow callmebot to send me messages". You will get the APIKEY reply within 2 minutes.',wa_save_btn:'Save',wa_cancel_btn:'Cancel',wa_delete_confirm:'Delete {n}\'s channel? They will stop receiving notifications.',wa_saved:'Channel saved.',wa_deleted:'Channel deleted.',wa_test_sending:'Sending test…',wa_test_ok:'Test message sent.',wa_test_err:'Could not send the test.',wa_toggle_ok:'Channel updated.',wa_err_save:'Could not save the channel.',wa_err_load:'Could not load the channels.',wa_err_delete:'Could not delete the channel.',wa_bad_phone:'The phone must be in international format (between 7 and 15 digits).',wa_bad_name:'The name cannot be empty.',pl_active:'Active',pl_inactive:'Inactive',lh_title:'Login header',lh_desc:'Shows above the blue box on the login screen. Set the background color and the links to display (for example the club website, social media, contact).',lh_color_lbl:'Background color',lh_textcolor_lbl:'Text color',lh_textcolor_auto:'auto based on background',lh_textcolor_reset:'Reset to automatic',lh_add_link:'Add link',lh_link_text:'Text',lh_link_url:'URL (with https://)',lh_link_delete:'Delete',lh_no_links:'No links yet. Add the first one so the bar shows up.',lh_saved:'Login header updated.',lh_url_bad:'URL must start with http:// or https://.',lh_text_bad:'Link text cannot be empty.',lh_del_confirm:'Delete link "{n}"?',
admin_profile:'My profile — Administrator',player_mgmt:'Player management',player_mgmt_hint:'Sorted alphabetically. Search by name. Edit name, email, phone, reset passwords, switch group or delete.',search_player:'Search player…',refresh_list:'Refresh list',no_results:'No results',save:'Save',reset_pass:'Reset password',reset_done:'{name}: password reset to the default password.',save_done:'{name}: details updated.',
toast_confirmed:'Result confirmed and validated!',toast_disputed:'Result disputed. Admin will review it.',toast_pending_confirmed:'Pending results confirmed.',toast_simulated:'Cycle simulated and validated.',toast_dispute_resolved:'Dispute resolved.',
reset_playoffs:'Reset Play Offs',
reset_cycle:'Reset Cycle {n}',
reset_confirm_po:'Are you sure you want to reset all Play Offs? This cannot be undone.',
reset_confirm_cycle:'Delete all MATCHES in Cycle {n}? Groups and players are preserved; only the results loaded in that cycle will be removed.',
reset_done:'Reset completed.',
reset_cancel:'Cancel',
tbd:'TBD',
mine_label:'yours',
pending_label:'Pending',
po_size_label:'Bracket Size / Starting Round',
po_size_auto:'Auto (based on players)',
r_64:'Round of 64 (64 players)',
r_32:'Round of 32 (32 players)',
r_16:'Round of 16 (16 players)',
r_8:'Quarterfinals (8 players)',
r_4:'Semifinals (4 players)',
r_2:'Final (2 players)',
delete_match:'Delete',
confirm_delete:'Are you sure you want to permanently delete this result?',
match_deleted:'Result deleted.',
undo_demo:'Undo simulation',confirm_undo_demo:'Undo the simulation? Only matches generated by the simulation will be deleted.',pass_changed:'Password updated successfully.',
toast_demo_undone:'Simulations removed.',
},};
const LAYOUT='selector';const LOGINMODE='groups';
// Default de PUNTOS antes de que _hydrate() lo pise con lo guardado en la base.
// Generado con la fórmula estándar de la liga: 12 grupos de 5, paso=3, el
// último puesto del último grupo vale 1 punto. (Antes había un valor
// hardcodeado con un bug: G8 y G9 tenían los mismos puntos por una escala
// vieja que quedó desalineada al agregar un grupo. Ya no puede pasar: este
// valor se recalcula con la misma fórmula que usa "Recalcular puntos" y
// "Generar escala automática" en el panel de admin.)
let PUNTOS={1:[38,37,36,35,34],2:[35,34,33,32,31],3:[32,31,30,29,28],4:[29,28,27,26,25],5:[26,25,24,23,22],6:[23,22,21,20,19],7:[20,19,18,17,16],8:[17,16,15,14,13],9:[14,13,12,11,10],10:[11,10,9,8,7],11:[8,7,6,5,4],12:[5,4,3,2,1]};
let DESTINO={1:['G1','G1','G2','G2','G3'],2:['G1','G1','G2','G3','G4'],3:['G1','G2','G3','G4','G5'],4:['G2','G3','G4','G5','G6'],5:['G3','G4','G5','G6','G7'],6:['G4','G5','G6','G7','G8'],7:['G5','G6','G7','G8','G9'],8:['G6','G7','G8','G9','G10'],9:['G7','G8','G9','G10','G11'],10:['G8','G9','G10','G11','G12'],11:['G9','G10','G11','G12','G12'],12:['G10','G11','G11','G12','G12']};
let FECHAS=['15/06/26 – 19/07/26','20/07/26 – 23/08/26','24/08/26 – 27/09/26'];
let PO_FECHAS = { r64:{type:'single',date:'',from:'',to:''}, r32:{type:'single',date:'',from:'',to:''}, r16:{type:'single',date:'',from:'',to:''}, r8:{type:'single',date:'',from:'',to:''}, r4:{type:'single',date:'',from:'',to:''}, r2:{type:'single',date:'',from:'',to:''} };
const C1=[['Neil Young','Marcos Gavassa','Jeremy Pérez','Leo Ramos','Adrián Mariscal'],['Manuel de la Coba','Javier Lopez','Miguel Ángel Vargas','Jaime Govantes','Luis Gil-Delgado'],['Javier Ariño','Germán Pacheco','Oscar Pacheco','Dumitru Bucse','Gustavo Rodriguez'],['Juan Antonio Tabernero','Carlos Marin','Jose Maria Cantero','Javier Urbieta','Marco Musso'],['Miguel Ángel Acevedo','Esteban Benítez','Cesar Henry','Borja Muñoz','Julio Pajares'],['Borja Rosales','Rustam Abduraufov','Alfredo Perez Playa','Alberto Álvarez','Jose Manuel Maese'],['Jaime Crespi','Ildefonso Delgado','Viktor Kachalin','Álvaro Jaime','Ángel Poyato'],['Jesús Bermúdez','David González','Istvan Simon','Nicolás Feller','Enrique Urdiales'],['Juan Ignacio Insausti','Rafael Alves','Miguel Ángel Mérida','David Ruiz','Alejandro Gil'],['Emanuele Procopio','Andrés Slako','Anita Rachwalska','Maria Fernanda Quinto','Raúl Rubio'],['Carolina Graciano','Lucca Maciel','José Alejandro López','Tim Dobbin','Pedro Gómez'],['Paola Mateo','Maurizio Rainieri','Borja Martín','Julio Corzo','Manuel Soriano']];
let cycles=[{n:1,status:'active',groups:C1.map(p=>({players:[...p]}))},{n:2,status:'locked',groups:null},{n:3,status:'locked',groups:null}];
let playoff={started:false,numTramos:4,tramos:[],results:{},viewT:0,qualified:[],forcedSize:0};
let matches=[],matchId=1,activeN=1,viewCycle=1,subView='grupos',currentModal=null,formClub='',poContext=null,selGroup=1,adminMode='',_formCycleN=null;
let LOG=[]; // historial de acciones sobre resultados (max 500 entradas)
let LEAGUE_NAME='Liga de Tenis Sohail'; // nombre editable de la liga
// Nombre que se muestra en la pantalla de LOGIN (antes de elegir liga).
// Separado de LEAGUE_NAME: el nombre del login es el mismo para todas las
// ligas del club (ej. "Club Sohail Fuengirola"), mientras que LEAGUE_NAME
// es el nombre de ESTA liga puntual (ej. "Liga de Tenis Verano 2026") y
// varía de liga en liga. Vacío = usa LEAGUE_NAME como antes (compatibilidad
// con ligas creadas antes de este campo).
let LOGIN_TITLE='';
// Configuración del header de la pantalla de LOGIN (arriba del recuadro azul):
//   color: fondo de la barra
//   textColor: color del texto y borde de los pills (vacío = auto según contraste)
//   links: array de {text, url} — se renderean como pills clickeables abriendo
//          en nueva pestaña. Sin límite duro, pero UX degrada arriba de ~5.
// Solo aparece en el login. Una vez logueado, no se muestra (no distrae).
// Se cachea en localStorage ('lh') para que aparezca en el primer paint del
// login SIN esperar a que el admin se loguee — cualquier usuario que abre la
// app ve la barra con lo último que el admin configuró.
let LOGIN_HEADER = { color: '#0E3470', textColor: '', links: [] };
let REGLAMENTO=''; // reglamento de la liga (texto), editable por admin, visible para todos
// Solicitudes de acceso QUE RECIBE esta liga desde jugadores logueados en OTRAS
// ligas. Cada entrada: {id, nombre, email, tel, origenLigaId, origenLigaNombre,
// fecha, status:'pending'|'accepted'|'rejected'}. Se escriben desde el backend
// (accion 'solicitarAcceso' en api/liga.js, porque el jugador solicitante NO
// está autenticado en ESTA liga). Se leen/gestionan (aceptar/rechazar) igual
// que cualquier otro dato del state: viajan con el hydrate/persist normal.
let JOIN_REQUESTS = [];
let LEAGUE_SUBTITLE='Verano 2026'; // subtítulo editable
let LEAGUE_COLOR_PRI='#1B4F9C';   // color primario (azul)
let LEAGUE_COLOR_ACC='#F5C518';   // color acento (amarillo)
let LEAGUE_COLOR_HL='#FFEDD5';    // color de resaltado (fondo de botones No jugado / W.O.)
let ALLNAMES=C1.flat();

// ===== CLUBES (dinámicos) =========================================================
// Cada club es {id, name, bg}. El color del TEXTO no se guarda: se calcula como una
// version oscura del fondo (autoTxt), asi el contraste queda garantizado pase lo que
// pase con el color elegido. Es lo que se ve en la tabla de resultados.
// El id es estable y NO cambia al renombrar; los partidos guardan el NOMBRE en
// m.club y clubByName resuelve por nombre.
let CLUBS = [
  { id:'sohail', name:'Sohail', bg:'#D6ECFB' },
  { id:'haza',   name:'Haza',   bg:'#FCE6CF' }
];
let COLOR_DISPUTA = '#FDE68A';
let _clubNamesAtOpen = {};  // snapshot id→nombre para migrar partidos al renombrar

// ===== RATING / NIVEL (opcional, el admin lo habilita) ============================
// Motor verificado contra la tabla oficial de la Liga Tenis Málaga (4 decimales,
// 29 jugadores G1–G24). Solo usa, por jugador y ciclo: grupo, victorias, derrotas.
// Está OFF por defecto: la pestaña Rating no aparece hasta que un admin lo active.
let RATING_ON = false;
let RATING_SEEDS = {};        // {jugador: valor} punto de partida que da el admin
let RATING_OVERRIDES = {};    // {jugador: valor} rating fijo puesto a mano por el admin

const _FACTOR_MUESTRA = { 1: 0.5, 2: 0.75, 3: 0.92 };  // 4+ => 1.0
const _factorMuestra = (n) => _FACTOR_MUESTRA[n] ?? 1.0;
const _valorBase = (g) => 9.6 - 0.35 * (g - 1);
const _eficienciaCiclo = (v, d) => (3 * v + d) / (3 * (v + d));
const _ajusteCiclo = (v, d) => 0.8 * (v / (v + d) - 0.5) * _factorMuestra(v + d);
const _notaCiclo = (g, v, d) => _valorBase(g) + _ajusteCiclo(v, d);

// Recibe [{grupo, v, d}] con SOLO los ciclos jugados (v+d >= 1). Devuelve el rating
// y todas las columnas intermedias. Idéntico a la implementación de referencia.


// Deriva, para un jugador, la lista [{grupo, v, d}] de los ciclos que jugó, usando
// computeStats (que ya cuenta victorias 'g' y derrotas 'p' por ciclo/grupo).


// Tabla de rating de todos los jugadores con al menos 1 partido, ordenada desc.

// Rating global de un jugador (para la columna de la tabla de grupos).
// Devuelve el número redondeado a 1 decimal, o '' si todavía no tiene partidos.





function autoTxt(hex){
  const h = String(hex||'').replace('#','');
  if(h.length!==6) return '#222222';
  // 0.30 = conserva 30% del color, 70% a negro. Da contraste ~7.8 (nivel AAA)
  // sobre fondos claros como los de los clubes, y mantiene el matiz del color.
  const f = 0.30;
  const r = Math.round(parseInt(h.slice(0,2),16)*f);
  const g = Math.round(parseInt(h.slice(2,4),16)*f);
  const b = Math.round(parseInt(h.slice(4,6),16)*f);
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function clubByName(name){ return CLUBS.find(c => c.name === name) || null; }
function clubStyle(name){
  const c = clubByName(name);
  if(!c) return '';
  return 'background:'+c.bg+';color:'+autoTxt(c.bg);
}

// Auxiliares de fechas
function parseDateRange(str) {
  const parts = (str||'').split('–').map(s=>s.trim());
  const parse = (s) => {
     if(!s) return '';
     if(s.includes('-')) return s;
     const p = s.split('/');
     if(p.length===3) return `${p[2].length===2?'20'+p[2]:p[2]}-${p[1]}-${p[0]}`;
     return '';
  }
  return [parse(parts[0]), parse(parts[1])];
}
// Mostrar fecha: ISO (o dd/mm/yy) -> DD/MM/YYYY
function fmtDate(d){
  if(!d)return '';
  d=String(d).trim();
  if(!d)return '';
  if(/^\d{4}-\d{1,2}-\d{1,2}/.test(d)){const p=d.slice(0,10).split('-');return p[2].padStart(2,'0')+'/'+p[1].padStart(2,'0')+'/'+p[0];}
  if(d.indexOf('/')>=0){const p=d.split('/');if(p.length===3){const y=p[2].length===2?'20'+p[2]:p[2];return p[0].padStart(2,'0')+'/'+p[1].padStart(2,'0')+'/'+y;}}
  return d;
}
// Rango de fechas de ciclo -> "DD/MM/YYYY – DD/MM/YYYY"
function fmtRange(str){
  if(!str)return '';
  const r=parseDateRange(str);
  const a=fmtDate(r[0]),b=fmtDate(r[1]);
  if(a&&b)return a+' – '+b;
  return a||b||'';
}
// Cualquier formato -> ISO (YYYY-MM-DD) para guardar
function toISODate(d){
  if(!d)return '';
  d=String(d).trim().replace(/[.]/g,'/').replace(/-/g,'/');
  if(!d)return '';
  const p=d.split('/');
  if(p.length!==3)return '';
  if(p[0].length===4)return p[0]+'-'+p[1].padStart(2,'0')+'-'+p[2].padStart(2,'0');
  let y=p[2];if(y.length===2)y='20'+y;
  return y.padStart(4,'0')+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');
}
function formatDispDate(d) {
  if(!d) return '';
  const p = d.split('-');
  if(p.length===3) return `${p[2]}/${p[1]}/${p[0].slice(-2)}`;
  return d;
}
function updateCycleDate(i, type, val) {
  const parts = parseDateRange(FECHAS[i] || '');
  if(type === 'start') parts[0] = val;
  else parts[1] = val;
  const d1 = formatDispDate(parts[0]);
  const d2 = formatDispDate(parts[1]);
  if(!d1 && !d2) FECHAS[i] = '';
  else if(d1 && d2) FECHAS[i] = `${d1} – ${d2}`;
  else FECHAS[i] = d1 || d2;
  updateHdr(); renderCycleBar(); persist(true);
}

function ensureDestino(gid,len){if(!DESTINO)DESTINO={};if(!DESTINO[gid]||!Array.isArray(DESTINO[gid]))DESTINO[gid]=[];const maxG=(cycles[0]&&cycles[0].groups)?cycles[0].groups.length:12;while(DESTINO[gid].length<len)DESTINO[gid].push('G'+Math.min(gid+1,maxG));return DESTINO[gid];}
function addPlayerToCycle(name,gid){if(!name||!cycles[activeN-1].groups||!cycles[activeN-1].groups[gid-1])return false;if(ALLNAMES.indexOf(name)<0)ALLNAMES.push(name);if(!USERS[name])USERS[name]={role:'player',pass:DEFAULT_PASS_HASH,name};cycles[activeN-1].groups[gid-1].players.push(name);ensureDestino(gid,cycles[activeN-1].groups[gid-1].players.length);return true;}
// Reparación: agrega un jugador a la lista de un grupo de UN CICLO ESPECÍFICO
// (a diferencia de addPlayerToCycle, que solo trabaja sobre el ciclo activo).
// Sirve para casos donde un jugador quedó fuera de la lista de un ciclo YA
// CERRADO (por ejemplo, al reducir "jugadores por grupo" con setPlayersPerGroup,
// que avisa pero permite sacar igual a alguien con partidos ya cargados). Los
// partidos en `matches` nunca se borran, pero si el nombre no está en
// cycles[n].groups[gid].players, desaparece de la tabla de Clasificación de
// ese ciclo y el historial no puede resolver en qué grupo jugó.
// Devuelve {ok:true} o {ok:false, motivo:'...'} para que la UI muestre el error.
function repairPlayerInCycleGroup(cycN, gid, name){
  name = (name||'').trim();
  if(!name) return {ok:false, motivo:'Nombre vacío.'};
  const c = cycles[cycN-1];
  if(!c || !Array.isArray(c.groups)) return {ok:false, motivo:'Ese ciclo no existe o no tiene grupos.'};
  const g = c.groups[gid-1];
  if(!g) return {ok:false, motivo:'Ese grupo no existe en ese ciclo.'};
  if(!Array.isArray(g.players)) g.players=[];
  if(g.players.indexOf(name)>=0) return {ok:false, motivo:'Ya está en ese grupo.'};
  // Evitar que quede en DOS grupos del mismo ciclo a la vez (inconsistencia).
  const otro = c.groups.findIndex((gg,i)=>i!==(gid-1)&&gg&&Array.isArray(gg.players)&&gg.players.indexOf(name)>=0);
  if(otro>=0) return {ok:false, motivo:'Ya está anotado en '+groupName(otro+1)+' de este mismo ciclo.'};
  if(ALLNAMES.indexOf(name)<0) ALLNAMES.push(name);
  if(!USERS[name]) USERS[name]={role:'player',pass:DEFAULT_PASS_HASH,name};
  g.players.push(name);
  ensureDestino(gid, g.players.length);
  return {ok:true};
}
function buildUsers(){const u={admin:{role:'admin',pass:ADMIN_PASS_HASH,name:'Organización',email:'',tel:''},superadmin:{role:'superadmin',pass:ADMIN_PASS_HASH,name:'Super Administrador',email:'',tel:''}};ALLNAMES.forEach(n=>u[n]={role:'player',pass:DEFAULT_PASS_HASH,name:n,email:'',tel:''});return u;}
const USERS=buildUsers();let currentUser=null;
function groupName(g){return (typeof t==='function'?t('group'):'Grupo')+' '+g;}
function validSet(a,b){if(a==null||b==null||isNaN(a)||isNaN(b))return false;const hi=Math.max(a,b),lo=Math.min(a,b);if(hi===6&&lo<=4)return true;if(hi===7&&(lo===5||lo===6))return true;return false;}
function validSTB(a,b){return (a===1&&b===0)||(a===0&&b===1);}
function validMatch(s){if(s.length<2)return{ok:false,msg:t('valid_need2sets')};if(!validSet(s[0][0],s[0][1]))return{ok:false,msg:t('valid_set1')};if(!validSet(s[1][0],s[1][1]))return{ok:false,msg:t('valid_set2')};let w1=0,w2=0;[s[0],s[1]].forEach(([a,b])=>{if(a>b)w1++;else w2++;});if(w1===w2){if(s.length!==3)return{ok:false,msg:t('valid_need_stb')};if(!validSTB(s[2][0],s[2][1]))return{ok:false,msg:t('valid_stb_only')};}else if(s.length===3)return{ok:false,msg:t('valid_no_stb')};return{ok:true};}
function findLoc(name,cycN){const c=cycles[cycN-1];if(!c||!c.groups)return null;for(let gi=0;gi<c.groups.length;gi++){if(c.groups[gi]&&c.groups[gi].players&&c.groups[gi].players.indexOf(name)>=0)return{g:gi+1};}return null;}
function getActive(){return cycles[activeN-1];}
function getInitials(n){if(!n)return'?';return n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();}
// Fuente ÚNICA de verdad para "cuántos puntos vale una posición de un grupo".
// Lee directamente de PUNTOS[gid][pos], que es donde escriben:
//   - editPuntosUI + savePuntos (edición manual, botón "Editar" en Grupos)
//   - recalcularPuntajesGrupos (botón "Recalcular ahora" en panel admin)
//   - autoGenerarEscala (botón "Generar escala automática")
//   - estadoInicial en el backend (ligas nuevas)
// Antes esta función tenía su PROPIA fórmula (contaba jugadores en grupos
// inferiores) que ignoraba por completo lo guardado en PUNTOS. Resultado:
// editar o recalcular puntos no se reflejaba en ningún lado de la UI, porque
// la tabla de Grupos, la Clasificación General y el perfil del jugador
// llamaban a esta función en vez de leer PUNTOS directamente. Unificado acá.
function ptsForPos(gid, pos) {
  try {
    if (typeof PUNTOS !== 'undefined' && PUNTOS && PUNTOS[gid] && PUNTOS[gid][pos] !== undefined) {
      return PUNTOS[gid][pos];
    }
    // Fallback defensivo si el grupo no tiene escala definida todavía
    // (por ejemplo, más posiciones de las que se generaron en la escala):
    // repetimos el último valor conocido del grupo, o usamos 1 como piso.
    if (typeof PUNTOS !== 'undefined' && PUNTOS && PUNTOS[gid] && PUNTOS[gid].length) {
      const arr = PUNTOS[gid];
      return arr[arr.length - 1] || 1;
    }
    return Math.max(1, 5 - pos);
  } catch(e) {
    console.error("Error en ptsForPos:", e);
    return Math.max(1, 5 - pos); // Nunca rompe la tabla
  }
}
function computeStats(cycN,gid){
  const c=cycles[cycN-1];if(!c||!c.groups||!c.groups[gid-1])return[];
  const g=c.groups[gid-1];const players=(g.players||[]).filter(Boolean);
  const st=players.map((name)=>({name,pts:0,g:0,p:0,nj:0,sg:0,sp:0,gw:0,gl:0}));
  const byName={};st.forEach(s=>byName[s.name]=s);
  const confirmed=matches.filter(m=>!m.po&&m.cycle===cycN&&m.g===gid&&m.status==='confirmed');
  confirmed.forEach(m=>{
    const a=byName[m.aName],b=byName[m.bName];if(!a||!b)return;
    if(m.np){a.nj++;b.nj++;return;}
    // Defensa contra sets malformados (import de Excel corrupto, edición manual del
    // backup, etc.): si sets no es un array de pares numéricos, el partido se
    // ignora en el cálculo en vez de romper toda la tabla del grupo.
    if(!Array.isArray(m.sets)||!m.sets.every(s=>Array.isArray(s)&&s.length>=2&&isFinite(s[0])&&isFinite(s[1])))return;
    let w1=0,w2=0,a_gw=0,a_gl=0;
    m.sets.forEach(([x,y])=>{if(x>y)w1++;else w2++;a_gw+=x;a_gl+=y;});
    a.sg+=w1;a.sp+=w2;b.sg+=w2;b.sp+=w1;
    a.gw+=a_gw;a.gl+=a_gl;b.gw+=a_gl;b.gl+=a_gw;
    if(w1>w2){a.g++;b.p++;a.pts+=3;b.pts+=1;}
    else{b.g++;a.p++;b.pts+=3;a.pts+=1;}
  });
  function h2hStats(group){
    const names=new Set(group.map(s=>s.name));
    const h={};group.forEach(s=>h[s.name]={pts:0,sg:0,sp:0,gw:0,gl:0});
    confirmed.forEach(m=>{
      if(!names.has(m.aName)||!names.has(m.bName))return;
      if(m.np)return;
      if(!Array.isArray(m.sets)||!m.sets.every(st2=>Array.isArray(st2)&&st2.length>=2&&isFinite(st2[0])&&isFinite(st2[1])))return;
      let w1=0,w2=0,a_gw=0,a_gl=0;
      m.sets.forEach(([x,y])=>{if(x>y)w1++;else w2++;a_gw+=x;a_gl+=y;});
      h[m.aName].sg+=w1;h[m.aName].sp+=w2;h[m.bName].sg+=w2;h[m.bName].sp+=w1;
      h[m.aName].gw+=a_gw;h[m.aName].gl+=a_gl;h[m.bName].gw+=a_gl;h[m.bName].gl+=a_gw;
      if(w1>w2){h[m.aName].pts+=3;h[m.bName].pts+=1;}
      else{h[m.bName].pts+=3;h[m.aName].pts+=1;}
    });
    return h;
  }
  function tiebreakSort(group){
    if(group.length<=1)return group;
    group.sort((x,y)=>{
      if(y.pts!==x.pts)return y.pts-x.pts;
      const mpX=x.g+x.p, mpY=y.g+y.p;
      if(mpY!==mpX)return mpY-mpX;
      return 0;
    });
    const result=[];let i=0;
    while(i<group.length){
      let j=i+1;
      while(j<group.length&&group[j].pts===(group[i].pts)&&(group[j].g+group[j].p)===(group[i].g+group[i].p)){j++;}
      const tied=group.slice(i,j);
      if(tied.length===1){result.push(tied[0]);i=j;continue;}
      result.push(...breakTies(tied));
      i=j;
    }
    return result;
  }
  function breakTies(tied){
    if(tied.length===1)return tied;
    const h=h2hStats(tied);
    tied.sort((x,y)=>{
      const hDiff=(h[y.name].pts)-(h[x.name].pts);if(hDiff!==0)return hDiff;
      const sbDiff=(y.sg-y.sp)-(x.sg-x.sp);if(sbDiff!==0)return sbDiff;
      const hsbDiff=(h[y.name].sg-h[y.name].sp)-(h[x.name].sg-h[x.name].sp);if(hsbDiff!==0)return hsbDiff;
      return (y.gw-y.gl)-(x.gw-x.gl);
    });
    const result=[];let i=0;
    while(i<tied.length){
      let j=i+1;
      while(j<tied.length){
        const x=tied[i],y=tied[j];
        const sameH2H=h[x.name].pts===h[y.name].pts;
        const sameSB=(x.sg-x.sp)===(y.sg-y.sp);
        const sameHSB=(h[x.name].sg-h[x.name].sp)===(h[y.name].sg-h[y.name].sp);
        const sameGB=(x.gw-x.gl)===(y.gw-y.gl);
        if(sameH2H&&sameSB&&sameHSB&&sameGB)j++;else break;
      }
      const sub=tied.slice(i,j);
      if(sub.length===tied.length||sub.length===1){result.push(...sub);i=j;}
      else{
        const h2=h2hStats(sub);
        sub.sort((x,y)=>{
          const hDiff=h2[y.name].pts-h2[x.name].pts;if(hDiff!==0)return hDiff;
          const sbDiff=(h2[y.name].sg-h2[y.name].sp)-(h2[x.name].sg-h2[x.name].sp);if(sbDiff!==0)return sbDiff;
          return(y.gw-y.gl)-(x.gw-x.gl);
        });
        result.push(...sub);i=j;
      }
    }
    return result;
  }
  return tiebreakSort(st);
}
function findMatch(cycN,gid,n1,n2){return matches.find(m=>!m.po&&m.cycle===cycN&&m.g===gid&&((m.aName===n1&&m.bName===n2)||(m.aName===n2&&m.bName===n1)));}
function pairsNeeded(c){
  if(!c||!c.groups)return 0;
  let t=0;
  c.groups.forEach(g=>{
    const pl=(g.players||[]).filter(n=>!(USERS[n]&&USERS[n].inactive));
    t+=pl.length*(pl.length-1)/2;
  });
  return t;
}
function computeGeneral(){
  // Puntos por ciclo de cada jugador, además del total. Los inactivos se calculan
  // igual (con los puntos que sumaron) pero se marcan para ubicarlos al final.
  const tot={};        // nombre -> total acumulado
  const porCiclo={};   // nombre -> { ciclo1: pts, ciclo2: pts, ... }
  cycles.forEach(c=>{
    if(!c.groups)return;
    c.groups.forEach((g,gi)=>{
      const st=computeStats(c.n,gi+1);
      st.forEach((s,pos)=>{
        const v=ptsForPos(gi+1,pos)+(pos===0?2:0);
        tot[s.name]=(tot[s.name]||0)+v;
        if(!porCiclo[s.name])porCiclo[s.name]={};
        porCiclo[s.name][c.n]=(porCiclo[s.name][c.n]||0)+v;
      });
    });
  });
  // El último ciclo relevante para el desempate es el de mayor número que tenga datos.
  const ciclosConDatos = cycles.map(c=>c.n).filter(n=>Object.values(porCiclo).some(pc=>pc[n]!==undefined));
  const ultimoCiclo = ciclosConDatos.length ? Math.max(...ciclosConDatos) : (cycles.length?cycles[cycles.length-1].n:1);
  const filas=Object.keys(tot).map(name=>{
    const loc=findLoc(name,activeN);
    return {
      name,
      total:tot[name],
      porCiclo:porCiclo[name]||{},
      inactive: !!(USERS[name] && USERS[name].inactive),
      poDraw: poDrawDeJugador(name),   // cuadro de playoff (o null)
      ptsUltimoCiclo: (porCiclo[name] && porCiclo[name][ultimoCiclo]) || 0,  // desempate 2
      grupoActual: loc ? loc.g : 999   // desempate 3 (grupo más alto = número menor)
    };
  });
  // Desempate para la clasificación general, en orden:
  //   1) Total (mayor primero)
  //   2) Puntaje del último ciclo (mayor primero)
  //   3) Grupo más alto (número de grupo menor)
  const cmp=(a,b)=>{
    if(b.total!==a.total) return b.total-a.total;
    if(b.ptsUltimoCiclo!==a.ptsUltimoCiclo) return b.ptsUltimoCiclo-a.ptsUltimoCiclo;
    return a.grupoActual-b.grupoActual;
  };
  const activos=filas.filter(f=>!f.inactive).sort(cmp);
  const inactivos=filas.filter(f=>f.inactive).sort(cmp);
  return activos.concat(inactivos);
}
// Devuelve la etiqueta del cuadro de playoff donde está un jugador ('A','B',…) o null
// si no está en ningún cuadro (o los playoffs no están activos).
function poDrawDeJugador(name){
  if(!playoff || (!playoff.started && !playoff.preview)) return null;
  if(!Array.isArray(playoff.tramos)) return null;
  for(const tr of playoff.tramos){
    if(tr && Array.isArray(tr.seeds) && tr.seeds.includes(name)) return tr.label || '?';
  }
  return null;
}
function demoFill(){const c=getActive();if(!c||!c.groups)return;const opts=[[[6,3],[6,4]],[[6,2],[4,6],[1,0]],[[7,5],[6,4]],[[6,4],[7,6]]];c.groups.forEach((g,gi)=>{const gid=gi+1;const pl=(g.players||[]).filter(n=>!(USERS[n]&&USERS[n].inactive));for(let i=0;i<pl.length;i++)for(let j=i+1;j<pl.length;j++){if(findMatch(activeN,gid,pl[i],pl[j]))continue;const w=Math.random()<0.5;const club=Math.random()<0.6?'Sohail':'Haza';const base=opts[Math.floor(Math.random()*opts.length)];matches.push({id:matchId++,cycle:activeN,g:gid,aName:pl[i],bName:pl[j],sets:w?base:base.map(([a,b])=>[b,a]),date:'2026-07-01',status:'confirmed',reporter:pl[i],club,locked:true,isDemo:true});}});}

function allCyclesDone(){return cycles.every(c=>c.groups&&c.status==='finished');}

// SOLO dibuja. Antes guardaba acá adentro, y eso significaba que cada repintado
// disparaba un POST de 125 KB: al entrar, la tabla esperaba a ese guardado que no
// tenía nada que guardar. 13 de las 15 llamadas ya hacían persist() justo antes,
// así que además se guardaba dos veces. Ahora quien cambia datos, guarda; quien
// dibuja, dibuja.
function refreshAll(){
  if(viewCycle==='po'){showPlayoffView();renderPend();renderCycleBar();return;}
  if(subView==='grupos')renderGrupos();
  if(subView==='general')renderGeneral();
  if(subView==='pendientes')renderPend();
  if(subView==='admin')renderAdmin();
  if(subView==='cargar')renderCargarDisputas();
  renderPend();renderCycleBar();updateBadge();
}

function splitTramos(qual,T){const n=qual.length;const base=Math.floor(n/T);const extra=n%T;const out=[];let idx=0;for(let t=0;t<T;t++){// extra players go to LAST brackets (D,C,B...) not first
const size=base+(t>=(T-extra)?1:0);out.push(qual.slice(idx,idx+size));idx+=size;}return out;}
function seedOrder(n){if(n===1)return[0];const prev=seedOrder(n/2);const res=[];prev.forEach(p=>{res.push(p);res.push(n-1-p);});return res;}
function buildRounds(seeds){
  let size=1;
  if(playoff.forcedSize && playoff.forcedSize>=2) {
    size = playoff.forcedSize;
  } else {
    while(size<seeds.length) size*=2;
    if(size<2) size=2;
  }
  let actualSeeds = seeds;
  if(actualSeeds.length > size) actualSeeds = actualSeeds.slice(0, size);
  
  const order=seedOrder(size);
  const slots=new Array(size).fill(null);
  order.forEach((pos,k)=>{slots[k]=actualSeeds[pos]!==undefined?actualSeeds[pos]:null;});
  const rounds=[];let cur=[];
  for(let k=0;k<size;k+=2)cur.push({a:slots[k],b:slots[k+1],w:null,sets:null,locked:false,sid:[slots[k]?actualSeeds.indexOf(slots[k])+1:'',slots[k+1]?actualSeeds.indexOf(slots[k+1])+1:'']});
  rounds.push(cur);
  let cnt=cur.length;
  while(cnt>1){cnt/=2;rounds.push(Array.from({length:cnt},()=>({a:null,b:null,w:null,sets:null,locked:false,sid:['','']})));}
  rounds[0].forEach(m=>{if(m.a&&!m.b)m.w=m.a;if(m.b&&!m.a)m.w=m.b;});
  return rounds;
}
function propagate(r){for(let ri=0;ri<r.length-1;ri++){const nx=r[ri+1];r[ri].forEach((m,mi)=>{const sl=nx[Math.floor(mi/2)];
  // Defensa: si por algún motivo el slot destino no tiene sid inicializado, lo inicializamos.
  // Pasa con brackets viejos guardados antes del fix.
  if(!sl.sid) sl.sid=['',''];
  if(!m.sid) m.sid=['',''];
  // Propagar también el número de seed del ganador para que lo acompañe por todo el bracket.
  // Antes se propagaba solo el nombre (m.w) y el sid quedaba vacío ('') en rondas siguientes.
  const winSid = m.w ? (m.w===m.a?m.sid[0]:m.sid[1]) : '';
  if(mi%2===0){sl.a=m.w;sl.sid[0]=winSid;}else{sl.b=m.w;sl.sid[1]=winSid;}
});}}
function applyStored(key,r){for(let p=0;p<r.length+1;p++){r.forEach(rd=>rd.forEach(m=>{if(m.a&&m.b&&!m.w){const k=key+'#'+[m.a,m.b].sort().join('|');const st=playoff.results[k];if(st){m.sets=st.sets;m.w=st.w;m.wo=st.wo;m.locked=true;}}}));propagate(r);}}
function loserOf(m){return m.w&&m.a&&m.b?(m.w===m.a?m.b:m.a):null;}
function label(i){return String.fromCharCode(65+i);}
function rebuildTramo(t){
  const tr=playoff.tramos[t];if(!tr)return;
  tr.main=buildRounds(tr.seeds);applyStored(t,tr.main);
  const losers=tr.main[0].map(loserOf).filter(Boolean);
  tr.cons=losers.length>=2?buildRounds(losers):null;
  if(tr.cons){
    // Al armar la consolación, buildRounds() calculó sids en base al orden
    // del array `losers`. Los sobrescribimos con el seed ORIGINAL de cada
    // jugador dentro del tramo (tr.seeds), así el número acompaña al jugador
    // desde el cuadro principal a la consolación y por todas sus rondas.
    tr.cons[0].forEach(m=>{
      if(m.a) m.sid[0] = tr.seeds.indexOf(m.a)+1 || '';
      if(m.b) m.sid[1] = tr.seeds.indexOf(m.b)+1 || '';
    });
    applyStored(t+'c',tr.cons);
  }
}
function rebuildAll(){playoff.tramos.forEach((_,t)=>rebuildTramo(t));}
function buildTramosFromGeneral(T){const gen=computeGeneral().map(x=>x.name);const slices=splitTramos(gen,T);return{numTramos:T,results:{},viewT:0,qualified:gen,tramos:slices.map((s,i)=>({label:label(i),seeds:s.slice(),main:null,cons:null}))};}
function previewPlayoff(){if(!allCyclesDone())return false;const T=playoff.numTramos||4;playoff=Object.assign({started:false,preview:true,forcedSize:playoff.forcedSize||0},buildTramosFromGeneral(T));rebuildAll();return true;}
function confirmPlayoff(){if(!playoff.preview&&!playoff.started)return false;playoff.started=true;playoff.preview=false;return true;}
function startPlayoff(){if(!allCyclesDone())return false;const T=playoff.numTramos||4;playoff=Object.assign({started:true,preview:false,forcedSize:playoff.forcedSize||0},buildTramosFromGeneral(T));rebuildAll();return true;}
function setNumTramos(T){playoff.numTramos=T;if(playoff.started||playoff.preview){const gen=playoff.qualified;const slices=splitTramos(gen,T);playoff.results={};playoff.viewT=0;playoff.tramos=slices.map((s,i)=>({label:label(i),seeds:s.slice(),main:null,cons:null}));rebuildAll();}}
function removeSeed(t,name){const tr=playoff.tramos[t];tr.seeds=tr.seeds.filter(n=>n!==name);rebuildTramo(t);}
function addSeed(t,name){const tr=playoff.tramos[t];if(name&&!tr.seeds.includes(name)){tr.seeds.push(name);
const order=playoff.qualified||[];tr.seeds.sort((a,b)=>{const ia=order.indexOf(a),ib=order.indexOf(b);if(ia<0&&ib<0)return 0;if(ia<0)return 1;if(ib<0)return -1;return ia-ib;});}rebuildTramo(t);}
function tramoOf(name){for(let t=0;t<playoff.tramos.length;t++)if(playoff.tramos[t].seeds.includes(name))return t;return -1;}

function movePlayer(name,fromG,toG){if(fromG===toG)return;const c=cycles[activeN-1];if(!c||!c.groups)return;const a=(c.groups[fromG-1]||{}).players||[];const i=a.indexOf(name);if(i<0)return;a.splice(i,1);if(c.groups[toG-1]&&c.groups[toG-1].players)c.groups[toG-1].players.push(name);}
function removePlayerCycle(name,fromG){const c=cycles[activeN-1];if(!c||!c.groups)return;const a=(c.groups[fromG-1]||{}).players||[];const i=a.indexOf(name);if(i>=0)a.splice(i,1);}
function movePlayerUI(name,fromG,toG){if(!toG)return;movePlayer(name,fromG,parseInt(toG));renderAdmin();persist(true);toast(name+' movido a '+groupName(parseInt(toG))+'.');}

function updateBadge() {
  const pend = matches.filter(m => m.status === 'pending');
  const disp = matches.filter(m => m.status === 'disputed');
  // Para el badge del admin: partidos donde el rival (no-reporter) puede confirmar
  // Si el rival está inactivo, sigue contando para que el admin sepa que debe resolverlo
  const userPend = pend.filter(m => {
    if(m.po) return m.poNames && m.poNames.includes(currentUser.name);
    return m.aName === currentUser.name || m.bName === currentUser.name;
  });
  // Excluir del badge partidos donde AMBOS jugadores son inactivos (nadie puede resolverlos sin admin)
  const activePend = pend.filter(m=>{
    const a=m.po?(m.poNames&&m.poNames[0]):m.aName;
    const b=m.po?(m.poNames&&m.poNames[1]):m.bName;
    return !(USERS[a]&&USERS[a].inactive&&USERS[b]&&USERS[b].inactive);
  });
  const cnt = esAdmin(currentUser) ? (activePend.length + disp.length) : userPend.length;
  const pn = document.getElementById('pend-n');
  if (pn) {
    pn.textContent = cnt;
    if (cnt > 0) {
      pn.style.background = 'var(--danger)';
      pn.style.color = '#fff';
      pn.style.display = 'inline-block';
    } else {
      pn.style.display = 'none';
    }
  }
}

// Pinta el desplegable a partir de una estructura ya conocida. No toca la red:
// es puro DOM, tarda milisegundos. Mismo patrón que ya usan los colores ('lsc')
// y el nombre de la liga ('lsn'): dibujar de la caché primero, refrescar después.
//
// ============================================================================
// Selector de ligas en el header (dropdown junto al nombre de la liga).
// Muestra las ligas donde el usuario actual YA participa, para cambiar entre
// ellas sin pasar por el perfil. Se cachea por sesión (_hdrLigasCache): no se
// vuelve a pedir al servidor en cada cambio de pestaña, solo la primera vez
// que se llama después del login (updateHdr() la dispara).
// ============================================================================
let _hdrLigasCache = null;   // null = todavía no se pidió; [] = se pidió y no hay otras
let _hdrLigasCargando = false;

function pintarHdrLigaSwitch(){
  const btn = document.getElementById('hdr-liga-switch');
  const menu = document.getElementById('hdr-liga-switch-menu');
  if(!btn) return;
  const ligas = _hdrLigasCache || [];
  if(ligas.length < 2){
    // Nada para elegir: solo participa acá (o todavía no cargó). El botón
    // queda visible igual (ES el título de la liga) pero sin pinta de
    // clickeable ni flecha — se ve exactamente como el título de siempre.
    btn.classList.remove('multi');
    btn.onclick = null;
    if(menu) menu.style.display = 'none';
    return;
  }
  // 2+ ligas activas: el título se vuelve clickeable (fondo + flecha).
  // El TEXTO del título lo sigue controlando el flujo normal de arriba
  // (lsn.n / updateHdr) — acá solo togglear la apariencia de "es un botón".
  btn.classList.add('multi');
  btn.onclick = abrirSelectorLigaHdr;
  const arrows = btn.querySelector('.hdr-liga-switch-arrows');
  if(arrows) arrows.style.display = '';
}

// Abre/cierra el menú de botones (mismo lenguaje visual que el selector de
// liga del login: .liga-sel-btn). Se posiciona debajo del botón del header.
function abrirSelectorLigaHdr(){
  const menu = document.getElementById('hdr-liga-switch-menu');
  const btn = document.getElementById('hdr-liga-switch');
  if(!menu || !btn) return;
  const abierto = menu.style.display !== 'none';
  if(abierto){ menu.style.display='none'; return; }
  const ligas = _hdrLigasCache || [];
  menu.innerHTML = ligas.map(l =>
    '<button class="liga-sel-btn'+(l.esLigaActual?' on':'')+'" onclick="cambiarLigaDesdeMenu(\''+String(l.id).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\')">'
    + '<i class="ti ti-trophy"></i> '+attr(l.nombre)+(l.esLigaActual?' ('+(t('lsel_current_tag')||'acá')+')':'')+'</button>'
  ).join('');
  menu.style.display = '';
  // Cerrar si se toca afuera (una sola vez, se remueve solo).
  setTimeout(()=>{
    document.addEventListener('click', function cerrar(ev){
      if(!menu.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)){
        menu.style.display='none';
        document.removeEventListener('click', cerrar);
      }
    });
  }, 0);
}

// Dispara el fetch UNA vez por sesión (cache null = todavía no se pidió).
// Se llama desde updateHdr(), que ya se ejecuta en cada cambio de pestaña, así
// que no hace falta un hook nuevo en ningún otro lado.
function refreshHdrLigaSwitch(){
  if(!_token || !_ligaActual || !currentUser || !currentUser.key) return;
  if(_hdrLigasCache !== null){ pintarHdrLigaSwitch(); return; }
  if(_hdrLigasCargando) return;
  _hdrLigasCargando = true;
  fetch('/api/liga', {
    method:'POST',
    headers:{'Content-Type':'application/json', Authorization:'Bearer '+_token},
    body: JSON.stringify({ accion:'misLigas', ligaId:_ligaActual })
  }).then(r=>r.ok?r.json():null).then(d=>{
    _hdrLigasCargando = false;
    if(!d || !Array.isArray(d.ligas)) return;
    _hdrLigasCache = d.ligas.filter(l=>l.participo);
    pintarHdrLigaSwitch();
  }).catch(()=>{ _hdrLigasCargando = false; });
}

// El usuario eligió otra liga desde el menú del header: cambia de liga SIN
// pedir usuario/contraseña de nuevo. El token ya es válido (misma sesión);
// solo se pide el state de la liga elegida vía /api/state?elegir=1, que
// revalida del lado del servidor que el jugador realmente pertenece a esa
// liga antes de entregar nada (mismo endpoint que usa el paso 2 del login
// unificado cuando el jugador está en 2+ ligas activas al loguearse).
async function cambiarLigaDesdeMenu(ligaId){
  const menu = document.getElementById('hdr-liga-switch-menu');
  if(menu) menu.style.display = 'none';
  if(!ligaId || ligaId === _ligaActual) return;
  const liga = (_hdrLigasCache||[]).find(l=>l.id===ligaId);
  const nombre = liga ? liga.nombre : ligaId;
  if(!confirm(t('ml_switch_confirm').replace('{n}', nombre))) return;
  try{
    const r = await fetch('/api/state?liga='+encodeURIComponent(ligaId)+'&elegir=1', {
      headers:{ Authorization:'Bearer '+_token }, cache:'no-store'
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok){ toast((d && d.error) || t('err_hydrate')); return; }
    _ligaActual = ligaId;
    const ok = _hydrate(d.state);
    if(!ok){ toast(t('err_hydrate')); return; }
    _lastSaved = _serialize();
    _loadOK = true;
    const u = USERS[d.name];
    if(!u){ toast(t('err_no_user_league')); return; }
    currentUser = u; currentUser.key = d.name;
    // La lista de "mis ligas" corresponde a la liga vieja: se vuelve a pedir
    // para la nueva (el server la resuelve por sesión, no cambia el criterio).
    _hdrLigasCache = null;
    if(typeof montarAppTrasLogin === 'function') montarAppTrasLogin();
  }catch(err){
    toast(t('err_no_server'));
  }
}
