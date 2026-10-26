/* Sohail v5.2 — shared, deterministic cycle closing rules. No network or DOM.
 * Zero-point decisions only reassign the destination slots already configured
 * for those tied players. Standings, positional points and rating are untouched.
 */
(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./score-rules'));
 else root.SohailCycleClose=factory(root.SohailScore);
})(typeof globalThis!=='undefined'?globalThis:this,function(Score){
 'use strict';
 const fail=(code,message)=>Object.assign(new Error(message),{status:400,code});
 const sorted=a=>a.slice().sort();
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function positionPoints(state,gid,pos){
  const scale=state.PUNTOS?.[gid];
  return scale?.[pos]!==undefined?scale[pos]:scale?.length?(scale[scale.length-1]||1):Math.max(1,5-pos);
 }
 function plan(state){
  const from=state.activeN,c=state.cycles?.[from-1],next=state.cycles?.[from];
  if(!c||c.n!==from||c.status!=='active'||!Array.isArray(c.groups)||state.playoff?.started)
   throw fail('CYCLE_NOT_OPEN','El ciclo ya no está abierto para cerrarlo.');
  if((state.matches||[]).some(m=>!m.po&&m.cycle===from&&m.status!=='confirmed'))
   throw fail('CYCLE_PENDING_RESULTS','Resolvé los resultados pendientes o en disputa antes de cerrar.');
  if(next&&(next.n!==from+1||next.status!=='locked'))
   throw fail('CYCLE_NEXT_NOT_LOCKED','El siguiente ciclo ya fue habilitado o no es válido.');
  const total=c.groups.length,entries=[],ties=[],seen=new Set();
  c.groups.forEach((g,idx)=>{
   const group=idx+1,stats=Score.standings(from,group,state.cycles,state.matches||[]),active=[];
   stats.forEach((s,pos)=>{
    if(state.users?.[s.name]?.inactive)return;
    if(!Object.prototype.hasOwnProperty.call(state.users||{},s.name)||seen.has(s.name))
     throw fail('CYCLE_INVALID_PLAYERS','Revisá los jugadores de los grupos antes de cerrar.');
    seen.add(s.name);
    const destination=state.DESTINO?.[group]?.[pos]||'G'+Math.min(group+1,total);
    if(!/^G[1-9]\d*$/.test(destination)||Number(destination.slice(1))>total)
     throw fail('DESTINATIONS_REVIEW','Revisá los destinos de ascenso y descenso antes de cerrar.');
    const row={group,name:s.name,position:pos,points:s.pts,played:s.g+s.p,destination,total:positionPoints(state,group,pos)+(pos===0?2:0)};
    active.push(row);entries.push(row);
   });
   const zero=active.filter(s=>s.points===0);
   if(next&&zero.length>1)ties.push({group,players:zero.map(s=>({...s})),slots:zero.map(s=>s.destination)});
  });
  return {from,to:next?.n||null,sourceVersion:state._v||0,total,entries,ties};
 }
 function assignments(plan,decision){
  if(!plan.ties.length){
   if(decision?.assignments?.length)throw fail('ZERO_TIE_INVALID','No hay un empate a cero que resolver.');
   return [];
  }
  if(!decision||decision.version!==1||decision.from!==plan.from||decision.to!==plan.to||
     decision.sourceVersion!==plan.sourceVersion||decision.accepted!==true||!Array.isArray(decision.assignments))
   throw fail('ZERO_TIE_REQUIRED','Elegí y confirmá los destinos de todos los jugadores empatados a 0 puntos antes de habilitar el siguiente ciclo.');
  const rows=decision.assignments,expected=plan.ties.flatMap(t=>t.players),out=[];
  if(rows.length!==expected.length)throw fail('ZERO_TIE_INVALID','Falta asignar un destino o hay jugadores repetidos.');
  const keys=new Set();
  for(const row of rows){
   if(!row||typeof row.name!=='string'||!Number.isSafeInteger(row.group)||typeof row.destination!=='string'||
      Object.keys(row).some(k=>!['name','group','destination'].includes(k)))throw fail('ZERO_TIE_INVALID','Asignación de destino inválida.');
   const key=JSON.stringify([row.group,row.name]);
   if(keys.has(key)||!expected.some(e=>e.group===row.group&&e.name===row.name))throw fail('ZERO_TIE_INVALID','La decisión incluye un jugador repetido o ajeno al empate.');
   keys.add(key);out.push({group:row.group,name:row.name,destination:row.destination});
  }
  for(const tie of plan.ties){
   if(!same(sorted(out.filter(r=>r.group===tie.group).map(r=>r.destination)),sorted(tie.slots)))
    throw fail('ZERO_TIE_CAPACITY','Repartí exactamente las plazas indicadas entre los jugadores empatados. No se puede cambiar la cantidad de ascensos o descensos desde esta revisión.');
  }
  return out.sort((a,b)=>a.group-b.group||a.name.localeCompare(b.name));
 }
 function nextGroups(p,decision){
  const chosen=assignments(p,decision),map=new Map(chosen.map(r=>[JSON.stringify([r.group,r.name]),r.destination]));
  const buckets=Array.from({length:p.total},()=>[]);
  for(const row of p.entries){
   const destination=map.get(JSON.stringify([row.group,row.name]))||row.destination;
   buckets[Number(destination.slice(1))-1].push(row);
  }
  return buckets.map(rows=>({players:rows.sort((a,b)=>b.total-a.total).map(r=>r.name)}));
 }
 function decision(p,rows){return {version:1,from:p.from,to:p.to,sourceVersion:p.sourceVersion,accepted:true,assignments:rows};}
 return Object.freeze({plan,assignments,nextGroups,decision});
});
