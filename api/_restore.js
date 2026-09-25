'use strict';
// Restore is not result entry. Historical anomalies are reported, never rewritten.
const lib=require('./_lib'),O=require('./_operations');
const score=require('../public/score-rules');
const security=['pass','role','isAdmin','jugadorId','_credentialId'];
const transient=['password','pass_hash','identityRef','passwordDefault','key','historialId','historialNombre','perfilAlternativas','perfilUnificado'];
const nameOK=n=>typeof n==='string'&&n.trim()&&n.length<=120&&!/[<>"`\\]/.test(n)&&!['__proto__','constructor','prototype'].includes(n);
const empty=v=>v===undefined||v===null||v==='';
function inspectArchive(raw){
 O.safeTree(raw);
 require('./_validation').validateRuleSections(raw?.REGLAMENTO_SECCIONES);
 if(!O.object(raw)||!O.object(raw.users)||!Array.isArray(raw.cycles)||!raw.cycles.length||!Array.isArray(raw.matches))throw new O.AppError(400,'INVALID_BACKUP','El archivo no contiene un estado completo de liga.');
 if(Buffer.byteLength(JSON.stringify(raw))>3*1024*1024)throw new O.AppError(413,'BACKUP_TOO_LARGE','El contenido técnico del backup supera 3 MB. No se aplicó nada.');
 if(raw.cycles.length>30||Object.keys(raw.users).length>2500||raw.matches.length>25000)throw new O.AppError(413,'BACKUP_TOO_LARGE','El backup supera los límites de esta restauración.');
 const plain=v=>typeof v==='string'&&v.length<=1000&&!/[<>`\\\u0000-\u001f]/.test(v);
 const hex=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
 for(const k of ['LEAGUE_NAME','LEAGUE_SUBTITLE','LOGIN_TITLE'])if(raw[k]!=null&&!plain(raw[k]))throw new O.AppError(400,'INVALID_BACKUP','Texto de presentación inválido en '+k+'.');
 for(const k of ['LEAGUE_COLOR_PRI','LEAGUE_COLOR_ACC','LEAGUE_COLOR_HL','COLOR_DISPUTA'])if(raw[k]!=null&&raw[k]!==''&&!hex(raw[k]))throw new O.AppError(400,'INVALID_BACKUP','Color inválido en '+k+'.');
 if(raw.LEAGUE_TEXT_COLORS!=null&&(!O.object(raw.LEAGUE_TEXT_COLORS)||Object.entries(raw.LEAGUE_TEXT_COLORS).some(([k,v])=>!['light','dark','header'].includes(k)||!hex(v))))throw new O.AppError(400,'INVALID_BACKUP','Colores de texto inválidos.');
 if(raw.CLUBS!=null&&(!Array.isArray(raw.CLUBS)||raw.CLUBS.some(c=>!O.object(c)||!plain(c.name)||c.id!=null&&!plain(c.id)||c.bg!=null&&!hex(c.bg))))throw new O.AppError(400,'INVALID_BACKUP','Configuración de clubes inválida.');
 if(raw.LOGIN_HEADER!=null){
  const h=raw.LOGIN_HEADER;
  if(!O.object(h)||['color','textColor','colorDark','textColorDark'].some(k=>h[k]!=null&&h[k]!==''&&!hex(h[k])))throw new O.AppError(400,'INVALID_BACKUP','Cabecera de acceso inválida.');
  if(h.links!=null&&(!Array.isArray(h.links)||h.links.some(l=>{
   if(!O.object(l)||!plain(l.text)||typeof l.url!=='string'||l.url.length>2000)return true;
   try{const url=new URL(l.url);return !['https:','http:'].includes(url.protocol)||!!url.username||!!url.password;}catch(_){return true;}
  })))throw new O.AppError(400,'INVALID_BACKUP','Enlaces de cabecera inválidos. Solo se admiten HTTP o HTTPS sin credenciales.');
 }
 const warnings=[],names=new Set(Object.keys(raw.users)),ids=new Set();
 const warn=(code,text)=>warnings.push({code,text});
 for(const [name,u] of Object.entries(raw.users)){
  if(!nameOK(name)||!O.object(u))throw new O.AppError(400,'INVALID_BACKUP','Nombre o perfil de jugador inválido.');
  if(u.name!=null&&u.name!==''&&!nameOK(u.name))throw new O.AppError(400,'INVALID_BACKUP','Nombre visible inválido en '+name+'.');
  if(O.own(u,'injured')&&typeof u.injured!=='boolean')throw new O.AppError(400,'INVALID_BACKUP','Estado de lesión inválido en '+name+'.');
  for(const f of ['email','tel'])if(u[f]!=null&&(typeof u[f]!=='string'||/[<>"`\\]/.test(u[f])||u[f].length>250))throw new O.AppError(400,'INVALID_BACKUP','Dato de contacto inválido en '+name+'.');
 }
 for(let i=0;i<raw.cycles.length;i++){
  const c=raw.cycles[i];if(!O.object(c)||c.n!==i+1||!['active','finished','locked'].includes(c.status)||c.groups!=null&&!Array.isArray(c.groups))throw new O.AppError(400,'INVALID_BACKUP','Estructura de ciclos inválida.');
  const seen=new Map();
  for(const [g,group]of (c.groups||[]).entries()){
   if(!O.object(group)||!Array.isArray(group.players))throw new O.AppError(400,'INVALID_BACKUP','Grupo inválido.');
   for(const name of group.players){
    if(!names.has(name))throw new O.AppError(400,'INVALID_BACKUP','El grupo contiene un jugador sin ficha: '+String(name).slice(0,120));
    if(seen.has(name))warn('DUPLICATE_GROUP',name+' figura en los grupos '+seen.get(name)+' y '+(g+1)+' del ciclo '+c.n+'. Se conservan ambos registros.');
    seen.set(name,g+1);
   }
  }
 }
 if(!Number.isSafeInteger(raw.activeN)||raw.activeN<1||raw.activeN>raw.cycles.length)throw new O.AppError(400,'INVALID_BACKUP','Ciclo activo inválido.');
 if(!O.object(raw.playoff))throw new O.AppError(400,'INVALID_BACKUP','Falta la estructura de playoffs.');
 let missingDate=0,unusualScore=0,missingClub=0,missingSlot=0,groups=0,playoffs=0,unusualGroup=0;
 for(const m of raw.matches){
  if(!O.object(m)||!Number.isSafeInteger(m.id)||m.id<0||ids.has(m.id))throw new O.AppError(400,'DUPLICATE_MATCH_ID','Hay identificadores de partido inválidos o repetidos dentro de esta liga.');ids.add(m.id);
  if(('npReason' in m||'injurySide' in m)&&(m.npReason!=='injury'||![0,1].includes(m.injurySide)||m.np!==true||m.po||m.status!=='confirmed'||m.wo||m.winner||m.retiroDe||m.sets?.length))throw new O.AppError(400,'INVALID_BACKUP','Ausencia por lesión inválida en el partido '+m.id+'.');
  const ns=m.po?m.poNames:[m.aName,m.bName];
  if(!Array.isArray(ns)||ns.length!==2||ns[0]===ns[1]||ns.some(n=>!names.has(n)))throw new O.AppError(400,'INVALID_BACKUP','Participantes inválidos en el partido '+m.id+'.');
  if(!['confirmed','pending','disputed'].includes(m.status)||!Array.isArray(m.sets)||m.sets.length>5||m.sets.some(s=>!Array.isArray(s)||s.length!==2||s.some(x=>!Number.isSafeInteger(x)||x<0||x>199)))throw new O.AppError(400,'INVALID_BACKUP','Marcador o estado estructuralmente inválido en el partido '+m.id+'.');
  if(m.po){playoffs++;if(![m.ti,m.ri,m.mi].every(n=>Number.isSafeInteger(n)&&n>=0))missingSlot++;}
  else {groups++;const c=raw.cycles[m.cycle-1],g=c?.groups?.[m.g-1];if(!c||!g||!ns.every(n=>g.players.includes(n)))unusualGroup++;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(m.date||'')||!Number.isFinite(Date.parse(m.date))||new Date(m.date).toISOString().slice(0,10)!==m.date)missingDate++;
  if(!raw.CLUBS?.some(c=>c.name===m.club))missingClub++;
  if(!m.np&&!m.wo&&!score.validMatch(m.sets).ok)unusualScore++;
 }
 if(missingDate)warn('LEGACY_DATE',missingDate+' partidos sin fecha válida. Se conservan sin inventar fechas.');
 if(missingSlot)warn('LEGACY_PLAYOFF',missingSlot+' partidos de playoffs sin coordenadas completas. Se conservan.');
 if(unusualGroup)warn('LEGACY_GROUP',unusualGroup+' partidos con grupo histórico no coincidente. Se conservan las referencias del archivo.');
 if(missingClub)warn('LEGACY_CLUB',missingClub+' partidos con club histórico no listado. Se conserva el nombre original.');
 if(unusualScore)warn('LEGACY_SCORE',unusualScore+' marcadores históricos no estándar. Se conservan para revisión; no se les inventa un ganador.');
 if(!Array.isArray(raw.ALLNAMES)||new Set(raw.ALLNAMES).size!==raw.ALLNAMES.length||raw.ALLNAMES.some(n=>!names.has(n)||['admin','superadmin'].includes(n)))throw new O.AppError(400,'INVALID_BACKUP','El listado de jugadores tiene referencias inválidas.');
 return {warnings,summary:{players:raw.ALLNAMES.length,cycles:raw.cycles.length,matches:raw.matches.length,groups,playoffs}};
}
function planRestore(current,raw,{ligaId,source,session,reg}){
 const check=inspectArchive(raw),next=O.clone(raw),before=current.users||{};
 // Security only comes from the current database. A spreadsheet cannot assign roles,
 // attach a live account by ID, replace passwords, or resurrect an inactive admin.
 let newPlayers=0,defaultPass;const preserved=[];
 for(const [name,u]of Object.entries(next.users)){
  for(const k of transient)delete u[k];
  for(const k of security)delete u[k];
  if(before[name]){
   for(const k of security)if(O.own(before[name],k))u[k]=O.clone(before[name][k]);
   u.inactive=!!before[name].inactive;
   if(before[name].historialId)u.historialId=before[name].historialId;
   for(const k of ['email','tel','nombre','apellido'])if(empty(u[k])&&!empty(before[name][k]))u[k]=before[name][k];
   if(lib.isAdminRole(before[name].role)||before[name].isAdmin){u.inactive=!!before[name].inactive;preserved.push(name);}
  }else{
   if(['admin','superadmin'].includes(name)){delete next.users[name];continue;}
   u.role='player';u.pass=defaultPass||(defaultPass=lib.hashV2('tenis'));
   u._credentialId='restore-'+O.digest({ligaId,name,version:current._v||0}).slice(0,32);newPlayers++;
  }
  const key=JSON.stringify(['league',ligaId,name]),gid=u.jugadorId&&JSON.stringify(['catalog',u.jugadorId]);
  const linked=u.historialId||(gid&&reg?.data?.links?.[gid]);
  if(linked)u.historialId=linked;
  if(u.historialId)u.historialNombre=reg?.data?.profiles?.[u.historialId]?.name||before[name]?.historialNombre||name;
 }
 for(const [name,u]of Object.entries(before))if(lib.isAdminRole(u.role)||u.isAdmin){
  if(!next.users[name])next.users[name]=O.clone(u);
 }
 // A verified superadmin may restore another league even if it lacks that account.
 // Do not overwrite a same-named account belonging to a different principal.
 if(source?.users?.[session.u]?.role==='superadmin'&&!next.users[session.u])next.users[session.u]=O.clone(source.users[session.u]);
 // Preserve admission requests; accepting/rejecting them is not part of a restore.
 next.JOIN_REQUESTS=O.clone(current.JOIN_REQUESTS||[]);
 // Profile audit alternatives stay on the server registry, never trusted from the file.
 next._v=current._v||0;
 next.matchId=Math.max(Number.isSafeInteger(next.matchId)?next.matchId:1,1,...next.matches.map(m=>m.id+1));
 for(const m of next.matches)for(const k of Object.keys(m))if(k.startsWith('_mh'))delete m[k];
 // Preserve fields unknown to the legacy serializer without importing security internals.
 for(const key of Object.keys(next))if(key.startsWith('_')&&!['_v'].includes(key))delete next[key];
 check.summary.newPlayers=newPlayers;check.summary.preservedAdmins=preserved;
 check.warnings.push({code:'ACCESS_PRESERVED',text:'Se conservan los accesos y permisos vigentes. Los roles, contraseñas e identificadores de cuenta del archivo no se importan.'});
 if(newPlayers)check.warnings.push({code:'NEW_PLAYERS',text:newPlayers+' jugadores nuevos tendrán un acceso independiente con la clave inicial de jugador y cambio obligatorio al entrar. Vincular el historial no comparte contraseñas.'});
 return {state:next,...check};
}
module.exports={inspectArchive,planRestore,security,transient};
