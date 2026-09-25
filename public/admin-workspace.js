/* Sohail v3.5 · Administración por tareas.
 * Presentación exclusivamente: mueve los nodos existentes, NO invoca guardados,
 * no cambia permisos ni sustituye los manejadores deportivos. La memoria de
 * navegación vive solo en esta página y está separada por cuenta/liga/ciclo.
 */
(function (global) {
 'use strict';
 const memory = new Map();
 const words = {
  es:{title:'Administrar liga',intro:'Elegí qué necesitás hacer. Cada categoría reúne las herramientas de esa tarea.',roleAdmin:'Administrador',roleSuper:'Superadministrador',context:'Liga seleccionada',cycle:'Ciclo activo',overview:'Todas las categorías',all:'Ver todas las herramientas',search:'Buscar una tarea',searchHint:'Por ejemplo: agregar jugador, ascensos, puntos o fechas',clear:'Limpiar búsqueda',results:'herramientas encontradas',empty:'No encontramos esa tarea. Probá con «jugadores», «grupos», «puntos» o volvé a las categorías.',note:'No hay un botón Guardar general: usá el control de cada bloque. Cambiar de categoría o buscar no aplica una acción.',back:'Volver a las categorías',tools:'herramientas',open:'Abrir',sensitive:'Revisá antes de continuar',danger:'Estas herramientas pueden borrar o reemplazar datos. Conservá una copia de seguridad y leé la confirmación de cada acción.',simulation:'Simular no es una prueba aislada: crea resultados ficticios en la liga actual. No lo uses para comprobar una liga en uso.',scaleNote:'Son dos opciones distintas: «Generar escala» usa el incremento que elegís; «Escala estándar» usa siempre 3. Ambas reemplazan puntos por posición. El ajuste individual se hace en otro bloque.',liveCycle:'Los ciclos cerrados no aceptan nuevas cargas. Para corregir un resultado guardado, abrí el marcador y elegí Editar como administrador.',review:'Revisar resultados',add:'Añadir jugadores',move:'Organizar grupos',dest:'Ascensos y descensos',account:'Mi cuenta',accountHint:'Acá cambiás tus preferencias y tu acceso. La competición y las cuentas de jugadores se administran por separado.',myInfo:'Datos de mi cuenta',myPassword:'Mi contraseña',myTheme:'Mi apariencia',myDevice:'Mis dispositivos de acceso',manage:'Ir a administrar la liga',playersTitle:'Gestionar jugadores',playersHint:'Buscá una persona para editar su ficha. Para sumar participantes, elegí «Añadir jugadores».',members:'Jugadores de esta liga',membersHint:'Datos, grupo, estado y contraseña de cada jugador. Las acciones disponibles siguen dependiendo de tus permisos.',addHint:'Alta individual o incorporación desde una lista u otra liga. Revisá la liga y el grupo de destino.',catalog:'Catálogo de la plataforma',catalogHint:'Perfiles compartidos entre ligas. No es la lista de participantes de este ciclo.',advanced:'Herramientas avanzadas',advancedHint:'Importación completa y vaciado. No son la carga normal de un jugador.',other:'Otros controles',otherHint:'Herramientas conservadas que aún no tienen una categoría específica.',foundIn:'Categoría',noTasks:'No hay herramientas disponibles para este rol.',reviewList:'Abrir revisión',openPlayers:'Abrir jugadores',rules:'Abrir reglamento',status:'Estado y cierre',profileLabel:'Mi perfil',categorySearch:'Resultados de búsqueda',sensitivePlayer:'Vaciar jugadores o importar un archivo completo puede reemplazar información. Usá Añadir jugadores para altas normales.'},
  en:{title:'League administration',intro:'Choose what you need to do. Each category groups tools for the same task.',roleAdmin:'Administrator',roleSuper:'Super administrator',context:'Selected league',cycle:'Active cycle',overview:'All categories',all:'Show all tools',search:'Find a task',searchHint:'For example: add player, destinations, points or dates',clear:'Clear search',results:'tools found',empty:'No matching task. Try players, groups, points, or return to the categories.',note:'There is no global Save button: use each section’s own control. Switching categories or searching does not apply an action.',back:'Back to categories',tools:'tools',open:'Open',sensitive:'Review before continuing',danger:'These tools can delete or replace data. Keep a backup and read each action’s confirmation.',simulation:'Simulation is not a sandbox: it creates fictional results in the current league. Do not use it to test a live league.',scaleNote:'These are different options: Generate scale uses your chosen increment; Standard scale always uses 3. Both replace position points. Individual adjustments have their own section.',liveCycle:'Closed cycles do not accept new results. To correct a saved result, open its score and choose Edit as an administrator.',review:'Review results',add:'Add players',move:'Organise groups',dest:'Promotion and relegation',account:'My account',accountHint:'Manage your preferences and sign-in here. League operations and player accounts have separate areas.',myInfo:'My account details',myPassword:'My password',myTheme:'My appearance',myDevice:'My sign-in devices',manage:'Open league administration',playersTitle:'Manage players',playersHint:'Find someone to edit their profile. Choose Add players to register participants.',members:'Players in this league',membersHint:'Each player’s details, group, status and password. Available actions still depend on your permissions.',addHint:'Add one player or import a list or participants from another league. Check the destination league and group.',catalog:'Platform player catalogue',catalogHint:'Shared profiles across leagues, not this cycle’s list of participants.',advanced:'Advanced tools',advancedHint:'Full import and clearing. Not the normal process for adding a player.',other:'Other controls',otherHint:'Preserved tools that do not yet have a specific category.',foundIn:'Category',noTasks:'No tools are available for this role.',reviewList:'Open review',openPlayers:'Open players',rules:'Open rules',status:'Cycle status',profileLabel:'My profile',categorySearch:'Search results',sensitivePlayer:'Clearing players or importing a complete file can replace information. Use Add players for regular registrations.'}
 };
 // Category order follows the administrator’s tasks, never CSS class or language.
 const categories = [
  ['league','Liga y ciclos','League and cycles','Fechas, estado, cierre, reglamento y gestión de ligas.','Dates, status, closing, rules and league management.','league'],
  ['groups','Grupos y ascensos','Groups and destinations','Organizar jugadores y decidir a dónde va cada puesto.','Arrange players and set the destination of each position.','groups'],
  ['players','Jugadores y accesos','Players and access','Altas, solicitudes, fichas y dispositivos de ingreso.','Registrations, requests, profiles and sign-in devices.','players'],
  ['points','Puntos y clasificación','Points and standings','Escalas, ajustes por jugador y visibilidad del rating.','Point scales, player adjustments and rating visibility.','points'],
  ['playoffs','Playoffs','Playoffs','Preparar los cuadros y revisar su vista previa.','Set up draws and review the preview.','playoffs'],
  ['appearance','Apariencia y avisos','Appearance and notifications','Colores, clubes, pantalla de entrada y WhatsApp.','Colours, clubs, sign-in page and WhatsApp.','appearance'],
  ['files','Archivos y copias','Files and backups','Exportar, importar y recuperar una copia de seguridad.','Export, import and restore a backup.','files'],
  ['danger','Acciones delicadas','Sensitive actions','Reinicios, borrados y herramientas de simulación.','Resets, deletion and simulation tools.','danger']
 ];
 const tasks={
  'cycle-status':['league','Estado y cierre de ciclos','Cycle status and closing','Revisá lo validado, lo pendiente y las opciones de cierre. Los resultados de ciclos cerrados se corrigen abriendo su marcador.','Review validated and pending results and closing options. Correct closed-cycle results by opening their saved scores.','cerrar finalizar terminar corregir resultados cerrados'],
  dates:['league','Fechas de los ciclos','Cycle dates','Inicio y fin de cada ciclo. No cambia por sí solo el estado de un ciclo.','Start and end dates for each cycle. Dates alone do not change a cycle’s status.','calendario plazo fecha'],
  leagues:['league','Crear y gestionar ligas','Create and manage leagues','Crear, renombrar, cerrar o reabrir. Comprobá el nombre antes de usar una acción sobre otra liga.','Create, rename, close or reopen. Check the league name before applying an action.','temporada liga nombre eliminar cerrar'],
  rules:['league','Reglamento','Rules','Consultar o editar las reglas con el editor existente.','View or edit the rules using the existing editor.','normas reglamento'],
  structure:['groups','Cantidad de ciclos, grupos y plazas','Number of cycles, groups and places','Configuración estructural del superadministrador. Reducir la estructura puede afectar jugadores o resultados: leé cada confirmación.','Super administrator structure settings. Reducing the structure may affect players or results: read each confirmation.','cantidad estructura cupos tamaño grupos jugadores ciclos'],
  groups:['groups','Distribuir jugadores entre grupos','Assign players to groups','Mover o quitar participantes del ciclo activo. No es lo mismo que eliminarlos del catálogo.','Move or remove participants in the active cycle. This does not mean deleting a profile from the catalogue.','mover grupo quitar asignar participantes'],
  destinations:['groups','Ascensos y descensos','Promotion and relegation','Ver los destinos por puesto, pedir la propuesta automática o ajustar cada destino manualmente.','View destinations by position, request an automatic proposal or edit them manually.','destinos actualizar automatico ascensos descensos permanencias'],
  players:['players','Fichas y altas de jugadores','Player profiles and registration','Acceso a la lista de esta liga y al alta de participantes, sin mezclarlo con tu cuenta personal.','Open this league’s players and registration, separately from your personal account.','añadir agregar alta importar persona jugadores contraseña clave permisos'],
  requests:['players','Solicitudes para entrar a esta liga','Requests to join this league','Revisar quién pide acceso. Aceptar o rechazar conserva las autorizaciones existentes.','Review join requests. Accepting or rejecting keeps the existing authorisation rules.','solicitudes acceso aceptar rechazar'],
  devices:['players','Dispositivos de los jugadores','Player sign-in devices','Consultar el ingreso con Face ID / Touch ID y gestionar los dispositivos autorizados. Tus propios dispositivos están en Mi cuenta.','View Face ID / Touch ID sign-in and manage authorised devices. Your own devices are in My account.','dispositivos face id touch id passkey acceso rápido'],
  'repair-player':['players','Recuperar a un jugador que falta en un ciclo','Restore a missing cycle participant','Herramienta de corrección: solo para un jugador que ya tiene partidos pero no aparece en el grupo. No es un alta nueva.','Correction tool: for a player with results who is missing from the group. This is not a new registration.','reparar falta recuperar ciclo cerrado jugador'],
  scale:['points','Generar escala con un incremento elegido','Generate a scale with a chosen increment','Elegí cuánto aumenta la puntuación entre grupos. Reemplaza la escala de todos los grupos; después podés ajustarla.','Choose the points increase between groups. Replaces the scale for all groups; it can be edited afterwards.','autogenerar escala paso incremento puntos'],
  'standard-scale':['points','Restablecer la escala estándar (incremento 3)','Restore the standard scale (increment 3)','Usa siempre el incremento 3 y adapta la cantidad de puestos por grupo. No conserva una escala personalizada.','Always uses increment 3 and adapts the number of positions per group. Does not preserve a custom scale.','recalcular puntos estándar paso 3'],
  'player-points':['points','Ajustar puntos de un jugador','Adjust a player’s points','Sumar o restar puntos en un ciclo. Es distinto de cambiar la escala que recibe cada puesto.','Add or deduct points in a cycle. This is different from changing position-based points.','bonus penalidad sancion ajustar puntos jugador'],
  rating:['points','Mostrar u ocultar Rating / Nivel','Show or hide Rating / Level','Controla la pestaña que ven los usuarios. No cambia la fórmula de cálculo.','Controls the tab users can see. Does not change the calculation.','rating nivel clasificación'],
  playoffs:['playoffs','Preparar y previsualizar los cuadros','Set up and preview the draws','Cantidad y tamaño de cuadros. La preparación sigue condicionada al cierre de los ciclos.','Number and size of draws. Setup still depends on cycles being completed.','playoff cuadro tamaño consolación rondas'],
  appearance:['appearance','Identidad de la liga y clubes','League identity and clubs','Nombre de entrada, colores y clubes comparten los controles de guardado de este bloque. El nombre oficial se cambia en Crear y gestionar ligas.','Sign-in title, colours and clubs share this section’s save controls. Change the official name in Create and manage leagues.','apariencia colores club clubes nombre login'],
  whatsapp:['appearance','Avisos por WhatsApp','WhatsApp notifications','Canales de notificación de la organización. Solo aparecen para las cuentas autorizadas.','Organisation notification channels. Only shown for authorised accounts.','avisos notificaciones whatsapp canales'],
  'login-header':['appearance','Barra y enlaces de la pantalla de entrada','Sign-in page links and banner','Configuración de la entrada a la plataforma, separada del nombre oficial de una liga.','Platform sign-in page settings, separate from a league’s official name.','cabecera header login entrada links enlaces'],
  exchange:['files','Resultados: exportar o importar','Results: export or import','PDF y Excel para compartir, e importación de resultados de grupos. Importar puede reemplazar partidos y dejarlos validados.','Share PDFs and spreadsheets, or import group results. Imports can replace matches and mark them as validated.','pdf imprimir excel plantilla resultados importar exportar'],
  backup:['files','Copia de seguridad y restauración','Backup and restoration','Descargar una copia no cambia la liga. Restaurar reemplaza su estado por el archivo: revisá la advertencia antes de continuar.','Downloading a backup does not change the league. Restoring replaces its state from the file: review the warning first.','backup respaldo copia restaurar recuperar'],
  export:['files','Exportar el informe de la liga','Export the league report','Salida adicional de la liga en Excel. Se conserva separada de la copia de seguridad.','Additional league export to Excel. Kept separate from the backup.','informe descargar excel exportar'],
  reset:['danger','Borrar resultados o retroceder un ciclo','Delete results or go back a cycle','Cada opción tiene un alcance distinto. Leé qué se conserva y qué se borra antes de confirmar.','Each option has a different scope. Read what is kept and what is deleted before confirming.','reiniciar borrar retroceder resultados playoffs ciclo'],
  'new-season':['danger','Reiniciar la liga para otra temporada','Reset the league for another season','No es crear una liga independiente: reinicia la actual y borra partidos. Solo superadministrador.','This does not create a separate league: it resets the current one and deletes results. Super administrator only.','reiniciar liga temporada borrar'],
  simulation:['danger','Simulación sobre la liga actual','Simulation on the current league','Generar y quitar partidos de demostración. No es un entorno de prueba.','Generate and remove demonstration results. This is not a test environment.','simular demo prueba ficticios'],
  other:['other','Otros controles','Other controls','Controles preservados sin clasificación.','Preserved controls without a category.','otros']
 };
 const lang=()=>typeof LANG==='string'&&LANG==='en'?'en':'es';
 const text=k=>words[lang()][k]||words.es[k]||k;
 const translate=(entry,start=1)=>entry[start+(lang()==='en'?1:0)];
 const allowed=()=>typeof esAdmin==='function'&&esAdmin(currentUser)&&!_ligaReadOnly;
 const el=(tag,cls,copy)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(copy!==undefined)n.textContent=copy;return n;};
 const button=(label,cls='btn')=>{const b=el('button',cls,label);b.type='button';return b;};
 function icon(kind){const n=el('span','aw-icon');n.setAttribute('aria-hidden','true');const paths={league:'M8 3h8v5c0 5-8 5-8 0z M8 5H4v3q0 4 5 4 M16 5h4v3q0 4-5 4 M12 12v6 M7 21h10',groups:'M3 4h7v6H3z M14 4h7v6h-7z M3 14h7v6H3z M14 14h7v6h-7z',players:'M15 7a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M5 21v-3a7 7 0 0 1 14 0v3',points:'M4 20V10h4v10 M10 20V4h4v16 M16 20v-7h4v7',playoffs:'M3 4h5v5H3 M3 15h5v5H3 M8 6h4v12H8 M12 12h8',appearance:'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-3-5-6-9-6 M7 8h.01 M11 6h.01 M16 7h.01',files:'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6',danger:'M12 3L2 21h20z M12 9v5 M12 17h.01'};n.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+(paths[kind]||paths.league)+'"/></svg>';return n;}
 const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 function countLabel(n){return n+' '+(n===1?(lang()==='en'?'tool':'herramienta'):text('tools'));}
 function memo(area){const key=[area,_ligaActual,currentUser?.key||currentUser?.name,currentUser?.role,currentUser?.isAdmin,activeN,typeof isTutorialRunning==='function'&&isTutorialRunning()?'tour':'live'].join('|');if(!memory.has(key)){if(memory.size>=24)memory.delete(memory.keys().next().value);memory.set(key,{category:'overview',q:''});}return memory.get(key);}
 function jumpTask(id){if(!allowed())return;const s=memo('admin');s.category=tasks[id]?.[0]||'league';s.q='';SohailUI.go('admin');if(subView!=='admin')return;const panel=document.querySelector('[data-admin-task="'+id+'"]');if(panel){panel.scrollIntoView({block:'start',behavior:'auto'});panel.querySelector('.aw-task-title')?.focus({preventScroll:true});}}
 function link(label,route,tab){const b=button(label);b.addEventListener('click',()=>{if(!allowed())return;if(route==='jugadores'&&tab)memo('players').category=tab;SohailUI.go(route);});return b;}
 function makeTask(id,body){const n=el('div','card');n.dataset.adminTask=id;if(body)n.append(body);return n;}
 function prepare(root){
  // Move the actual demo buttons, retaining both handlers and all confirmation logic.
  const demos=['demoFillUI()','undoDemoUI()'].map(a=>root.querySelector('button[onclick="'+a+'"]')).filter(Boolean);
  if(demos.length&&!root.querySelector('[data-admin-task="simulation"]')){const n=makeTask('simulation'),line=el('div','gap-sm');line.append(...demos);n.append(el('p','aw-warning',text('simulation')),line);root.append(n);}
  const rating=root.querySelector('#rating-toggle-btn');
  if(rating&&!rating.closest('[data-admin-task="rating"]')){const body=rating.parentElement,title=body.previousElementSibling;const n=makeTask('rating');if(title?.classList.contains('section-lbl'))title.remove();n.append(body);root.append(n);}
  if(!root.querySelector('[data-admin-task="players"]')){const n=makeTask('players');n.append(link(text('openPlayers'),'jugadores'));root.append(n);}
  if(!root.querySelector('[data-admin-task="rules"]')){const n=makeTask('rules');n.append(link(text('rules'),'reglamento'));root.append(n);}
 }
 function decorate(node,meta,id){
  node.classList.add('aw-task');node.id=node.id||'aw-task-'+id;
  const heading=node.querySelector('[data-admin-title],.section-lbl');
  const title=el('h2','aw-task-title',translate(meta));title.tabIndex=-1;
  if(heading)heading.replaceWith(title);else node.prepend(title);
  const hint=el('p','aw-task-hint',translate(meta,3));title.after(hint);
  if(['reset','new-season','simulation','repair-player'].includes(id))node.classList.add('aw-task-sensitive');
  // Reword only the shared appearance save label; handler and fields remain intact.
  if(id==='appearance'){const save=node.querySelector('[onclick="saveLeagueName()"]');if(save)save.textContent=lang()==='en'?'Save appearance and clubs':'Guardar apariencia y clubes';}
  // Accessible labels for controls previously labelled only by their visual position.
  node.querySelectorAll('.form-group').forEach((group,i)=>{const label=group.querySelector('label'),input=group.querySelector('input:not([type="hidden"]),select,textarea');if(label&&input&&!label.htmlFor){input.id=input.id||'aw-'+id+'-field-'+i;label.htmlFor=input.id;}});
 }
 function organize(){
  const root=document.getElementById('view-admin');if(!root||!allowed()||root.querySelector(':scope > .aw-layout'))return;
  if(!root.querySelector('[data-admin-task]'))return; // Older renderers use their original UI.
  prepare(root);
  const nodes=Array.from(root.querySelectorAll('[data-admin-task]')).filter(n=>!n.parentElement.closest('[data-admin-task]'));
  const items=nodes.map(node=>{const id=node.dataset.adminTask,meta=tasks[id]||tasks.other;decorate(node,meta,id);return{id,node,meta,category:meta[0],index:normalize([translate(meta),translate(meta,3),meta[5],node.textContent].join(' '))};});
  // Never silently drop an unknown block added by another renderer.
  for(const child of Array.from(root.children)){if(child.matches('[data-admin-task]')||child.querySelector('[data-admin-task]'))continue;if(child.textContent.trim()||child.querySelector('input,button,select,textarea')){const id='other-'+items.length;child.dataset.adminTask=id;decorate(child,tasks.other,id);items.push({id,node:child,meta:tasks.other,category:'other',index:normalize(child.textContent)});}}
  const state=memo('admin');
  const cats=categories.filter(c=>items.some(i=>i.category===c[0]));if(items.some(i=>i.category==='other'))cats.push(['other',text('other'),text('other'),text('otherHint'),text('otherHint'),'files']);
  if(!['overview','all',...cats.map(c=>c[0])].includes(state.category))state.category='overview';
  const layout=el('div','aw-layout');
  const head=el('header','aw-head'),title=el('h1','',text('title')),context=el('p','aw-context');
  const league=typeof LIGA_NOMBRE_OFICIAL==='string'&&LIGA_NOMBRE_OFICIAL.trim()?LIGA_NOMBRE_OFICIAL:LEAGUE_NAME;
  context.textContent=text('context')+': '+league+' · '+text('cycle')+' '+activeN+' · '+text(currentUser.role==='superadmin'?'roleSuper':'roleAdmin');
  head.append(context,title,el('p','aw-intro',text('intro')));layout.append(head);
  if(cycles.some(c=>c.status==='finished')){const warn=el('div','aw-warning');warn.append(el('p','',text('liveCycle')));const b=button(text('status'));b.onclick=()=>select('league','cycle-status');warn.append(b);layout.append(warn);}
  const quick=el('nav','aw-shortcuts');quick.setAttribute('aria-label',text('open'));
  quick.append(link(text('review'),'pendientes'),link(text('add'),'jugadores','add'));const move=button(text('move')),dest=button(text('dest'));move.onclick=()=>select('groups','groups');dest.onclick=()=>select('groups','destinations');quick.append(move,dest);layout.append(quick);
  const search=el('div','aw-search'),lab=el('label','',text('search'));lab.htmlFor='aw-search';const input=el('input');input.id='aw-search';input.type='search';input.placeholder=text('searchHint');input.autocomplete='off';input.value=state.q;
  const clear=button(text('clear'),'btn aw-clear');clear.onclick=()=>{input.value='';state.q='';paint();input.focus();};search.append(lab,input,clear);layout.append(search);
  const overview=el('nav','aw-categories');overview.setAttribute('aria-label',text('overview'));layout.append(overview);
  const compact=el('nav','aw-category-tabs');compact.setAttribute('aria-label',text('overview'));layout.append(compact);
  const bar=el('div','aw-toolbar'),back=button(text('back'),'btn aw-back'),all=button(text('all'),'btn aw-all'),status=el('p','aw-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  back.onclick=()=>select('overview');all.onclick=()=>select('all');bar.append(back,all,status);layout.append(bar);
  const categoryHeading=el('h2','aw-category-title');categoryHeading.tabIndex=-1;layout.append(categoryHeading);
  const danger=el('p','aw-warning',text('danger')),pointInfo=el('p','aw-tip',text('scaleNote'));layout.append(danger,pointInfo);
  const empty=el('p','aw-empty',text('empty'));layout.append(empty);
  const board=el('div','aw-board');board.id='aw-board';for(const i of items)board.append(i.node);layout.append(board,el('p','aw-footnote',text('note')));
  root.replaceChildren(layout);root.classList.add('aw-admin');
  for(const c of cats){
   const small=button(translate(c),'aw-category-tab');small.dataset.awCategory=c[0];small.setAttribute('aria-controls','aw-board');small.title=translate(c,3);small.onclick=()=>select(c[0],null,true);compact.append(small);
   const b=button('','aw-category'),copy=el('span','aw-category-copy');copy.append(el('strong','',translate(c)),el('span','',translate(c,3)),el('small','',countLabel(items.filter(i=>i.category===c[0]).length)));b.append(icon(c[5]),copy);b.dataset.awCategory=c[0];b.onclick=()=>select(c[0]);overview.append(b);}
  input.oninput=()=>{state.q=input.value;paint();};
  compact.onkeydown=ev=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;const bs=Array.from(compact.querySelectorAll('button')),i=bs.indexOf(ev.target);if(i<0)return;ev.preventDefault();const j=ev.key==='Home'?0:ev.key==='End'?bs.length-1:(i+(ev.key==='ArrowRight'?1:-1)+bs.length)%bs.length;bs[j].focus();};
  function select(category,task,keepFocus=false){if(!allowed())return;state.category=category;state.q='';input.value='';paint();if(keepFocus){compact.querySelector('[data-aw-category="'+category+'"]')?.focus({preventScroll:true});return;}const target=task?items.find(i=>i.id===task)?.node:category==='overview'?overview:compact;target?.scrollIntoView({block:'start',behavior:'auto'});(target?.querySelector('.aw-task-title')||(category==='overview'?overview.querySelector('button'):compact.querySelector('[aria-current="page"]')||categoryHeading))?.focus({preventScroll:true});}
  function paint(){
   const q=normalize(state.q.trim()),terms=q.split(/\s+/).filter(Boolean),overviewOn=!q&&state.category==='overview';let count=0,sensitive=false;
   for(const i of items){const visible=q?terms.every(s=>i.index.includes(s)):(state.category==='all'||state.category===i.category);i.node.hidden=!visible;if(visible){count++;if(i.category==='danger')sensitive=true;}}
   overview.hidden=!overviewOn;compact.hidden=overviewOn;back.hidden=overviewOn;all.hidden=state.category==='all'&&!q;clear.hidden=!q;board.hidden=overviewOn;empty.hidden=overviewOn||count>0;
   categoryHeading.hidden=overviewOn;categoryHeading.textContent=q?text('categorySearch'):state.category==='all'?text('all'):translate(cats.find(c=>c[0]===state.category)||['',text('other'),text('other')]);
   status.textContent=overviewOn?'':(q?count+' '+text('results'):countLabel(count));danger.hidden=!sensitive;pointInfo.hidden=!(state.category==='points'&&!q);input.setAttribute('aria-controls','aw-board');
   overview.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.awCategory===state.category)));
   compact.querySelectorAll('button').forEach(b=>{if(!q&&b.dataset.awCategory===state.category)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  }
  paint();
 }
 function organizeAccount(root,dest){
  if(!root||!dest||!allowed())return;
  if(!root.querySelector('.aw-account-head')){
   const h=el('header','aw-account-head');h.append(el('h1','',text('account')),el('p','aw-intro',text('accountHint')));root.prepend(h);
   const info=root.querySelector('.prof-row')?.closest('.card');if(info){const title=info.querySelector('.section-lbl');if(title)title.textContent=text('myInfo');const role=info.querySelectorAll('.prof-row')[1];if(role?.lastElementChild)role.lastElementChild.textContent=text(currentUser.role==='superadmin'?'roleSuper':'roleAdmin');}
   const theme=root.querySelector('.theme-btn')?.closest('.card');if(theme?.querySelector('.section-lbl'))theme.querySelector('.section-lbl').textContent=text('myTheme');
   const pw=root.querySelector('#pw-old')?.closest('.card');if(pw?.querySelector('.section-lbl'))pw.querySelector('.section-lbl').textContent=text('myPassword');
   const pk=root.querySelector('#pk-card .section-lbl');if(pk)pk.textContent=text('myDevice');
  }
  if(dest.querySelector('.aw-players'))return;
  const add=dest.querySelector('#ap-nom')?.closest('.card'),members=dest.querySelector('#player-list')?.closest('.card'),catalog=dest.querySelector('#cat-jugadores-card');if(!members)return;
  const sections=[['members',members,text('members'),text('membersHint')],...(add?[['add',add,text('add'),text('addHint')]]:[]),...(catalog?[['catalog',catalog,text('catalog'),text('catalogHint')]]:[])];
  if(global.SohailInjuries){const panel=global.SohailInjuries.createPanel();sections.push(['injuries',panel,global.SohailInjuries.text('title'),global.SohailInjuries.text('hint')]);}
  const advanced=members.querySelector('[onchange="importarJugadoresExcel(this)"]')?.closest('.gap-sm');
  if(advanced){const task=el('section','card');task.append(advanced);sections.push(['advanced',task,text('advanced'),text('advancedHint')]);}
  const state=memo('players');if(!sections.some(s=>s[0]===state.category))state.category='members';
  const wrap=el('div','aw-players'),head=el('header','aw-head');head.append(el('h1','',text('playersTitle')),el('p','aw-intro',text('playersHint')));wrap.append(head);
  const menu=el('nav','aw-player-menu');menu.setAttribute('aria-label',text('playersTitle'));wrap.append(menu);
  const tools=el('div','aw-shortcuts');for(const id of ['requests','devices',...(currentUser.role==='superadmin'?['repair-player','player-points']:[])]){const b=button(translate(tasks[id]));b.onclick=()=>jumpTask(id);tools.append(b);}wrap.append(tools);
  for(const [id,node,title,hint]of sections){node.dataset.awPlayerSection=id;node.classList.add('aw-player-task');const cap=node.querySelector('.section-lbl');if(cap)cap.textContent=title;else node.prepend(el('h2','',title));node.prepend(el('p','aw-task-hint',hint));if(id==='advanced')node.prepend(el('p','aw-warning',text('sensitivePlayer')));wrap.append(node);const b=button(title);b.dataset.awPlayer=id;b.onclick=()=>{state.category=id;paint();};menu.append(b);}
  // Retain any extra control-bearing nodes instead of silently removing them.
  for(const child of Array.from(dest.children)){if(sections.some(s=>s[1]===child))continue;if(child.querySelector('input,select,textarea,button')&&!wrap.contains(child)){wrap.append(child);}}
  dest.replaceChildren(wrap);
  function paint(){sections.forEach(([id,node])=>node.hidden=id!==state.category);menu.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.awPlayer===state.category)));}
  paint();
 }
 global.SohailAdmin=Object.freeze({organize,organizeAccount,jumpTask});
})(window);
