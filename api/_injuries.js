'use strict';
// Administrative absence, NOT a walkover or a played match. One versioned write.
const lib=require('./_lib');
const {AppError}=require('./_validation');
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const fail=(status,code,message)=>{throw new AppError(status,code,message);};
const isInjury=m=>!!(m&&!m.po&&m.np===true&&m.npReason==='injury'&&[0,1].includes(m.injurySide));
const injuredName=m=>isInjury(m)?[m.aName,m.bName][m.injurySide]:null;
function plan(state,session,body){
 if(!state||!session||!lib.sesionEsAdmin(session,state.users)||lib.blockedUser(state,session))fail(403,'INJURY_FORBIDDEN','No tenés permiso para gestionar lesiones en esta liga.');
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['ligaId','expectedVersion','player','cycle','injured','opponents'].includes(k)))fail(400,'INJURY_REQUEST','Solicitud de lesión inválida.');
 if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion!==Number(state._v||0))fail(409,'INJURY_CONFLICT','Los datos cambiaron. Recargá antes de confirmar las lesiones.');
 const name=body.player,u=state.users?.[name];
 if(typeof name!=='string'||name.length>120||!own(state.users,name)||!u||['admin','superadmin'].includes(name)||!state.ALLNAMES?.includes(name))fail(400,'INJURY_PLAYER','Seleccioná un jugador de esta liga.');
 if(typeof body.injured!=='boolean'||!Array.isArray(body.opponents)||body.opponents.length>300||body.opponents.some(n=>typeof n!=='string'||n.length>120)||new Set(body.opponents).size!==body.opponents.length)fail(400,'INJURY_REQUEST','Revisá el estado y los rivales seleccionados.');
 const wanted=new Set(body.opponents),next=structuredClone(state),added=[],removed=[];
 if(body.cycle!==null){
  const c=state.cycles?.find(c=>c.n===body.cycle);
  if(!Number.isSafeInteger(body.cycle)||!c||!['active','finished'].includes(c.status)||!Array.isArray(c.groups))fail(400,'INJURY_CYCLE','Elegí un ciclo con grupos ya definidos.');
  const memberships=c.groups.map((g,i)=>g?.players?.includes(name)?i+1:0).filter(Boolean);
  if(memberships.length!==1)fail(400,'INJURY_GROUP','El jugador debe pertenecer a un único grupo en ese ciclo.');
  const g=memberships[0],players=c.groups[g-1].players;
  if([...wanted].some(n=>n===name||!players.includes(n)||!own(state.users,n)))fail(400,'INJURY_OPPONENT','Los rivales deben pertenecer al mismo grupo y ciclo.');
  const candidates=(state.matches||[]).filter(m=>!m.po&&m.cycle===c.n&&m.g===g&&[m.aName,m.bName].includes(name));
  const existing=op=>candidates.filter(m=>[m.aName,m.bName].includes(op));
  for(const op of wanted){
   const rows=existing(op);
   if(rows.length>1||rows.length===1&&(!isInjury(rows[0])||injuredName(rows[0])!==name))fail(409,'INJURY_RECORDED','Un cruce seleccionado ya tiene un registro. No se reemplazan resultados, W.O. ni lesiones ajenas.');
   if(!rows.length){
    if(name===session.u||op===session.u)fail(403,'INJURY_OWN_MATCH','Otro administrador debe registrar una ausencia en un partido que jugás vos.');
    added.push(op);
   }
  }
  for(const m of candidates)if(isInjury(m)&&injuredName(m)===name){
   const op=[m.aName,m.bName].find(n=>n!==name);
   if(!wanted.has(op)){
    if([m.aName,m.bName].includes(session.u))fail(403,'INJURY_OWN_MATCH','Otro administrador debe quitar la ausencia de tu propio partido.');
    removed.push(m.id);
   }
  }
  next.matches=next.matches.filter(m=>!removed.includes(m.id));
  let id=Math.max(1,Number.isSafeInteger(state.matchId)?state.matchId:1,...state.matches.map(m=>m.id+1));
  if(!Number.isSafeInteger(id)||id+added.length>=Number.MAX_SAFE_INTEGER)fail(400,'INJURY_IDS','No se pueden asignar identificadores de partido.');
  for(const op of added)next.matches.push({id:id++,po:false,cycle:c.n,g,aName:name,bName:op,sets:[],np:true,npReason:'injury',injurySide:0,date:'',club:'',status:'confirmed',reporter:session.u,locked:true});
  next.matchId=id;
 }else if(wanted.size)fail(400,'INJURY_CYCLE','Seleccioná un ciclo para registrar rivales.');
 const flagChanged=!!u.injured!==body.injured;
 next.users[name].injured=body.injured;
 const changed=flagChanged||added.length>0||removed.length>0;
 if(changed){
  const now=new Date();next.LOG=Array.isArray(next.LOG)?next.LOG:[];
  next.LOG.unshift({ts:now.toISOString(),who:session.u,role:session.r,action:'Lesiones / Injuries',detail:{player:name,cycle:body.cycle,injured:body.injured,added:added.length,removed:removed.length}});next.LOG=next.LOG.slice(0,500);
 }
 return {next:changed?next:structuredClone(state),changed:!!changed,summary:{player:name,cycle:body.cycle,injured:body.injured,added:added.length,removed:removed.length}};
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
 try{
  if(req.method!=='POST')fail(405,'METHOD_NOT_ALLOWED','Método no permitido.');
  if(!lib.envOK(res))return;
  const session=await lib.auth(req);
  if(!session)fail(401,'UNAUTHENTICATED','La sesión venció. Volvé a ingresar.');
  const b=req.body;if(!b||!lib.ligaIdOK(b.ligaId))fail(400,'INJURY_LEAGUE','Seleccioná una liga válida.');
  const index=await lib.readLigaIndex(),entry=index.find(l=>l.id===b.ligaId);
  if(!entry||entry.estado!=='activa')fail(403,'INJURY_CLOSED','La liga está cerrada. Reabrila antes de corregir ausencias.');
  const state=await lib.readState(b.ligaId),p=plan(state,session,b);
  // Current account security is checked again before the write.
  const fresh=await lib.auth(req);if(!fresh)fail(401,'UNAUTHENTICATED','La sesión venció durante la operación.');
  if(p.changed){
   require('../public/destinos-auto').reconcile(p.next,state);
   await lib.writeState(b.ligaId,p.next,{expectedVersion:b.expectedVersion});
   await lib.logAudit(fresh.u,'injury.update',b.ligaId,p.summary,lib.clientIP(req));
  }
  return res.status(200).json({ok:true,changed:!!p.changed,version:p.next._v,summary:p.summary,state:lib.filterForSession(p.next,fresh)});
 }catch(e){return res.status(e.status||503).json({code:e.code||'INJURY_UNAVAILABLE',error:e.status?e.message:'No se pudo confirmar la operación. Recargá los datos antes de reintentar.'});}
}
module.exports={handler,plan,isInjury,injuredName};
