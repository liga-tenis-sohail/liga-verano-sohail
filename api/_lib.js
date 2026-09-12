// =====================================================================
// LIGA SOHAIL — utilidades internas del servidor
// El prefijo "_" hace que Vercel NO publique este archivo como ruta.
// Es una librería interna: nadie puede llamarlo desde fuera.
// =====================================================================
const crypto = require('crypto');

const SUPA_URL       = process.env.SUPABASE_URL;
const SUPA_SECRET    = process.env.SUPABASE_SERVICE_KEY;   // clave service_role — SOLO servidor
const SESSION_SECRET = process.env.SESSION_SECRET;
const SUPER_HASH     = process.env.SUPER_HASH || '';

// Mismos parámetros que usaba el navegador: las contraseñas existentes siguen valiendo.
const PBKDF2_SALT  = 'LigaSohailSecure2026';
const PBKDF2_ITERS = 100000;
const SESSION_MIN  = 90;

// Contraseñas por defecto conocidas (públicas): al detectar login con alguna
// de ellas, el servidor devuelve mustChangePw=true para forzar el cambio.
// "tenis" está en el instructivo; el hash de "admin123" estuvo en el repo público
// (SHA-256 sin sal, se reversa en segundos). Se compara con el hash V2 recién
// calculado, así da igual si la base guardó legacy, v1 o v2.
const POR_DEFECTO_V2 = new Set([
  'v2:7afc817d4013c0e9740356ad09b7e4094ee6678df855c5869aaad97dd4d2f3eb',   // tenis
  'v2:e7fd5acfb9cbb0449ad3abe3c0f3436559af8cf74a09cdbee1a29a41bb394d12'    // admin123
]);

function hashV2(pw){
  if(!pw) return 'v2:';
  return 'v2:' + crypto.pbkdf2Sync(pw, PBKDF2_SALT, PBKDF2_ITERS, 32, 'sha256').toString('hex');
}
function hashV1(pw){
  if(!pw) return 'v1:';
  return 'v1:' + crypto.createHash('sha256').update(pw, 'utf8').digest('hex');
}

// --- Sesiones: token firmado con HMAC. Sin dependencias externas. ---
function signToken(payload){
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function verifyToken(tok){
  if(!tok || typeof tok !== 'string'||tok.length>8192) return null;
  const i = tok.indexOf('.');
  if(i < 1) return null;
  const body = tok.slice(0, i), sig = tok.slice(i + 1);
  const expect = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if(a.length !== b.length) return null;
  if(!crypto.timingSafeEqual(a, b)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch(e){ return null; }
  if(!p||!Number.isSafeInteger(p.exp)||Date.now()>=p.exp||typeof p.u!=='string'||p.u.length>120)return null;
  return p;
}

function principalKey(name,u){
  return u&&u.jugadorId?'g:'+u.jugadorId:u&&u._credentialId?'i:'+u._credentialId:'n:'+name;
}
function defaultStored(p){return POR_DEFECTO_V2.has(p)||['tenis','admin123',hashV1('tenis'),hashV1('admin123')].includes(p);}
async function readAccount(key){
  const r=await fetch(SUPA_URL+'/rest/v1/sohail_account_security?id=eq.'+encodeURIComponent(key)+'&select=*',{headers:supaHeaders(),signal:AbortSignal.timeout(15000)});
  if(!r.ok){const e=new Error('No se pudo leer la seguridad de la cuenta. Comprobá la instalación del SQL.');e.status=503;e.code='SCHEMA_REQUIRED';throw e;}
  const rows=await r.json();return rows[0]||null;
}
async function securityFor(name,state){
  const u=state&&state.users&&state.users[name];
  if(!u){const e=new Error('Usuario no encontrado.');e.status=403;e.code='FORBIDDEN';throw e;}
  const key=principalKey(name,u), existing=await readAccount(key);if(existing)return existing;
  let stored=u.pass;
  if(u.jugadorId){
    const cat=await readCatalogo();const j=cat[u.jugadorId];
    if(!j)throw Object.assign(new Error('No se pudo comprobar el perfil global.'),{status:503,code:'IDENTITY_UNAVAILABLE'});
    stored=j.pass||u.pass;
  }
  if(!stored){
    if((u.role||'player')!=='player')throw Object.assign(new Error('Cuenta administrativa sin credencial.'),{status:503,code:'IDENTITY_UNAVAILABLE'});
    stored=hashV2('tenis');
  }
  const body={id:key,pass_hash:stored,must_change:defaultStored(stored)};
  const q=await fetch(SUPA_URL+'/rest/v1/sohail_account_security',{method:'POST',headers:supaHeaders({'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=representation'}),body:JSON.stringify(body)});
  if(!q.ok)throw Object.assign(new Error('No se pudo preparar la sesión.'),{status:503,code:'SCHEMA_REQUIRED'});
  const rows=await q.json();return rows[0]||await readAccount(key);
}
function makeSession(name,role,ligaId,state,record){
  if(!record)throw new Error('Falta la versión de credenciales verificada.');
  return {u:name,r:role,src:ligaId,pk:record.id,sv:Number(record.epoch),m:!!record.must_change,exp:Date.now()+SESSION_MIN*60000};
}
async function auth(req,allowDefault){
  const h=req.headers&&req.headers.authorization||'';
  const session=verifyToken(h.startsWith('Bearer ')?h.slice(7):'');
  // Los tokens de la versión anterior se invalidan en este despliegue.
  if(!session||!session.pk||!Number.isSafeInteger(session.sv)||!ligaIdOK(session.src))return null;
  const account=await readAccount(session.pk);
  if(!account||Number(account.epoch)!==session.sv)return null;
  const source=await readState(session.src),u=source&&source.users&&source.users[session.u];
  if(!u||u.inactive||principalKey(session.u,u)!==session.pk)return null;
  session.r=u.role||'player';session.m=!!account.must_change;
  if(session.m&&!allowDefault)throw Object.assign(new Error('Primero cambiá la contraseña predeterminada.'),{status:403,code:'PASSWORD_CHANGE_REQUIRED'});
  return session;
}
function renewIfStale(session){
  if(!session)return null;
  const total=SESSION_MIN*60000;if(session.exp-Date.now()>total/2)return null;
  return signToken({...session,exp:Date.now()+total});
}

// Una cuenta dada de baja pierde el acceso aunque tenga un token vivo.
function blockedUser(state, session){
  const u = (state.users || {})[session.u];
  if(!u) return 'Tu usuario ya no existe en la liga.';
  if(session.pk&&principalKey(session.u,u)!==session.pk)return 'Tu sesión corresponde a otra identidad.';
  if(u.inactive) return 'Tu cuenta está inactiva. Contactá al administrador.';
  return null;
}

function isAdminRole(r){ return r === 'admin' || r === 'superadmin'; }

// Autorización desde el estado actual de la liga y su identidad verificada.
// No se confía en permisos administrativos heredados de un token antiguo.
function sesionEsAdmin(session, users){
  if(!session)return false;
  const u=users&&users[session.u];
  if(!u||u.inactive||(session.pk&&principalKey(session.u,u)!==session.pk))return false;
  return isAdminRole(u.role)||u.isAdmin===true;
}

// Solo la cuenta original 'admin' y el super admin reparten el rol de administrador.
// Un admin ascendido no puede crear más: si le roban la cuenta, no puede dejarse
// una puerta trasera que sobreviva al cambio de contraseña.
function puedeGestionarAdmins(session){
  return !!session && (session.u === 'admin' || session.r === 'superadmin');
}

// Filtra el estado según quién pregunta. MUTA el objeto recibido: no hace falta
// copiarlo porque readState() devuelve uno nuevo en cada request, y clonar 222 KB
// en cada login costaba tiempo y memoria para nada.
function filterForSession(state, session){
  const admin=sesionEsAdmin(session,state.users);
  for(const [name,u] of Object.entries(state.users||{})){
    if(!u||typeof u!=='object')continue;
    u.passwordDefault=POR_DEFECTO_V2.has(u.pass||'')||['tenis','admin123',hashV1('tenis'),hashV1('admin123')].includes(u.pass);
    if(admin)u.identityRef=require('./_validation').identityRef(name,u);
    delete u.pass;
    if(!admin&&(!session||name!==session.u)){delete u.email;delete u.tel;delete u._credentialId;}
  }
  if(!admin){state.JOIN_REQUESTS=[];state.LOG=[];}
  return state;
}
function filterPublicState(state){
  const allowed=['_v','cycles','matches','matchId','activeN','playoff','DESTINO','FECHAS','PO_FECHAS','ALLNAMES','PUNTOS','AJUSTES_PUNTOS','LEAGUE_NAME','LEAGUE_SUBTITLE','LOGIN_TITLE','LEAGUE_COLOR_PRI','LEAGUE_COLOR_ACC','LEAGUE_COLOR_HL','CLUBS','COLOR_DISPUTA','RATING_ON','RATING_SEEDS','RATING_OVERRIDES','REGLAMENTO'];
  const out={};for(const k of allowed)if(k in state)out[k]=state[k];
  out.users={};for(const [name,u] of Object.entries(state.users||{})){
    out.users[name]={name:u.name||name,role:u.role||'player',inactive:!!u.inactive};
    // ID de enlace deportivo: necesario para sumar estadísticas entre ligas.
    if(u.jugadorId)out.users[name].jugadorId=u.jugadorId;
  }
  return out;
}

// --- Acceso a Supabase con la clave secreta (se salta RLS) ---
// OJO con los headers: las claves NUEVAS (sb_secret_...) no son JWT y Supabase
// las rechaza si viajan en Authorization: Bearer. Las LEGACY (service_role, que
// sí es un JWT) en cambio lo necesitan. Detectamos el formato y mandamos lo justo.
function supaHeaders(extra){
  const h = Object.assign({ apikey: SUPA_SECRET }, extra || {});
  if(!/^sb_(secret|publishable)_/.test(SUPA_SECRET || '')){
    h.Authorization = 'Bearer ' + SUPA_SECRET;   // clave legacy en formato JWT
  }
  return h;
}

// La liga por defecto: si un endpoint todavía no pasa ligaId, trabaja sobre la
// liga histórica. Así la migración es gradual y nada se rompe en el camino.
const LIGA_DEFAULT = 'liga-actual';

// Sanea el id de liga: solo minúsculas, números y guiones. Evita inyección en la
// URL de Supabase y mantiene los ids predecibles ("anual-2026").
function ligaIdOK(id){
  return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
}

const _readVersions = new WeakMap();
async function readState(ligaId){
  const id = ligaId || LIGA_DEFAULT;
  if(!ligaIdOK(id)) throw new Error('ligaId inválido');
  const r = await fetch(SUPA_URL + '/rest/v1/liga_state?id=eq.' + encodeURIComponent(id) + '&select=data', {
    headers: supaHeaders()
  });
  if(!r.ok) throw new Error('Supabase read ' + r.status);
  const rows = await r.json();
  if(!Array.isArray(rows) || !rows.length || rows[0].data == null) return null;
  const d = rows[0].data;
  const obj=typeof d === 'string' ? JSON.parse(d) : d;
  if(!obj||typeof obj!=='object'||Array.isArray(obj))throw new Error('Estado almacenado inválido');
  _readVersions.set(obj,Number.isSafeInteger(obj._v)?obj._v:0);
  return obj;
}

// Se guarda igual que antes: la columna `data` recibe el JSON como texto.
// Ahora la fila destino la define ligaId (default: la liga histórica).
async function rpc(name, body){
  const r=await fetch(SUPA_URL+'/rest/v1/rpc/'+name,{
    method:'POST',headers:supaHeaders({'Content-Type':'application/json'}),body:JSON.stringify(body),signal:AbortSignal.timeout(20000)
  });
  if(!r.ok){
    const e=new Error(r.status===404?'Falta instalar el SQL de correcciones.':'No se pudo completar la operación de base de datos.');
    e.status=503;e.code=r.status===404?'SCHEMA_REQUIRED':'DATABASE_UNAVAILABLE';throw e;
  }
  return r.json();
}
async function writeState(ligaId,obj,options){
  if(obj===undefined&&ligaId&&typeof ligaId==='object'){obj=ligaId;ligaId=LIGA_DEFAULT;}
  const id=ligaId||LIGA_DEFAULT;
  if(!ligaIdOK(id)||!obj||typeof obj!=='object')throw new Error('Estado o liga inválidos');
  const expected=options&&Number.isSafeInteger(options.expectedVersion)?options.expectedVersion:
    _readVersions.has(obj)?_readVersions.get(obj):Number.isSafeInteger(obj._v)?obj._v:-1;
  const d=await rpc('sohail_write_state',{p_liga:id,p_expected:expected,p_data:obj});
  if(!d||!d.ok){const e=new Error('Otra persona modificó la liga. Tus cambios siguen pendientes.');e.status=409;e.code='CONFLICT';e.currentV=d&&d.currentV;throw e;}
  obj._v=d.version;_readVersions.set(obj,d.version);return d.version;
}

function envOK(res){
  const missing = [];
  if(!SUPA_URL) missing.push('SUPABASE_URL');
  if(!SUPA_SECRET) missing.push('SUPABASE_SERVICE_KEY');
  if(!SESSION_SECRET) missing.push('SESSION_SECRET');
  if(missing.length){
    res.status(500).json({ error: 'Servidor mal configurado. Faltan variables de entorno: ' + missing.join(', ') });
    return false;
  }
  return true;
}

// =====================================================================
// CATÁLOGO GLOBAL DE JUGADORES (tabla `jugadores`)
// Una persona = una fila. Su identidad y contraseña viven acá, compartidas
// por todas las ligas. El email (opcional) sirve para vincular identidad.
// =====================================================================

// Lee todo el catálogo como un mapa { id: {id,nombre,email,pass} }.
async function readCatalogo(){
  const r = await fetch(SUPA_URL + '/rest/v1/jugadores?select=id,nombre,email,pass', {
    headers: supaHeaders()
  });
  if(!r.ok) throw new Error('Supabase catálogo read ' + r.status);
  const rows = await r.json();
  const map = {};
  if(Array.isArray(rows)) for(const j of rows) map[j.id] = j;
  return map;
}

// Busca un jugador por email (para vincular identidad entre ligas).
// Devuelve la fila o null. Case-insensitive.
async function buscarJugadorPorEmail(email){
  if(!email) return null;
  const e = String(email).trim().toLowerCase();
  if(!e) return null;
  const r = await fetch(SUPA_URL + '/rest/v1/jugadores?email=ilike.' + encodeURIComponent(e) + '&select=id,nombre,email,pass', {
    headers: supaHeaders()
  });
  if(!r.ok) throw new Error('Supabase catálogo email ' + r.status);
  const rows = await r.json();
  return (Array.isArray(rows) && rows.length) ? rows[0] : null;
}

// Crea o actualiza un jugador del catálogo (upsert por id).
async function upsertJugador(jug){
  if(!jug || !jug.id || !jug.nombre) throw new Error('jugador inválido');
  const row = {
    id: jug.id,
    nombre: jug.nombre,
    email: (jug.email || null),
    pass: (jug.pass || null),
    actualizado: new Date().toISOString()
  };
  const r = await fetch(SUPA_URL + '/rest/v1/jugadores', {
    method: 'POST',
    headers: supaHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    }),
    body: JSON.stringify(row)
  });
  if(!r.ok) throw new Error('Supabase upsert jugador ' + r.status + ' ' + (await r.text()));
}
// Borra un jugador del catálogo global. Sus partidos NO se tocan: están guardados
// por nombre en cada liga, así que resultados y estadísticas quedan intactos.
async function borrarJugador(jugadorId){
  if(!jugadorId || typeof jugadorId !== 'string') throw new Error('id de jugador inválido');
  const r = await fetch(SUPA_URL + '/rest/v1/jugadores?id=eq.' + encodeURIComponent(jugadorId), {
    method: 'DELETE',
    headers: supaHeaders({ Prefer: 'return=minimal' })
  });
  if(!r.ok) throw new Error('Supabase delete jugador ' + r.status + ' ' + (await r.text()));
}

// Borra TODAS las passkeys de un usuario. Se llama al eliminar un jugador para
// que no queden credenciales huérfanas: si mañana se crea otro jugador con el
// mismo nombre, no debería heredar los Face ID del anterior.
async function borrarPasskeysDeUsuario(userName,strict=false){
  if(!userName) return;
  const r = await fetch(SUPA_URL + '/rest/v1/passkeys?user_name=eq.' + encodeURIComponent(userName), {
    method: 'DELETE',
    headers: supaHeaders({ Prefer: 'return=minimal' })
  });
  // No lanzamos si falla: es limpieza, no debería bloquear la eliminación del
  // jugador. El admin ve el error del jugador en primer plano si aplica.
  if(!r.ok&&strict)throw Object.assign(new Error('No se pudieron revocar los dispositivos. No se aplicó el vínculo.'),{status:503,code:'DATABASE_UNAVAILABLE'});
}

// ============================================================================
// RATE LIMITING COMPARTIDO — tabla `rate_limits` en Supabase.
// Reemplaza el Map en memoria del login: al escalar Vercel, cada instancia
// tenía su propio contador, permitiéndole a un atacante N intentos por N
// instancias. Ahora es un contador único global por clave (usuario o IP).
// El costo es 1-2 queries a Supabase por login. Aceptable a esta escala.
// ============================================================================

// Devuelve segundos que faltan hasta desbloquear, o 0 si no está bloqueada.
async function rateLimitCheck(key, max){
  const r = await fetch(SUPA_URL + '/rest/v1/rate_limits?key=eq.' + encodeURIComponent(key) + '&select=n,until_ts', {
    headers: supaHeaders()
  });
  if(!r.ok) return 0;                            // ante duda, permitir (fail-open para no bloquear a usuarios legítimos)
  const rows = await r.json();
  if(!Array.isArray(rows) || !rows.length) return 0;
  const row = rows[0];
  if(row.n < max) return 0;
  if(!row.until_ts) return 0;
  const left = new Date(row.until_ts).getTime() - Date.now();
  if(left <= 0){
    // Ya venció: limpiamos best-effort (no esperamos)
    fetch(SUPA_URL + '/rest/v1/rate_limits?key=eq.' + encodeURIComponent(key), {
      method: 'DELETE', headers: supaHeaders({ Prefer: 'return=minimal' })
    }).catch(()=>{});
    return 0;
  }
  return Math.ceil(left / 1000);
}

// Registra un intento fallido. Al llegar a max, marca `until_ts` con el lock.
// Usa UPSERT + expresión SQL vía RPC no está disponible en PostgREST plano, así
// que hacemos read-modify-write (best-effort; race conditions bajo carga son
// aceptables: dos fails simultáneos que cuenten 1 en vez de 2 no es crítico).
async function rateLimitFail(key, max, lockMs){
  const r = await fetch(SUPA_URL + '/rest/v1/rate_limits?key=eq.' + encodeURIComponent(key) + '&select=n,until_ts', {
    headers: supaHeaders()
  });
  let n = 0;
  if(r.ok){
    const rows = await r.json();
    if(Array.isArray(rows) && rows.length) n = rows[0].n || 0;
  }
  n = n + 1;
  const until_ts = (n >= max) ? new Date(Date.now() + lockMs).toISOString() : null;
  await fetch(SUPA_URL + '/rest/v1/rate_limits', {
    method: 'POST',
    headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ key, n, until_ts, updated_at: new Date().toISOString() })
  }).catch(()=>{});
}

// Limpia el contador tras un login exitoso.
async function rateLimitClear(key){
  await fetch(SUPA_URL + '/rest/v1/rate_limits?key=eq.' + encodeURIComponent(key), {
    method: 'DELETE', headers: supaHeaders({ Prefer: 'return=minimal' })
  }).catch(()=>{});
}


// ============================================================================
// AUDIT LOG — inserta un evento sensible en la tabla `audit_log`. Best-effort:
// si falla, NO rompe la operación principal. Registra acciones como
// crear/eliminar liga, cambios de rol, reset de clave, etc.
// ============================================================================
async function logAudit(actor, action, target, details, actorIp){
  try {
    await fetch(SUPA_URL + '/rest/v1/audit_log', {
      method: 'POST',
      headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({
        actor: String(actor || 'unknown').slice(0, 60),
        actor_ip: actorIp ? String(actorIp).slice(0, 45) : null,
        action: String(action || '').slice(0, 60),
        target: target ? String(target).slice(0, 200) : null,
        details: details || null
      })
    });
  } catch(_){ /* silent, audit no debe bloquear */ }
}

// Extrae la IP del cliente. Útil para audit y rate limit.
function clientIP(req){
  const xf = req && req.headers && req.headers['x-forwarded-for'];
  if(xf) return String(xf).split(',')[0].trim();
  return (req && req.headers && req.headers['x-real-ip']) || 'desconocida';
}

// ============================================================================
// MENSAJERÍA — tabla `mensajes` en Supabase. Guardada APARTE del bloque
// grande de estado de la liga (liga_state) a propósito: si viviera adentro
// del JSON gigante como todo lo demás, dos jugadores escribiendo casi al
// mismo tiempo se pisarían el guardado uno al otro (el guardado de la liga
// reescribe TODO el documento entero cada vez). Acá cada mensaje es una fila
// insertada de forma independiente: no hay forma de que un mensaje pise a otro.
//
// Columnas: id, liga_id, tipo ('admin'|'grupo'), ciclo (solo para 'grupo'),
// grupo (solo para 'grupo'), autor, texto, fecha.
// ============================================================================

// Inserta un mensaje nuevo. Devuelve la fila creada (con id y fecha reales).
async function insertarMensaje({ ligaId, tipo, ciclo, grupo, autor, texto, imagen }){
  const row = {
    liga_id: ligaId,
    tipo,
    ciclo: (tipo === 'grupo' || tipo === 'playoff') ? ciclo : null,
    grupo: (tipo === 'grupo' || tipo === 'playoff') ? grupo : null,
    autor: String(autor || '').slice(0, 80),
    texto: String(texto || '').slice(0, 2000)
  };
  // imagen: data URL base64 (ya comprimida del lado del cliente, mismo
  // patrón que rgComprimirImg en reglamento.js — máx 1200px, JPEG calidad
  // 0.75). Se guarda tal cual en la columna `imagen` de la tabla mensajes
  // (TEXT, sin límite práctico de longitud en Postgres). Solo el admin
  // puede adjuntar (ver el chequeo de esAdminMsg en liga.js antes de
  // llegar acá) — es deliberado: abrir esto a cualquier jugador multiplica
  // el tamaño de la tabla sin control y sin necesidad real para el caso de
  // uso (avisos del admin con una captura o un documento adjunto).
  if(imagen && typeof imagen === 'string' && imagen.startsWith('data:')){
    row.imagen = imagen.slice(0, 700000);   // ~500KB de imagen en base64, con margen
  }
  const r = await fetch(SUPA_URL + '/rest/v1/mensajes', {
    method: 'POST',
    headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(row)
  });
  if(!r.ok) throw new Error('Supabase insert mensaje ' + r.status + ' ' + (await r.text()));
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

// Lee los últimos N mensajes de un hilo (admin de una liga, o grupo de un
// ciclo). Devuelve en orden cronológico (más viejo primero, como un chat).
async function leerMensajes({ ligaId, tipo, ciclo, grupo, limite }){
  let url = SUPA_URL + '/rest/v1/mensajes?liga_id=eq.' + encodeURIComponent(ligaId)
          + '&tipo=eq.' + encodeURIComponent(tipo);
  if(tipo === 'grupo' || tipo === 'playoff'){
    // PostgREST: NULL necesita IS NULL; eq.null no es un filtro válido para integer.
    // Conservamos el cuadro (incluido el índice 0) y el ciclo numérico de los grupos.
    url += '&ciclo=' + (ciclo === null ? 'is.null' : 'eq.' + encodeURIComponent(ciclo))
         + '&grupo=eq.' + encodeURIComponent(grupo);
  }
  url += '&order=id.desc&limit=' + (limite || 200);
  const r = await fetch(url, { headers: supaHeaders({ select: undefined }) });
  if(!r.ok) throw new Error('Supabase read mensajes ' + r.status);
  const rows = await r.json();
  return Array.isArray(rows) ? rows.reverse() : [];
}

// Lee solo los mensajes NUEVOS (id mayor al último que el cliente ya tiene).
// Usado para el polling liviano: evita re-bajar todo el hilo cada pocos
// segundos, solo lo que cambió desde la última vez.
async function leerMensajesDesde({ ligaId, tipo, ciclo, grupo, desdeId }){
  let url = SUPA_URL + '/rest/v1/mensajes?liga_id=eq.' + encodeURIComponent(ligaId)
          + '&tipo=eq.' + encodeURIComponent(tipo)
          + '&id=gt.' + encodeURIComponent(desdeId || 0);
  if(tipo === 'grupo' || tipo === 'playoff'){
    // PostgREST: NULL necesita IS NULL; eq.null no es un filtro válido para integer.
    // Conservamos el cuadro (incluido el índice 0) y el ciclo numérico de los grupos.
    url += '&ciclo=' + (ciclo === null ? 'is.null' : 'eq.' + encodeURIComponent(ciclo))
         + '&grupo=eq.' + encodeURIComponent(grupo);
  }
  url += '&order=id.asc&limit=200';
  const r = await fetch(url, { headers: supaHeaders() });
  if(!r.ok) throw new Error('Supabase read mensajes ' + r.status);
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}


// ============================================================================
// BLOCKED USER CON CACHÉ — evita leer los 125 KB del estado en cada request
// solo para verificar el flag `inactive`. Cachea por (usuario, liga, exp del
// token) durante 60 segundos. El TTL bajo garantiza detección rápida de
// desactivación (peor caso: 60 s de retraso).
// ============================================================================
const _blockedCache = new Map();   // key → { blocked, at }
const BLOCKED_TTL_MS = 60 * 1000;

async function blockedUserCached(session, ligaId){
  if(!session) return null;
  const lid = ligaId || LIGA_DEFAULT;
  const key = session.u + '|' + lid + '|' + session.exp;
  const hit = _blockedCache.get(key);
  if(hit && (Date.now() - hit.at) < BLOCKED_TTL_MS) return hit.blocked;
  let blocked = null;
  try {
    const state = await readState(lid);
    if(state) blocked = blockedUser(state, session);
  } catch(_){ /* si falla la lectura, no bloqueamos (mismo criterio que rateLimitCheck) */ }
  _blockedCache.set(key, { blocked, at: Date.now() });
  // Limpieza best-effort del cache (evitar leak de memoria en instancias long-lived)
  if(_blockedCache.size > 500){
    for(const [k, v] of _blockedCache){
      if((Date.now() - v.at) > BLOCKED_TTL_MS) _blockedCache.delete(k);
    }
  }
  return blocked;
}

// =====================================================================
// ÍNDICE DE LIGAS (tabla `liga_index`)
// La lista de ligas: cuál está activa, cuáles son pasadas. Alimenta el
// desplegable público de ligas pasadas.
// =====================================================================

// Lee el índice ordenado. Público en lectura (no expone datos sensibles).
async function readLigaIndex(){
  const r = await fetch(SUPA_URL + '/rest/v1/liga_index?select=id,nombre,estado,orden&order=orden.asc', {
    headers: supaHeaders()
  });
  if(!r.ok) throw new Error('Supabase liga_index ' + r.status);
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

// Crea o actualiza una entrada del índice (al crear/cerrar/reabrir una liga).
async function upsertLigaIndex(entry){
  if(!entry || !ligaIdOK(entry.id) || !entry.nombre) throw new Error('entrada de índice inválida');
  const row = {
    id: entry.id,
    nombre: entry.nombre,
    estado: (entry.estado === 'finalizada' ? 'finalizada' : 'activa'),
    orden: (typeof entry.orden === 'number' ? entry.orden : 0)
  };
  const r = await fetch(SUPA_URL + '/rest/v1/liga_index', {
    method: 'POST',
    headers: supaHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    }),
    body: JSON.stringify(row)
  });
  if(!r.ok) throw new Error('Supabase upsert liga_index ' + r.status + ' ' + (await r.text()));
}

// Cambia SOLO el estado de una liga en el índice ('activa' | 'finalizada').
// Para cerrar/reabrir sin reescribir el resto de la entrada.
async function setEstadoLiga(ligaId, estado){
  if(!ligaIdOK(ligaId)) throw new Error('ligaId inválido');
  const est = (estado === 'finalizada' ? 'finalizada' : 'activa');
  const r = await fetch(SUPA_URL + '/rest/v1/liga_index?id=eq.' + encodeURIComponent(ligaId), {
    method: 'PATCH',
    headers: supaHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    }),
    body: JSON.stringify({ estado: est })
  });
  if(!r.ok) throw new Error('Supabase setEstadoLiga ' + r.status + ' ' + (await r.text()));
}

// Cambia solo el nombre visible de una liga en el índice (el id no se toca).
async function renombrarLigaIndex(ligaId, nombre){
  if(!ligaIdOK(ligaId)) throw new Error('ligaId inválido');
  if(!nombre || !String(nombre).trim()) throw new Error('nombre vacío');
  const r = await fetch(SUPA_URL + '/rest/v1/liga_index?id=eq.' + encodeURIComponent(ligaId), {
    method: 'PATCH',
    headers: supaHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    }),
    body: JSON.stringify({ nombre: String(nombre).trim() })
  });
  if(!r.ok) throw new Error('Supabase renombrarLigaIndex ' + r.status + ' ' + (await r.text()));
}

// Borra una liga por completo: su estado y su entrada del índice. Los jugadores
// del catálogo NO se tocan (siguen existiendo para otras ligas).
async function borrarLiga(ligaId){
  if(!ligaIdOK(ligaId)) throw new Error('ligaId inválido');
  // Primero el estado, después el índice. Si el primero falla, no seguimos.
  const r1 = await fetch(SUPA_URL + '/rest/v1/liga_state?id=eq.' + encodeURIComponent(ligaId), {
    method: 'DELETE', headers: supaHeaders({ Prefer: 'return=minimal' })
  });
  if(!r1.ok) throw new Error('Supabase borrar estado ' + r1.status);
  const r2 = await fetch(SUPA_URL + '/rest/v1/liga_index?id=eq.' + encodeURIComponent(ligaId), {
    method: 'DELETE', headers: supaHeaders({ Prefer: 'return=minimal' })
  });
  if(!r2.ok) throw new Error('Supabase borrar índice ' + r2.status);
}

module.exports = {
  principalKey, defaultStored, readAccount, securityFor, makeSession, hashV1, hashV2, POR_DEFECTO_V2, signToken, verifyToken, auth, isAdminRole, sesionEsAdmin, puedeGestionarAdmins, filterForSession, filterPublicState, renewIfStale, blockedUser, blockedUserCached,
  readState, writeState, rpc, envOK, SESSION_MIN, SUPER_HASH,
  // Rate limiting compartido, audit log, helpers de request:
  rateLimitCheck, rateLimitFail, rateLimitClear, logAudit, clientIP,
  // Acceso directo a Supabase (para endpoints que necesitan queries custom):
  SUPA_URL, supaHeaders,
  // Sistema unificado (Fase 1):
  LIGA_DEFAULT, ligaIdOK,
  readCatalogo, buscarJugadorPorEmail, upsertJugador, borrarJugador, borrarPasskeysDeUsuario,
  readLigaIndex, upsertLigaIndex, setEstadoLiga, renombrarLigaIndex, borrarLiga,
  // Mensajería (tabla aparte, ver comentario arriba de insertarMensaje):
  insertarMensaje, leerMensajes, leerMensajesDesde
};
