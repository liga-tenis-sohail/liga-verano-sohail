'use strict';
const {isDeepStrictEqual:equal}=require('node:util');
const crypto=require('node:crypto');
const score=require('../public/score-rules.js');
class AppError extends Error{
  constructor(status,code,message,extra){super(message);this.status=status;this.code=code;Object.assign(this,extra||{});}
}
const deny=msg=>{throw new AppError(403,'FORBIDDEN',msg);};
const bad=msg=>{throw new AppError(400,'INVALID_STATE',msg);};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
function identityRef(name,u){return crypto.createHmac('sha256',process.env.SESSION_SECRET||'').update('identity:'+name+':'+String(u.jugadorId||u._credentialId||'')).digest('base64url');}
function safeTree(value,depth=0){
  if(depth>55)bad('El estado contiene demasiados niveles.');
  if(value&&typeof value==='object')for(const key of Object.keys(value)){
    if(['__proto__','constructor','prototype'].includes(key))bad('Clave de objeto no permitida.');
    safeTree(value[key],depth+1);
  }
}
function sameOrEmpty(a,b){
  const empty=v=>v===undefined||v===null||v===''||v===false||(Array.isArray(v)&&!v.length)||(v&&typeof v==='object'&&!Object.keys(v).length);
  return equal(a,b)||(empty(a)&&empty(b));
}
function participants(m){return m.po?m.poNames:[m.aName,m.bName];}
function validateMatch(m,state,admin){
  if(!m||typeof m!=='object'||!Number.isSafeInteger(m.id)||m.id<0)bad('Identificador de partido inválido.');
  const names=participants(m);
  if(!Array.isArray(names)||names.length!==2||names.some(n=>typeof n!=='string'||!n)||names[0]===names[1])bad('El partido necesita dos jugadores distintos.');
  if(!['confirmed','pending','disputed'].includes(m.status))bad('Estado de partido inválido.');
  if(m.po){
    if(!['main','cons'].includes(m.which)||![m.ti,m.ri,m.mi].every(n=>Number.isSafeInteger(n)&&n>=0))bad('Ubicación de playoff inválida.');
    const tr=state.playoff&&state.playoff.tramos&&state.playoff.tramos[m.ti];
    const slot=tr&&tr[m.which]&&tr[m.which][m.ri]&&tr[m.which][m.ri][m.mi];
    // El admin puede estar reconstruyendo el cuadro. En su caso se comprueba identidad.
    if(!admin&&(!slot||!names.includes(slot.a)||!names.includes(slot.b)))deny('Los jugadores no corresponden a ese partido del cuadro.');
    if(!admin&&!(state.playoff&&state.playoff.started))deny('Los playoffs todavía no están abiertos.');
  }else{
    if(!Number.isSafeInteger(m.cycle)||!Number.isSafeInteger(m.g)||m.cycle<1||m.g<1)bad('Ciclo o grupo inválido.');
    const c=state.cycles[m.cycle-1],g=c&&c.groups&&c.groups[m.g-1];
    if(!g||!Array.isArray(g.players)||!names.every(n=>g.players.includes(n)))bad('Los jugadores no pertenecen a ese grupo.');
    if(!admin&&(m.cycle!==state.activeN||c.status!=='active'||(state.playoff&&state.playoff.started)))deny('Ese ciclo ya no permite cargar resultados.');
  }
  if(!names.every(n=>own(state.users,n)))bad('Jugador no encontrado.');
  if(!admin&&names.some(n=>state.users[n].inactive))deny('Un jugador inactivo no puede participar en una nueva carga.');
  if(!Array.isArray(m.sets))bad('Falta el marcador.');
  if(m.np){if(!admin||m.po||m.sets.length)bad('No jugado: solo el administrador y sin sets.');return;}
  if(typeof m.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||Number.isNaN(Date.parse(m.date))||new Date(m.date).toISOString().slice(0,10)!==m.date)bad('Fecha de partido inválida.');
  if(m.wo){
    if(!score.validRetirement(m.sets)||!names.includes(m.retiroDe)||m.winner!==names.find(n=>n!==m.retiroDe))bad('Retirada o W.O. inválido.');
  }else{
    if(!score.validMatch(m.sets).ok)bad('Marcador inválido. Revisá los sets.');
    if(m.po&&m.winner!==names[score.winnerIndex(m.sets)])bad('El ganador no coincide con el marcador.');
  }
  if((!m.wo||m.sets.length)&&(!Array.isArray(state.CLUBS)||!state.CLUBS.some(c=>c&&c.name===m.club)))bad('Seleccioná un club válido.');
}
function protectState(current,incoming,session,admin,manage){
  safeTree(incoming);
  if(!Array.isArray(incoming.cycles)||!Array.isArray(incoming.matches)||!incoming.users||Array.isArray(incoming.users))bad('Formato de estado inválido.');
  const curUsers=current.users||{}, inUsers=incoming.users;
  if(!admin){
    // Todo lo no permitido se rechaza o se restaura si es una proyección privada.
    for(const k of new Set([...Object.keys(current),...Object.keys(incoming)])){
      if(['_v','users','matches','matchId','LOG'].includes(k))continue;
      if(['JOIN_REQUESTS','playoff'].includes(k)){if(own(current,k))incoming[k]=structuredClone(current[k]);else delete incoming[k];continue;}
      if(!sameOrEmpty(incoming[k],current[k]))deny('Solo un administrador puede modificar la configuración de la liga.');
      if(own(current,k))incoming[k]=structuredClone(current[k]);else delete incoming[k];
    }
    if(!equal(Object.keys(curUsers).sort(),Object.keys(inUsers).sort()))deny('No tenés permiso para modificar los jugadores.');
    for(const n of Object.keys(curUsers)){
      const cu=curUsers[n],iu=inUsers[n];
      if(!iu||typeof iu!=='object')bad('Usuario inválido.');
      for(const k of Object.keys(iu)){
        if(['pass','passwordDefault','identityRef','key'].includes(k))continue;
        if((k==='email'||k==='tel')&&n!==session.u)continue;
        if(!sameOrEmpty(iu[k],cu[k]))deny('No tenés permiso para modificar ese perfil.');
      }
      inUsers[n]=structuredClone(cu);
    }
  }else{
    for(const n of Object.keys(inUsers)){
      if(!n.trim()||n.length>120||/[<>"`\\]/.test(n)||['__proto__','constructor','prototype'].includes(n))bad('Nombre de jugador inválido.');
      const u=inUsers[n];if(!u||typeof u!=='object'||Array.isArray(u))bad('Perfil inválido.');
      let source=curUsers[n];
      if(!source&&u.identityRef){
        const old=Object.keys(curUsers).find(k=>identityRef(k,curUsers[k])===u.identityRef);
        if(old&&!own(inUsers,old)&&!['admin','superadmin'].includes(old))source=curUsers[old];
      }
      if(source){
        u.pass=source.pass;
        // El vínculo global solo se cambia por las acciones específicas del servidor.
        if(u.jugadorId!==source.jugadorId)deny('El vínculo de identidad solo se modifica desde el catálogo.');
        if(source._credentialId)u._credentialId=source._credentialId;else delete u._credentialId;
        if(!manage&&((u.role||'player')!==(source.role||'player')||!!u.isAdmin!==!!source.isAdmin))deny('Solo el administrador original o el super administrador puede repartir permisos.');
      }else{
        if((u.role||'player')!=='player'||u.isAdmin)deny('No se crean cuentas administrativas desde este formulario.');
        if(u.jugadorId)deny('Incorporá los perfiles existentes desde el catálogo.');
        // Nunca aceptar una contraseña arbitraria ni un identificador de seguridad del cliente.
        u.pass=require('./_lib').hashV2('tenis');u._credentialId=crypto.randomUUID();
      }
      delete u.identityRef;delete u.passwordDefault;delete u.key;
    }
    for(const n of ['admin','superadmin']){
      if(curUsers[n]&&(!inUsers[n]||inUsers[n].role!==curUsers[n].role))deny('No se puede eliminar ni cambiar el rol de una cuenta del sistema.');
    }
    for(const [n,u] of Object.entries(inUsers)){
      if(!['player','admin','superadmin'].includes(u.role))bad('Rol inválido.');
      if(u.role==='superadmin'&&(!curUsers[n]||curUsers[n].role!=='superadmin'))deny('No se puede crear otro super administrador.');
    }
    if(!manage){
      for(const [n,u]of Object.entries(curUsers))if((u.role==='admin'||u.role==='superadmin'||u.isAdmin)&&!inUsers[n])deny('No podés eliminar a otro administrador.');
      for(const k of ['cycles','activeN','DESTINO','FECHAS','PO_FECHAS','ALLNAMES','PUNTOS'])if(!sameOrEmpty(incoming[k],current[k]))deny('La estructura solo la cambia el administrador original o el super administrador.');
    }
  }
  const pairKey=m=>{const ps=participants(m);return Array.isArray(ps)?(m.po?'po:'+m.ti+':'+m.which+':'+m.ri+':'+m.mi:'c:'+m.cycle+':'+m.g)+':'+JSON.stringify(ps.slice().sort()):null;};
  const old=new Map((current.matches||[]).map(m=>[m.id,m])), seen=new Set();
  const previousPairs=new Map(),nextPairs=new Map();
  for(const m of current.matches||[]){const k=pairKey(m);previousPairs.set(k,(previousPairs.get(k)||0)+1);}
  for(const m of incoming.matches){if(!m)bad('Partido vacío.');const k=pairKey(m);nextPairs.set(k,(nextPairs.get(k)||0)+1);}
  for(const [k,n] of nextPairs)if(k&&n>1&&n>(previousPairs.get(k)||1))bad('El partido se cargó más de una vez.');
  for(const m of incoming.matches){
    if(!m||seen.has(m.id))bad('Hay identificadores de partido duplicados.');seen.add(m.id);
    const before=old.get(m.id);
    if(equal(before,m))continue; // No reinterpreta ni descarta resultados históricos.
    const ps=participants(m);
    if(!admin){
      if(!Array.isArray(ps)||!ps.includes(session.u))deny('No podés cargar o modificar partidos ajenos.');
      if(before){
        if(!participants(before).includes(session.u)||!equal(participants(before),ps))deny('No podés sustituir los participantes de un partido.');
        if(before.status==='confirmed'||(before.status==='pending'&&m.status==='disputed')){
          const a={...before,status:0},b={...m,status:0};
          if(m.status!=='disputed'||!equal(a,b))deny('Un resultado confirmado solo puede disputarse.');
          continue;
        }
        if(before.status==='disputed'&&!equal(before,m))deny('El administrador debe resolver la disputa.');
      }
      if(m.status!=='pending'||m.locked||m.vBy||m.np)deny('Solo el administrador confirma resultados.');
      m.reporter=session.u;delete m.vBy;m.locked=false;
    }
    validateMatch(m,admin?incoming:current,admin);

  }
  if(!admin)for(const [id,m]of old)if(!seen.has(id)){
    if(!participants(m).includes(session.u)||m.status==='confirmed'||m.status==='disputed')deny('No podés eliminar ese partido.');
  }
  incoming.matchId=Math.max(Number.isSafeInteger(incoming.matchId)?incoming.matchId:0,...incoming.matches.map(m=>m.id+1),1);
  // El log que trae un jugador no es una fuente confiable de auditoría.
  if(!admin)incoming.LOG=current.LOG||[];
  return incoming;
}
module.exports={AppError,identityRef,protectState,validateMatch,safeTree,participants};
