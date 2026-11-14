'use strict';
// Append-only result import. Private server module; never accepts a league snapshot.
// Uses the same authorization, score rules and atomic version check as /api/save.
const crypto=require('node:crypto');
const lib=require('./_lib');
const {AppError,validateMatch,protectState}=require('./_validation');
const policy=require('../public/result-policy');
const score=require('../public/score-rules');
const destinations=require('../public/destinos-auto');
const MAX_ROWS=1000,MAX_BYTES=1024*1024;
const FIELDS=['cycle','group','a','b','score','club','date','type'];
const fail=(status,code,message)=>{throw new AppError(status,code,message);};
const norm=v=>String(v??'').normalize('NFC').trim();
const folded=v=>norm(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
function integer(v){const s=norm(v);return /^[1-9]\d*$/.test(s)&&Number.isSafeInteger(Number(s))?Number(s):null;}
function dateISO(v){
 const s=norm(v);let m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s),value=s;
 if(!m){m=/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(s);if(!m)return null;value=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');}
 const d=new Date(value+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value?value:null;
}
function parseScore(value){
 const s=norm(value);if(!s)return null;
 const tokens=s.split(/[\s,;]+/);if(tokens.length<2||tokens.length>3)return null;
 const sets=[];for(const token of tokens){const m=/^(\d{1,2})[-–—:](\d{1,2})$/.exec(token);if(!m)return null;sets.push([Number(m[1]),Number(m[2])]);}
 return sets;
}
function key(c,g,a,b){return JSON.stringify([c,g,...[a,b].sort()]);}
function normalizedRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>MAX_ROWS)fail(400,'IMPORT_ROW_LIMIT','Importá entre 1 y '+MAX_ROWS+' filas por archivo.');
 if(Buffer.byteLength(JSON.stringify(rows),'utf8')>MAX_BYTES)fail(413,'IMPORT_TOO_LARGE','El contenido supera 1 MB. Dividí la importación en archivos más pequeños.');
 const ids=new Set();return rows.map((r,index)=>{
  if(!r||typeof r!=='object'||Array.isArray(r))fail(400,'IMPORT_FORMAT','Hay una fila con formato inválido.');
  const rowId=norm(r.rowId||String(index+2));
  if(!/^[a-zA-Z0-9_-]{1,40}$/.test(rowId)||ids.has(rowId))fail(400,'IMPORT_ROW_ID','Hay referencias de fila repetidas o inválidas.');ids.add(rowId);
  const out={rowId,line:Number.isSafeInteger(r.line)&&r.line>0?r.line:index+2,excluded:r.excluded===true};
  for(const field of FIELDS){if(r[field]!=null&&!['string','number'].includes(typeof r[field]))fail(400,'IMPORT_FORMAT','La fila '+out.line+' tiene un campo no válido.');out[field]=norm(r[field]);if(out[field].length>10000)fail(400,'IMPORT_CELL_LIMIT','La fila '+out.line+' tiene un campo demasiado largo (máximo 10.000 caracteres).');}
  return out;
 });
}
function checkRows(rows,state,actor){
 const existing=new Map();for(const m of state.matches||[]){if(!m?.po)existing.set(key(m.cycle,m.g,m.aName,m.bName),m);}
 const result=rows.map(row=>{
  const item={rowId:row.rowId,line:row.line,row:{...row},status:'invalid',code:'',reason:''};
  const invalid=(code,reason)=>Object.assign(item,{status:'invalid',code,reason});
  if(row.excluded)return Object.assign(item,{status:'excluded',code:'EXCLUDED',reason:'Excluida por el administrador. No se guardará.'});
  if(FIELDS.some(field=>row[field].length>300))return invalid('CELL_LENGTH','Hay un campo con más de 300 caracteres. Corregí la fila antes de guardar.');
  const c=integer(row.cycle),g=integer(row.group),a=row.a,b=row.b;
  if(!c)return invalid('CYCLE','El ciclo debe ser un número entero positivo.');
  if(!g)return invalid('GROUP','El grupo debe ser un número entero positivo.');
  if(!a||!b)return invalid('PLAYERS','Falta seleccionar uno o ambos jugadores.');
  if(a===b)return invalid('SAME_PLAYER','Jugador A y Jugador B deben ser diferentes.');
  item.key=key(c,g,a,b);
  const prior=existing.get(item.key);
  // Existing entries are skipped even if their cycle is closed or the supplied score is wrong.
  if(prior)return Object.assign(item,{status:'omitted',code:'EXISTING',reason:'El partido ya está cargado ('+prior.status+'). Se conserva sin cambios.',existingId:prior.id});
  const cycle=state.cycles?.[c-1],group=cycle?.groups?.[g-1];
  if(!cycle||cycle.n!==c)return invalid('CYCLE','El ciclo '+c+' no existe.');
  if(!group)return invalid('GROUP','El grupo '+g+' no existe en el ciclo '+c+'.');
  if(!policy.phaseOpen(state,{cycle:c,g,po:false}))return invalid('STAGE_CLOSED','El ciclo '+c+' no está abierto para nuevos resultados. No se reabre desde la importación.');
  for(const name of [a,b])if(!Object.prototype.hasOwnProperty.call(state.users||{},name)||!(group.players||[]).includes(name))return invalid('PLAYER_GROUP','“'+name+'” no pertenece al grupo '+g+' del ciclo '+c+'. Elegí su nombre exacto.');
  if(row.type&&!['normal','jugado','played','partido jugado'].includes(folded(row.type)))return invalid('SPECIAL_RESULT','W.O., retiro y lesión se cargan en Cargar resultado, con sus opciones específicas. Excluí esta fila o elegí “Partido jugado” únicamente si corresponde.');
  const sets=parseScore(row.score);
  if(!sets||!score.validMatch(sets).ok)return invalid('SCORE','Marcador inválido. Usá, por ejemplo, 6-3 6-4 o 6-3 4-6 1-0; no se inventan sets.');
  const choices=(state.CLUBS||[]).filter(x=>folded(x.name)===folded(row.club));
  if(choices.length!==1)return invalid('CLUB','Seleccioná un club configurado en esta liga. No se asigna uno automáticamente.');
  const date=dateISO(row.date);if(!date)return invalid('DATE','Falta una fecha válida. Usá DD/MM/AAAA o AAAA-MM-DD; no se sustituye por hoy.');
  const match={id:1,cycle:c,g,aName:a,bName:b,sets,club:choices[0].name,date,status:'confirmed',locked:true,reporter:actor,vBy:actor};
  try{validateMatch(match,state,true);}catch(e){return invalid(e.code||'INVALID_RESULT',e.message);}
  return Object.assign(item,{status:'valid',code:'VALID',reason:'Nuevo resultado válido, todavía sin guardar.',match});
 });
 const groups=new Map();for(const item of result){if(item.status!=='valid')continue;if(!groups.has(item.key))groups.set(item.key,[]);groups.get(item.key).push(item);}
 for(const items of groups.values())if(items.length>1){
  const signature=item=>JSON.stringify({sets:item.match.aName<item.match.bName?item.match.sets:item.match.sets.map(([a,b])=>[b,a]),club:item.match.club,date:item.match.date});
  if(new Set(items.map(signature)).size>1){for(const item of items)Object.assign(item,{status:'invalid',code:'FILE_CONFLICT',reason:'Hay filas del archivo con datos distintos para este mismo cruce. Corregilas para que coincidan o excluí las incorrectas antes de guardar.'});}
  else for(const item of items.slice(1))Object.assign(item,{status:'omitted',code:'FILE_DUPLICATE',reason:'Repetido dentro del archivo. Solo se tomará la primera fila válida ('+items[0].line+').'});
 }
 const counts={total:result.length,valid:0,invalid:0,omitted:0,excluded:0,saved:0};for(const item of result)counts[item.status]++;
 return {rows:result,counts};
}
function digest(rows,state,session,ligaId){
 return crypto.createHmac('sha256',process.env.SESSION_SECRET).update(JSON.stringify(['results-import-v1',ligaId,session.u,session.pk||'',state._v,rows])).digest('hex');
}
function publicReview(review){return {counts:review.counts,rows:review.rows.map(({match,key,...row})=>row)};}
function options(state){return {cycles:state.cycles.map(c=>({n:c.n,status:c.status,groups:(c.groups||[]).map((g,i)=>({id:i+1,players:g.players||[]}))})),clubs:(state.CLUBS||[]).map(c=>c.name)};}
async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.',code:'METHOD_NOT_ALLOWED'});
 if(!lib.envOK(res))return;
 const session=await lib.auth(req);if(!session)return res.status(401).json({error:'La sesión venció. Volvé a entrar antes de importar.',code:'SESSION_EXPIRED'});
 const body=req.body||{},mode=body.mode;
 if(!['preview','commit'].includes(mode))fail(400,'IMPORT_MODE','Elegí revisar o guardar la importación.');
 const ligaId=lib.resolveLigaId(body.ligaId);
 const current=await lib.readState(ligaId);
 if(!current)fail(404,'LEAGUE_NOT_FOUND','La liga no está disponible.');
 const blocked=lib.blockedUser(current,session);if(blocked)fail(403,'FORBIDDEN',blocked);
 if(!lib.sesionEsAdmin(session,current.users))fail(403,'FORBIDDEN','Solo un administrador puede importar resultados.');
 const index=await lib.readLigaIndex(),league=index.find(x=>x.id===ligaId);
 if(!league||league.estado!=='activa')fail(403,'LEAGUE_READ_ONLY','Esta liga no está abierta. No se importó ningún partido.');
 const rows=normalizedRows(body.rows);
 const review=checkRows(rows,current,session.u),version=current._v||0;
 if(mode==='preview')return res.status(200).json({ok:true,mode,version,digest:digest(rows,current,session,ligaId),...publicReview(review),options:options(current)});
 if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion!==version)fail(409,'IMPORT_CONFLICT','La liga cambió desde la revisión. Revisá de nuevo: los partidos que otra persona haya cargado se omitirán.');
 if(typeof body.digest!=='string'||body.digest!==digest(rows,current,session,ligaId))fail(409,'IMPORT_REVIEW_REQUIRED','Cambiaste datos o falta la revisión. Volvé a validar antes de guardar.');
 const accepted=review.rows.filter(r=>r.status==='valid');
 if(!accepted.length)return res.status(200).json({ok:true,mode,version,wrote:false,...publicReview(review),state:lib.filterForSession(structuredClone(current),session)});
 const incoming=structuredClone(current);
 let next=Math.max(1,Number.isSafeInteger(current.matchId)?current.matchId:1);for(const m of current.matches||[])if(Number.isSafeInteger(m.id))next=Math.max(next,m.id+1);
 if(!Number.isSafeInteger(next+accepted.length))fail(400,'IMPORT_ID_LIMIT','No se pueden asignar identificadores seguros a estos partidos.');
 for(const item of accepted){item.match.id=next++;incoming.matches.push(item.match);item.savedId=item.match.id;}
 incoming.matchId=next;
 incoming.LOG=Array.isArray(incoming.LOG)?incoming.LOG:[];
 incoming.LOG.unshift({ts:new Date().toISOString(),who:current.users[session.u]?.name||session.u,role:current.users[session.u]?.role||'admin',action:'Liga: importación de resultados nuevos',detail:{importados:accepted.length,invalidos:review.counts.invalid,omitidos:review.counts.omitted,excluidos:review.counts.excluded,reemplazados:0}});
 incoming.LOG=incoming.LOG.slice(0,500);
 // Server validation is not weakened to support the import. Historical entries stay identical.
 protectState(current,incoming,session,true,lib.puedeGestionarAdmins(session));
 destinations.reconcile(incoming,current);
 if(Buffer.byteLength(JSON.stringify(incoming),'utf8')>8*1024*1024)fail(413,'STATE_TOO_LARGE','El estado de la liga supera el límite de 8 MB. No se guardó esta importación.');
 const storedVersion=await lib.writeState(ligaId,incoming,{expectedVersion:version});
 review.counts.saved=accepted.length;
 for(const item of accepted){item.status='saved';item.reason='Nuevo resultado guardado y validado por el servidor.';}
 return res.status(200).json({ok:true,mode,wrote:true,version:storedVersion,...publicReview(review),state:lib.filterForSession(structuredClone(incoming),session),token:lib.renewIfStale(session)||undefined});
}
module.exports={handler,normalizedRows,checkRows,parseScore,dateISO,integer,MAX_ROWS};
